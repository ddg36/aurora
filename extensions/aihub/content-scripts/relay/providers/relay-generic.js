// Driver conservador para proveedores aún no certificados.
(() => {
  'use strict';
  const SELECTORS = Object.freeze({
    assistant: ['.font-claude-message', 'message-content'],
    input: ['div[contenteditable="true"][aria-label]', 'div[contenteditable="true"][data-testid]', 'div[contenteditable="true"][role="textbox"]', 'div[contenteditable="true"]', 'textarea[placeholder]', 'textarea[aria-label*="chat" i]', 'textarea[aria-label*="message" i]'],
    send: ['button[aria-label*="Send" i]', 'button[aria-label*="Enviar" i]', 'form button[type="submit"]', 'button[title*="send" i]'],
    stop: ['button[aria-label*="Stop" i]', 'button[aria-label*="Detener" i]', 'button[aria-label*="Parar" i]', 'button[data-testid*="stop" i]'],
    text: ['.markdown', '.pending', '.prose'],
  });
  const first = (list, root = document) => list.map(s => root.querySelector(s)).find(Boolean) || null;
  const all = list => [...document.querySelectorAll(list.join(','))];
  const getTextNode = turn => all.call(null, SELECTORS.text).filter(node => turn?.contains?.(node))
    .sort((a, b) => (b.innerText || '').length - (a.innerText || '').length)[0] || turn;
  const observe = Object.freeze({
    getInput: () => first(SELECTORS.input),
    getSendControl: () => first(SELECTORS.send),
    getStopControl: () => first(SELECTORS.stop),
    getLatestAssistant: () => all(SELECTORS.assistant).at(-1) || null,
    getAssistantTurns: () => all(SELECTORS.assistant), getUserTurns: () => [], getUserTurnCount: () => 0,
    getNewUserTurnIds: () => [], findAssistantAfterUserIds: () => null,
    getTextNode, readAssistant: turn => (getTextNode(turn)?.innerText || '').trim(),
    getTurnId: turn => turn?.getAttribute?.('data-message-id') || turn?.getAttribute?.('data-turn-id') || turn?.id || '',
    isGenerating: () => Boolean(first(SELECTORS.stop)), isComplete: () => false,
    getConversationKey: () => location.pathname, isNewConversationReady: () => false,
    getGeneratedImages: () => [], getGeneratedImageSources: () => [], isGeneratedImagePending: () => false,
  });
  const act = Object.freeze({
    insertText(input, text) {
      if (!input) return false;
      input.focus(); document.execCommand('selectAll', false, null);
      const ok = document.execCommand('insertText', false, text);
      if (!ok) { input.innerText = text; input.dispatchEvent(new InputEvent('input', { bubbles: true, data: text })); }
      return true;
    },
    submit(input = observe.getInput()) { const button = observe.getSendControl(); if (button) { button.click(); return true; } return globalThis.__auroraRelayV2?.utils?.dispatchEnter(input) || false; },
    stopGeneration() { const button = observe.getStopControl(); if (!button) return false; button.click(); return true; },
  });
  const adapter = Object.freeze({
    id: 'generic', version: 2, matches: () => true,
    capabilities: Object.freeze({ text: true, images: false, files: false, newChat: false, streaming: true }),
    policies: Object.freeze({ authoritativeStop: false, anchorAfterUser: false, sequentialAttachments: false }),
    observe, act,
  });
  globalThis.__auroraRelayV2?.registerProvider(adapter);
  document.documentElement.dataset[typeof chrome !== 'undefined' && chrome.runtime ? 'auroraRelayProviderIsolated' : 'auroraRelayProviderMain'] = `${adapter.id}@${adapter.version}`;
  document.documentElement.dataset.auroraRelayProvider = JSON.stringify({ id: adapter.id, version: adapter.version, capabilities: adapter.capabilities });
})();
