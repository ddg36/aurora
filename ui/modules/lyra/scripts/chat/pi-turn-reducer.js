// Pi-native Turn Model — reducer puro, sin Preact ni DOM.
// Pi decide identidad/estado; Aurora sólo adapta ese estado a su renderer web.

export function createPiTurnState() {
  return {
    protocolVersion: 1,
    messageKey: null,
    activeMessageKey: null,
    activeOffset: 0,
    role: 'assistant',
    status: 'idle',
    stopReason: null,
    usage: null,
    blocks: [],
    lastSeq: 0,
  };
}

export function piResultText(result) {
  if (result == null) return '';
  if (typeof result === 'string') return result;
  const content = Array.isArray(result.content) ? result.content : [];
  const text = content
    .filter(item => item?.type === 'text')
    .map(item => item.text || '')
    .filter(Boolean)
    .join('\n');
  return text || (result.output == null ? '' : String(result.output));
}

export function piTurnText(state, tipo = 'text') {
  return (state?.blocks || [])
    .filter(block => block.tipo === tipo)
    .map(block => block.contenido || '')
    .join('');
}

function argsView(args) {
  let full = '';
  try { full = JSON.stringify(args ?? {}, null, 2); }
  catch (_) { full = String(args ?? ''); }
  return {
    argsFull: full,
    args: full.length > 120 ? `${full.replace(/\s+/g, ' ').slice(0, 120)}…` : full,
  };
}

function messageKey(message) {
  if (!message) return null;
  return message.id || message.messageId || message.responseId ||
    (message.timestamp != null ? `pi-message:${message.timestamp}` : null);
}

function snapshotBlock(raw, index, previous) {
  if (raw?.type === 'text') {
    return { tipo: 'text', contenido: raw.text || '', contentIndex: index };
  }
  if (raw?.type === 'thinking') {
    return { tipo: 'thinking', contenido: raw.thinking || '', contentIndex: index };
  }
  if (raw?.type === 'toolCall') {
    const id = raw.id || previous?.id || `pi-tool-index:${index}`;
    const same = previous?.tipo === 'tool' && previous.id === id ? previous : {};
    return {
      ...same,
      tipo: 'tool', id, toolCallId: id,
      name: raw.name || same.name || '',
      ...argsView(raw.arguments ?? same.arguments ?? {}),
      arguments: raw.arguments ?? same.arguments ?? {},
      status: same.status || 'pending',
      contentIndex: index,
    };
  }
  return null;
}

function reconcileMessage(state, message) {
  if (!message || message.role !== 'assistant' || !Array.isArray(message.content)) return state;
  const key = messageKey(message) || state.activeMessageKey;
  const newMessage = Boolean(state.activeMessageKey && key && key !== state.activeMessageKey);
  const offset = newMessage ? state.blocks.length : (state.activeOffset || 0);
  const prefix = state.blocks.slice(0, offset);
  const activeBlocks = state.blocks.slice(offset);
  const byToolId = new Map(state.blocks.filter(b => b.tipo === 'tool' && b.id).map(b => [b.id, b]));
  const blocks = message.content.map((raw, index) => {
    const old = raw?.type === 'toolCall' ? byToolId.get(raw.id) : activeBlocks[index];
    return snapshotBlock(raw, offset + index, old);
  }).filter(Boolean);
  // Una tool execution puede iniciar antes de que el snapshot del assistant
  // contenga su bloque. No descartarla durante una reconciliación intermedia.
  for (const old of activeBlocks) {
    if (old.tipo === 'tool' && old.id && !blocks.some(block => block.tipo === 'tool' && block.id === old.id)) {
      blocks.push(old);
    }
  }
  return {
    ...state,
    messageKey: key || state.messageKey,
    activeMessageKey: key || state.activeMessageKey,
    activeOffset: offset,
    role: message.role,
    stopReason: message.stopReason ?? state.stopReason,
    usage: message.usage ?? state.usage,
    blocks: [...prefix, ...blocks],
  };
}

function replaceAt(blocks, index, block) {
  const next = [...blocks];
  while (next.length < index) next.push(null);
  next[index] = block;
  return next.filter(Boolean);
}

function applyDelta(state, delta) {
  const localIndex = Number.isInteger(delta?.contentIndex) ? delta.contentIndex : state.blocks.length;
  const index = (state.activeOffset || 0) + localIndex;
  const current = state.blocks[index];
  if (delta?.type === 'text_start') {
    return { ...state, blocks: replaceAt(state.blocks, index, { tipo: 'text', contenido: '', contentIndex: index }) };
  }
  if (delta?.type === 'text_delta') {
    const block = current?.tipo === 'text' ? current : { tipo: 'text', contenido: '', contentIndex: index };
    return { ...state, blocks: replaceAt(state.blocks, index, { ...block, contenido: block.contenido + (delta.delta || '') }) };
  }
  if (delta?.type === 'text_end') {
    return { ...state, blocks: replaceAt(state.blocks, index, { tipo: 'text', contenido: delta.content || current?.contenido || '', contentIndex: index }) };
  }
  if (delta?.type === 'thinking_start') {
    return { ...state, blocks: replaceAt(state.blocks, index, { tipo: 'thinking', contenido: '', contentIndex: index }) };
  }
  if (delta?.type === 'thinking_delta') {
    const block = current?.tipo === 'thinking' ? current : { tipo: 'thinking', contenido: '', contentIndex: index };
    return { ...state, blocks: replaceAt(state.blocks, index, { ...block, contenido: block.contenido + (delta.delta || '') }) };
  }
  if (delta?.type === 'thinking_end') {
    return { ...state, blocks: replaceAt(state.blocks, index, { tipo: 'thinking', contenido: delta.content || current?.contenido || '', contentIndex: index }) };
  }
  if (delta?.type === 'toolcall_end' && delta.toolCall) {
    return { ...state, blocks: replaceAt(state.blocks, index, snapshotBlock(delta.toolCall, index, current)) };
  }
  return state;
}

function upsertTool(state, event, patch) {
  const id = event.toolCallId;
  if (!id) return state;
  let index = state.blocks.findIndex(block => block.tipo === 'tool' && block.id === id);
  const previous = index >= 0 ? state.blocks[index] : null;
  const base = {
    ...(previous || {}),
    tipo: 'tool', id, toolCallId: id,
    name: event.toolName || previous?.name || '',
    ...(event.args !== undefined ? { ...argsView(event.args), arguments: event.args } : {}),
  };
  const updated = { ...base, ...patch };
  if (index < 0) return { ...state, blocks: [...state.blocks, updated] };
  return { ...state, blocks: [...state.blocks.slice(0, index), updated, ...state.blocks.slice(index + 1)] };
}

export function reducePiTurn(previous, envelope) {
  const state = previous || createPiTurnState();
  if (envelope?.type !== 'pi_event' || envelope.protocolVersion !== 1 || !envelope.event) return state;
  if (envelope.seq && envelope.seq <= state.lastSeq) return state;
  const event = envelope.event;
  let next = { ...state, lastSeq: envelope.seq || state.lastSeq };

  if (event.type === 'agent_start') return { ...next, status: 'working' };
  if (event.type === 'agent_end') return { ...next, status: event.willRetry ? 'retrying' : 'completed' };
  if (event.type === 'message_start') {
    next = reconcileMessage(next, event.message);
    return event.message?.role === 'assistant' ? { ...next, status: 'streaming' } : next;
  }
  if (event.type === 'message_update') {
    if (event.message) return { ...reconcileMessage(next, event.message), status: 'streaming' };
    return { ...applyDelta(next, event.assistantMessageEvent || {}), status: 'streaming' };
  }
  if (event.type === 'message_end') {
    next = reconcileMessage(next, event.message);
    return { ...next, status: event.message?.stopReason === 'error' ? 'error' : 'message_complete' };
  }
  if (event.type === 'tool_execution_start') {
    return upsertTool(next, event, { status: 'running', partialResult: null });
  }
  if (event.type === 'tool_execution_update') {
    return upsertTool(next, event, {
      status: 'running', partialResult: event.partialResult,
      output: piResultText(event.partialResult),
    });
  }
  if (event.type === 'tool_execution_end') {
    return upsertTool(next, event, {
      status: event.isError ? 'error' : 'success',
      result: event.result,
      resultContent: event.result?.content || [],
      details: event.result?.details,
      output: piResultText(event.result),
      isError: Boolean(event.isError),
    });
  }
  return next;
}
