#!/usr/bin/env bash
set -Eeuo pipefail

error() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

on_error() {
  local exit_code=$?
  printf '\nAurora no pudo iniciar (línea %s, código %s).\n' "${BASH_LINENO[0]:-?}" "$exit_code" >&2
  exit "$exit_code"
}
trap on_error ERR

command -v python3 >/dev/null 2>&1 || error "No se encontró python3 en PATH."

# ── Detección de Node.js ───────────────────────────────────────────────────
# Si node/bun no está en PATH intentamos activar el version manager que tenga
# instalado el usuario (fnm, nvm, asdf, volta). No es fatal si no hay Node:
# el servidor arranca igual, pero las tools de Pi no estarán disponibles.
_activate_node() {
  command -v node >/dev/null 2>&1 && return 0
  command -v nodejs >/dev/null 2>&1 && { export PATH="$(dirname "$(command -v nodejs)"):$PATH"; return 0; }
  command -v bun >/dev/null 2>&1 && return 0

  # fnm / nvm / asdf / volta — solo si están en PATH
  if command -v fnm >/dev/null 2>&1; then
    eval "$(fnm env --shell bash 2>/dev/null)" && command -v node >/dev/null 2>&1 && return 0
  fi
  # nvm
  if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
    # shellcheck disable=SC1091
    . "$HOME/.nvm/nvm.sh" --no-use 2>/dev/null && command -v node >/dev/null 2>&1 && return 0
  fi
  # asdf
  if [[ -f "$HOME/.asdf/asdf.sh" ]]; then
    # shellcheck disable=SC1091
    . "$HOME/.asdf/asdf.sh" 2>/dev/null && command -v node >/dev/null 2>&1 && return 0
  fi
  # volta
  if [[ -d "$HOME/.volta/bin" ]]; then
    export PATH="$HOME/.volta/bin:$PATH" && command -v node >/dev/null 2>&1 && return 0
  fi
  return 1
}

if _activate_node; then
  _NODE_BIN="$(command -v bun 2>/dev/null || command -v node 2>/dev/null || command -v nodejs 2>/dev/null)"
  printf '✓ Runtime encontrado: %s\n' "$_NODE_BIN"
else
  printf '⚠  Node.js no encontrado en PATH.\n'
  printf '   Las tools de Pi no estarán disponibles.\n'
  printf '   Instalá Node.js desde https://nodejs.org y reiniciá.\n\n'
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"

# Permite guardar el script tanto en la raíz de Aurora como en aurora/scripts/.
if [[ -f "$SCRIPT_DIR/requirements.txt" && -d "$SCRIPT_DIR/src" ]]; then
  AURORA_DIR="$SCRIPT_DIR"
elif [[ -f "$SCRIPT_DIR/../requirements.txt" && -d "$SCRIPT_DIR/../src" ]]; then
  AURORA_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd -P)"
else
  error "No se encontró la raíz de Aurora. Coloca este archivo en aurora/start.sh o aurora/scripts/start.sh."
fi

REQUIREMENTS_FILE="$AURORA_DIR/requirements.txt"
MAIN_FILE="$AURORA_DIR/src/main.py"
VENV_DIR="${AURORA_VENV:-$AURORA_DIR/.venv-linux}"
VENV_PYTHON="$VENV_DIR/bin/python"
REQUIREMENTS_STAMP="$VENV_DIR/.requirements.sha256"
HOST="${AURORA_HOST:-0.0.0.0}"
PORT="${AURORA_PORT:-7779}"
RELOAD="${AURORA_RELOAD:-1}"
APP="${AURORA_APP:-main:app}"

[[ -f "$REQUIREMENTS_FILE" ]] || error "Falta $REQUIREMENTS_FILE"
[[ -f "$MAIN_FILE" ]] || error "Falta $MAIN_FILE; se esperaba que main:app estuviera dentro de src/main.py."
[[ "$PORT" =~ ^[0-9]+$ ]] && (( PORT >= 1 && PORT <= 65535 )) \
  || error "AURORA_PORT debe ser un número entre 1 y 65535."
[[ "$RELOAD" == "0" || "$RELOAD" == "1" ]] \
  || error "AURORA_RELOAD solo acepta 0 o 1."

cd -- "$AURORA_DIR"

if [[ ! -d "$VENV_DIR" ]]; then
  echo "Creando entorno virtual en: $VENV_DIR"
  python3 -m venv "$VENV_DIR"
elif [[ ! -x "$VENV_PYTHON" ]] || ! "$VENV_PYTHON" -m pip --version >/dev/null 2>&1; then
  echo "El entorno virtual está dañado. Recreando en: $VENV_DIR"
  rm -rf "$VENV_DIR"
  python3 -m venv "$VENV_DIR"
fi

hash_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    cksum "$1" | awk '{print $1 ":" $2}'
  fi
}

CURRENT_REQUIREMENTS_HASH="$(hash_file "$REQUIREMENTS_FILE")"
INSTALLED_REQUIREMENTS_HASH=""
[[ -f "$REQUIREMENTS_STAMP" ]] && INSTALLED_REQUIREMENTS_HASH="$(<"$REQUIREMENTS_STAMP")"

if [[ "$CURRENT_REQUIREMENTS_HASH" != "$INSTALLED_REQUIREMENTS_HASH" ]]; then
  echo "Instalando o actualizando dependencias..."
  "$VENV_PYTHON" -m pip install --upgrade pip
  "$VENV_PYTHON" -m pip install -r "$REQUIREMENTS_FILE"
  printf '%s\n' "$CURRENT_REQUIREMENTS_HASH" > "$REQUIREMENTS_STAMP"
else
  echo "Dependencias verificadas; requirements.txt no cambió."
fi

"$VENV_PYTHON" -c 'import uvicorn' >/dev/null 2>&1 \
  || error "Uvicorn no está instalado en el entorno virtual. Revisa requirements.txt."

export PYTHONPATH="$AURORA_DIR/src${PYTHONPATH:+:$PYTHONPATH}"

UVICORN_ARGS=(
  --host "$HOST"
  --port "$PORT"
)

if [[ "$RELOAD" == "1" ]]; then
  UVICORN_ARGS+=(--reload --reload-dir "$AURORA_DIR/src")
fi

SERVER_URL="http://$HOST:$PORT/ui"
printf '\n'
printf '╔══════════════════════════════════════════════════════╗\n'
printf '║ %-52.52s ║\n' "Aurora Server"
printf '║ %-52.52s ║\n' "URL: $SERVER_URL"
printf '║ %-52.52s ║\n' "Proyecto: $(basename "$AURORA_DIR")"
printf '╚══════════════════════════════════════════════════════╝\n'
printf 'Pulsa Ctrl+C para detenerlo.\n\n'

# exec reemplaza el shell por Uvicorn: el proceso mostrado por el sistema sí será el servidor.
exec "$VENV_PYTHON" -m uvicorn "$APP" "${UVICORN_ARGS[@]}"
