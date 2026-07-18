/**
 * Lyria Test: Import Directo de TOOLS DE PI (Completas)
 *
 * Propósito: Verificar que TODAS las factory functions de Pi se pueden importar
 * y ejecutar directamente sin RPC, sin subprocesos, sin LLM de Pi.
 *
 * Tools a probar:
 * - bash: ejecuta comandos shell
 * - read: lee archivos
 * - edit: edita archivos (diff)
 * - write: escribe archivos
 * - grep: busca patrones en archivos
 * - find: busca archivos por patrón
 * - ls: lista directorio
 *
 * Autor: Lyria 💙🦊
 * Fecha: 2025-07-17
 */

// Importación dinámica (ESM no permite variables en import static)
const PI_SDK_PATH = "/home/deml/.bun/install/global/node_modules/@earendil-works/pi-coding-agent/dist/core/sdk.js";
const {
  createBashTool,
  createReadTool,
  createEditTool,
  createWriteTool,
  createGrepTool,
  createFindTool,
  createLsTool
} = await import(PI_SDK_PATH);

// Directorio de prueba (usamos el folder actual)
const testDir = new URL(import.meta.url).pathname.replace(/test-import-pi-tools\.mjs$/, "");
console.log("📂 Directorio de prueba:", testDir);
console.log("");

// Inicialización única de tools
const tools = {
  bash: createBashTool(testDir, {}),
  read: createReadTool(testDir, {}),
  edit: createEditTool(testDir, {}),
  write: createWriteTool(testDir, {}),
  grep: createGrepTool(testDir, {}),
  find: createFindTool(testDir, {}),
  ls: createLsTool(testDir, {}),
};

console.log("✅ Factory functions importadas exitosamente");
console.log("✅ 7 tools inicializadas con cwd:", testDir);
console.log("");

// Helper para ejecutar tools
async function runTool(tool, params) {
  const toolCallId = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return await tool.execute(toolCallId, params, null, null);
}

// Helper para mostrar resultados
function showResult(result, maxChars = 200) {
  const text = result.content?.[0]?.text || "(no content)";
  return text.length > maxChars ? text.substring(0, maxChars) + "..." : text;
}

let passed = 0;
let failed = 0;

// Test 1: Bash tool
console.log("🧪 Test 1: Bash (ls -la)");
try {
  const result = await runTool(tools.bash, { command: "ls -la" });
  console.log("✅ PASSED - Resultado:", showResult(result));
  passed++;
} catch (error) {
  console.error("❌ FAILED -", error.message);
  failed++;
}
console.log("");

// Test 2: Read tool
console.log("🧪 Test 2: Read (leer test actual)");
try {
  const testFile = `${testDir}test-import-pi-tools.mjs`;
  const result = await runTool(tools.read, { path: testFile });
  console.log("✅ PASSED - Resultado:", showResult(result));
  passed++;
} catch (error) {
  console.error("❌ FAILED -", error.message);
  failed++;
}
console.log("");

// Test 3: Write tool
console.log("🧪 Test 3: Write (crear archivo temporal)");
try {
  const testFile = `${testDir}lyria-test-write.txt`;
  const content = "Lyria dice: ¡Write funciona! 💙🦊";
  const result = await runTool(tools.write, { path: testFile, content: content });
  console.log("✅ PASSED - Resultado:", showResult(result));
  // Cleanup
  await runTool(tools.bash, { command: `rm -f "${testFile}"` });
  passed++;
} catch (error) {
  console.error("❌ FAILED -", error.message);
  failed++;
}
console.log("");

// Test 4: Edit tool
console.log("🧪 Test 4: Edit (editar archivo temporal)");
try {
  const testFile = `${testDir}lyria-test-edit.txt`;
  // Primero crear archivo
  await runTool(tools.write, { path: testFile, content: "Línea original\n" });
  // Luego editar (edit necesita array de edits con oldText/newText)
  const result = await runTool(tools.edit, {
    path: testFile,
    edits: [{ oldText: "Línea original", newText: "Línea editada por Lyria 💋" }]
  });
  console.log("✅ PASSED - Resultado:", showResult(result));
  // Cleanup
  await runTool(tools.bash, { command: `rm -f "${testFile}"` });
  passed++;
} catch (error) {
  console.error("❌ FAILED -", error.message);
  failed++;
}
console.log("");

// Test 5: Grep tool
console.log("🧪 Test 5: Grep (buscar patrones)");
try {
  const result = await runTool(tools.grep, {
    pattern: "export function",
    path: testDir
  });
  console.log("✅ PASSED - Resultado:", showResult(result));
  passed++;
} catch (error) {
  console.error("❌ FAILED -", error.message);
  failed++;
}
console.log("");

// Test 6: Find tool
console.log("🧪 Test 6: Find (buscar archivos)");
try {
  const result = await runTool(tools.find, {
    pattern: "*.mjs",
    path: testDir
  });
  console.log("✅ PASSED - Resultado:", showResult(result));
  passed++;
} catch (error) {
  console.error("❌ FAILED -", error.message);
  failed++;
}
console.log("");

// Test 7: Ls tool
console.log("🧪 Test 7: Ls (listar directorio)");
try {
  const result = await runTool(tools.ls, { path: testDir });
  console.log("✅ PASSED - Resultado:", showResult(result));
  passed++;
} catch (error) {
  console.error("❌ FAILED -", error.message);
  failed++;
}
console.log("");

// Resumen final
console.log("═".repeat(50));
console.log(`✨ Tests completados: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log("🎉 TODAS LAS TOOLS DE PI FUNCIONAN CON IMPORT DIRECTO ✅");
} else {
  console.log("⚠️  Algunas tools fallaron. Revisar errores arriba.");
}
console.log("═".repeat(50));
