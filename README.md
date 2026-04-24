# ⚡ ECONOMISOR — Token Optimizer Universal

<div align="center">

**Économisez 99% de tokens. Sur chaque IA. Pour toujours.**

[![ROI](https://img.shields.io/badge/ROI-43x-gold?style=for-the-badge&logo=trending-up)](#)
[![Tokens saved](https://img.shields.io/badge/Tokens%20saved-up%20to%2099%25-brightgreen?style=for-the-badge)](#)
[![License](https://img.shields.io/badge/License-/MOIS-black?style=for-the-badge)](#tarifs)
[![By Novaquantic](https://img.shields.io/badge/By-Novaquantic-gold?style=for-the-badge)](#)

**Compatible :**
![Claude Code](https://img.shields.io/badge/Claude%20Code-✓-black?style=flat-square)
![Cursor](https://img.shields.io/badge/Cursor-✓-black?style=flat-square)
![Codex](https://img.shields.io/badge/Codex-✓-black?style=flat-square)
![Ollama](https://img.shields.io/badge/Ollama-✓-black?style=flat-square)
![NIM](https://img.shields.io/badge/NVIDIA%20NIM-✓-black?style=flat-square)
![OpenAI](https://img.shields.io/badge/OpenAI-✓-black?style=flat-square)
![Anthropic](https://img.shields.io/badge/Anthropic-✓-black?style=flat-square)

</div>

---

## Le problème

Vous dépensez des centaines d'euros par mois en tokens IA.
Chaque session Claude, chaque requête GPT, chaque appel LLM — tout se facture.
Et 80% de ce que vous envoyez, c'est du contexte répété, du bruit, du gaspillage.

**ECONOMISOR coupe ce gaspillage à la source.**

---

## Ce que ça fait

```
AVANT Economisor          APRÈS Economisor
─────────────────         ─────────────────
100 000 tokens/jour   →   1 000 tokens/jour
~50€/mois             →   ~0.50€/mois
ROI : 0x              →   ROI : 43x
```

- **Compression intelligente** — 3 niveaux selon le contexte (light / aggressive / extreme)
- **Cache sémantique** — zéro re-calcul pour les requêtes similaires
- **Routage multi-provider** — bascule automatique vers le provider le moins cher
- **Dashboard temps réel** — voit exactement où part chaque centime
- **100% local** — aucune donnée ne quitte votre machine

---

## Installation en 1 commande

```bash
# Windows
LANCER_ECONOMISOR_.bat

# ou manuellement
pip install fastapi uvicorn requests python-dotenv && node reductor.js
```

**C'est tout.** ECONOMISOR démarre, REDUCTOR gateway s'active, dashboard disponible sur `http://localhost:4477`.

---

## Quick Start

### 1. Activer votre licence

```bash
# Dans Claude Code
Run economisor activate_licence VOTRE-CLE-GUMROAD

# ou en ligne de commande
python economisor.py activate --key VOTRE-CLE
```

### 2. Configurer vos providers (optionnel)

```bash
cp reductor.env.example .env
# Éditez .env avec vos clés API
# Sans clés → utilise Ollama local (100% gratuit)
```

### 3. Vérifier que ça fonctionne

```bash
python economisor.py status
```

```
✅ Licence : ULTIMATE
✅ REDUCTOR gateway : actif (port 3000)
✅ Provider actif : ollama (mistral)
✅ Économies session : 94.3%
✅ ROI cumulé : 43x
```

### 4. Ouvrir le dashboard

```
http://localhost:4477
```

Vos économies en temps réel. Par session. Par provider. Par modèle.

---

## Tarifs

| Tier | Compression | Providers | Dashboard | Prix |
|------|-------------|-----------|-----------|------|
| **FREE** | 75% | Ollama only | Basique | **Gratuit** |
| **STARTER** | 86% | +OpenAI | Standard | **29€/mois** |
| **PRO** | 96% | +NIM +Anthropic | Avancé | **39€/mois** |
| **ULTIMATE** | **99%** | Tous | Complet + API | **49€/mois** |

> À 49€/mois, si vous dépensez plus de 2€/mois en tokens IA, ECONOMISOR est rentabilisé en 25 jours.

---

## Acheter

[STARTER 29€/mois](https://lyracyril.gumroad.com/l/lowhff)

---

## Architecture

```
VOTRE IDE (Claude Code / Cursor / Codex)
              ↓
    ECONOMISOR MCP SERVER
    • Compression contexte
    • Cache sémantique
    • Déduplication
              ↓
    REDUCTOR GATEWAY (port 3000)
    • Routage intelligent
    • Fallback automatique
    • Tracking coûts
         ↙    ↓    ↘
   Ollama  OpenAI  NIM
   (local) (cloud) (NVIDIA)
              ↓
    CODEBURN DASHBOARD (port 4477)
    • ROI temps réel
    • Coûts par provider
    • Économies cumulées
```

---

## Fichiers inclus

| Fichier | Rôle |
|---------|------|
| `economisor.py` | Moteur principal MCP |
| `reductor.js` | Gateway multi-provider |
| `codeburn_pro.js` | Dashboard coûts |
| `LANCER_ECONOMISOR_.bat` | Démarrage 1 clic (Windows) |
| `.claude-plugin/plugin.json` | Intégration Claude Code |
| `.cursor-plugin/plugin.json` | Intégration Cursor |
| `.codex/INSTALL.md` | Guide installation complet |

---

## Support

- Email : lyra.cyrillegrowth@gmail.com
- GitHub : github.com/Cyrillegrowth/economisor

---

<div align="center">

**ECONOMISOR V1 — Novaquantic SAS — Gruissan, Occitanie, France**

*""ROI 43x dès le premier mois. À 29€/mois, rentabilisé en 24h.""*

</div>
