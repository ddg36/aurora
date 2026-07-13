#!/usr/bin/env python3
"""CLI semántica para probar Aurora por CDP sin reescribir JavaScript.

Ejemplos:
  ./sol-debug.py --targets
  ./sol-debug.py --view lyra
  ./sol-debug.py --cloud-ask 'Respondé OK' --pane cloud --timeout 30
  ./sol-debug.py --cloud-ask 'Leé el adjunto' --file /tmp/x.txt
  ./sol-debug.py --cloud-stop --pane cloud
  ./sol-debug.py --trace 20 --pane cloud
"""

import argparse
import base64
import json
import mimetypes
import pathlib
import sys
import time
import urllib.parse
import urllib.request
import uuid

import websocket

from cdp import call, target, targets


AURORA = 'http://localhost:7779/ui/'
EXTENSION_ID = 'phofkcfbhpkgjaalofhcffabjfcgejpp'
EXTENSION_PAGE = f'chrome-extension://{EXTENSION_ID}/newtab.html'
LLM_HOSTS = (
    'gemini.google.com', 'chatgpt.com', 'chat.openai.com', 'claude.ai',
    'grok.com', 'perplexity.ai', 'copilot.microsoft.com', 'kimi.moonshot.cn',
    'poe.com', 'you.com', 'chat.qwen.ai',
)

WEB_CHAOS = {
    'landing': {
        'artifact': '/tmp/aurora-web-chaos/01-landing.html',
        'expected': 'WEB_CHAOS_LANDING_OK',
        'markers': ('pricing', 'faq', 'localStorage'),
        'prompt': '''Construye una landing page SaaS completa en /tmp/aurora-web-chaos/01-landing.html. Debe ser un único HTML autocontenido, responsive y accesible, con navegación, hero, métricas, tres planes, toggle mensual/anual funcional, FAQ accordion, cambio de tema persistente, formulario con validación y estados visuales pulidos. Usa tools reales: crea el directorio, escribe el archivo y verifícalo con bash (tamaño y presencia de secciones/scripts); corrige con edit si la verificación detecta un problema. Máximo 4 rondas de tools. No pegues el código en la respuesta final. Sólo después de verificar responde exactamente WEB_CHAOS_LANDING_OK.''',
    },
    'crm': {
        'artifact': '/tmp/aurora-web-chaos/02-crm.html',
        'expected': 'WEB_CHAOS_CRM_OK',
        'markers': ('localStorage', 'modal', 'pipeline'),
        'prompt': '''Construye un CRM funcional en /tmp/aurora-web-chaos/02-crm.html como un único HTML autocontenido. Incluye al menos 12 leads de ejemplo, KPIs calculados, búsqueda, filtros por estado, tabla ordenable, pipeline visual, modal para crear/editar leads, cambio de etapa, borrado con confirmación, persistencia localStorage y diseño responsive. Usa tools reales para mkdir, write y una verificación bash del archivo y sus funciones; usa edit si hace falta corregir. Máximo 4 rondas de tools. No muestres el código al final. Tras verificar responde exactamente WEB_CHAOS_CRM_OK.''',
    },
    'game': {
        'artifact': '/tmp/aurora-web-chaos/03-game.html',
        'expected': 'WEB_CHAOS_GAME_OK',
        'markers': ('requestAnimationFrame', 'canvas', 'collision'),
        'prompt': '''Construye un videojuego arcade completo en /tmp/aurora-web-chaos/03-game.html como HTML autocontenido. Usa Canvas: nave contra asteroides, movimiento y disparo por teclado, controles táctiles, colisiones, partículas, puntuación, vidas, niveles, pausa, game over y reinicio. Debe adaptarse al viewport y explicar controles. Usa tools reales para crear, escribir y verificar con bash que Canvas, loop requestAnimationFrame y lógica de colisión estén presentes; corrige con edit si es necesario. Máximo 4 rondas de tools. No pegues código en la respuesta final. Tras verificar responde exactamente WEB_CHAOS_GAME_OK.''',
    },
    'kanban': {
        'artifact': '/tmp/aurora-web-chaos/04-kanban.html',
        'expected': 'WEB_CHAOS_KANBAN_OK',
        'markers': ('dragstart', 'localStorage', 'column'),
        'prompt': '''Construye un gestor Kanban en /tmp/aurora-web-chaos/04-kanban.html como único HTML autocontenido. Incluye columnas Backlog/En progreso/Revisión/Hecho, crear-editar-borrar tarjetas, prioridad, etiquetas, responsable, fecha límite, búsqueda/filtros, contadores, drag and drop entre columnas, persistencia localStorage, datos demo y UX responsive accesible. Usa tools reales para mkdir/write y verifica con bash las funciones críticas; corrige con edit si falla algo. Máximo 4 rondas de tools. No muestres el código al final. Tras verificar responde exactamente WEB_CHAOS_KANBAN_OK.''',
    },
    'scheduler': {
        'artifact': '/tmp/aurora-web-chaos/05-scheduler.html',
        'expected': 'WEB_CHAOS_SCHEDULER_OK',
        'markers': ('localStorage', 'conflict', 'appointment'),
        'prompt': '''Construye una agenda/mini ERP de citas en /tmp/aurora-web-chaos/05-scheduler.html como único HTML autocontenido. Incluye vista semanal, navegación de semanas, horarios, crear/editar/cancelar citas, clientes y servicios, detección real de conflictos, filtros, resumen diario, datos demo, persistencia localStorage, formulario accesible y diseño responsive. Usa tools reales para crear/escribir y verifica con bash tamaño, scripts y lógica de conflictos; corrige con edit si hace falta. Máximo 4 rondas de tools. No pegues código al final. Tras verificar responde exactamente WEB_CHAOS_SCHEDULER_OK.''',
    },
}

WEB_CHAOS_BOOTSTRAP = '''PROTOCOLO OBLIGATORIO: tu primera respuesta debe ser exclusivamente este bloque y no puedes afirmar éxito antes de recibir su resultado real:
```json
{"tool":"bash","args":{"cmd":"mkdir -p /tmp/aurora-web-chaos"}}
```
Después continúa la tarea usando tools reales.\n\n'''


def evaluate(expr, *, needle=AURORA, target_id=None, timeout=12):
    t = target(needle, target_id)
    ws = websocket.create_connection(t['webSocketDebuggerUrl'], timeout=timeout)
    try:
        msg = call(ws, 'Runtime.evaluate', {
            'expression': expr,
            'returnByValue': True,
            'awaitPromise': True,
        })
    finally:
        ws.close()
    detail = msg.get('result', {}).get('exceptionDetails')
    if detail:
        exception = detail.get('exception', {})
        raise RuntimeError(exception.get('description') or detail.get('text') or json.dumps(detail, ensure_ascii=False))
    return msg.get('result', {}).get('result', {}).get('value')


def aurora_page_target(timeout=4):
    """Encuentra la página de Helium que contiene el iframe de Aurora."""
    for candidate in targets():
        if candidate.get('type') != 'page' or not candidate.get('webSocketDebuggerUrl'):
            continue
        ws = websocket.create_connection(candidate['webSocketDebuggerUrl'], timeout=timeout)
        try:
            msg = call(ws, 'Runtime.evaluate', {
                'expression': "!!document.querySelector('iframe[src*=\"localhost:7779\"]')",
                'returnByValue': True,
            })
            value = msg.get('result', {}).get('result', {}).get('value')
            if value:
                return candidate
        except (OSError, websocket.WebSocketException):
            pass
        finally:
            ws.close()
    raise RuntimeError('No encontré la página de Helium que contiene Aurora')


def open_target(url):
    encoded = urllib.parse.quote(url, safe='')
    request = urllib.request.Request(f'http://127.0.0.1:9222/json/new?{encoded}', method='PUT')
    with urllib.request.urlopen(request, timeout=5) as response:
        return json.load(response)


def wait_for_target(needle, timeout_s=15):
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        found = [t for t in targets() if needle in t.get('url', '') and t.get('webSocketDebuggerUrl')]
        if found:
            return found[0]
        time.sleep(0.25)
    raise RuntimeError(f'timeout esperando target: {needle}')


def llm_iframe_targets():
    result = []
    for item in targets():
        if item.get('type') != 'iframe' or not item.get('webSocketDebuggerUrl'):
            continue
        try:
            host = urllib.parse.urlparse(item.get('url', '')).hostname or ''
        except ValueError:
            continue
        if any(host == known or host.endswith('.' + known) for known in LLM_HOSTS):
            result.append(item)
    return result


def reload_context(item):
    ws = websocket.create_connection(item['webSocketDebuggerUrl'], timeout=5)
    try:
        response = call(ws, 'Runtime.evaluate', {
            'expression': "location.reload(); 'reloading'",
            'returnByValue': True,
        })
        return 'error' not in response
    finally:
        ws.close()


def bring_to_front(item):
    ws = websocket.create_connection(item['webSocketDebuggerUrl'], timeout=5)
    try:
        response = call(ws, 'Page.bringToFront')
        if 'error' in response:
            raise RuntimeError(response['error'].get('message', str(response['error'])))
    finally:
        ws.close()
    return {'ok': True, 'id': item.get('id'), 'url': item.get('url')}


def background_aurora():
    host = aurora_page_target()
    candidates = [
        item for item in targets()
        if item.get('type') == 'page'
        and item.get('id') != host.get('id')
        and not item.get('url', '').startswith(f'chrome-extension://{EXTENSION_ID}/')
        and item.get('webSocketDebuggerUrl')
    ]
    if not candidates:
        raise RuntimeError('No hay otra pestaña para llevar Aurora a segundo plano')
    return bring_to_front(candidates[0])


def full_reload(timeout_s=25):
    """Recarga la extensión, recrea Aurora y pulsa su hard reload nativo."""
    extension_needle = f'chrome-extension://{EXTENSION_ID}/'
    iframes_before = llm_iframe_targets()
    # Programar la recarga permite que Runtime.evaluate responda antes de que
    # Chrome destruya el propio contexto que ejecutó la orden.
    evaluate(
        "setTimeout(()=>chrome.runtime.reload(),50);({scheduled:true,id:chrome.runtime.id})",
        needle=extension_needle,
        timeout=5,
    )
    time.sleep(0.75)

    # Los iframes hijos normalmente mueren con la página de la extensión. Si
    # algún OOPIF LLM sobrevive, navegarlo fuerza la reinyección del content
    # script que Chrome acaba de registrar.
    reloaded_survivors = []
    failed_survivors = []
    for item in llm_iframe_targets():
        try:
            bucket = reloaded_survivors if reload_context(item) else failed_survivors
            bucket.append(item.get('id'))
        except (OSError, websocket.WebSocketException):
            failed_survivors.append(item.get('id'))

    page = open_target(EXTENSION_PAGE)
    aurora = wait_for_target(AURORA, timeout_s=min(timeout_s, 15))

    deadline = time.monotonic() + timeout_s
    clicked = False
    before_url = aurora.get('url', '')
    while time.monotonic() < deadline:
        try:
            result = evaluate(
                "(()=>{const b=document.querySelector('button[title*=\"hard reload\"]');b?.click();return {ok:!!b}})()",
                timeout=5,
            )
            clicked = bool(result and result.get('ok'))
            if clicked:
                break
        except (OSError, RuntimeError, websocket.WebSocketException):
            pass
        time.sleep(0.25)
    if not clicked:
        raise RuntimeError('Aurora abrió, pero no apareció el botón de hard reload')

    # El botón reemplaza el iframe con una URL cache-busted. Esperar ese nuevo
    # target evita que el siguiente comando compita con el desmontaje.
    remounted = False
    while time.monotonic() < deadline:
        matches = [t for t in targets() if AURORA in t.get('url', '') and t.get('webSocketDebuggerUrl')]
        if matches and (matches[0].get('url') != before_url or '_r=' in matches[0].get('url', '')):
            remounted = True
            aurora = matches[0]
            break
        time.sleep(0.25)
    return {
        'ok': remounted and not failed_survivors,
        'extensionReloaded': True,
        'iframesBefore': [
            {'id': item.get('id'), 'url': item.get('url')} for item in iframes_before
        ],
        'survivingIframesReloaded': reloaded_survivors,
        'survivingIframeReloadFailures': failed_survivors,
        'allIframesInvalidated': not failed_survivors,
        'newTabId': page.get('id'),
        'auroraTargetId': aurora.get('id'),
        'hardReloadClicked': clicked,
        'auroraRemounted': remounted,
        'url': aurora.get('url'),
    }


def data_url(path):
    p = pathlib.Path(path)
    mime = mimetypes.guess_type(p.name)[0] or 'application/octet-stream'
    return f'data:{mime};base64,' + base64.b64encode(p.read_bytes()).decode('ascii')


def files_payload(paths):
    result = []
    for raw in paths:
        p = pathlib.Path(raw)
        mime = mimetypes.guess_type(p.name)[0] or 'application/octet-stream'
        if mime.startswith('text/') or p.suffix.lower() in {'.md', '.json', '.js', '.py', '.css', '.html'}:
            content = p.read_text(encoding='utf-8', errors='replace')
        else:
            content = data_url(p)
        result.append({'name': p.name, 'type': mime, 'content': content})
    return result


def js(value):
    return json.dumps(value, ensure_ascii=False)


def start_cloud_job(prompt, pane, timeout_ms, files, images):
    job_id = 'sol-' + uuid.uuid4().hex[:12]
    expr = f"""
      (async()=>{{
        const id={js(job_id)};
        const jobs=globalThis.__solDebugJobs ||= {{}};
        const job=jobs[id]={{id,state:'starting',pane:{js(pane)},started:Date.now(),chunk:''}};
        try {{
          const {{askCloud}}=await import('/ui/components/shared/cloud-ask.js');
          job.state='running';
          askCloud(null,{js(prompt)},{{
            paneId:{js(pane)}, timeoutMs:{timeout_ms}, files:{js(files)}, images:{js(images)},
            onChunk:t=>{{job.chunk=t;job.updated=Date.now();}}
          }}).then(result=>Object.assign(job,{{state:'done',result,finished:Date.now()}}))
            .catch(error=>Object.assign(job,{{state:'error',error:String(error?.stack||error),finished:Date.now()}}));
        }} catch(error) {{ Object.assign(job,{{state:'error',error:String(error?.stack||error),finished:Date.now()}}); }}
        return id;
      }})()
    """
    return evaluate(expr), job_id


def start_lyra_job(prompt, timeout_ms, attachments, expect_cancel=False):
    """Envía por el composer real de Lyra y observa su ciclo UI completo."""
    job_id = 'sol-' + uuid.uuid4().hex[:12]
    config = js({
        'id': job_id,
        'prompt': prompt,
        'timeoutMs': timeout_ms,
        'attachments': attachments,
        'expectCancel': expect_cancel,
    })
    expr = f"""
      (()=>{{
        const cfg={config};
        const jobs=globalThis.__solDebugJobs ||= {{}};
        const job=jobs[cfg.id]={{
          id:cfg.id,state:'starting',via:'lyra_ui',started:Date.now(),
          hiddenAtStart:document.hidden,hiddenSeen:document.hidden
        }};
        (async()=>{{
          const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
          const finish=(state,result)=>Object.assign(job,{{state,result,finished:Date.now()}});
          try {{
            const panel=[...document.querySelectorAll('.cloud-panel:not(.cloud-panel-hidden)')]
              .find(node=>node.getClientRects().length);
            const textarea=[...document.querySelectorAll('.composer-textarea')]
              .find(node=>node.getClientRects().length);
            if (!panel || !textarea) {{
              finish('error',{{ok:false,reason:'lyra_cloud_ui_not_ready',panel:!!panel,composer:!!textarea}});
              return;
            }}
            const signals=await import('/ui/modules/lyra/scripts/chat/mensajes.js');
            if (signals.cloudGenerando.value) {{
              finish('error',{{ok:false,reason:'lyra_cloud_busy'}});
              return;
            }}
            const historyStart=signals.historial.value.length;
            const composerRoot=textarea.closest('.chat-input-area')||document;

            for (const item of cfg.attachments) {{
              const more=[...composerRoot.querySelectorAll('button')]
                .find(b=>b.title==='Más opciones'&&b.getClientRects().length);
              more?.click();
              await sleep(80);
              const input=composerRoot.querySelector('.composer-plus-menu input[type="file"]');
              if (!input) {{
                finish('error',{{ok:false,reason:'lyra_attachment_input_missing',name:item.name}});
                return;
              }}
              let blob;
              if (String(item.content||'').startsWith('data:')) blob=await (await fetch(item.content)).blob();
              else blob=new Blob([item.content||''],{{type:item.type||'application/octet-stream'}});
              const file=new File([blob],item.name,{{type:item.type||blob.type,lastModified:Date.now()}});
              const transfer=new DataTransfer();
              transfer.items.add(file);
              input.files=transfer.files;
              input.dispatchEvent(new Event('change',{{bubbles:true}}));
              await sleep(120);
            }}

            const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;
            setter.call(textarea,cfg.prompt);
            textarea.dispatchEvent(new Event('input',{{bubbles:true}}));
            textarea.focus();
            await sleep(80);
            const send=[...composerRoot.querySelectorAll('.composer-send-btn:not(.composer-send-btn--stop)')]
              .find(button=>button.getClientRects().length);
            if (!send || send.disabled) {{
              finish('error',{{ok:false,reason:'lyra_send_unavailable',button:!!send,disabled:!!send?.disabled}});
              return;
            }}
            send.click();
            job.state='running';
            await sleep(80);
            job.composerCleared=([...document.querySelectorAll('.composer-textarea')]
              .find(node=>node.getClientRects().length)?.value||'')==='';

            let sawGenerating=false, sawLoadingDom=false, sawStopButton=false;
            const deadline=Date.now()+cfg.timeoutMs;
            while (Date.now()<deadline) {{
              job.hiddenSeen ||= document.hidden;
              sawGenerating ||= !!signals.cloudGenerando.value;
              sawLoadingDom ||= !!document.querySelector('.cloud-activity, .message.assistant.loading.direct-ai');
              sawStopButton ||= !!document.querySelector('.composer-send-btn--stop');
              if (sawGenerating && !signals.cloudGenerando.value) {{
                // Stop apaga la señal UI de inmediato; el relay entrega
                // `reason:cancelled` unos cientos de ms después. Darle margen
                // evita capturar el placeholder provisional "Thinking".
                await sleep(800);
                const added=signals.historial.value.slice(historyStart);
                const answer=[...added].reverse().find(m=>m.role==='assistant'&&m._via==='direct-ai');
                const content=String(answer?.content||'');
                const cancelled=/^(Cancelado por el usuario\\.|Cancelled)/i.test(content.trim());
                const normalOk=!!content.trim()&&!Boolean(answer&&answer._toolError)&&
                  !/^Error:/i.test(content.trim())&&!/^(Thinking|Reasoning|Pensando)$/i.test(content.trim());
                const ok=cancelled?!!cfg.expectCancel:normalOk;
                finish('done',{{
                  ok, reason:cancelled?'lyra_ui_cancelled':(ok?'lyra_ui_complete':'lyra_ui_error'), text:content,
                  addedMessages:added.length,
                  ui:{{composerCleared:job.composerCleared,sawGenerating,sawLoadingDom,sawStopButton}}
                }});
                return;
              }}
              await sleep(100);
            }}
            finish('error',{{
              ok:false,reason:'lyra_ui_timeout',
              ui:{{composerCleared:job.composerCleared,sawGenerating,sawLoadingDom,sawStopButton,
                generating:!!signals.cloudGenerando.value}}
            }});
          }} catch(error) {{
            finish('error',{{ok:false,reason:'lyra_ui_exception',error:String(error?.stack||error)}});
          }}
        }})();
        return cfg.id;
      }})()
    """
    return evaluate(expr), job_id


def poll_job(job_id, timeout_s, verbose=False):
    deadline = time.monotonic() + timeout_s + 5
    last_phase = None
    while time.monotonic() < deadline:
        job = evaluate(f'(globalThis.__solDebugJobs||{{}})[{js(job_id)}]||null')
        if not job:
            raise RuntimeError(f'job desapareció: {job_id}')
        phase = job.get('state')
        if verbose and phase != last_phase:
            print(f'[{job_id}] {phase}', file=sys.stderr, flush=True)
            last_phase = phase
        if phase in {'done', 'error'}:
            return job
        time.sleep(0.5)
    return {'id': job_id, 'state': 'poll_timeout'}


def main():
    p = argparse.ArgumentParser(description='Acciones semánticas de debug para Aurora/Helium CDP :9222')
    actions = p.add_mutually_exclusive_group(required=True)
    actions.add_argument('--targets', action='store_true', help='listar targets CDP')
    actions.add_argument('--eval', metavar='JS', help='evaluar JavaScript en Aurora')
    actions.add_argument('--view', metavar='NOMBRE', help='abrir una vista por title/aria-label')
    actions.add_argument('--click', metavar='TEXTO', help='click en botón por texto o title')
    actions.add_argument('--hard-reload', action='store_true', help='pulsar ↺ de Aurora')
    actions.add_argument('--full-reload', action='store_true', help='recargar extensión + nueva tab + hard reload')
    actions.add_argument('--background', action='store_true', help='llevar Aurora a segundo plano')
    actions.add_argument('--foreground', action='store_true', help='traer Aurora al frente')
    actions.add_argument('--lyra-send', metavar='PROMPT', help='E2E por el chatbox nativo de Lyra Cloud')
    actions.add_argument('--lyra-enter', metavar='PROMPT', help='escribir y pulsar Enter sin esperar resultado')
    actions.add_argument('--chaos-web', choices=tuple(WEB_CHAOS), help='escenario web complejo por Lyra Cloud')
    actions.add_argument('--cloud-ask', metavar='PROMPT', help='probar directamente el relay/iframe Cloud')
    actions.add_argument('--lyra-stop', action='store_true', help='pulsar Stop en el chatbox nativo de Lyra')
    actions.add_argument('--cloud-stop', action='store_true', help='detener generación Cloud')
    actions.add_argument('--trace', nargs='?', const=20, type=int, metavar='N', help='últimos eventos Cloud')
    actions.add_argument('--status', action='store_true', help='estado resumido de Aurora/Cloud')
    actions.add_argument('--shot', metavar='RUTA', help='captura del viewport de Aurora')
    p.add_argument('--pane', choices=('cloud', 'izq', 'der'), default='cloud', help='panel Cloud (default: cloud)')
    p.add_argument('--timeout', type=float, default=45, help='timeout en segundos')
    p.add_argument('--file', action='append', default=[], help='archivo adjunto; repetible')
    p.add_argument('--image', action='append', default=[], help='imagen adjunta; repetible')
    p.add_argument('--expect-cancel', action='store_true', help='considerar exitosa una cancelación solicitada')
    p.add_argument('--target-id', help='forzar target CDP')
    p.add_argument('--target', default=AURORA, help='substring de URL del target')
    p.add_argument('--verbose', action='store_true', help='mostrar fases internas durante el diagnóstico')
    a = p.parse_args()

    if a.targets:
        for t in targets():
            print(t.get('type'), t.get('id'), t.get('url'))
        return
    if a.eval is not None:
        print(json.dumps(evaluate(a.eval, needle=a.target, target_id=a.target_id), ensure_ascii=False, indent=2))
        return
    if a.shot:
        t = target(a.target, a.target_id) if a.target_id else aurora_page_target()
        ws = websocket.create_connection(t['webSocketDebuggerUrl'], timeout=12)
        try:
            r = call(ws, 'Page.captureScreenshot', {'format': 'png', 'captureBeyondViewport': False})
        finally:
            ws.close()
        if 'error' in r:
            raise RuntimeError(r['error'].get('message', str(r['error'])))
        out = pathlib.Path(a.shot)
        out.write_bytes(base64.b64decode(r['result']['data']))
        print(out)
        return
    if a.view:
        value = evaluate(f"""(()=>{{
          const q={js(a.view)}.toLowerCase();
          const all=[...document.querySelectorAll('button')];
          const b=all.find(x=>(x.title||'').toLowerCase()===q||(x.ariaLabel||'').toLowerCase()===q)
            ||all.find(x=>(x.innerText||'').trim().toLowerCase()===q)
            ||all.find(x=>(x.innerText||'').toLowerCase().includes(q));
          b?.click(); return {{ok:!!b,label:b?.title||b?.ariaLabel||b?.innerText?.trim()}};
        }})()""")
        print(json.dumps(value, ensure_ascii=False, indent=2))
        return
    if a.click:
        value = evaluate(f"""(()=>{{const q={js(a.click)}.toLowerCase();
          const b=[...document.querySelectorAll('button')].find(x=>(x.title||'').toLowerCase().includes(q)||(x.innerText||'').trim().toLowerCase().includes(q));
          b?.click();return {{ok:!!b,label:b?.title||b?.innerText?.trim()}};}})()""")
        print(json.dumps(value, ensure_ascii=False, indent=2))
        return
    if a.hard_reload:
        print(json.dumps(evaluate("(()=>{const b=document.querySelector('button[title*=\"hard reload\"]');b?.click();return {ok:!!b}})()"), indent=2))
        return
    if a.full_reload:
        result = full_reload(timeout_s=max(15, a.timeout))
        print(json.dumps(result, ensure_ascii=False, indent=2))
        if not result.get('ok'):
            raise SystemExit(1)
        return
    if a.background:
        print(json.dumps(background_aurora(), ensure_ascii=False, indent=2))
        return
    if a.foreground:
        print(json.dumps(bring_to_front(aurora_page_target()), ensure_ascii=False, indent=2))
        return
    if a.cloud_stop:
        expr = f"import('/ui/components/shared/cloud-ask.js').then(m=>{{m.detenerCloud(null,{js(a.pane)});return {{ok:true,pane:{js(a.pane)}}};}})"
        print(json.dumps(evaluate(expr), ensure_ascii=False, indent=2))
        return
    if a.lyra_stop:
        value = evaluate("""(()=>{
          const button=[...document.querySelectorAll('.composer-send-btn--stop')]
            .find(node=>node.getClientRects().length);
          const before=!!button;
          button?.click();
          return {ok:before,via:'lyra_ui',title:button?.title||null};
        })()""")
        print(json.dumps(value, ensure_ascii=False, indent=2))
        if not value or not value.get('ok'):
            raise SystemExit(1)
        return
    if a.lyra_enter is not None:
        value = evaluate(f"""(async()=>{{
          const textarea=[...document.querySelectorAll('.composer-textarea')]
            .find(node=>node.getClientRects().length);
          if (!textarea) return {{ok:false,reason:'composer_missing'}};
          const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;
          setter.call(textarea,{js(a.lyra_enter)});
          textarea.dispatchEvent(new Event('input',{{bubbles:true}}));
          textarea.focus();
          await new Promise(resolve=>setTimeout(resolve,50));
          textarea.dispatchEvent(new KeyboardEvent('keydown',{{
            key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true,cancelable:true,composed:true
          }}));
          await new Promise(resolve=>setTimeout(resolve,100));
          const current=[...document.querySelectorAll('.composer-textarea')]
            .find(node=>node.getClientRects().length);
          return {{ok:true,remaining:current?.value||'',stop:!!document.querySelector('.composer-send-btn--stop')}};
        }})()""")
        print(json.dumps(value, ensure_ascii=False, indent=2))
        return
    if a.trace is not None:
        expr = f"(globalThis.__auroraCloudTrace||[]).filter(x=>!{js(a.pane)}||x.paneId==={js(a.pane)}).slice(-{a.trace})"
        print(json.dumps(evaluate(expr), ensure_ascii=False, indent=2))
        return
    if a.status:
        expr = """(()=>({
          title:document.title, hidden:document.hidden,
          cloudText:document.querySelector('.cloud-mini-header')?.innerText||null,
          holes:[...document.querySelectorAll('[data-llm-pane]')].map(e=>({id:e.dataset.llmPane,rect:e.getBoundingClientRect().toJSON()})),
          jobs:Object.values(globalThis.__solDebugJobs||{}).slice(-5)
        }))()"""
        print(json.dumps(evaluate(expr), ensure_ascii=False, indent=2))
        return
    if a.cloud_ask is not None:
        files = files_payload(a.file)
        images = [data_url(x) for x in a.image]
        _, job_id = start_cloud_job(a.cloud_ask, a.pane, int(a.timeout * 1000), files, images)
        result = poll_job(job_id, a.timeout, verbose=a.verbose)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        if result.get('state') != 'done' or result.get('result', {}).get('ok') is False:
            raise SystemExit(1)
    if a.lyra_send is not None:
        attachments = files_payload(a.file)
        for raw in a.image:
            path = pathlib.Path(raw)
            attachments.append({
                'name': path.name,
                'type': mimetypes.guess_type(path.name)[0] or 'image/png',
                'content': data_url(path),
            })
        _, job_id = start_lyra_job(a.lyra_send, int(a.timeout * 1000), attachments, expect_cancel=a.expect_cancel)
        result = poll_job(job_id, a.timeout, verbose=a.verbose)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        if result.get('state') != 'done' or result.get('result', {}).get('ok') is False:
            raise SystemExit(1)
    if a.chaos_web is not None:
        scenario = WEB_CHAOS[a.chaos_web]
        _, job_id = start_lyra_job(WEB_CHAOS_BOOTSTRAP + scenario['prompt'], int(a.timeout * 1000), [])
        result = poll_job(job_id, a.timeout, verbose=a.verbose)
        artifact = pathlib.Path(scenario['artifact'])
        content = artifact.read_text(encoding='utf-8', errors='replace') if artifact.exists() else ''
        final_text = str(result.get('result', {}).get('text', '')).strip()
        validation = {
            'exists': artifact.exists(),
            'bytes': artifact.stat().st_size if artifact.exists() else 0,
            'minSize': len(content) >= 3000,
            'markers': {marker: marker.lower() in content.lower() for marker in scenario['markers']},
            'finalToken': final_text == scenario['expected'],
        }
        validation['ok'] = validation['exists'] and validation['minSize'] and all(validation['markers'].values()) and validation['finalToken']
        result['scenario'] = a.chaos_web
        result['artifact'] = scenario['artifact']
        result['artifactValidation'] = validation
        print(json.dumps(result, ensure_ascii=False, indent=2))
        if result.get('state') != 'done' or result.get('result', {}).get('ok') is False or not validation['ok']:
            raise SystemExit(1)


if __name__ == '__main__':
    main()
