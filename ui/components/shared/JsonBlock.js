const { html } = globalThis;

export function JsonBlock({ value }) {
  return html`<pre class="max-h-[260px] overflow-auto whitespace-pre-wrap rounded-md border border-aurora-border bg-aurora-bg p-3 text-xs text-aurora-text-dim">${JSON.stringify(value, null, 2)}</pre>`;
}
