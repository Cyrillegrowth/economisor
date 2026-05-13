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
        echo # ============================================================
        echo # ECONOMISOR V1 - CONFIGURATION
        echo # ============================================================
        echo # ETAPE 1 : Choisis ton provider ci-dessous
        echo # ETAPE 2 : Colle ta cle API OU installe Ollama ^(gratuit^)
        echo # ETAPE 3 : Sauvegarde ^(Ctrl+S^) et ferme
        echo # ETAPE 4 : Relance LANCER_ECONOMISOR.bat
        echo # ============================================================
        echo.
        echo # --- OPTION A : Ollama LOCAL ^(100%% GRATUIT - recommande^) ---
        echo # Aucune cle requise. Tout tourne sur ta machine.
        echo # 1. Telecharge Ollama : https://ollama.com/download
        echo # 2. Installe-le et lance-le
        echo # 3. Ouvre un terminal et tape : ollama pull mistral
        echo # 4. C'est pret - laisse OLLAMA_BASE_URL tel quel
        echo OLLAMA_BASE_URL=http://127.0.0.1:11434
        echo DEFAULT_PROVIDER=ollama
        echo.
        echo # --- OPTION B : Anthropic Claude ---
        echo # Cle gratuite sur : https://console.anthropic.com/settings/keys
        echo ANTHROPIC_API_KEY=
        echo.
        echo # --- OPTION C : OpenAI ChatGPT ---
        echo # Cle sur : https://platform.openai.com/api-keys
        echo OPENAI_API_KEY=
        echo.
        echo # --- OPTION D : DeepSeek ^(le moins cher^) ---
        echo # Cle sur : https://platform.deepseek.com/api_keys
        echo DEEPSEEK_API_KEY=
        echo.
        echo # --- OPTION E : OpenRouter ^(acces a tous les modeles^) ---
        echo # Cle sur : https://openrouter.ai/keys
        echo OPENROUTER_API_KEY=
        echo.
        echo # ============================================================
        echo # NE PAS MODIFIER CE QUI SUIT
        echo # ============================================================
        echo PORT=8787
        echo HOST=127.0.0.1
        echo DEFAULT_BUDGET=balanced
        echo ENABLE_PROMPT_COMPRESSION=true
        echo ENABLE_PERSISTENT_CACHE=true
        echo ENABLE_METRICS_PERSIST=true
        echo REQUESTS_PER_MINUTE=120
        echo UPSTREAM_TIMEOUT_MS=120000
    ) > "%DOSSIER%.env"
    echo   Fichier .env cree dans : %DOSSIER%
    echo.
    echo   -----------------------------------------------
    echo   INSTRUCTIONS :
    echo   1. Le fichier .env vient de s'ouvrir
    echo   2. OPTION GRATUITE : installe Ollama ^(voir Option A^)
    echo   3. OU colle ta cle API sur la ligne correspondante
    echo   4. Sauvegarde ^(Ctrl+S^) et ferme
    echo   5. Relance LANCER_ECONOMISOR.bat
    echo   -----------------------------------------------
    echo.
    start "" "%DOSSIER%.env"
    pause
    exit /b 0
)

echo [0/4] Chargement cles API...
for /f "usebackq tokens=1,* delims==" %%A in ("%DOSSIER%.env") do (
    if "%%A"=="OPENAI_API_KEY"     set OPENAI_API_KEY=%%B
    if "%%A"=="NIM_API_KEY"        set NIM_API_KEY=%%B
    if "%%A"=="NIM_BASE_URL"       set NIM_BASE_URL=%%B
    if "%%A"=="DEFAULT_NIM_MODEL"  set DEFAULT_NIM_MODEL=%%B
    if "%%A"=="ANTHROPIC_API_KEY"  set ANTHROPIC_API_KEY=%%B
    if "%%A"=="DEEPSEEK_API_KEY"   set DEEPSEEK_API_KEY=%%B
    if "%%A"=="OPENROUTER_API_KEY" set OPENROUTER_API_KEY=%%B
    if "%%A"=="OLLAMA_BASE_URL"    set OLLAMA_BASE_URL=%%B
    if "%%A"=="DEFAULT_PROVIDER"   set DEFAULT_PROVIDER=%%B
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
