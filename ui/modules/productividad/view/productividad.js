const { html } = globalThis;
const { useEffect, useMemo, useState } = globalThis.preactHooks;

import {
  Button, Chip, ChipGroup, Empty, Input, Panel, PanelBody, PanelHeader,
  Select, Status, Textarea,
} from '../../../components/index.js';
import { JsonBlock } from '../../../components/shared/JsonBlock.js';
import {
  actualizarTask,
  capturarPagina,
  capturarScreenshot,
  crearFormProfile,
  crearFormTemplate,
  crearMeeting,
  crearPrice,
  crearPriceCheck,
  crearResearch,
  crearTabSession,
  crearTask,
  extCmd,
  extStatus,
  guardarClipboard,
  listarCapturas,
  listarClipboard,
  listarFormProfiles,
  listarFormTemplates,
  listarMeetings,
  listarPrices,
  listarResearch,
  listarTabSessions,
  listarTasks,
  obtenerCaptura,
  overview,
} from '../scripts/productividad.js';

const SECTIONS = ['Capture', 'Research', 'Tasks', 'Clipboard', 'Forms', 'Meetings', 'Tabs', 'Prices'];

function SectionNav({ active, setActive }) {
  return html`
    <div class="flex flex-wrap gap-2">
      ${SECTIONS.map(s => html`<${Button} size="sm" active=${active === s} onClick=${() => setActive(s)}>${s}</${Button}>`)}
    </div>
  `;
}

function StatStrip({ data, ext }) {
  const counts = data?.counts || {};
  return html`
    <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
      ${['capturas', 'research', 'tasks', 'clipboard', 'prices'].map(k => html`
        <div class="rounded-md border border-aurora-border bg-aurora-surface-2 px-3 py-2">
          <div class="text-xs text-aurora-text-dim">${k}</div>
          <div class="text-xl font-semibold text-aurora-text">${counts[k] || 0}</div>
        </div>
      `)}
      <div class="rounded-md border border-aurora-border bg-aurora-surface-2 px-3 py-2">
        <div class="text-xs text-aurora-text-dim">extension</div>
        <${Status} tone=${ext?.connected ? 'ok' : 'err'}>${ext?.connected ? 'online' : 'offline'}</${Status}>
      </div>
    </div>
  `;
}

function CaptureView({ captures, reload, setSelectedCapture }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  async function run(fn) {
    setBusy(true);
    setResult(null);
    try {
      setResult(await fn());
      await reload();
    } finally {
      setBusy(false);
    }
  }
  return html`
    <div class="grid gap-3 xl:grid-cols-[.8fr_1.2fr]">
      <${Panel}>
        <${PanelHeader}>
          <div class="font-semibold text-aurora-text">Capturar contexto</div>
          <${Status} tone=${busy ? 'loading' : 'ok'}>${busy ? 'capturando' : 'listo'}</${Status}>
        </${PanelHeader}>
        <${PanelBody}>
          <div class="grid gap-2">
            <${Button} variant="primary" disabled=${busy} onClick=${() => run(capturarPagina)}>Capturar pagina</${Button}>
            <${Button} disabled=${busy} onClick=${() => run(capturarScreenshot)}>Capturar screenshot</${Button}>
            ${result && html`<${JsonBlock} value=${{ titulo: result.titulo || result.tab?.title, url: result.url || result.tab?.url }} />`}
          </div>
        </${PanelBody}>
      </${Panel}>

      <${Panel}>
        <${PanelHeader}>
          <div class="font-semibold text-aurora-text">Historial</div>
          <${Chip}>${captures.length}</${Chip}>
        </${PanelHeader}>
        <${PanelBody}>
          ${captures.length ? html`
            <div class="grid gap-2">
              ${captures.map(c => html`
                <button class="rounded-md border border-aurora-border bg-aurora-surface-2 px-3 py-2 text-left fx-hover" onClick=${() => setSelectedCapture(c.id)}>
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="flex-1 text-sm font-semibold text-aurora-text">${c.titulo || c.url || 'Captura'}</span>
                    <${Chip}>${c.tipo}</${Chip}>
                    <${Chip} variant="dim">${c.chars || 0}c</${Chip}>
                  </div>
                  <div class="mt-1 truncate text-xs text-aurora-text-dim">${c.url || ''}</div>
                </button>
              `)}
            </div>
          ` : html`<${Empty} title="Sin capturas">Usa la extension para capturar la pagina activa.</${Empty}>`}
        </${PanelBody}>
      </${Panel}>
    </div>
  `;
}

function ResearchView({ captures, research, reload }) {
  const [captureId, setCaptureId] = useState('');
  const [result, setResult] = useState(null);
  async function create() {
    if (!captureId) return;
    const cap = await obtenerCaptura(captureId);
    const c = cap.captura || {};
    const res = await crearResearch({
      captura_id: Number(captureId),
      resumen_corto: (c.contenido || '').slice(0, 240),
      resumen_largo: (c.contenido || '').slice(0, 1400),
      fuentes: [{ titulo: c.titulo, url: c.url }],
      prompt: 'web-research',
    });
    setResult(res);
    await reload();
  }
  return html`
    <div class="grid gap-3 xl:grid-cols-[.8fr_1.2fr]">
      <${Panel}>
        <${PanelHeader}><div class="font-semibold text-aurora-text">Research desde captura</div></${PanelHeader}>
        <${PanelBody}>
          <div class="grid gap-3">
            <${Select} value=${captureId} onChange=${e => setCaptureId(e.target.value)}>
              <option value="">Elegir captura</option>
              ${captures.map(c => html`<option value=${c.id}>${c.titulo || c.url || c.id}</option>`)}
            </${Select}>
            <${Button} variant="primary" disabled=${!captureId} onClick=${create}>Crear research</${Button}>
            ${result && html`<${JsonBlock} value=${result} />`}
          </div>
        </${PanelBody}>
      </${Panel}>
      <${Panel}>
        <${PanelHeader}><div class="font-semibold text-aurora-text">Investigaciones</div><${Chip}>${research.length}</${Chip}></${PanelHeader}>
        <${PanelBody}>
          ${research.length ? html`<div class="grid gap-2">${research.map(r => html`
            <div class="rounded-md border border-aurora-border bg-aurora-surface-2 px-3 py-2">
              <div class="text-sm font-semibold text-aurora-text">${r.titulo || r.url || 'Research'}</div>
              <div class="mt-1 text-xs text-aurora-text-dim">${r.resumen_corto || ''}</div>
            </div>
          `)}</div>` : html`<${Empty} title="Sin research" />`}
        </${PanelBody}>
      </${Panel}>
    </div>
  `;
}

function TasksView({ captures, tasks, reload }) {
  const [title, setTitle] = useState('');
  const [captureId, setCaptureId] = useState('');
  async function add() {
    await crearTask({ titulo: title || 'Tarea web', captura_id: captureId ? Number(captureId) : null });
    setTitle('');
    await reload();
  }
  return html`
    <div class="grid gap-3 xl:grid-cols-[.8fr_1.2fr]">
      <${Panel}>
        <${PanelHeader}><div class="font-semibold text-aurora-text">Nueva tarea</div></${PanelHeader}>
        <${PanelBody}>
          <div class="grid gap-3">
            <${Input} value=${title} onInput=${e => setTitle(e.target.value)} placeholder="Titulo de tarea" />
            <${Select} value=${captureId} onChange=${e => setCaptureId(e.target.value)}>
              <option value="">Sin captura</option>
              ${captures.map(c => html`<option value=${c.id}>${c.titulo || c.url || c.id}</option>`)}
            </${Select}>
            <${Button} variant="primary" onClick=${add}>Crear tarea</${Button}>
          </div>
        </${PanelBody}>
      </${Panel}>
      <${Panel}>
        <${PanelHeader}><div class="font-semibold text-aurora-text">Tareas</div><${Chip}>${tasks.length}</${Chip}></${PanelHeader}>
        <${PanelBody}>
          <div class="grid gap-2">
            ${tasks.map(t => html`
              <div class="flex flex-wrap items-center gap-2 rounded-md border border-aurora-border bg-aurora-surface-2 px-3 py-2">
                <div class="flex-1">
                  <div class="text-sm font-semibold text-aurora-text">${t.titulo}</div>
                  <div class="text-xs text-aurora-text-dim">${t.url || t.descripcion || ''}</div>
                </div>
                <${Chip}>${t.prioridad}</${Chip}>
                <${Button} size="sm" onClick=${async () => { await actualizarTask(t.id, { estado: t.estado === 'done' ? 'open' : 'done' }); await reload(); }}>${t.estado}</${Button}>
              </div>
            `)}
          </div>
        </${PanelBody}>
      </${Panel}>
    </div>
  `;
}

function ClipboardView({ items, reload }) {
  const [text, setText] = useState('');
  async function save() {
    await guardarClipboard({ contenido: text });
    setText('');
    await reload();
  }
  async function readFromExt() {
    const out = await extCmd('clipboard_read');
    setText(out.text || '');
  }
  return html`
    <div class="grid gap-3 xl:grid-cols-[.8fr_1.2fr]">
      <${Panel}>
        <${PanelHeader}><div class="font-semibold text-aurora-text">Clipboard Memory</div></${PanelHeader}>
        <${PanelBody}>
          <div class="grid gap-3">
            <${Textarea} rows=${8} value=${text} onInput=${e => setText(e.target.value)} placeholder="Texto a guardar" />
            <div class="flex gap-2"><${Button} onClick=${readFromExt}>Leer clipboard</${Button}><${Button} variant="primary" disabled=${!text.trim()} onClick=${save}>Guardar</${Button}></div>
          </div>
        </${PanelBody}>
      </${Panel}>
      <${Panel}>
        <${PanelHeader}><div class="font-semibold text-aurora-text">Memoria</div><${Chip}>${items.length}</${Chip}></${PanelHeader}>
        <${PanelBody}>
          <div class="grid gap-2">${items.map(i => html`
            <div class="rounded-md border border-aurora-border bg-aurora-surface-2 px-3 py-2">
              <div class="flex gap-2"><${Chip}>${i.tipo}</${Chip}><span class="text-xs text-aurora-text-dim">${i.destino || ''}</span></div>
              <div class="mt-1 text-sm text-aurora-text">${(i.contenido || '').slice(0, 220)}</div>
            </div>
          `)}</div>
        </${PanelBody}>
      </${Panel}>
    </div>
  `;
}

function FormsView({ profiles, templates, reload }) {
  const [inspect, setInspect] = useState(null);
  const [profileName, setProfileName] = useState('');
  const [profileJson, setProfileJson] = useState('{\n  "email": "",\n  "nombre": ""\n}');
  async function inspectForms() {
    setInspect(await extCmd('inspect_forms'));
  }
  async function saveProfile() {
    await crearFormProfile({ nombre: profileName || 'Perfil', datos: JSON.parse(profileJson || '{}') });
    await reload();
  }
  async function saveTemplate() {
    if (!inspect?.forms?.length) return;
    const host = new URL(inspect.url).hostname;
    await crearFormTemplate({ dominio: host, nombre: inspect.titulo, campos: inspect.forms });
    await reload();
  }
  return html`
    <div class="grid gap-3 xl:grid-cols-[.9fr_1.1fr]">
      <${Panel}>
        <${PanelHeader}><div class="font-semibold text-aurora-text">Form Filler</div><${Button} size="sm" onClick=${inspectForms}>Inspeccionar</${Button}></${PanelHeader}>
        <${PanelBody}>
          <div class="grid gap-3">
            ${inspect && html`<${JsonBlock} value=${inspect} />`}
            <${Button} disabled=${!inspect?.forms?.length} onClick=${saveTemplate}>Guardar plantilla</${Button}>
            <${Input} value=${profileName} onInput=${e => setProfileName(e.target.value)} placeholder="Nombre de perfil" />
            <${Textarea} rows=${6} value=${profileJson} onInput=${e => setProfileJson(e.target.value)} />
            <${Button} variant="primary" onClick=${saveProfile}>Guardar perfil</${Button}>
          </div>
        </${PanelBody}>
      </${Panel}>
      <${Panel}>
        <${PanelHeader}><div class="font-semibold text-aurora-text">Perfiles y plantillas</div></${PanelHeader}>
        <${PanelBody}>
          <div class="grid gap-2">
            ${profiles.map(p => html`<div class="rounded-md border border-aurora-border bg-aurora-surface-2 px-3 py-2"><div class="text-sm font-semibold text-aurora-text">${p.nombre}</div><div class="text-xs text-aurora-text-dim">${Object.keys(p.datos || {}).join(', ')}</div></div>`)}
            ${templates.map(t => html`<div class="rounded-md border border-aurora-border bg-aurora-surface-2 px-3 py-2"><div class="text-sm font-semibold text-aurora-text">${t.nombre || t.dominio}</div><div class="text-xs text-aurora-text-dim">${t.dominio} · ${(t.campos || []).length} forms</div></div>`)}
          </div>
        </${PanelBody}>
      </${Panel}>
    </div>
  `;
}

function MeetingsView({ meetings, reload }) {
  const [snapshot, setSnapshot] = useState(null);
  async function capture() {
    const data = await extCmd('meeting_snapshot');
    setSnapshot(data);
    await crearMeeting(data);
    await reload();
  }
  return html`
    <div class="grid gap-3 xl:grid-cols-[.8fr_1.2fr]">
      <${Panel}><${PanelHeader}><div class="font-semibold text-aurora-text">Meeting Notes</div><${Button} size="sm" onClick=${capture}>Capturar</${Button}></${PanelHeader}><${PanelBody}>${snapshot ? html`<${JsonBlock} value=${snapshot} />` : html`<${Empty} title="Sin snapshot" />`}</${PanelBody}></${Panel}>
      <${Panel}><${PanelHeader}><div class="font-semibold text-aurora-text">Reuniones</div><${Chip}>${meetings.length}</${Chip}></${PanelHeader}><${PanelBody}><div class="grid gap-2">${meetings.map(m => html`<div class="rounded-md border border-aurora-border bg-aurora-surface-2 px-3 py-2"><div class="text-sm font-semibold text-aurora-text">${m.titulo || m.url || 'Reunion'}</div><div class="text-xs text-aurora-text-dim">${m.plataforma || ''}</div></div>`)}</div></${PanelBody}></${Panel}>
    </div>
  `;
}

function TabsView({ sessions, reload }) {
  const [tabs, setTabs] = useState([]);
  async function listTabs() {
    const out = await extCmd('tabs_list');
    setTabs(out.tabs || []);
  }
  async function archive() {
    await crearTabSession({ nombre: `Tabs ${new Date().toLocaleString()}`, tabs });
    await reload();
  }
  return html`
    <div class="grid gap-3 xl:grid-cols-[1fr_1fr]">
      <${Panel}><${PanelHeader}><div class="font-semibold text-aurora-text">Tab Commander</div><div class="flex gap-2"><${Button} size="sm" onClick=${listTabs}>Listar</${Button}><${Button} size="sm" variant="primary" disabled=${!tabs.length} onClick=${archive}>Archivar</${Button}></div></${PanelHeader}><${PanelBody}><div class="grid gap-2">${tabs.map(t => html`<div class="rounded-md border border-aurora-border bg-aurora-surface-2 px-3 py-2"><div class="text-sm font-semibold text-aurora-text">${t.title}</div><div class="truncate text-xs text-aurora-text-dim">${t.url}</div></div>`)}</div></${PanelBody}></${Panel}>
      <${Panel}><${PanelHeader}><div class="font-semibold text-aurora-text">Sesiones archivadas</div><${Chip}>${sessions.length}</${Chip}></${PanelHeader}><${PanelBody}><div class="grid gap-2">${sessions.map(s => html`<div class="rounded-md border border-aurora-border bg-aurora-surface-2 px-3 py-2"><div class="text-sm font-semibold text-aurora-text">${s.nombre}</div><div class="text-xs text-aurora-text-dim">${s.resumen || ''}</div></div>`)}</div></${PanelBody}></${Panel}>
    </div>
  `;
}

function PricesView({ prices, reload }) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [scan, setScan] = useState(null);
  async function add() {
    await crearPrice({ nombre: name || 'Producto', url });
    setName('');
    setUrl('');
    await reload();
  }
  async function scanActive(item) {
    const out = await extCmd('price_extract');
    setScan(out);
    await crearPriceCheck(item.id, out);
    await reload();
  }
  return html`
    <div class="grid gap-3 xl:grid-cols-[.8fr_1.2fr]">
      <${Panel}><${PanelHeader}><div class="font-semibold text-aurora-text">Price Watch</div></${PanelHeader}><${PanelBody}><div class="grid gap-3"><${Input} value=${name} onInput=${e => setName(e.target.value)} placeholder="Producto" /><${Input} value=${url} onInput=${e => setUrl(e.target.value)} placeholder="URL" /><${Button} variant="primary" disabled=${!url.trim()} onClick=${add}>Vigilar producto</${Button}>${scan && html`<${JsonBlock} value=${scan} />`}</div></${PanelBody}></${Panel}>
      <${Panel}><${PanelHeader}><div class="font-semibold text-aurora-text">Productos</div><${Chip}>${prices.length}</${Chip}></${PanelHeader}><${PanelBody}><div class="grid gap-2">${prices.map(p => html`<div class="flex flex-wrap items-center gap-2 rounded-md border border-aurora-border bg-aurora-surface-2 px-3 py-2"><div class="flex-1"><div class="text-sm font-semibold text-aurora-text">${p.nombre}</div><div class="truncate text-xs text-aurora-text-dim">${p.url}</div></div><${Chip}>${p.ultimo_precio || 'n/d'}</${Chip}><${Button} size="sm" onClick=${() => scanActive(p)}>Scan</${Button}></div>`)}</div></${PanelBody}></${Panel}>
    </div>
  `;
}

export default function Productividad() {
  const [active, setActive] = useState('Capture');
  const [stats, setStats] = useState(null);
  const [ext, setExt] = useState(null);
  const [captures, setCaptures] = useState([]);
  const [research, setResearch] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [clipboard, setClipboard] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [tabSessions, setTabSessions] = useState([]);
  const [prices, setPrices] = useState([]);
  const [selectedCapture, setSelectedCapture] = useState(null);

  async function reload() {
    const [ov, ex, cap, res, ta, clip, prof, tmpl, meet, tabs, prs] = await Promise.all([
      overview().catch(() => null),
      extStatus().catch(() => null),
      listarCapturas().catch(() => []),
      listarResearch().catch(() => []),
      listarTasks().catch(() => []),
      listarClipboard().catch(() => []),
      listarFormProfiles().catch(() => []),
      listarFormTemplates().catch(() => []),
      listarMeetings().catch(() => []),
      listarTabSessions().catch(() => []),
      listarPrices().catch(() => []),
    ]);
    setStats(ov);
    setExt(ex);
    setCaptures(cap);
    setResearch(res);
    setTasks(ta);
    setClipboard(clip);
    setProfiles(prof);
    setTemplates(tmpl);
    setMeetings(meet);
    setTabSessions(tabs);
    setPrices(prs);
  }

  useEffect(() => { reload(); }, []);

  const body = useMemo(() => {
    if (active === 'Research') return html`<${ResearchView} captures=${captures} research=${research} reload=${reload} />`;
    if (active === 'Tasks') return html`<${TasksView} captures=${captures} tasks=${tasks} reload=${reload} />`;
    if (active === 'Clipboard') return html`<${ClipboardView} items=${clipboard} reload=${reload} />`;
    if (active === 'Forms') return html`<${FormsView} profiles=${profiles} templates=${templates} reload=${reload} />`;
    if (active === 'Meetings') return html`<${MeetingsView} meetings=${meetings} reload=${reload} />`;
    if (active === 'Tabs') return html`<${TabsView} sessions=${tabSessions} reload=${reload} />`;
    if (active === 'Prices') return html`<${PricesView} prices=${prices} reload=${reload} />`;
    return html`<${CaptureView} captures=${captures} reload=${reload} setSelectedCapture=${setSelectedCapture} />`;
  }, [active, captures, research, tasks, clipboard, profiles, templates, meetings, tabSessions, prices]);

  return html`
    <div class="h-full min-h-0 flex flex-col gap-3 overflow-auto p-3">
      <div class="flex flex-wrap items-center gap-3">
        <div class="min-w-[220px] flex-1">
          <h1 class="text-lg font-semibold text-aurora-text">Productividad</h1>
          <div class="text-xs text-aurora-text-dim">Capturas, research, tareas, clipboard, formularios, reuniones, tabs y precios</div>
        </div>
        <${Button} size="sm" onClick=${reload}>Recargar</${Button}>
      </div>
      <${StatStrip} data=${stats} ext=${ext} />
      <${SectionNav} active=${active} setActive=${setActive} />
      ${selectedCapture && html`<${Status} tone="ok">Captura seleccionada #${selectedCapture}</${Status}>`}
      ${body}
    </div>
  `;
}
