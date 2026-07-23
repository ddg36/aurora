import { signal } from '../../../../store.js';
import { fetchCommands } from '../../../../components/shared/lyra-ws.js';

export const comandosPi = signal([]);

let _cargando = null;

export function cargarComandos() {
  if (comandosPi.value.length) return Promise.resolve(comandosPi.value);
  if (!_cargando) {
    _cargando = fetchCommands().then(lista => {
      comandosPi.value = lista;
      _cargando = null;
      return lista;
    });
  }
  return _cargando;
}

export function filtrarComandos(lista, texto) {
  const q = (texto || '').replace(/^\//, '').trim().toLowerCase();
  if (!q) return lista;
  return lista.filter(c =>
    (c.name || '').toLowerCase().includes(q) ||
    (c.description || '').toLowerCase().includes(q)
  );
}

export function iconoComando(source) {
  if (source === 'builtin') return 'settings';
  if (source === 'extension') return 'puzzle';
  if (source === 'skill') return 'book';
  if (source === 'template') return 'note';
  return 'command';
}
