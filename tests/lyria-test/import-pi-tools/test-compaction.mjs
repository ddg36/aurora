/**
 * Lyria Test: Import de Compaction de Pi
 *
 * Propósito: Verificar que podemos importar las funciones de compaction de Pi
 * en lugar de reimplementarlas en Aurora
 *
 * Autor: Lyria 💙🦊
 * Fecha: 2025-07-17
 */

const PI_COMPACTION_PATH = "/home/deml/.bun/install/global/node_modules/@earendil-works/pi-coding-agent/dist/core/compaction/index.js";
const { compact, shouldCompact, generateSummary, estimateTokens, calculateContextTokens, DEFAULT_COMPACTION_SETTINGS } = await import(PI_COMPACTION_PATH);

console.log("📂 Testing Compaction Functions from Pi");
console.log("");

let passed = 0;
let failed = 0;

// Test 1: Compaction settings existen
console.log("🧪 Test 1: DEFAULT_COMPACTION_SETTINGS existen");
try {
  console.log("   DEFAULT_COMPACTION_SETTINGS:", DEFAULT_COMPACTION_SETTINGS);
  if (DEFAULT_COMPACTION_SETTINGS && typeof DEFAULT_COMPACTION_SETTINGS === 'object') {
    console.log("✅ PASSED - Compaction settings existen");
    passed++;
  } else {
    console.log("❌ FAILED - Compaction settings no son un objeto");
    failed++;
  }
} catch (error) {
  console.error("❌ FAILED -", error.message);
  failed++;
}
console.log("");

// Test 2: shouldCompact es una función
console.log("🧪 Test 2: shouldCompact es una función");
try {
  console.log("   typeof shouldCompact:", typeof shouldCompact);
  if (typeof shouldCompact === 'function') {
    console.log("✅ PASSED - shouldCompact es una función");
    passed++;
  } else {
    console.log("❌ FAILED - shouldCompact no es una función");
    failed++;
  }
} catch (error) {
  console.error("❌ FAILED -", error.message);
  failed++;
}
console.log("");

// Test 3: compact es una función
console.log("🧪 Test 3: compact es una función");
try {
  console.log("   typeof compact:", typeof compact);
  if (typeof compact === 'function') {
    console.log("✅ PASSED - compact es una función");
    passed++;
  } else {
    console.log("❌ FAILED - compact no es una función");
    failed++;
  }
} catch (error) {
  console.error("❌ FAILED -", error.message);
  failed++;
}
console.log("");

// Test 4: generateSummary es una función
console.log("🧪 Test 4: generateSummary es una función");
try {
  console.log("   typeof generateSummary:", typeof generateSummary);
  if (typeof generateSummary === 'function') {
    console.log("✅ PASSED - generateSummary es una función");
    passed++;
  } else {
    console.log("❌ FAILED - generateSummary no es una función");
    failed++;
  }
} catch (error) {
  console.error("❌ FAILED -", error.message);
  failed++;
}
console.log("");

// Test 5: estimateTokens es una función
console.log("🧪 Test 5: estimateTokens es una función");
try {
  console.log("   typeof estimateTokens:", typeof estimateTokens);
  if (typeof estimateTokens === 'function') {
    console.log("✅ PASSED - estimateTokens es una función");
    passed++;
  } else {
    console.log("❌ FAILED - estimateTokens no es una función");
    failed++;
  }
} catch (error) {
  console.error("❌ FAILED -", error.message);
  failed++;
}
console.log("");

// Test 6: calculateContextTokens es una función
console.log("🧪 Test 6: calculateContextTokens es una función");
try {
  console.log("   typeof calculateContextTokens:", typeof calculateContextTokens);
  if (typeof calculateContextTokens === 'function') {
    console.log("✅ PASSED - calculateContextTokens es una función");
    passed++;
  } else {
    console.log("❌ FAILED - calculateContextTokens no es una función");
    failed++;
  }
} catch (error) {
  console.error("❌ FAILED -", error.message);
  failed++;
}
console.log("");

// Test 7: Funciones exportadas son las esperadas
console.log("🧪 Test 7: Funciones exportadas son las esperadas");
try {
  const expectedFunctions = ['compact', 'shouldCompact', 'generateSummary', 'estimateTokens', 'calculateContextTokens'];
  const allExist = expectedFunctions.every(fn => typeof eval(fn) === 'function');
  if (allExist) {
    console.log("   Functions:", expectedFunctions.join(", "));
    console.log("✅ PASSED - Todas las funciones de compaction existen");
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
  console.log("🎉 TODAS LAS FUNCIONES DE COMPACTION SE PUEDEN IMPORTAR DE PI ✅");
}
console.log("═".repeat(50));
