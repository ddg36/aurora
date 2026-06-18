import { signal } from '../../../../store.js';

const BASE = globalThis.__AURORA_BASE__ || 'http://localhost:7779';
const hdrs = () => globalThis.__AURORA_HDRS__?.() || { 'Content-Type': 'application/json' };

export const canvasDoc     = signal('');
export const canvasVisible = signal(false);

export async function cargarCanvas() {
  try {
    const res = await fetch(`${BASE}/db/ajustes/local_canvas`, { headers: hdrs() });
    if (res.ok) {
      const d = await res.json();
      if (d.valor) canvasDoc.value = d.valor;
    }
  } catch {}
}

let _persistTimer = null;
function persistirCanvas() {
  clearTimeout(_persistTimer);
  _persistTimer = setTimeout(() => {
    fetch(`${BASE}/db/ajustes/local_canvas`, {
      method: 'PUT',
      headers: hdrs(),
      body: JSON.stringify({ valor: canvasDoc.value }),
    }).catch(() => {});
  }, 600);
}

export const CANVAS_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'canvas_write',
      description: 'Escribe contenido en el canvas visual del usuario (panel lateral). Úsalo para documentos, planes, código largo o cualquier contenido que el usuario quiera conservar a la vista.',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'Contenido a escribir (markdown o texto).' },
          mode: { type: 'string', description: "'write' reemplaza, 'append' agrega al final, 'clear' borra.", enum: ['write', 'append', 'clear'] },
        },
        required: ['content'],
      },
    },
  },
];

export function canvasWrite(content, mode = 'write') {
  if (mode === 'clear') {
    canvasDoc.value = '';
  } else if (mode === 'append') {
    canvasDoc.value = canvasDoc.value ? canvasDoc.value + '\n' + content : content;
  } else {
    canvasDoc.value = content || '';
  }
  persistirCanvas();
  if (canvasDoc.value) canvasVisible.value = true;
}

export function toggleCanvas() {
  canvasVisible.value = !canvasVisible.value;
}

export function handleHubAction(name, args, respond) {
  if (name === 'canvas_write') {
    canvasWrite(args.content || '', args.mode || 'write');
    respond(`ok: canvas actualizado (${(canvasDoc.value || '').length} chars)`);
    return true;
  }
  respond(`Error: hub tool "${name}" no soportada en Aurora v2`);
  return false;
}
