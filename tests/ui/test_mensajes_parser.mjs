// Verifica que parsearMensajeRico + combinarPartesRicas preserven el orden
// cronológico real (texto → tool → texto) y no arrastren bugs de nombre/error.
// Correr: bun tests/ui/test_mensajes_parser.mjs

globalThis.preactSignals = {
  signal(v) { let val = v; return { get value() { return val; }, set value(nv) { val = nv; } }; },
  computed(fn) { return { get value() { return fn(); } }; },
};

const { parsearMensajeRico, combinarPartesRicas } = await import(
  '../../ui/modules/lyra/scripts/chat/mensajes.js'
);

const contenido = [
  '[thinking]',
  'pensando el problema',
  '[/thinking]',
  'Voy a revisar el archivo.',
  '',
  '[tool_call:read]',
  '{"path":"a.txt"}',
  '[/tool_call:read]',
  '[tool_result:read]',
  'contenido del archivo',
  '[/tool_result:read]',
  '',
  'Ahora corro un comando que falla.',
  '',
  '[tool_call:bash]',
  '{"command":"false"}',
  '[/tool_call:bash]',
  '[tool_result:bash:error]',
  'exit code 1',
  '[/tool_result:bash]',
  '',
  'Listo.',
].join('\n');

const parsed = parsearMensajeRico(contenido);
const combinado = combinarPartesRicas(parsed);
const tipos = combinado.map(p => p.tipo);

const esperado = ['thinking', 'text', 'tool', 'text', 'tool', 'text'];
if (JSON.stringify(tipos) !== JSON.stringify(esperado)) {
  console.error('FALLO orden:', tipos, 'esperado:', esperado);
  process.exit(1);
}

const toolRead = combinado[2];
if (toolRead.nombre !== 'read') { console.error('FALLO nombre tool read:', toolRead.nombre); process.exit(1); }
if (toolRead.isError) { console.error('FALLO: read no debería ser error'); process.exit(1); }
if (toolRead.output !== 'contenido del archivo') { console.error('FALLO output read:', toolRead.output); process.exit(1); }

const toolBash = combinado[4];
if (toolBash.nombre !== 'bash') { console.error('FALLO nombre tool bash:', toolBash.nombre); process.exit(1); }
if (!toolBash.isError) { console.error('FALLO: bash debería ser error'); process.exit(1); }
if (toolBash.output !== 'exit code 1') { console.error('FALLO output bash:', toolBash.output); process.exit(1); }

console.log('OK — orden cronológico preservado, nombres limpios, isError correcto');
