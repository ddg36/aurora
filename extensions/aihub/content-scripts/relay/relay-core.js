// relay/relay-core.js — motor común de Relay Family.
// Puente Lyra ↔ AI: recibe AURORA_CLOUD_ASK del padre (la UI de Aurora),
// inyecta el prompt, envía, y detecta la respuesta del asistente leyendo el
// DOM. Devuelve AURORA_CLOUD_CHUNK (streaming) y AURORA_CLOUD_ANSWER (final).
//
// Port fiel de los mods legacy de AI-Hub (detectar-input + inyectar +
// orquestador-estados + bridge). Protocolo renombrado GEMITA_ → AURORA_CLOUD_.
// Solo reporta desde el frame montado por Aurora (mismo gate que el sniffer).
function startAuroraRelayCore(injectedAdapter) {
  const esTop = window.top === window;
  const padre = location.ancestorOrigins?.[0] || '';
  if (!esTop && !/^chrome-extension:|^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(padre)) return;
  const RELAY_BUILD = '2026-07-17.2-provider-contract-v2';
  if (globalThis.__auroraCloudRelayActive) return;
  globalThis.__auroraCloudRelayActive = RELAY_BUILD;
  const relayV2 = globalThis.__auroraRelayV2;
  const providerAdapter = relayV2?.validateProviderAdapter(injectedAdapter || relayV2?.findProvider?.(location));
  if (!providerAdapter) throw new Error('Relay Core inició sin Provider Adapter válido.');
  const observe = providerAdapter.observe;
  const act = providerAdapter.act;
  const policies = providerAdapter.policies || {};
  document.documentElement.dataset.auroraCloudRelayAdapter = providerAdapter.id;

  // ── Surface Context ─────────────────────────────────────────
  // El provider sabe CÓMO operar el sitio; el padre declara DÓNDE está montado.
  // Una tab normal no necesita binding y obtiene una identidad provisional que
  // el background completa con tabId/frameId/windowId reales.
  let relayContext = Object.freeze({
    surface: esTop ? 'tab' : 'embedded-unknown',
    surfaceInstanceId: null,
    paneId: null,
    channelId: null,
    role: null,
    runId: null,
    mode: esTop ? 'top-level' : 'embedded',
    providerId: providerAdapter.id,
    boundAt: Date.now(),
  });
  const cleanContextValue = (value, max = 160) => value == null ? null : String(value).slice(0, max);
  const publishRelayContext = () => {
    document.documentElement.dataset.auroraRelaySurfaceContext = JSON.stringify(relayContext);
    return relayContext;
  };
  const bindRelayContext = input => {
    if (!input || typeof input !== 'object') return false;
    const surface = cleanContextValue(input.surface || (esTop ? 'tab' : 'embedded-unknown'), 64);
    const surfaceInstanceId = cleanContextValue(input.surfaceInstanceId);
    const paneId = cleanContextValue(input.paneId, 80);
    const channelId = cleanContextValue(input.channelId || (surfaceInstanceId && paneId ? `${surfaceInstanceId}:${paneId}` : null), 240);
    relayContext = Object.freeze({
      surface, surfaceInstanceId, paneId, channelId,
      role: cleanContextValue(input.role, 80),
      runId: cleanContextValue(input.runId, 160),
      mode: esTop ? 'top-level' : 'embedded',
      providerId: providerAdapter.id,
      boundAt: Date.now(),
    });
    publishRelayContext();
    return true;
  };
  publishRelayContext();
  globalThis.__auroraRelaySurfaceContext = () => ({ ...relayContext });
  window.addEventListener('message', event => {
    if (event.data?.type !== 'AURORA_RELAY_BIND') return;
    if (!esTop && event.source !== window.parent) return;
    if (esTop) return; // una web cualquiera no puede reasignar una tab normal
    if (!bindRelayContext(event.data.context)) return;
    try {
      window.parent.postMessage({ type: 'AURORA_RELAY_BOUND', context: relayContext }, '*');
    } catch (_) {}
  });

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

  // El core consume capacidades semánticas; no conoce selectores ni DOM de proveedor.
  const userTurns = () => observe.getUserTurnCount();
  const getInput = () => observe.getInput();
  const getSend = () => observe.getSendControl?.({ visible: true }) || null;
  const getStop = () => observe.getStopControl?.() || null;
  const imgsGeneradas = () => observe.getGeneratedImages?.() || [];
  const imgSrcsPresentes = () => observe.getGeneratedImageSources?.() || [];
  const imagenPendiente = () => Boolean(observe.isGeneratedImagePending?.());

  // Sentinel de "trabajando": mientras el LLM piensa/busca y aún no hay
  // respuesta real, emitimos este marcador; Aurora lo reemplaza por un
  // indicador animado bonito (no mostramos el status crudo del proveedor).
  const WORKING = 'AURORA_WORKING';

  function injectText(el, text) {
    if (!act.insertText(el, text)) throw new Error('El Provider Adapter rechazó insertText.');
  }

  const textoInput = el => (el ? (el.innerText ?? el.value ?? '') : '').trim();

  // Botón enviar SIN exigir visibilidad: en un iframe en segundo plano
  // offsetParent es null aunque el botón exista → getSend() (que exige visible)
  // devolvía null y el submit caía a Enter, que a veces no manda. Para enviar
  // sí aceptamos el botón oculto (el selector es específico de cada sitio).
  const getSendAny = () => observe.getSendControl?.({ visible: false }) || null;

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
  async function enviarVerificado(el, largoPrompt, cancelToken, userCountBefore = 0, options = {}) {
    const stopConfirmsSubmit = Boolean(policies.authoritativeStop);
    const requireUserTurn = !!options.requireUserTurn;
    const userCount = userTurns;
    // Señal FIABLE de "enviado": apareció un turno de usuario nuevo. inputVacio()
    // no sirve (ChatGPT no siempre limpia el composer al instante) y llevaba al
    // retry a reintentar/`Enter` MIENTRAS ChatGPT ya respondía → cancelaba o
    // reenviaba el turno ("la respuesta se dibuja y desaparece"). Con getStop
    // como respaldo (ChatGPT ya generando = aceptado).
    const enviado = () => userCount() > userCountBefore
      || (!requireUserTurn && stopConfirmsSubmit && getStop());
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
      // ChatGPT cambia el submit genérico por Stop antes de limpiar siempre el
      // contenteditable. Esa transición YA demuestra que aceptó el envío. Sin
      // este guard, el retry encontraba `form button[type=submit]` convertido
      // en Stop y cortaba la respuesta tras 2–3 caracteres.
      if (intento > 0 && (enviado() || (!requireUserTurn && stopConfirmsSubmit && getStop()))) return true;
      const input = getInput() || el;
      try { input.focus(); } catch (_) {}
      // GUARD DURO: si ya se envió (turno de usuario nuevo) o ChatGPT ya está
      // generando, NUNCA re-clickear ni re-`Enter` — un segundo disparo durante
      // la generación cancela/reenvía y borra la respuesta a medio dibujar.
      if (enviado() || (!requireUserTurn && stopConfirmsSubmit && getStop())) return true;
      if (!act.submit(input)) {
        const btn = getSendAny();
        if (btn) btn.click(); else dispararEnter(input);
      }
      await esperarCambio(intento++ === 0 ? 180 : 500);
      if (cancelToken?.cancelled) return false;
      if (enviado() || (!requireUserTurn && stopConfirmsSubmit && getStop())) return true;
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
        // No todo proveedor marca el lenguaje con la clase estándar language-*
        // (ChatGPT: el <code> queda sin className, lo muestra como texto plano
        // en el header). Sin lenguaje en el fence, highlightCode (renderizar.js)
        // no tiene nada que resaltar — el código sale plano aunque el bloque
        // tenga fondo temizado. domToMarkdown no conoce el DOM de ningún
        // proveedor: delega en el driver activo si expone el hook.
        const lang = m ? m[1] : (observe.detectCodeLang?.(node) || '');
        const txt = (target.innerText || target.textContent || '').replace(/\n+$/, '');
        out.push('\n\n```' + lang + '\n' + txt + '\n```\n\n'); return;
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
    const md = out.join('').replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n').trim();
    // ChatGPT (y otros) generan cada punto de una lista como un <ol>/<ul>
    // SEPARADO (uno por ítem, cortado por su párrafo de explicación), usando
    // el atributo HTML `start` para que el navegador los numere en secuencia
    // — invisible al recorrer el DOM elemento por elemento (cada <ol> local
    // reinicia el contador `i=1` de arriba). Se detecta la secuencia de
    // marcadores numerados consecutivos (con párrafos intercalados, sin
    // heading/bullet que corte) y se renumera en el texto ya generado.
    const lineas = md.split('\n');
    let contador = 0, dentroDeLista = false;
    for (let idx = 0; idx < lineas.length; idx++) {
      const m = lineas[idx].match(/^(\s*)(\d+)\.(\s+)/);
      if (m) {
        contador = dentroDeLista ? contador + 1 : 1;
        dentroDeLista = true;
        lineas[idx] = lineas[idx].replace(/^(\s*)(\d+)\.(\s+)/, `${m[1]}${contador}.${m[3]}`);
        continue;
      }
      if (dentroDeLista && (/^\s*#{1,6}\s/.test(lineas[idx]) || /^\s*[-*•]\s/.test(lineas[idx]))) dentroDeLista = false;
    }
    return lineas.join('\n');
  }

  // Contenedores de turno (del primer selector que matchee). Contar-y-enganchar
  // al NUEVO es robusto: el mensaje anterior ya está en el DOM y confundía.
  function contenedores() {
    return observe.getAssistantTurns?.() || [];
  }
  // El nodo con MÁS texto entre los candidatos (durante el stream gana
  // `.pending`, al final `.markdown`). Si ninguno matchea, el contenedor.
  const nodoTexto = c => {
    return observe.getTextNode?.(c) || c;
  };
  const textOf = c => observe.readAssistant(c);
  const idContainer = c => observe.getTurnId?.(c) || '';
  const estaCompleto = c => Boolean(observe.isComplete?.(c));
  const norm = t => (t || '').replace(/\s+/g, ' ').trim();
  const generando = () => Boolean(observe.isGenerating());

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
      if (providerAdapter.capabilities.images && !getStop() && Date.now() - inicioEspera > 3000) {
        const nuevas = imgsGeneradas().filter(s => !base.imgBase?.has(s));
        if (nuevas.length) return { imageOnly: true, imgSrcs: nuevas };
      }
      const cs = contenedores();
      // ChatGPT: anclar la respuesta al mensaje de USUARIO que acabamos de
      // enviar. La virtualización puede insertar asistentes viejos con IDs
      // nuevos para nuestro baseline, pero ninguno de ellos está después del
      // nuevo user turn. Esta relación DOM elimina el desfase de un turno que
      // aparecía especialmente al crear un hilo desde Lyra Cloud.
      if (policies.anchorAfterUser) {
        const ids = observe.getNewUserTurnIds?.(base.userIds) || [];
        // Marcar temprano (apenas se detecta, antes de esperar la respuesta):
        // así un futuro observador de "turno espontáneo" puede inferir que el
        // assistant que sigue a este user-turn también es de Lyra, aunque el
        // propio id del assistant aún no esté registrado (terminar() lo marca
        // recién al final del turno).
        for (const id of ids) marcarTurnoDeLyra(id);
        const posterior = observe.findAssistantAfterUserIds?.(ids, cs);
        if (posterior) return posterior;
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
      const stopAuthoritative = Boolean(policies.authoritativeStop);
      const proveedorOculto = () => document.hidden;

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
        if (stopAuthoritative && sinRespuesta) return;
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
        // Marcar ESTE turno assistant como "de Lyra" solo en el camino feliz
        // real (nunca cancelado/timeout) — un futuro observador de "turno
        // espontáneo" lo usa para no re-reportar lo que ya se entregó por
        // AURORA_CLOUD_ANSWER.
        if (reason !== 'cancelled' && reason !== 'timeout') marcarTurnoDeLyra(idContainer(current));
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
      const FIN_IDLE = 8000;
      const chequearFin = () => {
        if (!capturando || !lastText) return;
        // Algunos proveedores detienen el render de tokens al ocultarse. Un
        // fragmento congelado no es una respuesta estable: esperar a que el
        // documento vuelva a estar visible o al timeout explícito.
        if (proveedorOculto()) return;
        if (/^(thinking|reasoning|pensando|razonando)\.?$/i.test(lastText)) return;
        // En ChatGPT, el nodo virtualizado del turno anterior puede aparecer
        // varios segundos antes que la respuesta nueva. No declarar estable
        // ese señuelo antes de darle tiempo al ID actual para materializarse.
        const minimo = 12000;
        if (Date.now() - submitAt < minimo) return;
        // ChatGPT: mientras el botón Stop siga presente, sigue generando (su
        // Stop es FIABLE, a diferencia de Gemini). NO declarar 'estable' sobre
        // texto viejo idle mientras ChatGPT todavía piensa/busca — era el bug:
        // enganchaba el turno anterior (idle) y cerraba a los ~20s con la
        // respuesta VIEJA aunque ChatGPT seguía buscando. Dejar que el observer
        // migre al contenedor real cuando aparezca; sólo cerrar por idle cuando
        // Stop ya no está. (Gemini mantiene Stop 40s+ idle → sigue por texto.)
        if (stopAuthoritative && getStop()) return;
        if (Date.now() - lastChange > FIN_IDLE) return terminar('estable');
      };

      // Stop sigue siendo la señal principal de cierre de ChatGPT, pero su
      // desaparición ocurre un poco antes de que CodeMirror termine de montar
      // algunos bloques de código. Cerrar en esa misma mutación capturaba DOM
      // transitorio (`router._y_`, `rou_er_`, llaves ausentes). Exigimos que el
      // texto Y el markdown permanezcan iguales durante una ventana corta.
      // Mutaciones globales sin cambio de contenido no reinician la ventana.
      const STOP_SETTLE_MS = 650;
      let settleFirma = '';
      const cancelarSettleStop = () => {
        clearTimeout(settle);
        settle = null;
        settleFirma = '';
      };
      const programarCierreStop = (reason = 'site_complete') => {
        if (hecho || !stopAuthoritative) return;
        if (getStop()) { cancelarSettleStop(); return; }
        if (proveedorOculto()) return;

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
          reason, waitMs: STOP_SETTLE_MS, textLen: texto.length, mdLen: md.length,
        });
        settle = setTimeout(() => {
          settle = null;
          if (hecho || getStop() || proveedorOculto()) return;

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
            programarCierreStop(reason);
            return;
          }
          trace('stop_settle_done', {
            reason, textLen: textoFinal.length, mdLen: mdFinal.length,
          });
          terminar(reason);
        }, STOP_SETTLE_MS);
      };

      const obs = new MutationObserver(() => { leer(); chequearFin(); });
      obs.observe(target, { childList: true, subtree: true, characterData: true });
      const onVisibility = () => {
        if (!document.hidden) {
          leer();
          chequearFin();
          if (stopAuthoritative && !getStop() && lastText) programarCierreStop();
        }
      };
      document.addEventListener('visibilitychange', onVisibility);

      // En background, Chromium puede convertir el poll de 350ms en uno de
      // 60s. ChatGPT sí tiene una señal de cierre útil: el botón Stop aparece
      // durante la generación y su desaparición muta el DOM global. Observar
      // body conserva esa señal rápida, pero ahora pasa por estabilización.
      if (stopAuthoritative) {
        // El observer global sólo vigila la transición del control Stop. Antes
        // llamaba leer() por CADA mutación de body (incluido el montaje de código),
        // duplicando el trabajo del observer del turno y provocando stutters.
        // El botón Send/Stop vive dentro del compositor, pero no necesariamente
        // en el padre INMEDIATO del input (verificado en ChatGPT actual: el
        // ancestro común real está 3 niveles arriba). Observar un contenedor
        // que no incluya al botón deja siteObsCallbacks en 0 para siempre —
        // el cierre nunca usa el camino rápido (650ms) y cae al fallback lento
        // (mínimo 12s + FIN_IDLE), el retraso percibido al terminar de
        // responder. Subir hasta encontrar el ancestro que SÍ contenga ambos
        // (input + control Stop/Send), acotado a pocos niveles para seguir
        // siendo más chico que document.body.
        const siteRoot = (() => {
          const input = getInput();
          const control = observe.getStopControl?.() || observe.getSendControl?.({ visible: false });
          if (!input) return document.body;
          if (!control) return input.parentElement || document.body;
          let node = input;
          for (let hops = 0; hops < 8 && node; hops++, node = node.parentElement) {
            if (node.contains(control)) return node;
          }
          return document.body;
        })();
        let stopPresente = Boolean(observe.isGenerating());
        vioGenerando = stopPresente;
        trace('stop_observer_root', {
          tag: siteRoot?.tagName || '',
          composerScoped: siteRoot !== document.body,
        });
        siteObs = new MutationObserver(() => {
          perfAudit.siteObsCallbacks++;
          const stopAhora = Boolean(observe.isGenerating());
          if (stopAhora === stopPresente) return;
          stopPresente = stopAhora;
          perfAudit.stopTransitions++;

          if (stopAhora) {
            vioGenerando = true;
            cancelarSettleStop();
            trace('stop_state', { present: true });
            return;
          }

          trace('stop_state', { present: false, vioGenerando });
          // La lectura pesada sólo ocurre una vez, al desaparecer Stop. El
          // observer específico del turno continúa capturando el texto durante
          // toda la generación.
          if (proveedorOculto()) { trace('stop_state_skip', { reason: 'oculto' }); return; }
          leer();
          const textoOk = lastText && !/^(thinking|reasoning|pensando|razonando)\.?$/i.test(lastText);
          trace('stop_state_check', { vioGenerando, textoOk, lastTextLen: lastText?.length || 0 });
          if (vioGenerando && textoOk) programarCierreStop('stop_to_send');
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
        if (stopAuthoritative && !getStop() && lastText) programarCierreStop();
      });

      // Respaldo por sondeo (por si la última mutación fue la que quitó el
      // stop button y el observer ya no dispara más).
      const STALL_MS = 15000;
      let stallAvisado = false;
      const poll = setInterval(() => {
        if (cancelToken?.cancelled) return terminar('cancelled');
        leer();
        chequearFin();
        // Reintento de tool colgado: el widget "Generating.../Analyzing..."
        // sigue vivo (isToolWorking) mientras el turno de chat queda con
        // texto congelado (sin cambios) más de STALL_MS. No es "sigue
        // generando" normal (eso mueve lastChange); avisar a Lyra UNA vez
        // por turno para que el usuario decida si clickear "Answer now" —
        // nunca autoclic.
        if (!stallAvisado && observe.isToolWorking?.() && Date.now() - lastChange > STALL_MS) {
          stallAvisado = true;
          post({ type: 'AURORA_CLOUD_TOOL_STALLED', aiId: providerAdapter.id, stalledMs: Date.now() - lastChange });
        }
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
  // Transporte único y maduro para feedback de tools. JSON Family en una tab
  // normal llega aquí por chrome.scripting (background → MAIN world), no
  // reimplementa clicks/timers en el content script aislado.
  globalThis.__auroraProviderTransport = async function entregarTextoVerificado(delivery) {
    const packet = delivery && typeof delivery === 'object'
      ? delivery
      : { text: String(delivery || ''), images: [], files: [] };
    const payload = String(packet.text || '').trim();
    const images = Array.isArray(packet.images) ? packet.images : [];
    const files = Array.isArray(packet.files) ? packet.files : [];
    if (!payload && !images.length && !files.length) return { ok: false, error: 'feedback vacío' };
    const input = getInput();
    if (!input) return { ok: false, error: 'composer no encontrado' };
    const userCountBefore = userTurns();
    if (images.length || files.length) {
      const attached = await act.attachFiles({ images, files });
      if (!attached) return { ok: false, error: 'el proveedor no confirmó los adjuntos' };
    }
    if (payload) injectText(input, payload);
    // Misma ventana usada por AURORA_CLOUD_ASK para que React/ProseMirror
    // registre el input antes de intentar el submit.
    await new Promise(resolve => setTimeout(resolve, 120));
    const ok = await enviarVerificado(
      input, payload.length, { cancelled: false }, userCountBefore,
      { requireUserTurn: true },
    );
    return { ok, error: ok ? null : 'el proveedor no confirmó el envío en 30s' };
  };
  document.documentElement.dataset.auroraProviderTransport = RELAY_BUILD;

  // En una tab normal sólo prestamos el transporte verificado. El protocolo
  // ASK/READY completo permanece exclusivo de iframes montados por Aurora.
  if (esTop) return;

  const post = m => {
    try { window.parent.postMessage({ ...m, relayContext }, '*'); } catch (_) {}
  };

  let anuncios = 0;
  const anunciar = () => {
    post({ type: 'AURORA_CLOUD_READY', host: location.hostname, relayBuild: RELAY_BUILD });
    if (++anuncios < 20) setTimeout(anunciar, 250);
  };
  anunciar();

  // ── Vigía de cambio de conversación ────────────────────
  // Cubre DOS casos con la misma señal (getConversationKey === location.pathname):
  // (a) el usuario clickea otro hilo en el sidebar del propio sitio — Aurora
  //     debe reconocer esa sesión y restaurar SU historial (si Lyra ya habló
  //     ahí antes) en vez de seguir mezclando con el hilo anterior;
  // (b) un thread ID inválido/muerto (borrado, expirado) redirige a home en
  //     silencio tras cargar sin encontrarlo — sin error visible, sin turnos
  //     en el DOM (confirmado en vivo: navega a /c/<id>, se queda sin turnos
  //     ~5-8s, termina en pathname '/'). Sin este vigía, Aurora seguía
  //     creyendo el hilo persistido (cloudUrl) válido para siempre.
  //
  // MutationObserver, NO setInterval: un poll de tiempo fijo (probado antes,
  // 300ms) generaba fetches pesados en el frontend por CADA cambio de
  // <title> — ChatGPT lo actualiza varias veces mientras nombra un chat
  // nuevo, no solo una vez. Confirmado en vivo: 15 disparos en 8s en una
  // sola sesión de prueba, saturando el endpoint by-url innecesariamente.
  // El propio archivo ya resuelve este tipo de detección en otro lado
  // (siteObs/obs del turno, confirmarNuevoChatPendiente) con Observer +
  // estabilidad, nunca con un timer ciego — mismo patrón acá.
  //
  // Pathname: crítico para integridad de datos (si el usuario escribe justo
  // tras cambiar de hilo, enviarACloud podría resolver/crear la conversación
  // bajo el conv_id VIEJO) — se avisa INMEDIATO en cuanto el observer lo
  // detecta, sin esperar estabilidad. Reactivo a mutaciones reales del DOM
  // (una navegación de hilo causa reflow masivo, se detecta en el siguiente
  // microtask), mucho más rápido que cualquier poll de tiempo fijo.
  //
  // Título: solo cosmético (label de la cabecera) — ChatGPT navega primero y
  // actualiza <title> asíncronamente después, oscilando un par de veces
  // antes de asentarse (confirmado en vivo). Se espera estabilidad real
  // (2200ms sin cambios, mismo umbral ya usado en confirmarNuevoChatPendiente
  // de este archivo) antes de avisar — y NUNCA dispara fetch en el consumidor
  // (reason:'title_only', el frontend solo actualiza el label).
  let claveConversacionPrevia = '';
  let tituloEstable = '';
  let tituloCandidato = null;
  let tituloTimer = null;
  const avisarCambio = (reason, titulo) => {
    if (leerMarcaNuevoChat()) return; // ese flujo se resuelve por su cuenta
    trace('conversation_changed', { url: location.href, titulo, reason });
    post({ type: 'AURORA_CLOUD_NAV_CHANGED', reason, url: location.href, titulo });
  };
  const chequearConversacion = () => {
    const clave = observe.getConversationKey();
    if (clave !== claveConversacionPrevia) {
      claveConversacionPrevia = clave;
      tituloCandidato = null;
      if (tituloTimer) { clearTimeout(tituloTimer); tituloTimer = null; }
      tituloEstable = observe.getConversationTitle?.() || '';
      avisarCambio('thread_changed', tituloEstable);
      return;
    }
    const titulo = observe.getConversationTitle?.() || '';
    if (titulo === tituloEstable) { tituloCandidato = null; return; }
    if (tituloCandidato !== titulo) {
      tituloCandidato = titulo;
      if (tituloTimer) clearTimeout(tituloTimer);
      tituloTimer = setTimeout(() => {
        tituloTimer = null;
        const actual = observe.getConversationTitle?.() || '';
        if (actual !== tituloCandidato) return; // volvió a cambiar, no estable
        tituloEstable = actual;
        avisarCambio('title_only', actual);
      }, 2200);
    }
  };
  chequearConversacion(); // primer chequeo inmediato, sin esperar la primera mutación
  new MutationObserver(chequearConversacion)
    .observe(document.documentElement, { childList: true, subtree: true, characterData: true });

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

  // ── Turnos generados por Lyra (no por escritura directa en el sitio) ────
  // No existe hoy ningún identificador de "este mensaje vino de Lyra vs. lo
  // escribió el usuario directo en el iframe" — necesario para un futuro
  // observador de "turno espontáneo" que refleje en Lyra lo que pase en el
  // hilo aunque no haya sido iniciado por un ASK (pedido explícito del
  // usuario: hoy esos turnos no aparecen en Lyra en absoluto). data-message-id
  // (ya expuesto por observe.getTurnId, real y estable de ChatGPT) es más
  // confiable que marcar el texto (se corrompe con copy/paste, reformateo) o
  // que heurísticas de timing (`!ocupado`, ventanas de carrera). Se marca el
  // turno USER apenas se detecta (temprano en el ciclo, antes de esperar la
  // respuesta) — así un futuro observador puede inferir que el assistant que
  // lo sigue también es de Lyra aunque su propio id aún no esté registrado.
  const LYRA_TURN_IDS_KEY = 'aurora_lyra_turn_ids_v1';
  function leerTurnosDeLyra() {
    try { return JSON.parse(sessionStorage.getItem(LYRA_TURN_IDS_KEY) || '[]'); } catch (_) { return []; }
  }
  function marcarTurnoDeLyra(turnId) {
    if (!turnId) return;
    const arr = leerTurnosDeLyra();
    if (arr.includes(turnId)) return;
    arr.push(turnId);
    if (arr.length > 200) arr = arr.slice(-200); // acotar: turnos viejos caen
    try { sessionStorage.setItem(LYRA_TURN_IDS_KEY, JSON.stringify(arr)); } catch (_) {}
  }

  // ── Sincronización de hilo completo (no turno-por-turno) ───────────────
  // Corrección de diseño: un observador de "turno espontáneo" en tiempo real
  // (estabilidad por turno, Set de turnIds, 3 chequeos) resultó frágil —
  // vivía anidado en el scope equivocado (bug real: markdownMedido no
  // accesible ahí, ReferenceError silencioso en cada intento, el mensaje
  // nunca salía). La idea correcta: la conversación YA tiene identidad
  // estable (conv_id, resuelto por URL en el frontend) — en vez de cazar
  // cada turno nuevo con timers, simplemente sincronizar TODO el hilo
  // visible cada vez que se estabiliza (deja de generar), dedup por texto
  // contra lo ya persistido (mismo patrón que la fusión de hidratación en
  // lyra.js). Idempotente: turnos ya guardados no se reenvían, solo los
  // que falten — sin importar si vinieron de un ASK de Lyra o de escritura
  // directa en el sitio, y sin necesidad de diferenciar el origen.
  let syncTimer = null;
  const sincronizarHilo = () => {
    syncTimer = null;
    if (ocupado || observe.isGenerating()) return; // esperar a que se asiente
    // Orden real de aparición (no dos listas separadas): user/assistant se
    // intercalan por posición real en el DOM, vía los nodos que el contrato
    // YA expone (compareDocumentPosition, no un selector nuevo).
    const turnos = [
      ...(observe.getUserTurns?.() || []).map(nodo => ({ rol: 'user', nodo, texto: (nodo.innerText || '').trim() })),
      ...(observe.getAssistantTurns?.() || []).map(nodo => ({ rol: 'assistant', nodo, texto: textOf(nodo) })),
    ].filter(t => t.texto)
      .sort((a, b) => (a.nodo.compareDocumentPosition(b.nodo) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1)
      .map(({ rol, texto }) => ({ rol, texto }));
    if (!turnos.length) return;
    post({ type: 'AURORA_CLOUD_SYNC_HILO', url: location.href, aiId: providerAdapter.id, turnos });
  };
  new MutationObserver(() => {
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(sincronizarHilo, 2200);
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  setTimeout(sincronizarHilo, 2200); // primer intento sin esperar la primera mutación

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
      const count = contenedores().length;
      const candidato = observe.isNewConversationReady?.(marca) && Date.now() - marca.startedAt > 500;
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
    if (ocupado || (policies.authoritativeStop && observe.isGenerating())) {
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
    if (!providerAdapter.capabilities.newChat || !act.startNewConversation()) {
      borrarMarcaNuevoChat();
      post({ type: 'AURORA_CLOUD_NEW_CHAT_ANSWER', requestId, ok: false,
        reason: 'new_chat_unsupported', error: 'El Provider Adapter no ofrece nueva conversación.' });
      return;
    }
    // Algunos proveedores navegan como SPA y no reinyectan el content script.
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
    act.stopGeneration?.();
    // STOP significa detener el flujo completo, no ejecutar luego prompts que
    // quedaron en cola mientras el usuario esperaba.
    while (colaAsks.length) {
      const pendiente = colaAsks.shift();
      post({ type: 'AURORA_CLOUD_ANSWER', requestId: pendiente.requestId, ok: false, text: 'Cancelado antes de iniciar.', reason: 'cancelled_queued' });
    }
    trace('stop', { requestId: reqActual, reason });
    // Avisar al parent para invalidar READY; el driver declara si necesita reload.
    post({ type: 'AURORA_CLOUD_RESETTING', reason });
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
  window.addEventListener('message', async (e) => {
    if (e.data?.type === 'AURORA_CLOUD_PING') { anunciar(); return; }
    // Lectura fresca bajo demanda, no cacheada: cloudUrl en React puede seguir
    // apuntando al hilo viejo justo tras un cambio de conversación (el vigía
    // de conversation_changed es reactivo pero no instantáneo/síncrono desde
    // afuera — el iframe es cross-origin). Verificado en vivo: escribir casi
    // al instante tras cambiar de hilo persistía el mensaje bajo el conv_id
    // INCORRECTO. enviarACloud pide esto justo antes de resolver/crear la
    // conversación, en vez de confiar en el url que ya tenía como parámetro.
    if (e.data?.type === 'AURORA_CLOUD_WHERE_AM_I') {
      post({ type: 'AURORA_CLOUD_WHERE_AM_I_ANSWER', requestId: e.data.requestId, url: location.href });
      return;
    }
    if (e.data?.type === 'AURORA_CLOUD_STOP') { detenerNube(); return; }
    // Botón manual "Answer now": SOLO ejecuta ante pedido explícito de Lyra
    // (clic del usuario en la cabecera Cloud). Nunca disparado por el propio
    // watcher de stall — ese solo avisa.
    if (e.data?.type === 'AURORA_CLOUD_ANSWER_NOW') {
      const ok = Boolean(act.answerNow?.());
      trace('answer_now', { ok });
      post({ type: 'AURORA_CLOUD_ANSWER_NOW_ANSWER', requestId: e.data.requestId, ok });
      return;
    }
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
    document.documentElement.dataset.auroraCloudAskActive = '1';
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
          const ok = await act.attachFiles({ images, files });
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
      const userCountBefore = userTurns();
      const base = {
        prev: new Set(base0),
        ids: new Set(base0.map(idContainer).filter(Boolean)),
        userIds: new Set((observe.getUserTurns?.() || []).map(turn => turn.dataset?.messageId).filter(Boolean)),
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
      const finalText = res.reason === 'cancelled' ? 'Cancelado por el usuario.' : (res.text || (imagenes?.length ? '' : '(sin respuesta detectada)'));
      let familyHash = 5381;
      for (let i = 0; i < finalText.length; i++) familyHash = ((familyHash << 5) + familyHash) ^ finalText.charCodeAt(i);
      document.documentElement.dataset.auroraJsonFamilyConsumed = (familyHash >>> 0).toString(36);
      document.documentElement.dataset.auroraCloudAskActive = '0';
      post({ type: 'AURORA_CLOUD_ANSWER', requestId, ok: res.ok,
             text: finalText,
             reason: res.reason, respondeMs: res.respondeMs, generaMs: res.generaMs,
             images: imagenes?.length ? imagenes : undefined });
      ultimoTurnoTerminado = Date.now();
      ultimoFueTool = /\{\s*"tool"\s*:/.test(res.text || '');
    } catch (err) {
      post({ type: 'AURORA_CLOUD_ANSWER', requestId, ok: false, text: 'Error en cloud-relay: ' + err.message });
    } finally {
      document.documentElement.dataset.auroraCloudAskActive = '0';
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
}

globalThis.__auroraRelayV2.createRelay = function createRelay(driver) {
  let started = false;
  return Object.freeze({
    driverId: driver?.id || 'unsupported',
    getContext() { return globalThis.__auroraRelaySurfaceContext?.() || null; },
    start() {
      if (started) return false;
      started = true;
      startAuroraRelayCore(driver);
      return true;
    },
  });
};
