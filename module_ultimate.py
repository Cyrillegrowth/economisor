"""
ECONOMISOR — Module Ultimate 99%
Activé avec clé ECON-ULT-XXXX-XXXX

Débloque :
→ Mémoire sessions persistante
→ Ollama local intégré (100% gratuit, zéro cloud)
→ Git recent changes
→ Décisions architecturales sauvegardées
→ Support prioritaire 24h
→ Accès bêta nouvelles features
"""

import json
import subprocess
from pathlib import Path
from datetime import datetime
from licence import get_level

MEMORY_DIR = Path.home() / ".economisor" / "memory"
MEMORY_DIR.mkdir(parents=True, exist_ok=True)

OLLAMA_URL = "http://localhost:11434"


def check_ultimate():
    """Vérifie que le module Ultimate est actif."""
    if get_level() != "ULTIMATE":
        return {
            "error": "Module Ultimate requis",
            "message": "Upgrade Ultimate 99% → 49€/mois",
            "url": "https://gumroad.com/economisor"
        }
    return None


# ─────────────────────────────────────────────────────────────
# MÉMOIRE SESSIONS PERSISTANTE
# ─────────────────────────────────────────────────────────────

def save_decision(repo: str, decision: str, context: str = "") -> dict:
    """
    Sauvegarde une décision architecturale.
    La session suivante s'en souvient automatiquement.
    """
    blocked = check_ultimate()
    if blocked:
        return blocked

    memory_file = MEMORY_DIR / f"{repo}_decisions.json"
    decisions = []

    if memory_file.exists():
        try:
            decisions = json.loads(memory_file.read_text())
        except Exception:
            decisions = []

    decisions.append({
        "decision": decision,
        "context": context,
        "saved_at": datetime.now().isoformat(),
        "repo": repo,
    })

    memory_file.write_text(json.dumps(decisions, indent=2, ensure_ascii=False))

    return {
        "success": True,
        "message": f"Décision sauvegardée. {len(decisions)} décisions mémorisées pour {repo}.",
        "total_decisions": len(decisions),
    }


def get_decisions(repo: str) -> dict:
    """Retourne toutes les décisions mémorisées pour un repo."""
    blocked = check_ultimate()
    if blocked:
        return blocked

    memory_file = MEMORY_DIR / f"{repo}_decisions.json"

    if not memory_file.exists():
        return {
            "repo": repo,
            "decisions": [],
            "message": "Aucune décision mémorisée encore."
        }

    try:
        decisions = json.loads(memory_file.read_text())
        return {
            "repo": repo,
            "count": len(decisions),
            "decisions": decisions[-10:],  # 10 dernières
        }
    except Exception as e:
        return {"error": str(e)}


def save_session_context(repo: str, context: str) -> dict:
    """Sauvegarde le contexte de session pour le reprendre plus tard."""
    blocked = check_ultimate()
    if blocked:
        return blocked

    session_file = MEMORY_DIR / f"{repo}_session.json"
    session_data = {
        "context": context,
        "saved_at": datetime.now().isoformat(),
        "repo": repo,
    }

    session_file.write_text(json.dumps(session_data, indent=2, ensure_ascii=False))
    return {"success": True, "message": "Contexte de session sauvegardé."}


def get_session_context(repo: str) -> dict:
    """Récupère le dernier contexte de session."""
    blocked = check_ultimate()
    if blocked:
        return blocked

    session_file = MEMORY_DIR / f"{repo}_session.json"

    if not session_file.exists():
        return {"repo": repo, "context": "", "message": "Aucun contexte précédent."}

    try:
        data = json.loads(session_file.read_text())
        return {
            "repo": repo,
            "context": data.get("context", ""),
            "saved_at": data.get("saved_at", ""),
        }
    except Exception as e:
        return {"error": str(e)}


# ─────────────────────────────────────────────────────────────
# OLLAMA LOCAL
# ─────────────────────────────────────────────────────────────

def ollama_query(prompt: str, model: str = "mistral") -> dict:
    """
    Interroge Ollama local — 100% gratuit, zéro cloud.
    Données restent sur ta machine.
    """
    blocked = check_ultimate()
    if blocked:
        return blocked

    try:
        import urllib.request
        import urllib.error

        payload = json.dumps({
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "stream": False,
        }).encode()

        req = urllib.request.Request(
            f"{OLLAMA_URL}/api/chat",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST"
        )

        with urllib.request.urlopen(req, timeout=60) as resp:
            result = json.loads(resp.read())
            return {
                "content": result.get("message", {}).get("content", ""),
                "model": result.get("model", model),
                "provider": "ollama_local",
                "cost": 0,
                "tokens": {
                    "input": result.get("prompt_eval_count", 0),
                    "output": result.get("eval_count", 0),
                }
            }
    except Exception as e:
        return {
            "error": f"Ollama non disponible: {str(e)}",
            "hint": "Installe Ollama sur https://ollama.ai puis lance : ollama pull mistral"
        }


def ollama_models() -> dict:
    """Liste les modèles Ollama disponibles localement."""
    blocked = check_ultimate()
    if blocked:
        return blocked

    try:
        import urllib.request
        with urllib.request.urlopen(f"{OLLAMA_URL}/api/tags", timeout=5) as resp:
            data = json.loads(resp.read())
            models = [m.get("name") for m in data.get("models", [])]
            return {
                "available": models,
                "count": len(models),
                "hint": "Utilise ollama_query(prompt, model='nom_du_modele')"
            }
    except Exception:
        return {
            "available": [],
            "error": "Ollama non démarré",
            "hint": "Lance Ollama depuis https://ollama.ai"
        }


# ─────────────────────────────────────────────────────────────
# GIT RECENT CHANGES
# ─────────────────────────────────────────────────────────────

def git_recent_changes(repo_path: str, days: int = 7) -> dict:
    """
    Retourne les fichiers modifiés récemment via Git.
    L'agent sait où regarder en priorité.
    """
    blocked = check_ultimate()
    if blocked:
        return blocked

    try:
        result = subprocess.run(
            ["git", "log", f"--since={days} days ago", "--name-only",
             "--pretty=format:", "--no-commit-id"],
            capture_output=True, text=True, cwd=repo_path, timeout=10
        )

        files = [f.strip() for f in result.stdout.split("\n") if f.strip()]
        unique_files = list(dict.fromkeys(files))

        return {
            "repo": repo_path,
            "days": days,
            "changed_files": unique_files[:20],
            "count": len(unique_files),
            "hint": "Ces fichiers ont changé récemment. Commence par les analyser.",
        }
    except Exception as e:
        return {"error": f"Git non disponible: {str(e)}"}
