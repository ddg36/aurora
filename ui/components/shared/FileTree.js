const { useState, useEffect } = globalThis.preactHooks;
const html = (...args) => globalThis.html(...args);

function TreeNode({ entry, nivel, abierto, onToggle, onOpen, seleccion, renderNode, loadChildren }) {
  const esDir = entry.type === 'dir';
  return html`
    <div>
      ${renderNode
        ? renderNode({ entry, nivel, abierto, onToggle, onOpen, seleccion, esDir })
        : html`
          <div
            class=${`flex items-center gap-1 px-1 py-0.5 rounded cursor-pointer text-xs
              ${seleccion === entry.path ? 'bg-white/15' : 'hover:bg-white/5'}`}
            style=${`padding-left:${nivel * 12 + 4}px`}
            onClick=${() => esDir ? onToggle(entry.path) : onOpen(entry.path)}
          >
            <span class="opacity-60">${esDir ? (abierto[entry.path] ? '▾' : '▸') : '·'}</span>
            <span class=${esDir ? 'text-white/80' : 'text-white/60'}>${entry.name}</span>
          </div>
        `}
      ${esDir && abierto[entry.path] && html`
        <${TreeBranch} path=${entry.path} nivel=${nivel + 1} abierto=${abierto}
          onToggle=${onToggle} onOpen=${onOpen} seleccion=${seleccion}
          loadChildren=${loadChildren} renderNode=${renderNode} />
      `}
    </div>
  `;
}

function TreeBranch({ path, nivel, abierto, onToggle, onOpen, seleccion, loadChildren, renderNode }) {
  const [entries, setEntries] = useState([]);
  useEffect(() => { loadChildren(path).then(setEntries).catch(() => setEntries([])); }, [path, abierto[path]]);
  return html`${entries.map(e => html`
    <${TreeNode} key=${e.path} entry=${e} nivel=${nivel} abierto=${abierto}
      onToggle=${onToggle} onOpen=${onOpen} seleccion=${seleccion}
      loadChildren=${loadChildren} renderNode=${renderNode} />
  `)}`;
}

export function FileTree({ entries, abierto, onToggle, onOpen, seleccion, loadChildren, renderNode }) {
  return html`${entries.map(e => html`
    <${TreeNode} key=${e.path} entry=${e} nivel=${0} abierto=${abierto}
      onToggle=${onToggle} onOpen=${onOpen} seleccion=${seleccion}
      loadChildren=${loadChildren} renderNode=${renderNode} />
  `)}`;
}
