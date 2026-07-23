import { formatContextSnapshotMarkdown } from './context-artifact.js';
import { invokeMountedAIView } from './view-action-dispatch.js';

const DESTINATIONS = Object.freeze({
  notes: {
    view: 'scratchpad',
    action: 'append',
    label: 'Notas',
    args: artifact => ({ text: formatContextSnapshotMarkdown(artifact) }),
  },
});

export function describeContextDestinations() {
  return Object.entries(DESTINATIONS).map(([id, item]) => ({
    id,
    label: item.label,
    view: item.view,
    action: item.action,
  }));
}

export async function sendContextArtifact(destination, artifact) {
  const target = DESTINATIONS[destination];
  if (!target) throw new Error(`Destino de contexto desconocido: ${destination}`);
  const response = await invokeMountedAIView({
    view: target.view,
    action: target.action,
    args: target.args(artifact),
  });
  if (!response.ok) throw new Error(response.error || `No se pudo enviar a ${target.label}`);
  return { destination, label: target.label, ...response.result };
}

