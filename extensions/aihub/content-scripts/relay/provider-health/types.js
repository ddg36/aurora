// Provider Health Sensor — Checkpoint 1: tipos y constantes puras.
// Contrato canónico: docs/audits/provider-health-sensor-discovery-claude.md (v4).
// Sin DOM, sin chrome.*, sin red, sin estado runtime. Clásico/IIFE (mismo
// patrón que relay-contract.js) — no ESM, para poder cargarse como content
// script y también como script clásico desde tests.
//
// Protección de namespace (dos capas):
//   1. El binding `globalThis.__auroraProviderHealth` en sí queda bloqueado
//      (writable:false, configurable:false) apenas se crea — una
//      reasignación directa o un `delete` no tienen efecto sobre el
//      namespace ya instalado.
//   2. El objeto namespace en sí NO se congela (no Object.freeze) — sigue
//      extensible para que validate.js pueda agregar SUS propios miembros
//      después. En cambio, cada miembro conocido se instala con
//      Object.defineProperty (writable:false, configurable:false): una vez
//      definido, esa clave puntual no puede reasignarse ni redefinirse.
//
// Un namespace preexistente (p.ej. una recarga legítima de este mismo
// script, o un objeto plantado por otro código en el mismo realm ANTES de
// que este script corra) se acepta ÚNICAMENTE si:
//   a) el binding global ya está bloqueado (mismo descriptor writable:false/
//      configurable:false que instalamos nosotros), Y
//   b) el objeto tiene, como propiedad propia también bloqueada, una marca
//      canónica (Symbol.for de un nombre fijo) con valor `true`, Y
//   c) `__contractVersion` coincide.
// Cualquier otra forma se rechaza (throw) en vez de adoptarse en silencio.
// Límite honesto: en un mismo realm de JS no existe secreto verdadero — un
// script que replique exactamente este mecanismo (mismo Symbol.for, mismos
// descriptores) podría en teoría suplantarlo. Esto cubre el caso realista
// exigido por el contrato (namespace ajeno/no intencional, forma incorrecta,
// binding no bloqueado), no un adversario que reimplemente el mecanismo
// byte a byte.
(() => {
  'use strict';

  const CONTRACT_VERSION = 1;
  const MARKER_KEY = Symbol.for('__auroraProviderHealth:canonical:v1');

  function isLockedDataDescriptor(desc) {
    return !!desc && desc.writable === false && desc.configurable === false
      && Object.prototype.hasOwnProperty.call(desc, 'value');
  }

  function verifyCanonicalNamespace(ns) {
    if (!ns || typeof ns !== 'object') return false;
    const markerDesc = Object.getOwnPropertyDescriptor(ns, MARKER_KEY);
    if (!isLockedDataDescriptor(markerDesc) || markerDesc.value !== true) return false;
    const versionDesc = Object.getOwnPropertyDescriptor(ns, '__contractVersion');
    if (!isLockedDataDescriptor(versionDesc) || versionDesc.value !== CONTRACT_VERSION) return false;
    return true;
  }

  const globalDesc = Object.getOwnPropertyDescriptor(globalThis, '__auroraProviderHealth');
  let health;
  if (globalDesc === undefined) {
    // Primera carga real en este proceso: crear el namespace desde cero y
    // bloquear el binding global inmediatamente.
    health = {};
    Object.defineProperty(health, MARKER_KEY, { value: true, writable: false, configurable: false, enumerable: false });
    Object.defineProperty(health, '__contractVersion', { value: CONTRACT_VERSION, writable: false, configurable: false, enumerable: true });
    Object.defineProperty(globalThis, '__auroraProviderHealth', { value: health, writable: false, configurable: false, enumerable: true });
  } else {
    if (!isLockedDataDescriptor(globalDesc)) {
      throw new Error('__auroraProviderHealth: binding global preexistente no está bloqueado (writable/configurable) — namespace no confiable.');
    }
    health = globalDesc.value;
    if (!verifyCanonicalNamespace(health)) {
      throw new Error('__auroraProviderHealth: namespace preexistente no supera la verificación canónica (marca o versión de contrato ausente/incorrecta).');
    }
    // Namespace ya verificado como canónico (recarga legítima de este mismo
    // script, u otro script que ya pasó por este mismo bootstrap) — se
    // reutiliza tal cual, sin volver a tocar sus miembros ya definidos.
  }

  // Instala un miembro nuevo bloqueado. Si la clave YA existe, el namespace
  // completo ya pasó la verificación canónica de arriba — se confía en el
  // valor existente y NO se compara/reemplaza (recarga determinista, sin
  // depender de comparar identidad de closures entre dos evaluaciones).
  function defineLocked(key, value) {
    if (Object.prototype.hasOwnProperty.call(health, key)) return health[key];
    Object.defineProperty(health, key, { value, writable: false, configurable: false, enumerable: true });
    return value;
  }

  defineLocked('__defineLocked', defineLocked);
  defineLocked('__isLockedDataDescriptor', isLockedDataDescriptor);
  defineLocked('__verifyCanonicalNamespace', verifyCanonicalNamespace);
  defineLocked('__MARKER_KEY', MARKER_KEY);

  // ── Availability — propiedad del proveedor/cuenta/sesión ───────────────
  // Autoridad exclusiva: un adapter. Nunca Endpoint Registry ni el harness
  // de test (ver contrato, sección 4.1).
  const AvailabilityState = Object.freeze({
    READY: 'READY',
    RATE_LIMITED: 'RATE_LIMITED',
    QUOTA_EXHAUSTED: 'QUOTA_EXHAUSTED',
    AUTH_REQUIRED: 'AUTH_REQUIRED',
    CHALLENGE_REQUIRED: 'CHALLENGE_REQUIRED',
    TEMP_UNAVAILABLE: 'TEMP_UNAVAILABLE',
    RESTRICTED: 'RESTRICTED',
    UNKNOWN: 'UNKNOWN',
  });

  // ── RequestActivity — propiedad de UN request individual al proveedor ──
  // Nunca incluye PAUSED/BLOCKED — esos viven en JobState (contrato, § 3).
  const RequestActivityState = Object.freeze({
    IDLE: 'IDLE',
    QUEUED: 'QUEUED',
    SUBMITTED: 'SUBMITTED',
    WAITING_FIRST_OUTPUT: 'WAITING_FIRST_OUTPUT',
    PROGRESSING: 'PROGRESSING',
    STALLED: 'STALLED',
    INTERRUPTED: 'INTERRUPTED',
    COMPLETED: 'COMPLETED',
    FAILED: 'FAILED',
    CANCELLED: 'CANCELLED',
    UNKNOWN: 'UNKNOWN',
  });

  // Subconjunto de RequestActivityState que cuenta como "no terminal" —
  // define exactamente JobState.ACTIVE (contrato, § 3: "JobState.ACTIVE").
  const ACTIVE_REQUEST_ACTIVITY_STATES = Object.freeze([
    RequestActivityState.QUEUED,
    RequestActivityState.SUBMITTED,
    RequestActivityState.WAITING_FIRST_OUTPUT,
    RequestActivityState.PROGRESSING,
    RequestActivityState.STALLED,
  ]);

  // ── JobState — propiedad del job lógico persistido ──────────────────────
  const JobState = Object.freeze({
    CREATED: 'CREATED',
    ACTIVE: 'ACTIVE',
    PAUSED: 'PAUSED',
    BLOCKED: 'BLOCKED',
    WAITING_TOOL: 'WAITING_TOOL',
    WAITING_RESULT: 'WAITING_RESULT',
    WAITING_FEEDBACK: 'WAITING_FEEDBACK',
    COMPLETED: 'COMPLETED',
    FAILED: 'FAILED',
    CANCELLED: 'CANCELLED',
    UNKNOWN: 'UNKNOWN',
  });

  // JobState en los que currentAttempt NO puede ser null — el job tiene (o
  // debería tener) un intento real en curso (contrato § 4.3 + corrección
  // exigida por Navigator/Orchestrator sobre currentAttempt:null).
  const JOB_STATES_REQUIRING_ATTEMPT = Object.freeze([
    JobState.ACTIVE,
    JobState.PAUSED,
    JobState.BLOCKED,
    JobState.WAITING_TOOL,
    JobState.WAITING_RESULT,
    JobState.WAITING_FEEDBACK,
  ]);

  // ── Channel — propiedad del endpoint físico ──────────────────────────────
  // Únicamente los estados que endpoint-registry.js produce hoy (verificado
  // por lectura de código). ONLINE queda fuera del enum canónico — ver
  // CHANNEL_ONLINE_PROPOSED_DERIVED, nunca producido hoy por el registro.
  const ChannelState = Object.freeze({
    BOOTING: 'BOOTING',
    IDLE: 'IDLE',
    GENERATING: 'GENERATING',
    DISCARDED: 'DISCARDED',
    FROZEN: 'FROZEN',
    OFFLINE: 'OFFLINE',
    UNKNOWN: 'UNKNOWN',
  });

  // Estado propuesto/derivado, NO parte de ChannelState canónico — el
  // contrato exige no presentarlo como producido hoy por Endpoint Registry.
  const CHANNEL_ONLINE_PROPOSED_DERIVED = 'ONLINE';

  // ── Confidence — nunca por conteo bruto de señales (ver contrato § 6) ──
  const Confidence = Object.freeze({
    HIGH: 'HIGH',
    MEDIUM: 'MEDIUM',
    LOW: 'LOW',
    UNKNOWN: 'UNKNOWN',
  });

  // ── Nombres de evento — exactamente los tres contratos aprobados ───────
  // provider.activity.changed y provider.channel.changed NO existen — ver
  // contrato § 4 (decisión explícita de no crearlos en este checkpoint).
  const EventName = Object.freeze({
    AVAILABILITY_CHANGED: 'provider.availability.changed',
    REQUEST_ACTIVITY_CHANGED: 'provider.request.activity.changed',
    JOB_STATE_CHANGED: 'cloud.job.state.changed',
    HEALTH_SNAPSHOT: 'provider.health.snapshot',
  });

  // Única fuente autoritativa válida para provider.availability.changed.
  // "endpoint_registry" y "harness" quedan explícitamente excluidos.
  const AVAILABILITY_SOURCE = 'adapter';

  defineLocked('CONTRACT_VERSION', CONTRACT_VERSION);
  defineLocked('AvailabilityState', AvailabilityState);
  defineLocked('RequestActivityState', RequestActivityState);
  defineLocked('ACTIVE_REQUEST_ACTIVITY_STATES', ACTIVE_REQUEST_ACTIVITY_STATES);
  defineLocked('JobState', JobState);
  defineLocked('JOB_STATES_REQUIRING_ATTEMPT', JOB_STATES_REQUIRING_ATTEMPT);
  defineLocked('ChannelState', ChannelState);
  defineLocked('CHANNEL_ONLINE_PROPOSED_DERIVED', CHANNEL_ONLINE_PROPOSED_DERIVED);
  defineLocked('Confidence', Confidence);
  defineLocked('EventName', EventName);
  defineLocked('AVAILABILITY_SOURCE', AVAILABILITY_SOURCE);
})();
