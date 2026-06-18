const html = (...args) => globalThis.html(...args);
const { useState, useEffect } = globalThis.preactHooks;

import { getJSON, postJSON } from '../../components/shared/api.js';

function tokenActual() {
  return localStorage.getItem('aurora_token') || '';
}

async function aplicarToken(token) {
  localStorage.setItem('aurora_token', token);
  location.reload();
}

export function UserSwitcher({ onClose }) {
  const [usuarios, setUsuarios] = useState([]);
  const [yo, setYo] = useState(null);
  const [nuevo, setNuevo] = useState('');
  const [error, setError] = useState('');

  const cargar = () => {
    getJSON('/db/usuarios/list').then(setUsuarios).catch(() => setUsuarios([]));
    getJSON('/db/usuarios/me').then(setYo).catch(() => {});
  };
  useEffect(cargar, []);

  const entrar = async (nombre) => {
    setError('');
    const r = await postJSON('/db/usuarios/login', { nombre });
    if (r?.ok && r.token) aplicarToken(r.token);
    else setError(r?.error || 'login falló');
  };

  const crear = async () => {
    const nombre = nuevo.trim();
    if (!nombre) return;
    setError('');
    const r = await postJSON('/db/usuarios/crear', { nombre });
    if (r?.ok && r.token) aplicarToken(r.token);
    else setError(r?.error || 'no se pudo crear');
  };

  return html`
    <div class="fixed inset-0 z-[9400] bg-black/60 flex items-center justify-center p-4"
      onClick=${e => e.target === e.currentTarget && onClose()}>
      <div class="w-[min(420px,95vw)] bg-[#14141c] border border-white/10 rounded-xl overflow-hidden">
        <div class="flex items-center gap-2 px-3 py-2 border-b border-white/10">
          <span class="text-sm font-semibold flex-1">👤 Usuario</span>
          ${yo && html`<span class="text-[11px] text-white/40">activo: ${yo.nombre} #${yo.id}</span>`}
          <button class="text-white/40 hover:text-white text-lg leading-none" onClick=${onClose}>✕</button>
        </div>

        <div class="max-h-[40vh] overflow-y-auto py-1">
          ${usuarios.length === 0 && html`<div class="px-4 py-4 text-white/30 text-sm text-center">Sin usuarios</div>`}
          ${usuarios.map(u => html`
            <button key=${u.id} onClick=${() => entrar(u.nombre)}
              class=${'w-full flex items-center gap-3 px-4 py-2 text-left text-sm ' + (yo?.id === u.id ? 'bg-white/10' : 'hover:bg-white/5')}>
              <span class="text-base">${yo?.id === u.id ? '◉' : '○'}</span>
              <span class="flex-1 text-white/80">${u.nombre}</span>
              <span class="text-[10px] text-white/25">#${u.id} · ${u.os}</span>
            </button>
          `)}
        </div>

        <div class="px-3 py-2 border-t border-white/10 flex gap-2">
          <input class="flex-1 bg-black/30 border border-white/10 rounded px-2 py-1 text-xs outline-none"
            placeholder="Nuevo usuario…" value=${nuevo}
            onInput=${e => setNuevo(e.target.value)}
            onKeyDown=${e => e.key === 'Enter' && crear()} />
          <button class="px-3 py-1 rounded border border-aurora-accent text-aurora-accent text-xs" onClick=${crear}>Crear</button>
        </div>
        ${error && html`<div class="px-3 pb-2 text-[11px] text-red-400">${error}</div>`}
      </div>
    </div>
  `;
}

export default UserSwitcher;
