#!/usr/bin/env python3
"""Stub de `pi --mode rpc` para tests: habla el protocolo JSONL por stdin/stdout."""

import json
import sys


def out(obj):
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()


state = {"n": 1, "session_name": None, "auto_compaction": True,
         "steering_mode": "one-at-a-time", "follow_up_mode": "one-at-a-time",
         "thinking_level": "medium", "model": None}


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

    elif t == "prompt" and cmd.get("message") == "TEST_TOOLS_PARALELOS":
        # Regresión: 2+ llamadas a la MISMA tool en un turno (ej. varios
        # "bash" pedidos en paralelo) — toolCallId es lo único que las
        # distingue, 'toolName' es igual para ambas. Both starts ANTES de
        # cualquier end (simula dispatch paralelo real), y los resultados
        # llegan en orden INVERSO al de inicio (c2 termina antes que c1).
        out({"id": cid, "type": "response", "command": "prompt", "success": True})
        out({"type": "agent_start"})
        out({"type": "tool_execution_start", "toolCallId": "c1", "toolName": "bash", "args": {"command": "uno"}})
        out({"type": "tool_execution_start", "toolCallId": "c2", "toolName": "bash", "args": {"command": "dos"}})
        out({"type": "tool_execution_end", "toolCallId": "c2", "toolName": "bash",
             "result": {"content": [{"type": "text", "text": "RESULTADO_DOS"}]}, "isError": False})
        out({"type": "tool_execution_end", "toolCallId": "c1", "toolName": "bash",
             "result": {"content": [{"type": "text", "text": "RESULTADO_UNO"}]}, "isError": False})
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
             "data": {**session(), "model": state["model"], "isStreaming": False,
                       "thinkingLevel": state["thinking_level"],
                       "sessionName": state["session_name"],
                       "autoCompactionEnabled": state["auto_compaction"],
                       "steeringMode": state["steering_mode"],
                       "followUpMode": state["follow_up_mode"]}})

    elif t == "set_thinking_level":
        # Simula el clamp real de pi (agent-session.js:_clampThinkingLevel):
        # este modelo fake sólo "soporta" hasta 'medium'.
        pedido = cmd.get("level")
        clamp_a = {"high": "medium", "xhigh": "medium"}
        state["thinking_level"] = clamp_a.get(pedido, pedido)
        out({"id": cid, "type": "response", "command": "set_thinking_level", "success": True})

    elif t == "set_session_name":
        state["session_name"] = cmd.get("name")
        out({"id": cid, "type": "response", "command": "set_session_name", "success": True})

    elif t == "set_auto_compaction":
        state["auto_compaction"] = bool(cmd.get("enabled"))
        out({"id": cid, "type": "response", "command": "set_auto_compaction", "success": True})

    elif t == "set_steering_mode":
        state["steering_mode"] = cmd.get("mode")
        out({"id": cid, "type": "response", "command": "set_steering_mode", "success": True})

    elif t == "set_follow_up_mode":
        state["follow_up_mode"] = cmd.get("mode")
        out({"id": cid, "type": "response", "command": "set_follow_up_mode", "success": True})

    elif t == "compact" and cmd.get("customInstructions") == "FALLAR":
        # Regresión: session.compact() real tira "Nothing to compact" /
        # "Already compacted" / etc, y rpc-mode.js lo propaga como
        # success:false — bridge.py NO miraba esto y siempre decía "Listo".
        out({"id": cid, "type": "response", "command": "compact", "success": False,
             "error": "Nothing to compact (session too small)"})

    elif t == "compact":
        out({"id": cid, "type": "response", "command": "compact", "success": True,
             "data": {"customInstructions": cmd.get("customInstructions"),
                       "summary": "resumen de prueba de lo compactado",
                       "tokensBefore": 5000, "estimatedTokensAfter": 800}})

    elif t == "get_tree":
        out({"id": cid, "type": "response", "command": "get_tree", "success": True,
             "data": {"tree": [{
                 "entry": {"id": "e1", "type": "message", "message": {"role": "user", "content": "hola"}},
                 "children": [{
                     "entry": {"id": "e2", "type": "message", "message": {"role": "assistant", "content": "hola de vuelta"}},
                     "children": [],
                 }],
             }], "leafId": "e2"}})

    elif t == "get_session_stats":
        out({"id": cid, "type": "response", "command": "get_session_stats", "success": True,
             "data": {"userMessages": 2, "assistantMessages": 2, "toolCalls": 1, "toolResults": 1,
                       "totalMessages": 4,
                       "tokens": {"input": 100, "output": 50, "cacheRead": 0, "cacheWrite": 0, "total": 150},
                       "contextUsage": {"percent": 7.4, "contextWindow": 200000},
                       "cost": 0.0123}})

    elif t == "get_last_assistant_text":
        out({"id": cid, "type": "response", "command": "get_last_assistant_text", "success": True,
             "data": {"text": "ULTIMO_MENSAJE_DE_PRUEBA"}})

    elif t == "fork":
        out({"id": cid, "type": "response", "command": "fork", "success": True,
             "data": {"text": "hola", "cancelled": False}})

    elif t == "cycle_model":
        state["model"] = {"id": "otro-modelo", "provider": "lm-studio"}
        out({"id": cid, "type": "response", "command": "cycle_model", "success": True,
             "data": {"model": state["model"]}})

    elif t == "set_model" and cmd.get("modelId") == "modelo-que-falla":
        # Regresión: bridge.py marcaba éxito sin mirar esto.
        out({"id": cid, "type": "response", "command": "set_model", "success": False,
             "error": "Model not found: prueba/modelo-que-falla"})

    elif t == "set_model":
        state["model"] = {"id": cmd.get("modelId"), "provider": cmd.get("provider")}
        out({"id": cid, "type": "response", "command": "set_model", "success": True})

    elif t == "new_session":
        state["n"] += 1
        out({"id": cid, "type": "response", "command": "new_session", "success": True,
             "data": {"cancelled": False}})

    elif t == "switch_session":
        out({"id": cid, "type": "response", "command": "switch_session", "success": True,
             "data": {"cancelled": False}})

    elif t == "get_available_models":
        # 'input' replica el schema real de pi (pi-ai/types.d.ts: Model.input
        # es ("text"|"image")[], NO existe 'capabilities') — llamacpp sin
        # "image" simula un modelo local chico sin soporte de visión.
        out({"id": cid, "type": "response", "command": "get_available_models", "success": True,
             "data": {"models": [
                 {"id": "llamacpp", "name": "llamacpp", "provider": "llama-cpp", "input": ["text"]},
                 {"id": "claude-haiku-4-5", "name": "Claude Haiku 4.5", "provider": "anthropic", "input": ["text", "image"]},
                 {"id": "claude-haiku-4-5-20251001", "name": "Claude Haiku 4.5 (pinned)", "provider": "anthropic", "input": ["text", "image"]},
                 {"id": "modelo-que-falla", "name": "Modelo que falla", "provider": "prueba", "input": ["text"]},
             ]}})

    elif t == "abort":
        out({"id": cid, "type": "response", "command": "abort", "success": True})
        out({"type": "agent_end", "messages": []})

    else:
        out({"id": cid, "type": "response", "command": t, "success": True})
