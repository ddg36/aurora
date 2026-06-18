import { getJSON } from '../../../components/shared/api.js';

export function cargarStats() {
  return getJSON('/db/stats');
}
