@echo off
setlocal

for %%I in ("%~dp0..") do set "AURORA_DIR=%%~fI"
set "VENV=%AURORA_DIR%\.venv-windows"

if not exist "%VENV%" (
    echo Creando venv...
    python -m venv "%VENV%"
    "%VENV%\Scripts\python.exe" -m pip install -q -r "%AURORA_DIR%\requirements.txt"
)

set "PYTHONPATH=%AURORA_DIR%\src"

cd /d "%AURORA_DIR%"

echo Aurora Server - http://localhost:7779
"%VENV%\Scripts\python.exe" -m uvicorn main:app ^
    --host 0.0.0.0 ^
    --port 7779 ^
    --reload ^
    --reload-dir "%AURORA_DIR%\src"

endlocal