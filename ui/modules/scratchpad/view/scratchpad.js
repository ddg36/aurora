const html = (...args) => globalThis.html(...args);
const { useState, useEffect } = globalThis.preactHooks;

import {
  addScratchpadBlock,
  copiar,
  createScratchpadPage,
  contarStats,
  deleteScratchpadBlock,
  deleteScratchpadPage,
  descargarMd,
  doc,
  duplicateScratchpadBlock,
  duplicateScratchpadPage,
  ensureScratchpadDoc,
  getSaveStatus,
  getScratchpadDoc,
  guardarAhora,
  isScratchpadOnline,
  limpiar,
  moveScratchpadBlock,
  onSaveStatus,
  pegarDesdePortapapeles,
  selectScratchpadPage,
  setScratchpadPage,
  transformScratchpadBlock,
  updateScratchpadBlock,
  updateScratchpadBoard,
  updateScratchpadTable,
} from '../scripts/notas.js?v=v2-clean-ui-4';
import { ScratchpadPageShell, ScratchpadBlockEditor, SCRATCHPAD_COMMANDS } from '../../../components/scratchpad/index.js?v=v2-clean-ui-4';
import { setViewActions, clearViewActions } from '../../../components/footer/registry.js';

const STATUS_LABEL = {
  idle: { text: 'Ready', tone: 'neutral' },
  pending: { text: 'Unsaved', tone: 'neutral' },
  saving: { text: 'Saving...', tone: 'neutral' },
  ok: { text: 'Saved', tone: 'ok' },
  error: { text: 'Save error', tone: 'error' },
};

function pickSlashCommand(commands, query) {
  const q = String(query || '').trim().toLowerCase();
  const match = commands.find((cmd) =>
    !q || cmd.label.toLowerCase().includes(q) || cmd.type.includes(q)
  );
  return match?.type || 'paragraph';
}

function subscribeSignal(sig, cb) {
  if (typeof sig?.subscribe === 'function') return sig.subscribe(cb);
  const id = setInterval(() => cb(sig.value), 250);
  return () => clearInterval(id);
}

function pageFromDoc(snapshot) {
  return {
    ...(snapshot?.page || {}),
    blocks: Array.isArray(snapshot?.blocks) ? snapshot.blocks : [],
  };
}

export default function Scratchpad() {
  const [saveStatus, setSaveStatus] = useState(getSaveStatus());
  const [snapshot, setSnapshot] = useState(getScratchpadDoc());
  const [ui, setUi] = useState({
    activeBlockId: null,
    navCollapsed: true,
    createPanelOpen: false,
    noteQuery: '',
    slash: { blockId: null, query: '' },
  });

  const currentDoc = snapshot || getScratchpadDoc();
  const page = pageFromDoc(currentDoc);

  function patchUi(patch) {
    setUi((prev) => ({ ...prev, ...patch }));
  }

  function setSlash(blockId, query = '') {
    patchUi({ slash: { blockId, query } });
  }

  function focusBlock(blockId) {
    patchUi({ activeBlockId: blockId, slash: { blockId: null, query: '' } });
  }

  function resetForDoc(next) {
    patchUi({
      activeBlockId: next?.blocks?.[0]?.id || null,
      createPanelOpen: false,
      slash: { blockId: null, query: '' },
    });
  }

  function insertBlockAfter(afterId, type = 'paragraph', patch = {}) {
    const next = addScratchpadBlock(afterId, type, patch);
    focusBlock(next.id);
    return next;
  }

  function handleCreatePage() {
    const next = createScratchpadPage({ title: 'Untitled' });
    resetForDoc(next);
    return next;
  }

  function handleSelectPage(id) {
    const next = selectScratchpadPage(id);
    resetForDoc(next);
    return next;
  }

  function handleDuplicatePage(id) {
    const next = duplicateScratchpadPage(id);
    resetForDoc(next);
    return next;
  }

  function handleDeletePage(id) {
    const item = currentDoc.pages.find((entry) => entry.id === id);
    if (currentDoc.pages.length > 1 && !globalThis.confirm?.(`Delete "${item?.title || 'Untitled'}"?`)) {
      return currentDoc;
    }
    const next = deleteScratchpadPage(id);
    resetForDoc(next);
    return next;
  }

  function handleTextChange(blockId, text) {
    updateScratchpadBlock(blockId, { text });
  }

  function handleTodoToggle(block, index, checked) {
    const lines = String(block.text || '').split('\n');
    const checkedItems = Array.isArray(block.checkedItems) ? [...block.checkedItems] : [];
    while (checkedItems.length < lines.length) checkedItems.push(!!block.checked);
    checkedItems[index] = checked;
    updateScratchpadBlock(block.id, { checkedItems, checked: checkedItems.every(Boolean) });
  }

  function handleDeleteBlock(blockId) {
    const blocks = Array.isArray(currentDoc.blocks) ? currentDoc.blocks : [];
    const index = blocks.findIndex((block) => block.id === blockId);
    const fallback = index > 0 ? blocks[index - 1] : blocks[index + 1];
    const next = deleteScratchpadBlock(blockId);
    const focusId = next.blocks.find((block) => block.id === fallback?.id)?.id || next.blocks[0]?.id || null;
    focusBlock(focusId);
    return next;
  }

  function handleDuplicateBlock(blockId) {
    const next = duplicateScratchpadBlock(blockId);
    if (next?.id) focusBlock(next.id);
    return next;
  }

  function handleTransformBlock(blockId, type = 'paragraph') {
    const next = transformScratchpadBlock(blockId, type);
    focusBlock(blockId);
    return next;
  }

  function handlePasteImage(url) {
    if (!url) return;
    insertBlockAfter(ui.activeBlockId, 'image', {
      url,
      caption: 'Pasted image',
      text: 'Pasted image',
    });
  }

  function handleSlashPick(blockId, type) {
    handleTransformBlock(blockId, type);
    updateScratchpadBlock(blockId, { text: '' });
    focusBlock(blockId);
  }

  async function handlePasteDoc() {
    const next = await pegarDesdePortapapeles();
    resetForDoc(next);
    return next;
  }

  function handleClear() {
    const next = limpiar();
    resetForDoc(next);
    return next;
  }

  function addFromCreatePanel(type, patch = {}) {
    const next = addScratchpadBlock(ui.activeBlockId, type, patch);
    patchUi({
      activeBlockId: next.id,
      createPanelOpen: false,
      slash: { blockId: null, query: '' },
    });
    return next;
  }

  function handleKeyDown(e, block) {
    if (e.key === 'Escape') {
      setSlash(null, '');
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();

      if (ui.slash.blockId === block.id) {
        handleSlashPick(block.id, pickSlashCommand(SCRATCHPAD_COMMANDS, ui.slash.query));
        return;
      }

      if (!block.text && ['bullet', 'todo', 'quote'].includes(block.type)) {
        handleTransformBlock(block.id, 'paragraph');
        return;
      }

      const el = e.currentTarget;
      const text = String(block.text || '');
      const cursor = Number.isFinite(el?.selectionStart) ? el.selectionStart : text.length;
      const before = text.slice(0, cursor);
      const after = text.slice(cursor);
      const nextType = ['bullet', 'todo', 'quote'].includes(block.type) ? block.type : 'paragraph';

      updateScratchpadBlock(block.id, { text: before });
      insertBlockAfter(block.id, nextType, { text: after });
      return;
    }

    if (e.key === 'Backspace' && !block.text && block.type !== 'mini_table' && block.type !== 'mini_kanban') {
      if ((currentDoc.blocks || []).length > 1) {
        e.preventDefault();
        handleDeleteBlock(block.id);
      }
    }
  }

  useEffect(() => {
    ensureScratchpadDoc()
      .then(() => setSnapshot(getScratchpadDoc()))
      .catch(() => setSnapshot(getScratchpadDoc()));

    const offStatus = onSaveStatus(setSaveStatus);
    const offDoc = subscribeSignal(doc, () => setSnapshot(getScratchpadDoc()));

    return () => {
      offStatus?.();
      offDoc?.();
      clearViewActions();
      if (globalThis.scratchpadAddBlock) delete globalThis.scratchpadAddBlock;
    };
  }, []);

  useEffect(() => {
    if (ui.activeBlockId || !page.blocks[0]?.id) return;
    patchUi({ activeBlockId: page.blocks[0].id });
  }, [ui.activeBlockId, currentDoc.activePageId, page.blocks[0]?.id]);

  useEffect(() => {
    globalThis.scratchpadAddBlock = (type, patch = {}) => addFromCreatePanel(type, patch);
  }, [ui.activeBlockId, ui.createPanelOpen]);

  useEffect(() => {
    if (!ui.activeBlockId) return;
    const el = document.querySelector(`[data-block-id="${ui.activeBlockId}"] .sp-editable`);
    if (!el || document.activeElement === el) return;
    el.focus();
    const end = el.value?.length ?? 0;
    if (typeof el.setSelectionRange === 'function') el.setSelectionRange(end, end);
  }, [ui.activeBlockId, currentDoc.activePageId, page.blocks.length]);

  useEffect(() => {
    setViewActions([
      { id: 'sp-nueva', icon: '＋', title: 'Nueva pagina', onClick: handleCreatePage },
      { id: 'sp-export', icon: '⬇', title: 'Exportar .md', onClick: () => descargarMd(page) },
      { id: 'sp-save', icon: '💾', title: 'Guardar ahora', onClick: () => guardarAhora() },
    ]);
    return () => clearViewActions();
  }, [snapshot, saveStatus]);

  const statsRaw = contarStats(page);
  const stats = {
    blocks: statsRaw?.bloques || 0,
    words: statsRaw?.palabras || 0,
    tokens: statsRaw?.tokens || 0,
  };
  const nexusOk = isScratchpadOnline();
  const status = nexusOk
    ? STATUS_LABEL[saveStatus] || STATUS_LABEL.idle
    : { text: 'Local only', tone: 'neutral' };

  return html`
    <div class="scratchpad-view">
      <${ScratchpadPageShell}
        page=${page}
        pages=${currentDoc.pages}
        activePageId=${currentDoc.activePageId}
        blocks=${currentDoc.blocks}
        navCollapsed=${ui.navCollapsed}
        noteQuery=${ui.noteQuery}
        createPanelOpen=${ui.createPanelOpen}
        stats=${stats}
        statusLabel=${status.text}
        statusTone=${status.tone}
        nexusOk=${nexusOk}
        onToggleNav=${() => patchUi({ navCollapsed: !ui.navCollapsed })}
        onNoteQuery=${(noteQuery) => patchUi({ noteQuery })}
        onToggleCreatePanel=${() => patchUi({ createPanelOpen: !ui.createPanelOpen })}
        onAddBlock=${(type) => addFromCreatePanel(type)}
        onCreatePage=${handleCreatePage}
        onSelectPage=${handleSelectPage}
        onDuplicatePage=${handleDuplicatePage}
        onDeletePage=${handleDeletePage}
        onTitleInput=${(title) => setScratchpadPage({ title })}
        onDescriptionInput=${(description) => setScratchpadPage({ description })}
        onSave=${guardarAhora}
        onPaste=${handlePasteDoc}
        onCopy=${copiar}
        onClear=${handleClear}
      >
        <${ScratchpadBlockEditor}
          blocks=${currentDoc.blocks}
          activeBlockId=${ui.activeBlockId}
          slash=${ui.slash}
          commands=${SCRATCHPAD_COMMANDS}
          onTextChange=${handleTextChange}
          onToggleTodo=${handleTodoToggle}
          onToggleOpen=${(id, open) => updateScratchpadBlock(id, { open })}
          onChildrenTextChange=${(id, childrenText) => updateScratchpadBlock(id, { childrenText })}
          onPatchBlock=${(id, patch) => updateScratchpadBlock(id, patch)}
          onKeyDown=${handleKeyDown}
          onFocusBlock=${focusBlock}
          onSlashQuery=${(id, query) => setSlash(id, query)}
          onSlashPick=${handleSlashPick}
          onAddBlock=${insertBlockAfter}
          onPasteImage=${handlePasteImage}
          onDeleteBlock=${handleDeleteBlock}
          onDuplicateBlock=${handleDuplicateBlock}
          onMoveBlock=${moveScratchpadBlock}
          onTransformBlock=${handleTransformBlock}
          onTableRows=${updateScratchpadTable}
          onBoardColumns=${updateScratchpadBoard}
        />
      </${ScratchpadPageShell}>
    </div>
  `;
}
