// Runtime persistente de las tools OFICIALES de pi.
// Protocolo privado JSONL por stdin/stdout. No crea AgentSession, RPC ni LLM.

import readline from 'node:readline';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const sdkCandidates = [
  process.env.AURORA_PI_SDK,
  join(homedir(), '.bun', 'install', 'global', 'node_modules', '@earendil-works', 'pi-coding-agent', 'dist', 'core', 'sdk.js'),
].filter(Boolean);
const sdkPath = sdkCandidates.find(existsSync);
if (!sdkPath) {
  process.stdout.write(JSON.stringify({ fatal: true, error: `Pi SDK no encontrado: ${sdkCandidates.join(', ')}` }) + '\n');
  process.exit(2);
}

const sdk = await import(sdkPath);
const cwd = process.env.AURORA_PI_TOOL_CWD || process.cwd();
const factories = [
  sdk.createReadTool,
  sdk.createBashTool,
  sdk.createEditTool,
  sdk.createWriteTool,
  sdk.createGrepTool,
  sdk.createFindTool,
  sdk.createLsTool,
];
const tools = new Map(factories.map(factory => {
  if (typeof factory !== 'function') throw new Error('La versión instalada de pi no exporta las siete factories requeridas.');
  const tool = factory(cwd, {});
  return [tool.name, tool];
}));
const running = new Map();

function send(value) {
  process.stdout.write(JSON.stringify(value) + '\n');
}

function publicTool(tool) {
  return {
    name: tool.name,
    label: tool.label,
    description: tool.description,
    parameters: tool.parameters,
    executionMode: tool.executionMode || null,
  };
}

function validateSchema(schema = {}, value, path = 'args') {
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return `${path} debe ser objeto JSON`;
    for (const key of schema.required || []) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) return `Falta ${path}.${key}`;
    }
    const properties = schema.properties || {};
    if (schema.additionalProperties === false) {
      const extra = Object.keys(value).find(key => !Object.prototype.hasOwnProperty.call(properties, key));
      if (extra) return `${path}.${extra} no está permitido`;
    }
    for (const [key, item] of Object.entries(value)) {
      if (!properties[key]) continue;
      const error = validateSchema(properties[key], item, `${path}.${key}`);
      if (error) return error;
    }
  } else if (schema.type === 'array') {
    if (!Array.isArray(value)) return `${path} debe ser array`;
    for (let index = 0; index < value.length; index++) {
      const error = validateSchema(schema.items || {}, value[index], `${path}[${index}]`);
      if (error) return error;
    }
  } else if (schema.type === 'string' && typeof value !== 'string') return `${path} debe ser string`;
  else if (schema.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) return `${path} debe ser number`;
  else if (schema.type === 'integer' && !Number.isInteger(value)) return `${path} debe ser integer`;
  else if (schema.type === 'boolean' && typeof value !== 'boolean') return `${path} debe ser boolean`;
  if (schema.enum && !schema.enum.includes(value)) return `${path} debe ser uno de: ${schema.enum.join(', ')}`;
  return null;
}

async function execute(message) {
  const tool = tools.get(message.tool);
  if (!tool) throw new Error(`Tool pi desconocida: ${message.tool}`);
  const args = message.args;
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('args debe ser un objeto JSON.');
  const schemaError = validateSchema(tool.parameters || {}, args);
  if (schemaError) throw new Error(`Argumentos inválidos para ${tool.name}: ${schemaError}.`);
  const controller = new AbortController();
  running.set(message.id, controller);
  try {
    const result = await tool.execute(
      message.callId || message.id,
      args,
      controller.signal,
      update => send({ id: message.id, event: 'update', result: update }),
    );
    return result;
  } finally {
    running.delete(message.id);
  }
}

async function handle(message) {
  const id = String(message?.id || '');
  if (!id) return send({ id, ok: false, error: 'Falta id.' });
  try {
    if (message.method === 'ping') {
      return send({ id, ok: true, result: { ready: true, cwd, sdkPath, tools: tools.size } });
    }
    if (message.method === 'catalog') {
      return send({ id, ok: true, result: { provider: 'pi', cwd, sdkPath, tools: [...tools.values()].map(publicTool) } });
    }
    if (message.method === 'cancel') {
      const target = String(message.targetId || '');
      const controller = running.get(target);
      if (controller) controller.abort();
      return send({ id, ok: true, result: { targetId: target, cancelled: !!controller } });
    }
    if (message.method === 'execute') {
      const result = await execute(message);
      return send({ id, ok: true, result });
    }
    throw new Error(`Método desconocido: ${message.method}`);
  } catch (error) {
    return send({ id, ok: false, error: error?.message || String(error), name: error?.name || 'Error' });
  }
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', line => {
  let message;
  try { message = JSON.parse(line); }
  catch (error) { send({ id: '', ok: false, error: `JSONL inválido: ${error.message}` }); return; }
  void handle(message);
});
rl.on('close', () => {
  for (const controller of running.values()) controller.abort();
  process.exit(0);
});

send({ event: 'ready', ready: true, cwd, sdkPath, tools: tools.size });
