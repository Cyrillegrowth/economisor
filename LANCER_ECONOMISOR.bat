@echo off
chcp 65001 >nul
title ECONOMISOR V1 - Novaquantic SAS

echo.
echo  ==========================================
echo   ECONOMISOR V1 - Le Moteur IA Universel
echo   Par Novaquantic SAS
echo  ==========================================
echo.

set DOSSIER=%~dp0
set PYTHON=C:\Users\%USERNAME%\AppData\Local\Programs\Python\Python311\python.exe
set CLAUDE=C:\Users\%USERNAME%\.local\bin\claude.exe

cd /d "%DOSSIER%"

echo [0/4] Verification configuration...
if not exist "%DOSSIER%.env" (
    echo.
    echo   PREMIERE INSTALLATION DETECTEE
    echo   Creation du fichier de configuration...
    echo.
    (
        echo PORT=8787
        echo HOST=127.0.0.1
        echo DEFAULT_PROVIDER=ollama
        echo DEFAULT_BUDGET=balanced
        echo OLLAMA_BASE_URL=http://127.0.0.1:11434
        echo ENABLE_PROMPT_COMPRESSION=true
        echo ENABLE_PERSISTENT_CACHE=true
        echo ENABLE_METRICS_PERSIST=true
        echo REQUESTS_PER_MINUTE=120
        echo UPSTREAM_TIMEOUT_MS=120000
        echo.
        echo # Colle tes cles API ci-dessous puis relance ce fichier
        echo ANTHROPIC_API_KEY=
        echo OPENAI_API_KEY=
        echo NIM_API_KEY=
        echo NIM_BASE_URL=https://integrate.api.nvidia.com/v1
        echo DEFAULT_NIM_MODEL=glm-4.7-instruct
        echo GEMINI_API_KEY=
        echo OPENROUTER_API_KEY=
        echo DEEPSEEK_API_KEY=
    ) > "%DOSSIER%.env"
    echo   Fichier .env cree dans : %DOSSIER%
    echo.
    echo   ETAPE SUIVANTE :
    echo   1. Ouvre le fichier .env dans ce dossier
    echo   2. Colle tes cles API
    echo   3. Relance LANCER_ECONOMISOR.bat
    echo.
    start "" "%DOSSIER%.env"
    pause
    exit /b 0
)

echo [0/4] Chargement cles API...
for /f "usebackq tokens=1,* delims==" %%A in ("%DOSSIER%.env") do (
    if "%%A"=="OPENAI_API_KEY"    set OPENAI_API_KEY=%%B
    if "%%A"=="NIM_API_KEY"       set NIM_API_KEY=%%B
    if "%%A"=="NIM_BASE_URL"      set NIM_BASE_URL=%%B
    if "%%A"=="DEFAULT_NIM_MODEL" set DEFAULT_NIM_MODEL=%%B
    if "%%A"=="ANTHROPIC_API_KEY" set ANTHROPIC_API_KEY=%%B
)
echo       OK - Cles chargees

echo [1/4] Configuration Economisor MCP...
claude mcp list 2>nul | findstr "economisor" >nul 2>&1
if errorlevel 1 (
    claude mcp add economisor --scope user -- "%PYTHON%" "%DOSSIER%economisor.py" serve >nul 2>&1
    echo       OK - Configure
) else (
    echo       OK - Deja configure
)

echo [2/4] Demarrage REDUCTOR port 8787...
netstat -ano | findstr ":8787" >nul 2>&1
if errorlevel 1 (
    start "REDUCTOR" cmd /k "cd /d %DOSSIER% && node reductor.js"
    timeout /t 3 /nobreak >nul
    echo       OK - Demarre
) else (
    echo       OK - Deja actif
)

echo [3/4] Demarrage CodeBurn port 4477...
taskkill /f /im node.exe /fi "WINDOWTITLE eq CodeBurn" >nul 2>&1
start "CodeBurn" cmd /k "cd /d %DOSSIER% && node codeburn_pro.js"
timeout /t 4 /nobreak >nul
echo       OK - Demarre

echo [4/4] Ouverture CodeBurn dashboard...
start "" "http://localhost:4477"

echo.
echo  ==========================================
echo   ECONOMISOR V1 PRET
echo   REDUCTOR  : http://localhost:8787
echo   CodeBurn  : http://localhost:4477
echo   Activer   : economisor activate_licence TA-CLE
echo  ==========================================
echo.

start "Claude Code" cmd /k "cd /d %DOSSIER% && %CLAUDE%"
