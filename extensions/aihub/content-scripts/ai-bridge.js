// Aurora Hub — AI Bridge Content Script
// Corre en: ChatGPT, Claude, Gemini, Grok, Perplexity, Copilot, Kimi
// Función: recibir texto del background/sidepanel e inyectarlo en el input del AI.

(function () {
  'use strict';

  // Selectores de input por dominio
  const INPUT_SELECTORS = [
    '#prompt-textarea',                           // ChatGPT
    '[data-testid="composer-code-input"]',         // Claude
    'div[contenteditable="true"][aria-label]',     // Gemini
    'textarea[placeholder]',                       // genérico
    'div[contenteditable="true"]',                 // genérico contenteditable
  ];

  // Selectores de botón enviar
  const SEND_SELECTORS = [
    'button[data-testid="send-button"]',
    'button[aria-label*="Send"]',
    'button[aria-label*="Enviar"]',
    'button[type="submit"]',
  ];

  function findInput() {
    for (const sel of INPUT_SELECTORS) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function injectText(el, text) {
    el.focus();
    if (el.getAttribute('contenteditable') === 'true') {
      document.execCommand('selectAll', false, null);
      const ok = document.execCommand('insertText', false, text);
      if (!ok || !el.innerText?.trim()) {
        el.innerText = '';
        el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
        el.innerText = text;
        el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
      }
    } else {
      try {
        const proto  = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        setter ? setter.call(el, text) : (el.value = text);
      } catch { el.value = text; }
      el.dispatchEvent(new Event('input',  { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  function clickSend() {
    for (const sel of SEND_SELECTORS) {
      const btn = document.querySelector(sel);
      if (btn && !btn.disabled) { btn.click(); return true; }
    }
    // Fallback: Enter en el input
    const input = findInput();
    if (input) {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, shiftKey: false }));
      return true;
    }
    return false;
  }

  // Escuchar mensajes del background
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'AURORA_INJECT_TEXT') {
      const el = findInput();
      if (!el) { sendResponse({ ok: false, error: 'Input no encontrado' }); return true; }
      injectText(el, msg.text || '');
      if (msg.send) {
        setTimeout(() => clickSend(), 100);
      }
      sendResponse({ ok: true });
      return true;
    }

    if (msg.type === 'AURORA_GET_PAGE_TEXT') {
      sendResponse({ ok: true, text: document.body.innerText?.trim().slice(0, 20000) || '' });
      return true;
    }
  });

  // Notificar al background que el content script está listo en esta pestaña
  chrome.runtime.sendMessage({ type: 'AURORA_CS_READY', url: location.href, host: location.hostname }).catch(() => {});

})();
