// Provider driver: Grok (grok.com). Todo conocimiento de su DOM vive aquí.
(() => {
  'use strict';

  const SELECTORS = Object.freeze({
    assistant: ['[data-testid="assistant-message"]'],
    user: ['[data-testid="user-message"]'],
    input: ['[data-testid="chat-input"] div[contenteditable="true"]'],
    send: ['[data-testid="chat-submit"]'],
    stop: ['button[aria-label="Stop model response"]'],
    text: ['.response-content-markdown'],
    fileInput: ['input[type="file"]'],
    attachmentPreview: ['[data-testid^="asset-"]'],
  });

  const first = (selectors, root = document) => selectors.map(s => root.querySelector(s)).find(Boolean) || null;
  const all = (selectors, root = document) => [...root.querySelectorAll(selectors.join(','))];
  const stopControl = (root = document) => {
    const button = first(SELECTORS.stop, root);
    return button?.isConnected && !button.hidden && button.getAttribute('aria-hidden') !== 'true' ? button : null;
  };
  // Ni user-message ni assistant-message traen id propio, pero el wrapper que
  // los envuelve (uno por turno, usuario Y asistente por separado, cada uno
  // con el SUYO) sí trae `id="response-<uuid>"` — confirmado en vivo: turno
  // de usuario y su respuesta tienen ids distintos (no comparten, a
  // diferencia de Gemini), y el de la respuesta coincide con el `rid=` de la
  // URL de esa conversación.
  const turnId = turn => turn?.closest?.('[id^="response-"]')?.id || '';
  const bestTextNode = turn => {
    let best = turn || null, length = -1;
    for (const node of turn?.querySelectorAll?.(SELECTORS.text.join(',')) || [turn].filter(Boolean)) {
      const current = (node.innerText || '').length;
      if (current > length) { best = node; length = current; }
    }
    return best;
  };
  // Grok resalta código con Shiki: el <pre> trae class="shiki ..." sin
  // language-* estándar en el <code> (confirmado en vivo, class vacía) — el
  // lenguaje real vive como texto plano en un <span> hermano en el header
  // del bloque (ej. "Python", con mayúscula). Sin este hook, domToMarkdown
  // no encuentra lenguaje y el fence sale sin resaltar en Lyra.
  const GROK_LANG_LABELS = new Set([
    'python', 'javascript', 'typescript', 'go', 'golang', 'rust', 'json',
    'bash', 'shell', 'sh', 'java', 'c++', 'c#', 'c', 'html', 'css', 'sql',
    'ruby', 'php', 'kotlin', 'swift', 'plaintext', 'text', 'yaml', 'markdown',
  ]);
  const grokLangLabel = preEl => {
    const header = preEl.closest('[data-testid="code-block"]')?.querySelector('span');
    const texto = (header?.textContent || '').trim().toLowerCase();
    if (GROK_LANG_LABELS.has(texto)) return texto === 'golang' ? 'go' : texto;
    return '';
  };

  const observe = Object.freeze({
    getInput: () => first(SELECTORS.input),
    getSendControl: () => { const b = first(SELECTORS.send); return b && !b.disabled ? b : null; },
    getStopControl: stopControl,
    getLatestAssistant: () => all(SELECTORS.assistant).at(-1) || null,
    getAssistantTurns: () => all(SELECTORS.assistant),
    getUserTurns: () => all(SELECTORS.user),
    getUserTurnCount: () => all(SELECTORS.user).length,
    getNewUserTurnIds: baseline => all(SELECTORS.user).map(node => turnId(node)).filter(id => id && !baseline?.has(id)),
    findAssistantAfterUserIds(ids, turns = all(SELECTORS.assistant)) {
      const users = all(SELECTORS.user).filter(node => ids?.includes(turnId(node)));
      const user = users.at(-1);
      return user ? turns.filter(turn => user.compareDocumentPosition(turn) & Node.DOCUMENT_POSITION_FOLLOWING).at(-1) || null : null;
    },
    getTextNode: bestTextNode,
    // El mismo <span> de header que da el lenguaje del fence (arriba) queda
    // además como texto suelto DENTRO del flujo normal para domToMarkdown
    // (no es hijo del <pre>, es hermano) — confirmado en vivo: aparece
    // duplicado como línea propia justo antes del fence real. A diferencia
    // de Claude (siempre al inicio del turno), acá puede aparecer después de
    // prosa real, así que se recorta cualquier ocurrencia, no solo la primera.
    readAssistant: turn => {
      const node = bestTextNode(turn);
      const domToMarkdown = globalThis.__auroraRelayV2?.utils?.domToMarkdown;
      const raw = (domToMarkdown ? domToMarkdown(node, { detectLang: grokLangLabel }) : (node?.innerText || '')).trim();
      return raw.replace(/\n([A-Za-z][\w+#-]*)\n+```([\w+#-]+)\b/g,
        (whole, label, fenceLang) => label.toLowerCase() === fenceLang.toLowerCase() ? '\n```' + fenceLang : whole);
    },
    getTurnId: turnId,
    isGenerating: () => Boolean(stopControl()),
    // Sin señal de "completo" propia observada en vivo (ni data-attribute ni
    // footer) — igual que ChatGPT, la ausencia de Stop es la única fuente de
    // verdad real (ver policies.authoritativeStop).
    isComplete: () => false,
    getConversationKey: () => location.pathname,
    getConversationTitle: () => document.title,
    isNewConversationReady(snapshot) {
      const count = all(SELECTORS.assistant).length;
      const routeClean = !/^\/c\//.test(location.pathname);
      return Boolean(observe.getInput() && !stopControl() && (count === 0 || count < (snapshot?.beforeCount || 0)) && (routeClean || location.href !== snapshot?.beforeUrl));
    },
    getGeneratedImages: () => [], getGeneratedImageSources: () => [], isGeneratedImagePending: () => false,
    detectCodeLang: grokLangLabel,
  });

  const act = Object.freeze({
    insertText(input, text) {
      if (!input) return false;
      input.focus();
      const range = document.createRange();
      range.selectNodeContents(input);
      range.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      const inserted = document.execCommand('insertText', false, text);
      if (!inserted || !input.innerText?.trim()) {
        input.innerText = text;
        input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
      }
      return true;
    },
    submit(input = observe.getInput()) {
      const button = observe.getSendControl();
      if (button) { button.click(); return true; }
      return globalThis.__auroraRelayV2?.utils?.dispatchEnter(input) || false;
    },
    stopGeneration() { const button = stopControl(); if (!button || button.disabled) return false; button.click(); return true; },
    // El input de archivo real es un <input type="file" class="hidden"
    // multiple name="files"> sin data-testid propio (único en la página,
    // confirmado en vivo) — igual mecanismo que Claude: asignar un
    // DataTransfer a .files y disparar "change" (pegar sobre el composer no
    // se probó necesario, este camino ya generó un preview real con nombre,
    // tamaño e icono correctos).
    async attachFiles(payload) {
      const utils = globalThis.__auroraRelayV2?.utils;
      const files = await utils.normalizeAttachments(payload);
      if (!files.length) return true;
      const input = first(SELECTORS.fileInput);
      if (!input) return false;
      const before = all(SELECTORS.attachmentPreview).length;
      const transfer = new DataTransfer();
      files.forEach(file => transfer.items.add(file));
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      const accepted = await utils.waitFor(() => all(SELECTORS.attachmentPreview).length > before, { timeoutMs: 10000 });
      if (!accepted) return false;
      const uploading = () => all(SELECTORS.attachmentPreview).some(preview =>
        preview.querySelector?.('[role="progressbar"], [class*="spinner" i], [class*="loading" i], [class*="progress" i]'));
      const ready = await utils.waitFor(() => !uploading(), { timeoutMs: 20000 });
      if (!ready) return false;
      return all(SELECTORS.attachmentPreview).length > before && !uploading();
    },
    startNewConversation: () => { location.assign('/'); return true; },
  });

  const adapter = Object.freeze({
    id: 'grok', version: 1,
    matches: loc => /(^|\.)grok\.com$/i.test(loc.hostname),
    capabilities: Object.freeze({ text: true, images: true, files: true, newChat: true, streaming: true }),
    policies: Object.freeze({ authoritativeStop: true, anchorAfterUser: true, sequentialAttachments: false }),
    observe, act,
  });
  globalThis.__auroraRelayV2?.registerProvider(adapter);
  document.documentElement.dataset[typeof chrome !== 'undefined' && chrome.runtime ? 'auroraRelayProviderIsolated' : 'auroraRelayProviderMain'] = `${adapter.id}@${adapter.version}`;
  document.documentElement.dataset.auroraRelayProvider = JSON.stringify({ id: adapter.id, version: adapter.version, capabilities: adapter.capabilities });
})();
