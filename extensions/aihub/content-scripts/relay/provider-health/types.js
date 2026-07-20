// Provider Health Sensor — Checkpoint 1: tipos y constantes puras.
// Contrato canónico: docs/audits/provider-health-sensor-discovery-claude.md (v4).
// Sin DOM, sin chrome.*, sin red, sin estado runtime. Clásico/IIFE (mismo
// patrón que relay-contract.js) — no ESM, para poder cargarse como content
// script y también como script clásico desde tests.
(() => {
  'use strict';
  const health = globalThis.__auroraProviderHealth ||= {};

  // Versión del contrato completo (no de cada evento individual).
  const CONTRACT_VERSION = 1;

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

  health.CONTRACT_VERSION = CONTRACT_VERSION;
  health.AvailabilityState = AvailabilityState;
  health.RequestActivityState = RequestActivityState;
  health.ACTIVE_REQUEST_ACTIVITY_STATES = ACTIVE_REQUEST_ACTIVITY_STATES;
  health.JobState = JobState;
  health.ChannelState = ChannelState;
  health.CHANNEL_ONLINE_PROPOSED_DERIVED = CHANNEL_ONLINE_PROPOSED_DERIVED;
  health.Confidence = Confidence;
  health.EventName = EventName;
  health.AVAILABILITY_SOURCE = AVAILABILITY_SOURCE;
})();
