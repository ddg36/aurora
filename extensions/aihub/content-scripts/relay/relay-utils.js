// Utilidades puras del motor; no conocen dominios ni selectores de proveedor.
(() => {
  'use strict';
  const relay = globalThis.__auroraRelayV2 ||= {};

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  async function waitFor(resolver, { timeoutMs = 20000, intervalMs = 100, signal } = {}) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (signal?.aborted || signal?.cancelled) return null;
      const value = await resolver();
      if (value) return value;
      await sleep(intervalMs);
    }
    return null;
  }

  function fingerprint(text) {
    let hash = 5381;
    const value = String(text || '');
    for (let index = 0; index < value.length; index++) hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
    return (hash >>> 0).toString(36);
  }

  function dispatchEnter(element) {
    if (!element) return false;
    for (const type of ['keydown', 'keyup']) element.dispatchEvent(new KeyboardEvent(type, {
      key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
      bubbles: true, cancelable: true, composed: true,
    }));
    return true;
  }

  async function dataUrlToFile(dataUrl, name, typeFallback = 'application/octet-stream') {
    const url = String(dataUrl || '').startsWith('data:') ? dataUrl : `data:${typeFallback};base64,${dataUrl}`;
    const comma = url.indexOf(',');
    if (comma < 0) throw new Error('data URL inválida');
    const meta = url.slice(5, comma);
    const mime = meta.split(';')[0] || typeFallback;
    const encoded = url.slice(comma + 1);
    let bytes;
    if (/;base64(?:;|$)/i.test(meta)) {
      const binary = atob(encoded);
      bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    } else bytes = new TextEncoder().encode(decodeURIComponent(encoded));
    return new File([bytes], name, { type: mime });
  }

  async function normalizeAttachments({ images = [], files = [] } = {}) {
    const normalized = [];
    for (let index = 0; index < images.length; index++) {
      normalized.push(await dataUrlToFile(images[index], `img-${index}.png`, 'image/png'));
    }
    for (let index = 0; index < files.length; index++) {
      const file = files[index] || {};
      normalized.push(typeof file.content === 'string' && file.content.startsWith('data:')
        ? await dataUrlToFile(file.content, file.name || `file-${index}`, file.type)
        : new File([file.content || ''], file.name || `file-${index}.txt`, { type: file.type || 'text/plain' }));
    }
    return normalized;
  }

  function pasteFiles(input, files) {
    if (!input || !files.length) return false;
    const transfer = new DataTransfer();
    files.forEach(file => transfer.items.add(file));
    try { input.focus(); } catch (_) {}
    return input.dispatchEvent(new ClipboardEvent('paste', {
      bubbles: true, cancelable: true, composed: true, clipboardData: transfer,
    }));
  }

  relay.utils = Object.freeze({ sleep, waitFor, fingerprint, dispatchEnter, dataUrlToFile, normalizeAttachments, pasteFiles });
})();
