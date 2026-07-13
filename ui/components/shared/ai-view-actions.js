// Contrato experimental AIHub: capacidades semánticas de las vistas para IA.
// La UI humana y los agentes invocan la MISMA lógica; ninguna IA necesita
// localizar botones ni depender del DOM visual.

const views = new Map();

function serializarVista(entry) {
  return {
    id: entry.id,
    description: entry.description || '',
    active: entry.active !== false,
    actions: Object.fromEntries(Object.entries(entry.actions).map(([id, action]) => [id, {
      description: action.description || '',
      input: action.input || {},
      readOnly: !!action.readOnly,
      requiresApproval: !!action.requiresApproval,
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
  views.set(id, { id, description, actions: normalized, active });
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
    const entry = views.get(viewId);
    return entry ? serializarVista(entry) : null;
  }
  return [...views.values()].map(serializarVista);
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
