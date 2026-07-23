// Bus server ↔ runtime semántico de vistas. El servidor nunca toca el DOM:
// solicita una capacidad, Aurora monta su vista nativa y ejecuta el contrato.

import { onEvento } from './eventos-ws.js';
import { postJSON } from './api.js';
import { describeAIViews, invokeAIView } from './ai-view-actions.js';
import { VIEW_TABS, waitForAIView } from './view-action-dispatch.js';

async function handleRequest({ reqId, op, view, action, args } = {}) {
  let result;
  try {
    if (op === 'describe') {
      if (view) await waitForAIView(view);
      result = { ok: true, operation: op, result: describeAIViews(view) };
    } else if (op === 'invoke') {
      await waitForAIView(view);
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

globalThis.__auroraViewBridge = { waitForView: waitForAIView, routes: { ...VIEW_TABS } };
