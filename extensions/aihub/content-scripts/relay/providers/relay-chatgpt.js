// Provider driver: ChatGPT. Todo conocimiento de su DOM vive aquí.
(() => {
  'use strict';

  const SELECTORS = Object.freeze({
    assistant: ['[data-message-author-role="assistant"]', '[data-testid="conversation-turn-assistant"]'],
    user: ['[data-message-author-role="user"]'],
    input: ['#prompt-textarea', 'div[contenteditable="true"][data-testid]', 'div[contenteditable="true"][role="textbox"]', 'div[contenteditable="true"]', 'textarea[placeholder]'],
    send: ['button[data-testid="send-button"]', 'button[aria-label*="Send" i]', 'button[aria-label*="Enviar" i]', 'form button[type="submit"]', 'button[title*="send" i]'],
    stop: ['button[data-testid="stop-button"]', 'button[aria-label*="Stop" i]', 'button[aria-label*="Detener" i]'],
    text: ['.markdown', '.prose'],
    generatedImage: ['[class*="imagegen"] img', '[data-testid*="image"] img', '.group\\/imagegen-image img'],
    imageWork: ['[class*="imagegen"]', '[class*="image-gen"]'],
    attachmentPreview: ['[data-testid*="preview" i]', '[class*="attachment" i]', 'button[aria-label^="Remove file" i]', 'button[aria-label^="Remove image" i]', 'button[aria-label^="Quitar archivo" i]'],
  });

  const first = (selectors, root = document) => selectors.map(s => root.querySelector(s)).find(Boolean) || null;
  const all = (selectors, root = document) => [...root.querySelectorAll(selectors.join(','))];
  const visibleStop = (root = document) => {
    const button = first(SELECTORS.stop, root);
    return button?.isConnected && !button.hidden && button.getAttribute('aria-hidden') !== 'true' ? button : null;
  };
  // ChatGPT no marca el lenguaje de un bloque de código con la clase estándar
  // language-* (el <code> queda sin className) — lo muestra como texto plano
  // en el header del bloque ("Python", "JavaScript") sin selector ni
  // data-attribute dedicado. Sin esto, domToMarkdown no captura el fence con
  // lenguaje y el resaltado de sintaxis de Lyra (highlightCode) no tiene nada
  // que resaltar: el código sale plano aunque ChatGPT lo pinte con colores.
  // Heurística por posición, no por clase (frágil, cambia con cada rediseño
  // de ChatGPT): el primer nodo de texto corto DENTRO del <pre>, antes del
  // primer <button> del header (evita capturar contenido real del código).
  const CHATGPT_LANG_LABELS = new Set([
    'python', 'javascript', 'typescript', 'go', 'golang', 'rust', 'json',
    'bash', 'shell', 'sh', 'java', 'c++', 'c#', 'c', 'html', 'css', 'sql',
    'ruby', 'php', 'kotlin', 'swift', 'plaintext', 'text',
  ]);
  const chatgptLangLabel = preEl => {
    // El div del label trae un <svg> decorativo antes del texto ("Python"),
    // así que NO es un nodo hoja — filtrar por "sin hijos" lo excluía siempre.
    // Comparar el textContent completo (incluye el texto vacío del svg + el
    // nombre) contra la lista conocida, sin exigir estructura.
    for (const el of preEl.querySelectorAll('div, span')) {
      const texto = (el.textContent || '').trim().toLowerCase();
      if (CHATGPT_LANG_LABELS.has(texto)) return texto === 'golang' ? 'go' : texto;
    }
    return '';
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
  const generatedImages = ({ includePending = false } = {}) => all(SELECTORS.generatedImage)
    .filter(img => includePending || ((img.naturalWidth || img.width || 0) > 200 && img.complete))
    .map(img => img.src).filter(src => src && !src.startsWith('data:'));

  const observe = Object.freeze({
    getInput: () => first(SELECTORS.input),
    getSendControl: ({ visible = false } = {}) => SELECTORS.send.map(selector => document.querySelector(selector))
      .find(button => button && !button.disabled && (!visible || button.offsetParent !== null)) || null,
    getStopControl: visibleStop,
    getLatestAssistant: () => all(SELECTORS.assistant).at(-1) || null,
    getAssistantTurns: () => all(SELECTORS.assistant),
    getUserTurns: () => all(SELECTORS.user),
    getUserTurnCount: () => all(SELECTORS.user).length,
    getNewUserTurnIds: baseline => all(SELECTORS.user).map(node => node.dataset.messageId).filter(id => id && !baseline?.has(id)),
    findAssistantAfterUserIds(ids, turns = all(SELECTORS.assistant)) {
      const users = all(SELECTORS.user).filter(node => ids?.includes(node.dataset.messageId));
      const user = users.at(-1);
      return user ? turns.filter(turn => user.compareDocumentPosition(turn) & Node.DOCUMENT_POSITION_FOLLOWING).at(-1) || null : null;
    },
    getTextNode: bestTextNode,
    // Markdown fiel del DOM, no innerText plano: ChatGPT arma cada punto de
    // una lista como <ol> separado con `start` (invisible al texto plano) y
    // renderiza negrita/código/headings que innerText degrada a texto suelto.
    readAssistant: turn => {
      const node = bestTextNode(turn);
      const domToMarkdown = globalThis.__auroraRelayV2?.utils?.domToMarkdown;
      return (domToMarkdown ? domToMarkdown(node, { detectLang: chatgptLangLabel }) : (node?.innerText || '')).trim();
    },
    getTurnId: turn => turn?.getAttribute?.('data-message-id') || turn?.getAttribute?.('data-turn-id') || turn?.id || '',
    isGenerating: () => Boolean(visibleStop()),
    isComplete: () => false,
    getConversationKey: () => location.pathname,
    isNewConversationReady(snapshot) {
      const routeClean = !/^\/c\//.test(location.pathname);
      const count = all(SELECTORS.assistant).length;
      return Boolean(observe.getInput() && (count === 0 || count < (snapshot?.beforeCount || 0)) && (routeClean || location.href !== snapshot?.beforeUrl));
    },
    getGeneratedImages: () => generatedImages(),
    getGeneratedImageSources: () => generatedImages({ includePending: true }),
    isGeneratedImagePending: () => Boolean(first(SELECTORS.imageWork)) && generatedImages().length === 0,
    detectCodeLang: chatgptLangLabel,
  });

  const act = Object.freeze({
    insertText(input, text) {
      if (!input) return false;
      input.focus();
      if (input.getAttribute('contenteditable') === 'true') {
        document.execCommand('selectAll', false, null);
        const inserted = document.execCommand('insertText', false, text);
        if (!inserted || !input.innerText?.trim()) {
          input.innerText = text;
          input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
        }
      } else {
        input.value = text;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      return true;
    },
    submit(input = observe.getInput()) {
      const button = SELECTORS.send.map(s => document.querySelector(s)).find(b => b && !b.disabled && !visibleStop(b));
      if (button) { button.click(); return true; }
      return globalThis.__auroraRelayV2?.utils?.dispatchEnter(input) || false;
    },
    stopGeneration() {
      const button = visibleStop();
      if (!button || button.disabled) return false;
      button.click(); return true;
    },
    async attachFiles(payload) {
      const utils = globalThis.__auroraRelayV2?.utils;
      const files = await utils.normalizeAttachments(payload);
      for (const file of files) {
        const before = all(SELECTORS.attachmentPreview).length;
        utils.pasteFiles(observe.getInput(), [file]);
        const accepted = await utils.waitFor(() => all(SELECTORS.attachmentPreview).length > before, { timeoutMs: 6000 });
        if (!accepted) return false;
        await utils.sleep(file.type?.startsWith('image/') ? 3000 : 5000);
      }
      return true;
    },
    startNewConversation: () => { location.assign('/'); return true; },
  });

  const adapter = Object.freeze({
    id: 'chatgpt', version: 2,
    matches: loc => /(^|\.)(chatgpt\.com|chat\.openai\.com)$/i.test(loc.hostname),
    capabilities: Object.freeze({ text: true, images: true, files: true, newChat: true, streaming: true }),
    policies: Object.freeze({ authoritativeStop: true, anchorAfterUser: true, sequentialAttachments: true, attachmentSettleMs: { image: 3000, file: 5000 } }),
    observe, act,
  });

  globalThis.__auroraRelayV2?.registerProvider(adapter);
  document.documentElement.dataset[typeof chrome !== 'undefined' && chrome.runtime ? 'auroraRelayProviderIsolated' : 'auroraRelayProviderMain'] = `${adapter.id}@${adapter.version}`;
  document.documentElement.dataset.auroraRelayProvider = JSON.stringify({ id: adapter.id, version: adapter.version, capabilities: adapter.capabilities });
})();
