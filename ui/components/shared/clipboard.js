// Usa __aurora_bgRequest inyectado por boot.js — no reimporta ext-bridge.js.

export async function copiarTexto(texto = '') {
  const value = String(texto ?? '');

  // Dentro de extensión → relay al background que tiene clipboardWrite real
  if (globalThis.__aurora_enExtension?.value && globalThis.__aurora_bgRequest) {
    try {
      await globalThis.__aurora_bgRequest({ type: 'CLIPBOARD_WRITE', text: value });
      return true;
    } catch (_) {}
  }

  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(value); return true; } catch (_) {}
  }

  const el = document.createElement('textarea');
  el.value = value;
  el.setAttribute('readonly', '');
  el.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
  document.body.appendChild(el);
  el.select();
  try { document.execCommand('copy'); return true; }
  finally { document.body.removeChild(el); }
}

export async function leerTexto() {
  if (globalThis.__aurora_enExtension?.value && globalThis.__aurora_bgRequest) {
    try {
      const res = await globalThis.__aurora_bgRequest({ type: 'CLIPBOARD_READ' });
      if (res?.text !== undefined) return res.text;
    } catch (_) {}
  }
  if (navigator.clipboard?.readText) return navigator.clipboard.readText();
  return '';
}
