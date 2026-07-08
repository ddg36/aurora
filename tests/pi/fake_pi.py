#!/usr/bin/env python3
"""Stub de `pi --mode rpc` para tests: habla el protocolo JSONL por stdin/stdout."""

import json
import sys


def out(obj):
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()


state = {"n": 1}


def session():
    return {"sessionId": f"fake-{state['n']}", "sessionFile": f"/tmp/fake-{state['n']}.jsonl"}


for linea in sys.stdin:
    linea = linea.strip()
    if not linea:
        continue
    cmd = json.loads(linea)
    t = cmd.get("type")
    cid = cmd.get("id")

    if t == "prompt" and cmd.get("message") == "TEST_INTERLEAVED":
        # Regresión: texto real del LLM DURANTE una tool no debe perderse
        # ni pisar el resultado real de la tool (bug encontrado en bridge.py).
        out({"id": cid, "type": "response", "command": "prompt", "success": True})
        out({"type": "agent_start"})
        out({"type": "tool_execution_start", "toolCallId": "c1", "toolName": "bash", "args": {"command": "ls"}})
        out({"type": "message_update", "assistantMessageEvent": {"type": "text_delta", "delta": "narración durante la tool"}})
        out({"type": "tool_execution_end", "toolCallId": "c1", "toolName": "bash",
             "result": {"content": [{"type": "text", "text": "RESULTADO_REAL_DE_LA_TOOL"}]}, "isError": False})
        out({"type": "message_update", "assistantMessageEvent": {"type": "text_delta", "delta": " después"}})
        out({"type": "agent_end", "messages": []})

    elif t == "prompt":
        out({"id": cid, "type": "response", "command": "prompt", "success": True})
        out({"type": "agent_start"})
        out({"type": "message_update", "assistantMessageEvent": {"type": "thinking_delta", "delta": "pensando..."}})
        for palabra in ["Hola", " mundo"]:
            out({"type": "message_update", "assistantMessageEvent": {"type": "text_delta", "delta": palabra}})
        out({"type": "tool_execution_start", "toolCallId": "c1", "toolName": "bash", "args": {"command": "ls"}})
        out({"type": "tool_execution_end", "toolCallId": "c1", "toolName": "bash",
             "result": {"content": [{"type": "text", "text": "archivo.txt"}]}, "isError": False})
        out({"type": "agent_end", "messages": []})

    elif t == "get_state":
        out({"id": cid, "type": "response", "command": "get_state", "success": True,
             "data": {**session(), "model": None, "isStreaming": False}})

    elif t == "new_session":
        state["n"] += 1
        out({"id": cid, "type": "response", "command": "new_session", "success": True})

    elif t == "switch_session":
        out({"id": cid, "type": "response", "command": "switch_session", "success": True,
             "data": {"cancelled": False}})

    elif t == "get_available_models":
        out({"id": cid, "type": "response", "command": "get_available_models", "success": True,
             "data": {"models": [{"id": "llamacpp", "name": "llamacpp", "provider": "llama-cpp"}]}})

    elif t == "abort":
        out({"id": cid, "type": "response", "command": "abort", "success": True})
        out({"type": "agent_end", "messages": []})

    else:
        out({"id": cid, "type": "response", "command": t, "success": True})
