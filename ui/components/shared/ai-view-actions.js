// Contrato experimental AIHub: capacidades semánticas de las vistas para IA.
// La UI humana y los agentes invocan la MISMA lógica; ninguna IA necesita
// localizar botones ni depender del DOM visual.

const views = new Map();
// El catálogo sobrevive al unmount. `views` contiene closures ejecutables sólo
// de la vista montada; `catalog` permite que un agente descubra capacidades sin
// depender accidentalmente del tab que Diego está mirando.
const catalog = new Map();

function serializarVista(entry, active = views.has(entry.id)) {
  return {
    id: entry.id,
    description: entry.description || '',
    active,
    actions: Object.fromEntries(Object.entries(entry.actions).map(([id, action]) => [id, {
      description: action.description || '',
      input: action.input || {},
      readOnly: !!action.readOnly,
      requiresApproval: !!action.requiresApproval,
      risk: action.risk || (action.readOnly ? 'read' : 'write'),
    }])),
  };
}

export function registerAIView({ id, description = '', actions = {}, active = true }) {
  if (!id || typeof id !== 'string') throw new Error('AI view requiere id');
  const normalized = {};
  for (const [actionId, action] of Object.entries(actions || {})) {
    if (!action || typeof action.run !== 'function') throw new Error(`${id}.${actionId} requiere run()`);
    normalized[actionId] = action;
  }
  const entry = { id, description, actions: normalized, active };
  views.set(id, entry);
  catalog.set(id, entry);
  window.dispatchEvent(new CustomEvent('aurora:ai-view-registry', { detail: describeAIViews() }));
  return () => unregisterAIView(id);
}

export function unregisterAIView(id) {
  if (!views.delete(id)) return false;
  window.dispatchEvent(new CustomEvent('aurora:ai-view-registry', { detail: describeAIViews() }));
  return true;
}

export function describeAIViews(viewId) {
  if (viewId) {
    const entry = views.get(viewId) || catalog.get(viewId);
    return entry ? serializarVista(entry) : null;
  }
  return [...catalog.values()].map(entry => serializarVista(entry));
}

function validateArgs(input, args) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('args debe ser un objeto JSON');
  for (const [key, rule] of Object.entries(input || {})) {
    const present = Object.prototype.hasOwnProperty.call(args, key);
    if (rule.required && !present) throw new Error(`Falta argumento requerido: ${key}`);
    if (!present) continue;
    const value = args[key];
    const validType = rule.type === 'array' ? Array.isArray(value)
      : rule.type === 'number' ? typeof value === 'number' && Number.isFinite(value)
      : rule.type === 'object' ? value && typeof value === 'object' && !Array.isArray(value)
      : !rule.type || typeof value === rule.type;
    if (!validType) throw new Error(`${key} debe ser ${rule.type}`);
    if (rule.enum && !rule.enum.includes(value)) throw new Error(`${key} debe ser uno de: ${rule.enum.join(', ')}`);
    if (typeof value === 'string' && rule.maxLength && value.length > rule.maxLength) throw new Error(`${key} excede ${rule.maxLength} caracteres`);
    if (typeof value === 'number' && rule.minimum != null && value < rule.minimum) throw new Error(`${key} debe ser >= ${rule.minimum}`);
    if (typeof value === 'number' && rule.maximum != null && value > rule.maximum) throw new Error(`${key} debe ser <= ${rule.maximum}`);
  }
}

export async function invokeAIView({ view, action, args = {}, requestId } = {}) {
  const reqId = requestId || `view-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const entry = views.get(view);
  if (!entry) return { ok: false, requestId: reqId, error: `Vista no disponible: ${view}` };
  const command = entry.actions[action];
  if (!command) return { ok: false, requestId: reqId, error: `Acción no soportada: ${view}.${action}` };
  if (command.requiresApproval) {
    return { ok: false, requestId: reqId, requiresApproval: true, error: `Requiere aprobación: ${view}.${action}` };
  }
  try {
    validateArgs(command.input, args || {});
    const result = await command.run(args || {}, { requestId: reqId, view, action });
    return { ok: true, requestId: reqId, view, action, result };
  } catch (err) {
    return { ok: false, requestId: reqId, view, action, error: err?.message || String(err) };
  }
}

// Transporte local experimental. Un futuro bridge servidor/Cloud sólo debe
// traducir su request a este evento y devolver aurora:ai-view-result.
window.addEventListener('aurora:ai-view-invoke', async e => {
  const result = await invokeAIView(e.detail || {});
  window.dispatchEvent(new CustomEvent('aurora:ai-view-result', { detail: result }));
});

globalThis.__auroraViewActions = {
  describe: describeAIViews,
  invoke: invokeAIView,
};
