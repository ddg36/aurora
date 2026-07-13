"""Round-trip, errores y auditoría del puente semántico AIHub."""

import asyncio
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from tools import view_actions


async def main():
    original_emitir = view_actions.emitir

    async def responder(uid, tipo, data):
        assert uid == 7 and tipo == "ai_view_request"
        fut, pending_uid = view_actions._PENDIENTES[data["reqId"]]
        assert pending_uid == 7
        if data["op"] == "describe":
            fut.set_result({"ok": True, "result": {"id": data["view"], "actions": {"status": {}}}})
        else:
            fut.set_result({"ok": True, "view": data["view"], "action": data["action"], "result": {"done": True}})

    try:
        view_actions.emitir = responder
        caller = {"usuario_id": 7, "kind": "internal"}
        described = await view_actions.view_describe({"view": "scratchpad"}, caller)
        assert described["ok"] and described["result"]["id"] == "scratchpad", described
        invoked = await view_actions.view_invoke({"view": "scratchpad", "action": "status", "args": {}}, caller)
        assert invoked["ok"] and invoked["result"]["done"], invoked
        invalid = await view_actions.view_invoke({"view": "scratchpad", "args": {}}, caller)
        assert not invalid["ok"] and "action" in invalid["error"], invalid
        invalid_args = await view_actions.view_invoke({
            "view": "scratchpad", "action": "status", "args": [],
        }, caller)
        assert not invalid_args["ok"] and "objeto JSON" in invalid_args["error"], invalid_args
        assert len(view_actions._AUDIT) == 2
        assert all(event["usuario_id"] == 7 for event in view_actions._AUDIT)
        print("OK — AI view actions: round-trip, validation and audit")
    finally:
        view_actions.emitir = original_emitir


asyncio.run(main())
