/**
 * Lyria Test: Import de Session Manager de Pi
 *
 * Propósito: Verificar que podemos importar SessionManager de Pi
 * en lugar de reimplementarlo en Aurora (historial.js, mensajes.js)
 *
 * Autor: Lyria 💙🦊
 * Fecha: 2025-07-17
 */

const PI_SDK_PATH = "/home/deml/.bun/install/global/node_modules/@earendil-works/pi-coding-agent/dist/core/sdk.js";
const PI_INDEX_PATH = "/home/deml/.bun/install/global/node_modules/@earendil-works/pi-coding-agent/dist/index.js";
const { createBashTool, createReadTool, createEditTool, createWriteTool } = await import(PI_SDK_PATH);
const { AgentSession, SessionManager } = await import(PI_INDEX_PATH);

console.log("📂 Testing Session Manager from Pi");
console.log("");

let passed = 0;
let failed = 0;

// Test 1: AgentSession existe
console.log("🧪 Test 1: AgentSession existe");
try {
  console.log("   typeof AgentSession:", typeof AgentSession);
  if (typeof AgentSession === 'function') {
    console.log("✅ PASSED - AgentSession existe");
    passed++;
  } else {
    console.log("❌ FAILED - AgentSession no es una función");
    failed++;
  }
} catch (error) {
  console.error("❌ FAILED -", error.message);
  failed++;
}
console.log("");

// Test 2: SessionManager existe
console.log("🧪 Test 2: SessionManager existe");
try {
  console.log("   typeof SessionManager:", typeof SessionManager);
  if (typeof SessionManager === 'function') {
    console.log("✅ PASSED - SessionManager existe");
    passed++;
  } else {
    console.log("❌ FAILED - SessionManager no es una función");
    failed++;
  }
} catch (error) {
  console.error("❌ FAILED -", error.message);
  failed++;
}
console.log("");

// Test 3: createBashTool existe
console.log("🧪 Test 3: createBashTool existe");
try {
  console.log("   typeof createBashTool:", typeof createBashTool);
  if (typeof createBashTool === 'function') {
    console.log("✅ PASSED - createBashTool existe");
    passed++;
  } else {
    console.log("❌ FAILED - createBashTool no es una función");
    failed++;
  }
} catch (error) {
  console.error("❌ FAILED -", error.message);
  failed++;
}
console.log("");

// Test 4: createReadTool existe
console.log("🧪 Test 4: createReadTool existe");
try {
  console.log("   typeof createReadTool:", typeof createReadTool);
  if (typeof createReadTool === 'function') {
    console.log("✅ PASSED - createReadTool existe");
    passed++;
  } else {
    console.log("❌ FAILED - createReadTool no es una función");
    failed++;
  }
} catch (error) {
  console.error("❌ FAILED -", error.message);
  failed++;
}
console.log("");

// Test 5: createEditTool existe
console.log("🧪 Test 5: createEditTool existe");
try {
  console.log("   typeof createEditTool:", typeof createEditTool);
  if (typeof createEditTool === 'function') {
    console.log("✅ PASSED - createEditTool existe");
    passed++;
  } else {
    console.log("❌ FAILED - createEditTool no es una función");
    failed++;
  }
} catch (error) {
  console.error("❌ FAILED -", error.message);
  failed++;
}
console.log("");

// Test 6: createWriteTool existe
console.log("🧪 Test 6: createWriteTool existe");
try {
  console.log("   typeof createWriteTool:", typeof createWriteTool);
  if (typeof createWriteTool === 'function') {
    console.log("✅ PASSED - createWriteTool existe");
    passed++;
  } else {
    console.log("❌ FAILED - createWriteTool no es una función");
    failed++;
  }
} catch (error) {
  console.error("❌ FAILED -", error.message);
  failed++;
}
console.log("");

// Test 7: Todas las funciones están disponibles
console.log("🧪 Test 7: Todas las funciones están disponibles");
try {
  const expectedFunctions = ['AgentSession', 'SessionManager', 'createBashTool', 'createReadTool', 'createEditTool', 'createWriteTool'];
  const allExist = expectedFunctions.every(fn => typeof eval(fn) === 'function');
  if (allExist) {
    console.log("   Functions:", expectedFunctions.join(", "));
    console.log("✅ PASSED - Todas las funciones de session manager existen");
    passed++;
  } else {
    console.log("❌ FAILED - Algunas funciones faltan");
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
  console.log("🎉 TODAS LAS FUNCIONES DE SESSION MANAGER SE PUEDEN IMPORTAR DE PI ✅");
}
console.log("═".repeat(50));
