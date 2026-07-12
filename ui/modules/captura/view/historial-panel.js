const html = (...args) => globalThis.html(...args);
const { useState, useEffect } = globalThis.preactHooks;

import { historialCaptura, cargarHistorialCaptura, eliminarDelHistorial, limpiarHistorial, obtenerDetalleCaptura, buscarEnHistorial } from '../scripts/historial.js';
import { Toast } from '../../../components/shared/toast.js';
import {
  Button,
  Disclosure,
  Empty,
  List,
  ListItem,
  ListActions,
  Panel,
  PanelBody,
  PanelFooter,
} from '../../../components/index.js';

export function Historial({ open, onToggle, onSelectItem }) {
  const [items, setItems] = useState(historialCaptura.value);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [busySearch, setBusySearch] = useState(false);

  useEffect(() => {
    if (!open) return;
    cargarHistorialCaptura().then(() => setItems(historialCaptura.value));
  }, [open]);

  useEffect(() => {
    if (!searchQuery) {
      setSearchResults(null);
      return;
    }
    setBusySearch(true);
    buscarEnHistorial(searchQuery).then(results => {
      setSearchResults(results);
      setBusySearch(false);
    });
  }, [searchQuery]);

  const limpiar = async () => {
    if (!confirm('¿Limpiar todo el historial?')) return;
    await limpiarHistorial();
    setItems([]);
    setSearchResults(null);
    setSearchQuery('');
    Toast.show('Historial limpiado', 'success');
  };

  const eliminar = async (id) => {
    await eliminarDelHistorial(id);
    setItems(prev => prev.filter(it => it.id !== id));
  };

  const handleSelect = async (item) => {
    if (item.content) {
      onSelectItem(item);
    } else {
      const detalle = await obtenerDetalleCaptura(item.id);
      if (detalle) onSelectItem(detalle);
    }
  };

  const visibles = searchResults || items.slice(0, 10);

  return html`
    <${Panel}>
      <${Disclosure} open=${open} onToggle=${onToggle} icon="🕘" title="Historial" count=${items.length}>
        <${PanelBody} noPadding class="p-1">
          <div class="px-1 pb-1">
            <input
              type="text"
              class="w-full bg-aurora-surface-2 border border-aurora-border rounded-md px-2 py-1 text-xs text-aurora-text placeholder-aurora-text-dim outline-none focus:border-aurora-accent transition-colors"
              placeholder="Buscar en historial…"
              value=${searchQuery}
              onInput=${(e) => setSearchQuery(e.target.value)}
            />
          </div>
          ${searchResults && html`
            <div class="px-3 py-1 text-[9px] text-aurora-text-muted border-b border-aurora-border">
              ${searchResults.length} resultado(s) para "${searchQuery}"
            </div>
          `}
          ${items.length === 0 && html`<${Empty}>Sin capturas guardadas.</${Empty}>`}
          <${List}>
            ${visibles.map(it => html`
              <${ListItem}
                key=${it.id}
                name=${(it.title || it.url || '').slice(0, 38)}
                sub=${it.chars ? `${it.chars.toLocaleString()}c · ${new Date(it.ts).toLocaleDateString()}` : it.tipo}
                onClick=${() => handleSelect(it)}
              >
                <${ListActions}>
                  <span class="rounded bg-aurora-accent/10 px-1.5 py-0.5 text-[9px] font-bold text-aurora-accent">${it.tipo}</span>
                  <${Button} size="sm" onClick=${() => eliminar(it.id)}>✕</${Button}>
                </${ListActions}>
              </${ListItem}>
            `)}
          </${List}>
          ${searchResults && searchResults.length > 10 && html`<div class="px-3 py-2 text-center text-[10px] text-aurora-text-dim">Mostrando 10 de ${searchResults.length}</div>`}
          ${items.length > 10 && !searchResults && html`<div class="px-3 py-2 text-center text-[10px] text-aurora-text-dim">+${items.length - 10} más</div>`}
          ${busySearch && html`<div class="px-3 py-2 text-center text-[10px] text-aurora-text-dim">Buscando…</div>`}
          ${items.length > 0 && html`
            <${PanelFooter}>
              <${Button} variant="danger" class="w-full" onClick=${limpiar}>🗑 Limpiar historial</${Button}>
            </${PanelFooter}>
          `}
        </${PanelBody}>
      </${Disclosure}>
    </${Panel}>
  `;
}
