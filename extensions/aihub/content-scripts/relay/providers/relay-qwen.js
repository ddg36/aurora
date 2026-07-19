// Provider driver: Qwen (chat.qwen.ai). Todo conocimiento de su DOM vive acá.
// Selectores confirmados en vivo (inspección real + un mensaje de prueba
// realmente enviado y respondido, no adivinados): antes de este driver, Qwen
// caía al fallback `relay-generic.js`, cuyo `insertText` (execCommand sobre
// un <textarea>) y selector de `send` (`button[aria-label*="Send"]`) no
// alcanzaban a disparar el estado interno del composer controlado de Qwen —
// el botón real de enviar ni siquiera existe en el DOM hasta que el
// framework reconoce el texto como "real" (antes de eso, ese mismo lugar
// muestra un botón de "Voice mode").
(() => {
  'use strict';

  const SELECTORS = Object.freeze({
    assistant: ['.chat-response-message'],
    user: ['.chat-user-message'],
    input: ['textarea.message-input-textarea'],
    // `:not([disabled])` es necesario: Qwen deja el botón en el DOM con
    // `disabled` mientras genera una respuesta previa, pero el selector de
    // atributo `[aria-label="Send"]` lo matchea IGUAL (ignora `disabled`).
    // Sin este filtro, `act.submit()` clickeaba un botón inerte (no-op real)
    // y lo reportaba como enviado — confirmado en vivo: el guard de cooldown
    // de abajo entonces bloqueaba el reintento real una vez Qwen sí quedaba
    // libre, y el timeout de 30s de `enviarVerificado` disparaba una entrega
    // duplicada real por el retry del courier.
    send: ['button.send-button[aria-label="Send" i]:not([disabled])'],
    // Botón Stop nunca confirmado en vivo (no alcanzamos a capturar el DOM
    // durante una generación real) — sin selector, isGenerating() siempre da
    // false y `policies.authoritativeStop` queda en false, igual que
    // relay-generic.js para proveedores no certificados del todo.
    stop: [],
    text: ['.qwen-markdown', '.response-message-content'],
  });

  const first = (selectors, root = document) => selectors.map(s => root.querySelector(s)).find(Boolean) || null;
  const all = selectors => [...document.querySelectorAll(selectors.join(','))];

  // Monaco (VS Code) vuelca gutter+etiqueta de lenguaje junto con el código en
  // innerText, y usa U+00A0 en vez de espacio normal — confirmado en vivo por
  // código de carácter (160). `.view-lines` es el área interna con SOLO el
  // texto real. Compartido por `readAssistant` (detección de tool calls) y
  // `readCodeBlockText` (hook de `domToMarkdown` en relay-core.js para la
  // respuesta final de `AURORA_CLOUD_ASK` — sin esto, ese camino separado
  // leía el `pre` crudo y arrastraba el mismo desastre).
  const monacoText = root => {
    const lines = [...(root?.querySelectorAll?.('.view-lines') || [])]
      .map(el => (el.innerText || '').replace(/\u00A0/g, ' ').trim()).filter(Boolean);
    return lines.length ? lines.join('\n') : null;
  };

  const bestTextNode = turn => {
    let best = turn || null;
    let length = -1;
    for (const node of turn?.querySelectorAll?.(SELECTORS.text.join(',')) || []) {
      const current = (node.innerText || '').length;
      if (current > length) { best = node; length = current; }
    }
    return best;
  };

  // `enviarVerificado` (relay-core.js) confirma un envío comparando
  // `getUserTurnCount()` antes/después de clickear Send. El conteo real del
  // DOM de Qwen (`.chat-user-message`) es una fuente NO CONFIABLE para esto:
  // confirmado en vivo, se queda pegado (no sube) minutos después de un
  // envío real que sí se ve en pantalla — probablemente porque el turno
  // queda renderizado dentro de un contenedor de comparación/regenerar que
  // el selector no alcanza. Sin una señal de "ya envié" que no dependa del
  // DOM de Qwen, `enviarVerificado` nunca confirma, agota los 30s, y el
  // courier (`provider-relay.js`) reintenta la entrega COMPLETA — cada
  // reintento es un clic real nuevo sobre el mismo texto, entrando a la
  // cuenta real del usuario cada ~30s PARA SIEMPRE (nadie pidió nada, pero
  // seguía mandando). Este contador lo bumpeamos NOSOTROS, en el momento
  // exacto en que `act.submit()` clickea de verdad — así el conteo sube en
  // el mismo tick que el clic, sin esperar a que Qwen renderice nada.
  let internalSentBump = 0;

  const observe = Object.freeze({
    getInput: () => first(SELECTORS.input),
    getSendControl: () => first(SELECTORS.send),
    getStopControl: () => first(SELECTORS.stop),
    getLatestAssistant: () => all(SELECTORS.assistant).at(-1) || null,
    getAssistantTurns: () => all(SELECTORS.assistant),
    getUserTurns: () => all(SELECTORS.user),
    getUserTurnCount: () => all(SELECTORS.user).length + internalSentBump,
    getNewUserTurnIds: () => [],
    findAssistantAfterUserIds: () => null,
    getTextNode: bestTextNode,
    // "Thinking completed"/"Thinking" es la etiqueta de estado que Qwen
    // antepone al turno (equivalente al "Thinking"/"Reasoning" de ChatGPT) —
    // no es parte de la respuesta real, se descarta antes de leer el texto.
    //
    // Bloques de código: Qwen los renderiza con Monaco Editor (el editor de
    // VS Code), DOM virtualizado — su innerText normal mezcla la etiqueta de
    // lenguaje ("json") y el gutter de números de línea ("1") JUNTO con el
    // código real ("json\n1\n{...}"), lo que rompía la detección de tool
    // calls de JSON Family (nunca veía un `{"tool":...}` limpio). `.view-lines`
    // es el área interna de Monaco que tiene SOLO el texto real, confirmado
    // en vivo. Si hay bloques de código, se reconstruyen como fence ```json
    // — un turno de tool call es solo el bloque (regla del primer: nada
    // después), así que no hace falta preservar prosa alrededor.
    readAssistant: turn => {
      const code = monacoText(turn);
      if (code) return '```json\n' + code + '\n```';
      const node = bestTextNode(turn);
      const raw = (node?.innerText || '').trim();
      return raw.replace(/^Thinking(?: completed)?\s*\n?/i, '').trim();
    },
    // Hook de `domToMarkdown` (relay-core.js) para el camino separado de
    // `AURORA_CLOUD_ASK` (Lyra preguntandole algo directo a Qwen) -- ese
    // camino arma la respuesta final con domToMarkdown generico, no con
    // `readAssistant`, y sin este hook leia el `pre.qwen-markdown-code` crudo
    // (gutter + NBSP incluidos) para cualquier bloque de codigo en la
    // respuesta, no solo para tool calls.
    readCodeBlockText: node => monacoText(node),
    getTurnId: turn => turn?.getAttribute?.('data-message-id') || turn?.id || '',
    isGenerating: () => Boolean(first(SELECTORS.stop)),
    isComplete: () => false,
    getConversationKey: () => location.pathname,
    getConversationTitle: () => document.title,
    isNewConversationReady: () => false,
    getGeneratedImages: () => [],
    getGeneratedImageSources: () => [],
    isGeneratedImagePending: () => false,
  });

  // Con `getUserTurnCount()` bumpeado por nosotros mismos en el clic real
  // (ver arriba), ya no hace falta ningún cooldown: el primer clic real ya
  // deja el conteo "arriba", `enviarVerificado` lo ve en el siguiente poll
  // (~180ms) y nunca vuelve a llamar `submit()` para ese mismo envío. Un
  // solo guard de texto (por si el input aún no se vació) evita reclickear
  // MIENTRAS seguimos dentro del mismo ciclo síncrono.
  let lastSubmittedValue = null;

  const act = Object.freeze({
    // Qwen usa un <textarea> controlado (React/similar) — asignar `.value`
    // directo (o vía execCommand) no le avisa al framework que hay texto
    // real: el botón de enviar queda mostrando "Voice mode" para siempre y
    // nada se manda. Confirmado en vivo: el setter nativo del prototipo +
    // un InputEvent con `data`/`inputType` reales + un `change` de cierre SÍ
    // hace que el framework reconozca el texto y muestre el botón "Send"
    // real.
    insertText(input, text) {
      if (!input) return false;
      input.focus();
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      if (setter) setter.call(input, text);
      else input.value = text;
      input.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    },
    submit(input = observe.getInput()) {
      const value = input?.value || '';
      // Caja vacía: o ya se mandó de verdad (React vació el textarea) o no
      // hay nada que enviar. `enviarVerificado` (relay-core.js) interpreta
      // `false` acá como "no se pudo, forzar" y cae a su fallback genérico
      // (click de cualquier botón visible o, si no hay, Enter a ciegas) —
      // confirmado en vivo: eso dispara Enter cada 180–500ms durante 30s
      // seguidos sobre la caja vacía, y Qwen responde con SU PROPIO toast de
      // validación "Please enter a prompt or upload a file" una y otra vez
      // (decenas de toasts apilados, visibles en la cuenta real). Devolver
      // `true` acá (nada más que hacer, no forzar nada) es lo que corta el
      // fallback de raíz.
      if (!value) { lastSubmittedValue = null; return true; }
      // Mismo texto que el último clic real y la caja TODAVÍA no se vació:
      // ya lo mandamos, no hay que repetirlo mientras React tarda en
      // limpiar el textarea. En cuanto la caja se vacíe (rama de arriba),
      // este guard se resetea solo — un mensaje futuro con el mismo texto
      // literal no queda bloqueado para siempre.
      if (value === lastSubmittedValue) return true;
      // El framework de Qwen a veces no llega a reconocer el texto como
      // "real" a tiempo (el botón real de enviar recién aparece cuando lo
      // hace — antes de eso, el mismo lugar muestra "Voice mode"). Re-
      // disparar el registro acá, justo antes del intento real, es un
      // empujón barato y sin efecto si ya estaba bien.
      input.dispatchEvent(new InputEvent('input', { bubbles: true, data: value, inputType: 'insertText' }));
      const button = observe.getSendControl();
      // Botón ausente/disabled (Qwen todavía generando la respuesta previa,
      // o el texto aún no fue reconocido como "real"): mismo motivo que
      // arriba, `false` acá dispara el Enter-a-ciegas del caller y spamea el
      // toast de validación de Qwen. `true` deja que el polling de
      // `enviarVerificado` siga esperando sin forzar nada.
      if (!button) return true;
      button.click();
      // Bump SINCRÓNICO con el clic real — ver comentario de
      // `internalSentBump` junto a `getUserTurnCount` más arriba.
      internalSentBump += 1;
      lastSubmittedValue = value;
      return true;
    },
    stopGeneration() {
      const button = observe.getStopControl();
      if (!button) return false;
      button.click(); return true;
    },
  });

  const adapter = Object.freeze({
    id: 'qwen', version: 1,
    matches: loc => /(^|\.)chat\.qwen\.ai$/i.test(loc.hostname),
    capabilities: Object.freeze({ text: true, images: false, files: false, newChat: false, streaming: true }),
    policies: Object.freeze({ authoritativeStop: false, anchorAfterUser: false, sequentialAttachments: false }),
    observe, act,
  });

  globalThis.__auroraRelayV2?.registerProvider(adapter);
  document.documentElement.dataset[typeof chrome !== 'undefined' && chrome.runtime ? 'auroraRelayProviderIsolated' : 'auroraRelayProviderMain'] = `${adapter.id}@${adapter.version}`;
  document.documentElement.dataset.auroraRelayProvider = JSON.stringify({ id: adapter.id, version: adapter.version, capabilities: adapter.capabilities });
})();
