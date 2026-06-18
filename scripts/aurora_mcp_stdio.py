#!/usr/bin/env python3
import asyncio
import contextlib
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

with contextlib.redirect_stdout(sys.stderr):
    from mcp.protocol import handle_rpc


async def main() -> None:
    while True:
        line = await asyncio.to_thread(sys.stdin.readline)
        if not line:
            break
        line = line.strip()
        if not line:
            continue
        try:
            payload = json.loads(line)
            if isinstance(payload, list):
                response = [await handle_rpc(item) for item in payload]
            else:
                response = await handle_rpc(payload)
        except Exception as exc:
            response = {"jsonrpc": "2.0", "id": None, "error": {"code": -32000, "message": str(exc)}}
        print(json.dumps(response, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    asyncio.run(main())
