// Contrato y registro de Provider Drivers. Clásico/IIFE: Aurora no usa build.
(() => {
  'use strict';
  const relay = globalThis.__auroraRelayV2 ||= {};
  document.documentElement.dataset[typeof chrome !== 'undefined' && chrome.runtime ? 'auroraRelayContractIsolated' : 'auroraRelayContractMain'] = 'loaded';
  const providers = relay.providers ||= [];

  const REQUIRED_OBSERVE = [
    'getInput', 'getLatestAssistant', 'readAssistant', 'getUserTurnCount',
    'isGenerating', 'getConversationKey',
  ];
  const REQUIRED_ACT = ['insertText', 'submit'];

  function validateProviderAdapter(adapter) {
    const missing = [];
    if (!adapter || typeof adapter !== 'object') throw new Error('Provider Adapter ausente.');
    if (!adapter.id || typeof adapter.id !== 'string') missing.push('id');
    if (!Number.isInteger(adapter.version) || adapter.version < 1) missing.push('version');
    if (typeof adapter.matches !== 'function') missing.push('matches');
    if (!adapter.capabilities || typeof adapter.capabilities !== 'object') missing.push('capabilities');
    for (const name of REQUIRED_OBSERVE) {
      if (typeof adapter.observe?.[name] !== 'function') missing.push(`observe.${name}`);
    }
    for (const name of REQUIRED_ACT) {
      if (typeof adapter.act?.[name] !== 'function') missing.push(`act.${name}`);
    }
    const caps = adapter.capabilities || {};
    if ((caps.images || caps.files) && typeof adapter.act?.attachFiles !== 'function') missing.push('act.attachFiles');
    if (caps.newChat && typeof adapter.act?.startNewConversation !== 'function') missing.push('act.startNewConversation');
    if (missing.length) throw new Error(`Adaptador ${adapter.id || 'desconocido'} incompleto: ${missing.join(', ')}`);
    return adapter;
  }

  function registerProvider(adapter) {
    validateProviderAdapter(adapter);
    const index = providers.findIndex(item => item.id === adapter.id);
    if (index >= 0) providers[index] = adapter;
    else providers.push(adapter);
    return adapter;
  }

  function findProvider(locationLike = globalThis.location) {
    return providers.find(candidate => {
      try { return candidate.matches(locationLike); } catch (_) { return false; }
    }) || null;
  }

  relay.validateProviderAdapter = validateProviderAdapter;
  relay.registerProvider = registerProvider;
  relay.findProvider = findProvider;
})();
