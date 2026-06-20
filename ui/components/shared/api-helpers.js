// UI/SHARED/API-HELPERS — Funciones API compartidas entre módulos

import { getJSON } from './api.js';

export async function cargarHealth() {
  try {
    return await getJSON('/health');
  } catch {
    return null;
  }
}
