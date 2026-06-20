const html = (...args) => globalThis.html(...args);
const { useState, useEffect } = globalThis.preactHooks;
import { Button } from '../../../components/Button.js';
import { Input } from '../../../components/Input.js';
import { Panel, PanelHeader, PanelBody } from '../../../components/Panel.js';
import { getCreativityIdeas, saveCreativityIdeas, deleteCreativityIdeas } from '../../../components/shared/builder-api.js';
import { Toast } from '../../../components/shared/toast.js';

const CAMPOS = ['personajes', 'escenarios', 'conflictos', 'giros', 'temas'];
const ICONOS = { personajes: '👤', escenarios: '🏰', conflictos: '⚡', giros: '🌀', temas: '🎭' };

export function CreativityIdeasEditor({ onClose }) {
  const [tematicas, setTematicas] = useState([]);
  const [tematica, setTematica] = useState('');
  const [datos, setDatos] = useState({});
  const [newItem, setNewItem] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCreativityIdeas().then(items => {
      const map = {};
      const ts = [];
      for (const it of items) { map[it.tematica] = it.datos; ts.push(it.tematica); }
      setTematicas(ts);
      setDatos(map);
      if (ts.length) setTematica(ts[0]);
      setLoading(false);
    });
  }, []);

  const current = datos[tematica] || {};

  const addItem = (campo) => {
    const val = (newItem[campo] || '').trim();
    if (!val) return;
    const arr = [...(current[campo] || []), val];
    const updated = { ...current, [campo]: arr };
    setDatos(prev => ({ ...prev, [tematica]: updated }));
    setNewItem(prev => ({ ...prev, [campo]: '' }));
    saveCreativityIdeas(tematica, updated).catch(e => Toast.show(e.message, 'error'));
  };

  const removeItem = (campo, idx) => {
    const arr = (current[campo] || []).filter((_, i) => i !== idx);
    const updated = { ...current, [campo]: arr };
    setDatos(prev => ({ ...prev, [tematica]: updated }));
    saveCreativityIdeas(tematica, updated).catch(e => Toast.show(e.message, 'error'));
  };

  const addTematica = () => {
    const name = prompt('Nombre de la nueva temática:');
    if (!name?.trim()) return;
    const t = name.trim();
    if (tematicas.includes(t)) { Toast.show('Ya existe', 'warning'); return; }
    const empty = { personajes: [], escenarios: [], conflictos: [], giros: [], temas: [] };
    setTematicas(prev => [...prev, t]);
    setDatos(prev => ({ ...prev, [t]: empty }));
    setTematica(t);
    saveCreativityIdeas(t, empty).catch(e => Toast.show(e.message, 'error'));
  };

  const removeTematica = async () => {
    if (!tematica || !confirm(`¿Eliminar temática "${tematica}"?`)) return;
    try {
      await deleteCreativityIdeas(tematica);
      setTematicas(prev => prev.filter(t => t !== tematica));
      setDatos(prev => { const n = { ...prev }; delete n[tematica]; return n; });
      Toast.show('Eliminada', 'success');
    } catch (e) { Toast.show(e.message, 'error'); }
  };

  if (loading) return html`<div class="p-4 text-center text-sm text-aurora-text-muted">Cargando…</div>`;

  return html`
    <${Panel} class="w-[min(560px,100%)] max-h-[88vh] flex flex-col">
      <${PanelHeader}>
        <span class="text-sm font-bold text-aurora-text">💡 Editar Conceptos Creativos</span>
        <${Button} size="sm" onClick=${onClose}>✕</${Button}>
      </${PanelHeader}>
      <${PanelBody} class="flex flex-col gap-3 overflow-y-auto">

        <div class="flex gap-2 items-center flex-wrap">
          <select class="flex-1 min-w-[140px] h-7 text-xs rounded-md border border-aurora-border bg-aurora-surface text-aurora-text px-2"
            value=${tematica} onChange=${e => setTematica(e.target.value)}>
            ${tematicas.map(t => html`<option key=${t} value=${t}>${t}</option>`)}
          </select>
          <${Button} size="sm" onClick=${addTematica}>＋ Temática</${Button}>
          ${tematica && html`<${Button} size="sm" variant="danger" onClick=${removeTematica}>🗑</${Button}>`}
        </div>

        ${tematica && CAMPOS.map(campo => html`
          <div key=${campo} class="flex flex-col gap-1">
            <div class="flex items-center gap-1.5">
              <span class="text-xs font-bold text-aurora-text-muted uppercase">${ICONOS[campo]} ${campo}</span>
              <span class="text-[9px] text-aurora-text-dim">(${(current[campo] || []).length})</span>
            </div>
            <div class="flex flex-wrap gap-1">
              ${(current[campo] || []).map((item, idx) => html`
                <span key=${idx} class="inline-flex items-center gap-1 bg-aurora-surface border border-aurora-border rounded px-2 py-0.5 text-[10px] text-aurora-text-dim">
                  ${item}
                  <button class="text-aurora-text-dim hover:text-aurora-error ml-0.5" onClick=${() => removeItem(campo, idx)}>✕</button>
                </span>
              `)}
            </div>
            <div class="flex gap-1">
              <${Input} class="flex-1" placeholder=${'Agregar ' + campo.slice(0, -1) + '…'}
                value=${newItem[campo] || ''}
                onInput=${e => setNewItem(prev => ({ ...prev, [campo]: e.target.value }))}
                onKeyDown=${e => { if (e.key === 'Enter') addItem(campo); }} />
              <${Button} size="sm" onClick=${() => addItem(campo)}>＋</${Button}>
            </div>
          </div>
        `)}

        ${!tematica && html`<div class="text-center text-xs text-aurora-text-muted py-4">Seleccioná o creá una temática.</div>`}
      </${PanelBody}>
    </${Panel}>
  `;
}
