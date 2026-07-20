// Provider Health Sensor — Checkpoint 1: tipos y constantes puras.
// Contrato canónico: docs/audits/provider-health-sensor-discovery-claude.md (v4).
// Sin DOM, sin chrome.*, sin red, sin estado runtime. Clásico/IIFE (mismo
// patrón que relay-contract.js) — no ESM, para poder cargarse como content
// script y también como script clásico desde tests.
//
// Namespace: cada miembro público se define con Object.defineProperty
// (writable:false, configurable:false) — un consumidor no puede
// reasignar AvailabilityState, EventName, etc. una vez cargado. El
// objeto namespace en sí NO se congela (Object.freeze) para que
// validate.js pueda seguir agregando SUS propios miembros después —
// solo cada clave individual, una vez definida, queda fija.
(() => {
  'use strict';

  const CONTRACT_VERSION = 1;

  // Compatibilidad de recarga: dos objetos "iguales" (mismas claves,
  // mismos valores primitivos) se tratan como el mismo contrato — permite
  // cargar types.js dos veces sin error. Cualquier otra forma existente
  // bajo la misma clave se considera un namespace incompatible.
  function shallowEqualPlain(a, b) {
    if (a === b) return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
    const ak = Object.keys(a);
    const bk = Object.keys(b);
    if (ak.length !== bk.length) return false;
    return ak.every(k => a[k] === b[k]);
  }

  function defineLocked(target, key, value, isCompatible = (a, b) => a === b) {
    if (Object.prototype.hasOwnProperty.call(target, key)) {
      const existing = target[key];
      if (isCompatible(existing, value)) return existing; // recarga idéntica: conservar lo ya definido
      throw new Error(
        `__auroraProviderHealth: redefinición incompatible de "${key}" — namespace preexistente no coincide con el contrato v${CONTRACT_VERSION}.`,
      );
    }
    Object.defineProperty(target, key, { value, writable: false, configurable: false, enumerable: true });
    return value;
  }

  const existingNamespace = globalThis.__auroraProviderHealth;
  if (existingNamespace !== undefined
    && (typeof existingNamespace !== 'object' || existingNamespace === null)) {
    throw new Error('__auroraProviderHealth: el namespace preexistente no es un objeto — incompatible.');
  }
  if (existingNamespace
    && Object.prototype.hasOwnProperty.call(existingNamespace, '__contractVersion')
    && existingNamespace.__contractVersion !== CONTRACT_VERSION) {
    throw new Error(
      `__auroraProviderHealth: versión de contrato incompatible (existente=${existingNamespace.__contractVersion}, actual=${CONTRACT_VERSION}).`,
    );
  }
  const health = globalThis.__auroraProviderHealth = existingNamespace || {};

  // Dos funciones nunca son === entre cargas del mismo script (closures
  // nuevos cada vez) — tratarlas como compatibles por TIPO permite que una
  // segunda carga sea segura y determinista (contrato: "segunda carga
  // determinista/no debe lanzar").
  const bothFunctions = (a, b) => typeof a === 'function' && typeof b === 'function';

  defineLocked(health, '__contractVersion', CONTRACT_VERSION);
  defineLocked(health, '__defineLocked', defineLocked, bothFunctions);
  defineLocked(health, '__shallowEqualPlain', shallowEqualPlain, bothFunctions);

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

  defineLocked(health, 'CONTRACT_VERSION', CONTRACT_VERSION);
  defineLocked(health, 'AvailabilityState', AvailabilityState, shallowEqualPlain);
  defineLocked(health, 'RequestActivityState', RequestActivityState, shallowEqualPlain);
  defineLocked(health, 'ACTIVE_REQUEST_ACTIVITY_STATES', ACTIVE_REQUEST_ACTIVITY_STATES,
    (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]));
  defineLocked(health, 'JobState', JobState, shallowEqualPlain);
  defineLocked(health, 'JOB_STATES_REQUIRING_ATTEMPT', JOB_STATES_REQUIRING_ATTEMPT,
    (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]));
  defineLocked(health, 'ChannelState', ChannelState, shallowEqualPlain);
  defineLocked(health, 'CHANNEL_ONLINE_PROPOSED_DERIVED', CHANNEL_ONLINE_PROPOSED_DERIVED);
  defineLocked(health, 'Confidence', Confidence, shallowEqualPlain);
  defineLocked(health, 'EventName', EventName, shallowEqualPlain);
  defineLocked(health, 'AVAILABILITY_SOURCE', AVAILABILITY_SOURCE);
})();
