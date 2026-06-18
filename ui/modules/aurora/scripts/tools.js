import { getJSON, postJSON } from '../../../components/shared/api.js';

export async function cargarTools() {
  const data = await getJSON('/tools');
  return data.tools || [];
}

export async function ejecutarTool(name, input) {
  let argumentsJson = {};
  if ((input || '').trim()) {
    argumentsJson = JSON.parse(input);
  }
  return postJSON(`/tools/${encodeURIComponent(name)}/run`, { arguments: argumentsJson });
}
