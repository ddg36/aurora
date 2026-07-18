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

type ForgePackage = {
  name: string;
  version: string;
  description: string;
  input_schema: Record<string, unknown>;
  permissions?: string[];
  risk?: "low" | "medium" | "high";
  requires_approval?: boolean;
  status?: string;
  docs?: string;
  timeout?: number;
};

type ForgeSyncResult = {
  active: ForgePackage[];
  changed: ForgePackage[];
  removedAliases: string[];
};

const FORGE_PACKAGE_RE = /^forge\.[a-z][a-z0-9_]{2,47}$/;
const FORGE_VERSION_RE = /^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/;

/** Alias compatible con providers; el nombre canónico forge.* queda en details. */
export function forgeToolAlias(name: string): string {
  if (!FORGE_PACKAGE_RE.test(name)) throw new Error(`Nombre Forge inválido: ${name}`);
  return `forge_${name.slice("forge.".length)}`;
}

function activeForgePackages(payload: any): ForgePackage[] {
  return (Array.isArray(payload?.packages) ? payload.packages : [])
    .filter((pkg: any) => pkg?.status === "active")
    .filter((pkg: any) => FORGE_PACKAGE_RE.test(String(pkg?.name || "")))
    .filter((pkg: any) => FORGE_VERSION_RE.test(String(pkg?.version || "")))
    .filter((pkg: any) => pkg?.input_schema?.type === "object");
}

function forgeResultContent(json: any): Array<any> {
  if (Array.isArray(json?.content)) {
    const safe = json.content.filter((item: any) =>
      (item?.type === "text" && typeof item.text === "string") ||
      (item?.type === "image" && typeof item.data === "string" && typeof item.mimeType === "string")
    );
    if (safe.length) return safe;
  }
  if (typeof json?.text === "string") return [{ type: "text", text: json.text }];
  return [{ type: "text", text: JSON.stringify(json?.data ?? json, null, 2) }];
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
  const registeredForgeVersions = new Map<string, string>();
  let forgeSyncInFlight: Promise<ForgeSyncResult> | null = null;

  const registerForgeTool = (pkg: ForgePackage): boolean => {
    const alias = forgeToolAlias(pkg.name);
    if (registeredForgeVersions.get(alias) === pkg.version) return false;

    const permissions = Array.isArray(pkg.permissions) ? pkg.permissions : [];
    const versioned = `${pkg.name}@${pkg.version}`;

    pi.registerTool({
      name: alias,
      label: `${pkg.name} · v${pkg.version}`,
      description: `${pkg.description} Capacidad Tool Forge aprobada y activa (${versioned}).`,
      promptSnippet: `${pkg.description} [${versioned}]`,
      promptGuidelines: [
        `Use ${alias} directamente cuando necesite la capacidad ${pkg.name}; no use aurora_forge_run si ${alias} está disponible.`,
      ],
      parameters: Type.Unsafe(pkg.input_schema || { type: "object", properties: {} }),
      executionMode: "sequential",
      async execute(_toolCallId, params, signal, onUpdate, ctx) {
        const detailsBase = {
          forge: { name: pkg.name, version: pkg.version, alias },
          risk: pkg.risk || "low",
          permissions,
        };

        let endpoint = "run";
        const payload: Record<string, unknown> = { arguments: params || {} };
        if (pkg.requires_approval) {
          onUpdate?.({
            content: [{ type: "text", text: `Esperando aprobación humana para ${versioned}…` }],
            details: { ...detailsBase, phase: "awaiting_approval" },
          });
          const approved = await ctx.ui.confirm(
            "Tool Forge — aprobación requerida",
            [
              `Ejecutar ${versioned}`,
              `Riesgo: ${pkg.risk || "high"}`,
              `Permisos: ${permissions.join(", ") || "ninguno"}`,
              `Argumentos: ${JSON.stringify(params || {})}`,
            ].join("\n"),
          );
          if (!approved) throw new Error(`Diego rechazó la ejecución de ${versioned}.`);
          endpoint = "approve-run";
          payload.confirmation = `RUN ${pkg.name}`;
        }

        onUpdate?.({
          content: [{ type: "text", text: `Ejecutando ${versioned} en Bubblewrap…` }],
          details: { ...detailsBase, phase: "running" },
        });
        const json = await auroraJson(`/tools/${encodeURIComponent(pkg.name)}/${endpoint}`, {
          method: "POST",
          body: JSON.stringify(payload),
          signal,
        }, Math.max(10_000, Number(pkg.timeout || 120) * 1000 + 5_000));
        if (!json?.ok) {
          if (json?.approval_required) throw new Error(`Aprobación humana requerida para ${versioned}.`);
          throw new Error(json?.error || `${versioned} falló`);
        }
        return {
          content: forgeResultContent(json),
          details: { ...detailsBase, phase: "completed", result: json },
        };
      },
    });
    registeredForgeVersions.set(alias, pkg.version);
    return true;
  };

  const syncForgeTools = async (): Promise<ForgeSyncResult> => {
    if (forgeSyncInFlight) return forgeSyncInFlight;
    forgeSyncInFlight = (async () => {
      const json = await auroraJson("/tools/forge/packages");
      if (!json?.ok) throw new Error(json?.error || "No se pudo leer Tool Forge");

      const active = activeForgePackages(json);
      const currentAliases = new Set(active.map(pkg => forgeToolAlias(pkg.name)));
      const removedAliases = [...registeredForgeVersions.keys()].filter(alias => !currentAliases.has(alias));
      const changed = active.filter(registerForgeTool);

      for (const alias of removedAliases) registeredForgeVersions.delete(alias);

      const activeNames = new Set(pi.getActiveTools());
      let activeSetChanged = false;
      for (const alias of removedAliases) {
        if (activeNames.delete(alias)) activeSetChanged = true;
      }
      for (const alias of currentAliases) {
        if (!activeNames.has(alias)) {
          activeNames.add(alias);
          activeSetChanged = true;
        }
      }
      if (activeSetChanged) pi.setActiveTools([...activeNames]);

      return { active, changed, removedAliases };
    })();
    try {
      return await forgeSyncInFlight;
    } finally {
      forgeSyncInFlight = null;
    }
  };

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
      "Lista las capacidades Tool Forge aprobadas y activas, incluyendo su alias directo dentro de Pi. " +
      "Las capacidades aparecen automáticamente como tools forge_* sin reiniciar la sesión.",
    parameters: Type.Object({}),
    async execute() {
      const { active } = await syncForgeTools();
      const text = active.length
        ? active.map(pkg => {
            const alias = forgeToolAlias(pkg.name);
            return `${alias} → ${pkg.name}@${pkg.version} — ${pkg.description}\n  args: ${JSON.stringify(pkg.input_schema)}${pkg.requires_approval ? "\n  requiere aprobación humana por ejecución" : ""}`;
          }).join("\n\n")
        : "(no hay herramientas Forge activas todavía)";
      return {
        content: [{ type: "text", text }],
        details: { packages: active },
      };
    },
  });

  pi.registerTool({
    name: "aurora_forge_run",
    label: "Tool Forge — ejecutar por nombre",
    description:
      "Fallback para ejecutar una capacidad activa por su nombre canónico forge.*. " +
      "Preferí la tool forge_* directa cuando aparezca en el catálogo de Pi.",
    parameters: Type.Object({
      name: Type.String({ description: "Nombre canónico exacto forge.*" }),
      arguments: Type.Optional(Type.Record(Type.String(), Type.Unknown(), { description: "Argumentos según el contrato" })),
    }),
    executionMode: "sequential",
    async execute(_id, params, signal, onUpdate, ctx) {
      const { active } = await syncForgeTools();
      const pkg = active.find(item => item.name === params.name);
      if (!pkg) throw new Error(`Capacidad Forge no activa: ${params.name}`);

      const versioned = `${pkg.name}@${pkg.version}`;
      let endpoint = "run";
      const payload: Record<string, unknown> = { arguments: params.arguments || {} };
      if (pkg.requires_approval) {
        onUpdate?.({
          content: [{ type: "text", text: `Esperando aprobación humana para ${versioned}…` }],
          details: { phase: "awaiting_approval", package: pkg },
        });
        const approved = await ctx.ui.confirm(
          "Tool Forge — aprobación requerida",
          [
            `Ejecutar ${versioned}`,
            `Riesgo: ${pkg.risk || "high"}`,
            `Permisos: ${(pkg.permissions || []).join(", ") || "ninguno"}`,
            `Argumentos: ${JSON.stringify(params.arguments || {})}`,
          ].join("\n"),
        );
        if (!approved) throw new Error(`Diego rechazó la ejecución de ${versioned}.`);
        endpoint = "approve-run";
        payload.confirmation = `RUN ${pkg.name}`;
      }

      onUpdate?.({
        content: [{ type: "text", text: `Ejecutando ${versioned} en Bubblewrap…` }],
        details: { phase: "running", package: pkg },
      });
      const json = await auroraJson(`/tools/${encodeURIComponent(pkg.name)}/${endpoint}`, {
        method: "POST",
        body: JSON.stringify(payload),
        signal,
      }, Math.max(10_000, Number(pkg.timeout || 120) * 1000 + 5_000));
      if (!json?.ok) {
        if (json?.approval_required) throw new Error(`Aprobación humana requerida para ${versioned}.`);
        throw new Error(json?.error || `${versioned} falló`);
      }
      return {
        content: forgeResultContent(json),
        details: { phase: "completed", package: pkg, result: json },
      };
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

  // Sincronización Pi-native: una activación en Toolkit se incorpora antes
  // del siguiente turno y registerTool refresca el registry sin reiniciar Pi.
  pi.on("session_start", async (_event, ctx) => {
    try {
      const { active } = await syncForgeTools();
      if (active.length) {
        ctx.ui.notify(`Tool Forge: ${active.length} capacidad(es) activa(s) incorporadas`, "info");
      }
    } catch (err: any) {
      ctx.ui.notify(`Tool Forge no pudo sincronizarse: ${err.message}`, "warning");
    }
  });

  pi.on("before_agent_start", async event => {
    try {
      const { changed, removedAliases } = await syncForgeTools();
      if (!changed.length && !removedAliases.length) return;

      const added = changed.map(pkg =>
        `- ${forgeToolAlias(pkg.name)} → ${pkg.name}@${pkg.version}: ${pkg.description}`
      );
      const removed = removedAliases.map(alias => `- ${alias} fue desactivada`);
      return {
        systemPrompt: [
          event.systemPrompt,
          "",
          "[Tool Forge — capacidades sincronizadas en caliente]",
          ...added,
          ...removed,
          "Use las tools forge_* directamente por su alias Pi; Aurora conserva versión, permisos, evidencia y aprobación humana.",
        ].join("\n"),
      };
    } catch (err) {
      console.warn("aurora-tools: sync Forge falló", err);
    }
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

  pi.registerCommand("forge-refresh", {
    description: "Sincroniza las capacidades Tool Forge activas con el registry de Pi",
    handler: async (_args, ctx) => {
      try {
        const { active, changed, removedAliases } = await syncForgeTools();
        ctx.ui.notify(
          `Tool Forge: ${active.length} activa(s), ${changed.length} incorporada(s)/actualizada(s), ${removedAliases.length} desactivada(s)`,
          "info",
        );
      } catch (err: any) {
        ctx.ui.notify(`Tool Forge no pudo sincronizarse: ${err.message}`, "warning");
      }
    },
  });

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
