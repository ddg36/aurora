// Listener global: cuando pi pide ask_cloud, el server emite 'cloud_ask' por
// el bus; acá lo ejecutamos contra el iframe cloud abierto y devolvemos la
// respuesta al server (POST /tools/cloud/answer). Es la pata browser del
// round-trip pi → nube → pi. Se inicia una vez en boot.js.

import { onEvento } from './eventos-ws.js';
import { askCloud } from './cloud-ask.js';
import { postJSON } from './api.js';

let iniciado = false;

// Encuentra el iframe del panel Cloud (Lyra lo monta como data-pane="cloud";
// llmcloud usa data-pane 1/2). El primero que exista y tenga contentWindow.
function iframeCloud() {
  const sels = ['iframe[data-pane="cloud"]', 'iframe[data-pane="1"]', 'iframe[data-pane]'];
  for (const s of sels) {
    const f = document.querySelector(s);
    if (f?.contentWindow) return f;
  }
  return null;
}

export function initCloudBridge() {
  if (iniciado) return;
  iniciado = true;
  onEvento('cloud_ask', async ({ reqId, prompt }) => {
    if (!reqId) return;
    const iframe = iframeCloud();
    let text;
    if (!iframe) {
      text = 'Error: no hay panel Cloud abierto. Pedile al usuario que abra ☁ Cloud.';
    } else {
      const r = await askCloud(iframe, prompt).catch(e => ({ ok: false, text: 'Error: ' + e.message }));
      text = r.text || '(sin respuesta de la nube)';
    }
    postJSON('/tools/cloud/answer', { reqId, text }).catch(() => {});
  });
}
