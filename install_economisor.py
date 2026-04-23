#!/usr/bin/env python3
"""
ECONOMISOR — Installateur universel v1.1
Corrige automatiquement les bugs connus sur Windows.

Usage : python install_economisor.py
"""

import os
import sys
import subprocess
import platform
import shutil
import json
from pathlib import Path

IS_WIN = platform.system() == "Windows"

def c(text, color):
    if IS_WIN:
        return text
    colors = {"green":"\033[92m","red":"\033[91m","yellow":"\033[93m","blue":"\033[94m","bold":"\033[1m","end":"\033[0m"}
    return f"{colors.get(color,'')}{text}{colors['end']}"

def ok(msg):   print(f"  {c('✓','green')} {msg}")
def err(msg):  print(f"  {c('✗','red')} {msg}")
def info(msg): print(f"  {c('→','blue')} {msg}")
def warn(msg): print(f"  {c('⚠','yellow')} {msg}")
def step(n, t): print(f"\n{c(f'[{n}/5]','bold')} {c(t,'bold')}")

def run(cmd, capture=True):
    return subprocess.run(cmd, shell=True, capture_output=capture, text=True)

def main():
    print()
    print(c(" ╔═══════════════════════════════════════════╗", "bold"))
    print(c(" ║   ECONOMISOR — Installation automatique   ║", "bold"))
    print(c(" ║   IA qui parle à l'IA  v1.1               ║", "bold"))
    print(c(" ╚═══════════════════════════════════════════╝", "bold"))
    print()

    # ── ÉTAPE 1 : Python ──
    step(1, "Vérification Python...")
    v = sys.version_info
    if v.major < 3 or (v.major == 3 and v.minor < 11):
        err(f"Python {v.major}.{v.minor} — version 3.11+ requise")
        info("Télécharge Python 3.12 sur https://python.org")
        sys.exit(1)
    ok(f"Python {v.major}.{v.minor}.{v.micro}")

    # ── ÉTAPE 2 : Installer symdex + typer ensemble ──
    # CORRECTION BUG WINDOWS : installer typer AVANT symdex
    # et forcer l'installation dans le bon Python
    step(2, "Installation SymDex + dépendances...")

    pip = f'"{sys.executable}" -m pip'

    # Forcer typer d'abord (bug Windows symdex.exe frozen)
    r = run(f"{pip} install typer -q")
    if r.returncode != 0:
        run(f"{pip} install typer -q --user")

    r = run(f"{pip} install symdex -q")
    if r.returncode != 0:
        r = run(f"{pip} install symdex -q --user")
        if r.returncode != 0:
            err("Impossible d'installer symdex")
            sys.exit(1)

    # Vérifier que symdex est importable depuis CE Python
    r = run(f'"{sys.executable}" -c "import symdex; print(\'ok\')"')
    if "ok" not in r.stdout:
        err("symdex installé mais non accessible")
        info(f"Essaie : {sys.executable} -m pip install symdex --force-reinstall")
        sys.exit(1)

    ok("SymDex + typer installés et vérifiés")

    # ── ÉTAPE 3 : economisor.py ──
    step(3, "Vérification d'economisor.py...")
    econ_path = Path("economisor.py")

    if not econ_path.exists():
        try:
            import urllib.request
            url = "https://raw.githubusercontent.com/TON_COMPTE/economisor/main/economisor.py"
            urllib.request.urlretrieve(url, "economisor.py")
            if econ_path.stat().st_size > 1000:
                ok("economisor.py téléchargé")
            else:
                raise ValueError("Fichier trop petit")
        except Exception:
            err("economisor.py introuvable")
            info("Place economisor.py dans ce dossier et relance")
            sys.exit(1)
    else:
        ok(f"economisor.py trouvé ({econ_path.stat().st_size // 1024} KB)")

    # ── ÉTAPE 4 : Indexer + enregistrer dans le registre ──
    # CORRECTION BUG REGISTRY : utiliser sys.executable explicitement
    # pour éviter le symdex.exe frozen de Windows
    step(4, "Indexation du projet...")
    proj_name = Path.cwd().name.lower().replace(" ", "-")
    econ_abs = str(econ_path.absolute())

    r = run(f'"{sys.executable}" "{econ_abs}" index . --name {proj_name}')
    if r.returncode != 0:
        err("Erreur lors de l'indexation")
        print(r.stdout[-300:] if r.stdout else "")
        print(r.stderr[-300:] if r.stderr else "")
        sys.exit(1)

    ok(f"Projet '{proj_name}' indexé")

    # CORRECTION BUG REGISTRY : enregistrer manuellement dans le registre symdex
    _register_repo(proj_name)

    r = run(f'"{sys.executable}" "{econ_abs}" context {proj_name}')
    if r.returncode == 0:
        ok(f"Fichier contexte → {proj_name}_CONTEXT.md")

    # ── ÉTAPE 5 : Claude Code ──
    step(5, "Connexion à Claude Code...")
    claude_path = shutil.which("claude")

    if claude_path:
        r = run(f'claude mcp add economisor -- "{sys.executable}" "{econ_abs}" serve')
        if r.returncode == 0:
            ok("Economisor connecté à Claude Code")
        else:
            warn("Connexion auto échouée → création .mcp.json")
            _create_mcp_json(econ_abs)
    else:
        warn("Claude Code non trouvé → création .mcp.json")
        _create_mcp_json(econ_abs)
        info("Installe Claude Code : https://claude.ai/code")

    # ── TERMINÉ ──
    print()
    print(c(" ╔═══════════════════════════════════════════╗", "green"))
    print(c(" ║   ✓  INSTALLATION TERMINÉE                ║", "green"))
    print(c(" ║                                           ║", "green"))
    print(c(f" ║   Projet indexé : {proj_name:<24}║", "green"))
    print(c(" ║   Ouvre Claude Code dans ce dossier.      ║", "green"))
    print(c(" ║   Économie estimée : -97% de tokens       ║", "green"))
    print(c(" ╚═══════════════════════════════════════════╝", "green"))
    print()


def _register_repo(proj_name: str):
    """
    CORRECTION BUG REGISTRY
    Enregistre manuellement le repo dans le registre symdex.
    Contourne le bug où repos:[] après indexation via economisor.py.
    """
    try:
        from symdex.core.storage import upsert_repo, get_db_path
        db_path = get_db_path(proj_name)
        root_path = str(Path.cwd().absolute())
        upsert_repo(proj_name, root_path=root_path, db_path=db_path)
        ok(f"Repo '{proj_name}' enregistré dans le registre symdex")
    except Exception as e:
        warn(f"Enregistrement registre ignoré : {e}")


def _create_mcp_json(econ_abs: str):
    """Crée .mcp.json avec le bon chemin Python."""
    config = {
        "mcpServers": {
            "economisor": {
                "command": sys.executable,
                "args": [econ_abs, "serve"]
            }
        }
    }
    mcp_path = Path(".mcp.json")
    if mcp_path.exists():
        try:
            existing = json.loads(mcp_path.read_text())
            existing.setdefault("mcpServers", {})["economisor"] = config["mcpServers"]["economisor"]
            config = existing
        except Exception:
            pass
    mcp_path.write_text(json.dumps(config, indent=2))
    ok(".mcp.json créé")


if __name__ == "__main__":
    main()
