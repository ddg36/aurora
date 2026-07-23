@echo off
setlocal enabledelayedexpansion

for %%I in ("%~dp0..") do set "AURORA_DIR=%%~fI"
set "VENV=%AURORA_DIR%\.venv-windows"
set "VENV_PYTHON=%VENV%\Scripts\python.exe"

:: ── Python ───────────────────────────────────────────────────────────────────
where python >nul 2>&1 || where python3 >nul 2>&1 || (
    echo [ERROR] Python no encontrado en PATH.
    echo         Instala Python desde https://python.org
    pause & exit /b 1
)
if exist "%VENV%\Scripts\python.exe" (
    set "VENV_PYTHON=%VENV%\Scripts\python.exe"
) else (
    echo Creando entorno virtual...
    python -m venv "%VENV%" || python3 -m venv "%VENV%"
)

:: ── Dependencias ─────────────────────────────────────────────────────────────
"%VENV_PYTHON%" -m pip install -q -r "%AURORA_DIR%\requirements.txt"

:: ── Node.js (opcional — necesario para las tools de Pi) ──────────────────────
where node >nul 2>&1 || where bun >nul 2>&1
if errorlevel 1 (
    echo.
    echo [AVISO] Node.js no encontrado en PATH.
    echo         Las tools de Pi no estaran disponibles.
    echo         Instala Node.js desde https://nodejs.org y reinicia.
    echo.
) else (
    for /f "tokens=*" %%V in ('node --version 2^>nul') do echo [OK] Node.js %%V
)

:: ── Arrancar servidor ────────────────────────────────────────────────────────
set "PYTHONPATH=%AURORA_DIR%\src"
cd /d "%AURORA_DIR%"

echo.
echo ╔══════════════════════════════════════════════════════╗
echo ║  Aurora Server                                       ║
echo ║  http://localhost:7779/ui                            ║
echo ╚══════════════════════════════════════════════════════╝
echo Pulsa Ctrl+C para detenerlo.
echo.

"%VENV_PYTHON%" -m uvicorn main:app ^
    --host 127.0.0.1 ^
    --port 7779 ^
    --reload ^
    --reload-dir "%AURORA_DIR%\src"

endlocal
