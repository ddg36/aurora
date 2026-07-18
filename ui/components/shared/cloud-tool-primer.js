// @@ se genera desde el catálogo REAL de pi. Este módulo no ejecuta tools ni
// parsea respuestas del proveedor.

import { getPiToolCatalog } from './pi-tool-catalog.js';

const INTRO = [
  'Hola :) En ESTE chat Aurora puede ejecutar herramientas reales en la PC del usuario.',
  'Cuando necesites una, terminá tu turno con un único objeto {"tool":"NOMBRE","args":{...}} dentro de un bloque ```json completo. Nada después del bloque.',
  'MUY IMPORTANTE: emití ese bloque únicamente en la respuesta normal y visible del chat, como respuesta final del turno. Nunca lo pongas en razonamiento, comentarios, progreso, contenido desplegable/oculto (por ejemplo «Worked for…») ni en ningún canal interno, porque Aurora no debe ejecutar JSON oculto.',
  'Aurora lo ejecutará y te devolverá el resultado real en el siguiente mensaje. No afirmes que una acción ocurrió antes de recibir ese resultado.',
  'Si no necesitás herramientas, respondé normalmente. Si una falla, leé el error, corregí los argumentos y reintentá.',
  '',
  'TOOLS OFICIALES DE PI (schema actual de la versión instalada):',
];

const AURORA_DEFINITIONS = [
  '• forge_submit — entrega un draft versionado a Tool Forge; jamás aprueba ni activa. args: {manifest, code}.',
  '• view_describe — descubre acciones semánticas de Aurora. args: {view}.',
  '• view_invoke — invoca una acción ya descubierta. args: {view, action, args}.',
];

function formatProperties(schema = {}) {
  const required = new Set(schema.required || []);
  return Object.entries(schema.properties || {}).map(([name, rule]) => {
    const suffix = required.has(name) ? '' : '?';
    const type = rule.type === 'array'
      ? `array<${rule.items?.type || 'value'}>`
      : rule.type || 'value';
    return `${name}${suffix}:${type}`;
  }).join(', ');
}

export async function getCloudToolPrimer({ collaboration = false, refresh = false } = {}) {
  const catalog = await getPiToolCatalog({ refresh });
  const definitions = catalog.tools.map(tool =>
    `• ${tool.name} {${formatProperties(tool.parameters)}} — ${tool.description}`
  );
  const collaborationDefinition = collaboration
    ? ['• panel_send — entrega un mensaje al otro panel. args: {to:"panel1|panel2", message:string}.']
    : [];
  return [...INTRO, ...definitions, '', 'TOOLS DE AURORA:', ...AURORA_DEFINITIONS,
    ...collaborationDefinition, '',
    'Usá exactamente los nombres y tipos publicados arriba. No inventes aliases.'].join('\n');
}

// Fallback únicamente para mostrar/copiar algo si el host está temporalmente
// caído. El flujo agéntico usa siempre getCloudToolPrimer().
export const CLOUD_TOOL_PRIMER = [...INTRO,
  'Catálogo dinámico no cargado todavía. Usá el botón @@ cuando Aurora esté conectada.',
  '', 'TOOLS DE AURORA:', ...AURORA_DEFINITIONS].join('\n');
