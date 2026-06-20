const html = (...args) => globalThis.html(...args);
const { useState, useEffect } = globalThis.preactHooks;
import { copiarTexto } from '../../../components/shared/clipboard.js';
import { addGuardado } from '../scripts/guardar.js';
import { getBuilderTemplate } from '../../../components/shared/builder-api.js';
import { BuilderChipsEditor } from './editor-chips.js';

const COMFY_ORDEN = ['estilo','sujeto','pose','detalle_sujeto','iluminacion','escenario','encuadre','calidad'];

export default function TabComfyUI() {
  const [chipsData, setChipsData] = useState(null);
  useEffect(() => { getBuilderTemplate('comfyui').then(d => d?.datos && setChipsData(d.datos)).catch(() => {}); }, []);
  const [modeloId, setModeloId]     = useState('illustrious');
  const [secciones, setSecciones]   = useState({});
  const [negativos, setNegativos]   = useState([]);
  const [negFree, setNegFree]       = useState('');
  const [nsfw, setNsfw]             = useState(false);
  const [fluxClipL, setFluxClipL]   = useState('');
  const [fluxT5, setFluxT5]         = useState('');
  const [copiado, setCopiado]       = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);

  if (!chipsData) return html`<div class="comfy-loading">Cargando chips…</div>`;

  const modelos    = chipsData.modelos || [];
  const modelo     = modelos.find(m => m.id === modeloId) || modelos[0];
  const modo       = modelo?.modo || 'tags';
  const ordenFilt  = COMFY_ORDEN.filter(id => {
    const s = chipsData.secciones?.find(s => s.id === id);
    return s && (!s.modelos || s.modelos.includes(modeloId)) && (nsfw || !s.nsfw);
  });
  const presetsFilt = (chipsData.presets || []).filter(p => p?.id && !p.id.startsWith('_') && p.modelo === modeloId && (nsfw || !p.nsfw));

  let positivePreview = '';
  if (modo === 'flux') {
    positivePreview = [fluxClipL.trim() && `[clip_l]\n${fluxClipL.trim()}`, fluxT5.trim() && `[t5xxl]\n${fluxT5.trim()}`].filter(Boolean).join('\n\n');
  } else if (modo === 'natural') {
    positivePreview = secciones['natural'] || '';
  } else {
    const qp = nsfw && modelo?.quality_tags_nsfw ? modelo.quality_tags_nsfw : (modelo?.quality_positive || '');
    const partes = ordenFilt.map(id => (secciones[id] || '').trim()).filter(Boolean);
    positivePreview = [qp, ...partes].filter(Boolean).join(', ');
  }
  const negPreview = [modelo?.quality_negative || '', negativos.join(', '), negFree.trim()].filter(Boolean).join(', ');

  const toggleChip = (secId, chip) => {
    setSecciones(prev => {
      const cur = prev[secId] || '';
      const partes = cur ? cur.split(', ').filter(Boolean) : [];
      const idx = partes.indexOf(chip);
      return { ...prev, [secId]: idx >= 0 ? partes.filter((_,i) => i !== idx).join(', ') : [...partes, chip].join(', ') };
    });
  };

  const chipActivo = (secId, chip) => (secciones[secId] || '').split(', ').includes(chip);
  const toggleNeg = (chip) => setNegativos(prev => prev.includes(chip) ? prev.filter(c => c !== chip) : [...prev, chip]);

  const aplicarPreset = (p) => {
    if (modo === 'flux') { setFluxClipL(p.secciones?.clip_l || ''); setFluxT5(p.secciones?.t5xxl || ''); }
    else setSecciones({ ...p.secciones });
    setNegativos([]); setNegFree('');
  };

  const limpiar = () => { setSecciones({}); setNegativos([]); setNegFree(''); setFluxClipL(''); setFluxT5(''); };

  const copiar = async (txt, id) => {
    await copiarTexto(txt);
    setCopiado(id); setTimeout(() => setCopiado(null), 1200);
  };

  const guardar = () => { if (positivePreview) addGuardado(positivePreview, `ComfyUI ${modelo?.label || ''}`); };

  return html`
    <div class="comfy-view">
      <div class="comfy-modelo-row">
        ${modelos.map(m => html`
          <button key=${m.id} class=${'comfy-modelo-btn' + (modeloId === m.id ? ' active' : '')}
            onClick=${() => { setModeloId(m.id); setSecciones({}); setFluxClipL(''); setFluxT5(''); }}
            title=${m.desc || m.label}>${m.icon} ${m.label}</button>
        `)}
        <button class=${'nsfw-toggle' + (nsfw ? ' active' : '')} onClick=${() => setNsfw(!nsfw)}>🔞 NSFW</button>
      </div>

      ${modelo && html`
        <div class="comfy-modelo-hint">
          <span class="comfy-modelo-hint-icon">${modelo.icon}</span>
          <span>${modo === 'flux' ? modelo.hint_clip_l : modelo.hint_prompt}</span>
          <span class="comfy-modelo-cfg">CFG ${modelo.cfg} · Steps ${modelo.steps}</span>
        </div>
      `}

      <div class="comfy-presets-row">
        <span class="comfy-presets-label">Presets</span>
        ${presetsFilt.map(p => html`
          <button key=${p.id} class=${'comfy-preset-btn' + (p.nsfw ? ' nsfw' : '')}
            onClick=${() => aplicarPreset(p)}>${p.label}</button>
        `)}
        <button class="comfy-btn-limpiar" onClick=${limpiar}>✕ Limpiar</button>
        <button class="comfy-btn-limpiar" onClick=${() => setEditorOpen(true)} title="Editar chips y presets">✏</button>
      </div>

      <div class="comfy-layout">
        <div class="comfy-constructor">
          ${modo === 'flux' && html`
            <div class="comfy-seccion">
              <div class="comfy-seccion-head">
                <span class="comfy-seccion-icon">📝</span>
                <span class="comfy-seccion-label">CLIP-L (corto)</span>
              </div>
              <textarea class="comfy-free-input" style="min-height:60px" placeholder=${modelo?.hint_clip_l || 'Palabras clave…'}
                value=${fluxClipL} onInput=${e => setFluxClipL(e.target.value)} />
            </div>
            <div class="comfy-seccion">
              <div class="comfy-seccion-head">
                <span class="comfy-seccion-icon">📄</span>
                <span class="comfy-seccion-label">T5-XXL (descripción)</span>
              </div>
              <textarea class="comfy-free-input" style="min-height:100px" placeholder="Descripción detallada en lenguaje natural…"
                value=${fluxT5} onInput=${e => setFluxT5(e.target.value)} />
            </div>
          `}

          ${modo === 'natural' && html`
            <div class="comfy-seccion">
              <div class="comfy-seccion-head">
                <span class="comfy-seccion-icon">📝</span>
                <span class="comfy-seccion-label">Prompt natural</span>
              </div>
              <textarea class="comfy-free-input" style="min-height:140px" placeholder="Descripción en lenguaje natural…"
                value=${secciones['natural'] || ''} onInput=${e => setSecciones(p => ({ ...p, natural: e.target.value }))} />
            </div>
          `}

          ${modo === 'tags' && ordenFilt.map(id => {
            const sec = chipsData.secciones?.find(s => s.id === id);
            if (!sec) return null;
            const chips = sec.chips_por_modelo?.[modeloId] || sec.chips || [];
            const cur = secciones[id] || '';
            return html`
              <div key=${id} class="comfy-seccion">
                <div class="comfy-seccion-head">
                  <span class="comfy-seccion-icon">${sec.icon || '◈'}</span>
                  <span class="comfy-seccion-label">${sec.label}</span>
                  ${cur && html`<button class="comfy-seccion-clear" onClick=${() => setSecciones(p => ({ ...p, [id]: '' }))}>✕</button>`}
                </div>
                <div class="comfy-chips">
                  ${chips.map(chip => html`
                    <button key=${chip} class=${'comfy-chip' + (chipActivo(id, chip) ? ' active' : '')}
                      onClick=${() => toggleChip(id, chip)}>${chip}</button>
                  `)}
                </div>
                <input type="text" class="comfy-free-input" placeholder=${sec.placeholder || 'Texto libre…'}
                  value=${cur} onInput=${e => setSecciones(p => ({ ...p, [id]: e.target.value }))} />
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
              ${(chipsData.negativos_comunes || []).map(chip => html`
                <button key=${chip} class=${'comfy-chip comfy-chip-neg' + (negativos.includes(chip) ? ' active' : '')}
                  onClick=${() => toggleNeg(chip)}>${chip}</button>
              `)}
            </div>
            <input type="text" class="comfy-free-input" placeholder="Negativos adicionales…"
              value=${negFree} onInput=${e => setNegFree(e.target.value)} />
          </div>
        </div>

        <div class="comfy-preview-panel">
          <div class="comfy-preview-head">
            <span class="comfy-preview-title">Positive</span>
            <button class="comfy-copy-btn" onClick=${() => copiar(positivePreview, 'pos')}>
              ${copiado === 'pos' ? '✓' : '⎘ Copiar'}
            </button>
            ${positivePreview && html`<button class="comfy-copy-btn-sm" onClick=${guardar} title="Guardar">💾</button>`}
          </div>
          <pre class="comfy-preview-box comfy-preview-positive">
            ${positivePreview || 'El prompt aparecerá aquí…'}
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

          <button class="comfy-copy-btn" style="width:100%;margin-top:8px"
            onClick=${() => copiar([positivePreview, negPreview ? `\n\nNEGATIVE:\n${negPreview}` : ''].join(''), 'all')}>
            ${copiado === 'all' ? '✓ Copiado' : '⎘ Copiar todo (positive + negative)'}
          </button>

          ${modelo && html`
            <div class="wan-settings-panel">
              <div class="wan-settings-title">Settings recomendados — ${modelo.label}</div>
              <div class="wan-settings-grid">
                <span>CFG</span><strong>${modelo.cfg}</strong>
                <span>Steps</span><strong>${modelo.steps}</strong>
                <span>Sampler</span><strong>${modelo.sampler || 'euler'}</strong>
                <span>Scheduler</span><strong>${modelo.scheduler || 'normal'}</strong>
                ${modelo.quality_negative && html`<span>Negative</span><strong>Sí</strong>`}
              </div>
              ${modelo.nota && html`<div style="font-size:10px;color:var(--text-dim);margin-top:6px">${modelo.nota}</div>`}
            </div>
          `}
        </div>
      </div>

      ${editorOpen && html`
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick=${() => setEditorOpen(false)}>
          <div onClick=${e => e.stopPropagation()}>
            <${BuilderChipsEditor} tipo="comfyui" onClose=${() => { setEditorOpen(false); getBuilderTemplate('comfyui').then(d => d?.datos && setChipsData(d.datos)); }} />
          </div>
        </div>
      `}
    </div>
  `;
}
