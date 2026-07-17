// cloud-relay.js — corre DENTRO del iframe del LLM cloud (all_frames).
// Puente Lyra ↔ AI: recibe AURORA_CLOUD_ASK del padre (la UI de Aurora),
// inyecta el prompt, envía, y detecta la respuesta del asistente leyendo el
// DOM. Devuelve AURORA_CLOUD_CHUNK (streaming) y AURORA_CLOUD_ANSWER (final).
//
// Port fiel de los mods legacy de AI-Hub (detectar-input + inyectar +
// orquestador-estados + bridge). Protocolo renombrado GEMITA_ → AURORA_CLOUD_.
// Solo reporta desde el frame montado por Aurora (mismo gate que el sniffer).
(() => {
  if (window.top === window) return;
  const padre = location.ancestorOrigins?.[0] || '';
  if (!/^chrome-extension:|^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(padre)) return;
  const RELAY_BUILD = '2026-07-15.1-chatgpt-stop-gate';
  if (globalThis.__auroraCloudRelayActive) return;
  globalThis.__auroraCloudRelayActive = RELAY_BUILD;

  // Traza circular observable por CDP. Permite distinguir "Gemini lento" de
  // "relay bloqueado" sin inundar console ni afectar el streaming.
  const cloudTrace = window.__auroraCloudTrace = [];
  const trace = (fase, detail = {}) => {
    const entry = { ts: Date.now(), fase, ...detail };
    cloudTrace.push(entry);
    if (cloudTrace.length > 200) cloudTrace.splice(0, cloudTrace.length - 200);
    try { window.parent.postMessage({ type: 'AURORA_CLOUD_STATUS', entry }, '*'); } catch (_) {}
  };
  trace('relay_loaded', { relayBuild: RELAY_BUILD, host: location.hostname });

  // ── detectar input / botón enviar ──────────────────────
  const INPUT_SELECTORS = [
    '#prompt-textarea',
    'div[contenteditable="true"].ql-editor',
    'div[contenteditable="true"][aria-label]',
    'div[contenteditable="true"][data-testid]',
    'div[contenteditable="true"][role="textbox"]',
    'div[contenteditable="true"]',
    'textarea[placeholder]',
    'textarea[aria-label*="chat" i]',
    'textarea[aria-label*="message" i]',
    'rich-textarea',
  ];
  const SEND_SELECTORS = [
    'button[data-testid="send-button"]',
    'button[aria-label*="Send" i]',
    'button[aria-label*="Enviar" i]',
    'form button[type="submit"]',
    'button[title*="send" i]',
  ];
  // Contenedores de UN turno del asistente (uno por respuesta). Contamos
  // estos para enganchar al nuevo; el texto sale del .markdown/.prose interno.
  const CONTAINER_SELECTORS = [
    'model-response',                                // Gemini
    '[data-message-author-role="assistant"]',        // ChatGPT
    '[data-testid="conversation-turn-assistant"]',   // ChatGPT alt
    '.font-claude-message',                          // Claude
    'message-content',                              // genérico
  ];
  // Nodos que pueden tener el texto de la respuesta. CLAVE: mientras Gemini
  // GENERA, el texto en vivo vive en `.pending` (o similar) y `.markdown`
  // queda vacío; al terminar lo mueve a `.markdown`. Por eso leemos el nodo
  // con MÁS texto entre estos — así capturamos el stream en tiempo real y el
  // final, sin arrastrar labels de accesibilidad del wrapper externo.
  // SOLO nodos ajustados de contenido: .markdown (final), .pending (stream),
  // .prose (Claude/ChatGPT). Los wrappers (.model-response-text,
  // .message-content) incluyen labels de accesibilidad tipo "Gemini dijo" y
  // ganaban el max-text → arrastraban el prefijo. Excluidos a propósito.
  const TEXTO_SELS = ['.markdown', '.pending', '.prose'];
  // Señal de "terminó" propia del sitio (mucho más fiable que heurística):
  // Gemini marca .response-footer.complete al cerrar el turno.
  const COMPLETO_SELECTORS = '.response-footer.complete, footer.complete, [class*="footer"].complete';
  const STOP_BUTTON_SELECTOR = [
    'button[aria-label*="Stop" i]',
    'button[aria-label*="Detener" i]',
    'button[data-testid*="stop" i]',
  ].join(', ');
  const STOP_ACTIVITY_SELECTORS = ['.animate-pulse', '.loading-indicator', '.loading-dot'];
  const esChatGPTHost = /chatgpt\.com|chat\.openai\.com/.test(location.hostname);

  const getInput = () => INPUT_SELECTORS.map(s => document.querySelector(s)).find(Boolean) || null;
  const getSend  = () => SEND_SELECTORS.map(s => document.querySelector(s)).find(b => b && b.offsetParent !== null) || null;
  const getStopButton = (root = document) => {
    const b = root?.querySelector?.(STOP_BUTTON_SELECTOR) || null;
    if (!b || !b.isConnected || b.hidden || b.getAttribute?.('aria-hidden') === 'true') return null;
    // offsetParent puede ser null en el iframe en segundo plano: el selector del
    // botón real es suficientemente específico para conservar la señal Stop.
    return b;
  };
  const getStop = () => {
    const boton = getStopButton();
    // En ChatGPT no aceptar pulsos/loading genéricos: pueden pertenecer a otros
    // componentes y mantener falsamente el turno en estado "generando".
    if (boton || esChatGPTHost) return boton;
    return STOP_ACTIVITY_SELECTORS.map(s => document.querySelector(s))
      .find(b => b && b.offsetParent !== null) || null;
  };

  // Imágenes GENERADAS por el proveedor (ej. DALL·E). NO viven dentro del turno
  // assistant sino en su propio contenedor (ChatGPT: [class*=imagegen]). Las
  // buscamos globalmente; las grandes y ya cargadas son las generadas.
  const SEL_IMGGEN = '[class*="imagegen"] img, [data-testid*="image"] img, .group\\/imagegen-image img';
  // srcs de imágenes generadas ya listas (completas, grandes).
  const imgsGeneradas = () => [...document.querySelectorAll(SEL_IMGGEN)]
    .filter(i => (i.naturalWidth || i.width || 0) > 200 && i.complete)
    .map(i => i.src).filter(s => s && !s.startsWith('data:'));
  // TODOS los srcs de imagegen presentes (completos o no) — para snapshot del
  // baseline y así detectar cuáles son NUEVAS este turno.
  const imgSrcsPresentes = () => [...document.querySelectorAll(SEL_IMGGEN)]
    .map(i => i.src).filter(s => s && !s.startsWith('data:'));

  // ChatGPT está GENERANDO una imagen: existe un contenedor imagegen pero la
  // imagen final todavía no está lista (preview/render en curso). No cerrar el
  // turno hasta que termine, o capturaríamos solo el texto preámbulo (bug).
  const imagenPendiente = () =>
    !!document.querySelector('[class*="imagegen"], [class*="image-gen"]') && imgsGeneradas().length === 0;

  // Sentinel de "trabajando": mientras el LLM piensa/busca y aún no hay
  // respuesta real, emitimos este marcador; Aurora lo reemplaza por un
  // indicador animado bonito (no mostramos el status crudo del proveedor).
  const WORKING = 'AURORA_WORKING';

  function injectText(el, text) {
    el.focus();
    if (el.getAttribute('contenteditable') === 'true') {
      document.execCommand('selectAll', false, null);
      const ok = document.execCommand('insertText', false, text);
      if (!ok || !el.innerText?.trim()) {
        el.innerText = text;
        el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
      }
    } else {
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      try { setter ? setter.call(el, text) : (el.value = text); } catch { el.value = text; }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  const textoInput = el => (el ? (el.innerText ?? el.value ?? '') : '').trim();

  // Botón enviar SIN exigir visibilidad: en un iframe en segundo plano
  // offsetParent es null aunque el botón exista → getSend() (que exige visible)
  // devolvía null y el submit caía a Enter, que a veces no manda. Para enviar
  // sí aceptamos el botón oculto (el selector es específico de cada sitio).
  const esBotonStop = b => {
    if (!b) return false;
    const marca = `${b.getAttribute?.('aria-label') || ''} ${b.getAttribute?.('data-testid') || ''} ${b.title || ''}`;
    return /stop|detener/i.test(marca) || STOP_BUTTON_SELECTOR.split(',').some(s => { try { return b.matches?.(s.trim()); } catch { return false; } });
  };
  const getSendAny = () => SEND_SELECTORS.map(s => document.querySelector(s))
    .find(b => b && !b.disabled && !esBotonStop(b)) || null;

  function dispararEnter(el) {
    for (const type of ['keydown', 'keyup']) {
      el.dispatchEvent(new KeyboardEvent(type, {
        key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true, composed: true,
      }));
    }
  }

  // Envío VERIFICADO: reintenta (botón → Enter) hasta que el input se vacíe
  // (el sitio lo limpia al mandar). Sin esto, en segundo plano el prompt
  // quedaba escrito pero sin enviar ("se queda en espera"). Instantáneo: el
  // primer intento sale ya; los reintentos sólo si no se envió.
  async function enviarVerificado(el, largoPrompt, cancelToken, userCountBefore = 0) {
    const esChatGPT = /chatgpt\.com|chat\.openai\.com/.test(location.hostname);
    const userCount = () => /gemini\.google\.com/.test(location.hostname)
      ? document.querySelectorAll('user-query').length
      : document.querySelectorAll('[data-message-author-role="user"]').length;
    // Señal FIABLE de "enviado": apareció un turno de usuario nuevo. inputVacio()
    // no sirve (ChatGPT no siempre limpia el composer al instante) y llevaba al
    // retry a reintentar/`Enter` MIENTRAS ChatGPT ya respondía → cancelaba o
    // reenviaba el turno ("la respuesta se dibuja y desaparece"). Con getStop
    // como respaldo (ChatGPT ya generando = aceptado).
    const enviado = () => userCount() > userCountBefore || (esChatGPT && getStop());
    const esperarCambio = (ms = 500) => new Promise(resolve => {
      let done = false;
      const finish = () => { if (done) return; done = true; obs.disconnect(); clearTimeout(to); resolve(); };
      const obs = new MutationObserver(finish);
      obs.observe(document.body, { childList: true, subtree: true, attributes: true });
      const to = setTimeout(finish, ms);
    });
    // Después de una respuesta con bloque JSON, Gemini puede conservar el
    // composer bloqueado bastante más de 12s mientras cierra el toolbar. El
    // loop sigue verificando que el mensaje realmente se vacíe: ampliar este
    // margen no declara falsos positivos ni reenvía un turno ya aceptado.
    const deadline = Date.now() + 30000;
    let intento = 0;
    while (Date.now() < deadline) {
      if (cancelToken?.cancelled) return false;
      // Gemini puede abrir Canvas para redactar código. El composer sigue en
      // el DOM pero queda inutilizable detrás del panel inmersivo; cerrarlo no
      // borra la respuesta y permite entregar feedback/tool result.
      const cerrarCanvas = [...document.querySelectorAll('button')].find(b =>
        b.offsetParent !== null && /cerrar panel|close panel/i.test(b.getAttribute('aria-label') || ''));
      if (cerrarCanvas) { cerrarCanvas.click(); await esperarCambio(250); }
      // ChatGPT cambia el submit genérico por Stop antes de limpiar siempre el
      // contenteditable. Esa transición YA demuestra que aceptó el envío. Sin
      // este guard, el retry encontraba `form button[type=submit]` convertido
      // en Stop y cortaba la respuesta tras 2–3 caracteres.
      if (intento > 0 && (enviado() || (esChatGPT && getStop()))) return true;
      const input = getInput() || el;
      try { input.focus(); } catch (_) {}
      // GUARD DURO: si ya se envió (turno de usuario nuevo) o ChatGPT ya está
      // generando, NUNCA re-clickear ni re-`Enter` — un segundo disparo durante
      // la generación cancela/reenvía y borra la respuesta a medio dibujar.
      if (enviado() || (esChatGPT && getStop())) return true;
      const btn = getSendAny();
      if (btn) btn.click(); else dispararEnter(input);
      await esperarCambio(intento++ === 0 ? 180 : 500);
      if (cancelToken?.cancelled) return false;
      if (enviado() || (esChatGPT && getStop())) return true;
    }
    return false;
  }

  // ── DOM → markdown (port fiel del orquestador legacy) ───
  function domToMarkdown(root) {
    if (!root) return '';
    const out = [];
    function walk(node) {
      if (node.nodeType === Node.TEXT_NODE) { out.push(node.textContent); return; }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const tag = node.tagName.toLowerCase();
      if (tag === 'button' || tag === 'script' || tag === 'style' || node.getAttribute('aria-hidden') === 'true') return;
      if (tag === 'pre') {
        const code = node.querySelector('code'); const target = code || node;
        const m = (target.className || '').match(/language-([\w+#-]+)/i);
        const txt = (target.innerText || target.textContent || '').replace(/\n+$/, '');
        out.push('\n\n```' + (m ? m[1] : '') + '\n' + txt + '\n```\n\n'); return;
      }
      if (tag === 'code') { out.push('`' + (node.innerText || node.textContent || '') + '`'); return; }
      const h = { h1: '\n\n# ', h2: '\n\n## ', h3: '\n\n### ', h4: '\n\n#### ', h5: '\n\n##### ', h6: '\n\n###### ' }[tag];
      if (h) { out.push(h); node.childNodes.forEach(walk); out.push('\n\n'); return; }
      if (tag === 'p' || tag === 'div') { node.childNodes.forEach(walk); out.push('\n\n'); return; }
      if (tag === 'br') { out.push('\n'); return; }
      if (tag === 'hr') { out.push('\n\n---\n\n'); return; }
      if (tag === 'strong' || tag === 'b') { out.push('**'); node.childNodes.forEach(walk); out.push('**'); return; }
      if (tag === 'em' || tag === 'i') { out.push('*'); node.childNodes.forEach(walk); out.push('*'); return; }
      if (tag === 'a') { out.push('['); node.childNodes.forEach(walk); out.push('](' + (node.getAttribute('href') || '') + ')'); return; }
      if (tag === 'ul' || tag === 'ol') {
        out.push('\n'); const ordered = tag === 'ol'; let i = 1;
        for (const li of node.children) {
          if (li.tagName?.toLowerCase() !== 'li') continue;
          out.push(ordered ? `${i}. ` : '- ');
          // ChatGPT envuelve cada item como <li>\n<p>texto</p>\n</li>.
          // Recorrer el <p> con la regla genérica agrega saltos antes del texto y
          // produce markdown roto (`-\ntexto`), que Lyra interpreta como párrafos
          // separados. Ignorar whitespace estructural y desenvolver p/div mantiene
          // el marcador y su contenido en la misma línea: `- texto`.
          for (const child of li.childNodes) {
            if (child.nodeType === Node.TEXT_NODE && !child.textContent?.trim()) continue;
            const childTag = child.nodeType === Node.ELEMENT_NODE
              ? child.tagName.toLowerCase() : '';
            if (childTag === 'p' || childTag === 'div') child.childNodes.forEach(walk);
            else walk(child);
          }
          out.push('\n'); i++;
        }
        out.push('\n'); return;
      }
      node.childNodes.forEach(walk);
    }
    walk(root);
    return out.join('').replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n').trim();
  }

  // Contenedores de turno (del primer selector que matchee). Contar-y-enganchar
  // al NUEVO es robusto: el mensaje anterior ya está en el DOM y confundía.
  function contenedores() {
    for (const sel of CONTAINER_SELECTORS) {
      const els = document.querySelectorAll(sel);
      if (els.length) return [...els];
    }
    return [];
  }
  // El nodo con MÁS texto entre los candidatos (durante el stream gana
  // `.pending`, al final `.markdown`). Si ninguno matchea, el contenedor.
  const nodoTexto = c => {
    let best = null, bl = -1;
    for (const s of TEXTO_SELS) {
      for (const n of c.querySelectorAll(s)) {
        const t = (n.innerText || '').length;
        if (t > bl) { bl = t; best = n; }
      }
    }
    return best || c;
  };
  const textOf = c => (nodoTexto(c)?.innerText || '').trim();
  const idContainer = c => c?.getAttribute?.('data-message-id') || c?.getAttribute?.('data-turn-id') || '';
  const estaCompleto = c => !!c.querySelector(COMPLETO_SELECTORS);
  const norm = t => (t || '').replace(/\s+/g, ' ').trim();
  const generando = () => {
    if (getStop()) return true;
    return [...document.querySelectorAll('mat-progress-spinner, .loading-dot, .pulse-indicator')].some(e => e.offsetParent !== null);
  };

  // Fase 1: esperar a que aparezca el contenedor NUEVO (count sube), o que el
  // último cambie de contenido si el sitio REUSA el nodo (raro). NO usar
  // generando() acá: al enviar, el botón "Detener" aparece al instante y
  // haría enganchar el mensaje VIEJO (el nuevo turno tarda ~4.5s en existir).
  // Ese era el bug de "captura el anterior".
  async function esperarTarget(base, deadline, cancelToken) {
    const inicioEspera = Date.now();
    while (Date.now() < deadline) {
      if (cancelToken?.cancelled) return null;
      // Respuesta SOLO-imagen: ChatGPT NO crea contenedor de turno de texto para
      // una imagen generada — solo el contenedor imagegen. Si aparece una imagen
      // NUEVA (no en el baseline), está lista y ya no genera (sin Stop), la
      // devolvemos como respuesta de imagen. (Verificado: turnos=0 en image-gen.)
      if (/chatgpt\.com|chat\.openai\.com/.test(location.hostname) && !getStop() && Date.now() - inicioEspera > 3000) {
        const nuevas = imgsGeneradas().filter(s => !base.imgBase?.has(s));
        if (nuevas.length) return { imageOnly: true, imgSrcs: nuevas };
      }
      const cs = contenedores();
      // ChatGPT: anclar la respuesta al mensaje de USUARIO que acabamos de
      // enviar. La virtualización puede insertar asistentes viejos con IDs
      // nuevos para nuestro baseline, pero ninguno de ellos está después del
      // nuevo user turn. Esta relación DOM elimina el desfase de un turno que
      // aparecía especialmente al crear un hilo desde Lyra Cloud.
      if (/chatgpt\.com|chat\.openai\.com/.test(location.hostname)) {
        const usuariosNuevos = [...document.querySelectorAll('[data-message-author-role="user"]')]
          .filter(u => u.dataset.messageId && !base.userIds?.has(u.dataset.messageId));
        const user = usuariosNuevos.at(-1);
        if (user) {
          const posteriores = cs.filter(c => user.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING);
          if (posteriores.length) return posteriores.at(-1);
        }
      }
      // ChatGPT re-renderiza mensajes anteriores y cambia sus referencias DOM.
      // data-message-id permanece estable: elegir el ÚLTIMO id realmente nuevo.
      const porId = cs.filter(c => idContainer(c) && !base.ids.has(idContainer(c)));
      if (porId.length) {
        // No esperar con setTimeout dentro de un iframe oculto: Chromium puede
        // convertir 900ms en minutos. El ancla de user turn de arriba resuelve
        // el caso moderno; para el fallback por ID tomamos el último nodo nuevo
        // y `seguirTarget` ya migra si aparece otro más reciente.
        return porId.at(-1);
      }
      // Sitios sin id estable (Gemini): un turno nuevo normalmente aumenta el
      // conteo. Elegir el último evita enganchar un nodo viejo re-renderizado.
      if (cs.length > base.count) return cs.at(-1);
      // Gemini también puede reemplazar el contenedor manteniendo conteo y
      // texto idénticos (por ejemplo, repite la misma tool). La referencia DOM
      // nueva demuestra que hubo turno aunque el contenido no haya cambiado.
      const lastPorRef = cs.at(-1);
      if (lastPorRef && !base.prev.has(lastPorRef)) return lastPorRef;
      // Sitio que reutiliza/reemplaza el último nodo sin aumentar el conteo.
      const last = cs.at(-1);
      if (last && norm(textOf(last)) && norm(textOf(last)) !== base.lastText) return last;
      // Esperar una mutación real, no un timer de polling. En iframes Cloud
      // opacos Chromium puede estirar 200ms durante minutos; el DOM del turno
      // sí muta aunque el panel esté detrás de otra vista.
      await new Promise(resolve => {
        let done = false;
        const finish = () => { if (done) return; done = true; obs.disconnect(); clearTimeout(fallback); resolve(); };
        const obs = new MutationObserver(finish);
        obs.observe(document.body, { childList: true, subtree: true, characterData: true });
        const fallback = setTimeout(finish, 1000);
      });
    }
    return null;
  }

  // Head-start ÚNICO al inicio: esperamos INICIO_DELAY ms tras enviar antes de
  // empezar a copiar. En ese lapso el LLM ya generó algo de texto, así no
  // arrancamos leyendo vacío ni un token a medio pintar. La captura queda
  // corrida ~INICIO_DELAY respecto a la generación (gen 5s → captura ~5.75s).
  const INICIO_DELAY = 300;

  // Fase 2: seguir el target con MutationObserver → streaming en tiempo real.
  // Timers: respondeMs (primer texto capturado - submit) y generaMs (última
  // captura - submit ≈ generación + head-start).
  function seguirTarget(target, { base, onChunk, cancelToken, timeoutMs, submitAt }) {
    return new Promise(resolve => {
      let current = target;
      const start = Date.now();
      let lastText = '', lastMd = '', lastChange = Date.now();
      let settle = null, hecho = false, capturando = false;
      let respondeMs = null, ultimaCaptura = submitAt;
      let siteObs = null, vioGenerando = false;
      let ultimoMd = 0;
      const perfAudit = {
        leerCalls: 0, targetScans: 0, siteObsCallbacks: 0, stopTransitions: 0,
        markdownCalls: 0, markdownMs: 0, markdownMaxMs: 0,
      };
      const markdownMedido = root => {
        const inicio = performance.now();
        const md = domToMarkdown(root);
        const costo = performance.now() - inicio;
        perfAudit.markdownCalls++;
        perfAudit.markdownMs += costo;
        perfAudit.markdownMaxMs = Math.max(perfAudit.markdownMaxMs, costo);
        return md;
      };
      const MD_MS = 350;   // throttle del armado de markdown durante el stream
      const esChatGPT = esChatGPTHost;
      const ocultoSinShim = () => document.hidden &&
        document.documentElement.dataset.auroraVisibilityShim !== 'active';

      // Durante el streaming SOLO leemos innerText (nativo, O(n) barato) para
      // detectar cambios y streamear preview. NADA de domToMarkdown acá: caminar
      // el árbol DOM completo en cada mutación es O(n²) y en respuestas grandes
      // (un write de 20KB) pinea/crashea el proceso del renderer (compartido con
      // Aurora si no hay site-isolation). El markdown fiel se arma UNA vez al
      // terminar.
      const leer = () => {
        if (!capturando) return;   // todavía en el head-start
        perfAudit.leerCalls++;
        let t = norm(textOf(current));
        const placeholder = /^(thinking|reasoning|pensando|razonando)\.?$/i.test(t);
        perfAudit.targetScans++;
        const containers = contenedores();
        const latest = containers.at(-1);
        const latestId = idContainer(latest);
        const currentId = idContainer(current);
        // ChatGPT puede insertar primero el turno anterior virtualizado y
        // crear la respuesta actual después. Migrar siempre al último ID nuevo
        // respecto del baseline, aunque el target viejo ya tenga texto válido.
        const hayTurnoMasNuevo = latest && latest !== current && latestId &&
          !base?.ids?.has(latestId) && latestId !== currentId;
        // Gemini no expone IDs estables. En algunos cierres crea primero un
        // model-response parcial y luego otro definitivo; si el conteo supera
        // el baseline, el último contenedor es siempre el turno más reciente.
        const hayTurnoMasNuevoSinId = latest && latest !== current && !latestId &&
          containers.length > (base?.count || 0);
        // ChatGPT reemplaza el contenedor provisional "Thinking" por otro nodo
        // con el mensaje final. Seguir el último turno y mover el observer.
        if (!current?.isConnected || placeholder || hayTurnoMasNuevo || hayTurnoMasNuevoSinId) {
          const latestText = latest ? norm(textOf(latest)) : '';
          if (latest && latest !== current && latestText && !/^(thinking|reasoning|pensando|razonando)\.?$/i.test(latestText)) {
            current = latest;
            try { obs.observe(current, { childList: true, subtree: true, characterData: true }); } catch (_) {}
            t = latestText;
          }
        }
        // Progreso EN VIVO: si aún no hay respuesta real (vacío o placeholder
        // "Thinking"/"Analyzing image"), mostrar la ACTIVIDAD de ChatGPT
        // (Searching en.wikipedia.org, Analyzing image, Reading…) como línea de
        // estado en cursiva, hasta que aparezca el texto real.
        const sinRespuesta = !t || /^(thinking|reasoning|pensando|razonando|analyzing image|analizando)\.?$/i.test(t);
        // Aún pensando/buscando (placeholder o vacío): NO streamear nada como
        // contenido. Aurora muestra su propio indicador animado (cloud-activity)
        // mientras tanto; el texto real fluye recién cuando aparece.
        if (esChatGPT && sinRespuesta) return;
        if (t === lastText) return;
        // Durante el "Pensando"/búsqueda de ChatGPT, el target inicial puede ser
        // el turno ANTERIOR re-renderizado: no streamear su texto como preview
        // (se veía la respuesta vieja mientras ChatGPT aún pensaba). Esperar a
        // que aparezca texto DISTINTO del último turno del baseline; el observer
        // migra al contenedor real y ahí sí fluye.
        if (base?.lastText && t === base.lastText) return;
        lastText = t; lastChange = Date.now(); ultimaCaptura = Date.now();
        if (respondeMs === null && t) respondeMs = Date.now() - submitAt;
        // Markdown formateado DURANTE el stream, pero THROTTLED: domToMarkdown es
        // O(n) y llamarlo en cada mutación era O(n²) (pineaba el renderer). Cada
        // MD_MS armamos el markdown (headings, listas, negritas); entre medio no
        // hacemos nada. El cierre (terminar) arma el markdown final una vez más.
        const ahora = Date.now();
        if (ahora - ultimoMd >= MD_MS) {
          ultimoMd = ahora;
          const md = markdownMedido(nodoTexto(current));
          onChunk?.(md || t);
        }
      };

      const terminar = (reason) => {
        if (hecho) return; hecho = true;
        obs.disconnect(); siteObs?.disconnect(); clearInterval(poll); clearTimeout(settle); clearTimeout(arranque);
        document.removeEventListener('visibilitychange', onVisibility);
        capturando = true; leer();   // lectura final de texto
        const esPlaceholder = /^(thinking|reasoning|pensando|razonando|json|code)\.?$/i.test(lastText);
        // domToMarkdown UNA sola vez (fiel: bloques de código, listas, etc.).
        lastMd = markdownMedido(nodoTexto(current));
        // Imágenes de la respuesta: las del turno (raras) + las generadas
        // NUEVAS este turno (DALL·E). CLAVE: filtrar las generadas contra el
        // baseline (imgBase) — si no, un turno de texto (ej. redflag "no puedo")
        // adjuntaba TODAS las imágenes viejas del hilo.
        const imgSrcs = [...new Set([
          ...[...current.querySelectorAll('img')]
            .filter(i => (i.naturalWidth || i.width || 0) > 200 && !/avatar|icon|emoji/i.test(i.className || ''))
            .map(i => i.src),
          ...imgsGeneradas().filter(s => !base?.imgBase?.has(s)),
        ])].filter(s => s && !s.startsWith('data:'));
        trace('perf_summary', {
          reason,
          elapsedMs: Date.now() - start,
          leerCalls: perfAudit.leerCalls,
          targetScans: perfAudit.targetScans,
          siteObsCallbacks: perfAudit.siteObsCallbacks,
          stopTransitions: perfAudit.stopTransitions,
          markdownCalls: perfAudit.markdownCalls,
          markdownMs: Math.round(perfAudit.markdownMs * 10) / 10,
          markdownMaxMs: Math.round(perfAudit.markdownMaxMs * 10) / 10,
        });
        resolve({
          // Una cancelación nunca es una respuesta exitosa, aunque ya exista
          // texto parcial. Una respuesta SOLO-imagen (sin texto) igual es válida.
          ok: reason !== 'cancelled' && reason !== 'timeout' && ((!!lastText && !esPlaceholder) || imgSrcs.length > 0),
          text: esPlaceholder && !imgSrcs.length
            ? `Error: ${lastText} no produjo una respuesta antes del timeout.`
            : (lastMd || lastText || (imgSrcs.length ? '' : '(sin respuesta detectada)')),
          reason,
          respondeMs: respondeMs ?? (Date.now() - submitAt),
          generaMs: ultimaCaptura - submitAt,
          imgSrcs,
        });
      };

      // Arranque de captura tras el head-start único. Una microtarea de
      // respaldo evita depender exclusivamente de timers del iframe oculto:
      // ChatGPT puede materializar toda la respuesta de razonamiento de golpe
      // cuando Stop ya desapareció.
      const arranque = setTimeout(() => { capturando = true; leer(); }, INICIO_DELAY);

      // Supervisor de fin: ESTABILIDAD DE TEXTO. Verificado por CDP que en
      // Gemini el botón "Detener respuesta" queda presente aunque NO esté
      // generando (persiste 40s+ idle) y el footer .complete casi nunca
      // aparece — ambas señales inútiles. Lo único fiable: el texto deja de
      // crecer. Durante un conteo cambia cada ~50ms; al terminar se queda
      // quieto. idle > FIN_IDLE sin cambios = terminó.
      // ChatGPT puede pausar varios segundos después del primer carácter
      // (observado: "A" → pausa → respuesta completa del adjunto). Gemini
      // streamea de forma continua y conserva el cierre rápido.
      const FIN_IDLE = esChatGPT ? 8000 : 8000;
      const chequearFin = () => {
        if (!capturando || !lastText) return;
        // Algunos proveedores detienen el render de tokens al ocultarse. Un
        // fragmento congelado no es una respuesta estable: esperar a que el
        // documento vuelva a estar visible o al timeout explícito.
        if (ocultoSinShim()) return;
        if (/^(thinking|reasoning|pensando|razonando)\.?$/i.test(lastText)) return;
        // En ChatGPT, el nodo virtualizado del turno anterior puede aparecer
        // varios segundos antes que la respuesta nueva. No declarar estable
        // ese señuelo antes de darle tiempo al ID actual para materializarse.
        const minimo = /chatgpt\.com|chat\.openai\.com/.test(location.hostname) ? 12000 : 12000;
        if (Date.now() - submitAt < minimo) return;
        // ChatGPT: mientras el botón Stop siga presente, sigue generando (su
        // Stop es FIABLE, a diferencia de Gemini). NO declarar 'estable' sobre
        // texto viejo idle mientras ChatGPT todavía piensa/busca — era el bug:
        // enganchaba el turno anterior (idle) y cerraba a los ~20s con la
        // respuesta VIEJA aunque ChatGPT seguía buscando. Dejar que el observer
        // migre al contenedor real cuando aparezca; sólo cerrar por idle cuando
        // Stop ya no está. (Gemini mantiene Stop 40s+ idle → sigue por texto.)
        if (esChatGPT && getStop()) return;
        if (Date.now() - lastChange > FIN_IDLE) return terminar('estable');
      };

      // Stop sigue siendo la señal principal de cierre de ChatGPT, pero su
      // desaparición ocurre un poco antes de que CodeMirror termine de montar
      // algunos bloques de código. Cerrar en esa misma mutación capturaba DOM
      // transitorio (`router._y_`, `rou_er_`, llaves ausentes). Exigimos que el
      // texto Y el markdown permanezcan iguales durante una ventana corta.
      // Mutaciones globales sin cambio de contenido no reinician la ventana.
      const CHATGPT_SETTLE_MS = 650;
      let settleFirma = '';
      const cancelarSettleChatGPT = () => {
        clearTimeout(settle);
        settle = null;
        settleFirma = '';
      };
      const programarCierreChatGPT = (reason = 'site_complete') => {
        if (hecho || !esChatGPT) return;
        if (getStop()) { cancelarSettleChatGPT(); return; }
        if (ocultoSinShim()) return;

        // No cerrar sólo porque apareció el primer token y todavía no vemos
        // el botón Stop. ChatGPT crea a veces el contenedor con una sílaba
        // (por ejemplo "La") antes de montar el control de generación. El
        // microtask de abajo interpretaba ese estado transitorio como respuesta
        // completa, esperaba apenas CHATGPT_SETTLE_MS y devolvía el fragmento;
        // el resto de la respuesta —incluido el JSON de la siguiente tool— se
        // quedaba en el iframe fuera de la request ya resuelta.
        //
        // El cierre rápido queda habilitado únicamente después de haber visto
        // Stop al menos una vez (`vioGenerando`) y observar su desaparición.
        // Si el proveedor nunca expone Stop, `chequearFin()` conserva el
        // fallback por estabilidad larga (mínimo + FIN_IDLE), más lento pero
        // seguro y sin truncar el turno.
        if (!vioGenerando) {
          trace('stop_settle_deferred', { reason, cause: 'stop_not_seen' });
          return;
        }

        capturando = true;
        leer();
        const texto = norm(textOf(current));
        if (!texto || /^(thinking|reasoning|pensando|razonando|json|code)\.?$/i.test(texto)) return;
        const md = markdownMedido(nodoTexto(current));
        const firma = `${texto}\u0000${md}`;
        if (settle && firma === settleFirma) return;

        clearTimeout(settle);
        settleFirma = firma;
        trace('stop_settle_start', {
          reason, waitMs: CHATGPT_SETTLE_MS, textLen: texto.length, mdLen: md.length,
        });
        settle = setTimeout(() => {
          settle = null;
          if (hecho || getStop() || ocultoSinShim()) return;

          leer();
          const textoFinal = norm(textOf(current));
          const mdFinal = markdownMedido(nodoTexto(current));
          const firmaFinal = `${textoFinal}\u0000${mdFinal}`;
          if (!textoFinal || /^(thinking|reasoning|pensando|razonando|json|code)\.?$/i.test(textoFinal)) return;
          if (firmaFinal !== settleFirma) {
            trace('stop_settle_changed', {
              reason, textLen: textoFinal.length, mdLen: mdFinal.length,
            });
            settleFirma = '';
            programarCierreChatGPT(reason);
            return;
          }
          trace('stop_settle_done', {
            reason, textLen: textoFinal.length, mdLen: mdFinal.length,
          });
          terminar(reason);
        }, CHATGPT_SETTLE_MS);
      };

      const obs = new MutationObserver(() => { leer(); chequearFin(); });
      obs.observe(target, { childList: true, subtree: true, characterData: true });
      const onVisibility = () => {
        if (!document.hidden) {
          leer();
          chequearFin();
          if (esChatGPT && !getStop() && lastText) programarCierreChatGPT();
        }
      };
      document.addEventListener('visibilitychange', onVisibility);

      // En background, Chromium puede convertir el poll de 350ms en uno de
      // 60s. ChatGPT sí tiene una señal de cierre útil: el botón Stop aparece
      // durante la generación y su desaparición muta el DOM global. Observar
      // body conserva esa señal rápida, pero ahora pasa por estabilización.
      if (esChatGPT) {
        // El observer global sólo vigila la transición del control Stop. Antes
        // llamaba leer() por CADA mutación de body (incluido el montaje de código),
        // duplicando el trabajo del observer del turno y provocando stutters.
        // El botón Send/Stop vive dentro del compositor. Observar su padre
        // inmediato permite detectar reemplazos del <form> sin recorrer las
        // respuestas, sidebar, bloques de código ni el resto del documento.
        const composer = getInput()?.closest?.('form[data-type="unified-composer"], form') ||
          document.querySelector('form[data-type="unified-composer"]');
        const siteRoot = composer?.parentElement || composer || document.body;
        let stopPresente = !!getStopButton(siteRoot);
        vioGenerando = stopPresente;
        trace('stop_observer_root', {
          tag: siteRoot?.tagName || '',
          composerScoped: siteRoot !== document.body,
        });
        siteObs = new MutationObserver(() => {
          perfAudit.siteObsCallbacks++;
          const stopAhora = !!getStopButton(siteRoot);
          if (stopAhora === stopPresente) return;
          stopPresente = stopAhora;
          perfAudit.stopTransitions++;

          if (stopAhora) {
            vioGenerando = true;
            cancelarSettleChatGPT();
            trace('stop_state', { present: true });
            return;
          }

          trace('stop_state', { present: false, vioGenerando });
          // La lectura pesada sólo ocurre una vez, al desaparecer Stop. El
          // observer específico del turno continúa capturando el texto durante
          // toda la generación.
          if (ocultoSinShim()) return;
          leer();
          const textoOk = lastText && !/^(thinking|reasoning|pensando|razonando)\.?$/i.test(lastText);
          if (vioGenerando && textoOk) programarCierreChatGPT('stop_to_send');
        });
        siteObs.observe(siteRoot, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['aria-label', 'data-testid', 'hidden', 'aria-hidden'],
        });
      }

      queueMicrotask(() => {
        if (hecho) return;
        capturando = true;
        leer();
        // Si el target apareció ya completo después de un razonamiento largo,
        // quizá no haya transición Stop. Aplicar la misma estabilización; si el
        // nodo todavía está vacío/placeholder, sus próximas mutaciones lo
        // despertarán en vez de cerrarlo prematuramente como `site_empty`.
        if (esChatGPT && !getStop() && lastText) programarCierreChatGPT();
      });

      // Respaldo por sondeo (por si la última mutación fue la que quitó el
      // stop button y el observer ya no dispara más).
      const poll = setInterval(() => {
        if (cancelToken?.cancelled) return terminar('cancelled');
        leer();
        chequearFin();
        if (Date.now() - start > timeoutMs) return terminar('timeout');
      }, 350);
    });
  }

  async function esperarRespuesta({ base, onChunk, cancelToken, timeoutMs = 600000, submitAt }) {
    const deadline = Date.now() + timeoutMs;
    // Algunos modelos tardan >30s antes de crear el contenedor. Esperar todo el
    // presupuesto evita declarar never_started y provocar reenvíos duplicados.
    const target = await esperarTarget(base, deadline, cancelToken);
    // Respuesta SOLO-imagen (sin contenedor de texto): devolver las imágenes.
    if (target?.imageOnly) {
      return { ok: true, text: '', reason: 'image_only', imgSrcs: target.imgSrcs,
               respondeMs: Date.now() - (submitAt || Date.now()), generaMs: Date.now() - (submitAt || Date.now()) };
    }
    if (!target) return { ok: false, text: '', reason: cancelToken?.cancelled ? 'cancelled' : 'never_started', respondeMs: null, generaMs: null };
    return seguirTarget(target, { base, onChunk, cancelToken, timeoutMs: deadline - Date.now(), submitAt: submitAt || Date.now() });
  }

  // ── bridge: handshake + escuchar ASK ───────────────────
  const post = m => { try { window.parent.postMessage(m, '*'); } catch (_) {} };

  let anuncios = 0;
  const anunciar = () => {
    post({ type: 'AURORA_CLOUD_READY', host: location.hostname, relayBuild: RELAY_BUILD });
    if (++anuncios < 20) setTimeout(anunciar, 250);
  };
  anunciar();

  let ocupado = false, cancelActual = null, reqActual = null;
  let ultimoTurnoTerminado = 0;
  let ultimoFueTool = false;
  const colaAsks = [];
  const ASK_PENDING_KEY = 'aurora_cloud_ask_pending_v1';

  function leerAskPendiente() {
    try { return JSON.parse(sessionStorage.getItem(ASK_PENDING_KEY) || 'null'); } catch { return null; }
  }
  function guardarAskPendiente(value) {
    try { sessionStorage.setItem(ASK_PENDING_KEY, JSON.stringify(value)); return true; } catch { return false; }
  }
  function borrarAskPendiente(requestId) {
    try {
      const current = leerAskPendiente();
      if (!requestId || current?.requestId === requestId) sessionStorage.removeItem(ASK_PENDING_KEY);
    } catch (_) {}
  }

  // El primer envío de una conversación suele navegar /app → /app/<id>.
  // Esa navegación destruye el content script, pero NO la generación del
  // proveedor. Persistimos sólo el ancla de captura (nunca permisos/tokens) y
  // la nueva instancia continúa observando el mismo turno.
  async function reanudarAskPendiente() {
    const pending = leerAskPendiente();
    if (!pending?.requestId || ocupado) return false;
    const remaining = Number(pending.deadline || 0) - Date.now();
    if (remaining <= 0) {
      borrarAskPendiente(pending.requestId);
      post({ type: 'AURORA_CLOUD_ANSWER', requestId: pending.requestId, ok: false,
        text: 'Error: la captura no sobrevivió antes del timeout.', reason: 'resume_timeout' });
      return false;
    }
    const cancel = { cancelled: false };
    ocupado = true; cancelActual = cancel; reqActual = pending.requestId;
    const now = contenedores();
    const base = {
      prev: new Set(now.length <= pending.baseCount ? now : []),
      ids: new Set(pending.ids || []),
      userIds: new Set(pending.userIds || []),
      count: Number(pending.baseCount || 0),
      lastEl: null,
      lastText: pending.lastText || '',
    };
    trace('ask_resume', { requestId: pending.requestId, remainingMs: remaining, baseCount: base.count });
    try {
      let chunkPend = null, chunkTimer = null, ultimoPost = 0;
      const postChunk = () => {
        if (chunkPend != null) post({ type: 'AURORA_CLOUD_CHUNK', requestId: pending.requestId, text: chunkPend });
        chunkPend = null; chunkTimer = null; ultimoPost = Date.now();
      };
      const res = await esperarRespuesta({
        base, cancelToken: cancel, submitAt: pending.submitAt || Date.now(), timeoutMs: remaining,
        onChunk: text => {
          chunkPend = text;
          const delay = Date.now() - ultimoPost;
          if (delay >= 140) postChunk(); else if (!chunkTimer) chunkTimer = setTimeout(postChunk, 140 - delay);
        },
      });
      if (chunkTimer) clearTimeout(chunkTimer);
      borrarAskPendiente(pending.requestId);
      // Bajar imágenes generadas en la respuesta a data URL (máx 4).
      let imagenes;
      if (res.imgSrcs?.length) {
        imagenes = (await Promise.all(res.imgSrcs.slice(0, 4).map(urlADataURL))).filter(Boolean);
      }
      trace('answer_resumed', { requestId: pending.requestId, ok: res.ok, reason: res.reason, imgs: imagenes?.length || 0 });
      post({ type: 'AURORA_CLOUD_ANSWER', requestId: pending.requestId, ok: res.ok,
        text: res.reason === 'cancelled' ? 'Cancelado por el usuario.' : (res.text || '(sin respuesta detectada)'),
        reason: res.reason, respondeMs: res.respondeMs, generaMs: res.generaMs,
        images: imagenes?.length ? imagenes : undefined });
    } catch (error) {
      borrarAskPendiente(pending.requestId);
      post({ type: 'AURORA_CLOUD_ANSWER', requestId: pending.requestId, ok: false,
        text: 'Error reanudando cloud-relay: ' + (error?.message || String(error)), reason: 'resume_error' });
    } finally {
      if (reqActual === pending.requestId) { ocupado = false; cancelActual = null; reqActual = null; }
    }
    return true;
  }

  // Avisar al parent permite que ASK que estaban en cola se reenvíen al relay
  // nuevo. La ASK activa se deduplica por el marcador anterior.
  window.addEventListener('beforeunload', () => {
    if (leerAskPendiente()?.requestId) post({ type: 'AURORA_CLOUD_RESETTING', reason: 'provider_navigation' });
  });

  // ── Nueva conversación confirmada ──────────────────────
  // El marcador sobrevive a navegación same-origin. ChatGPT suele recargar al
  // ir a `/`; Gemini puede hacerlo como SPA. La instancia vieja y la nueva
  // llaman al mismo confirmador, pero sólo una consume el marcador.
  const NEW_CHAT_KEY = 'aurora_cloud_new_chat_pending';

  function botonNuevoChat() {
    const candidatos = [
      ...document.querySelectorAll('a[href="/"], button[aria-label], [role="button"][aria-label]'),
    ];
    return candidatos.find(el => {
      if (!el || el.offsetParent === null) return false;
      const label = `${el.getAttribute('aria-label') || ''} ${el.getAttribute('title') || ''} ${el.textContent || ''}`;
      return /new chat|nuevo chat|chat nuevo/i.test(label);
    }) || null;
  }

  function leerMarcaNuevoChat() {
    try { return JSON.parse(sessionStorage.getItem(NEW_CHAT_KEY) || 'null'); } catch { return null; }
  }

  function borrarMarcaNuevoChat() {
    try { sessionStorage.removeItem(NEW_CHAT_KEY); } catch (_) {}
  }

  async function confirmarNuevoChatPendiente() {
    const marca = leerMarcaNuevoChat();
    if (!marca?.requestId) return false;
    const deadline = Date.now() + 30000;
    let limpioDesde = 0;
    while (Date.now() < deadline) {
      const input = getInput();
      const count = contenedores().length;
      const cambioUrl = location.href !== marca.beforeUrl;
      const rutaLimpia = /chatgpt\.com|chat\.openai\.com/.test(location.hostname)
        ? !/^\/c\//.test(location.pathname)
        : /gemini\.google\.com/.test(location.hostname)
          ? /^\/app\/?$/.test(location.pathname)
          : cambioUrl;
      const domLimpio = count === 0 || count < (marca.beforeCount || 0);
      const candidato = input && domLimpio && (rutaLimpia || cambioUrl) && Date.now() - marca.startedAt > 500;
      if (candidato && !limpioDesde) limpioDesde = Date.now();
      if (!candidato) limpioDesde = 0;
      // ChatGPT puede mostrar `/` y DOM vacío durante ~800ms y restaurar el
      // hilo anterior justo después. Exigir estabilidad evita declarar un
      // chat limpio que en realidad vuelve a contaminarse con el historial.
      if (candidato && Date.now() - limpioDesde >= 2200) {
        borrarMarcaNuevoChat();
        trace('new_chat_ready', { requestId: marca.requestId, url: location.href, count });
        post({ type: 'AURORA_CLOUD_READY', host: location.hostname, relayBuild: RELAY_BUILD });
        post({ type: 'AURORA_CLOUD_NEW_CHAT_ANSWER', requestId: marca.requestId,
          ok: true, reason: 'new_chat_ready', url: location.href });
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    borrarMarcaNuevoChat();
    trace('new_chat_error', { requestId: marca.requestId, reason: 'new_chat_not_ready' });
    post({ type: 'AURORA_CLOUD_NEW_CHAT_ANSWER', requestId: marca.requestId,
      ok: false, reason: 'new_chat_not_ready', error: 'El composer limpio no quedó listo en 30s.' });
    return false;
  }

  function iniciarNuevoChat(requestId) {
    if (!requestId) return;
    const esChatGPT = /chatgpt\.com|chat\.openai\.com/.test(location.hostname);
    // Gemini puede conservar un control de Stop visible varios segundos aun
    // después de terminar. `ocupado` es nuestra fuente fiable allí; en
    // ChatGPT el botón sí bloquea correctamente un reset durante generación.
    if (ocupado || (esChatGPT && getStop())) {
      post({ type: 'AURORA_CLOUD_NEW_CHAT_ANSWER', requestId, ok: false,
        reason: 'provider_busy', error: 'El panel todavía está generando.' });
      return;
    }
    const marca = { requestId, beforeUrl: location.href, beforeCount: contenedores().length, startedAt: Date.now() };
    try { sessionStorage.setItem(NEW_CHAT_KEY, JSON.stringify(marca)); }
    catch (err) {
      post({ type: 'AURORA_CLOUD_NEW_CHAT_ANSWER', requestId, ok: false,
        reason: 'storage_error', error: err?.message || String(err) });
      return;
    }
    trace('new_chat_start', { requestId, beforeUrl: marca.beforeUrl, beforeCount: marca.beforeCount });
    post({ type: 'AURORA_CLOUD_RESETTING', reason: 'new_chat' });
    const destino = /gemini\.google\.com/.test(location.hostname) ? '/app'
      : /chatgpt\.com|chat\.openai\.com/.test(location.hostname) ? '/' : null;
    if (destino) {
      // Navegación física conocida: más fuerte que un click SPA, que ChatGPT
      // a veces revierte al hilo anterior tras mostrar `/` fugazmente.
      location.assign(destino);
    } else {
      const boton = botonNuevoChat();
      if (boton) boton.click();
      else {
        borrarMarcaNuevoChat();
        post({ type: 'AURORA_CLOUD_NEW_CHAT_ANSWER', requestId, ok: false,
          reason: 'new_chat_unsupported', error: `Proveedor sin selector de nuevo chat: ${location.hostname}` });
        return;
      }
    }
    // Gemini suele navegar como SPA y no reinjecta el content script.
    setTimeout(() => confirmarNuevoChatPendiente(), 250);
  }

  // Si esta instancia nació por una navegación completa, consume el marcador.
  setTimeout(() => confirmarNuevoChatPendiente(), 0);
  setTimeout(() => reanudarAskPendiente(), 0);

  // Detiene la generación de la nube: cancela nuestra captura Y clickea el
  // botón "Detener respuesta" del sitio (nuestra parada conectada a la suya).
  function detenerNube(reason = 'stop') {
    if (cancelActual) cancelActual.cancelled = true;
    borrarAskPendiente(reqActual);
    const stop = getStop();
    if (stop && !stop.disabled) stop.click();
    // STOP significa detener el flujo completo, no ejecutar luego prompts que
    // quedaron en cola mientras el usuario esperaba.
    while (colaAsks.length) {
      const pendiente = colaAsks.shift();
      post({ type: 'AURORA_CLOUD_ANSWER', requestId: pendiente.requestId, ok: false, text: 'Cancelado antes de iniciar.', reason: 'cancelled_queued' });
    }
    trace('stop', { requestId: reqActual, reason });
    // Gemini puede quedar en un estado imposible tras cancelar: muestra
    // "Detener respuesta" para siempre y ni un Enter real inicia otro turno.
    // Avisar al parent para invalidar READY y recargar este iframe una vez que
    // las respuestas cancelled tuvieron tiempo de propagarse.
    post({ type: 'AURORA_CLOUD_RESETTING', reason });
    setTimeout(() => location.reload(), 1200);
  }

  // ── Adjuntos: pegar imágenes / archivos (port del legacy AI-Hub) ──────
  // Gemini/ChatGPT aceptan adjuntos por drag&drop (dragenter/dragover/drop) +
  // paste sobre el composer. Recibimos data URLs (imágenes) y {name,content}
  // (archivos). Se pegan ANTES de inyectar el texto y enviar.
  async function b64AFile(dataUrl, name, typeFallback) {
    const url = dataUrl.startsWith('data:') ? dataUrl : `data:${typeFallback};base64,${dataUrl}`;
    const blob = await (await fetch(url)).blob();
    return new File([blob], name, { type: blob.type || typeFallback });
  }

  // URL de una imagen (ej. generada por DALL·E dentro del iframe del proveedor)
  // → data URL, para mandarla a Aurora y mostrarla en el chat. fetch primero
  // (mismo origen/CORS en el iframe); fallback a canvas si la imagen ya está
  // cargada y no está tainted.
  async function urlADataURL(url) {
    try {
      const blob = await (await fetch(url)).blob();
      return await new Promise((ok, err) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = err; r.readAsDataURL(blob); });
    } catch (_) {}
    try {
      const img = [...document.querySelectorAll('img')].find(i => i.src === url);
      if (img?.complete && img.naturalWidth) {
        const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext('2d').drawImage(img, 0, 0);
        return c.toDataURL('image/png');
      }
    } catch (_) {}
    return null;
  }
  async function soltarEnComposer(files) {
    if (!files.length) return false;
    const esChatGPT = /chatgpt\.com|chat\.openai\.com/.test(location.hostname);
    // ChatGPT suele consumir sólo el primer File cuando varios llegan dentro
    // del mismo ClipboardEvent. Un paste por archivo conserva todos los
    // adjuntos; cada iteración espera su preview antes de continuar.
    if (esChatGPT && files.length > 1) {
      for (const file of files) {
        if (!await soltarEnComposer([file])) return false;
      }
      return true;
    }

    const input = getInput();
    if (!input) return false;
    // Verificado por CDP en Gemini actual: el PASTE puro (ClipboardEvent con
    // DataTransfer) SÍ adjunta (aparece .file-preview-container); el drag&drop
    // legacy ya NO — Gemini cambió su dropzone.
    const SEL_PREVIEW = '.file-preview-container, [data-testid*="preview" i], [class*="attachment" i], ' +
      'button[aria-label^="Remove file" i], button[aria-label^="Remove image" i], button[aria-label^="Quitar archivo" i]';
    const nPrev = () => document.querySelectorAll(SEL_PREVIEW).length;
    // Spinner/barra de SUBIDA (no confundir con el thumbnail): Gemini sube el
    // archivo a sus servidores DESPUÉS de mostrar el preview. Enviar antes de
    // que termine = mensaje SIN adjunto. Esperamos a que no haya carga activa.
    const subiendo = () => [...document.querySelectorAll(SEL_PREVIEW)].some(p =>
      p.querySelector('[role="progressbar"], mat-progress-spinner, .mat-mdc-progress-spinner, mat-progress-bar, [class*="uploading" i], [class*="spinner" i]'));
    const antes = nPrev();
    const pasteAt = Date.now();
    const dt = new DataTransfer();
    files.forEach(f => dt.items.add(f));
    try { input.focus(); } catch (_) {}
    input.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, composed: true, clipboardData: dt }));
    // 1) preview aceptado: MutationObserver reacciona incluso con timers
    // estrangulados en background (el polling 60×100ms tardaba minutos).
    const aparecio = await new Promise(resolve => {
      if (nPrev() > antes) return resolve(true);
      let done = false;
      const finish = ok => { if (done) return; done = true; obs.disconnect(); clearTimeout(to); resolve(ok); };
      const obs = new MutationObserver(() => { if (nPrev() > antes) finish(true); });
      obs.observe(document.body, { childList: true, subtree: true, attributes: true });
      const to = setTimeout(() => finish(false), 6000);
    });
    if (!aparecio) return false;
    // 2) upload terminado: debounce único de 800ms sin spinner. Cada mutación
    // relevante reevalúa y reinicia; no acumulamos decenas de timers.
    return new Promise(resolve => {
      let done = false, estable = null;
      const finish = ok => {
        if (done) return;
        done = true; obs.disconnect(); clearTimeout(estable); clearTimeout(limite); resolve(ok);
      };
      const check = () => {
        clearTimeout(estable);
        if (nPrev() > antes && !subiendo()) {
          // ChatGPT muestra "Remove file" casi al instante, sin spinner ni
          // señal de red observable, aunque todavía no terminó de procesar el
          // texto. Enviar ~2s después produjo sólo los primeros caracteres del
          // archivo ("OR" de "ORQUIDEA_..."). Exigir 5s desde el paste y una
          // ventana final estable evita declarar listo un preview meramente
          // visual. Gemini sí expone mutaciones/spinner fiables.
          const esperaChatGPT = files.every(f => f.type?.startsWith('image/')) ? 3000 : 5000;
          const minimoRestante = esChatGPT ? Math.max(0, esperaChatGPT - (Date.now() - pasteAt)) : 0;
          estable = setTimeout(() => finish(true), Math.max(800, minimoRestante));
        }
      };
      const obs = new MutationObserver(check);
      obs.observe(document.body, { childList: true, subtree: true, attributes: true });
      const limite = setTimeout(() => finish(false), 20000);
      check();
    });
  }
  async function pegarAdjuntos({ images, files }) {
    const fs = [];
    for (let i = 0; i < (images || []).length; i++) fs.push(await b64AFile(images[i], `img-${i}.png`, 'image/png'));
    for (let i = 0; i < (files || []).length; i++) {
      const f = files[i] || {};
      if (typeof f.content === 'string' && f.content.startsWith('data:')) {
        fs.push(await b64AFile(f.content, f.name || `file-${i}`, f.type || 'application/octet-stream'));
      } else {
        fs.push(new File([f.content || ''], f.name || `file-${i}.txt`, { type: f.type || 'text/plain' }));
      }
    }
    return !fs.length || await soltarEnComposer(fs);
  }

  window.addEventListener('message', async (e) => {
    if (e.data?.type === 'AURORA_CLOUD_PING') { anunciar(); return; }
    if (e.data?.type === 'AURORA_CLOUD_STOP') { detenerNube(); return; }
    if (e.data?.type === 'AURORA_CLOUD_NEW_CHAT') {
      try { iniciarNuevoChat(e.data.requestId); }
      catch (err) {
        trace('new_chat_error', { requestId: e.data.requestId, reason: 'relay_exception', error: err?.message || String(err) });
        post({ type: 'AURORA_CLOUD_NEW_CHAT_ANSWER', requestId: e.data.requestId, ok: false,
          reason: 'relay_exception', error: err?.message || String(err) });
      }
      return;
    }
    if (e.data?.type !== 'AURORA_CLOUD_ASK') return;
    const { prompt, requestId, images, files, captureTimeoutMs } = e.data;
    if (!prompt || !requestId) return;
    trace('ask_received', { requestId, promptLen: prompt.length, images: images?.length || 0, files: files?.length || 0 });

    // DEDUP: askCloud postea el ASK dos veces (inmediato + retry a 300ms para
    // cubrir el iframe recién montado), ambos con el MISMO requestId. Sin este
    // guard, el segundo cancelaba la captura del primero y re-inyectaba →
    // corte prematuro (vía composer fallaba, directo funcionaba).
    if (requestId === reqActual) return;

    // Dos productores pueden coincidir (usuario, cloud_ask de pi, Duo). Antes
    // el ASK nuevo cancelaba silenciosamente al actual. Serializar conserva
    // ambos turnos y hace posible colaboración sostenida.
    if (ocupado) {
      colaAsks.push({ ...e.data });
      trace('ask_queued', { requestId, queue: colaAsks.length });
      return;
    }
    const cancel = { cancelled: false };
    cancelActual = cancel; reqActual = requestId; ocupado = true;

    try {
      const input = getInput();
      if (!input) { post({ type: 'AURORA_CLOUD_ANSWER', requestId, ok: false, text: 'Error: no se encontró el input del AI (¿página cargada?)' }); return; }
      // NO sondear el botón Stop acá. Gemini suele dejar un Stop/animación
      // fantasma tras terminar y los timers de una pestaña en background son
      // estrangulados: 40×200ms se convertían en minutos. esperarRespuesta ya
      // exigió estabilidad del texto antes de resolver; enviarVerificado es el
      // gate real que confirma que el composer aceptó el siguiente turno.
      // Tocar el input durante el cierre interno de Gemini lo deja visible pero
      // imposible de enviar. Cooldown monotónico y único; no consulta Stop.
      // Las respuestas cortas normales rearman el composer rápido incluso
      // hidden. Las respuestas con bloque JSON/tool añaden toolbar de código y
      // Gemini tarda ~20s bajo throttling. Aplicar margen largo sólo ahí.
      // Un timer de 20s dentro de un iframe oculto puede ser estrangulado por
      // Chromium hasta superar un minuto y consumir el timeout de askCloud.
      // `enviarVerificado` ya reintenta y confirma que el composer aceptó el
      // mensaje; sólo necesita un margen corto para que cierre el toolbar.
      const margenComposer = ultimoFueTool ? 2500 : 1200;
      const cooldown = margenComposer - (Date.now() - ultimoTurnoTerminado);
      if (cooldown > 0) await new Promise(r => setTimeout(r, cooldown));
      if (cancel.cancelled) { post({ type: 'AURORA_CLOUD_ANSWER', requestId, ok: false, text: '' }); return; }
      trace('composer_ready', { requestId });
      // window.focus() en el iframe ROBA el foco de la ventana (en side-panel el
      // composer de Lyra pierde lo que el usuario escribe). Solo agarrarlo en el
      // turno inicial del usuario; en las re-inyecciones de tool-feedback (que
      // corren mientras el usuario escribe) NO robar el foco.
      if (!ultimoFueTool) { try { window.focus(); } catch (_) {} }
      // Adjuntos primero (imágenes/archivos): se pegan al composer y luego va el
      // texto encima, así el envío lleva ambos. Puede tardar (espera la subida).
      if ((images && images.length) || (files && files.length)) {
        trace('attachments_start', { requestId });
        const attachmentAt = Date.now();
        try {
          const ok = await pegarAdjuntos({ images, files });
          if (!ok) {
            post({ type: 'AURORA_CLOUD_ANSWER', requestId, ok: false,
              text: 'Error: el sitio Cloud no aceptó los adjuntos. Abrí el panel expandido, verificá permisos y reintentá.' });
            return;
          }
          trace('attachments_ready', { requestId, attachmentMs: Date.now() - attachmentAt });
        } catch (err) {
          post({ type: 'AURORA_CLOUD_ANSWER', requestId, ok: false, text: 'Error adjuntando archivo: ' + err.message });
          return;
        }
      }
      injectText(input, prompt);
      await new Promise(r => setTimeout(r, 120));   // dejar registrar el input event (antes 400 — puro retraso)
      // Baseline DESPUÉS de enfocar/inyectar. ChatGPT virtualiza el historial:
      // enfocar el composer puede reinsertar la respuesta anterior con su ID.
      // Si tomamos la foto antes, ese ID viejo parece una respuesta nueva y el
      // relay queda exactamente un turno atrasado. Aún no enviamos, así que
      // todo lo visible en este punto pertenece inequívocamente al baseline.
      const base0 = contenedores();
      const userCountBefore = /gemini\.google\.com/.test(location.hostname)
        ? document.querySelectorAll('user-query').length
        : document.querySelectorAll('[data-message-author-role="user"]').length;
      const base = {
        prev: new Set(base0),
        ids: new Set(base0.map(idContainer).filter(Boolean)),
        userIds: new Set([...document.querySelectorAll('[data-message-author-role="user"]')]
          .map(u => u.dataset.messageId).filter(Boolean)),
        count: base0.length,
        lastEl: base0[base0.length - 1] || null,
        lastText: base0.length ? norm(textOf(base0[base0.length - 1])) : '',
        imgBase: new Set(imgSrcsPresentes()),   // imágenes ya presentes (para detectar las NUEVAS)
      };
      const submitAt = Date.now();   // t0 real: apenas se envía el prompt
      guardarAskPendiente({
        requestId, submitAt,
        deadline: submitAt + (Number.isFinite(captureTimeoutMs) ? Math.max(1000, Math.min(900000, captureTimeoutMs)) : 600000),
        baseCount: base.count, ids: [...base.ids], userIds: [...base.userIds], lastText: base.lastText,
      });
      const seEnvio = await enviarVerificado(input, prompt.length, cancel, userCountBefore);
      if (!seEnvio) {
        borrarAskPendiente(requestId);
        post({ type: 'AURORA_CLOUD_ANSWER', requestId, ok: false,
          text: cancel.cancelled ? 'Cancelado por el usuario.' : 'Error: no se pudo enviar el mensaje al AI (iframe sin foco o botón enviar bloqueado). Reintentá.',
          reason: cancel.cancelled ? 'cancelled' : 'submit_failed' });
        return;
      }
      trace('submitted', { requestId });
      // Throttle del posteo de chunks: sin esto, cada mutación del DOM de
      // Gemini postea un AURORA_CLOUD_CHUNK — un flood de postMessages que
      // satura el main thread de Aurora (congela la app). Posteamos como mucho
      // cada CHUNK_MS; el texto es acumulativo, solo importa el último.
      const CHUNK_MS = 140;
      let ultimoPost = 0, chunkPend = null, chunkTimer = null;
      const postChunk = () => { if (chunkPend != null) post({ type: 'AURORA_CLOUD_CHUNK', requestId, text: chunkPend }); chunkPend = null; ultimoPost = Date.now(); chunkTimer = null; };
      const res = await esperarRespuesta({
        base, cancelToken: cancel, submitAt,
        // Los modelos de razonamiento de ChatGPT pueden permanecer en
        // "Thinking" varios minutos (tareas complejas) antes de materializar la
        // respuesta o emitir un bloque de tool. El límite anterior (240s)
        // declaraba error aunque el sitio siguiera razonando — cortaba tareas
        // largas legítimas. Techo 900s: lo limita el modelo/PC, no Aurora. El
        // padre conserva un watchdog finito y Stop sigue disponible.
        timeoutMs: Number.isFinite(captureTimeoutMs) ? Math.max(1000, Math.min(900000, captureTimeoutMs)) : 600000,
        onChunk: (text) => { chunkPend = text; const d = Date.now() - ultimoPost; if (d >= CHUNK_MS) postChunk(); else if (!chunkTimer) chunkTimer = setTimeout(postChunk, CHUNK_MS - d); },
      });
      // Un timeout real deja algunos proveedores (especialmente Gemini) con
      // “Detener respuesta” activo indefinidamente. Liberar la captura no
      // basta: cancelar el sitio y resetear el pane para que sea reutilizable.
      if (res.reason === 'timeout') detenerNube('timeout');
      // Bajar imágenes de la respuesta (generadas / solo-imagen) a data URL.
      let imagenes;
      if (res.imgSrcs?.length) {
        imagenes = (await Promise.all(res.imgSrcs.slice(0, 4).map(urlADataURL))).filter(Boolean);
      }
      trace('answer', { requestId, ok: res.ok, reason: res.reason, respondeMs: res.respondeMs, generaMs: res.generaMs, imgs: imagenes?.length || 0 });
      if (chunkTimer) { clearTimeout(chunkTimer); chunkTimer = null; }
      post({ type: 'AURORA_CLOUD_ANSWER', requestId, ok: res.ok,
             text: res.reason === 'cancelled' ? 'Cancelado por el usuario.' : (res.text || (imagenes?.length ? '' : '(sin respuesta detectada)')),
             reason: res.reason, respondeMs: res.respondeMs, generaMs: res.generaMs,
             images: imagenes?.length ? imagenes : undefined });
      ultimoTurnoTerminado = Date.now();
      ultimoFueTool = /\{\s*"tool"\s*:/.test(res.text || '');
    } catch (err) {
      post({ type: 'AURORA_CLOUD_ANSWER', requestId, ok: false, text: 'Error en cloud-relay: ' + err.message });
    } finally {
      borrarAskPendiente(requestId);
      if (reqActual === requestId) {
        ocupado = false;
        cancelActual = null;
        reqActual = null;
        const siguiente = colaAsks.shift();
        if (siguiente) {
          trace('ask_dequeued', { requestId: siguiente.requestId, queue: colaAsks.length });
          setTimeout(() => window.postMessage(siguiente, '*'), 0);
        }
      }
    }
  });
})();
