"""
browser-use agent wrapper para Aurora.

Usa llama-server :8088/v1 como LLM.
Se conecta al Chrome del usuario via CDP (:9222) si está disponible.
Vision se activa solo si el modelo soporta imágenes.
"""

import asyncio
import json
import logging
import os
import re
from dataclasses import dataclass
from typing import Callable, Awaitable, TypeVar

import httpx

# Deshabilitar setup_logging de browser-use — Aurora ya configura el logging
os.environ.setdefault("BROWSER_USE_SETUP_LOGGING", "false")

from browser_use import Agent
from browser_use.browser import BrowserSession, BrowserProfile
from browser_use.llm.openai.chat import ChatOpenAI
from browser_use.llm.views import ChatInvokeCompletion
from pydantic import BaseModel

T = TypeVar("T", bound=BaseModel)

log = logging.getLogger("aurora.browser")

LLAMA_BASE = "http://localhost:8088/v1"
LLAMA_KEY = "no-key"
CDP_HOST = "http://localhost:9222"


async def _get_model_id() -> str:
    try:
        async with httpx.AsyncClient(timeout=3.0) as c:
            r = await c.get(f"{LLAMA_BASE}/models")
            data = r.json().get("data", [])
            if data:
                return data[0]["id"]
    except Exception:
        pass
    return "local"


async def _detect_vision(model_id: str) -> bool:
    """Envía imagen minima al modelo; si responde sin error → vision disponible."""
    TINY_PNG = (
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR"
        "42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
    )
    payload = {
        "model": model_id,
        "max_tokens": 5,
        "messages": [{"role": "user", "content": [
            {"type": "image_url", "image_url": {"url": TINY_PNG}},
            {"type": "text", "text": "ok"},
        ]}],
    }
    try:
        async with httpx.AsyncClient(timeout=8.0) as c:
            r = await c.post(f"{LLAMA_BASE}/chat/completions", json=payload)
            if r.status_code == 200:
                return True
            body = r.json()
            err = body.get("error", {}).get("message", "")
            if "mmproj" in err or "not supported" in err.lower():
                return False
            return r.status_code == 200
    except Exception:
        return False


async def _create_blank_tab() -> str | None:
    """
    Crea tab nueva en el Chrome del usuario via /json/new.
    Retorna ws URL del nuevo target para conectar browser-use a esa tab específica.
    Browser-use con cdp_url del browser completo elige el primer page target,
    así que crear la tab nueva NO garantiza que la use.
    Retorna None si falla, el caller usa cdp_url del browser completo como fallback.
    """
    try:
        async with httpx.AsyncClient(timeout=3.0) as c:
            r = await c.put(f"{CDP_HOST}/json/new?about:blank")
            if r.status_code == 200:
                data = r.json()
                ws = data.get("webSocketDebuggerUrl", "")
                return ws.replace("localhost", "127.0.0.1") if ws else None
    except Exception:
        pass
    return None


async def _get_cdp_url() -> str | None:
    """Retorna ws URL del browser del usuario si Chrome corre con --remote-debugging-port."""
    try:
        async with httpx.AsyncClient(timeout=2.0) as c:
            r = await c.get(f"{CDP_HOST}/json/version")
            if r.status_code == 200:
                url = r.json().get("webSocketDebuggerUrl")
                if url:
                    # localhost → 127.0.0.1 para cdp-use
                    return url.replace("localhost", "127.0.0.1")
    except Exception:
        pass
    return None


def _strip_markdown_json(text: str) -> str:
    """
    Extrae JSON de bloques ```json ... ``` ignorando bloques <reasoning>.
    Gemma y modelos locales suelen envolver con fence y/o tags de reasoning.
    """
    # Quitar bloques <reasoning>...</reasoning> o <think>...</think>
    text = re.sub(r"<(?:reasoning|think|thinking)>[\s\S]*?</(?:reasoning|think|thinking)>", "", text)
    # Extraer primer bloque ```json ... ``` o ``` ... ```
    m = re.search(r"```(?:json)?\s*([\s\S]+?)```", text)
    if m:
        return m.group(1).strip()
    # Si no hay fence, buscar primer { o [ y tomar desde ahí
    m2 = re.search(r"(\{[\s\S]*\}|\[[\s\S]*\])", text)
    if m2:
        return m2.group(1).strip()
    return text.strip()


@dataclass
class RobustChatOpenAI(ChatOpenAI):
    """
    ChatOpenAI que tolera respuestas JSON envueltas en markdown/reasoning tags.
    Siempre pide string al LLM, luego parsea con strip antes de validar pydantic.
    Schema se inyecta en system prompt via add_schema_to_system_prompt.
    """

    async def ainvoke(self, messages, output_format=None, **kwargs):
        from browser_use.llm.exceptions import ModelProviderError
        from browser_use.llm.openai.serializer import OpenAIMessageSerializer
        from browser_use.llm.schema import SchemaOptimizer

        if output_format is None:
            return await super().ainvoke(messages, **kwargs)

        # Serializar mensajes igual que el parent
        serializer = OpenAIMessageSerializer()
        openai_messages = serializer.serialize_messages(messages)

        # Inyectar schema en system prompt (igual que parent con add_schema_to_system_prompt)
        if openai_messages and openai_messages[0]["role"] == "system":
            schema = SchemaOptimizer.create_optimized_json_schema(
                output_format,
                remove_min_items=self.remove_min_items_from_schema,
                remove_defaults=self.remove_defaults_from_schema,
            )
            schema_text = f"\n\nRespond ONLY with valid JSON matching this schema (no markdown, no explanation):\n{json.dumps(schema)}"
            if isinstance(openai_messages[0]["content"], str):
                openai_messages[0]["content"] += schema_text
            else:
                openai_messages[0]["content"] = list(openai_messages[0]["content"]) + [
                    {"type": "text", "text": schema_text}
                ]

        # Obtener model_params igual que parent
        model_params: dict = {
            "temperature": self.temperature,
            "frequency_penalty": self.frequency_penalty,
            "seed": self.seed,
            "top_p": self.top_p,
        }
        model_params = {k: v for k, v in model_params.items() if v is not None}
        if self.max_completion_tokens:
            model_params["max_completion_tokens"] = self.max_completion_tokens

        # Request como string (sin response_format estructurado)
        response = await self.get_client().chat.completions.create(
            model=self.model,
            messages=openai_messages,
            **model_params,
        )
        choice = response.choices[0] if response.choices else None
        if not choice or not choice.message.content:
            raise ModelProviderError(
                message="Respuesta vacía del LLM",
                status_code=502,
                model=self.model,
            )

        raw = choice.message.content
        cleaned = _strip_markdown_json(raw)
        def _safe_json_loads(text: str) -> dict:
            try:
                return json.loads(text)
            except json.JSONDecodeError:
                pass
            # Gemma produce newlines y tabs literales dentro de strings JSON.
            # Reemplazarlos dentro de strings: recorrer char a char es lento pero seguro.
            sanitized = []
            in_string = False
            escape = False
            for ch in text:
                if escape:
                    sanitized.append(ch)
                    escape = False
                elif ch == "\\":
                    sanitized.append(ch)
                    escape = True
                elif ch == '"':
                    in_string = not in_string
                    sanitized.append(ch)
                elif in_string and ch == "\n":
                    sanitized.append("\\n")
                elif in_string and ch == "\r":
                    sanitized.append("\\r")
                elif in_string and ch == "\t":
                    sanitized.append("\\t")
                else:
                    sanitized.append(ch)
            return json.loads("".join(sanitized))

        try:
            data = _safe_json_loads(cleaned)
        except Exception as e:
            raise ModelProviderError(
                message=f"JSON malformado: {e} | raw={raw[:200]}",
                status_code=422,
                model=self.model,
            ) from e
        # Rellenar campos opcionales faltantes para tolerar modelos que omiten nulos
        _OPTIONAL_FIELDS = {
            "thinking": None,
            "evaluation_previous_goal": None,
            "memory": "",
            "next_goal": "",
            "current_plan_item": None,
            "plan_update": None,
        }
        for field, default in _OPTIONAL_FIELDS.items():
            data.setdefault(field, default)
        # action es requerido — si falta, done vacío
        if "action" not in data or not data["action"]:
            data["action"] = [{"done": {"text": data.get("memory", "") or data.get("next_goal", "") or "completado"}}]
        try:
            parsed = output_format.model_validate(data)
        except Exception as e:
            raise ModelProviderError(
                message=f"AgentOutput validation: {e} | data={str(data)[:200]}",
                status_code=422,
                model=self.model,
            ) from e

        usage = self._get_usage(response)
        return ChatInvokeCompletion(
            completion=parsed,
            usage=usage,
            stop_reason=choice.finish_reason,
        )


def _make_llm(model_id: str) -> RobustChatOpenAI:
    return RobustChatOpenAI(
        model=model_id,
        base_url=LLAMA_BASE,
        api_key=LLAMA_KEY,
        temperature=0.1,
        add_schema_to_system_prompt=False,  # lo inyectamos nosotros en ainvoke
        dont_force_structured_output=True,
        remove_min_items_from_schema=True,
        remove_defaults_from_schema=True,
        max_completion_tokens=2048,
    )


def _patch_session_manager_filter(session_manager) -> None:
    """
    Monkeypatcha get_all_page_targets del SessionManager para excluir tabs de extensiones.
    browser-use elige el primer page target — sin esto puede elegir sidepanels de extensiones.
    Llamar después de browser_session.start().
    """
    if not session_manager or not hasattr(session_manager, "get_all_page_targets"):
        return
    original_get = session_manager.get_all_page_targets

    def filtered_get_all_page_targets():
        targets = original_get()
        filtered = [
            t for t in targets
            if not getattr(t, "url", "").startswith("chrome-extension://")
            and not getattr(t, "url", "").startswith("chrome://")
            and getattr(t, "target_type", "") in ("page", "tab")
        ]
        return filtered if filtered else targets

    session_manager.get_all_page_targets = filtered_get_all_page_targets


async def run_agent(
    objetivo: str,
    sesion_id: int,
    on_log: Callable[[str, str, str | None], Awaitable[None]],
    max_steps: int = 30,
) -> str:
    """
    Ejecuta browser-use agent para un objetivo.

    - Conecta al Chrome del usuario via CDP si :9222 disponible, sino lanza Chrome propio headless.
    - Activa vision solo si el modelo la soporta.
    - on_log(tipo, mensaje, url) llamado en cada paso.
    """
    model_id, cdp_url = await asyncio.gather(_get_model_id(), _get_cdp_url())
    vision = await _detect_vision(model_id)

    log.info("nav sesion=%d modelo=%s vision=%s cdp=%s", sesion_id, model_id, vision, bool(cdp_url))
    await on_log("config", f"modelo={model_id} vision={vision} cdp_usuario={bool(cdp_url)}", None)

    llm = _make_llm(model_id)

    if cdp_url:
        await _create_blank_tab()  # crea tab nueva para que sea el target preferido
        browser_session = BrowserSession(cdp_url=cdp_url, keep_alive=True)
        await on_log("info", "conectado a Chrome del usuario via CDP", None)
    else:
        browser_session = BrowserSession(browser_profile=BrowserProfile(headless=True))
        await on_log("info", "Chrome propio headless (no hay CDP en :9222)", None)

    async def step_callback(browser_state, model_output, n_steps: int) -> None:
        try:
            url = browser_state.url if browser_state else None
            msg = f"paso {n_steps}"
            if model_output and model_output.action:
                names = [a.model_dump(exclude_none=True) for a in model_output.action if a]
                msg = str(names)[:200]
            await on_log("step", msg, url)
        except Exception as e:
            log.warning("step_callback error: %s", e)

    from browser_use.agent.views import MessageCompactionSettings

    agent = Agent(
        task=objetivo,
        llm=llm,
        browser_session=browser_session,
        register_new_step_callback=step_callback,
        max_failures=5,
        use_vision=vision,
        # Gemma 4B tiene 32k ctx; limitar compactación para no saturar el modelo
        message_compaction=MessageCompactionSettings(
            enabled=True,
            trigger_char_count=16000,
            compact_every_n_steps=5,
            keep_last_items=3,
        ),
    )

    await on_log("inicio", objetivo, None)

    try:
        history = await agent.run(max_steps=max_steps)
        resultado = str(history.final_result() or "completado")
        await on_log("fin", resultado, None)
        return resultado
    except Exception as e:
        msg = f"error: {e}"
        log.error("agent sesion=%d error: %s", sesion_id, e)
        await on_log("error", msg, None)
        return msg
    finally:
        if not cdp_url:
            try:
                await browser_session.stop()
            except Exception:
                pass
