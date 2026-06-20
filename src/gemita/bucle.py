import asyncio
import json
import logging
import os
import re
import time

import httpx

from . import config
from . import providers
from .roles import seleccionar_rol, AgentRole, ROLE_SYSTEM_PROMPTS
from tools.registry import get_tool, list_tools, run_tool, to_openai_format

log = logging.getLogger("aurora.gemita.bucle")

_ROLE_CONFIG = {
    AgentRole.ARCHITECT:  {"max_rondas": 5,  "allow_tools": ["list_directory", "find_files", "read_file", "search_in_files"]},
    AgentRole.CODER:      {"max_rondas": 15, "allow_tools": "all"},
    AgentRole.DEBUGGER:   {"max_rondas": 10, "allow_tools": "all"},
    AgentRole.GENERAL:    {"max_rondas": 10, "allow_tools": "all"},
}


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
    rol_config = _ROLE_CONFIG.get(rol, _ROLE_CONFIG[AgentRole.GENERAL])
    max_rondas = rol_config.get('max_rondas', config.MAX_RONDAS)

    pure = datos.get('pure_system', False)
    if pure:
        system_completo = (datos.get('system') or '').strip()
    else:
        system_completo = '\n\n'.join(filter(None, [
            _project_context_intro(),
            ROLE_SYSTEM_PROMPTS.get(rol, ROLE_SYSTEM_PROMPTS[AgentRole.GENERAL]),
            (datos.get('system') or '').strip(),
        ]))

    modelo = datos.get('model') or config.MODELO_DEFAULT
    tools_js = datos.get('tools') or []

    if tools_js:
        lines = ['Herramientas disponibles (úsalas con el formato <tool_call>):']
        for t in tools_js:
            fn = t.get('function', {})
            params = fn.get('parameters', {}).get('properties', {})
            param_str = ', '.join(f"{k}: {v.get('type', 'any')}" for k, v in params.items()) or 'sin parámetros'
            lines.append(f"- {fn.get('name', '')}({param_str}): {fn.get('description', '')}")
        system_completo += '\n\n' + '\n'.join(lines)

    mensajes = _construir_historial(datos, system_completo)

    aurora_tools = [] if pure else to_openai_format()
    todas_las_tools = [] if pure else list(tools_js) + aurora_tools

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

            tool = get_tool(nombre)
            await session.send({
                'type': 'tool_call',
                'name': nombre,
                'args': args,
                'risk': tool.risk.upper() if tool else 'LOW',
            })

            try:
                if tool:
                    caller = {'kind': 'internal', 'source': 'gemita', 'shell': session.shell, 'config': config}
                    result = await run_tool(nombre, args, caller)
                    output = result.get('text') or result.get('data') or result.get('error') or str(result)
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

_valid_tool_names: set | None = None

def _nombres_validos() -> set:
    global _valid_tool_names
    if _valid_tool_names is None:
        _valid_tool_names = {t['name'] for t in list_tools()}
    return _valid_tool_names


def _extraer_tool_calls_del_texto(texto: str) -> list:
    matches = re.findall(r'<tool_call>(.*?)</tool_call>', texto or '', re.DOTALL)
    tool_calls = []
    validos = _nombres_validos()
    for m in matches:
        try:
            data = json.loads(m.strip())
        except (json.JSONDecodeError, AttributeError):
            continue
        nombre = data.get('name', '')
        if nombre:
            for valid in validos:
                if nombre == valid:
                    break
                if nombre == valid + valid:
                    nombre = valid
                    break
                if nombre.startswith(valid) and len(nombre) > len(valid):
                    resto = nombre[len(valid):]
                    if resto == valid or resto in validos:
                        nombre = valid
                        break
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

def _construir_historial(datos: dict, system_completo: str) -> list:
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
    ts = time.strftime('%Y-%m-%dT-%H-%M-%S')
    with open(config.RUTA_MEMORIA, 'a', encoding='utf-8') as f:
        f.write(f"\n==========\n*Condensación — {time.strftime('%Y-%m-%d %H:%M:%S')}\n{summary}\n==========\n")
    return summary
