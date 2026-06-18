# ══════════════════════════════════════════════════════
#  GEMITA CONFIG — Constantes. Solo datos, cero lógica.
# ══════════════════════════════════════════════════════

import os
import pathlib

VERSION = '2.0.0'

# ── llama.cpp server (OpenAI-compatible) ──────────────
LLAMACPP_URL   = 'http://127.0.0.1:8088/v1'
MODELO_DEFAULT = 'gemma-4-26B-A4B-it-MXFP4_MOE.gguf'
TIMEOUT_LLAMA  = 180

# ── Nexus ─────────────────────────────────────────────
NEXUS_URL = 'http://127.0.0.1:7779'

# ── Loop agéntico ─────────────────────────────────────
MAX_RONDAS = 8
MAX_TOKENS = 4096

# ── Shell bash ────────────────────────────────────────
TIMEOUT_SHELL = 30

# ── Memoria persistente ───────────────────────────────
RUTA_MEMORIA = os.path.expanduser('~/.aurora/gemita-memory.md')
RUTA_PERFIL  = os.path.expanduser('~/.aurora/gemita-profile.json')

# ── Proyecto ──────────────────────────────────────────
PROJECT_ROOT = str(pathlib.Path(__file__).resolve().parents[3])
