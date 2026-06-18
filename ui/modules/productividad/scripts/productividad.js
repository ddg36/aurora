import { deleteJSON, getJSON, patchJSON, postJSON } from '../../../components/shared/api.js';

export async function overview() {
  return getJSON('/db/productividad/overview');
}

export async function listarCapturas() {
  return getJSON('/db/productividad/capturas?limit=80');
}

export async function extCmd(cmd, params = {}, timeout = 12) {
  const res = await postJSON('/ext/cmd', { cmd, params, timeout });
  if (!res.ok) throw new Error(res.error || `Error ejecutando ${cmd}`);
  return res.data;
}

export async function capturarPagina() {
  const data = await extCmd('capture_page_context');
  await postJSON('/db/productividad/capturas', { ...data, tipo: 'page', origen: 'aurora-productivity-ui' });
  return data;
}

export async function capturarScreenshot() {
  const data = await extCmd('capture_screenshot');
  await postJSON('/db/productividad/capturas', {
    tipo: 'screenshot',
    titulo: data.tab?.title,
    url: data.tab?.url,
    screenshot: data.dataUrl,
    origen: 'aurora-productivity-ui',
  });
  return data;
}

export async function obtenerCaptura(id) {
  return getJSON(`/db/productividad/capturas/${id}`);
}

export async function eliminarCaptura(id) {
  return deleteJSON(`/db/productividad/capturas/${id}`);
}

export async function crearResearch(data) {
  return postJSON('/db/productividad/research', data);
}

export async function listarResearch() {
  return getJSON('/db/productividad/research?limit=80');
}

export async function crearTask(data) {
  return postJSON('/db/productividad/tasks', data);
}

export async function listarTasks() {
  return getJSON('/db/productividad/tasks?limit=120');
}

export async function actualizarTask(id, data) {
  return patchJSON(`/db/productividad/tasks/${id}`, data);
}

export async function guardarClipboard(data) {
  return postJSON('/db/productividad/clipboard', data);
}

export async function listarClipboard() {
  return getJSON('/db/productividad/clipboard?limit=80');
}

export async function listarFormProfiles() {
  return getJSON('/db/productividad/forms/profiles');
}

export async function crearFormProfile(data) {
  return postJSON('/db/productividad/forms/profiles', data);
}

export async function listarFormTemplates() {
  return getJSON('/db/productividad/forms/templates');
}

export async function crearFormTemplate(data) {
  return postJSON('/db/productividad/forms/templates', data);
}

export async function listarMeetings() {
  return getJSON('/db/productividad/meetings?limit=80');
}

export async function crearMeeting(data) {
  return postJSON('/db/productividad/meetings', data);
}

export async function listarTabSessions() {
  return getJSON('/db/productividad/tabs/sessions?limit=50');
}

export async function crearTabSession(data) {
  return postJSON('/db/productividad/tabs/sessions', data);
}

export async function listarPrices() {
  return getJSON('/db/productividad/prices');
}

export async function crearPrice(data) {
  return postJSON('/db/productividad/prices', data);
}

export async function crearPriceCheck(id, data) {
  return postJSON(`/db/productividad/prices/${id}/checks`, data);
}

export async function scanPrice(id) {
  return postJSON(`/db/productividad/prices/${id}/scan`, {});
}

export async function runTool(name, args = {}) {
  return postJSON(`/tools/${encodeURIComponent(name)}/run`, { arguments: args });
}

export async function extStatus() {
  return getJSON('/ext/status');
}
