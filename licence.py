"""
ECONOMISOR — Système de licences
Architecture Shopify : Core + Modules activés par clé

Niveaux :
    FREE     → 75%  → 0€
    STARTER  → 86%  → 29€/mois
    PRO      → 96%  → 39€/mois
    ULTIMATE → 99%  → 49€/mois
"""

import hashlib
import json
import os
from pathlib import Path
from datetime import datetime

# ─────────────────────────────────────────────────────────────
# CONFIGURATION
# ─────────────────────────────────────────────────────────────

LICENCE_DIR = Path.home() / ".economisor" / "licence"
LICENCE_FILE = LICENCE_DIR / "licence.json"
LICENCE_DIR.mkdir(parents=True, exist_ok=True)

# Préfixes des clés par niveau
KEY_PREFIXES = {
    "STARTER":  "ECON-STRT",
    "PRO":      "ECON-PRO",
    "ULTIMATE": "ECON-ULT",
}

# Niveaux et leurs capacités
LEVELS = {
    "FREE": {
        "name": "Free",
        "economy": 75,
        "price": 0,
        "smart_search_limit": 5,
        "mission_context_callers": False,
        "cache": False,
        "reductor": False,
        "dashboard": False,
        "memory": False,
        "ollama": False,
        "compression": False,
    },
    "STARTER": {
        "name": "Starter",
        "economy": 86,
        "price": 29,
        "smart_search_limit": 20,
        "mission_context_callers": True,
        "cache": True,
        "reductor": False,
        "dashboard": False,
        "memory": False,
        "ollama": False,
        "compression": False,
    },
    "PRO": {
        "name": "Pro",
        "economy": 96,
        "price": 39,
        "smart_search_limit": 100,
        "mission_context_callers": True,
        "cache": True,
        "reductor": True,
        "dashboard": True,
        "memory": False,
        "ollama": False,
        "compression": True,
    },
    "ULTIMATE": {
        "name": "Ultimate",
        "economy": 99,
        "price": 49,
        "smart_search_limit": 999,
        "mission_context_callers": True,
        "cache": True,
        "reductor": True,
        "dashboard": True,
        "memory": True,
        "ollama": True,
        "compression": True,
    },
}


# ─────────────────────────────────────────────────────────────
# VÉRIFICATION DE CLÉ
# ─────────────────────────────────────────────────────────────

def _detect_level_from_key(key: str) -> str | None:
    """Détecte le niveau d'une clé licence."""
    key = key.strip().upper()
    for level, prefix in KEY_PREFIXES.items():
        if key.startswith(prefix):
            return level
    return None


def _validate_key_format(key: str) -> bool:
    """Valide le format d'une clé : ECON-XXX-YYYY-YYYY-YYYY."""
    parts = key.strip().upper().split("-")
    return len(parts) >= 4 and parts[0] == "ECON"


def activate_licence(key: str) -> dict:
    """
    Active une licence avec la clé fournie.
    Retourne le résultat de l'activation.
    """
    key = key.strip().upper()

    if not _validate_key_format(key):
        return {
            "success": False,
            "error": "Format de clé invalide. Format attendu : ECON-XXX-YYYY-YYYY"
        }

    level = _detect_level_from_key(key)
    if not level:
        return {
            "success": False,
            "error": "Clé non reconnue. Vérifie ta clé sur gumroad.com"
        }

    # Sauvegarder la licence
    licence_data = {
        "key": key,
        "level": level,
        "activated_at": datetime.now().isoformat(),
        "email": "",
    }

    LICENCE_FILE.write_text(json.dumps(licence_data, indent=2))

    level_info = LEVELS[level]
    return {
        "success": True,
        "level": level,
        "name": level_info["name"],
        "economy": level_info["economy"],
        "price": level_info["price"],
        "message": f"Licence {level_info['name']} activée. Économies : {level_info['economy']}%"
    }


def get_current_licence() -> dict:
    """Retourne la licence active ou FREE par défaut."""
    if LICENCE_FILE.exists():
        try:
            data = json.loads(LICENCE_FILE.read_text())
            level = data.get("level", "FREE")
            if level in LEVELS:
                return {
                    "level": level,
                    "key": data.get("key", ""),
                    "activated_at": data.get("activated_at", ""),
                    **LEVELS[level]
                }
        except Exception:
            pass

    return {"level": "FREE", "key": "", **LEVELS["FREE"]}


def get_level() -> str:
    """Retourne le niveau actuel : FREE / STARTER / PRO / ULTIMATE."""
    return get_current_licence()["level"]


def can(feature: str) -> bool:
    """
    Vérifie si une feature est disponible pour la licence actuelle.

    Features : cache, reductor, dashboard, memory, ollama, compression
               mission_context_callers
    """
    licence = get_current_licence()
    return bool(licence.get(feature, False))


def get_search_limit() -> int:
    """Retourne la limite de résultats smart_search."""
    return get_current_licence().get("smart_search_limit", 5)


def deactivate_licence() -> dict:
    """Désactive la licence (retour au Free)."""
    if LICENCE_FILE.exists():
        LICENCE_FILE.unlink()
    return {"success": True, "message": "Licence désactivée. Retour au Free 75%."}


def licence_status() -> dict:
    """Retourne le statut complet de la licence."""
    licence = get_current_licence()
    level = licence["level"]
    level_info = LEVELS[level]

    upgrade_message = ""
    if level == "FREE":
        upgrade_message = "Upgrade Starter 86% → 29€/mois sur gumroad.com/economisor"
    elif level == "STARTER":
        upgrade_message = "Upgrade Pro 96% → 39€/mois sur gumroad.com/economisor"
    elif level == "PRO":
        upgrade_message = "Upgrade Ultimate 99% → 49€/mois sur gumroad.com/economisor"
    elif level == "ULTIMATE":
        upgrade_message = "Tu es au niveau maximum. Merci !"

    return {
        "level": level,
        "name": level_info["name"],
        "economy": f"{level_info['economy']}%",
        "price": f"{level_info['price']}€/mois",
        "features": {
            "smart_search": f"Limité à {level_info['smart_search_limit']} résultats",
            "callers_callees": "✓" if level_info["mission_context_callers"] else "✗ (Starter+)",
            "cache": "✓" if level_info["cache"] else "✗ (Starter+)",
            "reductor": "✓" if level_info["reductor"] else "✗ (Pro+)",
            "dashboard": "✓" if level_info["dashboard"] else "✗ (Pro+)",
            "memory": "✓" if level_info["memory"] else "✗ (Ultimate)",
            "ollama": "✓" if level_info["ollama"] else "✗ (Ultimate)",
            "compression": "✓" if level_info["compression"] else "✗ (Pro+)",
        },
        "upgrade": upgrade_message,
        "activated_at": licence.get("activated_at", ""),
    }


# ─────────────────────────────────────────────────────────────
# GÉNÉRATEUR DE CLÉS (usage interne Novaquantic)
# ─────────────────────────────────────────────────────────────

def generate_key(level: str, email: str = "") -> str:
    """
    Génère une clé de licence.
    USAGE INTERNE UNIQUEMENT — ne pas exposer publiquement.
    """
    if level not in KEY_PREFIXES:
        raise ValueError(f"Niveau invalide: {level}")

    prefix = KEY_PREFIXES[level]
    seed = f"{level}{email}{datetime.now().isoformat()}"
    hash_val = hashlib.sha256(seed.encode()).hexdigest().upper()

    part1 = hash_val[0:4]
    part2 = hash_val[4:8]
    part3 = hash_val[8:12]

    return f"{prefix}-{part1}-{part2}-{part3}"


if __name__ == "__main__":
    # Test rapide
    print("=== ECONOMISOR LICENCE SYSTEM ===")
    print(f"Niveau actuel : {get_level()}")
    print(json.dumps(licence_status(), indent=2, ensure_ascii=False))

    # Générer des clés de test
    print("\n=== CLÉS DE TEST ===")
    for level in ["STARTER", "PRO", "ULTIMATE"]:
        key = generate_key(level, "test@novaquantic.fr")
        print(f"{level}: {key}")
