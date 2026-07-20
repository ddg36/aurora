import { renderMarkdownLight } from './renderizar.js';

const Toast = () => globalThis.Toast || { setStatus() {} };

function autoNombre(mensajes) {
  const primero = mensajes.find(m => m.role === 'user');
  if (!primero) return 'Chat sin nombre';
  return primero.content.substring(0, 38) + (primero.content.length > 38 ? '…' : '');
}

function formatearTimestamp(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleString();
}

function escaparHtml(texto) {
  const div = document.createElement('div');
  div.textContent = texto;
  return div.innerHTML;
}

export function exportarChatPDF(historial, modeloSeleccionado) {
  if (!historial.length) {
    Toast().setStatus('El chat está vacío');
    return;
  }

  const nombre = autoNombre(historial);
  const visibles = historial.filter(m => !m._internal && m.role !== 'system' && !m._toolCall && m.role !== 'tool');

  const fechaExportacion = new Date().toLocaleString();

  let html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${escaparHtml(nombre)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 11px;
      line-height: 1.5;
      color: #000;
      background: #fff;
      padding: 20px;
    }
    .header {
      border-bottom: 2px solid #000;
      padding-bottom: 15px;
      margin-bottom: 20px;
    }
    .header h1 { font-size: 16px; margin-bottom: 5px; }
    .header .meta { font-size: 10px; color: #666; }
    .message {
      margin-bottom: 15px;
      padding: 10px;
      border: 1px solid #ddd;
      border-radius: 4px;
      background: #f9f9f9;
    }
    .message.user {
      background: #e8f4f8;
      border-color: #b8d4e3;
    }
    .message.assistant {
      background: #f5f5f5;
      border-color: #ccc;
    }
    .message-header {
      font-size: 9px;
      font-weight: 700;
      margin-bottom: 5px;
      color: #333;
      display: flex;
      justify-content: space-between;
    }
    .message-content { font-size: 11px; line-height: 1.6; }
    .message-content p { margin: 0 0 8px; }
    .message-content p:last-child { margin-bottom: 0; }
    .message-content pre {
      background: #f0f0f0;
      border: 1px solid #ddd;
      border-radius: 3px;
      padding: 8px;
      overflow-x: auto;
      font-family: 'Consolas', 'Monaco', monospace;
      font-size: 10px;
      margin: 5px 0;
    }
    .message-content code {
      background: #f0f0f0;
      padding: 1px 4px;
      border-radius: 2px;
      font-family: 'Consolas', 'Monaco', monospace;
      font-size: 10px;
    }
    .message-content pre code {
      background: none;
      padding: 0;
    }
    .message-content strong { font-weight: 700; }
    .message-content em { font-style: italic; }
    .message-content ul, .message-content ol {
      margin: 5px 0;
      padding-left: 20px;
    }
    .message-content li { margin: 2px 0; }
    .code-block .code-hdr { display: none; }
    .footer {
      margin-top: 30px;
      padding-top: 10px;
      border-top: 1px solid #ddd;
      font-size: 9px;
      color: #666;
      text-align: center;
    }
    @media print {
      body { padding: 0; }
      .message { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${escaparHtml(nombre)}</h1>
    <div class="meta">
      Modelo: ${escaparHtml(modeloSeleccionado || '—')} ·
      Fecha exportación: ${fechaExportacion}
    </div>
  </div>
  <div class="messages">
`;

  visibles.forEach(msg => {
    const rolLabel = msg.role === 'user' ? 'Tú' : 'Lyria';
    const timestamp = formatearTimestamp(msg.ts || msg.timestamp);
    const contenidoHtml = renderMarkdownLight(msg.content);

    html += `
    <div class="message ${msg.role}">
      <div class="message-header">
        <span>${rolLabel}</span>
        <span>${timestamp}</span>
      </div>
      <div class="message-content">${contenidoHtml}</div>
    </div>
`;
  });

  html += `
  </div>
  <div class="footer">
    Exportado desde Aurora — Lyra
  </div>
</body>
</html>
`;

  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();

  setTimeout(() => {
    iframe.contentWindow.print();
    setTimeout(() => {
      document.body.removeChild(iframe);
    }, 1000);
  }, 100);

  Toast().setStatus('◉ Generando PDF...');
}
