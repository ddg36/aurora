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

// types.js/validate.js son scripts clásicos (IIFE, sin export/import) por
// diseño — deben poder cargarse como content script real. Los evaluamos en
// un contexto aislado propio (node:vm) en vez de usar el global del test
// runner, para no contaminarlo ni depender de un side-effect global real.
const sandbox = {};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(readFileSync(typesPath, 'utf8'), sandbox, { filename: typesPath });
vm.runInContext(readFileSync(validatePath, 'utf8'), sandbox, { filename: validatePath });

const health = sandbox.__auroraProviderHealth;

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

// ══════════════════════════ RESULTADO ══════════════════════════
if (failures > 0) {
  console.error(`\n${failures} verificacion(es) fallaron.`);
  process.exit(1);
}
console.log('OK — contrato puro de Provider Health Sensor (types.js + validate.js) verificado: enums, helpers y validadores de los 3 contratos de evento + EvidenceEntry + PartialArtifactRef.');
