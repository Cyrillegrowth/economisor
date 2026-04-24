@echo off
chcp 65001 >nul 2>&1
title ECONOMISOR V1 - Novaquantic SAS

echo.
echo  ==========================================
echo   ECONOMISOR V1 - Le Moteur IA Universel
echo   Par Novaquantic SAS
echo  ==========================================
echo.

set DOSSIER=%~dp0
set PYTHON=C:\Users\botcy\AppData\Local\Programs\Python\Python311\python.exe
set CLAUDE=C:\Users\botcy\.local\bin\claude.exe

cd /d "%DOSSIER%"

echo [0/5] Verification des dependances...

node --version >nul 2>&1
if errorlevel 1 (
    echo       Installation Node.js...
    winget install -e --id OpenJS.NodeJS --silent
    echo       OK - Node.js installe
) else (
    echo       OK - Node.js detecte
)

"%PYTHON%" --version >nul 2>&1
if errorlevel 1 (
    echo       Installation Python...
    winget install -e --id Python.Python.3.11 --silent
    echo       OK - Python installe
) else (
    echo       OK - Python detecte
)

"%CLAUDE%" --version >nul 2>&1
if errorlevel 1 (
    echo       Installation Claude Code...
    powershell -Command "irm https://claude.ai/install.ps1 | iex"
    echo       OK - Claude Code installe
) else (
    echo       OK - Claude Code detecte
)

if not exist "%DOSSIER%node_modules" (
    echo       Installation dependances npm...
    npm install >nul 2>&1
    echo       OK - npm installe
)

echo       OK - Toutes dependances presentes
echo.

echo [1/5] Configuration Economisor MCP...
"%CLAUDE%" mcp list 2>nul | findstr "economisor" >nul 2>&1
if errorlevel 1 (
    "%CLAUDE%" mcp add economisor --scope user -- "%PYTHON%" "%DOSSIER%economisor.py" serve >nul 2>&1
    echo       OK - Configure
) else (
    echo       OK - Deja configure
)

echo [2/5] Demarrage REDUCTOR port 8787...
if exist "%DOSSIER%.env" (
    for /f "usebackq tokens=1,* delims==" %%A in ("%DOSSIER%.env") do (
        if "%%A"=="OPENAI_API_KEY" set OPENAI_API_KEY=%%B
        if "%%A"=="NIM_API_KEY" set NIM_API_KEY=%%B
        if "%%A"=="NIM_BASE_URL" set NIM_BASE_URL=%%B
        if "%%A"=="DEFAULT_NIM_MODEL" set DEFAULT_NIM_MODEL=%%B
    )
    echo       OK - Cles chargees depuis .env
) else (
    echo       ATTENTION - Fichier .env introuvable
    echo       Copie reductor.env.example en .env et ajoute tes cles API
    pause
    exit /b 1
)
netstat -ano | findstr ":8787" >nul 2>&1
if errorlevel 1 (
    start "REDUCTOR" cmd /k "cd /d %DOSSIER% && node reductor.js"
    timeout /t 3 /nobreak >nul
    echo       OK - Demarre
) else (
    echo       OK - Deja actif
)

echo [3/5] Demarrage CodeBurn port 4477...
taskkill /f /im node.exe /fi "WINDOWTITLE eq CodeBurn" >nul 2>&1
start "CodeBurn" cmd /k "cd /d %DOSSIER% && node codeburn_pro.js"
timeout /t 4 /nobreak >nul
echo       OK - Demarre

echo [4/6] Ouverture CodeBurn dashboard...
start "" "http://localhost:4477"

echo [5/6] Demarrage Bot Telegram...
if exist "%DOSSIER%telegram_bot.js" (
    start "Telegram Bot" cmd /k "cd /d %DOSSIER% && node telegram_bot.js"
    timeout /t 2 /nobreak >nul
    echo       OK - Bot Telegram demarre
) else (
    echo       SKIP - telegram_bot.js non trouve
)

echo [6/6] Lancement Claude Code...
echo.
echo  ==========================================
echo   ECONOMISOR V1 PRET
echo   REDUCTOR  : http://localhost:8787
echo   CodeBurn  : http://localhost:4477
echo   Telegram  : @novaquantic_bot
echo   Activer   : Run economisor activate_licence TA-CLE
echo   CURSOR    : Base URL = http://localhost:8787/v1
echo  ==========================================
echo.

start "Claude Code" cmd /k "cd /d %DOSSIER% && "%CLAUDE%""
