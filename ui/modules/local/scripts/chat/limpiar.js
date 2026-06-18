import { historial, limpiarHistorial } from './mensajes.js';

const Toast = () => globalThis.Toast || { setStatus() {} };

export function limpiarChat() {
  limpiarHistorial();
  Toast().setStatus('◉ Chat limpiado');
}

export function copiarUltimaRespuesta() {
  const ultima = [...historial.value].reverse().find(m => m.role === 'assistant');
  if (ultima) {
    navigator.clipboard.writeText(ultima.content);
    Toast().setStatus('◉ Última respuesta copiada');
  }
}
