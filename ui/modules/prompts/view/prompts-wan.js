const html = (...args) => globalThis.html(...args);
const { useState, useEffect } = globalThis.preactHooks;
import { copiarTexto } from '../../../components/shared/clipboard.js';
import { addGuardado } from '../scripts/guardar.js';
import { getBuilderTemplate } from '../../../components/shared/builder-api.js';
import { BuilderChipsEditor } from './editor-chips.js';

const WAN_ORDEN = ['apertura','sujeto','camara','reveal','iluminacion','estilo','movimiento_sujeto'];

export default function TabWan() {
  const [wanData, setWanData] = useState(null);
  useEffect(() => { getBuilderTemplate('wan').then(d => d?.datos && setWanData(d.datos)).catch(() => {}); }, []);
  const [modoId, setModoId]       = useState('t2v');
  const [secciones, setSecciones] = useState({});
  const [negativos, setNegativos] = useState([]);
  const [negFree, setNegFree]     = useState('');
  const [nsfw, setNsfw]           = useState(false);
  const [copiado, setCopiado]     = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);

  if (!wanData) return html`<div class="comfy-loading">Cargando datos Wan Video…</div>`;

  const modoActual  = wanData.modos?.find(m => m.id === modoId) || wanData.modos?.[0];
  const settings    = wanData.settings?.[modoId] || {};
  const presetsFilt = (wanData.presets || []).filter(p => p?.id && !p.id.startsWith('_') && p.modo === modoId && (nsfw || !p.nsfw));
  const ordenFilt   = [...WAN_ORDEN, ...(nsfw ? ['intimidad','ropa_wan'] : [])].filter(id => {
    if (modoId === 'i2v' && (id === 'sujeto' || id === 'apertura')) return false;
    const s = wanData.secciones?.find(s => s.id === id);
    return s && (nsfw || !s.nsfw);
  });

  const promptCompleto = secciones['_prompt_completo'];
  const positivePreview = promptCompleto || ordenFilt.map(id => (secciones[id] || '').trim()).filter(Boolean).join(', ');
  const negPreview = [negativos.join(', '), negFree.trim()].filter(Boolean).join(', ');

  const chipActivo = (secId, chip) => {
    const cur = secciones[secId] || '';
    return cur === chip || cur.split(', ').includes(chip);
  };

  const toggleChip = (secId, chip) => {
    setSecciones(prev => {
      const cur = prev[secId] || '';
      const partes = cur ? cur.split(', ').filter(Boolean) : [];
      const idx = partes.indexOf(chip);
      return { ...prev, [secId]: idx >= 0 ? partes.filter((_,i) => i !== idx).join(', ') : [...partes, chip].join(', '), _prompt_completo: '' };
    });
  };

  const toggleNeg = (chip) => setNegativos(prev => prev.includes(chip) ? prev.filter(c => c !== chip) : [...prev, chip]);

  const aplicarPreset = (p) => { setSecciones({ ...p.secciones }); setNegativos([]); setNegFree(''); };

  const limpiar = () => { setSecciones({}); setNegativos([]); setNegFree(''); };

  const cargarEjemplo = (ej) => { setSecciones({ _prompt_completo: ej.prompt }); setModoId(ej.modo); };

  const copiar = async (txt, id) => { await copiarTexto(txt); setCopiado(id); setTimeout(() => setCopiado(null), 1200); };

  const guardar = () => { if (positivePreview) addGuardado(positivePreview, `Wan ${modoActual?.label || ''}`); };

  return html`
    <div class="comfy-view wan-view">
      <div class="wan-modo-row">
        ${(wanData.modos || []).map(m => html`
          <button key=${m.id} class=${'wan-modo-btn' + (modoId === m.id ? ' active' : '')}
            onClick=${() => { setModoId(m.id); setSecciones({}); }}
            title=${m.desc || m.label}>${m.icon} ${m.label}</button>
        `)}
        <button class=${'nsfw-toggle' + (nsfw ? ' active' : '')} onClick=${() => setNsfw(!nsfw)}>🔞 NSFW</button>
        ${settings.cfg && html`
          <div class="wan-settings-badge">CFG ${settings.cfg} · Steps ${settings.steps} · ${settings.fps}fps · ${settings.duracion}</div>
        `}
      </div>

      ${settings.nota && html`<div class="wan-hint-bar"><span>ℹ</span> ${settings.nota}</div>`}
      ${modoId === 'i2v' && html`
        <div class="wan-hint-bar wan-hint-i2v">
          <span>🖼</span>
          <span>Modo I2V — la imagen define sujeto y estilo. El prompt <strong>solo describe movimiento</strong>. Mantén el prompt corto (10–30 palabras).</span>
        </div>
      `}

      <div class="comfy-presets-row">
        <span class="comfy-presets-label">Presets</span>
        ${presetsFilt.map(p => html`
          <button key=${p.id} class="comfy-preset-btn" onClick=${() => aplicarPreset(p)}>${p.label}</button>
        `)}
        <button class="comfy-btn-limpiar" onClick=${limpiar}>✕ Limpiar</button>
        <button class="comfy-btn-limpiar" onClick=${() => setEditorOpen(true)} title="Editar chips y presets">✏</button>
      </div>

      <div class="comfy-layout wan-layout">
        <div class="comfy-constructor">
          ${ordenFilt.map(id => {
            const sec = wanData.secciones?.find(s => s.id === id);
            if (!sec) return null;
            const chips = sec.chips || [];
            const cur = secciones[id] || '';
            return html`
              <div key=${id} class="comfy-seccion">
                <div class="comfy-seccion-head">
                  <span class="comfy-seccion-icon">${sec.icon || '◈'}</span>
                  <span class="comfy-seccion-label">${sec.label}</span>
                  ${sec.desc && html`<span class="wan-sec-desc">${sec.desc}</span>`}
                  ${cur && html`<button class="comfy-seccion-clear" onClick=${() => setSecciones(p => ({ ...p, [id]: '' }))}>✕</button>`}
                </div>
                <div class="comfy-chips">
                  ${chips.map(chip => html`
                    <button key=${chip} class=${'comfy-chip' + (chipActivo(id, chip) ? ' active' : '')}
                      onClick=${() => toggleChip(id, chip)}>${chip}</button>
                  `)}
                </div>
                <input type="text" class="comfy-free-input" placeholder=${sec.placeholder || 'Texto libre…'}
                  value=${cur} onInput=${e => setSecciones(p => ({ ...p, [id]: e.target.value, _prompt_completo: '' }))} />
              </div>
            `;
          })}

          <div class="comfy-seccion comfy-seccion-negative">
            <div class="comfy-seccion-head">
              <span class="comfy-seccion-icon">⛔</span>
              <span class="comfy-seccion-label">Negative prompt</span>
              ${(negativos.length > 0 || negFree) && html`
                <button class="comfy-seccion-clear" onClick=${() => { setNegativos([]); setNegFree(''); }}>✕</button>
              `}
            </div>
            <div class="comfy-chips comfy-chips-negative">
              ${(wanData.negativos_comunes || []).map(chip => html`
                <button key=${chip} class=${'comfy-chip comfy-chip-neg' + (negativos.includes(chip) ? ' active' : '')}
                  onClick=${() => toggleNeg(chip)}>${chip}</button>
              `)}
            </div>
            <input type="text" class="comfy-free-input" placeholder="Negativos adicionales…"
              value=${negFree} onInput=${e => setNegFree(e.target.value)} />
          </div>

          ${wanData.ejemplos?.length > 0 && html`
            <div class="wan-ejemplos">
              <div class="wan-ejemplos-head">
                <span class="comfy-presets-label">Ejemplos reales</span>
              </div>
              ${wanData.ejemplos.map(ej => html`
                <div key=${ej.id} class="wan-ejemplo" onClick=${() => cargarEjemplo(ej)}>
                  <div class="wan-ejemplo-head">
                    <span class="wan-ejemplo-modo">${wanData.modos?.find(m => m.id === ej.modo)?.icon} ${ej.modo?.toUpperCase()}</span>
                    <span class="wan-ejemplo-label">${ej.label}</span>
                  </div>
                  <p class="wan-ejemplo-preview">${(ej.prompt || '').slice(0, 100)}…</p>
                </div>
              `)}
            </div>
          `}
        </div>

        <div class="comfy-preview-panel">
          <div class="comfy-preview-head">
            <span class="comfy-preview-title">Positive prompt</span>
            <button class="comfy-copy-btn" onClick=${() => copiar(positivePreview, 'pos')}>
              ${copiado === 'pos' ? '✓' : '⎘ Copiar'}
            </button>
            ${positivePreview && html`<button class="comfy-copy-btn-sm" onClick=${guardar} title="Guardar">💾</button>`}
          </div>
          <pre class="comfy-preview-box comfy-preview-positive wan-preview">
            ${positivePreview || 'El prompt aparecerá aquí…\n\nEstructura recomendada:\n[Apertura] → [Sujeto] → [Cámara] → [Reveal] → [Luz] → [Estilo]'}
          </pre>

          ${negPreview && html`
            <div class="comfy-preview-head" style="margin-top:10px">
              <span class="comfy-preview-title">Negative</span>
              <button class="comfy-copy-btn-sm" onClick=${() => copiar(negPreview, 'neg')}>
                ${copiado === 'neg' ? '✓' : '⎘'}
              </button>
            </div>
            <pre class="comfy-preview-box comfy-preview-negative">${negPreview}</pre>
          `}

          <button class="comfy-copy-btn wan-copy-all" onClick=${() => copiar([positivePreview, negPreview ? `\n\nNEGATIVE:\n${negPreview}` : ''].join(''), 'all')}>
            ${copiado === 'all' ? '✓ Copiado' : '⎘ Copiar todo (positive + negative)'}
          </button>

          <div class="wan-settings-panel">
            <div class="wan-settings-title">Settings recomendados — ${modoActual?.label}</div>
            <div class="wan-settings-grid">
              <span>CFG</span><strong>${settings.cfg}</strong>
              <span>Steps</span><strong>${settings.steps}</strong>
              <span>Sampler</span><strong>${settings.sampler}</strong>
              <span>Scheduler</span><strong>${settings.scheduler}</strong>
              <span>FPS</span><strong>${settings.fps}</strong>
              <span>Duración</span><strong>${settings.duracion}</strong>
            </div>
          </div>
        </div>
      </div>

      ${editorOpen && html`
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick=${() => setEditorOpen(false)}>
          <div onClick=${e => e.stopPropagation()}>
            <${BuilderChipsEditor} tipo="wan" onClose=${() => { setEditorOpen(false); getBuilderTemplate('wan').then(d => d?.datos && setWanData(d.datos)); }} />
          </div>
        </div>
      `}
    </div>
  `;
}
