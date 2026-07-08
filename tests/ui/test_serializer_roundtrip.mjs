// Round-trip completo Capa 0.3: blocks (como los produce onToken/onToolCall/
// onToolResult en lyra.js, en orden cronológico real) → serializados a tags
// → parseados + combinados de vuelta → deben reconstruir el mismo orden y datos.
// Mismo algoritmo de serialización que enviarMensaje() en lyra.js — si cambia
// uno, hay que cambiar el otro (o este test lo detecta).
// Correr: bun tests/ui/test_serializer_roundtrip.mjs

globalThis.preactSignals = {
  signal(v) { let val = v; return { get value() { return val; }, set value(nv) { val = nv; } }; },
  computed(fn) { return { get value() { return fn(); } }; },
};

const { parsearMensajeRico, combinarPartesRicas } = await import(
  '../../ui/modules/lyra/scripts/chat/mensajes.js'
);

// Mismo algoritmo que el bloque de persistencia en enviarMensaje() (lyra.js).
function serializar(blocks) {
  const partes = blocks.map(b => {
    if (b.tipo === 'thinking') return `[thinking]\n${b.contenido}\n[/thinking]`;
    if (b.tipo === 'text') return b.contenido;
    if (b.tipo === 'tool') {
      const call = `[tool_call:${b.name}]\n${b.args}\n[/tool_call:${b.name}]`;
      if (b.output == null) return call;
      const abre = b.isError ? `[tool_result:${b.name}:error]` : `[tool_result:${b.name}]`;
      return `${call}\n${abre}\n${b.output}\n[/tool_result:${b.name}]`;
    }
    return '';
  });
  return partes.filter(Boolean).join('\n\n');
}

// Blocks tal cual quedarían tras un turno real: pensó, narró, llamó una tool,
// la tool falló, siguió narrando. Orden cronológico real, sin mezclar.
const blocksOriginales = [
  { tipo: 'thinking', contenido: 'a ver qué pide el usuario' },
  { tipo: 'text', contenido: 'Voy a intentar el comando.' },
  { tipo: 'tool', name: 'bash', args: '{"command":"false"}', output: 'exit 1', isError: true, status: 'error' },
  { tipo: 'text', contenido: 'Falló, lo reintento de otra forma.' },
];

const serializado = serializar(blocksOriginales);
const reconstruido = combinarPartesRicas(parsearMensajeRico(serializado));

const tiposEsperados = ['thinking', 'text', 'tool', 'text'];
const tiposReales = reconstruido.map(p => p.tipo);
if (JSON.stringify(tiposReales) !== JSON.stringify(tiposEsperados)) {
  console.error('FALLO orden:', tiposReales, 'esperado:', tiposEsperados);
  console.error('serializado:\n' + serializado);
  process.exit(1);
}

const tool = reconstruido[2];
if (tool.nombre !== 'bash' || !tool.isError || tool.output !== 'exit 1') {
  console.error('FALLO datos de tool:', tool);
  process.exit(1);
}
if (reconstruido[1].contenido !== 'Voy a intentar el comando.') {
  console.error('FALLO texto antes de la tool:', reconstruido[1]);
  process.exit(1);
}
if (reconstruido[3].contenido !== 'Falló, lo reintento de otra forma.') {
  console.error('FALLO texto después de la tool:', reconstruido[3]);
  process.exit(1);
}

console.log('OK — round-trip blocks→tags→blocks sin pérdida de orden ni datos');
