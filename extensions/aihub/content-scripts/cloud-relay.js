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
  const RELAY_BUILD = '2026-07-13.18';
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
  const STOP_SELECTORS = [
    'button[aria-label*="Stop" i]',
    'button[aria-label*="Detener" i]',
    'button[data-testid*="stop" i]',
    '.animate-pulse', '.loading-indicator', '.loading-dot',
  ];

  const getInput = () => INPUT_SELECTORS.map(s => document.querySelector(s)).find(Boolean) || null;
  const getSend  = () => SEND_SELECTORS.map(s => document.querySelector(s)).find(b => b && b.offsetParent !== null) || null;
  const getStop  = () => STOP_SELECTORS.map(s => document.querySelector(s)).find(b => b && b.offsetParent !== null) || null;

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
    return /stop|detener/i.test(marca) || STOP_SELECTORS.some(s => { try { return b.matches?.(s); } catch { return false; } });
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
    const inputVacio = () => textoInput(getInput()).length < Math.min(15, largoPrompt);
    // Gemini conserva un Stop fantasma y a veces limpia temporalmente el
    // editor sin crear el turno. Exigir un user-query nuevo evita declarar
    // `submitted` cuando el proveedor en realidad descartó el mensaje.
    const enviado = () => inputVacio() && (esChatGPT || userCount() > userCountBefore);
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
          out.push(ordered ? `${i}. ` : '- '); li.childNodes.forEach(walk); out.push('\n'); i++;
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
    while (Date.now() < deadline) {
      if (cancelToken?.cancelled) return null;
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
      const MD_MS = 350;   // throttle del armado de markdown durante el stream
      const esChatGPT = /chatgpt\.com|chat\.openai\.com/.test(location.hostname);
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
        let t = norm(textOf(current));
        const placeholder = /^(thinking|reasoning|pensando|razonando)\.?$/i.test(t);
        const latest = contenedores().at(-1);
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
          contenedores().length > (base?.count || 0);
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
          const md = domToMarkdown(nodoTexto(current));
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
        lastMd = domToMarkdown(nodoTexto(current));
        resolve({
          // Una cancelación nunca es una respuesta exitosa, aunque ya exista
          // texto parcial. Antes `reason:cancelled` podía viajar con `ok:true`
          // si el usuario detenía después de los primeros tokens.
          ok: reason !== 'cancelled' && reason !== 'timeout' && !!lastText && !esPlaceholder,
          text: esPlaceholder
            ? `Error: ${lastText} no produjo una respuesta antes del timeout.`
            : (lastMd || lastText || '(sin respuesta detectada)'),
          reason,
          respondeMs: respondeMs ?? (Date.now() - submitAt),
          generaMs: ultimaCaptura - submitAt,
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

      const obs = new MutationObserver(() => { leer(); chequearFin(); });
      obs.observe(target, { childList: true, subtree: true, characterData: true });
      const onVisibility = () => {
        if (!document.hidden) { leer(); chequearFin(); }
      };
      document.addEventListener('visibilitychange', onVisibility);

      // En background, Chromium puede convertir el poll de 350ms en uno de
      // 60s. ChatGPT sí tiene una señal de cierre útil: el botón Stop aparece
      // durante la generación y su desaparición muta el DOM global. Observar
      // body permite terminar al instante sin depender de timers ocultos.
      if (esChatGPT) {
        siteObs = new MutationObserver(() => {
          leer();
          if (getStop()) { vioGenerando = true; return; }
          // En una pestaña oculta ChatGPT puede retirar Stop antes de que el
          // último lote de texto llegue al DOM. La señal produjo cierres como
          // `BACKGROUND` mientras el sitio aún completaba `_RELAY_OK`. En
          // background sólo la estabilidad textual puede cerrar el turno.
          if (ocultoSinShim()) return;
          if (vioGenerando && lastText && !/^(thinking|reasoning|pensando|razonando)\.?$/i.test(lastText)) {
            terminar('site_complete');
          }
        });
        siteObs.observe(document.body, { childList: true, subtree: true, attributes: true });
        vioGenerando = !!getStop();
      }

      queueMicrotask(() => {
        if (hecho) return;
        capturando = true;
        leer();
        // Si el target apareció ya completo después de un razonamiento largo,
        // no habrá transición Stop ni otra mutación que despierte al observer.
        if (esChatGPT && !getStop()) {
          const vacio = !lastText || /^(json|code)$/i.test(lastText);
          terminar(vacio ? 'site_empty' : 'site_complete');
        }
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

  async function esperarRespuesta({ base, onChunk, cancelToken, timeoutMs = 240000, submitAt }) {
    const deadline = Date.now() + timeoutMs;
    // Algunos modelos tardan >30s antes de crear el contenedor. Esperar todo el
    // presupuesto evita declarar never_started y provocar reenvíos duplicados.
    const target = await esperarTarget(base, deadline, cancelToken);
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
      trace('answer_resumed', { requestId: pending.requestId, ok: res.ok, reason: res.reason });
      post({ type: 'AURORA_CLOUD_ANSWER', requestId: pending.requestId, ok: res.ok,
        text: res.reason === 'cancelled' ? 'Cancelado por el usuario.' : (res.text || '(sin respuesta detectada)'),
        reason: res.reason, respondeMs: res.respondeMs, generaMs: res.generaMs });
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
  async function soltarEnComposer(files) {
    const input = getInput();
    if (!input || !files.length) return false;
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
    const esChatGPT = /chatgpt\.com|chat\.openai\.com/.test(location.hostname);
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
          const minimoRestante = esChatGPT ? Math.max(0, 5000 - (Date.now() - pasteAt)) : 0;
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
      try { window.focus(); } catch (_) {}
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
      };
      const submitAt = Date.now();   // t0 real: apenas se envía el prompt
      guardarAskPendiente({
        requestId, submitAt,
        deadline: submitAt + (Number.isFinite(captureTimeoutMs) ? Math.max(1000, Math.min(240000, captureTimeoutMs)) : 240000),
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
        // "Thinking" más de 90s antes de materializar la respuesta. El límite
        // anterior declaraba error aunque el sitio siguiera generando. El
        // padre conserva un watchdog finito y Stop sigue disponible.
        timeoutMs: Number.isFinite(captureTimeoutMs) ? Math.max(1000, Math.min(240000, captureTimeoutMs)) : 240000,
        onChunk: (text) => { chunkPend = text; const d = Date.now() - ultimoPost; if (d >= CHUNK_MS) postChunk(); else if (!chunkTimer) chunkTimer = setTimeout(postChunk, CHUNK_MS - d); },
      });
      // Un timeout real deja algunos proveedores (especialmente Gemini) con
      // “Detener respuesta” activo indefinidamente. Liberar la captura no
      // basta: cancelar el sitio y resetear el pane para que sea reutilizable.
      if (res.reason === 'timeout') detenerNube('timeout');
      trace('answer', { requestId, ok: res.ok, reason: res.reason, respondeMs: res.respondeMs, generaMs: res.generaMs });
      if (chunkTimer) { clearTimeout(chunkTimer); chunkTimer = null; }
      post({ type: 'AURORA_CLOUD_ANSWER', requestId, ok: res.ok,
             text: res.reason === 'cancelled' ? 'Cancelado por el usuario.' : (res.text || '(sin respuesta detectada)'),
             reason: res.reason, respondeMs: res.respondeMs, generaMs: res.generaMs });
      ultimoTurnoTerminado = Date.now();
      ultimoFueTool = /\{\s*"tool"\s*:/.test(res.text || '');
    } catch (err) {
      post({ type: 'AURORA_CLOUD_ANSWER', requestId, ok: false, text: 'Error en cloud-relay: ' + err.message });
    } finally {
      borrarAskPendiente(requestId);
      if (reqActual === requestId) {
        ocupado = false;
        const siguiente = colaAsks.shift();
        if (siguiente) {
          trace('ask_dequeued', { requestId: siguiente.requestId, queue: colaAsks.length });
          setTimeout(() => window.postMessage(siguiente, '*'), 0);
        }
      }
    }
  });
})();
