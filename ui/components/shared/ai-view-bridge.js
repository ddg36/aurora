// Bus server ↔ runtime semántico de vistas. El servidor nunca toca el DOM:
// solicita una capacidad, Aurora monta su vista nativa y ejecuta el contrato.

import { onEvento } from './eventos-ws.js';
import { postJSON } from './api.js';
import { setTab } from '../../store.js';
import { describeAIViews, invokeAIView } from './ai-view-actions.js';

const VIEW_TABS = {
  aurora: 'aurora',
  toolkit: 'toolkit',
  canvas: 'lyra',
  scratchpad: 'scratchpad',
  'md-reader': 'md-reader',
};

function waitForView(view, timeoutMs = 8000) {
  const current = describeAIViews(view);
  if (current?.active) return Promise.resolve(current);
  return new Promise((resolve, reject) => {
    let timer;
    const done = () => {
      const entry = describeAIViews(view);
      if (!entry?.active) return;
      clearTimeout(timer);
      window.removeEventListener('aurora:ai-view-registry', done);
      resolve(entry);
    };
    window.addEventListener('aurora:ai-view-registry', done);
    timer = setTimeout(() => {
      window.removeEventListener('aurora:ai-view-registry', done);
      reject(new Error(`La vista ${view} no publicó acciones en ${timeoutMs / 1000}s`));
    }, timeoutMs);
    const tab = VIEW_TABS[view];
    if (!tab) {
      clearTimeout(timer);
      window.removeEventListener('aurora:ai-view-registry', done);
      reject(new Error(`No existe ruta semántica para la vista ${view}`));
      return;
    }
    setTab(tab);
    queueMicrotask(done);
  });
}

async function handleRequest({ reqId, op, view, action, args } = {}) {
  let result;
  try {
    if (op === 'describe') {
      if (view) await waitForView(view);
      result = { ok: true, operation: op, result: describeAIViews(view) };
    } else if (op === 'invoke') {
      await waitForView(view);
      result = await invokeAIView({ view, action, args, requestId: reqId });
    } else {
      result = { ok: false, error: `Operación AI view desconocida: ${op}` };
    }
  } catch (error) {
    result = { ok: false, requestId: reqId, view, action, error: error?.message || String(error) };
  }
  await postJSON('/tools/view/action/answer', { reqId, result }).catch(error => {
    console.error('[ai-view-bridge] no se pudo responder', error);
  });
}

onEvento('ai_view_request', handleRequest);

globalThis.__auroraViewBridge = { waitForView, routes: { ...VIEW_TABS } };
