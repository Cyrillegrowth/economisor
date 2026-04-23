# Economisor — Guide d'installation

**Version:** 1.0.0
**Auteur:** Novaquantic
**Licence:** Propriétaire

> Optimisation tokens pour Claude Code et Cursor — compression intelligente, cache LLM, routage multi-provider via REDUCTOR.

---

## Prérequis

- Python 3.10+
- Node.js 18+
- Ollama (optionnel, recommandé pour usage local)
- Une clé de licence Economisor valide

---

## Installation rapide

### 1. Dépendances Python

```bash
pip install fastapi uvicorn requests python-dotenv
```

### 2. Dépendances Node (REDUCTOR gateway)

```bash
npm install
```

### 3. Configuration

Copier et adapter le fichier d'environnement :

```bash
cp reductor.env.example .env
```

Éditer `.env` avec vos valeurs :

```env
# Licence
ECONOMISOR_LICENSE_KEY=votre-cle-ici

# REDUCTOR gateway
REDUCTOR_PORT=3000
PREFERRED_PROVIDER=ollama

# Providers (optionnels)
OPENAI_API_KEY=sk-...
NIM_API_KEY=nvapi-...
OLLAMA_BASE_URL=http://localhost:11434
```

### 4. Activer la licence

```bash
python economisor.py activate --key VOTRE-CLE-LICENCE
```

Tiers disponibles : **Starter** | **Pro** | **Ultimate**

---

## Démarrage

### REDUCTOR gateway (requis)

```bash
node reductor.js
# → Écoute sur http://localhost:3000
```

### Economisor MCP server (pour Claude Code)

```bash
python economisor.py --mcp
```

Ou via le script BAT fourni :

```bat
LANCER_ECONOMISOR_.bat
```

---

## Intégration Claude Code

Ajouter dans `~/.claude.json` (configuration utilisateur) :

```json
{
  "mcpServers": {
    "economisor": {
      "command": "python",
      "args": ["C:/chemin/vers/ECONOMISOR_V1_FINAL/economisor.py", "--mcp"],
      "env": {
        "ECONOMISOR_LICENSE_KEY": "votre-cle"
      }
    }
  }
}
```

Ou utiliser le plugin `.claude-plugin/plugin.json` si votre version de Claude Code supporte les plugins.

---

## Intégration Cursor

1. Ouvrir Cursor → Extensions → "Install from VSIX / local plugin"
2. Pointer vers le dossier `.cursor-plugin/`
3. Configurer dans les Settings Cursor :
   - `economisor.licenseKey` : votre clé
   - `economisor.reductorUrl` : `http://localhost:3000`
   - `economisor.compressionMode` : `light` (recommandé)

---

## Commandes disponibles

| Commande | Description |
|----------|-------------|
| `python economisor.py status` | Statut licence + métriques |
| `python economisor.py compress` | Compression du contexte courant |
| `python economisor.py reset` | Réinitialisation cache + métriques |
| `python economisor.py activate --key KEY` | Activation licence |
| `node reductor.js` | Démarrage gateway multi-provider |

---

## Modes de compression

| Mode | Réduction | Usage recommandé |
|------|-----------|-----------------|
| `none` | 0% | Debug / audit |
| `light` | ~30% | Usage quotidien |
| `aggressive` | ~60% | Tokens limités / coût critique |

---

## Providers supportés (REDUCTOR)

| Provider | Modèles | Prérequis |
|----------|---------|-----------|
| Ollama | mistral, llama3.1, codellama... | Ollama local |
| NIM (NVIDIA) | meta/llama-3.1-8b-instruct... | `NIM_API_KEY` |
| OpenAI | gpt-4o, gpt-4-turbo... | `OPENAI_API_KEY` |

---

## Support

- Documentation : `README.md`
- Décisions architecture : `CLAUDE-decisions.md`
- Troubleshooting : `CLAUDE-troubleshooting.md`
- Contact : Novaquantic — [novaquantic.fr](https://novaquantic.fr)
