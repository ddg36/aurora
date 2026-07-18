// Cliente fino: JSON Family vive y se ejecuta exclusivamente en Aurora.
import { postJSON } from './api.js';

export async function processJSONFamily(text, {
  requestId, origin = {}, clientTools = [],
} = {}) {
  const id = requestId || `ui-json-family-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return postJSON('/json-family/process', { requestId: id, text, origin, clientTools });
}

export default processJSONFamily;
