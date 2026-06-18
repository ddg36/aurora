@echo off
set AURORA_DIR=%~dp0..
set VENV=%AURORA_DIR%\.venv-windows

if not exist "%VENV%" (
    echo Creando venv...
    python -m venv "%VENV%"
    "%VENV%\Scripts\pip" install -q -r "%AURORA_DIR%\requirements.txt"
)

set PYTHONPATH=%AURORA_DIR%\src
echo Aurora Server - http://localhost:7779
"%VENV%\Scripts\uvicorn" main:app --host 0.0.0.0 --port 7779 --reload --reload-dir "%AURORA_DIR%\src"
