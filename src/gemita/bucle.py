# ══════════════════════════════════════════════════════
#  GEMITA BUCLE — Loop agéntico contra llama.cpp server
#  Stream tokens, ejecuta tool_calls, itera hasta MAX_RONDAS.
#  session: GemitaSession (send dict, shell, inbox para hub results)
# ══════════════════════════════════════════════════════

import asyncio
import json
import logging
import re
import time

import httpx

from . import config
from . import providers
from .protocol import get_catalog
from .roles import seleccionar_rol, get_role_config, get_system_prompt
from tools.registry import get_tool, list_tools, run_tool

log = logging.getLogger("aurora.gemita.bucle")

_TOOL_FORMAT_INSTRUCTION = """\
Cuando necesites usar una herramienta, escribe EXACTAMENTE en una línea:
<tool_call>{"name": "nombre_herramienta", "arguments": {"param": "valor"}}</tool_call>
No escribas nada más después de ese bloque hasta recibir el resultado.
"""


def _project_context_intro() -> str:
    return f"""\
# CONTEXTO — Aurora / AI Hub

Eres Gemita, el agente interno de Aurora. Tienes acceso al proyecto vía tus herramientas.

**Directorio raíz del proyecto:** `{config.PROJECT_ROOT}`
Todas las rutas relativas se resuelven desde ahí.

**Regla fundamental:** SIEMPRE usa herramientas para tareas reales. Nunca finjas
resultados ni alucines rutas o código sin haberlo leído primero.

---

"""


async def manejar_chat(session, datos: dict):
    mensaje_usuario = datos.get('message', '')
    t0 = time.monotonic()
    rol = seleccionar_rol(mensaje_usuario)
    rol_config = get_role_config(rol)
    max_rondas = rol_config.get('max_rondas', config.MAX_RONDAS)

    pure = datos.get('pure_system', False)
    if pure:
        system_completo = (datos.get('system') or '').strip()
    else:
        system_completo = '\n\n'.join(filter(None, [
            _project_context_intro(),
            get_system_prompt(rol),
            (datos.get('system') or '').strip(),
        ]))

    modelo   = datos.get('model') or config.MODELO_DEFAULT
    tools_js = datos.get('tools') or []

    if tools_js:
        lines = ['Herramientas disponibles (úsalas con el formato <tool_call>):']
        for t in tools_js:
            fn = t.get('function', {})
            params = fn.get('parameters', {}).get('properties', {})
            param_str = ', '.join(f"{k}: {v.get('type', 'any')}" for k, v in params.items()) or 'sin parámetros'
            lines.append(f"- {fn.get('name', '')}({param_str}): {fn.get('description', '')}")
        system_completo += '\n\n' + '\n'.join(lines)

    mensajes = _construir_historial(datos, _TOOL_FORMAT_INSTRUCTION, system_completo)

    catalog = get_catalog()
    aurora_tools = [] if pure else _aurora_tools_openai()
    todas_las_tools = [] if pure else list(tools_js) + catalog.to_openai_format() + aurora_tools

    allow_tools = rol_config.get('allow_tools')
    if allow_tools != 'all' and isinstance(allow_tools, list):
        todas_las_tools = [t for t in todas_las_tools if t['function']['name'] in allow_tools]

    hub_tool_names = {t.get('function', {}).get('name') for t in tools_js}

    tokens = content_raw = ''
    for ronda in range(max_rondas):
        tokens, tool_calls, content_raw = await _llamar_llama(session, modelo, mensajes, todas_las_tools)

        if not tool_calls:
            tool_calls = _extraer_tool_calls_del_texto(content_raw)
        if not tool_calls:
            break

        mensajes.append({
            'role': 'assistant',
            'content': content_raw or tokens,
            'tool_calls': tool_calls,
        })

        for tc in tool_calls:
            nombre = tc['function']['name']
            args = tc['function']['arguments']
            if isinstance(args, str):
                try:
                    args = json.loads(args)
                except json.JSONDecodeError:
                    args = {}

            tool = catalog.get(nombre)
            aurora_tool = get_tool(nombre) if not tool else None
            schema = tool.get_schema() if tool else None
            await session.send({
                'type': 'tool_call',
                'name': nombre,
                'args': args,
                'risk': schema.risk.value if schema else (aurora_tool.risk.upper() if aurora_tool else 'LOW'),
            })

            try:
                if tool:
                    output = await tool.execute(args, {'shell': session.shell, 'config': config})
                elif aurora_tool:
                    result = await run_tool(nombre, args, {'kind': 'internal', 'source': 'gemita'})
                    output = result.get('text') or result.get('data') or result.get('error') or result
                elif nombre in hub_tool_names:
                    output = await delegar_hub_tool(session, nombre, args)
                else:
                    output = f'Error: herramienta "{nombre}" no encontrada'
            except Exception as e:
                log.exception("tool %s falló", nombre)
                output = f"Error: {e}"

            await session.send({'type': 'tool_result', 'name': nombre, 'output': str(output)})
            mensajes.append({'role': 'tool', 'content': str(output), 'name': nombre})

    ms = round((time.monotonic() - t0) * 1000)
    log.info("chat done rol=%s pure=%s ms=%d", rol, pure, ms)
    await session.send({'type': 'done'})


# ── Delegación de tools del browser al cliente ────────

async def delegar_hub_tool(session, nombre: str, args: dict, timeout: int = 30) -> str:
    if nombre == 'ask_other_ai':
        timeout = 100
    await session.send({'type': 'hub_action_request', 'name': nombre, 'args': args})
    try:
        msg = await asyncio.wait_for(session.inbox.get(), timeout=timeout)
    except asyncio.TimeoutError:
        return f'Error: timeout esperando respuesta de hub tool "{nombre}"'
    return msg.get('output', '')


# ── Llamada a llama.cpp con streaming ─────────────────

async def _llamar_llama(session, modelo, mensajes, tools) -> tuple:
    start_time = time.time()
    token_count = 0
    payload = {
        'model': modelo,
        'messages': mensajes,
        'stream': True,
        'max_tokens': config.MAX_TOKENS,
    }
    if tools:
        payload['tools'] = tools
        payload['parse_tool_calls'] = True

    texto_acum = ''
    content_acum = ''
    tool_calls = []
    tool_calls_accum = {}
    tiene_tool_call_texto = False

    try:
        async for chunk in providers.stream_chat(modelo, payload, config.TIMEOUT_LLAMA):
            choices = chunk.get('choices', [])
            if not choices:
                continue

            delta = choices[0].get('delta', {})
            content = delta.get('content', '')
            reasoning = delta.get('reasoning_content', '')
            delta_tcs = delta.get('tool_calls', [])
            finish_reason = choices[0].get('finish_reason', '')

            if reasoning:
                token_count += len(reasoning)
                await session.send({'type': 'thinking', 'content': reasoning})

            if content:
                content_acum += content
                token_count += len(content)
                if '<tool_call>' in content_acum:
                    tiene_tool_call_texto = True
                if not tiene_tool_call_texto:
                    texto_acum += content
                    await session.send({'type': 'token', 'content': content})

            for tc in delta_tcs:
                idx = tc.get('index', 0)
                if idx not in tool_calls_accum:
                    tool_calls_accum[idx] = {
                        'id': tc.get('id'),
                        'type': tc.get('type', 'function'),
                        'function': {'name': '', 'arguments': ''},
                    }
                if tc.get('function', {}).get('name'):
                    tool_calls_accum[idx]['function']['name'] += tc['function']['name']
                if tc.get('function', {}).get('arguments'):
                    tool_calls_accum[idx]['function']['arguments'] += tc['function']['arguments']

            if finish_reason == 'tool_calls':
                for idx, tc in tool_calls_accum.items():
                    try:
                        args_json = json.loads(tc['function']['arguments'])
                        tool_calls.append({
                            'id': tc['id'], 'type': tc['type'],
                            'function': {'name': tc['function']['name'], 'arguments': args_json},
                        })
                    except json.JSONDecodeError:
                        pass

        if not tiene_tool_call_texto:
            texto_acum = content_acum

    except httpx.ConnectError:
        await session.send({
            'type': 'error',
            'message': 'No hay ningún proveedor LLM local disponible. Inicia llama.cpp, Ollama o LM Studio.',
        })
        return '', [], ''
    except Exception as exc:
        log.exception("error en _llamar_llama")
        await session.send({'type': 'error', 'message': str(exc)})
        return '', [], ''

    elapsed = time.time() - start_time
    log.info("modelo=%s chars=%d t=%.2fs", modelo, token_count, elapsed)
    return texto_acum, tool_calls, content_acum


# ── Extracción de tool_calls desde texto ──────────────

def _nombres_validos() -> set:
    return {s.name for s in get_catalog().list_all()} | {t['name'] for t in list_tools()}


def _aurora_tools_openai() -> list:
    return [
        {
            'type': 'function',
            'function': {
                'name': tool['name'],
                'description': tool['description'],
                'parameters': tool['input_schema'],
            },
        }
        for tool in list_tools()
        if not tool.get('requires_approval')
    ]


def _normalizar_nombre_tool(nombre: str) -> str:
    if not nombre:
        return nombre
    for valid in _nombres_validos():
        if nombre == valid:
            return nombre
        if nombre == valid + valid:
            return valid
        if nombre.startswith(valid) and len(nombre) > len(valid):
            resto = nombre[len(valid):]
            if resto == valid or resto in _nombres_validos():
                return valid
    return nombre


def _extraer_tool_calls_del_texto(texto: str) -> list:
    matches = re.findall(r'<tool_call>(.*?)</tool_call>', texto or '', re.DOTALL)
    tool_calls = []
    validos = _nombres_validos()
    for m in matches:
        try:
            data = json.loads(m.strip())
        except (json.JSONDecodeError, AttributeError):
            continue
        nombre = _normalizar_nombre_tool(data.get('name', ''))
        args = data.get('arguments', data.get('parameters', {}))
        if nombre and nombre in validos:
            tool_calls.append({
                'id': f'tc_{nombre}_{len(tool_calls)}',
                'type': 'function',
                'function': {'name': nombre, 'arguments': args},
            })
        elif nombre:
            log.warning("tool desconocida ignorada: %s", nombre)
    return tool_calls


# ── Construcción del historial ────────────────────────

def _construir_historial(datos: dict, tool_instruction: str, system_completo: str) -> list:
    mensajes = []
    system = (system_completo or '').strip()
    if system:
        mensajes.append({'role': 'system', 'content': system})

    for m in (datos.get('history') or []):
        rol = m.get('role', 'user')
        contenido = m.get('content', '')
        if rol in ('user', 'assistant', 'tool', 'system') and contenido:
            mensajes.append({'role': rol, 'content': contenido})

    mensaje = datos.get('message') or ''
    if isinstance(mensaje, str):
        mensaje = mensaje.strip()
    if mensaje:
        mensajes.append({'role': 'user', 'content': mensaje})
    return mensajes


# ── Condensación de memoria ───────────────────────────

CONDENSATION_SYSTEM = """Eres un sistema de condensación de memoria para un agente de IA.
Tu única tarea es crear un resumen factual y conciso del historial de conversación.
Preserva: tareas completadas, archivos creados/modificados, herramientas creadas,
decisiones técnicas, estado actual del trabajo, tareas pendientes.
Máximo 400 tokens. Sin charla. Usa listas. Mismo idioma del historial."""


async def condensar_memoria(datos: dict):
    import os
    historial = datos.get('history', [])
    if len(historial) < 4:
        return None

    modelo = datos.get('model') or config.MODELO_DEFAULT
    raw_history = '\n\n'.join(
        f"[{m['role'].upper()}]: {m['content'][:500]}..."
        for m in historial if m['role'] != 'system'
    )
    if len(raw_history) > 8000:
        raw_history = '...[mensajes anteriores omitidos]\n\n' + raw_history[-8000:]

    payload = {
        'model': modelo,
        'messages': [
            {'role': 'system', 'content': CONDENSATION_SYSTEM},
            {'role': 'user', 'content': f"Historial a condensar:\n\n{raw_history}\n\n---\nCrea el resumen ahora:"},
        ],
        'stream': False,
    }

    try:
        summary = await providers.complete_chat(modelo, payload, 45)
    except Exception:
        log.exception("error en condensación")
        return None

    os.makedirs(os.path.dirname(config.RUTA_MEMORIA), exist_ok=True)
    ts = time.strftime('%Y-%m-%dT%H-%M-%S')
    session_file = os.path.join(os.path.dirname(config.RUTA_MEMORIA), f'session_{ts}.md')
    with open(session_file, 'w', encoding='utf-8') as f:
        f.write(f"# Sesión condensada — {time.strftime('%Y-%m-%d %H:%M:%S')}\n\n{summary}")
    with open(config.RUTA_MEMORIA, 'a', encoding='utf-8') as f:
        f.write(f"\n==========\n*Condensación — {time.strftime('%Y-%m-%d %H:%M:%S')}\n{summary}\n==========\n")
    return summary
