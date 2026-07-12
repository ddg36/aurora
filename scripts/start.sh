#!/usr/bin/env bash
set -e

AURORA_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VENV="$AURORA_DIR/.venv-linux"

if [ ! -d "$VENV" ]; then
  echo "Creando venv..."
  python3 -m venv "$VENV"
  "$VENV/bin/pip" install -q -r "$AURORA_DIR/requirements.txt"
fi

export PYTHONPATH="$AURORA_DIR/src"

echo "╔══════════════════════════════════════╗"
echo "║   Aurora Server                     ║"
echo "║   http://localhost:7779/ui          ║"
echo "║   PID: $$                         ║"
echo "╚══════════════════════════════════════╝"

"$VENV/bin/uvicorn" main:app \
  --host 0.0.0.0 \
  --port 7779 \
  --reload-dir "$AURORA_DIR/src"
