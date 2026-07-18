/**
 * Lyria Test: Import de Tool Definitions de Pi
 *
 * Propósito: Verificar que podemos importar las tool definitions de Pi
 * en lugar de hardcodearlas en cloud.js
 *
 * Autor: Lyria 💙🦊
 * Fecha: 2025-07-17
 */

const PI_TOOLS_PATH = "/home/deml/.bun/install/global/node_modules/@earendil-works/pi-coding-agent/dist/core/tools/index.js";
const { createToolDefinition, allToolNames, createBashToolDefinition, createReadToolDefinition, createEditToolDefinition, createWriteToolDefinition } = await import(PI_TOOLS_PATH);

const testDir = "/media/almacen/deml/Downloads/core_instruction/aurora/tests/lyria-test/import-pi-tools/";
console.log("📂 Test Directory:", testDir);
console.log("");

let passed = 0;
let failed = 0;

// Test 1: allToolNames existe y tiene las tools correctas
console.log("🧪 Test 1: allToolNames existe y tiene las tools correctas");
try {
  console.log("   allToolNames:", Array.from(allToolNames));
  const expected = new Set(["read", "bash", "edit", "write", "grep", "find", "ls"]);
  const match = allToolNames.size === expected.size &&
                [...expected].every(t => allToolNames.has(t));
  if (match) {
    console.log("✅ PASSED - allToolNames tiene las 7 tools correctas");
    passed++;
  } else {
    console.log("❌ FAILED - allToolNames no coincide");
    failed++;
  }
} catch (error) {
  console.error("❌ FAILED -", error.message);
  failed++;
}
console.log("");

// Test 2: createToolDefinition funciona para cada tool
console.log("🧪 Test 2: createToolDefinition funciona para cada tool");
try {
  const toolsToTest = ["bash", "read", "write", "edit"];
  for (const toolName of toolsToTest) {
    const def = createToolDefinition(toolName, testDir, {});
    console.log(`   ${toolName}: name=${def.name}, hasParams=${!!def.parameters}`);
    if (!def.name || !def.parameters) {
      throw new Error(`Tool ${toolName} no tiene name o parameters`);
    }
  }
  console.log("✅ PASSED - createToolDefinition funciona para todas las tools");
  passed++;
} catch (error) {
  console.error("❌ FAILED -", error.message);
  failed++;
}
console.log("");

// Test 3: createBashToolDefinition tiene el schema correcto
console.log("🧪 Test 3: createBashToolDefinition tiene el schema correcto");
try {
  const bashDef = createBashToolDefinition(testDir, {});
  console.log("   bashDef.name:", bashDef.name);
  console.log("   bashDef.parameters:", JSON.stringify(bashDef.parameters, null, 2).substring(0, 200));
  if (bashDef.name === "bash" && bashDef.parameters) {
    console.log("✅ PASSED - Bash tool definition correcta");
    passed++;
  } else {
    console.log("❌ FAILED - Bash tool definition incorrecta");
    failed++;
  }
} catch (error) {
  console.error("❌ FAILED -", error.message);
  failed++;
}
console.log("");

// Test 4: createReadToolDefinition tiene el schema correcto
console.log("🧪 Test 4: createReadToolDefinition tiene el schema correcto");
try {
  const readDef = createReadToolDefinition(testDir, {});
  console.log("   readDef.name:", readDef.name);
  console.log("   readDef.parameters:", JSON.stringify(readDef.parameters, null, 2).substring(0, 200));
  if (readDef.name === "read" && readDef.parameters) {
    console.log("✅ PASSED - Read tool definition correcta");
    passed++;
  } else {
    console.log("❌ FAILED - Read tool definition incorrecta");
    failed++;
  }
} catch (error) {
  console.error("❌ FAILED -", error.message);
  failed++;
}
console.log("");

// Test 5: createWriteToolDefinition tiene el schema correcto
console.log("🧪 Test 5: createWriteToolDefinition tiene el schema correcto");
try {
  const writeDef = createWriteToolDefinition(testDir, {});
  console.log("   writeDef.name:", writeDef.name);
  console.log("   writeDef.parameters:", JSON.stringify(writeDef.parameters, null, 2).substring(0, 200));
  if (writeDef.name === "write" && writeDef.parameters) {
    console.log("✅ PASSED - Write tool definition correcta");
    passed++;
  } else {
    console.log("❌ FAILED - Write tool definition incorrecta");
    failed++;
  }
} catch (error) {
  console.error("❌ FAILED -", error.message);
  failed++;
}
console.log("");

// Test 6: createEditToolDefinition tiene el schema correcto
console.log("🧪 Test 6: createEditToolDefinition tiene el schema correcto");
try {
  const editDef = createEditToolDefinition(testDir, {});
  console.log("   editDef.name:", editDef.name);
  console.log("   editDef.parameters:", JSON.stringify(editDef.parameters, null, 2).substring(0, 200));
  if (editDef.name === "edit" && editDef.parameters) {
    console.log("✅ PASSED - Edit tool definition correcta");
    passed++;
  } else {
    console.log("❌ FAILED - Edit tool definition incorrecta");
    failed++;
  }
} catch (error) {
  console.error("❌ FAILED -", error.message);
  failed++;
}
console.log("");

console.log("═".repeat(50));
console.log(`✨ Tests completados: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log("🎉 TODAS LAS TOOL DEFINITIONS SE PUEDEN IMPORTAR DE PI ✅");
}
console.log("═".repeat(50));
