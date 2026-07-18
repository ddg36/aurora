import assert from "node:assert/strict";

process.env.AURORA_TOKEN = "test-token";
const { default: extension, forgeToolAlias } = await import("../extensions/pi/aurora-tools.ts");

assert.equal(forgeToolAlias("forge.text_metrics"), "forge_text_metrics");
assert.throws(() => forgeToolAlias("forge.bad-name"), /inválido/);

const handlers = new Map();
const tools = new Map();
const commands = new Map();
const activeNames = [];
let registerCount = 0;

const pi = {
  on(name, fn) {
    const list = handlers.get(name) || [];
    list.push(fn);
    handlers.set(name, list);
  },
  registerTool(tool) {
    registerCount += 1;
    tools.set(tool.name, tool);
    if (!activeNames.includes(tool.name)) activeNames.push(tool.name);
  },
  registerCommand(name, command) { commands.set(name, command); },
  registerFlag() {},
  getFlag() { return false; },
  sendMessage() {},
  sendUserMessage() {},
  appendEntry() {},
  setSessionName() {},
  getSessionName() { return undefined; },
  setLabel() {},
  exec() {},
  getActiveTools() { return [...activeNames]; },
  getAllTools() { return [...tools.values()]; },
  setActiveTools(names) { activeNames.splice(0, activeNames.length, ...names); },
  getCommands() { return [...commands.keys()]; },
};

let packages = [{
  name: "forge.text_metrics",
  version: "1.0.2",
  status: "active",
  description: "Cuenta palabras y líneas de un texto.",
  input_schema: {
    type: "object",
    properties: { text: { type: "string" } },
    required: ["text"],
  },
  permissions: [],
  risk: "low",
  requires_approval: false,
  timeout: 15,
}];

const requests = [];
globalThis.fetch = async (url, init = {}) => {
  const href = String(url);
  requests.push({ url: href, init });
  if (href.endsWith("/tools/forge/packages")) {
    return new Response(JSON.stringify({ ok: true, packages }), { status: 200 });
  }
  if (href.endsWith("/tools/forge.text_metrics/run")) {
    return new Response(JSON.stringify({ ok: true, text: "3 palabras" }), { status: 200 });
  }
  if (href.endsWith("/tools/forge.net_probe/approve-run")) {
    return new Response(JSON.stringify({ ok: true, data: { reachable: true } }), { status: 200 });
  }
  throw new Error(`URL inesperada: ${href}`);
};

extension(pi);
assert.ok(tools.has("aurora_forge_list"));
assert.ok(tools.has("aurora_forge_build"));
assert.ok(commands.has("forge-refresh"));

const notices = [];
const ctx = {
  ui: {
    notify(message, level) { notices.push({ message, level }); },
    confirm: async () => true,
  },
};

for (const fn of handlers.get("session_start") || []) {
  await fn({ type: "session_start" }, ctx);
}
assert.ok(tools.has("forge_text_metrics"), "la capacidad activa debe registrarse directamente en Pi");
assert.ok(activeNames.includes("forge_text_metrics"));
const afterFirstSync = registerCount;

for (const fn of handlers.get("before_agent_start") || []) {
  await fn({ type: "before_agent_start", systemPrompt: "base" }, ctx);
}
assert.equal(registerCount, afterFirstSync, "una sincronización idéntica no debe duplicar tools");

const result = await tools.get("forge_text_metrics").execute(
  "call-1", { text: "uno dos tres" }, undefined, undefined, ctx,
);
assert.equal(result.content[0].text, "3 palabras");
assert.equal(result.details.forge.name, "forge.text_metrics");
assert.equal(result.details.forge.version, "1.0.2");
assert.ok(requests.some(request => request.url.endsWith("/tools/forge.text_metrics/run")));

packages = [...packages, {
  name: "forge.net_probe",
  version: "2.0.0",
  status: "active",
  description: "Comprueba conectividad de un endpoint autorizado.",
  input_schema: {
    type: "object",
    properties: { url: { type: "string" } },
    required: ["url"],
  },
  permissions: ["network"],
  risk: "high",
  requires_approval: true,
  timeout: 30,
}];

let changedPrompt = "";
for (const fn of handlers.get("before_agent_start") || []) {
  const value = await fn({ type: "before_agent_start", systemPrompt: "base" }, ctx);
  if (value?.systemPrompt) changedPrompt = value.systemPrompt;
}
assert.ok(tools.has("forge_net_probe"));
assert.match(changedPrompt, /forge_net_probe/);

const progress = [];
await tools.get("forge_net_probe").execute(
  "call-2",
  { url: "https://example.test" },
  undefined,
  update => progress.push(update),
  ctx,
);
assert.equal(progress[0].details.phase, "awaiting_approval");
assert.equal(progress[1].details.phase, "running");
const approvedRequest = requests.find(request => request.url.endsWith("/tools/forge.net_probe/approve-run"));
assert.ok(approvedRequest, "la capacidad sensible debe usar approve-run");
assert.equal(JSON.parse(approvedRequest.init.body).confirmation, "RUN forge.net_probe");

packages = packages.map(pkg =>
  pkg.name === "forge.text_metrics" ? { ...pkg, version: "1.1.0" } : pkg
);
for (const fn of handlers.get("before_agent_start") || []) {
  await fn({ type: "before_agent_start", systemPrompt: "base" }, ctx);
}
assert.match(tools.get("forge_text_metrics").label, /v1\.1\.0/);

packages = packages.filter(pkg => pkg.name !== "forge.net_probe");
let removedPrompt = "";
for (const fn of handlers.get("before_agent_start") || []) {
  const value = await fn({ type: "before_agent_start", systemPrompt: "base" }, ctx);
  if (value?.systemPrompt) removedPrompt = value.systemPrompt;
}
assert.ok(!activeNames.includes("forge_net_probe"), "una capacidad desactivada debe salir del catálogo activo");
assert.match(removedPrompt, /forge_net_probe fue desactivada/);

await commands.get("forge-refresh").handler("", ctx);
assert.ok(notices.some(item => item.message.includes("Tool Forge")));

console.log("OK — Tool Forge → Pi dinámico: hot-sync, ejecución, aprobación, upgrade y desactivación");
