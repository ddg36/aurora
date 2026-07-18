"""Nexus 2: protocolo textual alternativo para llamadas cloud.

El router se carga de forma perezosa para que el parser y el compilador puedan
probarse de manera aislada sin importar antes todo el servidor Litestar.
"""

from __future__ import annotations

from typing import Any

__all__ = ["NEXUS_V2_ROUTES"]


def __getattr__(name: str) -> Any:
    if name == "NEXUS_V2_ROUTES":
        from .router import NEXUS_V2_ROUTES

        return NEXUS_V2_ROUTES
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
