@echo off
setlocal EnableDelayedExpansion

title GreenExtrude Launcher
color 0A

echo.
echo  ============================================
echo   GreenExtrude ^| Full Stack Launcher
echo  ============================================
echo.

:: ── Locate project root (the folder this .bat lives in) ──────────────────────
set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

:: ── Check Node.js is installed ───────────────────────────────────────────────
where node >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Node.js not found. Install from https://nodejs.org/
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node --version') do set NODE_VER=%%v
echo  Node.js detected: %NODE_VER%

:: ── Install dependencies (only if node_modules is missing) ───────────────────
echo.
echo  Checking dependencies...
echo  ─────────────────────────────────────────────

if not exist "%ROOT%\server\node_modules" (
    echo  [server]    Installing npm packages...
    pushd "%ROOT%\server"
    call npm install --silent
    popd
    echo  [server]    Done.
) else (
    echo  [server]    node_modules OK
)

if not exist "%ROOT%\simulator\node_modules" (
    echo  [simulator] Installing npm packages...
    pushd "%ROOT%\simulator"
    call npm install --silent
    popd
    echo  [simulator] Done.
) else (
    echo  [simulator] node_modules OK
)

if not exist "%ROOT%\client\node_modules" (
    echo  [client]    Installing npm packages...
    pushd "%ROOT%\client"
    call npm install --silent
    popd
    echo  [client]    Done.
) else (
    echo  [client]    node_modules OK
)

:: ── Launch services in separate windows ──────────────────────────────────────
echo.
echo  Starting services...
echo  ─────────────────────────────────────────────

:: 1. Server  (MQTT :1883  |  WS :3002  |  HTTP :3001)
start "GreenExtrude — Server" cmd /k "title GreenExtrude — Server && color 0B && cd /d "%ROOT%\server" && echo. && echo  [SERVER] Starting... && echo. && npm run dev"

:: Give the server a few seconds to bind ports before the simulator connects
timeout /t 4 /nobreak >nul

:: 2. Simulator (MQTT client)
start "GreenExtrude — Simulator" cmd /k "title GreenExtrude — Simulator && color 0E && cd /d "%ROOT%\simulator" && echo. && echo  [SIM] Starting... && echo. && npm run dev"

:: Give the MQTT broker a moment to register the device
timeout /t 2 /nobreak >nul

:: 3. React client (opens browser automatically)
start "GreenExtrude — Client" cmd /k "title GreenExtrude — Client && color 0D && cd /d "%ROOT%\client" && echo. && echo  [CLIENT] Starting React dev server... && echo. && npm start"

:: ── Done ─────────────────────────────────────────────────────────────────────
echo.
echo  ============================================
echo   All services launched in separate windows!
echo  ============================================
echo.
echo   Server    HTTP  →  http://localhost:3001
echo   Server    WS    →  ws://localhost:3002
echo   Server    MQTT  →  mqtt://localhost:1883
echo   Client    UI    →  http://localhost:3000
echo.
echo   Close the three service windows to stop.
echo.
pause
endlocal
