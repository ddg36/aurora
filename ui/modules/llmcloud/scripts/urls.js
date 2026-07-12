import { getJSON } from '../../../components/shared/api.js';

// soloTab: sitios detrás de Cloudflare bot-challenge (cf-mitigated: challenge)
// o que devuelven 403 al request embebido — NO se pueden mostrar en iframe
// (el challenge bloquea el embed antes de servir contenido, irresoluble desde
// la extensión). Al elegirlos se abren directo en pestaña real, donde el
// challenge no bloquea. Ver docs: es limitación de Cloudflare, no un bug.
export const LLM_PRESETS = [
  { id: -1, nombre: 'ChatGPT', url: 'https://chatgpt.com', icono: 'https://chatgpt.com/favicon.ico' },
  { id: -2, nombre: 'Claude', url: 'https://claude.ai', icono: 'https://claude.ai/favicon.ico' },
  { id: -3, nombre: 'Gemini', url: 'https://gemini.google.com', icono: 'https://gemini.google.com/favicon.ico' },
  { id: -4, nombre: 'Grok', url: 'https://grok.com', icono: 'https://grok.com/favicon.ico' },
  { id: -5, nombre: 'Perplexity', url: 'https://www.perplexity.ai', icono: 'https://www.perplexity.ai/favicon.ico', soloTab: true },
  { id: -6, nombre: 'Meta AI', url: 'https://www.meta.ai', icono: 'https://www.meta.ai/favicon.ico', soloTab: true },
  { id: -7, nombre: 'Le Chat', url: 'https://chat.mistral.ai', icono: 'https://chat.mistral.ai/favicon.ico', soloTab: true },
  { id: -8, nombre: 'DeepSeek', url: 'https://chat.deepseek.com', icono: 'https://chat.deepseek.com/favicon.ico', soloTab: true },
  { id: -9, nombre: 'Copilot', url: 'https://copilot.microsoft.com', icono: 'https://copilot.microsoft.com/favicon.ico' },
  { id: -10, nombre: 'Poe', url: 'https://poe.com', icono: 'https://poe.com/favicon.ico' },
  { id: -11, nombre: 'You.com', url: 'https://you.com', icono: 'https://you.com/favicon.ico' },
  { id: -12, nombre: 'Qwen', url: 'https://chat.qwen.ai', icono: 'https://chat.qwen.ai/favicon.ico' },
];

export async function cargarURLsCloud() {
  try {
    const custom = await getJSON('/db/urls-custom');
    return [...LLM_PRESETS, ...(custom || [])];
  } catch {
    return [...LLM_PRESETS];
  }
}
