// Cliente fino del Nexus 2 Orchestrator. El parser, journal y ejecución viven
// en Aurora Server; este módulo sólo transporta el turno estable.
import { postJSON } from './api.js';

export async function processNexusV2(text, {
  requestId, origin = {}, clientTools = [],
} = {}) {
  const id = requestId || `ui-nexus-v2-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return postJSON('/nexus-v2/process', { requestId: id, text, origin, clientTools });
}

export default processNexusV2;
