const html = (...args) => globalThis.html(...args);
const { useState, useEffect } = globalThis.preactHooks;
import { Button } from '../../../components/Button.js';
import { Input } from '../../../components/Input.js';
import { Panel, PanelHeader, PanelBody } from '../../../components/Panel.js';
import { getBuilderTemplate, saveBuilderTemplate } from '../../../components/shared/builder-api.js';
import { Toast } from '../../../components/shared/toast.js';

export function BuilderChipsEditor({ tipo, onClose }) {
  const [data, setData] = useState(null);
  const [newChip, setNewChip] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getBuilderTemplate(tipo).then(d => { setData(d?.datos || null); setLoading(false); });
  }, [tipo]);

  const addChip = (secId) => {
    const val = (newChip[secId] || '').trim();
    if (!val) return;
    const updated = { ...data };
    const sec = updated.secciones?.find(s => s.id === secId);
    if (!sec) return;
    sec.chips = [...(sec.chips || []), val];
    setData({ ...updated });
    setNewChip(prev => ({ ...prev, [secId]: '' }));
    saveBuilderTemplate(`${tipo}_editor`, tipo, updated).catch(e => Toast.show(e.message, 'error'));
  };

  const removeChip = (secId, idx) => {
    const updated = { ...data };
    const sec = updated.secciones?.find(s => s.id === secId);
    if (!sec) return;
    sec.chips = (sec.chips || []).filter((_, i) => i !== idx);
    setData({ ...updated });
    saveBuilderTemplate(`${tipo}_editor`, tipo, updated).catch(e => Toast.show(e.message, 'error'));
  };

  const addSection = () => {
    const id = prompt('ID de la nueva sección (ej: estilo, sujeto):');
    if (!id?.trim()) return;
    const updated = { ...data, secciones: [...(data.secciones || []), { id: id.trim(), label: id.trim(), icon: '🏷', chips: [] }] };
    setData(updated);
    saveBuilderTemplate(`${tipo}_editor`, tipo, updated).catch(e => Toast.show(e.message, 'error'));
  };

  const removeSection = (secId) => {
    if (!confirm(`¿Eliminar sección "${secId}"?`)) return;
    const updated = { ...data, secciones: (data.secciones || []).filter(s => s.id !== secId) };
    setData(updated);
    saveBuilderTemplate(`${tipo}_editor`, tipo, updated).catch(e => Toast.show(e.message, 'error'));
  };

  if (loading) return html`<div class="p-4 text-center text-sm text-aurora-text-muted">Cargando…</div>`;
  if (!data) return html`<div class="p-4 text-center text-sm text-aurora-text-muted">Sin datos</div>`;

  return html`
    <${Panel} class="w-[min(560px,100%)] max-h-[88vh] flex flex-col">
      <${PanelHeader}>
        <span class="text-sm font-bold text-aurora-text">🏷 Editar Chips · ${tipo.toUpperCase()}</span>
        <${Button} size="sm" onClick=${onClose}>✕</${Button}>
      </${PanelHeader}>
      <${PanelBody} class="flex flex-col gap-3 overflow-y-auto">

        <${Button} size="sm" class="self-start" onClick=${addSection}>＋ Nueva sección</${Button}>

        ${(data.secciones || []).map(sec => html`
          <div key=${sec.id} class="bg-aurora-surface border border-aurora-border rounded-lg p-3 flex flex-col gap-2">
            <div class="flex items-center gap-2">
              <span class="text-base">${sec.icon || '🏷'}</span>
              <span class="text-xs font-bold text-aurora-text uppercase flex-1">${sec.label || sec.id}</span>
              <span class="text-[9px] text-aurora-text-dim">(${(sec.chips || []).length})</span>
              <${Button} size="sm" variant="danger" onClick=${() => removeSection(sec.id)}>🗑</${Button}>
            </div>
            <div class="flex flex-wrap gap-1">
              ${(sec.chips || []).map((chip, idx) => html`
                <span key=${idx} class="inline-flex items-center gap-1 bg-aurora-surface-2 border border-aurora-border rounded px-2 py-0.5 text-[10px] text-aurora-text-dim">
                  ${chip}
                  <button class="text-aurora-text-dim hover:text-aurora-error ml-0.5" onClick=${() => removeChip(sec.id, idx)}>✕</button>
                </span>
              `)}
            </div>
            <div class="flex gap-1">
              <${Input} class="flex-1" placeholder="Agregar chip…"
                value=${newChip[sec.id] || ''}
                onInput=${e => setNewChip(prev => ({ ...prev, [sec.id]: e.target.value }))}
                onKeyDown=${e => { if (e.key === 'Enter') addChip(sec.id); }} />
              <${Button} size="sm" onClick=${() => addChip(sec.id)}>＋</${Button}>
            </div>
          </div>
        `)}
      </${PanelBody}>
    </${Panel}>
  `;
}
