/**
 * Lyria Test: Import de Message Formatting de Pi
 *
 * Propósito: Verificar que podemos importar las funciones de formateo de mensajes de Pi
 * en lugar de reimplementarlas en Aurora (normalizeMensaje, parsearMensajeRico)
 *
 * Autor: Lyria 💙🦊
 * Fecha: 2025-07-17
 */

const PI_MESSAGES_PATH = "/home/deml/.bun/install/global/node_modules/@earendil-works/pi-coding-agent/dist/core/messages.js";
const { convertToLlm } = await import(PI_MESSAGES_PATH);

console.log("📂 Testing Message Formatting Functions from Pi");
console.log("");

let passed = 0;
let failed = 0;

// Test 1: convertToLlm es una función
console.log("🧪 Test 1: convertToLlm es una función");
try {
  console.log("   typeof convertToLlm:", typeof convertToLlm);
  if (typeof convertToLlm === 'function') {
    console.log("✅ PASSED - convertToLlm es una función");
    passed++;
  } else {
    console.log("❌ FAILED - convertToLlm no es una función");
    failed++;
  }
} catch (error) {
  console.error("❌ FAILED -", error.message);
  failed++;
}
console.log("");

// Test 2: convertToLlm funciona con array de mensajes simple
console.log("🧪 Test 2: convertToLlm funciona con array de mensajes simple");
try {
  const messages = [
    { role: "user", content: "Hola, ¿cómo estás?" }
  ];
  const result = convertToLlm(messages);
  console.log("   Input:", JSON.stringify(messages));
  console.log("   Output:", JSON.stringify(result));
  if (result && result.length === 1 && result[0].role === "user") {
    console.log("✅ PASSED - convertToLlm formatea mensajes correctamente");
    passed++;
  } else {
    console.log("❌ FAILED - convertToLlm no formatea correctamente");
    failed++;
  }
} catch (error) {
  console.error("❌ FAILED -", error.message);
  failed++;
}
console.log("");

// Test 3: convertToLlm funciona con mensaje de asistente
console.log("🧪 Test 3: convertToLlm funciona con mensaje de asistente");
try {
  const messages = [
    { role: "assistant", content: "¡Hola! Estoy bien, ¿y tú?" }
  ];
  const result = convertToLlm(messages);
  console.log("   Input:", JSON.stringify(messages));
  console.log("   Output:", JSON.stringify(result));
  if (result && result.length === 1 && result[0].role === "assistant") {
    console.log("✅ PASSED - convertToLlm formatea mensajes de asistente");
    passed++;
  } else {
    console.log("❌ FAILED - convertToLlm no formatea mensajes de asistente");
    failed++;
  }
} catch (error) {
  console.error("❌ FAILED -", error.message);
  failed++;
}
console.log("");

// Test 4: convertToLlm filtra system messages (comportamiento esperado)
console.log("🧪 Test 4: convertToLlm filtra system messages (comportamiento esperado)");
try {
  const messages = [
    { role: "system", content: "Eres un asistente útil." }
  ];
  const result = convertToLlm(messages);
  console.log("   Input:", JSON.stringify(messages));
  console.log("   Output:", JSON.stringify(result));
  // Pi filtra system messages solos (los LLMs no los usan igual)
  if (Array.isArray(result) && result.length === 0) {
    console.log("✅ PASSED - convertToLlm filtra system messages correctamente");
    passed++;
  } else {
    console.log("❌ FAILED - convertToLlm no filtra system messages");
    failed++;
  }
} catch (error) {
  console.error("❌ FAILED -", error.message);
  failed++;
}
console.log("");

// Test 5: convertToLlm funciona con array mixto (system + user + assistant)
console.log("🧪 Test 5: convertToLlm funciona con array mixto");
try {
  const messages = [
    { role: "system", content: "Eres útil." },
    { role: "user", content: "Hola" },
    { role: "assistant", content: "¡Hola! ¿En qué puedo ayudarte?" }
  ];
  const result = convertToLlm(messages);
  console.log("   Input: Array de 3 mensajes");
  console.log("   Output length:", result?.length);
  console.log("   Output roles:", result?.map(m => m.role));
  // Pi filtra system message inicial, mantiene user + assistant
  if (Array.isArray(result) && result.length === 2 && result[0].role === "user") {
    console.log("✅ PASSED - convertToLlm formatea arrays mixtos correctamente");
    passed++;
  } else {
    console.log("❌ FAILED - convertToLlm no formatea arrays mixtos correctamente");
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
  console.log("🎉 TODAS LAS FUNCIONES DE MESSAGE FORMATTING SE PUEDEN IMPORTAR DE PI ✅");
}
console.log("═".repeat(50));
