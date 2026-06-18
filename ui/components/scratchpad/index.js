import { Button } from '../Button.js';
import { Chip } from '../Chip.js';

const { html } = globalThis;
const { useState, useEffect, useRef } = globalThis.preactHooks;


export const SCRATCHPAD_COMMANDS = [
  { type: 'paragraph', label: 'Text', hint: 'Plain writing block' },
  { type: 'heading_1', label: 'Heading 1', hint: 'Large section title' },
  { type: 'heading_2', label: 'Heading 2', hint: 'Medium section title' },
  { type: 'heading_3', label: 'Heading 3', hint: 'Small section title' },
  { type: 'bullet', label: 'Bullet list', hint: 'Simple list item' },
  { type: 'todo', label: 'To-do', hint: 'Checkbox task' },
  { type: 'quote', label: 'Quote', hint: 'Quoted note' },
  { type: 'code', label: 'Code', hint: 'Code snippet' },
  { type: 'callout', label: 'Callout', hint: 'Highlighted idea' },
  { type: 'toggle', label: 'Toggle', hint: 'Collapsible note' },
  { type: 'image', label: 'Image', hint: 'Upload or paste an image URL' },
  { type: 'bookmark', label: 'Bookmark', hint: 'Preview a useful link' },
  { type: 'divider', label: 'Divider', hint: 'Visual break' },
  { type: 'mini_table', label: 'Table view', hint: 'Small structured table' },
  { type: 'mini_kanban', label: 'Board view', hint: 'Small kanban board' },
];

function cx(...items) {
  return items.filter(Boolean).join(' ');
}

function inputText(el) {
  return el?.value ?? '';
}

function autoSize(el) {
  if (!el || el.tagName !== 'TEXTAREA') return;
  el.style.height = 'auto';
  el.style.height = `${Math.max(el.scrollHeight, 28)}px`;
}

export function ScratchpadPageShell({
  page,
  pages = [],
  activePageId,
  blocks = [],
  navCollapsed = false,
  noteQuery = '',
  createPanelOpen = false,
  stats,
  statusLabel,
  statusTone,
  nexusOk,
  onToggleNav,
  onNoteQuery,
  onToggleCreatePanel,
  onAddBlock,
  onCreatePage,
  onSelectPage,
  onDuplicatePage,
  onDeletePage,
  onTitleInput,
  onDescriptionInput,
  onSave,
  onPaste,
  onCopy,
  onClear,
  children,
}) {
  return html`
    <section class="sp-page">
      <${ScratchpadWorkspaceNav}
        page=${page}
        pages=${pages}
        activePageId=${activePageId}
        blocks=${blocks}
        collapsed=${navCollapsed}
        query=${noteQuery}
        onToggle=${onToggleNav}
        onQuery=${onNoteQuery}
        onAddBlock=${onAddBlock}
        onCreatePage=${onCreatePage}
        onSelectPage=${onSelectPage}
        onDuplicatePage=${onDuplicatePage}
        onDeletePage=${onDeletePage}
      />
      <div class="sp-page-main">
        <div class="sp-cover" aria-hidden="true"></div>
        <div class="sp-document">
          <${ScratchpadTopBar}
            stats=${stats}
            statusLabel=${statusLabel}
            statusTone=${statusTone}
            nexusOk=${nexusOk}
            createPanelOpen=${createPanelOpen}
            onToggleCreatePanel=${onToggleCreatePanel}
            onSave=${onSave}
            onPaste=${onPaste}
            onCopy=${onCopy}
            onClear=${onClear}
          />
          <header class="sp-page-head">
            <div class="sp-page-icon" aria-hidden="true">${page.icon || 'SP'}</div>
            <textarea
              class="sp-page-title"
              spellcheck=${true}
              rows="1"
              data-placeholder="Untitled"
              placeholder="Untitled"
              value=${page.title || ''}
              onInput=${(e) => { autoSize(e.currentTarget); onTitleInput(inputText(e.currentTarget)); }}
            ></textarea>
            <textarea
              class="sp-page-desc"
              spellcheck=${true}
              rows="1"
              data-placeholder="Add a short note about this workspace"
              placeholder="Add a short note about this workspace"
              value=${page.description || ''}
              onInput=${(e) => { autoSize(e.currentTarget); onDescriptionInput(inputText(e.currentTarget)); }}
            ></textarea>
          </header>
          ${children}
        </div>
      </div>
      ${createPanelOpen && html`
        <${ScratchpadCreatePanel}
          commands=${SCRATCHPAD_COMMANDS}
          onClose=${onToggleCreatePanel}
          onAddBlock=${onAddBlock}
        />
      `}
    </section>
  `;
}

export function ScratchpadWorkspaceNav({
  page,
  pages = [],
  activePageId,
  blocks = [],
  collapsed,
  query = '',
  onToggle,
  onQuery,
  onAddBlock,
  onCreatePage,
  onSelectPage,
  onDuplicatePage,
  onDeletePage,
}) {
  const headings = blocks.filter(block => block.type?.startsWith('heading') && block.text?.trim()).slice(0, 8);
  const collections = blocks.filter(block => ['mini_table', 'mini_kanban'].includes(block.type)).slice(0, 4);
  const noteQuery = String(query || '').trim().toLowerCase();
  const visiblePages = noteQuery
    ? pages.filter(item => `${item.title || ''} ${item.description || ''}`.toLowerCase().includes(noteQuery))
    : pages;
  return html`
    <aside class=${cx('sp-workspace-nav', collapsed && 'is-collapsed')}>
      <button type="button" class="sp-nav-toggle" title=${collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick=${onToggle}>
        ${collapsed ? '>' : '<'}
      </button>
      <div class="sp-nav-brand">
        <span>${page.icon || 'SP'}</span>
        <strong>${page.title || 'Scratchpad'}</strong>
      </div>
      <nav class="sp-nav-links">
        <button type="button" class="is-active" title="Current page"><span>⌂</span><em>${page.title || 'Scratchpad'}</em></button>
        <button type="button" onClick=${onCreatePage} title="New note"><span>+</span><em>New note</em></button>
      </nav>
      <div class="sp-nav-section sp-notes-manager">
        <small>Notes</small>
        <input
          class="sp-note-search"
          value=${query}
          placeholder="Search notes"
          onInput=${(e) => onQuery?.(e.currentTarget.value)}
        />
        ${visiblePages.map(item => html`
          <div class=${cx('sp-note-row', item.id === activePageId && 'is-active')}>
            <button type="button" onClick=${() => onSelectPage(item.id)} title=${item.title || 'Untitled'}>
              <span>${item.icon || 'SP'}</span><em>${item.title || 'Untitled'}</em>
            </button>
            <button type="button" class="sp-note-mini" title="Duplicate note" onClick=${() => onDuplicatePage(item.id)}>copy</button>
            <button type="button" class="sp-note-mini" title="Delete note" disabled=${pages.length <= 1} onClick=${() => onDeletePage(item.id)}>x</button>
          </div>
        `)}
        ${!visiblePages.length && html`<p>No matching notes</p>`}
      </div>
      <nav class="sp-nav-links">
        <button type="button" onClick=${() => onAddBlock('heading_2')} title="Add heading block"><span>#</span><em>Add heading</em></button>
      </nav>
      <div class="sp-nav-section">
        <small>Outline</small>
        ${headings.length
          ? headings.map(block => html`<button type="button" onClick=${() => document.querySelector(`[data-block-id="${block.id}"]`)?.scrollIntoView({ block: 'center' })}><span>#</span><em>${block.text}</em></button>`)
          : html`<p>No headings yet</p>`}
      </div>
      <div class="sp-nav-section">
        <small>Views</small>
        ${collections.length
          ? collections.map(block => html`<button type="button" onClick=${() => document.querySelector(`[data-block-id="${block.id}"]`)?.scrollIntoView({ block: 'center' })}><span>${block.type === 'mini_table' ? '▦' : '▥'}</span><em>${block.type === 'mini_table' ? 'Table' : 'Board'}</em></button>`)
          : html`<p>No views yet</p>`}
      </div>
    </aside>
  `;
}

export function ScratchpadTopBar({
  stats,
  statusLabel,
  statusTone,
  nexusOk,
  createPanelOpen,
  onToggleCreatePanel,
  onSave,
  onPaste,
  onCopy,
  onClear,
}) {
  const toneCls = statusTone === 'ok' ? 'is-ok' : statusTone === 'error' ? 'is-error' : '';
  return html`
    <div class="sp-topbar">
      <div class="sp-topbar-left">
        <${Chip}>${stats.blocks} blocks</${Chip}>
        <${Chip}>${stats.words} words</${Chip}>
        <${Chip}>~${stats.tokens} tokens</${Chip}>
      </div>
      <div class="sp-topbar-actions">
        <span class=${cx('sp-sync', toneCls)} title=${nexusOk ? 'wiki/scratchpad.md' : 'Local mode'}>
          ${statusLabel}
        </span>
        <${Button} size="sm" variant=${createPanelOpen ? 'primary' : undefined} onClick=${onToggleCreatePanel} title="Insert block or view">Insert</${Button}>
        ${nexusOk && html`<${Button} size="sm" variant="primary" onClick=${onSave} title="Save to wiki/scratchpad.md">Save</${Button}>`}
        <${Button} size="sm" onClick=${onPaste} title="Paste from clipboard">Paste</${Button}>
        <${Button} size="sm" onClick=${onCopy} title="Copy markdown export">Copy</${Button}>
        <${Button} size="sm" onClick=${onClear} title="Clear scratchpad">Clear</${Button}>
      </div>
    </div>
  `;
}

export function ScratchpadCreatePanel({ commands = SCRATCHPAD_COMMANDS, onClose, onAddBlock }) {
  const groups = [
    { title: 'Basic', types: ['paragraph', 'heading_1', 'heading_2', 'heading_3', 'bullet', 'todo', 'quote'] },
    { title: 'Rich', types: ['callout', 'toggle', 'image', 'bookmark', 'code', 'divider'] },
    { title: 'Views', types: ['mini_table', 'mini_kanban'] },
  ];
  const byType = new Map(commands.map(cmd => [cmd.type, cmd]));
  const pick = (event) => {
    const button = event.target?.closest?.('[data-block-type]');
    const type = button?.dataset?.blockType;
    if (!type) return;
    event.preventDefault();
    onAddBlock(type);
  };
  return html`
    <aside class="sp-create-panel is-open" onClick=${pick}>
      <div class="sp-create-head">
        <strong>Insert block</strong>
        <button type="button" title="Close create panel" onClick=${onClose}>x</button>
      </div>
      ${groups.map(group => html`
        <section class="sp-create-group">
          <small>${group.title}</small>
          ${group.types.map(type => {
            const cmd = byType.get(type);
            if (!cmd) return null;
            return html`
              <button type="button" data-block-type=${type}>
                <span>${blockGlyph(type)}</span>
                <div><strong>${cmd.label}</strong><em>${cmd.hint}</em></div>
              </button>
            `;
          })}
        </section>
      `)}
    </aside>
  `;
}

function blockGlyph(type) {
  if (type === 'paragraph') return 'T';
  if (type === 'bullet') return '•';
  if (type === 'todo') return '☐';
  if (type === 'quote') return '"';
  if (type === 'code') return '{}';
  if (type === 'image') return 'img';
  if (type === 'bookmark') return 'url';
  if (type === 'callout') return 'i';
  if (type === 'toggle') return '▸';
  if (type === 'divider') return '—';
  if (type === 'mini_table') return '▦';
  if (type === 'mini_kanban') return '▥';
  if (type?.startsWith('heading')) return '#';
  return '+';
}

export function ScratchpadBlockEditor(props) {
  const { blocks, onAddBlock, onPasteImage } = props;
  const handlePaste = (event) => {
    const files = [
      ...(event.clipboardData?.files || []),
      ...(event.clipboardData?.items || []),
    ];
    const imageFile = files
      .map(item => typeof item.getAsFile === 'function' ? item.getAsFile() : item)
      .find(file => file?.type?.startsWith('image/'));

    if (!imageFile) return;
    event.preventDefault();
    const reader = new FileReader();
    reader.onload = () => onPasteImage?.(String(reader.result || ''));
    reader.readAsDataURL(imageFile);
  };

  return html`
    <main class="sp-editor" onPaste=${handlePaste}>
      ${!blocks.length && html`<${ScratchpadEmptyState} onAddBlock=${() => onAddBlock(null, 'paragraph')} />`}
      ${blocks.map((block, index) => html`
        <${ScratchpadBlockRow}
          key=${block.id}
          block=${block}
          index=${index}
          isFirst=${index === 0}
          isLast=${index === blocks.length - 1}
          ...${props}
        />
      `)}
    </main>
  `;
}

export function ScratchpadBlockRow({
  block,
  isFirst,
  isLast,
  slash,
  commands = SCRATCHPAD_COMMANDS,
  onTextChange,
  onToggleTodo,
  onToggleOpen,
  onChildrenTextChange,
  onPatchBlock,
  onKeyDown,
  onFocusBlock,
  onSlashQuery,
  onSlashPick,
  onAddBlock,
  onDeleteBlock,
  onDuplicateBlock,
  onMoveBlock,
  onTransformBlock,
  onTableRows,
  onBoardColumns,
}) {
  const rowClass = cx('sp-block-row', `is-${block.type}`, slash?.blockId === block.id && 'has-menu');
  const editableClass = cx('sp-editable', block.type?.startsWith('heading') && block.type);

  const handleTextInput = (e) => {
    autoSize(e.currentTarget);
    const text = inputText(e.currentTarget);
    onTextChange(block.id, text);
    if (text.startsWith('/')) onSlashQuery(block.id, text.slice(1));
    else onSlashQuery(null, '');
  };

  const typeLabel = commands.find(c => c.type === block.type)?.label ?? 'Text';

  return html`
    <div class=${rowClass} data-block-id=${block.id}>
      <div class="sp-block-head">
        <span class="sp-block-type-label">${typeLabel}</span>
        <${ScratchpadBlockToolbar}
          block=${block}
          isFirst=${isFirst}
          isLast=${isLast}
          commands=${commands}
          onAdd=${() => onAddBlock(block.id, 'paragraph')}
          onMoveUp=${() => onMoveBlock(block.id, -1)}
          onMoveDown=${() => onMoveBlock(block.id, 1)}
          onDuplicate=${() => onDuplicateBlock(block.id)}
          onDelete=${() => onDeleteBlock(block.id)}
          onTransform=${(type) => onTransformBlock(block.id, type)}
        />
      </div>
      <div class="sp-block-main">
        ${renderBlockContent({
          block,
          editableClass,
          handleTextInput,
          onTextChange,
          onToggleTodo,
          onToggleOpen,
          onChildrenTextChange,
          onPatchBlock,
          onKeyDown,
          onFocusBlock,
          onTableRows,
          onBoardColumns,
        })}
        ${slash?.blockId === block.id && html`
          <${ScratchpadSlashMenu}
            query=${slash.query}
            commands=${commands}
            onPick=${(type) => onSlashPick(block.id, type)}
          />
        `}
      </div>
    </div>
  `;
}

function renderBlockContent(args) {
  const { block } = args;
  if (block.type === 'divider') return html`<hr class="sp-divider" />`;
  if (block.type === 'code') return html`<${ScratchpadCodeBlock} ...${args} />`;
  if (block.type === 'image') return html`<${ScratchpadImageBlock} ...${args} />`;
  if (block.type === 'bookmark') return html`<${ScratchpadBookmarkBlock} ...${args} />`;
  if (block.type === 'callout') return html`<${ScratchpadCalloutBlock} ...${args} />`;
  if (block.type === 'toggle') return html`<${ScratchpadToggleBlock} ...${args} />`;
  if (block.type === 'mini_table') return html`<${ScratchpadCollectionTable} block=${block} onRows=${args.onTableRows} />`;
  if (block.type === 'mini_kanban') return html`<${ScratchpadCollectionBoard} block=${block} onColumns=${args.onBoardColumns} />`;
  if (block.type === 'todo') {
    return html`<${ScratchpadTodoListBlock} ...${args} />`;
  }
  if (block.type === 'quote') return html`<blockquote class="sp-quote">${editableNode(args, 'Quote')}</blockquote>`;
  if (block.type === 'bullet') return html`<${ScratchpadBulletListBlock} ...${args} />`;
  return editableNode(args, 'Type / for blocks');
}

function splitListLines(text) {
  const lines = String(text || '').split('\n');
  return lines.length ? lines : [''];
}

function updateListLine(block, index, value, onTextChange) {
  const lines = splitListLines(block.text);
  lines[index] = value;
  onTextChange(block.id, lines.join('\n'));
}

function insertListLine(block, index, onTextChange) {
  const lines = splitListLines(block.text);
  lines.splice(index + 1, 0, '');
  onTextChange(block.id, lines.join('\n'));
  setTimeout(() => {
    document.querySelector(`[data-block-id="${block.id}"] [data-list-line="${index + 1}"]`)?.focus();
  }, 0);
}

function removeListLine(block, index, onTextChange) {
  const lines = splitListLines(block.text);
  if (lines.length <= 1) return false;
  lines.splice(index, 1);
  onTextChange(block.id, lines.join('\n'));
  setTimeout(() => {
    document.querySelector(`[data-block-id="${block.id}"] [data-list-line="${Math.max(0, index - 1)}"]`)?.focus();
  }, 0);
  return true;
}

function handleListKeyDown(e, block, index, onTextChange, onKeyDown) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    insertListLine(block, index, onTextChange);
    return;
  }
  if (e.key === 'Backspace' && !e.currentTarget.value && removeListLine(block, index, onTextChange)) {
    e.preventDefault();
    return;
  }
  onKeyDown(e, block);
}

export function ScratchpadBulletListBlock({ block, onTextChange, onKeyDown, onFocusBlock }) {
  const lines = splitListLines(block.text);
  return html`
    <div class="sp-list-block sp-bullet-list">
      ${lines.map((line, index) => html`
        <div class="sp-list-line" key=${index}>
          <span class="sp-list-marker"></span>
          <textarea
            class="sp-editable sp-list-editable"
            rows="1"
            data-list-line=${index}
            placeholder=${index === 0 ? 'List item' : ''}
            value=${line}
            onInput=${(e) => { autoSize(e.currentTarget); updateListLine(block, index, e.currentTarget.value, onTextChange); }}
            onKeyDown=${(e) => handleListKeyDown(e, block, index, onTextChange, onKeyDown)}
            onFocus=${() => onFocusBlock(block.id)}
          ></textarea>
        </div>
      `)}
    </div>
  `;
}

export function ScratchpadTodoListBlock({ block, onTextChange, onToggleTodo, onKeyDown, onFocusBlock }) {
  const lines = splitListLines(block.text);
  const checkedItems = Array.isArray(block.checkedItems) ? block.checkedItems : [];
  return html`
    <div class="sp-list-block sp-todo-list">
      ${lines.map((line, index) => html`
        <div class="sp-list-line" key=${index}>
          <input
            class="sp-list-check"
            type="checkbox"
            checked=${!!(checkedItems[index] ?? block.checked)}
            onChange=${(e) => onToggleTodo(block, index, e.currentTarget.checked)}
          />
          <textarea
            class="sp-editable sp-list-editable"
            rows="1"
            data-list-line=${index}
            placeholder=${index === 0 ? 'Task' : ''}
            value=${line}
            onInput=${(e) => { autoSize(e.currentTarget); updateListLine(block, index, e.currentTarget.value, onTextChange); }}
            onKeyDown=${(e) => handleListKeyDown(e, block, index, onTextChange, onKeyDown)}
            onFocus=${() => onFocusBlock(block.id)}
          ></textarea>
        </div>
      `)}
    </div>
  `;
}

function editableNode({ block, editableClass, handleTextInput, onKeyDown, onFocusBlock }, placeholder) {
  return html`
    <textarea
      class=${editableClass}
      spellcheck=${true}
      rows="1"
      data-placeholder=${placeholder}
      placeholder=${placeholder}
      value=${block.text || ''}
      onInput=${handleTextInput}
      onKeyDown=${(e) => onKeyDown(e, block)}
      onFocus=${() => onFocusBlock(block.id)}
    ></textarea>
  `;
}

export function ScratchpadBlockToolbar({
  block,
  isFirst,
  isLast,
  commands,
  onAdd,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onDelete,
  onTransform,
}) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);
  const menuNodeRef = useRef(null);
  const currentLabel = commands.find(c => c.type === block.type)?.label ?? 'Text';

  const handleOpen = (e) => {
    e.stopPropagation();
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setMenuPos({ top: rect.bottom + 4, left: rect.right });
    }
    setOpen(o => !o);
  };

  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (menuNodeRef.current?.contains(e.target) || btnRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  useEffect(() => {
    if (!open) {
      if (menuNodeRef.current) {
        preact.render(null, menuNodeRef.current);
        try { document.body.removeChild(menuNodeRef.current); } catch (_) {}
        menuNodeRef.current = null;
      }
      return;
    }
    if (!menuNodeRef.current) {
      const el = document.createElement('div');
      document.body.appendChild(el);
      menuNodeRef.current = el;
    }
    const style = { top: menuPos.top + 'px', left: menuPos.left + 'px' };
    preact.render(html`
      <div class="sp-type-menu is-fixed" style=${style}>
        ${commands.map(cmd => html`
          <button
            type="button"
            key=${cmd.type}
            class=${cx('sp-type-option', cmd.type === block.type && 'is-active')}
            onMouseDown=${(e) => { e.preventDefault(); onTransform(cmd.type); setOpen(false); }}
          >${cmd.label}</button>
        `)}
      </div>
    `, menuNodeRef.current);
  }, [open, menuPos, commands, block.type, onTransform]);

  return html`
    <div class="sp-block-toolbar">
      <button type="button" title="Insert block below" onClick=${onAdd}>+</button>
      <button type="button" title="Move up" disabled=${isFirst} onClick=${onMoveUp}>↑</button>
      <button type="button" title="Move down" disabled=${isLast} onClick=${onMoveDown}>↓</button>
      <button type="button" title="Duplicate" onClick=${onDuplicate}>⧉</button>
      <div class="sp-type-picker">
        <button ref=${btnRef} type="button" class="sp-type-btn" onClick=${handleOpen}>
          ${currentLabel} ▾
        </button>
      </div>
      <button type="button" title="Delete" onClick=${onDelete}>✕</button>
    </div>
  `;
}

export function ScratchpadSlashMenu({ query = '', commands = SCRATCHPAD_COMMANDS, onPick }) {
  const q = query.trim().toLowerCase();
  const filtered = commands.filter(cmd => !q || cmd.label.toLowerCase().includes(q) || cmd.type.includes(q)).slice(0, 8);
  return html`
    <div class="sp-slash-menu">
      ${filtered.map(cmd => html`
        <button type="button" key=${cmd.type} class="sp-slash-item" onMouseDown=${(e) => { e.preventDefault(); onPick(cmd.type); }}>
          <span>${cmd.label}</span>
          <small>${cmd.hint}</small>
        </button>
      `)}
      ${!filtered.length && html`<div class="sp-slash-empty">No blocks found</div>`}
    </div>
  `;
}

export function ScratchpadToggleBlock({
  block,
  handleTextInput,
  onToggleOpen,
  onChildrenTextChange,
  onKeyDown,
  onFocusBlock,
}) {
  return html`
    <div class="sp-toggle">
      <button type="button" class="sp-toggle-button" onClick=${() => onToggleOpen(block.id, block.open === false)}>${block.open === false ? '>' : 'v'}</button>
      <div class="sp-toggle-content">
        ${editableNode({ block, editableClass: 'sp-editable', handleTextInput, onKeyDown, onFocusBlock }, 'Toggle title')}
        ${block.open !== false && html`
          <textarea
            class="sp-toggle-body"
            placeholder="Hidden note"
            value=${block.childrenText || ''}
            onInput=${(e) => onChildrenTextChange(block.id, e.currentTarget.value)}
          ></textarea>
        `}
      </div>
    </div>
  `;
}

export function ScratchpadCalloutBlock({ block, handleTextInput, onKeyDown, onFocusBlock }) {
  return html`
    <div class="sp-callout">
      <span class="sp-callout-mark">i</span>
      ${editableNode({ block, editableClass: 'sp-editable', handleTextInput, onKeyDown, onFocusBlock }, 'Callout')}
    </div>
  `;
}

export function ScratchpadCodeBlock({ block, onTextChange }) {
  return html`
    <div class="sp-code">
      <div class="sp-code-head">
        <span>Code</span>
        <span>${block.lang || 'text'}</span>
      </div>
      <textarea
        class="sp-code-text"
        spellcheck=${false}
        value=${block.text || ''}
        onInput=${(e) => onTextChange(block.id, e.currentTarget.value)}
      ></textarea>
    </div>
  `;
}

export function ScratchpadImageBlock({ block, onPatchBlock }) {
  const setUrl = (url) => onPatchBlock(block.id, { url });
  const setCaption = (caption) => onPatchBlock(block.id, { caption, text: caption });
  const setAlt = (alt) => onPatchBlock(block.id, { alt });
  const setTextOrFile = (text, file) => {
    if (file) {
      readFile(file);
      return;
    }
    const value = String(text || '').trim();
    if (/^(https?:\/\/|data:image\/)/i.test(value)) setUrl(value);
  };
  const readFile = (file) => {
    if (!file || !file.type?.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => setUrl(String(reader.result || ''));
    reader.readAsDataURL(file);
  };
  const handlePaste = (event) => {
    const image = [...(event.clipboardData?.files || [])].find(file => file.type?.startsWith('image/'));
    const text = event.clipboardData?.getData('text/plain') || '';
    if (!image && !text.trim()) return;
    event.preventDefault();
    setTextOrFile(text, image);
  };
  const handleDrop = (event) => {
    event.preventDefault();
    const image = [...(event.dataTransfer?.files || [])].find(file => file.type?.startsWith('image/'));
    const text = event.dataTransfer?.getData('text/plain') || '';
    setTextOrFile(text, image);
  };

  return html`
    <section
      class="sp-image-block"
      onPaste=${handlePaste}
      onDrop=${handleDrop}
      onDragOver=${(event) => event.preventDefault()}
      tabindex="0"
    >
      ${block.url
        ? html`<img src=${block.url} alt=${block.alt || block.caption || 'Scratchpad image'} />`
        : html`
          <label class="sp-image-drop">
            <input type="file" accept="image/*" onChange=${(e) => readFile(e.currentTarget.files?.[0])} />
            <strong>Add image</strong>
            <span>Upload, drop, or paste an image/URL.</span>
          </label>
        `}
      <div class="sp-image-fields">
        ${!block.url?.startsWith('data:') && html`
          <input
            value=${block.url || ''}
            placeholder="Image URL"
            onInput=${(e) => setUrl(e.currentTarget.value)}
          />
        `}
        <input
          value=${block.caption || ''}
          placeholder="Caption"
          onInput=${(e) => setCaption(e.currentTarget.value)}
        />
        <input
          value=${block.alt || ''}
          placeholder="Alt text"
          onInput=${(e) => setAlt(e.currentTarget.value)}
        />
      </div>
    </section>
  `;
}

export function ScratchpadBookmarkBlock({ block, onPatchBlock }) {
  const patch = (next) => onPatchBlock(block.id, next);
  return html`
    <section class="sp-bookmark-block">
      <div class="sp-bookmark-mark">link</div>
      <div class="sp-bookmark-fields">
        <input
          value=${block.title || ''}
          placeholder="Link title"
          onInput=${(e) => patch({ title: e.currentTarget.value, text: e.currentTarget.value })}
        />
        <input
          value=${block.url || ''}
          placeholder="https://example.com"
          onInput=${(e) => patch({ url: e.currentTarget.value })}
        />
        <textarea
          value=${block.description || ''}
          placeholder="Why this link matters"
          onInput=${(e) => patch({ description: e.currentTarget.value })}
        ></textarea>
      </div>
      ${block.url && html`<a class="sp-bookmark-open" href=${block.url} target="_blank" rel="noreferrer">Open</a>`}
    </section>
  `;
}

export function ScratchpadCollectionTable({ block, onRows }) {
  const columns = block.columns || ['Name'];
  const rows = block.rows || [];
  const updateCell = (rowId, cellIndex, value) => {
    onRows(block.id, rows.map(row => row.id === rowId
      ? { ...row, cells: columns.map((_, i) => i === cellIndex ? value : (row.cells?.[i] || '')) }
      : row));
  };
  const addRow = () => {
    onRows(block.id, [...rows, { id: `row_${Date.now()}`, cells: columns.map(() => '') }]);
  };
  return html`
    <section class="sp-collection sp-table-view">
      <div class="sp-collection-head">
        <strong>Notes table</strong>
        <${Button} size="sm" onClick=${addRow}>New row</${Button}>
      </div>
      <div class="sp-table-scroll">
        <table>
          <thead><tr>${columns.map(col => html`<th>${col}</th>`)}</tr></thead>
          <tbody>
            ${rows.map(row => html`
              <tr key=${row.id}>
                ${columns.map((col, i) => html`
                  <td>
                    <input value=${row.cells?.[i] || ''} onInput=${(e) => updateCell(row.id, i, e.currentTarget.value)} />
                  </td>
                `)}
              </tr>
            `)}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

export function ScratchpadCollectionBoard({ block, onColumns }) {
  const columns = block.columns || [];
  const updateCard = (colId, cardId, text) => {
    onColumns(block.id, columns.map(col => col.id === colId
      ? { ...col, cards: col.cards.map(card => card.id === cardId ? { ...card, text } : card) }
      : col));
  };
  const addCard = (colId) => {
    onColumns(block.id, columns.map(col => col.id === colId
      ? { ...col, cards: [...col.cards, { id: `card_${Date.now()}`, text: '' }] }
      : col));
  };
  const moveCard = (fromId, cardId, dir) => {
    const fromIndex = columns.findIndex(col => col.id === fromId);
    const toIndex = fromIndex + dir;
    if (fromIndex < 0 || toIndex < 0 || toIndex >= columns.length) return;
    const card = columns[fromIndex].cards.find(item => item.id === cardId);
    if (!card) return;
    onColumns(block.id, columns.map((col, index) => {
      if (index === fromIndex) return { ...col, cards: col.cards.filter(item => item.id !== cardId) };
      if (index === toIndex) return { ...col, cards: [...col.cards, card] };
      return col;
    }));
  };
  return html`
    <section class="sp-collection sp-board-view">
      <div class="sp-collection-head"><strong>Board</strong></div>
      <div class="sp-board-cols">
        ${columns.map((col, colIndex) => html`
          <div class="sp-board-col" key=${col.id}>
            <div class="sp-board-col-head">
              <span>${col.title}</span>
              <button type="button" title="Add card" onClick=${() => addCard(col.id)}>+</button>
            </div>
            <div class="sp-board-cards">
              ${col.cards.map(card => html`
                <div class="sp-board-card" key=${card.id}>
                  <textarea value=${card.text} placeholder="Card" onInput=${(e) => updateCard(col.id, card.id, e.currentTarget.value)}></textarea>
                  <div class="sp-board-card-actions">
                    <button type="button" disabled=${colIndex === 0} onClick=${() => moveCard(col.id, card.id, -1)}>${'<'}</button>
                    <button type="button" disabled=${colIndex === columns.length - 1} onClick=${() => moveCard(col.id, card.id, 1)}>${'>'}</button>
                  </div>
                </div>
              `)}
            </div>
          </div>
        `)}
      </div>
    </section>
  `;
}

export function ScratchpadEmptyState({ onAddBlock }) {
  return html`
    <div class="sp-empty">
      <div>
        <strong>Start writing</strong>
        <span>Capture a thought, paste research, or add a structured block.</span>
      </div>
      <${Button} variant="primary" onClick=${onAddBlock}>New block</${Button}>
    </div>
  `;
}
