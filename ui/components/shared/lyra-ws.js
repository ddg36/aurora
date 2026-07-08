const BASE_WS = `ws://${location.hostname}:7779/lyra`;
const INITIAL_RECONNECT_MS   = 1000;
const MAX_RECONNECT_MS       = 30000;
const MAX_RECONNECT_ATTEMPTS = 10;

let _ws                = null;
let _handlers          = null;
let _lastSessionInfo   = null;
let _sessionInfoCb     = null;
let _reconnectAttempts = 0;
let _reconnectTimer    = null;
let _intentionalClose  = false;

function _setOnline(online) {
  import('../../store.js').then(({ nexusOnline }) => { nexusOnline.value = online; });
}

export function onSessionInfo(cb) {
  _sessionInfoCb = cb;
  if (_lastSessionInfo) cb(_lastSessionInfo);
}

function _scheduleReconnect() {
  if (_intentionalClose) return;
  if (_reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) { _setOnline(false); return; }
  const delay = Math.min(INITIAL_RECONNECT_MS * Math.pow(2, _reconnectAttempts), MAX_RECONNECT_MS);
  _reconnectAttempts++;
  _reconnectTimer = setTimeout(() => { _reconnectTimer = null; _connectInternal().catch(() => {}); }, delay);
}

function _connectInternal() {
  return new Promise((resolve, reject) => {
    if (_ws?.readyState === WebSocket.OPEN)       { resolve(_ws); return; }
    if (_ws?.readyState === WebSocket.CONNECTING) {
      _ws.addEventListener('open',  () => resolve(_ws), { once: true });
      _ws.addEventListener('error', () => reject(new Error('conectando')), { once: true });
      return;
    }
    const ws = new WebSocket(BASE_WS);
    _ws = ws;
    ws.addEventListener('open', () => {
      _reconnectAttempts = 0;
      _intentionalClose  = false;
      _setOnline(true);
      resolve(ws);
    }, { once: true });
    ws.addEventListener('error', () => {
      _ws = null;
      reject(new Error('Lyra offline'));
      _scheduleReconnect();
    }, { once: true });
    ws.addEventListener('close', () => {
      _ws = null;
      _setOnline(false);
      if (!_intentionalClose) _scheduleReconnect();
    });
    ws.addEventListener('message', ev => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if ((msg.type === 'session_init' || msg.type === 'status') && msg.session_id) {
        _lastSessionInfo = {
          session_id:   msg.session_id,
          session_name: msg.session_name,
          session_path: msg.session_path,
          workspace:    msg.workspace,
        };
        _sessionInfoCb?.(_lastSessionInfo);
      }
      _dispatch(msg);
    });
  });
}

export function connectLyra()  { return _connectInternal(); }

export function disconnectLyra() {
  _intentionalClose = true;
  if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
  _reconnectAttempts = 0;
  _ws?.close();
  _ws = null;
  _handlers = null;
  _setOnline(false);
}

export function cancelarMensaje() {
  _ws?.send(JSON.stringify({ type: 'cancel' }));
  const h = _handlers;
  _handlers = null;
  h?.resolve?.();
}

export function getConnectionState() {
  return {
    connected:        _ws?.readyState === WebSocket.OPEN,
    connecting:       _ws?.readyState === WebSocket.CONNECTING,
    reconnectAttempt: _reconnectAttempts,
    maxAttempts:      MAX_RECONNECT_ATTEMPTS,
  };
}

export async function sendToLyra({
  message, images, model, system = '', history = [], tools = [], pure_system = false, chat_id = null,
  onToken, onThinking, onToolCall, onToolResult, onToolProgress, onMessageStart, onMessageEnd,
  onAgentStart, onAgentEnd, onQueueUpdate, onSessionInfo, onThinkingLevel, onCompactionStart, onCompactionEnd,
  onHubAction, onConfirmRequest
}) {
  const ws = await connectLyra();
  return new Promise((resolve, reject) => {
    _handlers = {
      onToken, onThinking, onToolCall, onToolResult, onToolProgress, onMessageStart, onMessageEnd,
      onAgentStart, onAgentEnd, onQueueUpdate, onSessionInfo, onThinkingLevel, onCompactionStart, onCompactionEnd,
      onHubAction, onConfirmRequest, resolve, reject
    };
    const payload = { type: 'chat', message, model, system, history, tools, pure_system, chat_id };
    if (images && images.length > 0) {
      payload.message = [
        { type: 'text', text: message },
        ...images.map(img => ({ type: 'image_url', image_url: { url: img } })),
      ];
    }
    ws.send(JSON.stringify(payload));
  });
}

export function confirmTool(approved) {
  _ws?.send(JSON.stringify({ type: 'confirm', approved }));
}

export function resetLyraSession() {
  _ws?.send(JSON.stringify({ type: 'reset' }));
}

export function fetchModels() {
  return new Promise(async resolve => {
    try {
      const ws = await connectLyra();
      const handler = ev => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'models') { ws.removeEventListener('message', handler); resolve(msg.models || []); }
        } catch {}
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ type: 'models' }));
      setTimeout(() => { ws.removeEventListener('message', handler); resolve([]); }, 4000);
    } catch { resolve([]); }
  });
}

export function fetchCommands() {
  return new Promise(async resolve => {
    try {
      const ws = await connectLyra();
      const handler = ev => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'commands') { ws.removeEventListener('message', handler); resolve(msg.commands || []); }
        } catch {}
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ type: 'commands' }));
      setTimeout(() => { ws.removeEventListener('message', handler); resolve([]); }, 4000);
    } catch { resolve([]); }
  });
}

function _dispatch(msg) {
  if (!_handlers) return;
  const {
    onToken, onThinking, onToolCall, onToolResult, onToolProgress, onMessageStart, onMessageEnd,
    onAgentStart, onAgentEnd, onQueueUpdate, onSessionInfo, onThinkingLevel, onCompactionStart, onCompactionEnd,
    onHubAction, onConfirmRequest, resolve, reject
  } = _handlers;
  switch (msg.type) {
    case 'token':          onToken?.(msg.content); break;
    case 'thinking':       onThinking?.(msg.content); break;
    case 'tool_call':      onToolCall?.(msg.name, msg.args, msg.risk); break;
    case 'tool_result':    onToolResult?.(msg.name, msg.output, msg.is_error); break;
    case 'tool_progress':  onToolProgress?.(msg.name, msg.partial); break;
    case 'message_start':  onMessageStart?.(msg.role); break;
    case 'message_end':    onMessageEnd?.(msg.role, msg.stop_reason); break;
    case 'agent_start':    onAgentStart?.(); break;
    case 'agent_end':      onAgentEnd?.(); break;
    case 'queue_update':   onQueueUpdate?.(msg.queue); break;
    case 'session_info':   onSessionInfo?.(msg.session_id, msg.session_name); break;
    case 'thinking_level': onThinkingLevel?.(msg.level); break;
    case 'compaction_start': onCompactionStart?.(msg.reason); break;
    case 'compaction_end':   onCompactionEnd?.(msg.reason); break;
    case 'hub_action_request':
      if (onHubAction) {
        onHubAction(msg.name, msg.args || {}, (output, imageB64) => {
          _ws?.send(JSON.stringify({ type: 'hub_action_result', output, image: imageB64 || null }));
        });
      } else {
        _ws?.send(JSON.stringify({ type: 'hub_action_result', output: 'Error: hub no disponible' }));
      }
      break;
    case 'confirm_request': onConfirmRequest?.(msg.name, msg.command, msg.risk, confirmTool); break;
    case 'done':  _handlers = null; resolve(); break;
    case 'error': _handlers = null; reject(new Error(msg.message)); break;
  }
}
