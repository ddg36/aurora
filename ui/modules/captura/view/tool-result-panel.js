const html = (...args) => globalThis.html(...args);
const { useState, useRef, useMemo } = globalThis.preactHooks;

import {
  Button,
  ListActions,
  Panel,
  PanelBody,
  PanelFooter,
  PanelHeader,
} from '../../../components/index.js';
import { renderMarkdown } from '../../../modules/md-reader/scripts/parser.js';

export function ToolResultPanel({ result, onCopy, onClose, followUps, onAskFollowUp, chatBusy, chatStreaming, chatCurrentQuestion, screenshotDataUrl }) {
  if (!result) return null;
  const [collapsed, setCollapsed] = useState(false);
  const [preview, setPreview] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [includeImage, setIncludeImage] = useState(false);
  const inputRef = useRef(null);

  const handleSubmit = () => {
    if (!question.trim() || chatBusy) return;
    onAskFollowUp(question.trim(), includeImage ? screenshotDataUrl : null);
    setQuestion('');
    inputRef.current?.focus();
  };

  const renderedHtml = useMemo(() => result ? renderMarkdown(result, 'resultado.md').html : '', [result]);

  return html`
    <${Panel}>
      <${PanelHeader}>
        <button
          type="button"
          class="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-aurora-text-dim hover:text-aurora-text transition-colors"
          onClick=${() => setCollapsed(c => !c)}
        >
          <span class="text-[9px] opacity-50 transition-transform ${collapsed ? '' : 'rotate-90'}">▶</span>
          Resultado
          <span class="text-[9px] font-normal opacity-40">${result.length.toLocaleString()} chars</span>
        </button>
        <${ListActions}>
          ${!collapsed && html`<${Button} size="sm" onClick=${() => setPreview(p => !p)}>${preview ? '📝' : '👁'}</${Button}>`}
          ${!collapsed && html`<${Button} size="sm" onClick=${onCopy}>📋 Copiar</${Button}>`}
          <${Button} size="sm" onClick=${onClose}>✕</${Button}>
        </${ListActions}>
      </${PanelHeader}>

      ${!collapsed && html`
        ${preview ? html`
          <${PanelBody} noPadding class="overflow-y-auto">
            <div class="markdown-body p-3 text-[11px] leading-relaxed" dangerouslySetInnerHTML=${{ __html: renderedHtml }} />
          </${PanelBody}>
        ` : html`
          <${PanelBody} noPadding class="overflow-y-auto">
            <pre class="min-h-[60px] p-3 text-[11px] leading-relaxed whitespace-pre-wrap font-mono text-aurora-text">${result}</pre>
          </${PanelBody}>
        `}

        <button
          type="button"
          class="flex w-full items-center gap-2 px-3 py-1.5 text-[10px] text-aurora-text-muted border-t border-aurora-border hover:bg-aurora-surface-hover transition-colors"
          onClick=${() => setChatOpen(o => !o)}
        >
          <span>💬 Conversar sobre esto</span>
          <span class="ml-auto text-[9px] opacity-50">${chatOpen ? '▲' : '▼'}</span>
        </button>

        ${chatOpen && html`
          <div class="border-t border-aurora-border">
            ${followUps.map(fu => html`
              <div class="px-3 py-2 border-b border-aurora-border/50 last:border-b-0">
                <div class="flex items-start gap-2 mb-1.5">
                  <span class="text-[10px] mt-0.5">❓</span>
                  <span class="text-[10px] font-medium text-aurora-text">${fu.question}</span>
                </div>
                <div class="flex items-start gap-2">
                  <span class="text-[10px] mt-0.5">🤖</span>
                  <span class="text-[11px] text-aurora-text whitespace-pre-wrap">${fu.answer}</span>
                </div>
              </div>
            `)}

            ${chatBusy && html`
              <div class="px-3 py-2 border-b border-aurora-border/50">
                <div class="flex items-start gap-2">
                  <span class="text-[10px] mt-0.5">❓</span>
                  <span class="text-[10px] font-medium text-aurora-text">${chatCurrentQuestion}</span>
                </div>
                <div class="flex items-start gap-2 mt-1.5">
                  <span class="text-[10px] mt-0.5">🤖</span>
                  <span class="text-[11px] text-aurora-text whitespace-pre-wrap">${chatStreaming}</span>
                  <span class="inline-block w-1.5 h-3 bg-aurora-accent animate-pulse ml-0.5"></span>
                </div>
              </div>
            `}

            ${screenshotDataUrl && !chatBusy && html`
              <label class="flex items-center gap-1.5 px-3 py-1.5 border-b border-aurora-border bg-aurora-surface cursor-pointer hover:bg-aurora-surface-hover transition-colors text-[10px] text-aurora-text-muted select-none">
                <input
                  type="checkbox"
                  checked=${includeImage}
                  onChange=${() => setIncludeImage(i => !i)}
                  class="accent-aurora-accent"
                />
                <span>📷 Incluir screenshot</span>
                ${includeImage && html`
                  <img src=${screenshotDataUrl} class="ml-auto h-7 w-auto rounded border border-aurora-border" />
                `}
              </label>
            `}

            <div class="flex items-center gap-2 px-3 py-2 bg-aurora-surface">
              <input
                ref=${inputRef}
                type="text"
                class="flex-1 bg-aurora-surface-2 border border-aurora-border rounded-md px-2 py-1.5 text-[11px] text-aurora-text placeholder-aurora-text-dim outline-none focus:border-aurora-accent transition-colors"
                placeholder=${chatBusy ? 'Esperando respuesta…' : 'Preguntá sobre esto…'}
                value=${chatBusy ? '' : question}
                disabled=${chatBusy}
                onInput=${(e) => setQuestion(e.target.value)}
                onKeyDown=${(e) => { if (e.key === 'Enter') handleSubmit(); }}
              />
              <${Button} size="sm" disabled=${!question.trim() || chatBusy} onClick=${handleSubmit}>
                ${chatBusy ? '…' : 'Enviar'}
              </${Button}>
            </div>
          </div>
        `}

        <${PanelFooter}>
          <span class="ml-auto text-[9px] text-aurora-text-dim">${result.length.toLocaleString()} caracteres</span>
        </${PanelFooter}>
      `}
    </${Panel}>
  `;
}
