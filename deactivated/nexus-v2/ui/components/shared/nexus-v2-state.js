import { signal } from '../../store.js';
import { getJSON, putJSON } from './api.js';

export const NEXUS_V2_SETTING = 'nexus_v2_enabled_v1';
export const nexusV2Enabled = signal(false);
let initialized = false;
let initialization = null;

async function backgroundRequest(payload) {
  const request = globalThis.__aurora_bgRequest;
  if (typeof request !== 'function') return null;
  try {
    return await request(payload);
  } catch (_) {
    return null;
  }
}

export async function initNexusV2State() {
  if (initialized) return nexusV2Enabled.value;
  if (initialization) return initialization;

  initialization = (async () => {
    let next = nexusV2Enabled.value;
    try {
      const remote = await getJSON(`/db/ajustes/${NEXUS_V2_SETTING}`);
      if (remote?.valor === 'true' || remote?.valor === 'false') next = remote.valor === 'true';
    } catch (_) {}

    const extension = await backgroundRequest({ type: 'NEXUS_V2_GET_STATE' });
    if (typeof extension?.enabled === 'boolean') next = extension.enabled;

    nexusV2Enabled.value = next;
    initialized = true;
    return next;
  })().finally(() => {
    initialization = null;
  });

  return initialization;
}

export async function setNexusV2Enabled(enabled) {
  const next = !!enabled;
  nexusV2Enabled.value = next;

  await Promise.allSettled([
    putJSON(`/db/ajustes/${NEXUS_V2_SETTING}`, { valor: String(next) }),
    backgroundRequest({ type: 'NEXUS_V2_SET_STATE', enabled: next }),
  ]);

  if (next) {
    void backgroundRequest({ type: 'AURORA_NEXUS_REINJECT', reason: 'ui_enabled' });
  }
  return next;
}

void initNexusV2State();
