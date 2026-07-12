const html = (...args) => globalThis.html(...args);
const { useState, useEffect } = globalThis.preactHooks;
import { Button } from '../../../components/Button.js';
import { Input, Textarea } from '../../../components/Input.js';
import { Panel, PanelHeader, PanelBody, PanelFooter } from '../../../components/Panel.js';
import { getTeamRoles, createTeamRole, updateTeamRole, deleteTeamRole, reorderTeamRoles } from '../../../components/shared/builder-api.js';
import { Toast } from '../../../components/shared/toast.js';

const EMPTY_ROLE = { nombre: '', icono: '🤖', color: '#8b5cf6', prompt_template: '', default_members: [] };

export function TeamRolesEditor({ onClose }) {
  const [roles, setRoles] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_ROLE });
  const [loading, setLoading] = useState(true);

  useEffect(() => { getTeamRoles().then(r => { setRoles(r || []); setLoading(false); }); }, []);

  const startNew = () => { setEditing('new'); setForm({ ...EMPTY_ROLE }); };
  const startEdit = (rol) => { setEditing(rol.id); setForm({ ...rol }); };

  const save = async () => {
    if (!form.nombre.trim()) { Toast.show('Nombre requerido', 'warning'); return; }
    try {
      if (editing === 'new') {
        const r = await createTeamRole(form);
        setRoles(prev => [...prev, { ...form, id: r.id }]);
        Toast.show('Rol creado', 'success');
      } else {
        await updateTeamRole(editing, form);
        setRoles(prev => prev.map(r => r.id === editing ? { ...r, ...form } : r));
        Toast.show('Rol actualizado', 'success');
      }
      setEditing(null);
    } catch (e) { Toast.show(e.message, 'error'); }
  };

  const remove = async (id) => {
    if (!confirm('¿Eliminar este rol?')) return;
    try {
      await deleteTeamRole(id);
      setRoles(prev => prev.filter(r => r.id !== id));
      if (editing === id) setEditing(null);
      Toast.show('Rol eliminado', 'success');
    } catch (e) { Toast.show(e.message, 'error'); }
  };

  const moveUp = async (idx) => {
    if (idx === 0) return;
    const next = [...roles];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    setRoles(next);
    await reorderTeamRoles(next.map(r => r.id));
  };

  const moveDown = async (idx) => {
    if (idx >= roles.length - 1) return;
    const next = [...roles];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    setRoles(next);
    await reorderTeamRoles(next.map(r => r.id));
  };

  if (loading) return html`<div class="p-4 text-center text-sm text-aurora-text-muted">Cargando…</div>`;

  return html`
    <${Panel} class="w-[min(560px,100%)] max-h-[88vh] flex flex-col">
      <${PanelHeader}>
        <span class="text-sm font-bold text-aurora-text">👥 Editar Roles del Equipo</span>
        <${Button} size="sm" onClick=${onClose}>✕</${Button}>
      </${PanelHeader}>
      <${PanelBody} class="flex flex-col gap-2 overflow-y-auto">

        ${editing && html`
          <div class="bg-aurora-surface border border-aurora-accent/30 rounded-lg p-3 flex flex-col gap-2">
            <div class="flex gap-2">
              <${Input} class="w-16" placeholder="Icono" value=${form.icono}
                onInput=${e => setForm(p => ({ ...p, icono: e.target.value }))} />
              <${Input} class="flex-1" placeholder="Nombre del rol" value=${form.nombre}
                onInput=${e => setForm(p => ({ ...p, nombre: e.target.value }))} />
            </div>
            <div class="flex gap-2 items-center">
              <label class="text-[10px] text-aurora-text-dim">Color:</label>
              <input type="color" value=${form.color || '#8b5cf6'}
                onChange=${e => setForm(p => ({ ...p, color: e.target.value }))}
                class="w-8 h-6 rounded border-0 cursor-pointer" />
              <${Input} class="flex-1" placeholder="#hex" value=${form.color || ''}
                onInput=${e => setForm(p => ({ ...p, color: e.target.value }))} />
            </div>
            <${Textarea} rows="3" placeholder="Prompt template (usá {{objetivo}} como placeholder)"
              value=${form.prompt_template || ''}
              onInput=${e => setForm(p => ({ ...p, prompt_template: e.target.value }))} />
            <div class="flex gap-1.5">
              <${Button} size="sm" variant="primary" onClick=${save}>
                ${editing === 'new' ? '＋ Crear' : '✓ Guardar'}
              </${Button}>
              <${Button} size="sm" onClick=${() => setEditing(null)}>Cancelar</${Button}>
            </div>
          </div>
        `}

        ${!editing && html`
          <${Button} size="sm" class="self-start" onClick=${startNew}>＋ Nuevo rol</${Button}>
        `}

        ${roles.map((r, idx) => html`
          <div key=${r.id} class="bg-aurora-surface border border-aurora-border rounded-lg px-3 py-2 flex items-center gap-2">
            <span class="text-xl flex-shrink-0" style=${{ color: r.color || '' }}>${r.icono || '🤖'}</span>
            <div class="flex-1 min-w-0">
              <div class="text-sm font-semibold text-aurora-text">${r.nombre}</div>
              ${r.prompt_template && html`<div class="text-[9px] text-aurora-text-dim truncate">${r.prompt_template.slice(0, 60)}…</div>`}
            </div>
            <${Button} iconOnly onClick=${() => moveUp(idx)} disabled=${idx === 0} title="Subir">▲<//>
            <${Button} iconOnly onClick=${() => moveDown(idx)} disabled=${idx === roles.length - 1} title="Bajar">▼<//>
            <${Button} size="sm" onClick=${() => startEdit(r)}>✏</${Button}>
            <${Button} size="sm" variant="danger" onClick=${() => remove(r.id)}>🗑</${Button}>
          </div>
        `)}

        ${roles.length === 0 && html`<div class="text-center text-xs text-aurora-text-muted py-4">Sin roles. Creá uno nuevo.</div>`}
      </${PanelBody}>
    </${Panel}>
  `;
}
