// Persistencia del Reproductor — DB de Aurora, no localStorage.
// Reusa la tabla genérica /db/ajustes/{clave} namespaceando la clave
// (mismo patrón que components/shared/... usa para extensions.py).
import { getJSON, putJSON } from '../../../components/shared/api.js';

const CLAVES = {
  biblioteca: 'reproductor:biblioteca',
  favoritos: 'reproductor:favoritos',
  ajustes: 'reproductor:ajustes',
  composiciones: 'reproductor:composiciones',
};

async function leer(clave) {
  try {
    const r = await getJSON(`/db/ajustes/${clave}`);
    return r?.valor ? JSON.parse(r.valor) : null;
  } catch (e) { return null; }
}
function guardar(clave, data) {
  return putJSON(`/db/ajustes/${clave}`, { valor: JSON.stringify(data) }).catch(() => {});
}

export const leerBiblioteca = () => leer(CLAVES.biblioteca);
export const leerFavoritos = () => leer(CLAVES.favoritos);
export const leerAjustes = () => leer(CLAVES.ajustes);
export const leerComposiciones = () => leer(CLAVES.composiciones);

export const guardarBiblioteca = data => guardar(CLAVES.biblioteca, data);
export const guardarFavoritos = data => guardar(CLAVES.favoritos, data);
export const guardarAjustes = data => guardar(CLAVES.ajustes, data);
export const guardarComposiciones = data => guardar(CLAVES.composiciones, data);
