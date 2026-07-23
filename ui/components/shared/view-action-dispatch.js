import { setTab } from '../../store.js';
import { describeAIViews, invokeAIView } from './ai-view-actions.js';

export const VIEW_TABS = Object.freeze({
  aurora: 'aurora',
  toolkit: 'toolkit',
  canvas: 'lyra',
  scratchpad: 'scratchpad',
  'md-reader': 'md-reader',
  captura: 'captura',
  webnavigator: 'webnavigator',
  editor: 'editor',
  llmcloud: 'llmcloud',
  inicio: 'inicio',
  productividad: 'productividad',
  prompts: 'prompts',
  wiki: 'wiki',
  stats: 'stats',
  chain: 'chain',
  stylecatalog: 'stylecatalog',
  ajustes: 'ajustes',
  detective: 'detective',
  lyria: 'lyra',
});

export function waitForAIView(view, timeoutMs = 8000) {
  const current = describeAIViews(view);
  if (current?.active) return Promise.resolve(current);

  return new Promise((resolve, reject) => {
    let timer;
    const finish = () => {
      const entry = describeAIViews(view);
      if (!entry?.active) return;
      clearTimeout(timer);
      window.removeEventListener('aurora:ai-view-registry', finish);
      resolve(entry);
    };
    const fail = message => {
      clearTimeout(timer);
      window.removeEventListener('aurora:ai-view-registry', finish);
      reject(new Error(message));
    };

    const tab = VIEW_TABS[view];
    if (!tab) {
      fail(`No existe ruta semántica para la vista ${view}`);
      return;
    }

    window.addEventListener('aurora:ai-view-registry', finish);
    timer = setTimeout(() => fail(`La vista ${view} no publicó acciones en ${timeoutMs / 1000}s`), timeoutMs);
    setTab(tab);
    queueMicrotask(finish);
  });
}

export async function invokeMountedAIView({ view, action, args = {}, requestId, timeoutMs } = {}) {
  await waitForAIView(view, timeoutMs);
  return invokeAIView({ view, action, args, requestId });
}
