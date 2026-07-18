// Catálogo vivo y de sólo lectura de las factories oficiales de Pi.
// Ejecutar una tool solicitada por Cloud corresponde exclusivamente a JSON Family.
import { getJSON } from './api.js';

let catalogPromise = null;

export async function getPiToolCatalog({ refresh = false } = {}) {
  if (refresh || !catalogPromise) {
    catalogPromise = getJSON('/tools/providers/pi/catalog').then(result => {
      if (!result?.ok) throw new Error(result?.error || 'Pi Tool Provider no disponible');
      return result;
    }).catch(error => {
      catalogPromise = null;
      throw error;
    });
  }
  return catalogPromise;
}

export default getPiToolCatalog;
