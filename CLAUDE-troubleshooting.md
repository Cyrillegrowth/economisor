# CLAUDE-troubleshooting.md
# Problèmes résolus — ATLAND
# Format: PROB-XXX | Symptôme | Cause | Solution

## PROB-001 — Ollama ne répond pas
**Symptôme**: `requests.exceptions.ConnectionError` sur port 11434
**Cause**: Ollama n'est pas lancé
**Solution**:
```bash
ollama serve
# Vérifier que le service tourne
curl http://localhost:11434/api/tags
```

## PROB-002 — JSON mal formé depuis Ollama
**Symptôme**: `json.JSONDecodeError` en parsant la réponse Ollama
**Cause**: Le modèle ajoute du texte avant/après le JSON
**Solution**: Extraction robuste par détection des accolades
```python
raw = response.get("response", "")
start = raw.find("{")
end = raw.rfind("}") + 1
if start >= 0 and end > start:
    return json.loads(raw[start:end])
```

## PROB-003 — FastAPI CORS error depuis le frontend
**Symptôme**: `CORS policy blocked` dans la console navigateur
**Cause**: Middleware CORS manquant
**Solution**:
```python
from fastapi.middleware.cors import CORSMiddleware
app.add_middleware(CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"])
```

## PROB-004 — SQLite "database is locked"
**Symptôme**: `sqlite3.OperationalError: database is locked`
**Cause**: Connexions multiples sans gestion propre
**Solution**: Utiliser `check_same_thread=False` et `with db() as conn`
```python
conn = sqlite3.connect(DB_PATH, check_same_thread=False)
```

## PROB-005 — Timeout Ollama sur longs documents
**Symptôme**: `httpx.ReadTimeout` après 30 secondes
**Cause**: Timeout trop court pour les gros prompts
**Solution**: Augmenter le timeout
```python
async with httpx.AsyncClient(timeout=120) as client:
    # ...
```

## PROB-006 — Port déjà utilisé au démarrage
**Symptôme**: `[Errno 48] Address already in use`
**Cause**: Un processus précédent occupe encore le port
**Solution**:
```bash
# Trouver et tuer le processus
lsof -ti:8000 | xargs kill -9
lsof -ti:8001 | xargs kill -9
lsof -ti:8080 | xargs kill -9
```

## PROB-007 — Pydantic ValidationError
**Symptôme**: `pydantic_core._pydantic_core.ValidationError`
**Cause**: Type de données incorrect dans le modèle Pydantic
**Solution**: Vérifier les types et ajouter des valeurs par défaut
```python
from typing import Optional
class MyModel(BaseModel):
    field: Optional[str] = None
    score: float = 0.0
```

## PROB-008 — Ollama modèle non trouvé
**Symptôme**: `model not found` dans la réponse Ollama
**Cause**: Modèle pas encore téléchargé
**Solution**:
```bash
ollama pull mistral
ollama pull llama3.1
ollama pull codellama
# Vérifier les modèles disponibles
ollama list
```

## PROB-009 — Mémoire insuffisante pour le modèle
**Symptôme**: Ollama crash ou très lente sur Legion Pro
**Cause**: Modèle trop gros pour la VRAM disponible
**Solution**: Utiliser des modèles quantifiés
```bash
ollama pull mistral:7b-instruct-q4_0  # version légère
ollama pull llama3.1:8b-instruct-q4_0
```

## PROB-010 — reportlab non installé pour PDF
**Symptôme**: `ImportError: No module named 'reportlab'`
**Cause**: reportlab est optionnel mais non installé
**Solution**:
```bash
pip install reportlab --break-system-packages
```

## PROB-011 — uvicorn ne recharge pas les changements
**Symptôme**: Les modifications de code ne sont pas prises en compte
**Cause**: `--reload` manquant ou fichier dans un sous-dossier
**Solution**:
```bash
uvicorn app:app --reload --reload-dir .
```

## PROB-012 — SQLite row_factory non configuré
**Symptôme**: `TypeError: indices must be integers or slices, not str`
**Cause**: `conn.row_factory = sqlite3.Row` manquant
**Solution**: Toujours configurer row_factory après connexion
```python
conn = sqlite3.connect(DB_PATH)
conn.row_factory = sqlite3.Row  # <- obligatoire
```
