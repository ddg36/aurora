import { getJSON } from '../../../components/shared/api.js';

export async function cargarHealth() {
  return getJSON('/health');
}
