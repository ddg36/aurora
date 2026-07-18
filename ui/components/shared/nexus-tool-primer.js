// Instrucción Nexus 2 generada desde el catálogo vivo de Pi.
// Nexus sólo serializa; Pi conserva schemas, validación y ejecución.
import { getPiToolCatalog } from './pi-tool-catalog.js';

const INTRO = [
  'Hola :) En ESTE chat Aurora puede ejecutar herramientas reales en la PC del usuario mediante Nexus 2.',
  'Cuando necesites una tool, terminá tu respuesta visible con UN único frame Nexus 2. Nada después del frame.',
  'Cabecera: ⬡ TOOL argumento=valor argumento="string con espacios" ⬡',
  'Strings multilínea: abrí una línea ◆◆◆ ruta.del.argumento, escribí el contenido literal y cerrá con exactamente ◆◆◆ en una línea sola.',
  'Para arrays/objetos usá la ruta real del schema, por ejemplo edits[0].oldText y edits[0].newText.',
  'Podés usar cuatro o más ◆ cuando el contenido tenga una línea igual al fence corto; el cierre debe repetir exactamente la misma cantidad.',
  'No pongas el frame en razonamiento, progreso, ejemplos Markdown ni contenido oculto. Emitilo sólo como cierre visible del turno.',
  'Aurora validará la estructura, la convertirá sin pérdidas a JSON Family y Pi validará los argumentos y ejecutará la tool.',
  'No afirmes que una acción ocurrió antes de recibir el resultado real.',
  '',
  'Ejemplo write:',
  '⬡ write path="/tmp/ejemplo.md" ⬡',
  '◆◆◆ content',
  '# Texto literal',
  'Comillas " y saltos reales no necesitan escapes.',
  '◆◆◆',
  '',
  'TOOLS OFICIALES DE PI (schema vivo instalado):',
];

function describeSchema(schema = {}, path = '', required = true, depth = 0) {
  if (depth > 8) return [];
  const type = schema.type || 'value';
  const suffix = required ? '' : '?';
  const label = path ? `${path}${suffix}:${type}` : type;
  const lines = path ? [label] : [];

  if (type === 'object') {
    const requiredSet = new Set(schema.required || []);
    for (const [name, child] of Object.entries(schema.properties || {})) {
      const childPath = path ? `${path}.${name}` : name;
      lines.push(...describeSchema(child, childPath, requiredSet.has(name), depth + 1));
    }
  } else if (type === 'array' && schema.items) {
    const childPath = `${path}[0]`;
    lines.push(...describeSchema(schema.items, childPath, true, depth + 1));
  }
  return lines;
}

export async function getNexusToolPrimer({ refresh = false, collaboration = false } = {}) {
  const catalog = await getPiToolCatalog({ refresh });
  const definitions = catalog.tools.map(tool => {
    const fields = describeSchema(tool.parameters || {}).join(', ');
    return `• ${tool.name}${fields ? ` {${fields}}` : ''} — ${tool.description}`;
  });
  const collaborationDefinition = collaboration
    ? ['• panel_send {to:string, message:string} — entrega un mensaje al otro panel; to debe ser panel1 o panel2.']
    : [];
  return [...INTRO, ...definitions, ...collaborationDefinition, '',
    'Usá exactamente los nombres, rutas y tipos publicados. Nexus 2 no inventa aliases ni cambia el contrato de Pi.'
  ].join('\n');
}
