const { html } = globalThis;

export function IframeContainer({ iframeRef, src = 'about:blank', allow = 'clipboard-read; clipboard-write; microphone', children }) {
  return html`
    <div class="w-full h-full flex flex-col overflow-hidden">
      <div class="flex-1 w-full h-full overflow-hidden relative">
        <iframe
          ref=${iframeRef}
          src=${src}
          allow=${allow}
          class="w-full h-full border-none block"
        ><//>
        ${children}
      </div>
    </div>
  `;
}
