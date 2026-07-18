#!/usr/bin/env python3
"""CLI semántica para probar Aurora por CDP sin reescribir JavaScript.

Ejemplos:
  ./sol-debug.py --targets
  ./sol-debug.py --view lyra
  ./sol-debug.py --cloud-ask 'Respondé OK' --pane cloud --timeout 30
  ./sol-debug.py --new-chat --pane izq
  ./sol-debug.py --cloud-ask 'Leé el adjunto' --file /tmp/x.txt
  ./sol-debug.py --cloud-stop --pane cloud
  ./sol-debug.py --trace 20 --pane cloud
"""

import argparse
import base64
import json
import mimetypes
import pathlib
import os
import sqlite3
import subprocess
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
    'grok.com', 'perplexity.ai', 'www.perplexity.ai', 'copilot.microsoft.com', 'kimi.moonshot.cn',
    'poe.com', 'you.com', 'chat.qwen.ai',
)
ROOT = pathlib.Path(__file__).resolve().parents[2]
VENV_PYTHON = ROOT / '.venv-linux/bin/python'
DATABASE = ROOT / 'databases/aihub.db'

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


def navigate_target(item, url):
    """Navega un target ya creado (Helium puede bloquear /json/new a extensiones)."""
    ws = websocket.create_connection(item['webSocketDebuggerUrl'], timeout=5)
    try:
        response = call(ws, 'Page.navigate', {'url': url})
        if 'error' in response:
            raise RuntimeError(response['error'].get('message', str(response['error'])))
    finally:
        ws.close()
    return item


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
        if host in LLM_HOSTS:
            result.append(item)
    return result


def llm_relay_targets():
    """Targets conversacionales exactos; excluye analytics y subdominios auxiliares."""
    result = []
    for item in targets():
        if item.get('type') not in {'iframe', 'page'} or not item.get('webSocketDebuggerUrl'):
            continue
        try:
            host = urllib.parse.urlparse(item.get('url', '')).hostname or ''
        except ValueError:
            continue
        if host in LLM_HOSTS:
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


def close_context(item):
    """Cierra una página CDP sin depender de APIs HTTP no permitidas por Helium."""
    ws = websocket.create_connection(item['webSocketDebuggerUrl'], timeout=5)
    try:
        try:
            call(ws, 'Page.close')
        except (OSError, websocket.WebSocketException):
            pass
    finally:
        try:
            ws.close()
        except Exception:
            pass


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

    # La recarga no cierra las páginas chrome-extension:// ya abiertas. Dejarlas
    # vivas y abrir otra creaba dos shells, dos Aurora y dos iframes Cloud. Sólo
    # cerramos newtab.html (no el side panel) y luego creamos una única sesión.
    for item in targets():
        if item.get('type') == 'page' and item.get('url', '').startswith(extension_needle + 'newtab.html'):
            close_context(item)
    time.sleep(0.25)

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

    aurora_ids_before_open = {
        item.get('id') for item in targets()
        if AURORA in item.get('url', '') and item.get('webSocketDebuggerUrl')
    }
    page = open_target(EXTENSION_PAGE)
    # Helium a veces convierte una apertura CDP directa de chrome-extension://
    # en ERR_BLOCKED_BY_CLIENT. Navegar el target recién creado por Page.navigate
    # carga la misma URL correctamente y evita que --full-reload espere en vano.
    navigate_target(page, EXTENSION_PAGE)
    mount_deadline = time.monotonic() + min(timeout_s, 15)
    aurora = None
    while time.monotonic() < mount_deadline:
        aurora = next((item for item in targets() if
            AURORA in item.get('url', '')
            and item.get('id') not in aurora_ids_before_open
            and item.get('webSocketDebuggerUrl')
        ), None)
        if aurora:
            break
        time.sleep(0.2)
    if not aurora:
        raise RuntimeError('La nueva tab abrió, pero no montó su iframe Aurora')

    deadline = time.monotonic() + timeout_s
    clicked = False
    before_url = aurora.get('url', '')
    before_aurora_targets = {
        item.get('id'): item.get('url', '')
        for item in targets()
        if AURORA in item.get('url', '') and item.get('webSocketDebuggerUrl')
    }
    while time.monotonic() < deadline:
        try:
            result = evaluate(
                "(()=>{const b=document.querySelector('button[title*=\"hard reload\"]');b?.click();return {ok:!!b}})()",
                target_id=aurora.get('id'), timeout=5,
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
        changed = next((item for item in matches if
            item.get('id') not in before_aurora_targets
            or item.get('url', '') != before_aurora_targets.get(item.get('id'), '')
        ), None)
        if changed:
            remounted = True
            aurora = changed
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


def start_new_chat_job(pane, timeout_ms):
    """Navega el proveedor a un chat limpio y espera confirmación del relay."""
    job_id = 'sol-' + uuid.uuid4().hex[:12]
    expr = f"""
      (async()=>{{
        const id={js(job_id)};
        const jobs=globalThis.__solDebugJobs ||= {{}};
        const job=jobs[id]={{id,state:'starting',action:'new_chat',pane:{js(pane)},started:Date.now()}};
        try {{
          const {{nuevaConversacionCloud}}=await import('/ui/components/shared/cloud-ask.js');
          job.state='running';
          nuevaConversacionCloud(null,{js(pane)},{timeout_ms})
            .then(result=>Object.assign(job,{{state:'done',result,finished:Date.now()}}))
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


def start_lyra_local_job(prompt, timeout_ms):
    """Prueba el chatbox local Lyria → WebSocket → Pi RPC y sus eventos nativos."""
    job_id = 'sol-' + uuid.uuid4().hex[:12]
    config = js({'id': job_id, 'prompt': prompt, 'timeoutMs': timeout_ms})
    expr = f"""
      (()=>{{
        const cfg={config};
        const jobs=globalThis.__solDebugJobs ||= {{}};
        const job=jobs[cfg.id]={{id:cfg.id,state:'starting',via:'lyria_local_ui',started:Date.now()}};
        (async()=>{{
          const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
          const visible=node=>!!node?.getClientRects?.().length;
          const buttons=()=>[...document.querySelectorAll('button')];
          const finish=(state,result)=>Object.assign(job,{{state,result,finished:Date.now()}});
          try {{
            const lyra=buttons().find(node=>
              (node.title||node.ariaLabel||node.innerText||'').trim().toLowerCase()==='lyra');
            lyra?.click();

            let textarea=null;
            const mountDeadline=Date.now()+8000;
            while (Date.now()<mountDeadline && !textarea) {{
              textarea=[...document.querySelectorAll('.composer-textarea')].find(visible);
              if (!textarea) await sleep(100);
            }}
            if (!textarea) {{
              finish('error',{{ok:false,reason:'lyria_local_ui_not_ready',lyraButton:!!lyra}});
              return;
            }}

            // Este test jamás puede desviarse al proveedor Cloud. Si el pane
            // persistido estaba activo, lo cierra usando el control real.
            const cloudActive=buttons().find(node=>
              visible(node)&&(node.title||'').startsWith('Clic derecho: opciones'));
            if (cloudActive) {{
              cloudActive.click();
              const closeDeadline=Date.now()+5000;
              while (Date.now()<closeDeadline && buttons().some(node=>
                visible(node)&&(node.title||'').startsWith('Clic derecho: opciones'))) await sleep(80);
            }}

            const signals=await import('/ui/modules/lyra/scripts/chat/mensajes.js');
            const wsDebug=await import('/ui/components/shared/lyra-ws.js');
            if (signals.cargando.value) {{
              finish('error',{{ok:false,reason:'lyria_local_busy'}});
              return;
            }}
            wsDebug.clearPiEventTrace();
            const historyStart=signals.historial.value.length;
            textarea=[...document.querySelectorAll('.composer-textarea')].find(visible);
            const composerRoot=textarea?.closest('.chat-input-area')||document;
            const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;
            setter.call(textarea,cfg.prompt);
            textarea.dispatchEvent(new Event('input',{{bubbles:true}}));
            textarea.focus();
            await sleep(100);
            const send=[...composerRoot.querySelectorAll('.composer-send-btn:not(.composer-send-btn--stop)')]
              .find(visible);
            if (!send || send.disabled) {{
              finish('error',{{ok:false,reason:'lyria_local_send_unavailable',button:!!send,disabled:!!send?.disabled}});
              return;
            }}
            send.click();
            job.state='running';

            let sawGenerating=false, sawStopButton=false, sawNative=false;
            const deadline=Date.now()+cfg.timeoutMs;
            while (Date.now()<deadline) {{
              sawGenerating ||= !!signals.cargando.value;
              sawStopButton ||= !!document.querySelector('.composer-send-btn--stop');
              sawNative ||= wsDebug.getPiEventTrace(1).length>0;
              if (sawGenerating && !signals.cargando.value) {{
                await sleep(250);
                const trace=wsDebug.getPiEventTrace(300);
                const added=signals.historial.value.slice(historyStart);
                const answer=[...added].reverse().find(message=>message.role==='assistant'&&message._via!=='direct-ai');
                const text=String(answer?.content||'');
                const starts=trace.filter(item=>item.type==='tool_execution_start');
                const ends=trace.filter(item=>item.type==='tool_execution_end');
                const startIds=starts.map(item=>item.toolCallId).filter(Boolean);
                const endIds=ends.map(item=>item.toolCallId).filter(Boolean);
                const correlated=startIds.every(id=>endIds.includes(id));
                const protocolOk=trace.length>0&&trace.every(item=>item.protocolVersion===1&&item.runtime==='pi-rpc');
                const ok=!!text.trim()&&sawNative&&protocolOk&&correlated;
                finish('done',{{
                  ok, reason:ok?'lyria_local_complete':'lyria_local_contract_failed', text,
                  addedMessages:added.length,
                  native:{{protocolOk,eventCount:trace.length,types:[...new Set(trace.map(item=>item.type))],
                    toolStarts:starts,toolEnds:ends,correlated}},
                  ui:{{sawGenerating,sawStopButton,cloudClosed:!buttons().some(node=>
                    visible(node)&&(node.title||'').startsWith('Clic derecho: opciones'))}}
                }});
                return;
              }}
              await sleep(100);
            }}
            finish('error',{{ok:false,reason:'lyria_local_timeout',native:wsDebug.getPiEventTrace(300),
              ui:{{sawGenerating,sawStopButton,generating:!!signals.cargando.value}}}});
          }} catch(error) {{
            finish('error',{{ok:false,reason:'lyria_local_exception',error:String(error?.stack||error)}});
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


def run_contracts(timeout_s=60):
    """Ejecuta las suites contractuales con el entorno propio del proyecto."""
    if not VENV_PYTHON.exists():
        raise RuntimeError(f'No existe el intérprete del proyecto: {VENV_PYTHON}')
    env = {**os.environ, 'PYTHONPATH': str(ROOT / 'src')}
    commands = [
        ('json_family', [str(VENV_PYTHON), '-m', 'unittest', '-v', 'tests.test_json_family']),
        ('relay_adapters', ['node', 'tests/test-relay-adapters.mjs']),
        ('endpoint_registry', ['node', 'tests/test-endpoint-registry.mjs']),
        ('relay_reinjector', ['node', 'tests/test-relay-reinjector.mjs']),
        ('cloud_boundaries', ['node', 'tests/test-cloud-boundaries.mjs']),
        ('provider_purity', ['node', 'tests/test-provider-purity.mjs']),
        ('pi_turn_reducer', ['node', 'tests/test-pi-turn-reducer.mjs']),
        ('cloud_tool_visual', ['node', 'scripts/test-cloud-tool-text.mjs']),
    ]
    suites = []
    for name, command in commands:
        try:
            done = subprocess.run(
                command, cwd=ROOT, env=env, text=True, capture_output=True,
                timeout=max(5, timeout_s), check=False,
            )
            combined = (done.stdout + '\n' + done.stderr).strip().splitlines()
            suites.append({
                'name': name,
                'ok': done.returncode == 0,
                'exitCode': done.returncode,
                'summary': combined[-1] if combined else 'sin salida',
                'failureTail': combined[-12:] if done.returncode else [],
            })
        except subprocess.TimeoutExpired:
            suites.append({'name': name, 'ok': False, 'error': 'timeout'})
    return {
        'ok': all(item.get('ok') for item in suites),
        'python': str(VENV_PYTHON),
        'suites': suites,
    }


def relay_doctor():
    """Inventaría drivers, contexto y Endpoint Registry de cada superficie LLM."""
    relay_targets = llm_relay_targets()
    reports = []
    expression = """(()=>{
      const driver=globalThis.__auroraRelayV2?.findProvider?.(location);
      const observe=driver?.observe;
      const ds=document.documentElement.dataset;
      let composer=false,send=false,stop=false,assistants=null,users=null;
      try { composer=!!observe?.getInput?.(); } catch(_) {}
      try { send=!!observe?.getSendControl?.(); } catch(_) {}
      try { stop=!!observe?.isGenerating?.(); } catch(_) {}
      try { assistants=observe?.getAssistantTurns?.()?.length ?? null; } catch(_) {}
      try { users=observe?.getUserTurnCount?.() ?? null; } catch(_) {}
      let context=null;
      try { context=globalThis.__auroraRelaySurfaceContext?.()||null; } catch(_) {}
      return {
        host:location.hostname,driver:driver?.id||null,version:driver?.version||null,
        capabilities:driver?.capabilities||null,bootstrap:ds.auroraCloudRelayBootstrap||null,
        bootstrapDetail:ds.auroraCloudRelayBootstrapDetail||null,
        core:globalThis.__auroraRelayInstance?.driverId||null,
        capture:ds.auroraProviderRelay||null,captureDetail:ds.auroraProviderRelayDetail||null,
        context,endpointRegistry:ds.auroraEndpointRegistry||null,
        endpointRegistryDetail:ds.auroraEndpointRegistryDetail||null,
        endpointId:ds.auroraEndpointId||null,
        composer,send,stop,assistantTurns:assistants,userTurns:users,
      };
    })()"""
    for frame in relay_targets:
        try:
            detail = evaluate(expression, target_id=frame.get('id'), timeout=8) or {}
            # Una extensión recién recargada no reinjecta content scripts en tabs
            # antiguas hasta su próxima navegación. No son endpoints activos aún.
            if frame.get('type') == 'page' and detail.get('bootstrap') is None:
                continue
            architecture_ok = (
                detail.get('bootstrap') == 'ready'
                and detail.get('driver') == detail.get('core')
                and detail.get('capture') not in {'unsupported', 'error', None}
            )
            reports.append({
                'id': frame.get('id'), 'type': frame.get('type'), 'url': frame.get('url'),
                'ok': architecture_ok, 'ready': architecture_ok and detail.get('composer'),
                **detail,
            })
        except Exception as error:
            reports.append({'id': frame.get('id'), 'type': frame.get('type'), 'url': frame.get('url'), 'ok': False, 'error': str(error)})
    registry = {'ok': False, 'endpoints': [], 'error': 'Aurora Hub no disponible'}
    try:
        registry_response = evaluate("""new Promise(resolve => {
          chrome.runtime.sendMessage({type:'AURORA_ENDPOINT_LIST'}, response => {
            resolve(response || {ok:false,error:chrome.runtime.lastError?.message||'sin respuesta'});
          });
        })""", needle=EXTENSION_PAGE, timeout=8) or {}
        registry = registry_response
    except Exception as error:
        registry = {'ok': False, 'endpoints': [], 'error': str(error)}
    endpoints = registry.get('endpoints', [])
    active_ids = {
        item.get('endpointId') for item in endpoints
        if item.get('state') not in {'offline', 'unknown'}
    }
    for report in reports:
        endpoint = next((item for item in endpoints if
            (report.get('endpointId') and item.get('endpointId') == report.get('endpointId'))
            or str(item.get('conversationKey') or '').rstrip('/') == str(report.get('url') or '').rstrip('/')
        ), None)
        report['registryState'] = endpoint.get('state') if endpoint else None
        report['registered'] = bool(endpoint and endpoint.get('endpointId') in active_ids)
        architecture_ok = report.get('bootstrap') == 'ready' and report.get('driver') == report.get('core')
        if endpoint and endpoint.get('state') in {'frozen', 'offline', 'unknown'}:
            # Un mundo isolated anterior a chrome.runtime.reload() puede dejar
            # datasets de diagnóstico obsoletos. Para tabs suspendidas, el
            # Registry del service worker es la fuente autoritativa.
            report['ok'] = architecture_ok
            report['ready'] = False
            report['deferred'] = endpoint.get('state')
        elif report['registered']:
            report['ok'] = architecture_ok
            report['ready'] = architecture_ok and bool(report.get('composer'))
    return {
        'ok': bool(reports) and all(item.get('ok') for item in reports) and bool(registry.get('ok')),
        'frames': reports,
        'registry': registry,
    }


def relay_load(count, timeout_s=45):
    """Contrato de choque: N endpoints generating invocados/resueltos/liberados en paralelo."""
    count = max(10, int(count or 100))
    env = {**os.environ, 'AURORA_RELAY_LOAD_COUNT': str(count)}
    try:
        done = subprocess.run(
            ['node', 'tests/test-endpoint-registry.mjs'], cwd=ROOT, env=env,
            text=True, capture_output=True, timeout=max(10, timeout_s), check=False,
        )
    except subprocess.TimeoutExpired:
        return {'ok': False, 'sessions': count, 'error': 'timeout'}
    lines = (done.stdout + '\n' + done.stderr).strip().splitlines()
    return {
        'ok': done.returncode == 0,
        'sessions': count,
        'parallelInvocations': count,
        'state': 'generating',
        'exitCode': done.returncode,
        'summary': lines[-1] if lines else 'sin salida',
        'failureTail': lines[-20:] if done.returncode else [],
    }


def json_family_run(request_id):
    """Lee un run durable sin volcar base64 ni response_json completo."""
    if not DATABASE.exists():
        raise RuntimeError(f'No existe la base: {DATABASE}')
    db = sqlite3.connect(DATABASE)
    db.row_factory = sqlite3.Row
    try:
        row = db.execute(
            """SELECT usuario_id,request_id,status,created_at,updated_at,completed_at,
                      delivered_at,response_json FROM json_family_runs
               WHERE request_id=? ORDER BY updated_at DESC LIMIT 1""",
            (request_id,),
        ).fetchone()
    finally:
        db.close()
    if not row:
        return {'ok': False, 'requestId': request_id, 'error': 'not_found'}
    response = json.loads(row['response_json']) if row['response_json'] else {}
    entries = []
    for entry in response.get('entries') or []:
        call_data = entry.get('call') if isinstance(entry, dict) else None
        result = entry.get('result') if isinstance(entry, dict) else None
        entries.append({
            'kind': entry.get('kind') if isinstance(entry, dict) else None,
            'tool': call_data.get('tool') if isinstance(call_data, dict) else None,
            'isError': result.get('is_error') if isinstance(result, dict) else None,
            'isImage': result.get('is_image') if isinstance(result, dict) else None,
        })
    return {
        'ok': True, 'requestId': row['request_id'], 'userId': row['usuario_id'],
        'status': row['status'], 'createdAt': row['created_at'], 'updatedAt': row['updated_at'],
        'completedAt': row['completed_at'], 'acknowledged': bool(row['delivered_at']),
        'kind': response.get('kind'), 'origin': response.get('origin'), 'entries': entries,
    }


def main():
    p = argparse.ArgumentParser(description='Acciones semánticas de debug para Aurora/Helium CDP :9222')
    actions = p.add_mutually_exclusive_group(required=True)
    actions.add_argument('--targets', action='store_true', help='listar targets CDP')
    actions.add_argument('--contracts', action='store_true', help='ejecutar contratos Python/Node con .venv-linux')
    actions.add_argument('--relay-doctor', action='store_true', help='diagnosticar driver/core/capturador de todos los iframes')
    actions.add_argument('--relay-load', nargs='?', const=100, type=int, metavar='N', help='estresar N sesiones Relay concurrentes (mínimo 10)')
    actions.add_argument('--reinject-relays', action='store_true', help='reconectar couriers sin recargar ni detener proveedores')
    actions.add_argument('--json-family-run', metavar='REQUEST_ID', help='resumir un run durable sin volcar payloads grandes')
    actions.add_argument('--eval', metavar='JS', help='evaluar JavaScript en Aurora')
    actions.add_argument('--view', metavar='NOMBRE', help='abrir una vista por title/aria-label')
    actions.add_argument('--lyra-cloud', action='store_true', help='abrir Lyra y activar su Cloud Backend sin confundir la tab Cloud')
    actions.add_argument('--click', metavar='TEXTO', help='click en botón por texto o title')
    actions.add_argument('--hard-reload', action='store_true', help='pulsar ↺ de Aurora')
    actions.add_argument('--full-reload', action='store_true', help='recargar extensión + nueva tab + hard reload')
    actions.add_argument('--background', action='store_true', help='llevar Aurora a segundo plano')
    actions.add_argument('--foreground', action='store_true', help='traer Aurora al frente')
    actions.add_argument('--lyra-send', metavar='PROMPT', help='E2E por el chatbox nativo de Lyra Cloud')
    actions.add_argument('--lyra-local-send', metavar='PROMPT', help='E2E por chatbox Lyria local y Pi RPC nativo')
    actions.add_argument('--lyra-enter', metavar='PROMPT', help='escribir y pulsar Enter sin esperar resultado')
    actions.add_argument('--chaos-web', choices=tuple(WEB_CHAOS), help='escenario web complejo por Lyra Cloud')
    actions.add_argument('--cloud-ask', metavar='PROMPT', help='probar directamente el relay/iframe Cloud')
    actions.add_argument('--new-chat', action='store_true', help='abrir y confirmar un chat nativo nuevo')
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

    if a.contracts:
        result = run_contracts(a.timeout)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        if not result.get('ok'):
            raise SystemExit(1)
        return
    if a.relay_doctor:
        result = relay_doctor()
        print(json.dumps(result, ensure_ascii=False, indent=2))
        if not result.get('ok'):
            raise SystemExit(1)
        return
    if a.relay_load is not None:
        result = relay_load(a.relay_load, a.timeout)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        if not result.get('ok'):
            raise SystemExit(1)
        return
    if a.reinject_relays:
        result = evaluate("""new Promise(resolve => {
          chrome.runtime.sendMessage({type:'AURORA_RELAY_REINJECT',reason:'sol_debug'}, response => {
            resolve(response || {ok:false,error:chrome.runtime.lastError?.message||'sin respuesta'});
          });
        })""", needle=EXTENSION_PAGE, timeout=max(12, a.timeout))
        print(json.dumps(result, ensure_ascii=False, indent=2))
        if not result or not result.get('ok'):
            raise SystemExit(1)
        return
    if a.json_family_run:
        result = json_family_run(a.json_family_run)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        if not result.get('ok'):
            raise SystemExit(1)
        return
    if a.targets:
        for t in targets():
            print(t.get('type'), t.get('id'), t.get('url'))
        return
    if a.eval is not None:
        print(json.dumps(evaluate(a.eval, needle=a.target, target_id=a.target_id,
                                  timeout=max(12, a.timeout + 5)), ensure_ascii=False, indent=2))
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
    if a.lyra_cloud:
        value = evaluate("""(async()=>{
          const buttons=()=>[...document.querySelectorAll('button')];
          const lyra=buttons().find(x=>(x.title||x.ariaLabel||x.innerText||'').trim().toLowerCase()==='lyra');
          lyra?.click();
          await new Promise(resolve=>setTimeout(resolve,120));
          const toggle=buttons().find(x=>(x.title||'')==='Activar Cloud Backend');
          toggle?.click();
          const deadline=Date.now()+5000;
          while(Date.now()<deadline){
            const hole=document.querySelector('[data-llm-pane="cloud"]');
            const active=buttons().find(x=>(x.title||'').startsWith('Clic derecho: opciones'));
            if(hole&&active) return {ok:true,activated:!!toggle,rect:hole.getBoundingClientRect().toJSON()};
            await new Promise(resolve=>setTimeout(resolve,100));
          }
          return {ok:false,error:lyra?'Cloud Backend no montó':'tab Lyra no encontrada'};
        })()""", timeout=max(12, a.timeout))
        print(json.dumps(value, ensure_ascii=False, indent=2))
        if not value or not value.get('ok'):
            raise SystemExit(1)
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
          const selectors='button,[role="button"],summary,a,.cursor-pointer';
          const nodes=[...document.querySelectorAll(selectors)].filter(x=>x.offsetParent!==null);
          const label=x=>(x.title||x.getAttribute('aria-label')||x.innerText||x.textContent||'').trim();
          const b=nodes.find(x=>label(x).toLowerCase()===q)||nodes.find(x=>label(x).toLowerCase().includes(q));
          b?.click();return {{ok:!!b,label:b?label(b):null,tag:b?.tagName||null}};}})()""")
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
    if a.new_chat:
        _, job_id = start_new_chat_job(a.pane, int(a.timeout * 1000))
        result = poll_job(job_id, a.timeout, verbose=a.verbose)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        if result.get('state') != 'done' or result.get('result', {}).get('ok') is False:
            raise SystemExit(1)
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
    if a.lyra_local_send is not None:
        _, job_id = start_lyra_local_job(a.lyra_local_send, int(a.timeout * 1000))
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
