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

async function extCmd(cmd: string, params: Record<string, unknown> = {}, timeout = 25): Promise<any> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/ext/cmd`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
