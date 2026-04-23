# ATLAND — Claude Code Memory Bank
# Projet: ATLAND (Novaquantic SAS)
# Fondateur: Cyrille — Gruissan, Occitanie, France
# Motto: "Je décide. L'IA exécute."

## IDENTITÉ PROJET

ATLAND est une plateforme IA locale-first pour PME françaises.
Architecture modulaire de "Workys" (agents IA spécialisés) tournant sur Ollama.
100% souverain — données locales, RGPD by design, zéro cloud obligatoire.
Machine de développement: Legion Pro 7i Windows (Intel Core Ultra 9 185HX, 64GB RAM, RTX 5080)

## RÈGLES NON NÉGOCIABLES

1. Ollama d'abord — toujours tenter local avant cloud
2. Single-file — chaque Worky tient dans un seul fichier Python ou JS
3. Zéro dépendance lourde — stdlib + requests + fastapi maximum
4. Données locales — aucune donnée client ne quitte le serveur
5. Q-UDOS avant action critique — toute décision importante passe par validation
6. Style Sovereign UI — palette Black Smoke × Liquid Gold sur tous les dashboards
7. Configuration > code dur — minimiser la dépendance développeur

## STACK TECHNIQUE

```
Backend:     Python + FastAPI + SQLite
LLM local:   Ollama (mistral, llama3.1, codellama)
LLM cloud:   Anthropic Claude (fallback uniquement)
Mémoire:     SQLite + BM25 + hashing embeddings
Frontend:    HTML/CSS/JS single-file (style Sovereign UI)
Outil dev:   Forge GOD (Node.js) + Claude Code
RAG:         SOVEREIGN COGNITIVE CORE v2.1 + PageIndex (upgrade)
Ports:       8000 (backend), 8080 (mémoire), 8001 (Q-UDOS), 8082 (black vault)
```

## WORKYS EXISTANTS

| Worky | Fichier | Port | Statut |
|-------|---------|------|--------|
| Backend SaaS | app.py | 8000 | ✅ |
| Documents (RAG) | sovereign_core_v2_1.py | 8080 | ✅ |
| Mémoire | booster_v2.py | 8080 | ✅ |
| Décision (Q-UDOS) | qudos_v52_ollama.py | 8001 | ✅ |
| Audit Web | sovereign_audit_onefile_v2.py | CLI | ✅ |
| E-Réputation | black_vault.py | 8082 | ✅ |
| Finance | domination_agence.py | CLI | ✅ |
| Marketing | executor_omega.py | CLI | ✅ |

## COMMANDES DE DÉMARRAGE

```bash
# Ollama
ollama serve
ollama pull mistral

# Backend SaaS
uvicorn app:app --reload --port 8000

# Worky Mémoire
python booster_v2.py --api --port 8080

# Worky Décision
uvicorn qudos_v52_ollama:app --reload --port 8001

# Worky E-Réputation
python black_vault.py server  # port 8082
```

## ARCHITECTURE GLOBALE

```
CLIENT (Sovereign UI Black/Gold)
         ↓
CYRILLE MAX+++ ULTIME (Backend SaaS — port 8000)
Multi-tenant | RBAC | DAG | Billing | WebSocket | SSE
    ↓           ↓          ↓           ↓
Worky Docs  Worky Audit  Worky Déc.  Worky Mém.
RAG local   Web sécurité  Q-UDOS      Booster
    ↓           ↓          ↓           ↓
         OLLAMA LOCAL (mistral/llama3.1)
         DONNÉES 100% LOCALES — RGPD
```

## OFFRE COMMERCIALE

```
Installation ATLAND    : 2000-5000€ (one-shot)
Abonnement mensuel     : 500€/mois/client
Audit web PME          : 300-500€
Rapport e-réputation   : 300-500€
Diagnostic financier   : 97-197€ (Gumroad)
```

## CONTEXTE ACTUEL

- Client test ATLAND actif — construit en 3j avec Claude Code
- Portfolio trié — 20 assets TIER 1, 7 en bundle Gumroad
- Priorité : valider avec client test, puis 2ème client
- Next upgrade : intégrer PageIndex dans Worky Documents

## FICHIERS DE RÉFÉRENCE

- `ATLAND_IMPLEMENTATION_MASTER.md` — source de vérité complète
- `CLAUDE-patterns.md` — patterns de code découverts
- `CLAUDE-decisions.md` — décisions d'architecture (ADR)
- `CLAUDE-troubleshooting.md` — problèmes résolus
- `CLAUDE-activeContext.md` — contexte session en cours
