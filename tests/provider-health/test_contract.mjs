// Verifica el contrato puro del Provider Health Sensor (Checkpoint 1):
// enums, helpers y validadores de extensions/aihub/content-scripts/relay/
// provider-health/{types,validate}.js. Sin DOM, sin chrome.*, sin red,
// sin proveedor vivo — determinista al 100%.
// Correr: bun tests/provider-health/test_contract.mjs
// (o: node tests/provider-health/test_contract.mjs)

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const typesPath = join(here, '../../extensions/aihub/content-scripts/relay/provider-health/types.js');
const validatePath = join(here, '../../extensions/aihub/content-scripts/relay/provider-health/validate.js');
const typesSrc = readFileSync(typesPath, 'utf8');
const validateSrc = readFileSync(validatePath, 'utf8');

// types.js/validate.js son scripts clásicos (IIFE, sin export/import) por
// diseño — deben poder cargarse como content script real. Se evalúan con
// runInThisContext (no un sandbox/contexto separado): un content script
// real de una sola tab comparte el MISMO realm que la página que lo aloja,
// así que los fixtures de este test (objetos `{}` normales) y el código
// validado comparten idéntico `Object.prototype` — igual que en producción.
// Un `vm.createContext` separado rompería exactamente esa identidad
// (cada realm tiene su propio Object.prototype) y haría que isPlainObject()
// rechace fixtures legítimos por una razón ajena al contrato.
function loadScript(source, filename) {
  new vm.Script(source, { filename }).runInThisContext();
}

loadScript(typesSrc, typesPath);
loadScript(validateSrc, validatePath);

const health = globalThis.__auroraProviderHealth;

const isNonEmptyString = v => typeof v === 'string' && v.length > 0;

let failures = 0;
function check(label, cond) {
  if (!cond) { failures++; console.error(`FALLO: ${label}`); }
}
function expectOk(label, result) {
  check(`${label} (esperaba ok:true, errors: ${JSON.stringify(result?.errors)})`, result?.ok === true);
}
function expectFail(label, result, expectedPathOrReason) {
  const found = result?.ok === false
    && (!expectedPathOrReason || result.errors.some(
      e => e.path === expectedPathOrReason || e.reason === expectedPathOrReason,
    ));
  check(`${label} (result: ${JSON.stringify(result)})`, found);
}

// ── Fixtures válidos mínimos ──────────────────────────────────────────
const nowMs = 1_800_000_000_000;

function makeEvidence(overrides = {}) {
  return {
    evidenceId: 'ev-1',
    sourceClass: 'dom_banner',
    authority: 'structural',
    correlationGroup: 'quota-banner-group',
    patternId: 'qwen-quota-es-v1',
    reasonCode: 'quota_banner_matched',
    logicalProviderId: 'qwen',
    effectiveAdapterId: 'qwen',
    observedAt: nowMs,
    expiresAt: nowMs + 60_000,
    previousState: null,
    contradicts: null,
    ...overrides,
  };
}

function makeAvailabilityEvent(overrides = {}) {
  return {
    eventVersion: 1,
    eventId: 'evt-1',
    sequence: 1,
    logicalProviderId: 'qwen',
    effectiveAdapterId: 'qwen',
    paneId: 'cloud',
    sessionId: null,
    previousState: 'READY',
    state: 'QUOTA_EXHAUSTED',
    reasonCode: 'quota_banner_matched',
    confidence: 'HIGH',
    evidence: [makeEvidence()],
    retryAfter: null,
    observedAt: nowMs,
    source: 'adapter',
    ...overrides,
  };
}

function makeAttempt(overrides = {}) {
  return {
    attemptId: 'attempt-1',
    logicalProviderId: 'qwen',
    effectiveAdapterId: 'qwen',
    requestId: 'req-1',
    ...overrides,
  };
}

function makeRequestActivityEvent(overrides = {}) {
  return {
    eventVersion: 1,
    eventId: 'evt-2',
    sequence: 1,
    logicalProviderId: 'qwen',
    effectiveAdapterId: 'qwen',
    paneId: 'cloud',
    sessionId: null,
    logicalJobId: 'job-1',
    attemptId: 'attempt-1',
    requestId: 'req-1',
    previousActivity: 'SUBMITTED',
    activity: 'PROGRESSING',
    lastProgressAt: nowMs,
    terminalReason: null,
    observedAt: nowMs,
    ...overrides,
  };
}

function makePartialArtifactRef(overrides = {}) {
  return {
    artifactId: 'artifact-1',
    ownerLogicalJobId: 'job-1',
    privacyClass: 'PRIVATE',
    createdAt: nowMs,
    expiresAt: nowMs + 60_000,
    allowedConsumers: ['driver'],
    hasContent: true,
    approxSize: 128,
    ...overrides,
  };
}

function makeJobStateEvent(overrides = {}) {
  return {
    eventVersion: 1,
    eventId: 'evt-3',
    sequence: 1,
    logicalJobId: 'job-1',
    currentAttempt: makeAttempt(),
    turnId: 'turn-1',
    paneId: 'cloud',
    previousState: 'ACTIVE',
    state: 'WAITING_TOOL',
    pauseReason: null,
    blockedReason: null,
    durableClaim: 'job-1:attempt-1',
    partialArtifactRef: null,
    observedAt: nowMs,
    ...overrides,
  };
}

function makeHealthSnapshot(overrides = {}) {
  return {
    logicalProviderId: 'qwen',
    paneId: 'cloud',
    availability: 'READY',
    requestActivity: 'PROGRESSING',
    jobState: 'ACTIVE',
    channel: 'IDLE',
    observedAt: nowMs,
    ...overrides,
  };
}

// ══════════════════════════ CASOS POSITIVOS ══════════════════════════

// 1. namespace creado
check('1. namespace __auroraProviderHealth existe', typeof health === 'object' && health !== null);

// 2. constantes inmutables
check('2a. AvailabilityState congelado', Object.isFrozen(health.AvailabilityState));
check('2b. RequestActivityState congelado', Object.isFrozen(health.RequestActivityState));
check('2c. JobState congelado', Object.isFrozen(health.JobState));
check('2d. ChannelState congelado', Object.isFrozen(health.ChannelState));
check('2e. EventName congelado', Object.isFrozen(health.EventName));
try {
  health.AvailabilityState.READY = 'HACKED';
  check('2f. mutar AvailabilityState no tiene efecto (modo no estricto de vm)', health.AvailabilityState.READY === 'READY');
} catch (_) {
  check('2f. mutar AvailabilityState lanza (modo estricto)', true);
}

// 3. todos los AvailabilityState válidos
for (const s of Object.values(health.AvailabilityState)) {
  check(`3. isAvailabilityState('${s}')`, health.isAvailabilityState(s));
}

// 4. todos los RequestActivityState válidos
for (const s of Object.values(health.RequestActivityState)) {
  check(`4. isRequestActivityState('${s}')`, health.isRequestActivityState(s));
}

// 5. todos los JobState válidos
for (const s of Object.values(health.JobState)) {
  check(`5. isJobState('${s}')`, health.isJobState(s));
}

// 6. ChannelState sin ONLINE canónico
check('6a. ChannelState NO incluye ONLINE', !Object.prototype.hasOwnProperty.call(health.ChannelState, 'ONLINE'));
check('6b. CHANNEL_ONLINE_PROPOSED_DERIVED existe aparte, marcado como propuesta', health.CHANNEL_ONLINE_PROPOSED_DERIVED === 'ONLINE');
for (const s of Object.values(health.ChannelState)) {
  check(`6c. isChannelState('${s}')`, health.isChannelState(s));
}

// 7. isActiveRequestActivity — los 5 no-terminales true, el resto false
for (const s of ['QUEUED', 'SUBMITTED', 'WAITING_FIRST_OUTPUT', 'PROGRESSING', 'STALLED']) {
  check(`7. isActiveRequestActivity('${s}') === true`, health.isActiveRequestActivity(s) === true);
}
for (const s of ['IDLE', 'COMPLETED', 'FAILED', 'CANCELLED', 'INTERRUPTED']) {
  check(`7. isActiveRequestActivity('${s}') === false`, health.isActiveRequestActivity(s) === false);
}

// 8. EvidenceEntry válido
expectOk('8. EvidenceEntry válido', health.validateEvidenceEntry(makeEvidence()));

// 9. PartialArtifactRef válido sin contenido
expectOk('9. PartialArtifactRef válido', health.validatePartialArtifactRef(makePartialArtifactRef()));
expectOk('9b. PartialArtifactRef null es válido (sin artefacto)', health.validatePartialArtifactRef(null));

// 10. provider.availability.changed válido
expectOk('10. provider.availability.changed válido', health.validateAvailabilityChangedEvent(makeAvailabilityEvent()));

// 11. provider.request.activity.changed válido
expectOk('11. provider.request.activity.changed válido', health.validateRequestActivityChangedEvent(makeRequestActivityEvent()));

// 12. cloud.job.state.changed válido con currentAttempt
expectOk('12. cloud.job.state.changed válido', health.validateJobStateChangedEvent(makeJobStateEvent()));
expectOk('12b. cloud.job.state.changed válido con currentAttempt:null (CREATED)',
  health.validateJobStateChangedEvent(makeJobStateEvent({ state: 'CREATED', previousState: 'CREATED', currentAttempt: null })));

// 13. provider.health.snapshot válido como vista derivada
expectOk('13. provider.health.snapshot válido', health.validateHealthSnapshot(makeHealthSnapshot()));

// Nombres de evento exactos, sin los descartados
check('EventName.AVAILABILITY_CHANGED', health.EventName.AVAILABILITY_CHANGED === 'provider.availability.changed');
check('EventName.REQUEST_ACTIVITY_CHANGED', health.EventName.REQUEST_ACTIVITY_CHANGED === 'provider.request.activity.changed');
check('EventName.JOB_STATE_CHANGED', health.EventName.JOB_STATE_CHANGED === 'cloud.job.state.changed');
check('EventName.HEALTH_SNAPSHOT', health.EventName.HEALTH_SNAPSHOT === 'provider.health.snapshot');
check('EventName no define provider.activity.changed', !Object.values(health.EventName).includes('provider.activity.changed'));
check('EventName no define provider.channel.changed', !Object.values(health.EventName).includes('provider.channel.changed'));

// ══════════════════════════ CASOS NEGATIVOS ══════════════════════════

// 1. Availability desconocido
expectFail('N1. Availability desconocido', health.validateAvailabilityChangedEvent(makeAvailabilityEvent({ state: 'BUSY' })), 'state');

// 2. RequestActivity con PAUSED
expectFail('N2. RequestActivity con PAUSED', health.validateRequestActivityChangedEvent(makeRequestActivityEvent({ activity: 'PAUSED' })), 'activity');

// 3. RequestActivity con BLOCKED
expectFail('N3. RequestActivity con BLOCKED', health.validateRequestActivityChangedEvent(makeRequestActivityEvent({ activity: 'BLOCKED' })), 'activity');

// 4. JobState desconocido
expectFail('N4. JobState desconocido', health.validateJobStateChangedEvent(makeJobStateEvent({ state: 'BUSY' })), 'state');

// 5. Availability event con source:"endpoint_registry"
expectFail('N5. source endpoint_registry rechazado', health.validateAvailabilityChangedEvent(makeAvailabilityEvent({ source: 'endpoint_registry' })), 'source');

// 6. Availability event con source:"harness"
expectFail('N6. source harness rechazado', health.validateAvailabilityChangedEvent(makeAvailabilityEvent({ source: 'harness' })), 'source');

// 7. evento sin sequence
{
  const bad = makeAvailabilityEvent();
  delete bad.sequence;
  expectFail('N7. evento sin sequence', health.validateAvailabilityChangedEvent(bad), 'sequence');
}

// 8. sequence inválido
expectFail('N8. sequence negativo inválido', health.validateAvailabilityChangedEvent(makeAvailabilityEvent({ sequence: -1 })), 'sequence');

// 9. EvidenceEntry con normalizedText
expectFail('N9. EvidenceEntry con normalizedText prohibido',
  health.validateEvidenceEntry(makeEvidence({ normalizedText: 'texto sensible del banner' })), 'normalizedText');

// 10. EvidenceEntry con rawText
expectFail('N10. EvidenceEntry con rawText prohibido',
  health.validateEvidenceEntry(makeEvidence({ rawText: 'texto crudo' })), 'rawText');

// 11. EvidenceEntry con hash de texto sensible
expectFail('N11. EvidenceEntry con hash prohibido',
  health.validateEvidenceEntry(makeEvidence({ hash: 'deadbeef' })), 'hash');

// 12. contradicts apuntando a evidenceId inexistente — sólo resoluble con
// el conjunto completo de evidencias del mismo evento (ver validateEvidenceList).
{
  const evA = makeEvidence({ evidenceId: 'ev-a' });
  const evB = makeEvidence({ evidenceId: 'ev-b', contradicts: ['ev-does-not-exist'] });
  const result = health.validateEvidenceList([evA, evB]);
  check('N12b. contradicts con evidenceId inexistente dentro de una lista real',
    result.ok === false && result.errors.some(e => e.reason === 'unknown_evidence_id'));
}

// 13. PartialArtifactRef con text
expectFail('N13. PartialArtifactRef con text prohibido',
  health.validatePartialArtifactRef(makePartialArtifactRef({ text: 'contenido privado' })), 'text');

// 14. PartialArtifactRef con content
expectFail('N14. PartialArtifactRef con content prohibido',
  health.validatePartialArtifactRef(makePartialArtifactRef({ content: 'contenido privado' })), 'content');

// 15. PartialArtifactRef sin privacyClass
{
  const bad = makePartialArtifactRef();
  delete bad.privacyClass;
  expectFail('N15. PartialArtifactRef sin privacyClass', health.validatePartialArtifactRef(bad), 'privacyClass');
}

// 16. PartialArtifactRef sin allowedConsumers
{
  const bad = makePartialArtifactRef();
  delete bad.allowedConsumers;
  expectFail('N16. PartialArtifactRef sin allowedConsumers', health.validatePartialArtifactRef(bad), 'allowedConsumers');
}

// 17. request event sin attemptId
{
  const bad = makeRequestActivityEvent();
  delete bad.attemptId;
  expectFail('N17. request event sin attemptId', health.validateRequestActivityChangedEvent(bad), 'attemptId');
}

// 18. request event con estado de JobState (p.ej. "BLOCKED") en `activity`
expectFail('N18. request event con JobState BLOCKED en activity',
  health.validateRequestActivityChangedEvent(makeRequestActivityEvent({ activity: 'BLOCKED' })), 'activity');

// 19. job event sin currentAttempt
{
  const bad = makeJobStateEvent();
  delete bad.currentAttempt;
  expectFail('N19. job event sin currentAttempt', health.validateJobStateChangedEvent(bad), 'currentAttempt');
}

// 20. job event sin logicalProviderId (dentro de currentAttempt)
{
  const bad = makeJobStateEvent({ currentAttempt: makeAttempt({ logicalProviderId: undefined }) });
  delete bad.currentAttempt.logicalProviderId;
  expectFail('N20. currentAttempt sin logicalProviderId', health.validateJobStateChangedEvent(bad), 'currentAttempt.logicalProviderId');
}

// 21. job event sin effectiveAdapterId (dentro de currentAttempt)
{
  const bad = makeJobStateEvent({ currentAttempt: makeAttempt() });
  delete bad.currentAttempt.effectiveAdapterId;
  expectFail('N21. currentAttempt sin effectiveAdapterId', health.validateJobStateChangedEvent(bad), 'currentAttempt.effectiveAdapterId');
}

// 22. job event sin requestId (dentro de currentAttempt) — requestId es nullable, así que "sin" (undefined) debe fallar por tipo, no por ausencia de valor nulo
{
  const bad = makeJobStateEvent({ currentAttempt: makeAttempt() });
  delete bad.currentAttempt.requestId;
  expectFail('N22. currentAttempt sin requestId (undefined, no null)', health.validateJobStateChangedEvent(bad), 'currentAttempt.requestId');
}

// 23. job event con PAUSED sin pauseReason
expectFail('N23. JobState PAUSED sin pauseReason',
  health.validateJobStateChangedEvent(makeJobStateEvent({ state: 'PAUSED' })), 'pauseReason');

// 24. job event con BLOCKED sin blockedReason
expectFail('N24. JobState BLOCKED sin blockedReason',
  health.validateJobStateChangedEvent(makeJobStateEvent({ state: 'BLOCKED' })), 'blockedReason');

// 25. event name obsoleto provider.activity.changed
check('N25. provider.activity.changed no es un EventName válido',
  !Object.values(health.EventName).includes('provider.activity.changed'));

// 26. event name no autorizado provider.channel.changed
check('N26. provider.channel.changed no es un EventName válido',
  !Object.values(health.EventName).includes('provider.channel.changed'));

// 27. input array donde se requiere objeto
expectFail('N27. array en vez de objeto (evidence entry)', health.validateEvidenceEntry([1, 2, 3]));
expectFail('N27b. array en vez de objeto (availability event)', health.validateAvailabilityChangedEvent(['x']));

// 28. input nulo
expectFail('N28. null en evidence entry', health.validateEvidenceEntry(null));
expectFail('N28b. null en availability event', health.validateAvailabilityChangedEvent(null));

// 29. input mutado durante validación: no debe ocurrir
{
  const original = makeAvailabilityEvent();
  const snapshot = JSON.parse(JSON.stringify(original));
  health.validateAvailabilityChangedEvent(original);
  check('N29. validar no muta el evento original', JSON.stringify(original) === JSON.stringify(snapshot));

  const evidenceOriginal = makeEvidence();
  const evidenceSnapshot = JSON.parse(JSON.stringify(evidenceOriginal));
  health.validateEvidenceEntry(evidenceOriginal);
  check('N29b. validar no muta el EvidenceEntry original', JSON.stringify(evidenceOriginal) === JSON.stringify(evidenceSnapshot));
}

// ══════════════════════ TESTS ADVERSARIALES (endurecimiento) ══════════════
// Exigidos tras el veredicto CHANGES_REQUIRED de Navigator sobre el primer
// Checkpoint 1: namespace mutable, plain-object laxo, getters ejecutados,
// currentAttempt:null mal restringido, razones de pausa/bloqueo
// incoherentes, allowedConsumers sin validar elementos, snapshot sin
// whitelist.

// Helper: contexto vm FRESCO e independiente del realm principal, usado
// exclusivamente para simular "algo más plantó un __auroraProviderHealth
// ANTES de que types.js corra por primera vez" — el único momento en que
// eso es posible es un realm nuevo (en el realm principal, una vez cargado
// types.js, el binding ya queda bloqueado para siempre, ver tests 1-5).
function freshSandbox(setup) {
  const sandbox = {};
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  if (setup) setup(sandbox);
  return sandbox;
}
function tryLoadTypesIn(sandbox) {
  try { new vm.Script(typesSrc, { filename: typesPath }).runInContext(sandbox); return { threw: false }; }
  catch (error) { return { threw: true, error }; }
}

// 1-4. Binding global protegido contra reasignación/delete/redefinición.
{
  const globalDesc = Object.getOwnPropertyDescriptor(globalThis, '__auroraProviderHealth');
  check('1. globalThis.__auroraProviderHealth: descriptor writable:false', globalDesc.writable === false);
  check('1b. globalThis.__auroraProviderHealth: descriptor configurable:false', globalDesc.configurable === false);

  const before = globalThis.__auroraProviderHealth;
  try { globalThis.__auroraProviderHealth = { fake: true }; } catch (_) { /* modo estricto: puede lanzar, aceptado */ }
  check('2. asignación directa no sustituye el namespace', globalThis.__auroraProviderHealth === before);

  let deleteSucceeded = true;
  try { deleteSucceeded = delete globalThis.__auroraProviderHealth; } catch (_) { deleteSucceeded = false; }
  check('3. delete no elimina el namespace (delete falla o no tiene efecto)',
    globalThis.__auroraProviderHealth === before && (deleteSucceeded === false || globalThis.__auroraProviderHealth === before));

  let redefineThrew = false;
  try {
    Object.defineProperty(globalThis, '__auroraProviderHealth', { value: { fake: true }, writable: true, configurable: true });
  } catch (_) { redefineThrew = true; }
  check('4. Object.defineProperty no puede redefinir el binding (lanza o no tiene efecto)',
    redefineThrew || globalThis.__auroraProviderHealth === before);

  check('5a. tras los intentos, AvailabilityState sigue canónico', globalThis.__auroraProviderHealth.AvailabilityState === health.AvailabilityState);
  check('5b. tras los intentos, validateEvidenceEntry sigue siendo el canónico', globalThis.__auroraProviderHealth.validateEvidenceEntry === health.validateEvidenceEntry);
}

// 6. Namespace de la MISMA versión con AvailabilityState mutable — se
// simula en un realm nuevo (en el principal, ya no es posible plantar nada
// antes de types.js: el binding ya está tomado para siempre).
{
  const sandbox = freshSandbox(s => {
    s.__auroraProviderHealth = {
      __contractVersion: 1,
      AvailabilityState: { READY: 'READY', RATE_LIMITED: 'RATE_LIMITED' }, // forma parcial, MUTABLE, sin marca canónica
    };
  });
  const result = tryLoadTypesIn(sandbox);
  check('6. namespace misma versión con AvailabilityState mutable es rechazado', result.threw === true);
}

// 7. Namespace de la misma versión con un enum ya congelado pero con
// contenido ADICIONAL (BUSY de más) — igual debe rechazarse: no basta con
// que esté frozen, tiene que carecer de la marca canónica bloqueada.
{
  const sandbox = freshSandbox(s => {
    s.__auroraProviderHealth = {
      __contractVersion: 1,
      AvailabilityState: Object.freeze({
        READY: 'READY', RATE_LIMITED: 'RATE_LIMITED', QUOTA_EXHAUSTED: 'QUOTA_EXHAUSTED',
        AUTH_REQUIRED: 'AUTH_REQUIRED', CHALLENGE_REQUIRED: 'CHALLENGE_REQUIRED',
        TEMP_UNAVAILABLE: 'TEMP_UNAVAILABLE', RESTRICTED: 'RESTRICTED', UNKNOWN: 'UNKNOWN',
        BUSY: 'BUSY', // contenido adicional no autorizado
      }),
    };
  });
  const result = tryLoadTypesIn(sandbox);
  check('7. namespace misma versión con enum congelado + contenido extra es rechazado', result.threw === true);
}

// 8. Namespace de la misma versión con un validador falso.
{
  const sandbox = freshSandbox(s => {
    s.__auroraProviderHealth = {
      __contractVersion: 1,
      validateEvidenceEntry: () => ({ ok: true, errors: [] }), // siempre aprueba TODO
    };
  });
  const result = tryLoadTypesIn(sandbox);
  check('8. namespace misma versión con validateEvidenceEntry falso es rechazado', result.threw === true);
}

// 9. Namespace de la misma versión con un __defineLocked falso.
{
  const sandbox = freshSandbox(s => {
    s.__auroraProviderHealth = {
      __contractVersion: 1,
      __defineLocked: (key, value) => { s.__auroraProviderHealth[key] = value; return value; }, // sin bloquear nada
    };
  });
  const result = tryLoadTypesIn(sandbox);
  check('9. namespace misma versión con __defineLocked falso es rechazado', result.threw === true);
}

// 10. Namespace de la misma versión pero con bindings CONFIGURABLES
// (no writable, pero sí configurable — no cumple el descriptor exacto
// exigido) debe rechazarse igual.
{
  const sandbox = freshSandbox(s => {
    const fake = {};
    Object.defineProperty(fake, '__contractVersion', { value: 1, writable: false, configurable: true, enumerable: true });
    Object.defineProperty(s, '__auroraProviderHealth', { value: fake, writable: false, configurable: false, enumerable: true });
  });
  const result = tryLoadTypesIn(sandbox);
  check('10. namespace misma versión con bindings configurables (sin marca canónica) es rechazado', result.threw === true);
}

// 11. Namespace canónico previamente cargado se acepta en segunda carga
// (recarga determinista, en el realm PRINCIPAL — el único caso real de
// "namespace preexistente" que debe aceptarse).
{
  const availabilityBefore = health.AvailabilityState;
  const validateBefore = health.validateAvailabilityChangedEvent;
  let secondLoadThrew = false;
  try {
    loadScript(typesSrc, typesPath);
    loadScript(validateSrc, validatePath);
  } catch (_) { secondLoadThrew = true; }
  check('11. segunda carga canónica en el realm principal no lanza', !secondLoadThrew);
  check('11b. segunda carga conserva el mismo AvailabilityState', globalThis.__auroraProviderHealth.AvailabilityState === availabilityBefore);
  check('11c. segunda carga conserva el mismo validador', globalThis.__auroraProviderHealth.validateAvailabilityChangedEvent === validateBefore);
}

// 12-15. Symbol.toStringTag hostil: isPlainObject ya no llama a
// Object.prototype.toString.call(v) — verificar que un getter en
// Symbol.toStringTag NUNCA se ejecuta, ni siquiera para decidir el
// resultado, y que si de todos modos existiera algún camino que lo tocara,
// el resultado sigue siendo estructurado (nunca una excepción).
{
  let getterCalled = false;
  const hostile = makeEvidence();
  Object.defineProperty(hostile, Symbol.toStringTag, {
    get() { getterCalled = true; throw new Error('Symbol.toStringTag no debería ejecutarse jamás'); },
    configurable: true,
  });
  let threw = false;
  let result = null;
  try { result = health.validateEvidenceEntry(hostile); } catch (_) { threw = true; }
  check('12. Symbol.toStringTag getter no se ejecuta durante la validación', getterCalled === false);
  check('13. un getter de Symbol.toStringTag que lanzaría no escapa como excepción', threw === false);
  check('14. el resultado es {ok:false, errors:[...]} estructurado', result && result.ok === false && Array.isArray(result.errors));
  check('15. los errores resultantes tienen path y reason', result && result.errors.every(e => typeof e.path === 'string' && isNonEmptyString(e.reason)));
}

// 16-20. Claves NO enumerables desconocidas — deben rechazarse igual que
// las enumerables (Reflect.ownKeys, no Object.keys).
{
  const ev = makeEvidence();
  Object.defineProperty(ev, 'text', { value: 'contenido privado no enumerable', enumerable: false, configurable: true });
  expectFail('16. EvidenceEntry con "text" NO enumerable rechazado', health.validateEvidenceEntry(ev), 'text');
}
{
  const ev = makeEvidence();
  Object.defineProperty(ev, 'secretoOculto', { value: 'x', enumerable: false, configurable: true });
  expectFail('17. EvidenceEntry con clave desconocida NO enumerable rechazada', health.validateEvidenceEntry(ev), 'secretoOculto');
}
{
  const ref = makePartialArtifactRef();
  Object.defineProperty(ref, 'content', { value: 'contenido privado no enumerable', enumerable: false, configurable: true });
  expectFail('18. PartialArtifactRef con "content" NO enumerable rechazado', health.validatePartialArtifactRef(ref), 'content');
}
{
  const snap = makeHealthSnapshot();
  Object.defineProperty(snap, 'prompt', { value: 'contenido privado no enumerable', enumerable: false, configurable: true });
  expectFail('19. Snapshot con "prompt" NO enumerable rechazado', health.validateHealthSnapshot(snap), 'prompt');
}
{
  const event = makeAvailabilityEvent();
  Object.defineProperty(event, 'secretoOculto', { value: 'x', enumerable: false, configurable: true });
  expectFail('20. Evento válido + clave NO enumerable desconocida rechazado', health.validateAvailabilityChangedEvent(event), 'secretoOculto');
}

// 21-24. Símbolos como clave — ninguno está autorizado en este checkpoint.
expectFail('21. EvidenceEntry con Symbol("text") rechazado',
  health.validateEvidenceEntry({ ...makeEvidence(), [Symbol('text')]: 'contenido privado' }));
expectFail('22. PartialArtifactRef con símbolo desconocido rechazado',
  health.validatePartialArtifactRef({ ...makePartialArtifactRef(), [Symbol('x')]: 'y' }));
expectFail('23. Snapshot con símbolo desconocido rechazado',
  health.validateHealthSnapshot({ ...makeHealthSnapshot(), [Symbol('x')]: 'y' }));
expectFail('24. Evento con símbolo desconocido rechazado',
  health.validateAvailabilityChangedEvent({ ...makeAvailabilityEvent(), [Symbol('x')]: 'y' }));

// 25. Tras todos los intentos de mutación/sustitución del namespace de
// arriba, las reglas de negocio siguen intactas.
{
  check('25a. BUSY sigue siendo un AvailabilityState inválido', health.isAvailabilityState('BUSY') === false);
  expectFail('25b. prompt sigue rechazado en EvidenceEntry', health.validateEvidenceEntry(makeEvidence({ prompt: 'x' })), 'prompt');
  expectFail('25c. source:"harness" sigue rechazado', health.validateAvailabilityChangedEvent(makeAvailabilityEvent({ source: 'harness' })), 'source');
  expectFail('25d. currentAttempt:null sigue rechazado en ACTIVE',
    health.validateJobStateChangedEvent(makeJobStateEvent({ state: 'ACTIVE', previousState: 'CREATED', currentAttempt: null })),
    'null_not_allowed_for_state:ACTIVE');
}

// A6. UNKNOWN y valor arbitrario en isActiveRequestActivity.
check('A6a. isActiveRequestActivity("UNKNOWN") === false', health.isActiveRequestActivity('UNKNOWN') === false);
check('A6b. isActiveRequestActivity("no-existe") === false', health.isActiveRequestActivity('no-existe') === false);
check('A6c. isActiveRequestActivity(undefined) === false', health.isActiveRequestActivity(undefined) === false);

// A7-A9. Campos sensibles agregados (prompt/response/body).
expectFail('A7. EvidenceEntry con prompt prohibido', health.validateEvidenceEntry(makeEvidence({ prompt: 'texto del usuario' })), 'prompt');
expectFail('A8. EvidenceEntry con response prohibido', health.validateEvidenceEntry(makeEvidence({ response: 'texto del proveedor' })), 'response');
expectFail('A9. EvidenceEntry con body prohibido', health.validateEvidenceEntry(makeEvidence({ body: 'contenido' })), 'body');

// A10. IDs de evidencia duplicados dentro de una lista.
{
  const dup1 = makeEvidence({ evidenceId: 'dup-1' });
  const dup2 = makeEvidence({ evidenceId: 'dup-1' });
  const result = health.validateEvidenceList([dup1, dup2]);
  check('A10. IDs de evidencia duplicados rechazados', result.ok === false && result.errors.some(e => e.reason.startsWith('duplicate_evidence_id')));
}

// A11. Self-contradiction (una evidencia se contradice a sí misma).
expectFail('A11. self-contradiction rechazada',
  health.validateEvidenceEntry(makeEvidence({ evidenceId: 'self-1', contradicts: ['self-1'] })), 'self_contradiction_not_allowed');

// A12. Ciclo de dos evidencias (A contradice a B, B contradice a A).
{
  const evA = makeEvidence({ evidenceId: 'cyc-a', contradicts: ['cyc-b'] });
  const evB = makeEvidence({ evidenceId: 'cyc-b', contradicts: ['cyc-a'] });
  const result = health.validateEvidenceList([evA, evB]);
  check('A12. ciclo de dos evidencias rechazado', result.ok === false && result.errors.some(e => e.reason === 'contradiction_cycle_detected'));
}

// A13. expiresAt anterior a observedAt (EvidenceEntry) — inconsistencia temporal.
expectFail('A13. EvidenceEntry con expiresAt < observedAt', health.validateEvidenceEntry(makeEvidence({ observedAt: 1000, expiresAt: 500 })), 'expires_before_observed');

// A14. Objeto con prototipo personalizado.
{
  class Custom {}
  const custom = new Custom();
  Object.assign(custom, makeEvidence());
  expectFail('A14. EvidenceEntry con prototipo personalizado rechazado', health.validateEvidenceEntry(custom));
}

// A15. Campos requeridos heredados (no propios) no cuentan como presentes.
{
  const base = makeEvidence();
  const child = Object.create(base); // hereda TODOS los campos de base, ninguno propio
  expectFail('A15. EvidenceEntry con campos sólo heredados es rechazada', health.validateEvidenceEntry(child));
}

// A16. Getter normal (no lanza) no debe alterar el resultado esperado y su valor SÍ se usa si es dato... pero como es accessor, debe rechazarse igual (regla: nunca se ejecutan accessors, sin excepción).
{
  const withGetter = makeEvidence();
  Object.defineProperty(withGetter, 'reasonCode', { get() { return 'quota_banner_matched'; }, enumerable: true, configurable: true });
  expectFail('A16. EvidenceEntry con getter normal en reasonCode igual se rechaza (nunca se ejecuta)', health.validateEvidenceEntry(withGetter), 'reasonCode');
}

// A17. Getter que lanza: debe convertirse en error estructurado, NUNCA escapar como excepción.
{
  const withThrowingGetter = makeEvidence();
  Object.defineProperty(withThrowingGetter, 'evidenceId', {
    get() { throw new Error('input hostil: no deberías haber leído esto'); },
    enumerable: true, configurable: true,
  });
  let threw = false;
  let result = null;
  try { result = health.validateEvidenceEntry(withThrowingGetter); } catch (_) { threw = true; }
  check('A17. getter que lanza NO escapa como excepción', threw === false);
  check('A17b. getter que lanza se reporta como error estructurado', result && result.ok === false
    && result.errors.some(e => e.path === 'evidenceId' && e.reason === 'accessor_field_not_allowed'));
}

// A18. currentAttempt:null válido en CREATED.
expectOk('A18. currentAttempt:null válido en JobState.CREATED',
  health.validateJobStateChangedEvent(makeJobStateEvent({ state: 'CREATED', previousState: 'CREATED', currentAttempt: null })));

// A19. currentAttempt:null inválido en ACTIVE.
expectFail('A19. currentAttempt:null inválido en JobState.ACTIVE',
  health.validateJobStateChangedEvent(makeJobStateEvent({ state: 'ACTIVE', previousState: 'CREATED', currentAttempt: null })),
  'null_not_allowed_for_state:ACTIVE');

// A20. null inválido en el resto de los estados que requieren intento.
for (const st of ['PAUSED', 'BLOCKED', 'WAITING_TOOL', 'WAITING_RESULT', 'WAITING_FEEDBACK']) {
  const overrides = { state: st, previousState: 'ACTIVE', currentAttempt: null };
  if (st === 'PAUSED') overrides.pauseReason = 'rate_limited';
  if (st === 'BLOCKED') overrides.blockedReason = 'quota_exhausted';
  expectFail(`A20. currentAttempt:null inválido en JobState.${st}`,
    health.validateJobStateChangedEvent(makeJobStateEvent(overrides)),
    `null_not_allowed_for_state:${st}`);
}

// A21. pauseReason presente en un estado que no es PAUSED.
expectFail('A21. pauseReason en estado incompatible (ACTIVE) rechazado',
  health.validateJobStateChangedEvent(makeJobStateEvent({ state: 'ACTIVE', previousState: 'CREATED', pauseReason: 'no_deberia_estar_aqui' })),
  'not_allowed_unless_state_is_paused');

// A22. blockedReason presente en un estado que no es BLOCKED.
expectFail('A22. blockedReason en estado incompatible (ACTIVE) rechazado',
  health.validateJobStateChangedEvent(makeJobStateEvent({ state: 'ACTIVE', previousState: 'CREATED', blockedReason: 'no_deberia_estar_aqui' })),
  'not_allowed_unless_state_is_blocked');

// A23. Ambas razones simultáneas (incluso en un estado donde alguna sería válida por sí sola).
expectFail('A23. pauseReason y blockedReason simultáneos siempre rechazados',
  health.validateJobStateChangedEvent(makeJobStateEvent({ state: 'PAUSED', pauseReason: 'rate_limited', blockedReason: 'quota_exhausted' })),
  'pause_and_blocked_reason_cannot_coexist');

// A24-A26. allowedConsumers con elementos inválidos.
expectFail('A24. allowedConsumers con número', health.validatePartialArtifactRef(makePartialArtifactRef({ allowedConsumers: [42] })), 'allowedConsumers[0]');
expectFail('A25. allowedConsumers con null', health.validatePartialArtifactRef(makePartialArtifactRef({ allowedConsumers: [null] })), 'allowedConsumers[0]');
expectFail('A26. allowedConsumers con objeto', health.validatePartialArtifactRef(makePartialArtifactRef({ allowedConsumers: [{ role: 'driver' }] })), 'allowedConsumers[0]');
expectFail('A26b. allowedConsumers con string vacío', health.validatePartialArtifactRef(makePartialArtifactRef({ allowedConsumers: [''] })), 'allowedConsumers[0]');

// A27. Expiración de artefacto anterior a su creación.
expectFail('A27. PartialArtifactRef con expiresAt < createdAt',
  health.validatePartialArtifactRef(makePartialArtifactRef({ createdAt: 1000, expiresAt: 500 })), 'expires_before_created');

// A28. Campo privado desconocido en snapshot (whitelist estricta).
expectFail('A28. snapshot con campo desconocido "text" rechazado',
  health.validateHealthSnapshot(makeHealthSnapshot({ text: 'contenido privado del proveedor' })), 'text');
expectFail('A28b. snapshot con campo desconocido "prompt" rechazado',
  health.validateHealthSnapshot(makeHealthSnapshot({ prompt: 'contenido privado' })), 'prompt');

// A29. Política de contenido anidado: una clave desconocida que envuelve
// contenido sensible se rechaza en bloque por no estar en la whitelist —
// no hace falta bajar recursivamente, nunca llega a validarse como válida.
expectFail('A29. contenido anidado bajo clave desconocida rechazado en bloque',
  health.validateAvailabilityChangedEvent(makeAvailabilityEvent({ metadata: { text: 'secreto anidado' } })), 'metadata');

// A30. Cada error esperado contiene simultáneamente path y reason.
{
  const result = health.validateAvailabilityChangedEvent({});
  check('A30. todos los errores tienen path Y reason como string no vacío',
    result.errors.length > 0 && result.errors.every(e => typeof e.path === 'string' && isNonEmptyString(e.reason)));
}

// A31. Validadores no mutan inputs (cobertura adicional sobre eventos de job/partial ref).
{
  const jobEvent = makeJobStateEvent();
  const jobSnapshot = JSON.parse(JSON.stringify(jobEvent));
  health.validateJobStateChangedEvent(jobEvent);
  check('A31. validar cloud.job.state.changed no muta el evento original', JSON.stringify(jobEvent) === JSON.stringify(jobSnapshot));
}

// A32. Inputs hostiles no hacen lanzar excepciones (superficie amplia).
{
  const hostileInputs = [
    undefined, null, 42, 'texto', true, [1, 2, 3], () => {}, new Date(), new Map(), new Set(),
    Object.create(null), Symbol('x'),
  ];
  let anyThrew = false;
  for (const input of hostileInputs) {
    try {
      health.validateEvidenceEntry(input);
      health.validatePartialArtifactRef(input);
      health.validateAvailabilityChangedEvent(input);
      health.validateRequestActivityChangedEvent(input);
      health.validateJobStateChangedEvent(input);
      health.validateHealthSnapshot(input);
      health.validateAttemptIdentity(input);
    } catch (_) { anyThrew = true; }
  }
  check('A32. ningún input hostil hace lanzar a ningún validador', anyThrew === false);
}

// ══════════ TESTS HOSTILES DE REFLEXIÓN Y ARRAYS (ronda final) ══════════
// Exigidos tras el veredicto CHANGES_REQUIRED sobre inputs hostiles:
// Reflect.ownKeys() lanzando vía Proxy, y getters/holes dentro de arrays
// canónicos (allowedConsumers, contradicts, evidence[]).

// H1-H7. Proxy cuyo trap ownKeys lanza — debe rechazarse, nunca {ok:true}.
{
  const hiddenTextValue = 'CONTENIDO_PRIVADO_QUE_NUNCA_DEBE_APARECER';
  const target = { ...makeEvidence(), text: hiddenTextValue }; // "text" prohibido, oculto tras la trampa
  const proxy = new Proxy(target, {
    ownKeys() { throw new Error('mensaje interno hostil del Proxy — no debe aparecer en ningún error'); },
    getOwnPropertyDescriptor(t, key) { return Object.getOwnPropertyDescriptor(t, key); },
  });
  let threw = false;
  let result = null;
  try { result = health.validateEvidenceEntry(proxy); } catch (_) { threw = true; }
  check('H1. Proxy EvidenceEntry con ownKeys hostil no lanza', threw === false);
  check('H2. Proxy EvidenceEntry con ownKeys hostil produce ok:false', result && result.ok === false);
  check('H3. el error tiene path y reason', result && result.errors.every(e => typeof e.path === 'string' && isNonEmptyString(e.reason)));
  check('H4. el reason representa fallo de reflexión', result && result.errors.some(e => e.reason === 'own_keys_reflection_failed'));
  check('H5. nunca termina en {ok:true, errors:[]}', !(result && result.ok === true));
  const serialized = JSON.stringify(result);
  check('H6. el contenido privado oculto tras la trampa no aparece en los errores', !serialized.includes(hiddenTextValue));
  check('H7. el mensaje interno del Proxy no aparece en los errores', !serialized.includes('mensaje interno hostil'));
}

// H8-H15. Getter hostil en allowedConsumers[0].
{
  let flagFlipped = false;
  const ref = makePartialArtifactRef();
  const arr = ['driver'];
  Object.defineProperty(arr, 0, { get() { flagFlipped = true; return 'driver'; }, enumerable: true, configurable: true });
  ref.allowedConsumers = arr;
  const result = health.validatePartialArtifactRef(ref);
  check('H8. getter en allowedConsumers[0] no se ejecuta', flagFlipped === false);
  check('H9. bandera permanece false tras validar', flagFlipped === false);
  expectFail('H10. getter (no accessor-safe) en allowedConsumers[0] produce error estructurado', result, 'allowedConsumers');
}
{
  const ref = makePartialArtifactRef();
  const arr = ['driver'];
  Object.defineProperty(arr, 0, { get() { throw new Error('allowedConsumers getter boom'); }, enumerable: true, configurable: true });
  ref.allowedConsumers = arr;
  let threw = false;
  let result = null;
  try { result = health.validatePartialArtifactRef(ref); } catch (_) { threw = true; }
  check('H11. getter en allowedConsumers[0] que lanzaría no escapa', threw === false);
  check('H12. produce error estructurado', result && result.ok === false);
}
{
  const ref = makePartialArtifactRef();
  const withHole = new Array(2);
  withHole[1] = 'driver'; // índice 0 es un hole real
  ref.allowedConsumers = withHole;
  expectFail('H13. allowedConsumers con hole es rechazado', health.validatePartialArtifactRef(ref), 'array_hole_not_allowed');
}
{
  const ref = makePartialArtifactRef();
  const hostileArr = new Proxy(['driver'], { ownKeys() { throw new Error('boom'); } });
  ref.allowedConsumers = hostileArr;
  expectFail('H14. allowedConsumers Proxy-array con ownKeys hostil es rechazado', health.validatePartialArtifactRef(ref), 'array_reflection_failed');
}
{
  const ref = makePartialArtifactRef();
  const hostileArr = new Proxy(['driver'], {
    getOwnPropertyDescriptor(t, key) { if (key === '0') throw new Error('boom'); return Reflect.getOwnPropertyDescriptor(t, key); },
  });
  ref.allowedConsumers = hostileArr;
  let threw = false;
  try { health.validatePartialArtifactRef(ref); } catch (_) { threw = true; }
  check('H15. allowedConsumers Proxy-array con getOwnPropertyDescriptor hostil no lanza', threw === false);
}

// H16-H20. Getter hostil en contradicts[0], y regresión de reglas ya aprobadas.
{
  let flagFlipped = false;
  const ev = makeEvidence({ evidenceId: 'ev-x' });
  const arr = ['ev-y'];
  Object.defineProperty(arr, 0, { get() { flagFlipped = true; return 'ev-y'; }, enumerable: true, configurable: true });
  ev.contradicts = arr;
  health.validateEvidenceEntry(ev);
  check('H16. getter en contradicts[0] no se ejecuta', flagFlipped === false);
}
{
  const ev = makeEvidence({ evidenceId: 'ev-x' });
  const arr = ['ev-y'];
  Object.defineProperty(arr, 0, { get() { throw new Error('contradicts getter boom'); }, enumerable: true, configurable: true });
  ev.contradicts = arr;
  let threw = false;
  let result = null;
  try { result = health.validateEvidenceEntry(ev); } catch (_) { threw = true; }
  check('H17. getter en contradicts[0] que lanzaría no escapa', threw === false);
  check('H18. produce error estructurado', result && result.ok === false);
}
{
  const ev = makeEvidence({ evidenceId: 'ev-x' });
  const withHole = new Array(1); // hole real en el índice 0
  ev.contradicts = withHole;
  expectFail('H19. contradicts con hole es rechazado', health.validateEvidenceEntry(ev), 'array_hole_not_allowed');
}
{
  // H20: tras el endurecimiento, las reglas de contradicts ya aprobadas
  // siguen funcionando exactamente igual con arrays ordinarios normales.
  const evValid = makeEvidence({ evidenceId: 'ok-a', contradicts: ['ok-b'] });
  const evB = makeEvidence({ evidenceId: 'ok-b' });
  expectOk('H20a. referencia válida sigue pasando', health.validateEvidenceList([evValid, evB]));
  expectFail('H20b. referencia inexistente sigue rechazada',
    health.validateEvidenceList([makeEvidence({ evidenceId: 'ref-a', contradicts: ['no-existe'] })]), 'unknown_evidence_id');
  expectFail('H20c. self-contradiction sigue rechazada',
    health.validateEvidenceEntry(makeEvidence({ evidenceId: 'self-x', contradicts: ['self-x'] })), 'self_contradiction_not_allowed');
  {
    const cycA = makeEvidence({ evidenceId: 'cx-a', contradicts: ['cx-b'] });
    const cycB = makeEvidence({ evidenceId: 'cx-b', contradicts: ['cx-a'] });
    expectFail('H20d. ciclo sigue rechazado', health.validateEvidenceList([cycA, cycB]), 'contradiction_cycle_detected');
  }
}

// H21-H28. Getter hostil en evidence[0] dentro de un evento completo, y
// regresiones sobre evidence[] tras el endurecimiento.
{
  let flagFlipped = false;
  const event = makeAvailabilityEvent();
  const arr = [makeEvidence()];
  Object.defineProperty(arr, 0, { get() { flagFlipped = true; return makeEvidence(); }, enumerable: true, configurable: true });
  event.evidence = arr;
  health.validateAvailabilityChangedEvent(event);
  check('H21. getter en evidence[0] no se ejecuta', flagFlipped === false);
}
{
  const event = makeAvailabilityEvent();
  const arr = [makeEvidence()];
  Object.defineProperty(arr, 0, { get() { throw new Error('evidence getter boom'); }, enumerable: true, configurable: true });
  event.evidence = arr;
  let threw = false;
  let result = null;
  try { result = health.validateAvailabilityChangedEvent(event); } catch (_) { threw = true; }
  check('H22. getter en evidence[0] que lanzaría no escapa', threw === false);
  check('H23. produce error estructurado', result && result.ok === false);
}
{
  const event = makeAvailabilityEvent();
  const withHole = new Array(1);
  event.evidence = withHole;
  expectFail('H24. evidence con hole es rechazado', health.validateAvailabilityChangedEvent(event), 'array_hole_not_allowed');
}
{
  const event = makeAvailabilityEvent();
  event.evidence = new Proxy([makeEvidence()], { ownKeys() { throw new Error('boom'); } });
  expectFail('H25. evidence Proxy-array con traps hostiles rechazado',
    health.validateAvailabilityChangedEvent(event), 'array_reflection_failed');
}
expectOk('H26. lista ordinaria válida sigue pasando', health.validateEvidenceList([makeEvidence({ evidenceId: 'ord-1' })]));
{
  const dup1 = makeEvidence({ evidenceId: 'ord-dup' });
  const dup2 = makeEvidence({ evidenceId: 'ord-dup' });
  const result = health.validateEvidenceList([dup1, dup2]);
  check('H27. IDs duplicados siguen rechazándose', result.ok === false && result.errors.some(e => e.reason.startsWith('duplicate_evidence_id')));
}
{
  // H28: el resultado es independiente del orden de las evidencias.
  const evA = makeEvidence({ evidenceId: 'order-a' });
  const evB = makeEvidence({ evidenceId: 'order-b', contradicts: ['order-a'] });
  const forward = health.validateEvidenceList([evA, evB]);
  const backward = health.validateEvidenceList([evB, evA]);
  check('H28. resultado independiente del orden', forward.ok === backward.ok && forward.ok === true);
}

// H29. Ningún test anterior fue debilitado — smoke check final de que las
// funciones canónicas siguen siendo las mismas y las garantías previas
// (N1-N29b, A1-A32, 1-25) siguen intactas: ya se ejecutaron arriba sin
// modificarlas; esto solo confirma que el namespace no quedó dañado por
// los Proxies usados en esta sección.
check('H29. AvailabilityState sigue siendo el canónico tras los tests hostiles', health.AvailabilityState.READY === 'READY' && Object.isFrozen(health.AvailabilityState));
check('H29b. validateEvidenceEntry sigue siendo función', typeof health.validateEvidenceEntry === 'function');

// ══════════════════════════ RESULTADO ══════════════════════════
if (failures > 0) {
  console.error(`\n${failures} verificacion(es) fallaron.`);
  process.exit(1);
}
console.log('OK — contrato puro de Provider Health Sensor (types.js + validate.js) verificado: enums, helpers y validadores de los 3 contratos de evento + EvidenceEntry + PartialArtifactRef.');
