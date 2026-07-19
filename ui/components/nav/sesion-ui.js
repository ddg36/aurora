import { getJSON, putJSON, postJSON } from '../../components/shared/api.js';
import { activeTab } from '../../store.js';

const CLAVE_TAB = 'ui_last_tab';
// Misma clave que store.js lee de forma sincrónica al iniciar (evita el
// flash de 'inicio' mientras restaurarTab() resuelve el round-trip a DB).
const TAB_MIRROR_KEY = 'aurora_ui_last_tab_mirror';

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
    try { localStorage.setItem(TAB_MIRROR_KEY, tab); } catch (_) {}
    putJSON(`/db/ajustes/${CLAVE_TAB}`, { valor: tab }).catch(() => {});
    postJSON('/db/eventos', { tipo: 'nav', mensaje: tab, origen: 'ui' }).catch(() => {});
  });
}
