import { postJSON } from './api.js';

// Frontera Cloud → Tool Forge. El agente puede crear una versión inmutable y
// pedir que Aurora ejecute sus tests en sandbox. Aprobación y activación NO
// existen en esta función: siempre requieren la interfaz humana.
export async function submitForge(args = {}) {
  const manifest = args.manifest;
  const code = args.code;
  if (!manifest || typeof manifest !== 'object') {
    return { ok: false, is_error: true, error: 'forge_submit requiere args.manifest como objeto JSON.' };
  }
  if (typeof code !== 'string' || !code.trim()) {
    return { ok: false, is_error: true, error: 'forge_submit requiere args.code con handler.py.' };
  }
  const draft = await postJSON('/tools/forge/drafts', { manifest, code });
  if (!draft?.ok) return { ok: false, is_error: true, error: draft?.error || 'No se pudo crear el draft.' };
  const name = draft.package.name;
  const version = draft.package.version;
  const tested = await postJSON(`/tools/forge/packages/${encodeURIComponent(name)}/${version}/test`, {});
  const passed = !!tested?.report?.passed;
  const output = passed
    ? `Paquete ${name}@${version} creado y probado (${tested.report.total}/${tested.report.total}). Espera aprobación humana; NO está activo todavía.`
    : `Paquete ${name}@${version} creado, pero fallaron tests: ${JSON.stringify(tested?.report?.cases || tested?.error)}`;
  window.dispatchEvent(new CustomEvent('aurora:forge-changed'));
  return { ok: passed, is_error: !passed, output, data: { package: draft.package, report: tested?.report } };
}
