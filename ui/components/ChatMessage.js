const { html } = globalThis;

export function ChatMessage({ role, time, streaming, loading, children }) {
  const cls = [
    'au-chat-message px-3 py-2.5 text-sm leading-relaxed flex-shrink-0 transition-colors',
    role === 'user'      && 'fx-msg-user',
    role === 'assistant' && 'fx-msg-assistant',
    streaming            && 'fx-msg-streaming',
    loading              && 'opacity-60',
  ].filter(Boolean).join(' ');

  return html`
    <div class=${cls}>
      ${(role || time) && html`
        <div class="flex items-center gap-1.5 mb-1.5 text-xs text-aurora-text-dim">
          ${role && html`<span class="au-label font-bold text-aurora-text-muted uppercase">${role === 'user' ? 'Vos' : 'AI'}</span>`}
          ${time && html`<span class="ml-auto opacity-50">${time}</span>`}
        </div>
      `}
      <div class="text-aurora-text">${children}</div>
    </div>
  `;
}

export function ChatList({ children, class: cls }) {
  return html`<div class=${'flex flex-col gap-2' + (cls ? ' ' + cls : '')}>${children}</div>`;
}
