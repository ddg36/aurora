import { signal } from '../../store.js';
import { getJSON, putJSON } from './api.js';

export const JSON_FAMILY_SETTING = 'json_family_enabled_v1';
export const jsonFamilyEnabled = signal(false);
let initialized = false;

export async function initJSONFamilyState() {
  if (initialized) return jsonFamilyEnabled.value;
  initialized = true;
  try {
    const remote = await getJSON(`/db/ajustes/${JSON_FAMILY_SETTING}`);
    jsonFamilyEnabled.value = remote?.valor === 'true';
  } catch (_) {}
  try {
    const ext = await globalThis.__aurora_bgRequest?.({ type: 'JSON_FAMILY_GET_STATE' });
    if (typeof ext?.enabled === 'boolean') jsonFamilyEnabled.value = ext.enabled;
  } catch (_) {}
  return jsonFamilyEnabled.value;
}

export async function setJSONFamilyEnabled(enabled) {
  const next = !!enabled;
  jsonFamilyEnabled.value = next;
  await Promise.allSettled([
    putJSON(`/db/ajustes/${JSON_FAMILY_SETTING}`, { valor: String(next) }),
    globalThis.__aurora_bgRequest?.({ type: 'JSON_FAMILY_SET_STATE', enabled: next }),
  ]);
  return next;
}

initJSONFamilyState();
