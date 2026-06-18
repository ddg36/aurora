import { getJSON, putJSON, postJSON } from '../../components/shared/api.js';
import { activeTab } from '../../store.js';

const CLAVE_TAB = 'ui_last_tab';

export async function restaurarTab() {
  try {
    const r = await getJSON(`/db/ajustes/${CLAVE_TAB}`);
    return r?.valor || null;
  } catch {
    return null;
  }
}

let ultimaTab = null;

export function iniciarPersistenciaUI() {
  ultimaTab = activeTab.value;
  return activeTab.subscribe(tab => {
    if (tab === ultimaTab) return;
    ultimaTab = tab;
    putJSON(`/db/ajustes/${CLAVE_TAB}`, { valor: tab }).catch(() => {});
    postJSON('/db/eventos', { tipo: 'nav', mensaje: tab, origen: 'ui' }).catch(() => {});
  });
}
