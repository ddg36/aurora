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

  // Reconstruye markdown fiel desde el DOM renderizado (código, negrita,
  // cursiva, headings, listas, tablas, enlaces) — un readAssistant basado en
  // innerText pierde toda esa estructura: negrita sin asteriscos, código sin
  // fences, y listas numeradas SIN el número real (el navegador lo pinta por
  // CSS/list-style, invisible al texto plano).
  // detectLang(preEl) es un hook opcional por-proveedor (cada sitio marca el
  // lenguaje de un modo distinto y a veces sin clase language-* estándar);
  // domToMarkdown en sí no conoce el DOM de ningún proveedor en particular.
  function domToMarkdown(root, { detectLang } = {}) {
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
        const lang = m ? m[1] : (detectLang?.(node) || '');
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
          for (const child of li.childNodes) {
            if (child.nodeType === Node.TEXT_NODE && !child.textContent?.trim()) continue;
            const childTag = child.nodeType === Node.ELEMENT_NODE ? child.tagName.toLowerCase() : '';
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
    // ChatGPT (y otros) generan cada punto de una lista como un <ol>/<ul>
    // SEPARADO (uno por ítem, cortado por su párrafo de explicación), usando
    // el atributo HTML `start` para que el navegador los numere en secuencia
    // — invisible al recorrer el DOM elemento por elemento. Sin esto, cada
    // <ol> aislado reinicia en "1." acá también. Se detecta la secuencia de
    // marcadores numerados consecutivos (con párrafos intercalados, sin
    // heading/bullet que corte) y se renumera en el texto ya generado.
    const md = out.join('').replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n').trim();
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

  relay.utils = Object.freeze({ sleep, waitFor, fingerprint, dispatchEnter, dataUrlToFile, normalizeAttachments, pasteFiles, domToMarkdown });
})();
