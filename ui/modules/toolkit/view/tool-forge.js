const html = (...args) => globalThis.html(...args);
const { useState, useEffect } = globalThis.preactHooks;

import { getJSON, postJSON, deleteJSON } from '../../../components/shared/api.js';
import { Button, Chip } from '../../../components/index.js';

const TEMPLATE_MANIFEST = {
  name: 'forge.mi_herramienta',
  version: '1.0.0',
  description: 'Explica claramente qué capacidad incorpora para Lyra.',
  input_schema: {
    type: 'object',
    properties: { text: { type: 'string', description: 'Texto de entrada' } },
    required: ['text'],
  },
  permissions: [],
  timeout: 15,
  tests: [{ name: 'caso básico', input: { text: 'hola' }, expect: { ok: true, text: 'HOLA' } }],
  docs: 'Lyra debe enviar text y leer text del resultado.',
};

const TEMPLATE_CODE = `import json, sys

args = json.load(sys.stdin)
print(json.dumps({"ok": True, "text": args["text"].upper()}))
`;

const STATUS = {
  draft: ['Borrador', 'text-white/50 bg-white/5'],
  tested: ['Tests OK', 'text-amber-300 bg-amber-500/10'],
  test_failed: ['Tests fallidos', 'text-red-300 bg-red-500/10'],
  approved: ['Aprobada', 'text-sky-300 bg-sky-500/10'],
  active: ['Activa', 'text-emerald-300 bg-emerald-500/10'],
};

function pretty(value) {
  return JSON.stringify(value, null, 2);
}

export function ToolForge() {
  const [packages, setPackages] = useState([]);
  const [manifest, setManifest] = useState(pretty(TEMPLATE_MANIFEST));
  const [code, setCode] = useState(TEMPLATE_CODE);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmations, setConfirmations] = useState({});
  const [runArgs, setRunArgs] = useState({});
  const [runResults, setRunResults] = useState({});
  const [runConfirmations, setRunConfirmations] = useState({});
  const [forgeJob, setForgeJob] = useState(globalThis.__auroraForgeJob || null);
  const [cloudObjective, setCloudObjective] = useState('');

  const refresh = async () => {
    const r = await getJSON('/tools/forge/packages');
    setPackages(r.packages || []);
  };

  useEffect(() => {
    refresh().catch(e => setError(e.message));
    const onJob = event => setForgeJob(event.detail || null);
    const onChanged = () => refresh().catch(e => setError(e.message));
    window.addEventListener('aurora:forge-job', onJob);
    window.addEventListener('aurora:forge-changed', onChanged);
    return () => {
      window.removeEventListener('aurora:forge-job', onJob);
      window.removeEventListener('aurora:forge-changed', onChanged);
    };
  }, []);

  const action = async (key, fn, success) => {
    if (busy) return;
    setBusy(key); setError(''); setNotice('');
    try {
      const r = await fn();
      if (!r?.ok) throw new Error(r?.error || 'La operación falló');
      setNotice(success || 'Operación completada con evidencia.');
      await refresh();
      window.dispatchEvent(new CustomEvent('aurora:forge-changed'));
    } catch (e) { setError(e.message); }
    finally { setBusy(''); }
  };

  const crear = () => action('create', async () => {
    let parsed;
    try { parsed = JSON.parse(manifest); } catch (e) { throw new Error(`Manifest JSON inválido: ${e.message}`); }
    return postJSON('/tools/forge/drafts', { manifest: parsed, code });
  }, 'Draft inmutable creado. Ahora ejecutá sus tests.');

  const construirCloud = () => action('cloud-build', async () => {
    if (cloudObjective.trim().length < 12) throw new Error('Describe una capacidad verificable con algo más de detalle.');
    return postJSON('/tools/forge_build/run', { arguments: { objective: cloudObjective.trim() } });
  }, 'El Duo Cloud entregó un paquete probado. Revisalo antes de aprobar.');

  const ejecutar = async p => {
    const key = `${p.name}@${p.version}`;
    let args;
    try { args = JSON.parse(runArgs[key] || '{}'); } catch (e) { setError(`Arguments JSON inválido: ${e.message}`); return; }
    setBusy(`run:${key}`); setError('');
    try {
      const protectedRun = !!p.requires_approval;
      const endpoint = protectedRun ? 'approve-run' : 'run';
      const payload = protectedRun
        ? { arguments: args, confirmation: runConfirmations[key] || '' }
        : { arguments: args };
      const r = await postJSON(`/tools/${encodeURIComponent(p.name)}/${endpoint}`, payload);
      setRunResults(v => ({ ...v, [key]: r }));
      if (!r.ok) setError(r.error || 'Ejecución fallida');
    } catch (e) { setError(e.message); }
    finally { setBusy(''); }
  };

  const groups = packages.reduce((acc, p) => ((acc[p.name] ||= []).push(p), acc), {});
  const counts = packages.reduce((acc, p) => ((acc[p.status] = (acc[p.status] || 0) + 1), acc), {});

  return html`
    <div class="flex flex-col gap-4">
      <div class="grid grid-cols-2 md:grid-cols-5 gap-2">
        ${[['Borradores', counts.draft || 0], ['Probadas', counts.tested || 0], ['Fallidas', counts.test_failed || 0], ['Aprobadas', counts.approved || 0], ['Activas', counts.active || 0]].map(([label, n]) => html`
          <div class="rounded-lg border border-aurora-border bg-aurora-surface px-3 py-2">
            <div class="text-[10px] text-aurora-text-muted">${label}</div><div class="text-lg font-semibold">${n}</div>
          </div>`)}
      </div>

      ${error && html`<div class="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">${error}</div>`}
      ${notice && html`<div class="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">${notice}</div>`}
      ${forgeJob && !['tested', 'error'].includes(forgeJob.state) && html`
        <div class="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-200 flex items-center gap-2">
          <span class="inline-block h-2 w-2 rounded-full bg-cyan-300 animate-pulse"></span>
          <strong>Lyra + Duo Cloud construyendo</strong>
          <span class="text-cyan-100/70">${forgeJob.spec?.objective || 'nueva herramienta'} · ${forgeJob.state}</span>
        </div>`}
      ${forgeJob?.state === 'tested' && html`<div class="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">✓ El colectivo Cloud entregó un paquete probado. Revisalo antes de aprobarlo.</div>`}
      ${forgeJob?.state === 'error' && html`<div class="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">La construcción Cloud terminó con error: ${forgeJob.result?.error || 'sin paquete probado'}</div>`}

      <div class="rounded-xl border border-cyan-500/20 bg-gradient-to-r from-cyan-500/8 to-violet-500/8 p-4 flex flex-col gap-2">
        <div class="flex items-center gap-2"><span>☁⚒</span><strong class="text-sm">Lyra + Duo Cloud</strong><span class="text-[10px] text-aurora-text-muted">diseñan, revisan y prueban; vos instalás</span></div>
        <div class="grid md:grid-cols-[1fr_auto] gap-2">
          <textarea class="min-h-16 rounded-lg border border-aurora-border bg-aurora-bg/80 px-3 py-2 text-xs resize-y" placeholder="Ej. Necesito una herramienta que cuente palabras y líneas de un texto, con casos vacíos y Unicode." value=${cloudObjective} onInput=${e => setCloudObjective(e.target.value)} />
          <${Chip} variant="accent" disabled=${!!busy || cloudObjective.trim().length < 12} onClick=${construirCloud}>${busy === 'cloud-build' ? 'Construyendo…' : 'Convocar Duo'}<//>
        </div>
        <span class="text-[10px] text-aurora-text-muted">Se abren chats nuevos en ambos paneles. El resultado nunca se activa sin tu confirmación exacta.</span>
      </div>

      <details class="rounded-xl border border-aurora-border bg-aurora-surface" open=${packages.length === 0}>
        <summary class="cursor-pointer px-4 py-3 text-sm font-semibold">＋ Crear paquete Forge</summary>
        <div class="grid md:grid-cols-2 gap-3 px-4 pb-4">
          <label class="flex flex-col gap-1 text-xs">
            <span class="text-aurora-text-muted">Manifest, contrato, permisos y tests</span>
            <textarea class="h-80 rounded-lg border border-aurora-border bg-aurora-bg p-3 font-mono text-[11px] resize-y" value=${manifest} onInput=${e => setManifest(e.target.value)} spellcheck="false" />
          </label>
          <label class="flex flex-col gap-1 text-xs">
            <span class="text-aurora-text-muted">handler.py · JSON stdin → JSON stdout</span>
            <textarea class="h-80 rounded-lg border border-aurora-border bg-aurora-bg p-3 font-mono text-[11px] resize-y" value=${code} onInput=${e => setCode(e.target.value)} spellcheck="false" />
          </label>
          <div class="md:col-span-2 flex items-center gap-2">
            <span class="text-[10px] text-aurora-text-muted flex-1">El draft no se importa ni activa. Primero se ejecuta aislado en Bubblewrap.</span>
            <${Chip} variant="accent" onClick=${crear} disabled=${!!busy}>${busy === 'create' ? 'Creando…' : 'Crear draft'}<//>
          </div>
        </div>
      </details>

      ${Object.keys(groups).length === 0 && html`<div class="py-12 text-center text-sm text-aurora-text-muted">Aún no hay paquetes. Lyra y el colectivo Cloud podrán construirlos aquí.</div>`}
      ${Object.entries(groups).map(([name, versions]) => html`
        <section class="rounded-xl border border-aurora-border bg-aurora-surface overflow-hidden">
          <div class="px-4 py-3 border-b border-aurora-border flex items-center gap-2">
            <span class="font-mono text-sm font-semibold">${name}</span>
            <span class="text-[10px] text-aurora-text-muted">${versions[0]?.description}</span>
          </div>
          <div class="divide-y divide-aurora-border">
            ${versions.map(p => {
              const key = `${p.name}@${p.version}`;
              const [statusLabel, statusClass] = STATUS[p.status] || [p.status, 'text-white/50 bg-white/5'];
              const report = p.test_report;
              return html`
                <div class="p-4 flex flex-col gap-3">
                  <div class="flex items-center gap-2 flex-wrap">
                    <code class="text-xs">v${p.version}</code>
                    <span class=${`rounded-full px-2 py-0.5 text-[10px] ${statusClass}`}>${statusLabel}</span>
                    <span class="text-[10px] text-aurora-text-muted">riesgo ${p.risk} · ${p.permissions?.length ? p.permissions.join(', ') : 'sin permisos'}</span>
                    <span class="flex-1"></span>
                    ${!['approved', 'active'].includes(p.status) && html`<${Button} size="xs" onClick=${() => action(`delete:${key}`, () => deleteJSON(`/tools/forge/packages/${encodeURIComponent(p.name)}/${p.version}`), 'Draft eliminado.')}>Eliminar<//>`}
                    ${!['approved', 'active'].includes(p.status) && html`<${Chip} onClick=${() => action(`test:${key}`, () => postJSON(`/tools/forge/packages/${encodeURIComponent(p.name)}/${p.version}/test`, {}), 'Todos los tests pasaron.')}>${busy === `test:${key}` ? 'Probando…' : '▶ Tests'}<//>`}
                    ${p.status === 'approved' && html`<${Chip} variant="accent" onClick=${() => action(`activate:${key}`, () => postJSON(`/tools/forge/packages/${encodeURIComponent(p.name)}/${p.version}/activate`, {}), 'Versión activada y disponible para Lyra.')}>Activar<//>`}
                    ${p.status === 'active' && html`<span class="text-[10px] text-emerald-300">● Lyra puede usarla ahora</span>`}
                    ${p.status === 'approved' && versions.some(v => v.status === 'active') && html`<${Chip} onClick=${() => action(`rollback:${key}`, () => postJSON(`/tools/forge/packages/${encodeURIComponent(p.name)}/${p.version}/rollback`, {}), 'Rollback completado.')}>↶ Rollback aquí<//>`}
                  </div>

                  ${report && html`<div class="grid gap-1">
                    ${report.cases.map(c => html`<div class=${`rounded px-2 py-1 text-[10px] font-mono ${c.passed ? 'bg-emerald-500/8 text-emerald-300' : 'bg-red-500/8 text-red-300'}`}>${c.passed ? '✓' : '✕'} ${c.name}${c.passed ? '' : ` — ${c.result?.error || 'resultado inesperado'}`}</div>`)}
                  </div>`}

                  ${p.status === 'tested' && html`<div class="flex items-center gap-2">
                    <input class="flex-1 rounded border border-aurora-border bg-aurora-bg px-2 py-1 font-mono text-xs" placeholder=${`Escribí exactamente ${key}`} value=${confirmations[key] || ''} onInput=${e => setConfirmations(v => ({ ...v, [key]: e.target.value }))} />
                    <${Chip} variant="accent" disabled=${confirmations[key] !== key} onClick=${() => action(`approve:${key}`, () => postJSON(`/tools/forge/packages/${encodeURIComponent(p.name)}/${p.version}/approve`, { confirmation: confirmations[key] }), 'Versión aprobada. Todavía falta activarla.')}>Aprobar instalación<//>
                  </div>`}

                  ${p.status === 'active' && html`<div class="grid md:grid-cols-[1fr_auto] gap-2">
                    <input class="rounded border border-aurora-border bg-aurora-bg px-2 py-1 font-mono text-xs" placeholder='Arguments JSON, ej. {"text":"hola"}' value=${runArgs[key] || ''} onInput=${e => setRunArgs(v => ({ ...v, [key]: e.target.value }))} />
                    <${Chip} disabled=${p.requires_approval && runConfirmations[key] !== `RUN ${p.name}`} onClick=${() => ejecutar(p)}>${busy === `run:${key}` ? 'Ejecutando…' : p.requires_approval ? 'Aprobar y ejecutar una vez' : 'Probar activa'}<//>
                    ${p.requires_approval && html`<input class="md:col-span-2 rounded border border-amber-500/30 bg-amber-500/5 px-2 py-1 font-mono text-xs" placeholder=${`Permiso sensible: escribí RUN ${p.name}`} value=${runConfirmations[key] || ''} onInput=${e => setRunConfirmations(v => ({ ...v, [key]: e.target.value }))} />`}
                    ${runResults[key] && html`<pre class="md:col-span-2 max-h-52 overflow-auto rounded bg-black/20 p-2 text-[10px]">${pretty(runResults[key])}</pre>`}
                  </div>`}
                </div>`;
            })}
          </div>
        </section>`)}
    </div>
  `;
}

export default ToolForge;
