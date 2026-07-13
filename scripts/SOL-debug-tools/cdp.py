#!/usr/bin/env python3
"""Utilidad mínima CDP para inspeccionar Aurora/Helium en :9222."""
import argparse
import base64
import json
import pathlib
import urllib.request

import websocket


def targets():
    with urllib.request.urlopen('http://127.0.0.1:9222/json/list', timeout=3) as r:
        return json.load(r)


def target(needle, target_id=None):
    if target_id:
        matches = [t for t in targets() if t.get('id') == target_id and t.get('webSocketDebuggerUrl')]
        if not matches:
            raise SystemExit(f'No hay target id: {target_id}')
        return matches[0]
    matches = [t for t in targets() if needle in t.get('url', '') and t.get('webSocketDebuggerUrl')]
    if not matches:
        raise SystemExit(f'No hay target que contenga: {needle}')
    return matches[0]


def call(ws, method, params=None, ident=1):
    ws.send(json.dumps({'id': ident, 'method': method, 'params': params or {}}))
    while True:
        msg = json.loads(ws.recv())
        if msg.get('id') == ident:
            return msg


def main():
    p = argparse.ArgumentParser()
    p.add_argument('command', choices=['list', 'eval', 'reload', 'shot'])
    p.add_argument('--target', default='http://localhost:7779/ui/')
    p.add_argument('--target-id')
    p.add_argument('--expr', default='document.title')
    p.add_argument('--out', default='/tmp/aurora-cdp.png')
    p.add_argument('--timeout', type=float, default=10, help='timeout del WebSocket CDP')
    a = p.parse_args()
    if a.command == 'list':
        for t in targets():
            print(t.get('type'), t.get('id'), t.get('url'))
        return
    t = target(a.target, a.target_id)
    ws = websocket.create_connection(t['webSocketDebuggerUrl'], timeout=a.timeout)
    try:
        if a.command == 'eval':
            r = call(ws, 'Runtime.evaluate', {'expression': a.expr, 'returnByValue': True, 'awaitPromise': True})
            print(json.dumps(r.get('result', {}), ensure_ascii=False, indent=2))
        elif a.command == 'reload':
            print(json.dumps(call(ws, 'Page.reload', {'ignoreCache': True}), indent=2))
        else:
            r = call(ws, 'Page.captureScreenshot', {'format': 'png', 'captureBeyondViewport': False})
            out = pathlib.Path(a.out)
            out.write_bytes(base64.b64decode(r['result']['data']))
            print(out)
    finally:
        ws.close()


if __name__ == '__main__':
    main()
