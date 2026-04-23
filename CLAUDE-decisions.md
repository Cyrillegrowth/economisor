# CLAUDE-decisions.md
# Architecture Decision Records (ADR) — ATLAND
# Format: ADR-XXX | Décision | Contexte | Conséquences

## ADR-001 — Single-file par Worky
**Décision**: Chaque Worky tient dans un seul fichier Python ou JS.
**Contexte**: Facilite le déploiement chez les clients PME, réduit la complexité.
**Conséquences**: Pas de microservices séparés au MVP. Évolution possible ensuite.

## ADR-002 — Ollama first, Claude fallback
**Décision**: Toujours essayer Ollama local avant d'appeler un LLM cloud.
**Contexte**: Doctrine souveraine ATLAND — données locales, RGPD by design.
**Conséquences**: Latence possible si modèle local lent. Acceptable pour PME.

## ADR-003 — SQLite comme base de données
**Décision**: SQLite pour tous les Workys au MVP.
**Contexte**: Zéro infrastructure, déploiement immédiat, suffisant pour PME locale.
**Conséquences**: Migrer vers PostgreSQL si > 50 clients simultanés.

## ADR-004 — FastAPI comme framework backend
**Décision**: FastAPI + uvicorn pour tous les Workys avec API.
**Contexte**: Performance, async natif, documentation Swagger automatique.
**Conséquences**: Dépendance fastapi + uvicorn + pydantic. Acceptable.

## ADR-005 — Style Sovereign UI obligatoire
**Décision**: Tous les dashboards suivent la palette Black Smoke × Liquid Gold.
**Contexte**: Cohérence visuelle ATLAND, différenciation premium.
**Conséquences**: Tous les nouveaux Workys doivent respecter ce style.

## ADR-006 — Q-UDOS avant action critique
**Décision**: Toute action critique (> 500€, suppression données, contrat) passe par Q-UDOS.
**Contexte**: Gouvernance IA — refuser les décisions fragiles.
**Conséquences**: Latence additionnelle sur actions critiques. Acceptable.

## ADR-007 — Hybrid AI Memory Booster comme couche mémoire
**Décision**: Utiliser HYBRID AI MEMORY BOOSTER v2.0 comme mémoire persistante pour tous les Workys.
**Contexte**: Contexte persistant entre sessions, apprentissage des préférences client.
**Conséquences**: Port 8080 réservé au Worky Mémoire.

## ADR-008 — Ports standardisés
**Décision**: 
- 8000 = Backend SaaS (CYRILLE MAX+++ ULTIME)
- 8080 = Worky Mémoire (HYBRID AI MEMORY BOOSTER)
- 8001 = Worky Décision (Q-UDOS)
- 8082 = Worky E-Réputation (BLACK VAULT)
**Contexte**: Éviter les conflits de ports en développement.
**Conséquences**: Documenter dans tous les README.

## ADR-009 — SOVEREIGN COGNITIVE CORE comme RAG principal
**Décision**: BM25 + hashing embeddings sans dépendances externes.
**Contexte**: Zéro vector DB, déploiement simple, souverain.
**Conséquences**: Précision moindre sur très longs documents. Upgrade PageIndex prévu.

## ADR-010 — PageIndex comme upgrade RAG pour documents longs
**Décision**: Intégrer PageIndex pour les documents > 20 pages.
**Contexte**: 98.7% précision sur FinanceBench, pas de chunking, retrieval raisonné.
**Statut**: PRÉVU — pas encore implémenté.
**Conséquences**: Nécessite clé API PageIndex ou self-hosting.

## ADR-011 — Forge GOD comme outil de développement
**Décision**: Utiliser Forge GOD (Node.js) pour construire les Workys avec Ollama.
**Contexte**: Spec-driven, context pack intelligent, CI gate, diff-aware git.
**Conséquences**: Node 18+ requis. Ollama doit tourner pendant le développement.

## ADR-012 — CLAUDE.md Memory Bank activé
**Décision**: Maintenir les fichiers CLAUDE*.md pour la continuité entre sessions Claude Code.
**Contexte**: Éviter de réexpliquer le contexte à chaque nouvelle session.
**Conséquences**: Mettre à jour après chaque session significative avec "update memory bank".

## ADR-013 — Tarification 500€/mois
**Décision**: Prix d'entrée ATLAND à 500€/mois par client PME.
**Contexte**: 1% du CA mensuel d'un commerçant à 50k€/mois. Défendable.
**Conséquences**: Installation initiale 2000-5000€ + 500€/mois récurrent.

## ADR-014 — Modèles Ollama par usage
**Décision**:
- mistral → raisonnement et gouvernance (Q-UDOS)
- llama3.1 → génération texte et mémoire
- codellama → développement avec Forge GOD
**Contexte**: Optimiser la qualité par type de tâche.
**Conséquences**: 3 modèles à pull au démarrage.
