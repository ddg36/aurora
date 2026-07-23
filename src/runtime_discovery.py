"""Descubrimiento cross-platform de binarios de runtime.

Estrategia:
  1. PATH heredado del proceso (shutil.which) — rápido, cubre el caso normal.
  2. Shell interactivo/login en Unix — carga .bashrc/.zshrc y activa fnm/nvm/asdf.
  3. Registro de PATH en Windows — captura instalaciones post-arranque sin reiniciar.

Nunca hardcodea rutas. Nunca asume un gestor de versiones concreto.
"""
from __future__ import annotations

import os
import pathlib
import shutil
import subprocess


def find_binary(name: str, *aliases: str) -> str | None:
    """Devuelve el path absoluto del primer binario encontrado, o None."""
    names = (name, *aliases)

    # 1. PATH del proceso
    for n in names:
        found = shutil.which(n)
        if found:
            return found

    # 2. Fuera del PATH heredado
    if os.name == "nt":
        return _registry_which(*names)
    else:
        return _shell_which(*names)


def _registry_which(*names: str) -> str | None:
    """Windows: busca en PATH leído del registro (Machine + User)."""
    exts = (".exe", ".cmd", ".bat", "")
    candidates = [n + e for n in names for e in exts]
    ps_candidates = " ".join(f"'{c}'" for c in candidates)
    ps_script = (
        "$m=[Environment]::GetEnvironmentVariable('PATH','Machine');"
        "$u=[Environment]::GetEnvironmentVariable('PATH','User');"
        "$dirs=($m+';'+$u).Split(';')|Where-Object{$_};"
        f"$names=@({ps_candidates});"
        "$found=$null;"
        "foreach($d in $dirs){"
        "  foreach($n in $names){"
        "    $f=Join-Path $d $n;"
        "    if(Test-Path $f){$found=$f;break}"
        "  }"
        "  if($found){break}"
        "};"
        "if($found){$found}"
    )
    try:
        out = subprocess.check_output(
            ["powershell", "-NoProfile", "-Command", ps_script],
            timeout=10, text=True,
            stdin=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        ).strip()
        return out or None
    except Exception:
        return None


def _shell_which(*names: str) -> str | None:
    """Unix: lanza un shell que carga el perfil del usuario."""
    for shell in ("bash", "zsh", "sh"):
        sh = shutil.which(shell)
        if not sh:
            continue
        for flags in ("-ic", "-lc"):
            for name in names:
                try:
                    out = subprocess.check_output(
                        [sh, flags, f"command -v {name}"],
                        timeout=5, text=True,
                        stdin=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                    ).strip()
                    if out and pathlib.Path(out).exists():
                        return out
                except Exception:
                    continue
    return None


def find_node() -> str | None:
    return find_binary("node", "nodejs", "bun")


def find_pi() -> str | None:
    return find_binary("pi")
