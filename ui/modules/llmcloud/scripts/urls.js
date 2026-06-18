import { getJSON } from '../../../components/shared/api.js';

export const LLM_PRESETS = [
  { id: -1, nombre: 'ChatGPT', url: 'https://chatgpt.com', icono: 'https://chatgpt.com/favicon.ico' },
  { id: -2, nombre: 'Claude', url: 'https://claude.ai', icono: 'https://claude.ai/favicon.ico' },
  { id: -3, nombre: 'Gemini', url: 'https://gemini.google.com', icono: 'https://gemini.google.com/favicon.ico' },
];

export async function cargarURLsCloud() {
  try {
    const custom = await getJSON('/db/urls-custom');
    return [...LLM_PRESETS, ...(custom || [])];
  } catch {
    return [...LLM_PRESETS];
  }
}
