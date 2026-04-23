"""
ECONOMISOR — Module Starter 86%
Activé avec clé ECON-STRT-XXXX-XXXX

Débloque :
→ smart_search illimité (20 résultats)
→ mission_context avec callers/callees complets
→ Cache persistant entre sessions
→ Recherche sémantique complète
"""

from licence import can, get_level

def check_starter():
    """Vérifie que le module Starter est actif."""
    level = get_level()
    if level not in ["STARTER", "PRO", "ULTIMATE"]:
        return {
            "error": "Module Starter requis",
            "message": "Upgrade Starter 86% → 29€/mois",
            "url": "https://gumroad.com/economisor"
        }
    return None

def starter_search(query: str, repo: str, limit: int = 20) -> dict:
    """Recherche complète sans limite — Starter+."""
    blocked = check_starter()
    if blocked:
        return blocked

    from symdex.mcp.tools import search_symbols_tool
    return search_symbols_tool(query=query, repo=repo, limit=limit)

def starter_mission_context(symbol_name: str, repo: str, intent: str = "modify") -> dict:
    """mission_context complet avec callers/callees — Starter+."""
    blocked = check_starter()
    if blocked:
        return blocked

    # Importer la fonction complète d'economisor
    import sys
    sys.path.insert(0, str(__file__).replace("module_starter.py", ""))
    from economisor import mission_context
    return mission_context(symbol_name, repo, intent)
