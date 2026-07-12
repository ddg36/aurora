# ══════════════════════════════════════════════════════
#  BROWSER TASK — browser-use como tool del registry.
#  pi la invoca vía aurora-tools.ts → POST /tools/browser_task/run.
#  Reutiliza browser/agent.py (el mismo motor que /nav/run del
#  webnavigator); cada paso del agente sale por el bus /eventos
#  como tipo='browser' para el panel Agent Eye.
#
#  Human-in-the-loop: el handle del Agent queda en _ACTIVOS mientras
#  corre; POST /tools/browser_task/control lo pausa/reanuda/aborta.
#  Screenshots: última captura por usuario en RAM (preview efímera,
#  no DB) — el bus solo avisa {tipo:'captura', n} y el panel la
#  busca por GET /tools/browser_task/captura.
# ══════════════════════════════════════════════════════

import base64

from litestar import get, post
from litestar.connection import Request
from litestar.response import Response

from browser.router import browser_use_disponible
from eventos_ws import emitir

from .contract import ToolContract, schema
from .registry import register

# ponytail: un agente por usuario — segunda browser_task del mismo usuario
# pisa el handle de control de la primera. Dict por task_id si algún día
# hacen falta agentes paralelos.
_ACTIVOS: dict[int, object] = {}
_CAPTURAS: dict[int, str] = {}
_CONTADOR: dict[int, int] = {}


async def browser_task(args: dict, caller: dict) -> dict:
    objetivo = str(args.get("objective") or args.get("objetivo") or "").strip()
    if not objetivo:
        return {"ok": False, "error": "Falta 'objective': qué debe hacer el agente en el browser."}
    if not browser_use_disponible():
        return {"ok": False, "error": "browser-use no instalado: pip install browser-use (trae Playwright/Chromium)."}
    max_steps = min(int(args.get("max_steps") or 30), 100)
    uid = caller.get("usuario_id")

    # Import lazy: browser_use tarda segundos en importar y no debe
    # pagarse en el arranque del server ni al listar tools.
    from browser.agent import run_agent

    async def on_log(tipo: str, mensaje: str, url: str | None) -> None:
        if uid is not None:
            await emitir(uid, "browser", {"tipo": tipo, "mensaje": mensaje, "url": url})

    async def on_captura(b64: str) -> None:
        if uid is None:
            return
        _CAPTURAS[uid] = b64
        _CONTADOR[uid] = _CONTADOR.get(uid, 0) + 1
        await emitir(uid, "browser", {"tipo": "captura", "n": _CONTADOR[uid]})

    def al_crear(agent) -> None:
        if uid is not None:
            _ACTIVOS[uid] = agent

    try:
        resultado = await run_agent(
            objetivo, 0, on_log, max_steps=max_steps,
            on_captura=on_captura, al_crear=al_crear,
        )
    finally:
        if uid is not None:
            _ACTIVOS.pop(uid, None)
    ok = not resultado.startswith("error:")
    return {"ok": ok, "resultado": resultado}


def controlar(uid: int, accion: str) -> dict:
    agent = _ACTIVOS.get(uid)
    if agent is None:
        return {"ok": False, "error": "No hay agente de browser corriendo."}
    if accion == "pause":
        agent.pause()
    elif accion == "resume":
        agent.resume()
    elif accion == "abort":
        agent.stop()
    else:
        return {"ok": False, "error": f"Acción inválida: {accion} (pause|resume|abort)"}
    return {"ok": True, "accion": accion}


@post("/tools/browser_task/control")
async def browser_task_control(request: Request, data: dict) -> dict:
    uid = request.state.usuario_id
    resultado = controlar(uid, str(data.get("accion") or ""))
    if resultado["ok"]:
        await emitir(uid, "browser", {"tipo": "control", "accion": resultado["accion"]})
    return resultado


@get("/tools/browser_task/captura")
async def browser_task_captura(request: Request) -> Response:
    b64 = _CAPTURAS.get(request.state.usuario_id)
    if not b64:
        return Response(content=b"", status_code=404, media_type="image/png")
    if ";base64," in b64:
        b64 = b64.split(";base64,", 1)[1]
    return Response(
        content=base64.b64decode(b64),
        media_type="image/png",
        headers={"Cache-Control": "no-store"},
    )


BROWSER_TASK_ROUTES = [browser_task_control, browser_task_captura]


def register_browser_tools() -> None:
    register(ToolContract(
        name="browser_task",
        description=(
            "Ejecuta una tarea de navegación web autónoma: el agente abre el browser "
            "(Chrome del usuario via CDP :9222 si está, sino headless), navega, hace clic, "
            "escribe y extrae información hasta cumplir el objetivo. Usar para tareas que "
            "requieren interactuar con páginas web, no para preguntas de conocimiento."
        ),
        input_schema=schema(
            {
                "objective": {"type": "string", "description": "Objetivo en lenguaje natural, específico y verificable."},
                "max_steps": {"type": "integer", "default": 30, "description": "Tope de pasos del agente (máx 100)."},
            },
            ["objective"],
        ),
        handler=browser_task,
        risk="high",
        tags=["browser", "agent"],
        timeout=600,
    ))


register_browser_tools()
