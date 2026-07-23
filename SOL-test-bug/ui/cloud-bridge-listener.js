// Listener global: cuando pi pide ask_cloud, el server emite 'cloud_ask' por
// el bus; acá lo ejecutamos contra el iframe cloud abierto y devolvemos la
// respuesta al server (POST /tools/cloud/answer). Es la pata browser del
// round-trip pi → nube → pi. Se inicia una vez en boot.js.

import { onEvento } from './eventos-ws.js';
import { askCloud } from './cloud-ask.js';
import { postJSON } from './api.js';
import { setTab } from '../../store.js';

let iniciado = false;
let forgeDuoActivo = false;

function forgeJob(detail) {
  globalThis.__auroraForgeJob = detail;
  window.dispatchEvent(new CustomEvent('aurora:forge-job', { detail }));
}

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
    // En extPane no existe iframe dentro de Aurora: askCloud(null, ...) enruta
    // por window.parent hacia aurora-bridge.js. Sólo exigir iframe en browser.
    const extPane = (globalThis.__aurora_extContext?.value?.caps || []).includes('llmPanes');
    if (!iframe && !extPane) {
      text = 'Error: no hay panel Cloud abierto. Pedile al usuario que abra ☁ Cloud.';
    } else {
      const r = await askCloud(iframe, prompt).catch(e => ({ ok: false, text: 'Error: ' + e.message }));
      text = r.text || '(sin respuesta de la nube)';
    }
    postJSON('/tools/cloud/answer', { reqId, text }).catch(() => {});
  });

  onEvento('forge_build', async ({ reqId, spec }) => {
    if (!reqId) return;
    if (forgeDuoActivo) {
      postJSON('/tools/forge/build/answer', { reqId, result: {
        ok: false, error: 'Ya hay otra construcción Tool Forge activa.', reason: 'busy',
      }}).catch(() => {});
      return;
    }
    forgeDuoActivo = true;
    // Mantener los proveedores realmente visibles durante el trabajo evita
    // que sus UIs desmonten controles y, además, deja que Diego observe la
    // colaboración nativa en vez de mirar un spinner opaco.
    setTab('llmcloud');
    let submission = null;
    const errors = [];
    const states = [];
    forgeJob({ reqId, state: 'starting', spec });
    try {
      const { crearDuoCloud } = await import('../../modules/llmcloud/scripts/cloud-duo.js');
      const duo = crearDuoCloud();
      const prompt = `TOOL FORGE BUILD solicitado por Lyra. Objetivo:\n${spec?.objective || ''}\n\n` +
        `Nombre sugerido: ${spec?.name_hint || 'elige forge.nombre_descriptivo'}\n` +
        `Requisitos: ${JSON.stringify(spec?.requirements || [])}\n` +
        `Pruebas de aceptación: ${JSON.stringify(spec?.acceptance_tests || [])}\n\n` +
        'Colabora con el otro panel mediante panel_send: uno diseña/implementa y el otro revisa contrato, permisos, casos límite y tests. ' +
        'El entregable DEBE ser una llamada forge_submit con manifest completo (semver, input_schema, permisos mínimos, tests y docs) y code de handler.py. ' +
        'No uses write para instalar nada. forge_submit sólo dejará un paquete tested; el humano decidirá aprobación y activación.';
      await duo.iniciar({
        panelInicial: 1, maxRondas: 8, delayMs: 300, nuevaConversacion: true, seedPrompt: prompt,
      }, {
        onEstado: state => {
          states.push(state);
          forgeJob({ reqId, state, spec });
        },
        onError: error => errors.push(error),
        onTool: ev => {
          if (ev.call?.tool === 'forge_submit' && ev.status === 'success') submission = ev.result;
          forgeJob({ reqId, state: 'tool', event: ev, spec });
        },
      });
      const result = submission?.ok
        ? { ok: true, text: submission.output, package: submission.data?.package, report: submission.data?.report, states }
        : { ok: false, error: errors.at(-1) || 'El Duo terminó sin entregar forge_submit probado.', reason: 'no_tested_package', states };
      await postJSON('/tools/forge/build/answer', { reqId, result });
      forgeJob({ reqId, state: result.ok ? 'tested' : 'error', result, spec });
    } catch (error) {
      const result = { ok: false, error: error?.message || String(error), reason: 'browser_orchestrator_error', states };
      await postJSON('/tools/forge/build/answer', { reqId, result }).catch(() => {});
      forgeJob({ reqId, state: 'error', result, spec });
    } finally {
      forgeDuoActivo = false;
      window.dispatchEvent(new CustomEvent('aurora:forge-changed'));
      globalThis.__auroraOpenForge = true;
      setTab('toolkit');
    }
  });
}
