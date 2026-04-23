"""
ECONOMISOR — Module Pro 96%
Activé avec clé ECON-PRO-XXXX-XXXX

Débloque :
→ REDUCTOR V6 — routing intelligent multi-providers
→ Cache SHA256 persistant
→ Mode Dense -60% output
→ Dashboard économies en €
→ Compression prompts automatique
→ Multi-providers : Claude / GPT / Groq / DeepSeek
"""

import json
import os
from pathlib import Path
from licence import can, get_level

REDUCTOR_URL = os.getenv("REDUCTOR_URL", "http://localhost:3477")

def check_pro():
    """Vérifie que le module Pro est actif."""
    level = get_level()
    if level not in ["PRO", "ULTIMATE"]:
        return {
            "error": "Module Pro requis",
            "message": "Upgrade Pro 96% → 39€/mois",
            "url": "https://gumroad.com/economisor"
        }
    return None


def pro_route(messages: list, budget: str = "balanced") -> dict:
    """
    Route intelligente via REDUCTOR V6.
    budget : quality / balanced / cheap
    
    quality  → Claude + ChatGPT (précision max)
    balanced → Groq + DeepSeek (quasi gratuit)
    cheap    → Ollama (100% gratuit)
    """
    blocked = check_pro()
    if blocked:
        return blocked

    try:
        import urllib.request
        import urllib.error

        payload = json.dumps({
            "messages": messages,
            "budget": budget
        }).encode()

        req = urllib.request.Request(
            f"{REDUCTOR_URL}/chat",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST"
        )

        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read())
            return {
                "content": result.get("content", ""),
                "provider": result.get("provider", "unknown"),
                "tokens": result.get("tokens", {}),
                "cost": result.get("cost", {}),
                "from_cache": result.get("fromCache", False),
            }
    except Exception as e:
        return {
            "error": f"REDUCTOR non disponible: {str(e)}",
            "hint": "Lance REDUCTOR avec : node reductor-v6.js --http"
        }


def pro_dashboard() -> dict:
    """Retourne les stats d'économies REDUCTOR en temps réel."""
    blocked = check_pro()
    if blocked:
        return blocked

    try:
        import urllib.request
        with urllib.request.urlopen(f"{REDUCTOR_URL}/stats", timeout=5) as resp:
            stats = json.loads(resp.read())
            saved_vs_claude = max(0, stats.get("costIfClaude", 0) - stats.get("costReal", 0))
            saved_vs_chatgpt = max(0, stats.get("costIfChatGPT", 0) - stats.get("costReal", 0))
            return {
                "total_requests": stats.get("totalRequests", 0),
                "cache_hits": stats.get("cacheHits", 0),
                "tokens_input": stats.get("tokens", {}).get("input", 0),
                "tokens_output": stats.get("tokens", {}).get("output", 0),
                "cost_real_eur": round(stats.get("costReal", 0), 4),
                "saved_vs_claude_eur": round(saved_vs_claude, 4),
                "saved_vs_chatgpt_eur": round(saved_vs_chatgpt, 4),
                "by_provider": stats.get("byProvider", {}),
                "dashboard_url": f"{REDUCTOR_URL}/dashboard",
            }
    except Exception as e:
        return {
            "error": f"Dashboard non disponible: {str(e)}",
            "hint": f"Ouvre {REDUCTOR_URL}/dashboard dans ton navigateur"
        }


def pro_compress(text: str) -> str:
    """
    Compresse un texte en mode Dense.
    Réduit l'output de ~60% sans perte de sens.
    """
    blocked = check_pro()
    if blocked:
        return text

    dense_prompt = f"""DENSE MODE: Résume ce texte de façon ultra-compacte. 
Zéro introduction. Zéro conclusion. Faits uniquement. Format bullet points.
Texte : {text}"""

    result = pro_route(
        messages=[{"role": "user", "content": dense_prompt}],
        budget="cheap"
    )

    return result.get("content", text)
