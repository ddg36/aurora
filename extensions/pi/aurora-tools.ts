/**
 * aurora-tools — extensión pi que expone el entorno Aurora al agente.
 *
 * Tools (el LLM las llama solo):
 *   aurora_yt_transcript — transcript + metadata del video de YouTube abierto en Chrome
 *   aurora_page_capture  — texto de la pestaña activa de Chrome
 *   aurora_tabs          — lista de pestañas abiertas
 *   aurora_screenshot    — screenshot PNG de la pestaña activa
 *
 * Flags (inyectan contenido al contexto al arrancar, sin que el LLM lo pida):
 *   --aurora-yt-transcript   pi --aurora-yt-transcript "resumí el video"
 *   --aurora-page            pi --aurora-page "qué dice esta página"
 *
 * Comandos: /aurora-yt  /aurora-page
 *
 * Requiere: Aurora server corriendo (:7779) + Chrome con la extensión aihub conectada.
 * La misma extensión sirve a pi CLI y a pi bajo Aurora (modo RPC).
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const BASE = process.env.AURORA_URL || "http://localhost:7779";

// Aurora inyecta AURORA_TOKEN al spawnear pi (modo RPC). Para pi CLI a mano:
// exportar AURORA_TOKEN con el token de usuario (localStorage aurora_token).
// Sin token el guard global de Aurora devuelve 401 en /ext/* y /tools/*.
const TOKEN = process.env.AURORA_TOKEN || "";

function headers(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
  };
}

async function extCmd(cmd: string, params: Record<string, unknown> = {}, timeout = 25): Promise<any> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/ext/cmd`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ cmd, params, timeout }),
    });
  } catch (err: any) {
    throw new Error(`Aurora no responde en ${BASE} (¿server apagado?): ${err.message}`);
  }
  if (!res.ok) throw new Error(`Aurora HTTP ${res.status}`);
  const json = await res.json();
  if (!json.ok) {
    throw new Error(`${json.error || "ext_cmd falló"} (¿Chrome abierto con la extensión aihub conectada?)`);
  }
  return json.data;
}

async function auroraJson(path: string, init: RequestInit = {}, timeoutMs = 120_000): Promise<any> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { ...headers(), ...((init.headers as Record<string, string>) || {}) },
      signal: init.signal || AbortSignal.timeout(timeoutMs),
    });
  } catch (err: any) {
    throw new Error(`Aurora no responde en ${BASE}: ${err.message}`);
  }
  if (!res.ok) throw new Error(`Aurora HTTP ${res.status}`);
  return await res.json();
}

async function ytTranscript(timestamps: boolean): Promise<string> {
  const data = await extCmd("capture_youtube", { type: timestamps ? "withTimestamps" : "withoutTimestamps" }, 30);
  if (!data?.content) throw new Error(data?.error || "Sin transcript disponible");
  const m = data.metadata || {};
  const cab = [m.title && `Título: ${m.title}`, m.channel && `Canal: ${m.channel}`, m.videoId && `URL: https://youtube.com/watch?v=${m.videoId}`]
    .filter(Boolean).join("\n");
  return `${cab}\n\n${data.content}`;
}

async function pageCapture(): Promise<string> {
  const data = await extCmd("capture_active_tab");
  const tab = data?.tab || {};
  return `Título: ${tab.title || "?"}\nURL: ${tab.url || "?"}\n\n${data?.text || "(página sin texto)"}`;
}

export default function (pi: ExtensionAPI) {
  // ── tools ───────────────────────────────────────────

  pi.registerTool({
    name: "aurora_yt_transcript",
    label: "YT Transcript",
    description:
      "Obtiene el transcript y metadata del video de YouTube abierto en la pestaña activa de Chrome. " +
      "No necesita URL: captura lo que el usuario está mirando.",
    parameters: Type.Object({
      timestamps: Type.Optional(Type.Boolean({ description: "Incluir marcas de tiempo (default: false)" })),
    }),
    async execute(_id, params) {
      const texto = await ytTranscript(!!params.timestamps);
      return { content: [{ type: "text", text: texto }], details: {} };
    },
  });

  pi.registerTool({
    name: "aurora_page_capture",
    label: "Captura de página",
    description:
      "Captura el texto visible (DOM) de la pestaña activa de Chrome, con título y URL. " +
      "Usar aurora_page_capture cuando el usuario pregunte por 'esta página' o lo que está viendo.",
    parameters: Type.Object({}),
    async execute() {
      const texto = await pageCapture();
      return { content: [{ type: "text", text: texto }], details: {} };
    },
  });

  pi.registerTool({
    name: "aurora_tabs",
    label: "Pestañas Chrome",
    description: "Lista las pestañas abiertas en Chrome (título + URL).",
    parameters: Type.Object({}),
    async execute() {
      const data = await extCmd("tabs_list");
      const lineas = (data?.tabs || []).map((t: any) => `${t.active ? "→ " : "  "}${t.title}\n    ${t.url}`);
      return { content: [{ type: "text", text: lineas.join("\n") || "(sin pestañas)" }], details: {} };
    },
  });

  pi.registerTool({
    name: "aurora_screenshot",
    label: "Screenshot",
    description: "Screenshot PNG de la pestaña activa de Chrome. Usar aurora_screenshot para contenido visual que el texto no captura.",
    parameters: Type.Object({}),
    async execute() {
      const data = await extCmd("screenshot");
      const dataUrl: string = data?.dataUrl || "";
      const b64 = dataUrl.split(";base64,")[1];
      if (!b64) throw new Error("Screenshot vacío");
      return {
        content: [{ type: "image", data: b64, mimeType: "image/png" }],
        details: { tab: data?.tab || {} },
      };
    },
  });

  pi.registerTool({
    name: "aurora_browser_task",
    label: "Agente de browser",
    description:
      "Ejecuta una tarea de navegación web autónoma (navegar, clic, escribir, extraer) " +
      "hasta cumplir el objetivo. Usar para tareas que requieren interactuar con páginas web, " +
      "no para preguntas de conocimiento. Puede tardar minutos.",
    parameters: Type.Object({
      objective: Type.String({ description: "Objetivo en lenguaje natural, específico y verificable" }),
      max_steps: Type.Optional(Type.Integer({ description: "Tope de pasos del agente (default 30, máx 100)" })),
    }),
    async execute(_id, params) {
      const res = await fetch(`${BASE}/tools/browser_task/run`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ arguments: { objective: params.objective, max_steps: params.max_steps ?? 30 } }),
        signal: AbortSignal.timeout(10 * 60 * 1000),
      });
      if (!res.ok) throw new Error(`Aurora HTTP ${res.status}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "browser_task falló");
      return { content: [{ type: "text", text: json.resultado || "completado" }], details: {} };
    },
  });

  pi.registerTool({
    name: "aurora_ask_cloud",
    label: "Preguntar a la nube",
    description:
      "Le pregunta al LLM de la nube (Gemini/ChatGPT/Claude, el que el usuario tenga abierto " +
      "en el panel ☁ Cloud de Aurora) y devuelve su respuesta. Usar para una segunda opinión " +
      "de otro modelo o comparar respuestas. Requiere el panel Cloud abierto.",
    parameters: Type.Object({
      prompt: Type.String({ description: "Qué preguntarle al LLM de la nube" }),
      ai: Type.Optional(Type.String({ description: "Pista del modelo (gemini/chatgpt/claude); usa el panel abierto" })),
    }),
    async execute(_id, params) {
      const res = await fetch(`${BASE}/tools/ask_cloud/run`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ arguments: { prompt: params.prompt, ai: params.ai } }),
        signal: AbortSignal.timeout(110 * 1000),
      });
      if (!res.ok) throw new Error(`Aurora HTTP ${res.status}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "ask_cloud falló");
      return { content: [{ type: "text", text: json.respuesta || "(sin respuesta)" }], details: {} };
    },
  });

  pi.registerTool({
    name: "aurora_forge_list",
    label: "Tool Forge — capacidades",
    description:
      "Lista las herramientas construidas por el colectivo Cloud, probadas, aprobadas y activas en Aurora. " +
      "Usar cuando necesites una capacidad que no aparece entre tus tools habituales.",
    parameters: Type.Object({}),
    async execute() {
      const json = await auroraJson("/tools");
      const tools = (json.tools || []).filter((tool: any) => (tool.tags || []).includes("forge"));
      const text = tools.length
        ? tools.map((tool: any) => `${tool.name} — ${tool.description}\n  args: ${JSON.stringify(tool.input_schema)}${tool.requires_approval ? "\n  requiere aprobación por ejecución" : ""}`).join("\n\n")
        : "(no hay herramientas Forge activas todavía)";
      return { content: [{ type: "text", text }], details: { tools } };
    },
  });

  pi.registerTool({
    name: "aurora_forge_run",
    label: "Tool Forge — ejecutar",
    description:
      "Ejecuta una herramienta activa creada por Tool Forge. Primero usa aurora_forge_list para conocer " +
      "el nombre exacto y su contrato. Sólo admite nombres forge.* y respeta permisos/aprobaciones de Aurora.",
    parameters: Type.Object({
      name: Type.String({ description: "Nombre exacto forge.*" }),
      arguments: Type.Optional(Type.Record(Type.String(), Type.Unknown(), { description: "Argumentos según el contrato" })),
    }),
    async execute(_id, params) {
      if (!/^forge\.[a-z][a-z0-9_]{2,47}$/.test(params.name)) throw new Error("Nombre Forge inválido");
      const json = await auroraJson(`/tools/${encodeURIComponent(params.name)}/run`, {
        method: "POST",
        body: JSON.stringify({ arguments: params.arguments || {} }),
      });
      if (!json.ok) {
        if (json.approval_required) throw new Error("La herramienta requiere aprobación humana para esta ejecución.");
        throw new Error(json.error || "La herramienta Forge falló");
      }
      const text = json.text || JSON.stringify(json.data ?? json, null, 2);
      return { content: [{ type: "text", text }], details: json };
    },
  });

  pi.registerTool({
    name: "aurora_forge_build",
    label: "Tool Forge — construir con Cloud",
    description:
      "Convoca Gemini/ChatGPT en el Duo Cloud para diseñar, revisar e implementar una nueva herramienta " +
      "cuando Lyra detecta una capacidad que le falta. Devuelve un paquete probado; Diego debe aprobarlo y activarlo después.",
    parameters: Type.Object({
      objective: Type.String({ description: "Capacidad concreta y resultado verificable que necesitas" }),
      name_hint: Type.Optional(Type.String({ description: "Nombre sugerido forge.nombre" })),
      requirements: Type.Optional(Type.Array(Type.String())),
      acceptance_tests: Type.Optional(Type.Array(Type.String())),
    }),
    async execute(_id, params) {
      const json = await auroraJson("/tools/forge_build/run", {
        method: "POST",
        body: JSON.stringify({ arguments: params }),
      }, 11 * 60 * 1000);
      if (!json.ok) throw new Error(json.error || "El colectivo Cloud no produjo una herramienta probada");
      return { content: [{ type: "text", text: json.text || `Paquete probado: ${json.package?.name || "Forge"}` }], details: json };
    },
  });

  pi.registerTool({
    name: "aurora_view_describe",
    label: "Aurora — descubrir vista",
    description:
      "Descubre acciones semánticas publicadas por una vista de Aurora. La monta si hace falta; " +
      "usar antes de aurora_view_invoke para no depender de botones o del DOM.",
    parameters: Type.Object({
      view: Type.Optional(Type.String({ description: "Vista opcional: canvas, scratchpad o md-reader" })),
    }),
    async execute(_id, params) {
      const json = await auroraJson("/tools/view_describe/run", {
        method: "POST", body: JSON.stringify({ arguments: params }),
      });
      if (!json.ok) throw new Error(json.error || "No se pudo describir la vista");
      return { content: [{ type: "text", text: JSON.stringify(json.result ?? json, null, 2) }], details: json };
    },
  });

  pi.registerTool({
    name: "aurora_view_invoke",
    label: "Aurora — acción de vista",
    description:
      "Invoca una acción nativa de Aurora por view/action. No simula clics. Las acciones sensibles " +
      "siguen bloqueadas hasta recibir aprobación humana en Aurora.",
    parameters: Type.Object({
      view: Type.String({ description: "ID exacto obtenido con aurora_view_describe" }),
      action: Type.String({ description: "Acción exacta publicada por la vista" }),
      args: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    }),
    async execute(_id, params) {
      const json = await auroraJson("/tools/view_invoke/run", {
        method: "POST", body: JSON.stringify({ arguments: params }),
      });
      if (!json.ok) {
        if (json.requiresApproval) throw new Error(`Aprobación humana requerida: ${params.view}.${params.action}`);
        throw new Error(json.error || "La acción de vista falló");
      }
      return { content: [{ type: "text", text: JSON.stringify(json.result ?? json, null, 2) }], details: json };
    },
  });

  // ── flags: inyectan contexto al arrancar ────────────

  pi.registerFlag("aurora-yt-transcript", {
    description: "Inyecta el transcript del video de YouTube abierto en Chrome al contexto",
    type: "boolean",
    default: false,
  });

  pi.registerFlag("aurora-page", {
    description: "Inyecta el texto de la pestaña activa de Chrome al contexto",
    type: "boolean",
    default: false,
  });

  let inyectado = false;
  pi.on("session_start", async (_event, ctx) => {
    if (inyectado) return;
    inyectado = true;
    const tareas: Array<[string, () => Promise<string>]> = [];
    if (pi.getFlag("aurora-yt-transcript")) tareas.push(["transcript YouTube", () => ytTranscript(false)]);
    if (pi.getFlag("aurora-page")) tareas.push(["captura de página", () => pageCapture()]);

    for (const [nombre, fn] of tareas) {
      try {
        const texto = await fn();
        pi.sendMessage(
          { customType: "aurora-tools", content: `[Contexto Aurora — ${nombre}]\n\n${texto}`, display: true },
          { deliverAs: "nextTurn" },
        );
        ctx.ui.notify(`aurora-tools: ${nombre} inyectado`, "info");
      } catch (err: any) {
        ctx.ui.notify(`aurora-tools: ${nombre} falló — ${err.message}`, "warning");
      }
    }
  });

  // ── comandos manuales ───────────────────────────────

  pi.registerCommand("aurora-yt", {
    description: "Trae el transcript del video de YouTube abierto y lo agrega al contexto",
    handler: async (_args, ctx) => {
      const texto = await ytTranscript(false);
      pi.sendMessage(
        { customType: "aurora-tools", content: `[Contexto Aurora — transcript YouTube]\n\n${texto}`, display: true },
        { deliverAs: "nextTurn" },
      );
      ctx.ui.notify("Transcript agregado al contexto", "info");
    },
  });

  pi.registerCommand("aurora-page", {
    description: "Captura la pestaña activa de Chrome y la agrega al contexto",
    handler: async (_args, ctx) => {
      const texto = await pageCapture();
      pi.sendMessage(
        { customType: "aurora-tools", content: `[Contexto Aurora — captura de página]\n\n${texto}`, display: true },
        { deliverAs: "nextTurn" },
      );
      ctx.ui.notify("Página agregada al contexto", "info");
    },
  });
}
