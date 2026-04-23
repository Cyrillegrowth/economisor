# CLAUDE-patterns.md
# Patterns de code découverts — ATLAND
# Mise à jour automatique après chaque session Claude Code

## PATTERN 001 — Appel Ollama standard
```python
import requests

def ollama_call(prompt: str, model: str = "mistral") -> str:
    resp = requests.post(
        "http://localhost:11434/api/generate",
        json={"model": model, "prompt": prompt, "stream": False,
              "options": {"temperature": 0.2, "num_predict": 800}},
        timeout=60
    )
    resp.raise_for_status()
    return resp.json().get("response", "").strip()
```

## PATTERN 002 — Appel Ollama avec JSON structuré
```python
import json

def ollama_json(prompt: str, model: str = "mistral") -> dict:
    result = ollama_call(prompt, model)
    # Extraction JSON robuste
    start = result.find("{")
    end = result.rfind("}") + 1
    if start >= 0 and end > start:
        try:
            return json.loads(result[start:end])
        except Exception:
            pass
    return {"score": 5.0, "analyse": result[:500]}
```

## PATTERN 003 — Appel Ollama async (FastAPI)
```python
import httpx
import asyncio

async def ollama_async(prompt: str, model: str = "mistral") -> str:
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            "http://localhost:11434/api/generate",
            json={"model": model, "prompt": prompt, "stream": False}
        )
        resp.raise_for_status()
        return resp.json().get("response", "").strip()
```

## PATTERN 004 — Fallback Ollama → Claude
```python
import os

def llm_call(prompt: str) -> str:
    # Essaie Ollama d'abord
    try:
        return ollama_call(prompt)
    except Exception:
        pass
    # Fallback Claude si API key disponible
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if api_key:
        import anthropic
        client = anthropic.Anthropic(api_key=api_key)
        msg = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1000,
            messages=[{"role": "user", "content": prompt}]
        )
        return msg.content[0].text
    return "[LLM indisponible]"
```

## PATTERN 005 — SQLite single-file avec row_factory
```python
import sqlite3

def db() -> sqlite3.Connection:
    conn = sqlite3.connect("atland.db", check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def db_one(sql: str, params: tuple = ()) -> sqlite3.Row:
    with db() as conn:
        return conn.execute(sql, params).fetchone()

def db_all(sql: str, params: tuple = ()) -> list:
    with db() as conn:
        return conn.execute(sql, params).fetchall()

def db_exec(sql: str, params: tuple = ()) -> None:
    with db() as conn:
        conn.execute(sql, params)
        conn.commit()
```

## PATTERN 006 — FastAPI avec auth Bearer
```python
from fastapi import Depends, Header, HTTPException
from typing import Optional

async def get_auth(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing auth")
    token = authorization[7:].strip()
    # Valider le token...
    return {"user_id": "...", "tenant_id": "..."}
```

## PATTERN 007 — Rate limiting token bucket
```python
import time

def rate_check(key: str, capacity: int = 30, refill_per_sec: float = 0.5) -> bool:
    now = time.time()
    row = db_one("SELECT tokens, updated_at FROM rate_limit WHERE key=?", (key,))
    if not row:
        db_exec("INSERT INTO rate_limit (key, tokens, updated_at) VALUES (?,?,?)",
                (key, float(capacity), now))
        return True
    tokens = float(row["tokens"])
    elapsed = now - float(row["updated_at"])
    tokens = min(float(capacity), tokens + elapsed * refill_per_sec)
    if tokens < 1.0:
        db_exec("UPDATE rate_limit SET tokens=?, updated_at=? WHERE key=?",
                (tokens, now, key))
        return False
    db_exec("UPDATE rate_limit SET tokens=?, updated_at=? WHERE key=?",
            (tokens - 1.0, now, key))
    return True
```

## PATTERN 008 — Export PDF avec reportlab
```python
def export_pdf(text: str, path: str) -> bool:
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.pdfgen import canvas
        from reportlab.lib.units import cm
    except ImportError:
        return False

    c = canvas.Canvas(path, pagesize=A4)
    width, height = A4
    x, y = 2*cm, height - 2*cm
    c.setFont("Helvetica", 10)

    for line in text.split("\n"):
        if y < 2*cm:
            c.showPage()
            c.setFont("Helvetica", 10)
            y = height - 2*cm
        c.drawString(x, y, line[:120])
        y -= 12

    c.save()
    return True
```

## PATTERN 009 — Redaction PII automatique
```python
import re

RE_EMAIL = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
RE_PHONE = re.compile(r"\b(?:\+?\d{1,3}[\s.-]?)?\d{2,4}[\s.-]?\d{3,4}[\s.-]?\d{3,4}\b")
RE_APIKEY = re.compile(r"\b(?:sk-[A-Za-z0-9]{20,}|AIza[0-9A-Za-z\-_]{35})\b")

def redact(text: str) -> str:
    text = RE_EMAIL.sub("[EMAIL_REDACTED]", text)
    text = RE_PHONE.sub("[PHONE_REDACTED]", text)
    text = RE_APIKEY.sub("[SECRET_REDACTED]", text)
    return text
```

## PATTERN 010 — Worky skill Ollama avec prompt spécialisé
```python
AGENT_PROMPTS = {
    "analyst": """Tu es un analyste expert.
Analyse: {input}
Réponds UNIQUEMENT en JSON: {{"score": X.X, "analyse": "...", "recommandations": ["..."]}}""",

    "critic": """Tu es un critique adversarial.
Trouve les failles dans: {input}
Réponds UNIQUEMENT en JSON: {{"score": X.X, "failles": ["..."], "mitigations": ["..."]}}"""
}

async def run_agent(agent_name: str, input_text: str) -> dict:
    prompt = AGENT_PROMPTS[agent_name].format(input=input_text)
    return await ollama_json_async(prompt)
```
