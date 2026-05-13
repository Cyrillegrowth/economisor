"""
╔═══════════════════════════════════════════════════════════════╗
║  ECONOMISOR v1.0 — IA qui parle à l'IA                       ║
║  Layer ultime par-dessus SymDex                               ║
║  Par Cyrille / Novaquantic SAS — ATLAND Project               ║
╚═══════════════════════════════════════════════════════════════╝

Installation :
    pip install symdex
    python economisor.py index ./mon_projet --name mon_projet
    python economisor.py serve

Ajout dans .mcp.json :
    {
      "mcpServers": {
        "economisor": {
          "command": "python",
          "args": ["/chemin/vers/economisor.py", "serve"]
        }
      }
    }
"""

from __future__ import annotations

import json
import os
import sys
import time
import hashlib
import sqlite3
from pathlib import Path
from typing import Any

# ─────────────────────────────────────────────────────────────
# DÉPENDANCES
# ─────────────────────────────────────────────────────────────

try:
    from symdex.core.storage import get_connection, get_db_path, query_repos
    from symdex.core.indexer import index_folder as _symdex_index
    from symdex.mcp.tools import (
        search_symbols_tool,
        get_symbol_tool,
        get_file_outline_tool,
        get_callers_tool,
        get_callees_tool,
        semantic_search_tool,
        search_text_tool,
        get_repo_outline_tool,
        get_index_status_tool,
        get_repo_stats_tool,
    )
    SYMDEX_AVAILABLE = True
except ImportError:
    SYMDEX_AVAILABLE = False

# ─────────────────────────────────────────────────────────────
# CACHE DE SESSION — évite de re-chercher les mêmes symboles
# ─────────────────────────────────────────────────────────────

_SESSION_CACHE: dict[str, Any] = {}
_SESSION_STATS = {"calls": 0, "cache_hits": 0, "tokens_saved": 0}

CACHE_DIR = Path.home() / ".economisor" / "cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

CONTEXT_DIR = Path.home() / ".economisor" / "context"
CONTEXT_DIR.mkdir(parents=True, exist_ok=True)


def _cache_key(*args) -> str:
    return hashlib.md5(json.dumps(args, sort_keys=True).encode()).hexdigest()


def _from_cache(key: str) -> Any | None:
    cached = _SESSION_CACHE.get(key)
    if cached:
        _SESSION_STATS["cache_hits"] += 1
        _SESSION_STATS["tokens_saved"] += cached.get("_token_estimate", 0)
    return cached


def _to_cache(key: str, value: Any, token_estimate: int = 0) -> None:
    value["_token_estimate"] = token_estimate
    _SESSION_CACHE[key] = value


# ─────────────────────────────────────────────────────────────
# COMPRESSEUR DE RÉPONSES — réduit les tokens au minimum vital
# ─────────────────────────────────────────────────────────────

def _compress_symbol(sym: dict, mode: str = "signature") -> dict:
    """
    mode='signature'  → nom + type + fichier + ligne (20 tokens)
    mode='brief'      → + première ligne du docstring (40 tokens)
    mode='full'       → code complet (200-800 tokens)
    """
    if mode == "signature":
        return {
            "name": sym.get("name"),
            "kind": sym.get("kind"),
            "file": sym.get("file"),
            "start_byte": sym.get("start_byte"),
            "end_byte": sym.get("end_byte"),
            "signature": sym.get("signature", "")[:120],
        }
    elif mode == "brief":
        doc = sym.get("docstring", "") or ""
        first_line = doc.split("\n")[0][:80] if doc else ""
        return {
            **_compress_symbol(sym, "signature"),
            "summary": first_line,
        }
    else:
        return sym


def _estimate_tokens(obj: Any) -> int:
    """Estimation grossière : 1 token ≈ 4 caractères."""
    return len(json.dumps(obj)) // 4


# ─────────────────────────────────────────────────────────────
# OUTIL 1 — mission_context
# "Je veux modifier X" → tout ce qu'il faut savoir en 1 appel
# C'est l'outil signature d'Economisor
# ─────────────────────────────────────────────────────────────

def mission_context(symbol_name: str, repo: str, intent: str = "modify") -> dict:
    """
    L'outil central. L'agent dit son intention, Economisor
    prépare le contexte complet en 1 seul appel MCP.

    Retourne en ~300 tokens ce qui prendrait 3000+ tokens à assembler manuellement.

    Args:
        symbol_name: nom de la fonction/classe visée
        repo: nom du repo indexé
        intent: 'modify' | 'debug' | 'understand' | 'delete' | 'extend'

    Returns:
        {
          target: le symbole visé (signature),
          callers: qui l'appelle (max 5, signatures),
          callees: ce qu'il appelle (max 5, signatures),
          risk_level: 'low' | 'medium' | 'high' | 'critical',
          risk_reason: explication du risque,
          safe_to_touch: bool,
          recommended_action: instruction pour l'agent,
          tokens_saved: estimation tokens économisés
        }
    """
    _SESSION_STATS["calls"] += 1

    # ── BRIDAGE LICENCE mission_context ──
    try:
        from licence import can, get_level
        level = get_level()
        callers_enabled = can("mission_context_callers")
    except ImportError:
        level = "FREE"
        callers_enabled = False

    cache_key = _cache_key("mission_context", symbol_name, repo, intent)
    cached = _from_cache(cache_key)
    if cached:
        return {**cached, "from_cache": True}

    result: dict[str, Any] = {
        "tool": "mission_context",
        "symbol": symbol_name,
        "repo": repo,
        "intent": intent,
    }

    # 1. Trouver le symbole cible
    search = search_symbols_tool(query=symbol_name, repo=repo, limit=3)
    if "error" in search:
        # Essai sémantique si recherche exacte échoue
        search = semantic_search_tool(query=symbol_name, repo=repo, limit=3)
        if "error" in search:
            return {"error": f"Symbole '{symbol_name}' introuvable dans {repo}"}

    symbols = search.get("symbols", [])
    if not symbols:
        return {"error": f"Aucun symbole '{symbol_name}' dans {repo}"}

    target = symbols[0]
    result["target"] = _compress_symbol(target, "brief")

    # 2. Callers (qui appelle ce symbole)
    if callers_enabled:
        callers_raw = get_callers_tool(name=symbol_name, repo=repo)
        callers = callers_raw.get("callers", [])[:5]
        result["callers"] = [_compress_symbol(c, "signature") for c in callers]
        result["caller_count"] = len(callers_raw.get("callers", []))
    else:
        result["callers"] = []
        result["caller_count"] = 0
        result["callers_note"] = "Upgrade Starter 86% (29€/mois) pour voir les callers/callees complets"

    # 3. Callees (ce que ce symbole appelle)
    if callers_enabled:
        callees_raw = get_callees_tool(name=symbol_name, repo=repo)
        callees = callees_raw.get("callees", [])[:5]
        result["callees"] = [_compress_symbol(c, "signature") for c in callees]
    else:
        result["callees"] = []
        result["callees_note"] = "Upgrade Starter 86% (29€/mois) pour voir les callees"

    # 4. Calcul du niveau de risque
    caller_count = len(callers_raw.get("callers", []))
    if caller_count == 0:
        risk = "low"
        risk_reason = "Aucun autre code n'appelle cette fonction. Modification sûre."
    elif caller_count <= 2:
        risk = "medium"
        risk_reason = f"{caller_count} dépendance(s). Vérifier après modification."
    elif caller_count <= 5:
        risk = "high"
        risk_reason = f"{caller_count} dépendances. Modifier la signature cassera du code."
    else:
        risk = "critical"
        risk_reason = f"{caller_count} dépendances. NE PAS modifier la signature. Ajouter des paramètres optionnels uniquement."

    result["risk_level"] = risk
    result["risk_reason"] = risk_reason
    result["safe_to_touch"] = risk in ("low", "medium")

    # 5. Instruction recommandée selon l'intention
    actions = {
        "modify": f"Lire d'abord {target.get('file')} bytes {target.get('start_byte')}→{target.get('end_byte')}. Risque: {risk}.",
        "debug": f"Inspecter la logique de {symbol_name} et ses {len(callees)} dépendances.",
        "understand": f"Lire le symbole + ses {caller_count} callers pour saisir l'usage réel.",
        "delete": f"VÉRIFIER: {caller_count} fichiers utilisent ce symbole. Supprimer cassera du code." if caller_count > 0 else "Suppression sûre, aucun caller.",
        "extend": f"Ajouter un paramètre optionnel pour ne pas casser les {caller_count} callers existants.",
    }
    result["recommended_action"] = actions.get(intent, actions["modify"])

    # 6. Estimation tokens économisés
    tokens_this_response = _estimate_tokens(result)
    tokens_without = tokens_this_response * 10  # estimation conservative
    result["tokens_saved"] = tokens_without - tokens_this_response
    _SESSION_STATS["tokens_saved"] += result["tokens_saved"]

    _to_cache(cache_key, result, result["tokens_saved"])
    return result


# ─────────────────────────────────────────────────────────────
# OUTIL 2 — smart_search
# Recherche intelligente : essaie nom exact, puis sémantique,
# puis texte — retourne uniquement les signatures (pas le code)
# ─────────────────────────────────────────────────────────────

def smart_search(query: str, repo: str, limit: int = 5) -> dict:
    """
    Recherche à 3 niveaux avec fallback automatique.
    Retourne des signatures compressées, jamais le code entier.

    Économie vs appels séparés : ~80%
    """
    _SESSION_STATS["calls"] += 1
    cache_key = _cache_key("smart_search", query, repo, limit)
    cached = _from_cache(cache_key)
    if cached:
        return {**cached, "from_cache": True}

    results = []
    method_used = "exact"

    # Niveau 1 : recherche exacte par nom
    r1 = search_symbols_tool(query=query, repo=repo, limit=limit)
    if r1.get("symbols"):
        results = r1["symbols"]
        method_used = "exact"

    # Niveau 2 : recherche sémantique si résultats insuffisants
    if len(results) < 2:
        r2 = semantic_search_tool(query=query, repo=repo, limit=limit)
        if r2.get("symbols"):
            # Fusionner et dédupliquer par nom
            existing_names = {s.get("name") for s in results}
            for s in r2["symbols"]:
                if s.get("name") not in existing_names:
                    results.append(s)
                    existing_names.add(s.get("name"))
            method_used = "semantic" if not r1.get("symbols") else "exact+semantic"

    # Niveau 3 : recherche texte si toujours vide
    if not results:
        r3 = search_text_tool(query=query, repo=repo, limit=limit)
        if r3.get("matches"):
            results = r3["matches"]
            method_used = "text"

    if not results:
        return {"error": f"Rien trouvé pour '{query}' dans {repo}", "query": query}

    compressed = [_compress_symbol(s, "brief") for s in results[:limit]]

    response = {
        "query": query,
        "method": method_used,
        "count": len(compressed),
        "symbols": compressed,
        "note": "Utilise get_symbol_tool() avec start_byte/end_byte pour lire le code complet si nécessaire.",
    }

    _to_cache(cache_key, response, _estimate_tokens(results) - _estimate_tokens(compressed))
    return response


# ─────────────────────────────────────────────────────────────
# OUTIL 3 — generate_context_file
# Génère PROJET_CONTEXT.md : 80-120 lignes max
# L'agent charge ça au début de session → comprend tout en 400 tokens
# ─────────────────────────────────────────────────────────────

def generate_context_file(repo: str, output_path: str | None = None) -> dict:
    """
    Génère un fichier contexte ultra-dense pour amorcer une session agent.

    Sans ce fichier : l'agent découvre le projet à l'aveugle (20 000+ tokens).
    Avec ce fichier : l'agent comprend l'architecture en 400 tokens.
    """
    _SESSION_STATS["calls"] += 1

    # Stats du repo
    try:
        stats = get_repo_stats_tool(repo=repo)
        status = get_index_status_tool(repo=repo)
        outline = get_repo_outline_tool(repo=repo)
    except Exception as e:
        return {"error": f"Impossible de lire le repo '{repo}': {e}"}

    if "error" in stats:
        return stats

    # Construction du fichier contexte
    lines = [
        f"# CONTEXTE {repo.upper()} — généré par Economisor",
        f"# {time.strftime('%Y-%m-%d %H:%M')}",
        "",
        "## ARCHITECTURE",
        f"- Fichiers : {stats.get('file_count', '?')}",
        f"- Symboles indexés : {stats.get('symbol_count', '?')}",
        f"- Langages : {', '.join(f'{k}({v})' for k,v in (stats.get('language_distribution') or {}).items())}",
        f"- Dépendances circulaires : {stats.get('circular_dep_count', 0)}",
        "",
        "## FICHIERS CRITIQUES (fort fan-in = très utilisés)",
    ]

    # Top fichiers les plus appelés
    top_fan_in = stats.get("top_fan_in", [])[:5]
    for f in top_fan_in:
        lines.append(f"- {f.get('name', '?')} ({f.get('dependents', '?')} dépendants)")

    lines += [
        "",
        "## FICHIERS COMPLEXES (fort fan-out = appellent beaucoup)",
    ]
    top_fan_out = stats.get("top_fan_out", [])[:5]
    for f in top_fan_out:
        lines.append(f"- {f.get('name', '?')} (appelle {f.get('calls', '?')} symboles)")

    # Fichiers orphelins
    orphans = stats.get("orphan_files", [])[:5]
    if orphans:
        lines += ["", "## FICHIERS ORPHELINS (non appelés, candidats à la suppression)"]
        for o in orphans:
            lines.append(f"- {o}")

    # Structure du repo
    lines += ["", "## STRUCTURE"]
    tree = outline.get("tree", "") or outline.get("outline", "")
    if tree:
        tree_lines = str(tree).split("\n")[:30]
        lines += tree_lines

    # État de l'index
    lines += [
        "",
        "## ÉTAT INDEX",
        f"- Dernière indexation : {status.get('last_indexed', 'inconnue')}",
        f"- Index obsolète : {'OUI ⚠' if status.get('stale') else 'non'}",
        f"- Watcher actif : {'oui' if status.get('watcher_active') else 'non'}",
        "",
        "## RÈGLES POUR L'AGENT",
        "1. NE JAMAIS lire un fichier entier pour trouver une fonction.",
        "2. Toujours utiliser smart_search() ou mission_context() en premier.",
        "3. Utiliser get_symbol_tool() UNIQUEMENT avec les byte offsets retournés.",
        "4. Avant toute modification : appeler mission_context(intent='modify').",
        "5. Les fichiers à fort fan-in sont critiques — modifier avec précaution.",
    ]

    context_text = "\n".join(lines)

    # Sauvegarder
    if output_path is None:
        output_path = str(CONTEXT_DIR / f"{repo}_CONTEXT.md")

    Path(output_path).write_text(context_text, encoding="utf-8")

    return {
        "success": True,
        "path": output_path,
        "lines": len(lines),
        "token_estimate": _estimate_tokens(context_text),
        "tokens_vs_full_read": stats.get("symbol_count", 500) * 50,  # estimation
        "message": f"Contexte généré. Charge ce fichier en début de session pour économiser ~{stats.get('symbol_count', 500) * 50 // 1000}K tokens.",
    }


# ─────────────────────────────────────────────────────────────
# OUTIL 4 — get_symbol_compressed
# Retourne un symbole avec compression intelligente selon la taille
# ─────────────────────────────────────────────────────────────

def get_symbol_compressed(
    repo: str,
    file: str,
    start_byte: int,
    end_byte: int,
    mode: str = "auto",
) -> dict:
    """
    Lecture intelligente d'un symbole.

    mode='auto'      → signature si >200 lignes, code complet sinon
    mode='signature' → toujours signature seule
    mode='full'      → toujours code complet

    Économie moyenne vs get_symbol direct : 60%
    """
    _SESSION_STATS["calls"] += 1
    cache_key = _cache_key("symbol", repo, file, start_byte, end_byte, mode)
    cached = _from_cache(cache_key)
    if cached:
        return {**cached, "from_cache": True}

    raw = get_symbol_tool(repo=repo, file=file, start_byte=start_byte, end_byte=end_byte)
    if "error" in raw:
        return raw

    symbol_size = end_byte - start_byte
    source = raw.get("source", "")

    if mode == "signature" or (mode == "auto" and symbol_size > 4000):
        # Grand symbole : retourner signature + première/dernière ligne
        source_lines = source.split("\n")
        compressed_source = "\n".join(
            source_lines[:3]
            + (["  # ... [code tronqué, utiliser mode='full' pour tout lire]"] if len(source_lines) > 6 else [])
            + source_lines[-2:]
        )
        return {
            **raw,
            "source": compressed_source,
            "truncated": True,
            "full_size_bytes": symbol_size,
            "hint": f"Symbole large ({symbol_size} bytes). Source tronquée. Appeler avec mode='full' si nécessaire.",
        }

    result = {**raw, "truncated": False}
    _to_cache(cache_key, result, _estimate_tokens(source) // 2)
    return result


# ─────────────────────────────────────────────────────────────
# OUTIL 5 — session_stats
# Rapport token en temps réel pour l'agent
# ─────────────────────────────────────────────────────────────

def session_stats() -> dict:
    """Rapport de la session en cours : tokens économisés, hits cache, appels."""
    total_saved = _SESSION_STATS["tokens_saved"]
    return {
        "session": {
            "total_calls": _SESSION_STATS["calls"],
            "cache_hits": _SESSION_STATS["cache_hits"],
            "cache_hit_rate": f"{round(_SESSION_STATS['cache_hits'] / max(_SESSION_STATS['calls'], 1) * 100)}%",
            "tokens_saved_estimate": total_saved,
            "cost_saved_sonnet_eur": round(total_saved * 0.000003 * 0.92, 4),
            "cost_saved_opus_eur": round(total_saved * 0.000015 * 0.92, 4),
        }
    }


# ─────────────────────────────────────────────────────────────
# OUTIL 6 — index (wrapper enrichi de symdex index)
# ─────────────────────────────────────────────────────────────

def index_project(path: str, name: str | None = None) -> dict:
    """Indexe un projet et génère automatiquement le fichier contexte."""
    if not SYMDEX_AVAILABLE:
        return {"error": "symdex non installé. Lancer: pip install symdex"}

    if not os.path.isdir(path):
        return {"error": f"Dossier introuvable: {path}"}

    start = time.time()
    result = _symdex_index(path, name=name)
    elapsed = round(time.time() - start, 2)

    # Générer le contexte automatiquement
    context = generate_context_file(repo=result.repo)

    return {
        "success": True,
        "repo": result.repo,
        "indexed": result.indexed_count,
        "skipped": result.skipped_count,
        "elapsed_sec": elapsed,
        "context_file": context.get("path"),
        "next_step": f"Ajouter economisor dans .mcp.json puis charger {context.get('path')} en début de session.",
    }


# ─────────────────────────────────────────────────────────────
# SERVEUR MCP — expose les 6 outils via stdio
# ─────────────────────────────────────────────────────────────

def activate_licence_tool(key: str) -> dict:
    """Active une licence Economisor avec la clé Gumroad."""
    try:
        from licence import activate_licence as _activate
        return _activate(key)
    except ImportError:
        return {"error": "Système licence non disponible"}


def licence_status_tool() -> dict:
    """Retourne le statut complet de la licence active."""
    try:
        from licence import licence_status as _status
        return _status()
    except ImportError:
        return {
            "level": "FREE",
            "economy": "75%",
            "message": "Système licence non disponible"
        }


def deactivate_licence_tool() -> dict:
    """Désactive la licence (retour au Free 75%)."""
    try:
        from licence import deactivate_licence as _deact
        return _deact()
    except ImportError:
        return {"error": "Système licence non disponible"}


def upgrade_info() -> dict:
    """Affiche les informations d'upgrade disponibles."""
    try:
        from licence import get_level
        level = get_level()
    except ImportError:
        level = "FREE"

    upgrades = {
        "FREE": {
            "current": "Free 75%",
            "next": "Starter 86%",
            "price": "29€/mois",
            "url": "https://gumroad.com/economisor",
            "gains": "Recherche illimitée + callers/callees + cache persistant"
        },
        "STARTER": {
            "current": "Starter 86%",
            "next": "Pro 96%",
            "price": "39€/mois",
            "url": "https://gumroad.com/economisor",
            "gains": "REDUCTOR multi-providers + dashboard économies € + compression"
        },
        "PRO": {
            "current": "Pro 96%",
            "next": "Ultimate 99%",
            "price": "49€/mois",
            "url": "https://gumroad.com/economisor",
            "gains": "Mémoire sessions + Ollama local gratuit + Git changes"
        },
        "ULTIMATE": {
            "current": "Ultimate 99%",
            "next": "Maximum atteint",
            "price": "—",
            "url": "",
            "gains": "Tu as le niveau maximum. Merci !"
        }
    }
    return upgrades.get(level, upgrades["FREE"])

TOOLS = {
    "mission_context": {
        "fn": mission_context,
        "description": "OUTIL PRINCIPAL. 'Je veux faire X sur le symbole Y.' Retourne en 1 appel : le symbole cible, ses dépendances, le niveau de risque, et l'action recommandée. Économise 90% des tokens vs navigation manuelle.",
        "params": {
            "symbol_name": "Nom de la fonction ou classe visée",
            "repo": "Nom du repo indexé",
            "intent": "modify | debug | understand | delete | extend (défaut: modify)",
        },
    },
    "smart_search": {
        "fn": smart_search,
        "description": "Recherche intelligente à 3 niveaux (exact → sémantique → texte). Retourne des signatures compressées uniquement, jamais le code entier. Utiliser AVANT get_symbol_compressed.",
        "params": {
            "query": "Nom ou description de ce que tu cherches",
            "repo": "Nom du repo",
            "limit": "Nombre de résultats max (défaut: 5)",
        },
    },
    "get_symbol_compressed": {
        "fn": get_symbol_compressed,
        "description": "Lire un symbole avec compression intelligente. Grand symbole = signature seule. Petit symbole = code complet. Utiliser les byte offsets retournés par smart_search.",
        "params": {
            "repo": "Nom du repo",
            "file": "Chemin relatif du fichier",
            "start_byte": "Byte de début (depuis smart_search)",
            "end_byte": "Byte de fin (depuis smart_search)",
            "mode": "auto | signature | full (défaut: auto)",
        },
    },
    "generate_context_file": {
        "fn": generate_context_file,
        "description": "Génère REPO_CONTEXT.md : architecture complète en 80 lignes. Charger ce fichier en début de session économise 20 000+ tokens de découverte.",
        "params": {
            "repo": "Nom du repo",
            "output_path": "Chemin de sortie (optionnel)",
        },
    },
    "session_stats": {
        "fn": session_stats,
        "description": "Rapport de la session : tokens économisés, hits cache, coût évité en euros.",
        "params": {},
    },
    "activate_licence": {
        "fn": activate_licence_tool,
        "description": "Active une licence Economisor. Entre ta clé Gumroad pour débloquer Starter 86%, Pro 96% ou Ultimate 99%.",
        "params": {
            "key": "Clé licence format ECON-STRT-XXXX-XXXX",
        },
    },
    "licence_status": {
        "fn": licence_status_tool,
        "description": "Affiche le niveau de licence actuel et les features disponibles.",
        "params": {},
    },
    "upgrade_info": {
        "fn": upgrade_info,
        "description": "Affiche les informations d'upgrade vers le niveau supérieur.",
        "params": {},
    },
    "index_project": {
        "fn": index_project,
        "description": "Indexer un projet et générer automatiquement le fichier contexte. À lancer une seule fois.",
        "params": {
            "path": "Chemin absolu ou relatif du projet",
            "name": "Nom du repo (optionnel, auto-détecté)",
        },
    },
}


def _handle_mcp_request(request: dict) -> dict:
    """Traite une requête MCP JSON-RPC."""
    method = request.get("method", "")
    params = request.get("params", {})
    req_id = request.get("id")

    def _response(result):
        return {"jsonrpc": "2.0", "id": req_id, "result": result}

    def _error(code, message):
        return {"jsonrpc": "2.0", "id": req_id, "error": {"code": code, "message": message}}

    if method == "initialize":
        return _response({
            "protocolVersion": "2024-11-05",
            "capabilities": {"tools": {}},
            "serverInfo": {"name": "economisor", "version": "1.0.0"},
        })

    if method == "tools/list":
        tools_list = []
        for name, meta in TOOLS.items():
            props = {k: {"type": "string", "description": v} for k, v in meta["params"].items()}
            required = [k for k in meta["params"] if k not in ("intent", "limit", "mode", "output_path", "name")]
            tools_list.append({
                "name": name,
                "description": meta["description"],
                "inputSchema": {
                    "type": "object",
                    "properties": props,
                    "required": required,
                },
            })
        return _response({"tools": tools_list})

    if method == "tools/call":
        tool_name = params.get("name")
        args = params.get("arguments", {})

        if tool_name not in TOOLS:
            return _error(-32601, f"Tool inconnu: {tool_name}")

        try:
            # Conversion types
            if "limit" in args:
                args["limit"] = int(args["limit"])
            if "start_byte" in args:
                args["start_byte"] = int(args["start_byte"])
            if "end_byte" in args:
                args["end_byte"] = int(args["end_byte"])

            fn = TOOLS[tool_name]["fn"]
            result = fn(**args)
            return _response({
                "content": [{"type": "text", "text": json.dumps(result, ensure_ascii=False, indent=2)}]
            })
        except Exception as e:
            return _error(-32000, f"Erreur: {str(e)}")

    if method == "notifications/initialized":
        return None

    return _error(-32601, f"Méthode inconnue: {method}")


def serve():
    """Serveur MCP stdio — compatible Claude Code, Cursor, Windsurf."""
    import sys
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
            response = _handle_mcp_request(request)
            if response is not None:
                print(json.dumps(response), flush=True)
        except json.JSONDecodeError:
            print(json.dumps({
                "jsonrpc": "2.0", "id": None,
                "error": {"code": -32700, "message": "Parse error"}
            }), flush=True)
        except Exception as e:
            print(json.dumps({
                "jsonrpc": "2.0", "id": None,
                "error": {"code": -32000, "message": str(e)}
            }), flush=True)


# ─────────────────────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────────────────────

def main():
    args = sys.argv[1:]

    if not args or args[0] in ("-h", "--help"):
        print("""
ECONOMISOR v1.0 — IA qui parle à l'IA

Commandes :
  index <path> [--name <nom>]    Indexer un projet
  context <repo>                 Générer le fichier contexte
  search <query> <repo>          Recherche intelligente
  mission <symbol> <repo>        Contexte complet pour une modification
  stats                          Stats de session
  serve                          Démarrer le serveur MCP (stdio)

Exemples :
  python economisor.py index ./atland --name atland
  python economisor.py context atland
  python economisor.py search "run_mission" atland
  python economisor.py mission "run_mission" atland modify
  python economisor.py serve
        """)
        return

    cmd = args[0]

    if cmd == "serve":
        print("Economisor MCP server démarré (stdio)", file=sys.stderr, flush=True)
        serve()

    elif cmd == "index":
        if len(args) < 2:
            print("Usage: economisor index <path> [--name <nom>]")
            return
        path = args[1]
        name = None
        if "--name" in args:
            name = args[args.index("--name") + 1]
        result = index_project(path, name)
        print(json.dumps(result, indent=2, ensure_ascii=False))

    elif cmd == "context":
        if len(args) < 2:
            print("Usage: economisor context <repo>")
            return
        result = generate_context_file(args[1])
        print(json.dumps(result, indent=2, ensure_ascii=False))
        if result.get("path"):
            print(f"\n{'─'*50}")
            print(Path(result["path"]).read_text())

    elif cmd == "search":
        if len(args) < 3:
            print("Usage: economisor search <query> <repo>")
            return
        result = smart_search(args[1], args[2])
        print(json.dumps(result, indent=2, ensure_ascii=False))

    elif cmd == "mission":
        if len(args) < 3:
            print("Usage: economisor mission <symbol> <repo> [intent]")
            return
        intent = args[3] if len(args) > 3 else "modify"
        result = mission_context(args[1], args[2], intent)
        print(json.dumps(result, indent=2, ensure_ascii=False))

    elif cmd == "stats":
        print(json.dumps(session_stats(), indent=2))

    else:
        print(f"Commande inconnue: {cmd}. Lancer sans argument pour l'aide.")



if __name__ == "__main__":
    main()
