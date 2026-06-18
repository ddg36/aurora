let _cont = null;

function ensureCont() {
  if (_cont && document.body.contains(_cont)) return _cont;
  _cont = document.createElement('div');
  _cont.style.cssText = 'position:fixed;bottom:18px;left:50%;transform:translateX(-50%);z-index:99999;display:flex;flex-direction:column;gap:6px;align-items:center;pointer-events:none;';
  document.body.appendChild(_cont);
  return _cont;
}

const COLORES = {
  info:    'var(--aurora-accent, #8b5cf6)',
  error:   'var(--aurora-error, #ef4444)',
  warning: 'var(--aurora-warning, #f59e0b)',
  success: 'var(--aurora-success, #22c55e)',
};

export const Toast = {
  show(msg, tipo = 'info', ms = 2000) {
    const cont = ensureCont();
    const el = document.createElement('div');
    el.textContent = msg;
    el.style.cssText = `background:var(--aurora-surface-2, #1a1a24);color:var(--aurora-text, #e5e5ea);border:1px solid ${COLORES[tipo] || COLORES.info};border-radius:8px;padding:6px 14px;font-size:12px;box-shadow:0 4px 16px rgba(0,0,0,.4);opacity:0;transition:opacity .15s;max-width:70vw;`;
    cont.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = '1'; });
    setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 200);
    }, ms);
  },
  setStatus(msg, ms = 2000) {
    const tipo = /^⚠|^✗|error/i.test(String(msg)) ? 'warning' : 'info';
    Toast.show(msg, tipo, ms);
  },
};

globalThis.Toast = Toast;
