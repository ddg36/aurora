const KEY = 'aurora_lyria_active_turn_v1';
const MAX_FIELD = 120000;

function trimField(value) {
  const text = String(value ?? '');
  return text.length > MAX_FIELD ? `${text.slice(0, MAX_FIELD)}\n…` : text;
}

function safeBlocks(blocks = []) {
  return blocks.map(block => ({
    ...block,
    contenido: block.contenido == null ? block.contenido : trimField(block.contenido),
    argsFull: block.argsFull == null ? block.argsFull : trimField(block.argsFull),
    output: block.output == null ? block.output : trimField(block.output),
  }));
}

export function saveTurnDraft({ turnId, chatId, prompt, blocks, startedAt }) {
  if (!turnId || !chatId) return false;
  try {
    localStorage.setItem(KEY, JSON.stringify({
      version: 1,
      turnId,
      chatId: Number(chatId),
      prompt: trimField(prompt),
      blocks: safeBlocks(blocks),
      startedAt: startedAt || Date.now(),
      checkpointAt: Date.now(),
    }));
    return true;
  } catch {
    return false;
  }
}

export function loadTurnDraft(chatId = null) {
  try {
    const draft = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!draft || draft.version !== 1 || !draft.turnId || !Array.isArray(draft.blocks)) return null;
    if (chatId != null && Number(draft.chatId) !== Number(chatId)) return null;
    return draft;
  } catch {
    return null;
  }
}

export function clearTurnDraft(turnId = null) {
  try {
    if (turnId) {
      const current = loadTurnDraft();
      if (current?.turnId !== turnId) return false;
    }
    localStorage.removeItem(KEY);
    return true;
  } catch {
    return false;
  }
}

export function draftText(blocks = []) {
  return blocks
    .filter(block => block.tipo === 'text' && block.contenido)
    .map(block => block.contenido)
    .join('\n\n')
    .trim();
}
