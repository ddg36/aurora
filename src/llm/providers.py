import asyncio
import json
import logging
import time
from dataclasses import dataclass
from typing import AsyncIterator

import httpx

import pathlib as _pathlib
import tomllib as _tomllib

log = logging.getLogger("aurora.llm.providers")

_LLM_TOML = _pathlib.Path(__file__).resolve().parents[2] / "config" / "llm.toml"
try:
    MODELO_DEFAULT = _tomllib.loads(_LLM_TOML.read_text(encoding="utf-8")).get("llama", {}).get("default_model", "")
except OSError:
    MODELO_DEFAULT = ""


@dataclass(frozen=True)
class LLMProvider:
    id: str
    name: str
    kind: str
    base_url: str
    priority: int
    local: bool = True

    @property
    def models_url(self) -> str:
        if self.kind == "ollama-native":
            return f"{self.base_url}/api/tags"
        return f"{self.base_url}/models"

    @property
    def chat_url(self) -> str:
        if self.kind == "ollama-native":
            return f"{self.base_url}/api/chat"
        return f"{self.base_url}/chat/completions"


@dataclass(frozen=True)
class LLMModel:
    id: str
    name: str
    provider_id: str
    provider_name: str
    capabilities: dict


DEFAULT_PROVIDERS = [
    LLMProvider("llamacpp", "llama.cpp", "openai-compatible", "http://127.0.0.1:8088/v1", 10),
    LLMProvider("lmstudio", "LM Studio", "openai-compatible", "http://127.0.0.1:1234/v1", 20),
    LLMProvider("ollama-openai", "Ollama", "openai-compatible", "http://127.0.0.1:11434/v1", 30),
    LLMProvider("ollama", "Ollama", "ollama-native", "http://127.0.0.1:11434", 40),
]


async def discover_providers(timeout_s: float = 0.5) -> list[dict]:
    timeout = httpx.Timeout(timeout_s, connect=0.5, read=timeout_s)
    async with httpx.AsyncClient(timeout=timeout) as client:
        tasks = [_probe_provider(client, provider) for provider in DEFAULT_PROVIDERS]
        return await asyncio.gather(*tasks)


async def _probe_provider(client: httpx.AsyncClient, provider: LLMProvider) -> dict:
    start = time.monotonic()
    try:
        resp = await client.get(provider.models_url)
        resp.raise_for_status()
        models = _parse_models(provider, resp.json())
        return {
            "id": provider.id,
            "name": provider.name,
            "kind": provider.kind,
            "base_url": provider.base_url,
            "priority": provider.priority,
            "online": True,
            "latency_ms": round((time.monotonic() - start) * 1000),
            "models": [m.__dict__ for m in models],
        }
    except Exception as exc:
        log.debug("provider offline %s: %s", provider.id, exc)
        return {
            "id": provider.id,
            "name": provider.name,
            "kind": provider.kind,
            "base_url": provider.base_url,
            "priority": provider.priority,
            "online": False,
            "latency_ms": None,
            "models": [],
        }


TINY_PNG = (
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR"
    "42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
)


_vision_cache: dict[str, bool] = {}
_vision_cache_ts: float = 0
_models_cache: list[LLMModel] | None = None
_models_cache_ts: float = 0
_CACHE_TTL: float = 30.0


async def _probe_vision(chat_url: str, model_name: str) -> bool:
    """Envía un PNG mínimo; responde 200 → soporta imágenes."""
    payload = {
        "model": model_name,
        "max_tokens": 5,
        "messages": [{"role": "user", "content": [
            {"type": "image_url", "image_url": {"url": TINY_PNG}},
            {"type": "text", "text": "ok"},
        ]}],
    }
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(1.5, connect=0.5)) as c:
            r = await c.post(chat_url, json=payload)
            return r.status_code == 200
    except Exception:
        return False


_refresh_lock = asyncio.Lock()


async def _refresh_models() -> list[LLMModel]:
    global _vision_cache, _vision_cache_ts, _models_cache, _models_cache_ts

    async with _refresh_lock:
        discovered = await discover_providers()
        online = [p for p in discovered if p["online"]]
        result = []
        seen = set()
        to_probe: list[tuple[LLMProvider, str]] = []

        for provider_info in sorted(online, key=lambda p: p["priority"]):
            provider_obj = LLMProvider(
                id=provider_info["id"],
                name=provider_info["name"],
                kind=provider_info["kind"],
                base_url=provider_info["base_url"],
                priority=provider_info["priority"],
            )
            for raw in provider_info["models"]:
                model = LLMModel(**raw)
                model_id = model.name
                if model_id in seen:
                    model_id = f"{model.provider_id}/{model.name}"
                seen.add(model_id)

                caps = dict(model.capabilities)
                if not caps.get("vision") and model.name not in _vision_cache:
                    to_probe.append((provider_obj, model.name))
                elif _vision_cache.get(model.name):
                    caps["vision"] = True

                result.append(LLMModel(
                    id=model_id,
                    name=model.name,
                    provider_id=model.provider_id,
                    provider_name=model.provider_name,
                    capabilities=caps,
                ))

        if to_probe:
            async def _probe(p: LLMProvider, m: str) -> tuple[str, bool]:
                return m, await _probe_vision(p.chat_url, m)

            outcomes = await asyncio.gather(*[_probe(p, m) for p, m in to_probe])
            for m, ok in outcomes:
                _vision_cache[m] = ok
                if ok:
                    for i, r in enumerate(result):
                        if r.name == m:
                            result[i] = LLMModel(
                                id=r.id, name=r.name,
                                provider_id=r.provider_id, provider_name=r.provider_name,
                                capabilities={**r.capabilities, "vision": True},
                            )

        _vision_cache_ts = time.monotonic()
        _models_cache = result
        _models_cache_ts = time.monotonic()

        return result


async def list_models() -> list[LLMModel]:
    global _vision_cache, _vision_cache_ts, _models_cache, _models_cache_ts

    now = time.monotonic()
    if _models_cache is not None and now - _models_cache_ts < _CACHE_TTL:
        return _models_cache

    if _models_cache is not None:
        asyncio.create_task(_refresh_models())
        return _models_cache

    return await _refresh_models()


async def choose_provider(model_id: str | None = None) -> tuple[LLMProvider, str]:
    models = await list_models()
    if model_id:
        for model in models:
            if model_id in (model.id, model.name, f"{model.provider_id}/{model.name}"):
                return _get_provider(model.provider_id), model.name

    if MODELO_DEFAULT:
        for model in models:
            if MODELO_DEFAULT in (model.id, model.name):
                return _get_provider(model.provider_id), model.name

    if models:
        model = models[0]
        return _get_provider(model.provider_id), model.name

    return _get_provider("llamacpp"), model_id or MODELO_DEFAULT


async def stream_chat(model_id: str | None, payload: dict, timeout_s: int) -> AsyncIterator[dict]:
    provider, model = await choose_provider(model_id)
    payload = dict(payload)
    payload["model"] = model

    if provider.kind == "ollama-native":
        async for chunk in _stream_ollama_native(provider, payload, timeout_s):
            yield chunk
        return

    async for chunk in _stream_openai_compatible(provider, payload, timeout_s):
        yield chunk


def _ollama_messages(messages: list) -> list:
    """Convert OpenAI content arrays to Ollama-native format."""
    result = []
    for msg in messages:
        content = msg.get("content", "")
        if isinstance(content, list):
            text_parts = []
            images = []
            for part in content:
                if part.get("type") == "text":
                    text_parts.append(part.get("text", ""))
                elif part.get("type") == "image_url":
                    url = part.get("image_url", {}).get("url", "")
                    if url and "," in url:
                        images.append(url.split(",", 1)[1])
            new_msg = {**msg, "content": " ".join(text_parts) if text_parts else ""}
            if images:
                new_msg["images"] = images
            result.append(new_msg)
        else:
            result.append(msg)
    return result


async def complete_chat(model_id: str | None, payload: dict, timeout_s: int) -> str:
    provider, model = await choose_provider(model_id)
    payload = dict(payload)
    payload["model"] = model
    timeout = httpx.Timeout(timeout_s, connect=5)
    async with httpx.AsyncClient(timeout=timeout) as client:
        if provider.kind == "ollama-native":
            body = {
                "model": model,
                "messages": _ollama_messages(payload.get("messages", [])),
                "stream": False,
                "options": {"num_predict": payload.get("max_tokens")},
            }
            resp = await client.post(provider.chat_url, json=body)
            resp.raise_for_status()
            return resp.json().get("message", {}).get("content", "").strip()

        resp = await client.post(provider.chat_url, json=payload)
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"].strip()


def _get_provider(provider_id: str) -> LLMProvider:
    for provider in DEFAULT_PROVIDERS:
        if provider.id == provider_id:
            return provider
    return DEFAULT_PROVIDERS[0]


def _parse_models(provider: LLMProvider, data: dict) -> list[LLMModel]:
    if provider.kind == "ollama-native":
        names = [m.get("name") or m.get("model") for m in data.get("models", [])]
    else:
        names = [m.get("id") for m in data.get("data", [])]
    return [
        LLMModel(
            id=f"{provider.id}/{name}",
            name=name,
            provider_id=provider.id,
            provider_name=provider.name,
            capabilities=_infer_capabilities(provider, name),
        )
        for name in names
        if name
    ]


def _infer_capabilities(provider: LLMProvider, model_name: str) -> dict:
    name = model_name.lower()
    return {
        "streaming": True,
        "tool_calls": provider.kind == "openai-compatible",
        "json_mode": True,
        "reasoning": any(x in name for x in ("qwen3", "deepseek-r1", "reason")),
        "vision": any(x in name for x in ("vision", "vl", "llava", "qwen", "glm", "gemma-3", "pixtral", "gpt-4", "claude-3")),
        "embeddings": "embed" in name,
        "local": provider.local,
    }


async def _stream_openai_compatible(provider: LLMProvider, payload: dict, timeout_s: int) -> AsyncIterator[dict]:
    timeout = httpx.Timeout(timeout_s, connect=5)
    async with httpx.AsyncClient(timeout=timeout) as client:
        async with client.stream("POST", provider.chat_url, json=payload) as resp:
            resp.raise_for_status()
            async for line_str in resp.aiter_lines():
                line_str = line_str.strip()
                if not line_str or not line_str.startswith("data: "):
                    continue
                data_str = line_str[6:]
                if data_str == "[DONE]":
                    continue
                try:
                    yield json.loads(data_str)
                except json.JSONDecodeError:
                    continue


async def _stream_ollama_native(provider: LLMProvider, payload: dict, timeout_s: int) -> AsyncIterator[dict]:
    body = {
        "model": payload["model"],
        "messages": _ollama_messages(payload.get("messages", [])),
        "stream": True,
        "options": {"num_predict": payload.get("max_tokens")},
    }
    timeout = httpx.Timeout(timeout_s, connect=5)
    async with httpx.AsyncClient(timeout=timeout) as client:
        async with client.stream("POST", provider.chat_url, json=body) as resp:
            resp.raise_for_status()
            async for line_str in resp.aiter_lines():
                if not line_str:
                    continue
                try:
                    data = json.loads(line_str)
                except json.JSONDecodeError:
                    continue
                content = data.get("message", {}).get("content", "")
                done = data.get("done", False)
                yield {
                    "choices": [{
                        "delta": {"content": content},
                        "finish_reason": "stop" if done else None,
                    }]
                }
