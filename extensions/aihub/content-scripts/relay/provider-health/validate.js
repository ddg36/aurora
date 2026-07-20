// Provider Health Sensor — Checkpoint 1: validadores puros de forma.
// Contrato canónico: docs/audits/provider-health-sensor-discovery-claude.md (v4).
// Mismo patrón que validateProviderAdapter (relay-contract.js): funciones
// puras, sin mutar el input, sin lanzar por inputs ordinarios (ni hostiles)
// inválidos — devuelven { ok, errors[] } siempre. Clásico/IIFE, sin ESM.
(() => {
  'use strict';

  // ── Verificación canónica propia (no confiar ciegamente en types.js) ──
  // Mismo mecanismo que types.js: el binding global debe estar bloqueado y
  // el namespace debe portar la marca canónica + versión de contrato antes
  // de instalar ningún validador. Si types.js todavía no corrió, o corrió
  // un namespace falso/incompatible, esto lanza en vez de instalar
  // validadores sobre una base no confiable.
  const MARKER_KEY = Symbol.for('__auroraProviderHealth:canonical:v1');
  const CONTRACT_VERSION = 1;

  function isLockedDataDescriptor(desc) {
    return !!desc && desc.writable === false && desc.configurable === false
      && Object.prototype.hasOwnProperty.call(desc, 'value');
  }

  const globalDesc = Object.getOwnPropertyDescriptor(globalThis, '__auroraProviderHealth');
  if (!isLockedDataDescriptor(globalDesc)) {
    throw new Error('provider-health/validate.js: __auroraProviderHealth no está bloqueado — cargar types.js primero.');
  }
  const health = globalDesc.value;
  const markerDesc = health && Object.getOwnPropertyDescriptor(health, MARKER_KEY);
  const versionDesc = health && Object.getOwnPropertyDescriptor(health, '__contractVersion');
  if (!isLockedDataDescriptor(markerDesc) || markerDesc.value !== true
    || !isLockedDataDescriptor(versionDesc) || versionDesc.value !== CONTRACT_VERSION) {
    throw new Error('provider-health/validate.js: namespace preexistente no supera la verificación canónica.');
  }
  const types = health;

  // Instala un miembro nuevo bloqueado; si ya existe (namespace ya
  // verificado canónico arriba), se confía en el valor existente — mismo
  // criterio que defineLocked de types.js, sin comparar identidad de
  // closures entre evaluaciones distintas.
  function defineLocked(key, value) {
    if (Object.prototype.hasOwnProperty.call(health, key)) return health[key];
    Object.defineProperty(health, key, { value, writable: false, configurable: false, enumerable: true });
    return value;
  }

  // ── Lectura segura de campos: nunca ejecuta getters de un input hostil ──
  // Un objeto que expone `evidenceId` como accessor (get evidenceId(){...})
  // podría lanzar, loguear, o devolver algo distinto en cada lectura —
  // ninguno de esos efectos debe ocurrir durante la validación. Solo se
  // aceptan propiedades PROPIAS de tipo dato (value), nunca heredadas ni
  // accessor. getOwnPropertyDescriptor envuelto en try/catch: un Proxy con
  // trampa hostil podría lanzar al reflejarse, y eso tampoco debe escapar.
  const ACCESSOR_REJECTED = Symbol('provider-health:accessor-rejected');
  const MISSING = Symbol('provider-health:missing-field');

  function readOwnDataField(obj, key) {
    if (!obj || typeof obj !== 'object') return MISSING;
    let desc;
    try { desc = Object.getOwnPropertyDescriptor(obj, key); } catch (_) { return ACCESSOR_REJECTED; }
    if (!desc) return MISSING;
    if (desc.get || desc.set) return ACCESSOR_REJECTED;
    return desc.value;
  }

  // Deliberadamente NO usa Object.prototype.toString.call(v): esa operación
  // lee Symbol.toStringTag, que puede ser un getter hostil y ejecutar
  // código del input durante la validación — justo lo que este módulo debe
  // evitar. Array.isArray + comparación de prototipo (ambas operaciones
  // reflexivas, nunca ejecutan getters/valueOf/toString/Symbol.toStringTag)
  // ya alcanzan para excluir Array/Date/Map/Set/prototipos personalizados.
  function isPlainObject(v) {
    if (v === null || typeof v !== 'object') return false;
    if (Array.isArray(v)) return false;
    let proto;
    try { proto = Object.getPrototypeOf(v); } catch (_) { return false; }
    return proto === Object.prototype || proto === null;
  }

  const isNonEmptyString = v => typeof v === 'string' && v.length > 0;
  const isFiniteNumber = v => typeof v === 'number' && Number.isFinite(v);
  const isBoolean = v => typeof v === 'boolean';

  const ok = () => ({ ok: true, errors: [] });
  const fail = errors => ({ ok: false, errors });

  // ── Helper central de campos ────────────────────────────────────────────
  // Lee un campo propio de tipo dato, y aplica un validador. Nunca lanza:
  // accessor/heredado/ausente se reportan como error estructurado, no como
  // excepción. Devuelve el valor leído (o MISSING/ACCESSOR_REJECTED) para
  // que el llamador pueda usarlo en chequeos condicionales posteriores.
  function requireField(errors, obj, key, isValid, reason) {
    const v = readOwnDataField(obj, key);
    if (v === ACCESSOR_REJECTED) {
      errors.push({ path: key, reason: 'accessor_field_not_allowed' });
      return v;
    }
    if (v === MISSING) {
      errors.push({ path: key, reason: 'required_field_missing' });
      return v;
    }
    if (!isValid(v)) errors.push({ path: key, reason });
    return v;
  }

  // Campo opcional (puede faltar o ser null) pero si está presente y no es
  // accessor, debe cumplir el validador.
  function optionalField(errors, obj, key, isValidOrNull, reason) {
    const v = readOwnDataField(obj, key);
    if (v === ACCESSOR_REJECTED) {
      errors.push({ path: key, reason: 'accessor_field_not_allowed' });
      return v;
    }
    if (v === MISSING) return v;
    if (!isValidOrNull(v)) errors.push({ path: key, reason });
    return v;
  }

  // Whitelist estricta top-level: cualquier clave propia enumerable fuera
  // de `allowed` se rechaza en bloque. Esta es la política elegida (no
  // recursiva) — un objeto anidado desconocido ya queda rechazado porque su
  // clave contenedora no está en la whitelist, así que no hace falta bajar
  // recursivamente a inspeccionar su contenido: nunca llega a validarse
  // como válido si la clave que lo porta no es una de las documentadas.
  // Reflect.ownKeys (no Object.keys): incluye propiedades NO enumerables y
  // símbolos, que Object.keys pasaba por alto — un campo privado escondido
  // como no-enumerable o bajo una clave Symbol ya no escapa la whitelist.
  // Solo se inspecciona el NOMBRE de la clave, nunca su valor — rechazar
  // una clave desconocida no requiere (ni debe) leer lo que contiene.
  function rejectUnknownFields(errors, obj, allowedKeys, pathPrefix = '') {
    if (!isPlainObject(obj)) return;
    let keys;
    try { keys = Reflect.ownKeys(obj); } catch (_) { keys = []; }
    for (const key of keys) {
      if (typeof key === 'symbol') {
        errors.push({ path: `${pathPrefix}[symbol]`, reason: 'symbol_keys_not_allowed' });
        continue;
      }
      if (!allowedKeys.includes(key)) {
        errors.push({ path: `${pathPrefix}${key}`, reason: 'unknown_field_not_allowed' });
      }
    }
  }

  function invertEnum(enumObj, v) {
    return typeof v === 'string' && Object.prototype.hasOwnProperty.call(enumObj, v);
  }
  const isAvailabilityState = v => invertEnum(types.AvailabilityState, v);
  const isRequestActivityState = v => invertEnum(types.RequestActivityState, v);
  const isJobState = v => invertEnum(types.JobState, v);
  const isChannelState = v => invertEnum(types.ChannelState, v);
  const isConfidence = v => invertEnum(types.Confidence, v);

  // JobState.ACTIVE corresponde exactamente a un RequestActivity no
  // terminal (contrato § 3). QUEUED, SUBMITTED, WAITING_FIRST_OUTPUT,
  // PROGRESSING, STALLED cuentan; IDLE y los terminales no por sí solos.
  const isActiveRequestActivity = v => types.ACTIVE_REQUEST_ACTIVITY_STATES.includes(v);

  // ── EvidenceEntry (contrato § 6, privacidad § 7) ───────────────────────
  const EVIDENCE_ALLOWED_FIELDS = Object.freeze([
    'evidenceId', 'sourceClass', 'authority', 'correlationGroup', 'patternId',
    'reasonCode', 'logicalProviderId', 'effectiveAdapterId', 'observedAt',
    'expiresAt', 'previousState', 'contradicts',
  ]);

  function validateEvidenceEntry(entry, { knownEvidenceIds = null } = {}) {
    const errors = [];
    if (!isPlainObject(entry)) return fail([{ path: '', reason: 'evidence_entry_must_be_plain_object' }]);

    rejectUnknownFields(errors, entry, EVIDENCE_ALLOWED_FIELDS);

    const evidenceId = requireField(errors, entry, 'evidenceId', isNonEmptyString, 'required_non_empty_string');
    requireField(errors, entry, 'sourceClass', isNonEmptyString, 'required_non_empty_string');
    requireField(errors, entry, 'authority', v => v === 'structural' || v === 'heuristic', 'must_be_structural_or_heuristic');
    requireField(errors, entry, 'correlationGroup', isNonEmptyString, 'required_non_empty_string');
    optionalField(errors, entry, 'patternId', v => v === null || isNonEmptyString(v), 'must_be_string_or_null');
    requireField(errors, entry, 'reasonCode', isNonEmptyString, 'required_non_empty_string');
    requireField(errors, entry, 'logicalProviderId', isNonEmptyString, 'required_non_empty_string');
    requireField(errors, entry, 'effectiveAdapterId', isNonEmptyString, 'required_non_empty_string');
    const observedAt = requireField(errors, entry, 'observedAt', isFiniteNumber, 'required_finite_number');
    const expiresAt = requireField(errors, entry, 'expiresAt', isFiniteNumber, 'required_finite_number');
    optionalField(errors, entry, 'previousState', v => v === null || isNonEmptyString(v), 'must_be_string_or_null');

    if (isFiniteNumber(observedAt) && isFiniteNumber(expiresAt) && expiresAt < observedAt) {
      errors.push({ path: 'expiresAt', reason: 'expires_before_observed' });
    }

    const contradicts = readOwnDataField(entry, 'contradicts');
    if (contradicts !== MISSING && contradicts !== ACCESSOR_REJECTED && contradicts !== null) {
      if (!Array.isArray(contradicts)) {
        errors.push({ path: 'contradicts', reason: 'must_be_array_or_null' });
      } else {
        contradicts.forEach((id, i) => {
          if (!isNonEmptyString(id)) {
            errors.push({ path: `contradicts[${i}]`, reason: 'must_be_non_empty_string' });
            return;
          }
          if (isNonEmptyString(evidenceId) && id === evidenceId) {
            errors.push({ path: `contradicts[${i}]`, reason: 'self_contradiction_not_allowed' });
          }
          if (knownEvidenceIds && !knownEvidenceIds.has(id)) {
            errors.push({ path: `contradicts[${i}]`, reason: 'unknown_evidence_id' });
          }
        });
      }
    }

    return errors.length ? fail(errors) : ok();
  }

  // Detecta ciclos en el grafo dirigido evidenceId -> contradicts[].
  function findContradictionCycle(list) {
    const graph = new Map();
    for (const entry of list) {
      if (!isPlainObject(entry)) continue;
      const id = readOwnDataField(entry, 'evidenceId');
      const contradicts = readOwnDataField(entry, 'contradicts');
      if (!isNonEmptyString(id)) continue;
      graph.set(id, Array.isArray(contradicts) ? contradicts.filter(isNonEmptyString) : []);
    }
    const WHITE = 0; const GRAY = 1; const BLACK = 2;
    const color = new Map([...graph.keys()].map(id => [id, WHITE]));
    let cycleFound = false;
    function visit(id) {
      if (cycleFound || color.get(id) === BLACK) return;
      if (color.get(id) === GRAY) { cycleFound = true; return; }
      color.set(id, GRAY);
      for (const next of graph.get(id) || []) {
        if (graph.has(next)) visit(next);
      }
      color.set(id, BLACK);
    }
    for (const id of graph.keys()) { if (!cycleFound) visit(id); }
    return cycleFound;
  }

  function validateEvidenceList(list) {
    if (!Array.isArray(list)) return fail([{ path: '', reason: 'evidence_must_be_array' }]);
    const errors = [];

    const seenIds = new Map(); // id -> count
    for (const entry of list) {
      if (!isPlainObject(entry)) continue;
      const id = readOwnDataField(entry, 'evidenceId');
      if (isNonEmptyString(id)) seenIds.set(id, (seenIds.get(id) || 0) + 1);
    }
    const knownEvidenceIds = new Set(seenIds.keys());

    list.forEach((entry, i) => {
      const result = validateEvidenceEntry(entry, { knownEvidenceIds });
      result.errors.forEach(e => errors.push({ path: `[${i}].${e.path}`, reason: e.reason }));
    });

    for (const [id, count] of seenIds) {
      if (count > 1) errors.push({ path: `[*].evidenceId`, reason: `duplicate_evidence_id:${id}` });
    }

    if (findContradictionCycle(list)) {
      errors.push({ path: '[*].contradicts', reason: 'contradiction_cycle_detected' });
    }

    return errors.length ? fail(errors) : ok();
  }

  // ── AttemptIdentity / currentAttempt (contrato § 4.3, § 8) ─────────────
  const ATTEMPT_ALLOWED_FIELDS = Object.freeze(['attemptId', 'logicalProviderId', 'effectiveAdapterId', 'requestId']);

  // Valida la FORMA de un currentAttempt no-nulo. La decisión de si `null`
  // es aceptable para un JobState dado vive en validateJobStateChangedEvent
  // (contrato: null solo es válido en estados sin intento activo, p.ej.
  // CREATED — nunca "siempre válido" de forma aislada).
  function validateAttemptIdentity(attempt) {
    if (attempt === null) return ok();
    const errors = [];
    if (!isPlainObject(attempt)) return fail([{ path: '', reason: 'attempt_must_be_plain_object_or_null' }]);
    rejectUnknownFields(errors, attempt, ATTEMPT_ALLOWED_FIELDS);
    requireField(errors, attempt, 'attemptId', isNonEmptyString, 'required_non_empty_string');
    requireField(errors, attempt, 'logicalProviderId', isNonEmptyString, 'required_non_empty_string');
    requireField(errors, attempt, 'effectiveAdapterId', isNonEmptyString, 'required_non_empty_string');
    requireField(errors, attempt, 'requestId', v => v === null || isNonEmptyString(v), 'must_be_string_or_null');
    return errors.length ? fail(errors) : ok();
  }

  // ── PartialArtifactRef (contrato § 7) ──────────────────────────────────
  const ARTIFACT_ALLOWED_FIELDS = Object.freeze([
    'artifactId', 'ownerLogicalJobId', 'privacyClass', 'createdAt', 'expiresAt',
    'allowedConsumers', 'hasContent', 'approxSize',
  ]);
  const PRIVACY_CLASSES = Object.freeze(['PRIVATE', 'TEAM', 'MISSION', 'SHAREABLE']);

  function validatePartialArtifactRef(ref) {
    if (ref === null) return ok();
    const errors = [];
    if (!isPlainObject(ref)) return fail([{ path: '', reason: 'artifact_ref_must_be_plain_object_or_null' }]);
    rejectUnknownFields(errors, ref, ARTIFACT_ALLOWED_FIELDS);

    requireField(errors, ref, 'artifactId', isNonEmptyString, 'required_non_empty_string');
    requireField(errors, ref, 'ownerLogicalJobId', isNonEmptyString, 'required_non_empty_string');
    requireField(errors, ref, 'privacyClass', v => PRIVACY_CLASSES.includes(v), 'required_privacy_class');
    const createdAt = requireField(errors, ref, 'createdAt', isFiniteNumber, 'required_finite_number');
    const expiresAt = requireField(errors, ref, 'expiresAt', isFiniteNumber, 'required_finite_number');
    requireField(errors, ref, 'hasContent', isBoolean, 'required_boolean');
    optionalField(errors, ref, 'approxSize', v => v === null || isFiniteNumber(v), 'must_be_number_or_null');

    if (isFiniteNumber(createdAt) && isFiniteNumber(expiresAt) && expiresAt < createdAt) {
      errors.push({ path: 'expiresAt', reason: 'expires_before_created' });
    }

    const allowedConsumers = readOwnDataField(ref, 'allowedConsumers');
    if (allowedConsumers === ACCESSOR_REJECTED) {
      errors.push({ path: 'allowedConsumers', reason: 'accessor_field_not_allowed' });
    } else if (allowedConsumers === MISSING) {
      errors.push({ path: 'allowedConsumers', reason: 'required_field_missing' });
    } else if (!Array.isArray(allowedConsumers)) {
      errors.push({ path: 'allowedConsumers', reason: 'required_array' });
    } else {
      allowedConsumers.forEach((consumer, i) => {
        if (!isNonEmptyString(consumer)) {
          errors.push({ path: `allowedConsumers[${i}]`, reason: 'must_be_non_empty_string' });
        }
      });
    }

    return errors.length ? fail(errors) : ok();
  }

  // ── Eventos ──────────────────────────────────────────────────────────

  function validateCommonEventFields(errors, event) {
    requireField(errors, event, 'eventVersion', v => v === types.CONTRACT_VERSION, 'must_match_contract_version');
    requireField(errors, event, 'eventId', isNonEmptyString, 'required_non_empty_string');
    requireField(errors, event, 'sequence', v => isFiniteNumber(v) && v >= 0, 'required_non_negative_number');
    requireField(errors, event, 'observedAt', isFiniteNumber, 'required_finite_number');
  }

  // provider.availability.changed (contrato § 4.1) — source SOLO "adapter".
  const AVAILABILITY_EVENT_FIELDS = Object.freeze([
    'eventVersion', 'eventId', 'sequence', 'logicalProviderId', 'effectiveAdapterId',
    'paneId', 'sessionId', 'previousState', 'state', 'reasonCode', 'confidence',
    'evidence', 'retryAfter', 'observedAt', 'source',
  ]);

  function validateAvailabilityChangedEvent(event) {
    const errors = [];
    if (!isPlainObject(event)) return fail([{ path: '', reason: 'event_must_be_plain_object' }]);
    rejectUnknownFields(errors, event, AVAILABILITY_EVENT_FIELDS);
    validateCommonEventFields(errors, event);
    requireField(errors, event, 'logicalProviderId', isNonEmptyString, 'required_non_empty_string');
    requireField(errors, event, 'effectiveAdapterId', isNonEmptyString, 'required_non_empty_string');
    requireField(errors, event, 'paneId', isNonEmptyString, 'required_non_empty_string');
    requireField(errors, event, 'sessionId', v => v === null || isNonEmptyString(v), 'must_be_string_or_null');
    requireField(errors, event, 'previousState', isAvailabilityState, 'must_be_availability_state');
    requireField(errors, event, 'state', isAvailabilityState, 'must_be_availability_state');
    requireField(errors, event, 'reasonCode', isNonEmptyString, 'required_non_empty_string');
    requireField(errors, event, 'confidence', isConfidence, 'must_be_confidence_value');
    requireField(errors, event, 'retryAfter', v => v === null || isFiniteNumber(v), 'must_be_number_or_null');
    // Única fuente autoritativa válida: "adapter". endpoint_registry y
    // harness quedan explícitamente rechazados (contrato § 4.1, § 12).
    requireField(errors, event, 'source', v => v === types.AVAILABILITY_SOURCE, 'must_be_adapter_only');

    const evidence = readOwnDataField(event, 'evidence');
    if (evidence === ACCESSOR_REJECTED) errors.push({ path: 'evidence', reason: 'accessor_field_not_allowed' });
    else if (evidence === MISSING) errors.push({ path: 'evidence', reason: 'required_field_missing' });
    else if (!Array.isArray(evidence)) errors.push({ path: 'evidence', reason: 'required_array' });
    else {
      const result = validateEvidenceList(evidence);
      result.errors.forEach(e => errors.push({ path: `evidence${e.path}`, reason: e.reason }));
    }

    return errors.length ? fail(errors) : ok();
  }

  // provider.request.activity.changed (contrato § 4.2) — nunca PAUSED/BLOCKED.
  const REQUEST_EVENT_FIELDS = Object.freeze([
    'eventVersion', 'eventId', 'sequence', 'logicalProviderId', 'effectiveAdapterId',
    'paneId', 'sessionId', 'logicalJobId', 'attemptId', 'requestId',
    'previousActivity', 'activity', 'lastProgressAt', 'terminalReason', 'observedAt',
  ]);

  function validateRequestActivityChangedEvent(event) {
    const errors = [];
    if (!isPlainObject(event)) return fail([{ path: '', reason: 'event_must_be_plain_object' }]);
    rejectUnknownFields(errors, event, REQUEST_EVENT_FIELDS);
    validateCommonEventFields(errors, event);
    requireField(errors, event, 'logicalProviderId', isNonEmptyString, 'required_non_empty_string');
    requireField(errors, event, 'effectiveAdapterId', isNonEmptyString, 'required_non_empty_string');
    requireField(errors, event, 'paneId', isNonEmptyString, 'required_non_empty_string');
    requireField(errors, event, 'sessionId', v => v === null || isNonEmptyString(v), 'must_be_string_or_null');
    requireField(errors, event, 'logicalJobId', isNonEmptyString, 'required_non_empty_string');
    requireField(errors, event, 'attemptId', isNonEmptyString, 'required_non_empty_string');
    requireField(errors, event, 'requestId', v => v === null || isNonEmptyString(v), 'must_be_string_or_null');
    requireField(errors, event, 'previousActivity', isRequestActivityState, 'must_be_request_activity_state');
    // JobState (PAUSED/BLOCKED) nunca es un valor válido de RequestActivity
    // — pertenecen a otro eje (contrato § 3, § 5 filas 3/8). isRequestActivityState
    // ya los excluye (no están en RequestActivityState), pero se deja el
    // chequeo explícito para un mensaje de error más claro.
    const activity = requireField(errors, event, 'activity', isRequestActivityState, 'must_be_request_activity_state');
    if (activity === 'PAUSED' || activity === 'BLOCKED') {
      errors.push({ path: 'activity', reason: 'paused_and_blocked_belong_to_job_state_not_request_activity' });
    }
    requireField(errors, event, 'lastProgressAt', v => v === null || isFiniteNumber(v), 'must_be_number_or_null');
    requireField(errors, event, 'terminalReason', v => v === null || isNonEmptyString(v), 'must_be_string_or_null');

    return errors.length ? fail(errors) : ok();
  }

  // cloud.job.state.changed (contrato § 4.3) — incluye currentAttempt.
  const JOB_EVENT_FIELDS = Object.freeze([
    'eventVersion', 'eventId', 'sequence', 'logicalJobId', 'currentAttempt',
    'turnId', 'paneId', 'previousState', 'state', 'pauseReason', 'blockedReason',
    'durableClaim', 'partialArtifactRef', 'observedAt',
  ]);

  function validateJobStateChangedEvent(event) {
    const errors = [];
    if (!isPlainObject(event)) return fail([{ path: '', reason: 'event_must_be_plain_object' }]);
    rejectUnknownFields(errors, event, JOB_EVENT_FIELDS);
    validateCommonEventFields(errors, event);
    requireField(errors, event, 'logicalJobId', isNonEmptyString, 'required_non_empty_string');
    requireField(errors, event, 'turnId', v => v === null || isNonEmptyString(v), 'must_be_string_or_null');
    requireField(errors, event, 'paneId', isNonEmptyString, 'required_non_empty_string');
    requireField(errors, event, 'previousState', isJobState, 'must_be_job_state');
    const state = requireField(errors, event, 'state', isJobState, 'must_be_job_state');

    const currentAttempt = readOwnDataField(event, 'currentAttempt');
    if (currentAttempt === ACCESSOR_REJECTED) {
      errors.push({ path: 'currentAttempt', reason: 'accessor_field_not_allowed' });
    } else if (currentAttempt === MISSING) {
      errors.push({ path: 'currentAttempt', reason: 'required_field_missing' });
    } else {
      const requiresAttempt = types.JOB_STATES_REQUIRING_ATTEMPT.includes(state);
      if (currentAttempt === null && requiresAttempt) {
        errors.push({ path: 'currentAttempt', reason: `null_not_allowed_for_state:${state}` });
      } else {
        const result = validateAttemptIdentity(currentAttempt);
        result.errors.forEach(e => errors.push({ path: `currentAttempt.${e.path}`, reason: e.reason }));
      }
    }

    const pauseReason = readOwnDataField(event, 'pauseReason');
    const blockedReason = readOwnDataField(event, 'blockedReason');
    const pauseReasonPresent = pauseReason !== null && pauseReason !== MISSING && pauseReason !== ACCESSOR_REJECTED;
    const blockedReasonPresent = blockedReason !== null && blockedReason !== MISSING && blockedReason !== ACCESSOR_REJECTED;

    if (pauseReason === ACCESSOR_REJECTED) errors.push({ path: 'pauseReason', reason: 'accessor_field_not_allowed' });
    else if (pauseReason !== MISSING && pauseReason !== null && !isNonEmptyString(pauseReason)) {
      errors.push({ path: 'pauseReason', reason: 'must_be_string_or_null' });
    }
    if (blockedReason === ACCESSOR_REJECTED) errors.push({ path: 'blockedReason', reason: 'accessor_field_not_allowed' });
    else if (blockedReason !== MISSING && blockedReason !== null && !isNonEmptyString(blockedReason)) {
      errors.push({ path: 'blockedReason', reason: 'must_be_string_or_null' });
    }

    // Reglas estrictas de coherencia estado↔razón (exigidas por Navigator):
    // PAUSED exige pauseReason y rechaza blockedReason; BLOCKED exige
    // blockedReason y rechaza pauseReason; cualquier otro estado rechaza
    // ambas; ambas simultáneas siempre se rechazan sea cual sea el estado.
    if (pauseReasonPresent && blockedReasonPresent) {
      errors.push({ path: 'pauseReason', reason: 'pause_and_blocked_reason_cannot_coexist' });
    } else if (state === types.JobState.PAUSED) {
      if (!pauseReasonPresent) errors.push({ path: 'pauseReason', reason: 'required_when_state_is_paused' });
      if (blockedReasonPresent) errors.push({ path: 'blockedReason', reason: 'not_allowed_when_state_is_paused' });
    } else if (state === types.JobState.BLOCKED) {
      if (!blockedReasonPresent) errors.push({ path: 'blockedReason', reason: 'required_when_state_is_blocked' });
      if (pauseReasonPresent) errors.push({ path: 'pauseReason', reason: 'not_allowed_when_state_is_blocked' });
    } else {
      if (pauseReasonPresent) errors.push({ path: 'pauseReason', reason: 'not_allowed_unless_state_is_paused' });
      if (blockedReasonPresent) errors.push({ path: 'blockedReason', reason: 'not_allowed_unless_state_is_blocked' });
    }

    requireField(errors, event, 'durableClaim', v => v === null || isNonEmptyString(v), 'must_be_string_or_null');

    const partialArtifactRef = readOwnDataField(event, 'partialArtifactRef');
    if (partialArtifactRef === ACCESSOR_REJECTED) {
      errors.push({ path: 'partialArtifactRef', reason: 'accessor_field_not_allowed' });
    } else if (partialArtifactRef === MISSING) {
      errors.push({ path: 'partialArtifactRef', reason: 'required_field_missing' });
    } else {
      const result = validatePartialArtifactRef(partialArtifactRef);
      result.errors.forEach(e => errors.push({ path: `partialArtifactRef.${e.path}`, reason: e.reason }));
    }

    return errors.length ? fail(errors) : ok();
  }

  // provider.health.snapshot (contrato § 4.5) — vista derivada, no autoridad.
  const SNAPSHOT_FIELDS = Object.freeze([
    'logicalProviderId', 'paneId', 'availability', 'requestActivity', 'jobState', 'channel', 'observedAt',
  ]);

  function validateHealthSnapshot(snapshot) {
    const errors = [];
    if (!isPlainObject(snapshot)) return fail([{ path: '', reason: 'snapshot_must_be_plain_object' }]);
    rejectUnknownFields(errors, snapshot, SNAPSHOT_FIELDS);
    requireField(errors, snapshot, 'logicalProviderId', isNonEmptyString, 'required_non_empty_string');
    requireField(errors, snapshot, 'paneId', isNonEmptyString, 'required_non_empty_string');
    requireField(errors, snapshot, 'availability', v => v === null || isAvailabilityState(v), 'must_be_availability_state_or_null');
    requireField(errors, snapshot, 'requestActivity', v => v === null || isRequestActivityState(v), 'must_be_request_activity_state_or_null');
    requireField(errors, snapshot, 'jobState', v => v === null || isJobState(v), 'must_be_job_state_or_null');
    requireField(errors, snapshot, 'channel', v => v === null || isChannelState(v), 'must_be_channel_state_or_null');
    requireField(errors, snapshot, 'observedAt', isFiniteNumber, 'required_finite_number');
    return errors.length ? fail(errors) : ok();
  }

  // Namespace ya verificado canónico arriba: si alguna de estas claves ya
  // existe (recarga legítima de este mismo validate.js), defineLocked
  // conserva la definición existente sin comparar — no hay necesidad de
  // "tratar funciones como compatibles por tipo": la confianza ya se
  // estableció una sola vez, en la verificación canónica del namespace.
  defineLocked('isAvailabilityState', isAvailabilityState);
  defineLocked('isRequestActivityState', isRequestActivityState);
  defineLocked('isJobState', isJobState);
  defineLocked('isChannelState', isChannelState);
  defineLocked('isConfidence', isConfidence);
  defineLocked('isActiveRequestActivity', isActiveRequestActivity);

  defineLocked('validateEvidenceEntry', validateEvidenceEntry);
  defineLocked('validateEvidenceList', validateEvidenceList);
  defineLocked('validateAttemptIdentity', validateAttemptIdentity);
  defineLocked('validatePartialArtifactRef', validatePartialArtifactRef);
  defineLocked('validateAvailabilityChangedEvent', validateAvailabilityChangedEvent);
  defineLocked('validateRequestActivityChangedEvent', validateRequestActivityChangedEvent);
  defineLocked('validateJobStateChangedEvent', validateJobStateChangedEvent);
  defineLocked('validateHealthSnapshot', validateHealthSnapshot);
})();
