// Provider Health Sensor — Checkpoint 1: validadores puros de forma.
// Contrato canónico: docs/audits/provider-health-sensor-discovery-claude.md (v4).
// Mismo patrón que validateProviderAdapter (relay-contract.js): funciones
// puras, sin mutar el input, sin lanzar por inputs ordinarios inválidos —
// devuelven { ok, errors[] }. Clásico/IIFE, sin ESM.
(() => {
  'use strict';
  const health = globalThis.__auroraProviderHealth ||= {};
  const types = health;

  const isPlainObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const isNonEmptyString = v => typeof v === 'string' && v.length > 0;
  const isFiniteNumber = v => typeof v === 'number' && Number.isFinite(v);
  const isNullableString = v => v === null || isNonEmptyString(v);
  const isNullableNumber = v => v === null || isFiniteNumber(v);

  const ok = () => ({ ok: true, errors: [] });
  const fail = errors => ({ ok: false, errors });

  function pushIf(errors, cond, path, reason) {
    if (cond) errors.push({ path, reason });
  }

  // ── Helpers de pertenencia a enum ──────────────────────────────────────
  // Los enums son { KEY: 'KEY' } — key === value, así que el propio objeto
  // sirve como set de pertenencia vía hasOwnProperty, sin reconstruir un Set.
  const inEnum = (enumObj, v) => typeof v === 'string' && Object.prototype.hasOwnProperty.call(enumObj, v);
  const isAvailabilityState = v => inEnum(types.AvailabilityState, v);
  const isRequestActivityState = v => inEnum(types.RequestActivityState, v);
  const isJobState = v => inEnum(types.JobState, v);
  const isChannelState = v => inEnum(types.ChannelState, v);
  const isConfidence = v => inEnum(types.Confidence, v);

  // JobState.ACTIVE corresponde exactamente a un RequestActivity no
  // terminal (contrato § 3: definición explícita de ACTIVE). QUEUED,
  // SUBMITTED, WAITING_FIRST_OUTPUT, PROGRESSING, STALLED cuentan; IDLE y
  // los terminales (COMPLETED/FAILED/CANCELLED/INTERRUPTED) no por sí solos.
  const isActiveRequestActivity = v => types.ACTIVE_REQUEST_ACTIVITY_STATES.includes(v);

  // ── EvidenceEntry (contrato § 6) ────────────────────────────────────────
  // Prohibido por defecto: texto libre/contenido sensible. Ver contrato § 7.
  const FORBIDDEN_EVIDENCE_FIELDS = ['text', 'rawText', 'normalizedText', 'content', 'hash', 'textHash'];

  function validateEvidenceEntry(entry, { knownEvidenceIds = null } = {}) {
    const errors = [];
    if (!isPlainObject(entry)) return fail([{ path: '', reason: 'evidence_entry_must_be_object' }]);

    pushIf(errors, !isNonEmptyString(entry.evidenceId), 'evidenceId', 'required_non_empty_string');
    pushIf(errors, !isNonEmptyString(entry.sourceClass), 'sourceClass', 'required_non_empty_string');
    pushIf(errors, entry.authority !== 'structural' && entry.authority !== 'heuristic',
      'authority', 'must_be_structural_or_heuristic');
    pushIf(errors, !isNonEmptyString(entry.correlationGroup), 'correlationGroup', 'required_non_empty_string');
    pushIf(errors, entry.patternId !== null && !isNonEmptyString(entry.patternId),
      'patternId', 'must_be_string_or_null');
    pushIf(errors, !isNonEmptyString(entry.reasonCode), 'reasonCode', 'required_non_empty_string');
    pushIf(errors, !isNonEmptyString(entry.logicalProviderId), 'logicalProviderId', 'required_non_empty_string');
    pushIf(errors, !isNonEmptyString(entry.effectiveAdapterId), 'effectiveAdapterId', 'required_non_empty_string');
    pushIf(errors, !isFiniteNumber(entry.observedAt), 'observedAt', 'required_finite_number');
    pushIf(errors, !isFiniteNumber(entry.expiresAt), 'expiresAt', 'required_finite_number');
    pushIf(errors, !isNullableString(entry.previousState), 'previousState', 'must_be_string_or_null');

    if (entry.contradicts !== null && entry.contradicts !== undefined) {
      if (!Array.isArray(entry.contradicts)) {
        errors.push({ path: 'contradicts', reason: 'must_be_array_or_null' });
      } else {
        entry.contradicts.forEach((id, i) => {
          pushIf(errors, !isNonEmptyString(id), `contradicts[${i}]`, 'must_be_non_empty_string');
          // Referencial: si se provee el conjunto de evidenceId conocidos
          // (todas las evidencias del mismo evento), toda referencia debe
          // resolver a una entrada real — contrato § 6 (contradicts referencia
          // evidenceId real, no texto libre).
          if (knownEvidenceIds && isNonEmptyString(id) && !knownEvidenceIds.has(id)) {
            errors.push({ path: `contradicts[${i}]`, reason: 'unknown_evidence_id' });
          }
        });
      }
    }

    for (const forbidden of FORBIDDEN_EVIDENCE_FIELDS) {
      pushIf(errors, Object.prototype.hasOwnProperty.call(entry, forbidden),
        forbidden, 'forbidden_sensitive_field');
    }

    return errors.length ? fail(errors) : ok();
  }

  function validateEvidenceList(list) {
    if (!Array.isArray(list)) return fail([{ path: '', reason: 'evidence_must_be_array' }]);
    const knownEvidenceIds = new Set(
      list.filter(e => isPlainObject(e) && isNonEmptyString(e.evidenceId)).map(e => e.evidenceId),
    );
    const errors = [];
    list.forEach((entry, i) => {
      const result = validateEvidenceEntry(entry, { knownEvidenceIds });
      result.errors.forEach(e => errors.push({ path: `[${i}].${e.path}`, reason: e.reason }));
    });
    return errors.length ? fail(errors) : ok();
  }

  // ── AttemptIdentity / currentAttempt (contrato § 4.3, § 8) ─────────────
  function validateAttemptIdentity(attempt) {
    if (attempt === null) return ok(); // JobState.CREATED sin intento todavía
    const errors = [];
    if (!isPlainObject(attempt)) return fail([{ path: '', reason: 'attempt_must_be_object_or_null' }]);
    pushIf(errors, !isNonEmptyString(attempt.attemptId), 'attemptId', 'required_non_empty_string');
    pushIf(errors, !isNonEmptyString(attempt.logicalProviderId), 'logicalProviderId', 'required_non_empty_string');
    pushIf(errors, !isNonEmptyString(attempt.effectiveAdapterId), 'effectiveAdapterId', 'required_non_empty_string');
    pushIf(errors, !isNullableString(attempt.requestId), 'requestId', 'must_be_string_or_null');
    return errors.length ? fail(errors) : ok();
  }

  // ── PartialArtifactRef (contrato § 7) ──────────────────────────────────
  const FORBIDDEN_ARTIFACT_FIELDS = ['text', 'content', 'raw', 'rawText', 'body', 'prompt', 'response'];
  const PRIVACY_CLASSES = ['PRIVATE', 'TEAM', 'MISSION', 'SHAREABLE'];

  function validatePartialArtifactRef(ref) {
    if (ref === null) return ok();
    const errors = [];
    if (!isPlainObject(ref)) return fail([{ path: '', reason: 'artifact_ref_must_be_object_or_null' }]);
    pushIf(errors, !isNonEmptyString(ref.artifactId), 'artifactId', 'required_non_empty_string');
    pushIf(errors, !isNonEmptyString(ref.ownerLogicalJobId), 'ownerLogicalJobId', 'required_non_empty_string');
    pushIf(errors, !PRIVACY_CLASSES.includes(ref.privacyClass), 'privacyClass', 'required_privacy_class');
    pushIf(errors, !isFiniteNumber(ref.createdAt), 'createdAt', 'required_finite_number');
    pushIf(errors, !isFiniteNumber(ref.expiresAt), 'expiresAt', 'required_finite_number');
    pushIf(errors, !Array.isArray(ref.allowedConsumers), 'allowedConsumers', 'required_array');
    pushIf(errors, typeof ref.hasContent !== 'boolean', 'hasContent', 'required_boolean');
    pushIf(errors, ref.approxSize !== null && ref.approxSize !== undefined && !isFiniteNumber(ref.approxSize),
      'approxSize', 'must_be_number_or_null');

    for (const forbidden of FORBIDDEN_ARTIFACT_FIELDS) {
      pushIf(errors, Object.prototype.hasOwnProperty.call(ref, forbidden),
        forbidden, 'forbidden_embedded_content');
    }

    return errors.length ? fail(errors) : ok();
  }

  // ── Eventos ──────────────────────────────────────────────────────────

  function validateCommonEventFields(event, errors) {
    pushIf(errors, event.eventVersion !== types.CONTRACT_VERSION, 'eventVersion', 'must_match_contract_version');
    pushIf(errors, !isNonEmptyString(event.eventId), 'eventId', 'required_non_empty_string');
    pushIf(errors, !isFiniteNumber(event.sequence) || event.sequence < 0,
      'sequence', 'required_non_negative_number');
    pushIf(errors, !isFiniteNumber(event.observedAt), 'observedAt', 'required_finite_number');
  }

  // provider.availability.changed (contrato § 4.1) — source SOLO "adapter".
  function validateAvailabilityChangedEvent(event) {
    const errors = [];
    if (!isPlainObject(event)) return fail([{ path: '', reason: 'event_must_be_object' }]);
    validateCommonEventFields(event, errors);
    pushIf(errors, !isNonEmptyString(event.logicalProviderId), 'logicalProviderId', 'required_non_empty_string');
    pushIf(errors, !isNonEmptyString(event.effectiveAdapterId), 'effectiveAdapterId', 'required_non_empty_string');
    pushIf(errors, !isNonEmptyString(event.paneId), 'paneId', 'required_non_empty_string');
    pushIf(errors, !isNullableString(event.sessionId), 'sessionId', 'must_be_string_or_null');
    pushIf(errors, !isAvailabilityState(event.previousState), 'previousState', 'must_be_availability_state');
    pushIf(errors, !isAvailabilityState(event.state), 'state', 'must_be_availability_state');
    pushIf(errors, !isNonEmptyString(event.reasonCode), 'reasonCode', 'required_non_empty_string');
    pushIf(errors, !isConfidence(event.confidence), 'confidence', 'must_be_confidence_value');
    pushIf(errors, !isNullableNumber(event.retryAfter), 'retryAfter', 'must_be_number_or_null');
    // Única fuente autoritativa válida: "adapter". endpoint_registry y
    // harness quedan explícitamente rechazados (contrato § 4.1, § 12).
    pushIf(errors, event.source !== types.AVAILABILITY_SOURCE, 'source', 'must_be_adapter_only');

    if (!Array.isArray(event.evidence)) {
      errors.push({ path: 'evidence', reason: 'required_array' });
    } else {
      const result = validateEvidenceList(event.evidence);
      result.errors.forEach(e => errors.push({ path: `evidence${e.path}`, reason: e.reason }));
    }

    return errors.length ? fail(errors) : ok();
  }

  // provider.request.activity.changed (contrato § 4.2) — nunca PAUSED/BLOCKED.
  function validateRequestActivityChangedEvent(event) {
    const errors = [];
    if (!isPlainObject(event)) return fail([{ path: '', reason: 'event_must_be_object' }]);
    validateCommonEventFields(event, errors);
    pushIf(errors, !isNonEmptyString(event.logicalProviderId), 'logicalProviderId', 'required_non_empty_string');
    pushIf(errors, !isNonEmptyString(event.effectiveAdapterId), 'effectiveAdapterId', 'required_non_empty_string');
    pushIf(errors, !isNonEmptyString(event.paneId), 'paneId', 'required_non_empty_string');
    pushIf(errors, !isNullableString(event.sessionId), 'sessionId', 'must_be_string_or_null');
    pushIf(errors, !isNonEmptyString(event.logicalJobId), 'logicalJobId', 'required_non_empty_string');
    pushIf(errors, !isNonEmptyString(event.attemptId), 'attemptId', 'required_non_empty_string');
    pushIf(errors, !isNullableString(event.requestId), 'requestId', 'must_be_string_or_null');
    pushIf(errors, !isRequestActivityState(event.previousActivity), 'previousActivity', 'must_be_request_activity_state');
    pushIf(errors, !isRequestActivityState(event.activity), 'activity', 'must_be_request_activity_state');
    // JobState nunca es un valor válido de RequestActivity — PAUSED/BLOCKED
    // pertenecen a otro eje (contrato § 3, § 5 filas 3/8).
    pushIf(errors, event.activity === 'PAUSED' || event.activity === 'BLOCKED',
      'activity', 'paused_and_blocked_belong_to_job_state_not_request_activity');
    pushIf(errors, !isNullableNumber(event.lastProgressAt), 'lastProgressAt', 'must_be_number_or_null');
    pushIf(errors, !isNullableString(event.terminalReason), 'terminalReason', 'must_be_string_or_null');

    return errors.length ? fail(errors) : ok();
  }

  // cloud.job.state.changed (contrato § 4.3) — incluye currentAttempt.
  function validateJobStateChangedEvent(event) {
    const errors = [];
    if (!isPlainObject(event)) return fail([{ path: '', reason: 'event_must_be_object' }]);
    validateCommonEventFields(event, errors);
    pushIf(errors, !isNonEmptyString(event.logicalJobId), 'logicalJobId', 'required_non_empty_string');
    pushIf(errors, !isNullableString(event.turnId), 'turnId', 'must_be_string_or_null');
    pushIf(errors, !isNonEmptyString(event.paneId), 'paneId', 'required_non_empty_string');
    pushIf(errors, !isJobState(event.previousState), 'previousState', 'must_be_job_state');
    pushIf(errors, !isJobState(event.state), 'state', 'must_be_job_state');

    if (!Object.prototype.hasOwnProperty.call(event, 'currentAttempt')) {
      errors.push({ path: 'currentAttempt', reason: 'required_field_missing' });
    } else {
      const result = validateAttemptIdentity(event.currentAttempt);
      result.errors.forEach(e => errors.push({ path: `currentAttempt.${e.path}`, reason: e.reason }));
    }

    pushIf(errors, event.state === types.JobState.PAUSED && !isNonEmptyString(event.pauseReason),
      'pauseReason', 'required_when_state_is_paused');
    pushIf(errors, event.state === types.JobState.BLOCKED && !isNonEmptyString(event.blockedReason),
      'blockedReason', 'required_when_state_is_blocked');
    pushIf(errors, event.pauseReason !== null && event.pauseReason !== undefined && !isNonEmptyString(event.pauseReason),
      'pauseReason', 'must_be_string_or_null');
    pushIf(errors, event.blockedReason !== null && event.blockedReason !== undefined && !isNonEmptyString(event.blockedReason),
      'blockedReason', 'must_be_string_or_null');
    pushIf(errors, !isNullableString(event.durableClaim), 'durableClaim', 'must_be_string_or_null');

    if (!Object.prototype.hasOwnProperty.call(event, 'partialArtifactRef')) {
      errors.push({ path: 'partialArtifactRef', reason: 'required_field_missing' });
    } else {
      const result = validatePartialArtifactRef(event.partialArtifactRef);
      result.errors.forEach(e => errors.push({ path: `partialArtifactRef.${e.path}`, reason: e.reason }));
    }

    return errors.length ? fail(errors) : ok();
  }

  // provider.health.snapshot (contrato § 4.5) — vista derivada, no autoridad.
  function validateHealthSnapshot(snapshot) {
    const errors = [];
    if (!isPlainObject(snapshot)) return fail([{ path: '', reason: 'snapshot_must_be_object' }]);
    pushIf(errors, !isNonEmptyString(snapshot.logicalProviderId), 'logicalProviderId', 'required_non_empty_string');
    pushIf(errors, !isNonEmptyString(snapshot.paneId), 'paneId', 'required_non_empty_string');
    pushIf(errors, snapshot.availability !== null && !isAvailabilityState(snapshot.availability),
      'availability', 'must_be_availability_state_or_null');
    pushIf(errors, snapshot.requestActivity !== null && !isRequestActivityState(snapshot.requestActivity),
      'requestActivity', 'must_be_request_activity_state_or_null');
    pushIf(errors, snapshot.jobState !== null && !isJobState(snapshot.jobState),
      'jobState', 'must_be_job_state_or_null');
    pushIf(errors, snapshot.channel !== null && !isChannelState(snapshot.channel),
      'channel', 'must_be_channel_state_or_null');
    pushIf(errors, !isFiniteNumber(snapshot.observedAt), 'observedAt', 'required_finite_number');
    return errors.length ? fail(errors) : ok();
  }

  health.isAvailabilityState = isAvailabilityState;
  health.isRequestActivityState = isRequestActivityState;
  health.isJobState = isJobState;
  health.isChannelState = isChannelState;
  health.isConfidence = isConfidence;
  health.isActiveRequestActivity = isActiveRequestActivity;

  health.validateEvidenceEntry = validateEvidenceEntry;
  health.validateEvidenceList = validateEvidenceList;
  health.validateAttemptIdentity = validateAttemptIdentity;
  health.validatePartialArtifactRef = validatePartialArtifactRef;
  health.validateAvailabilityChangedEvent = validateAvailabilityChangedEvent;
  health.validateRequestActivityChangedEvent = validateRequestActivityChangedEvent;
  health.validateJobStateChangedEvent = validateJobStateChangedEvent;
  health.validateHealthSnapshot = validateHealthSnapshot;
})();
