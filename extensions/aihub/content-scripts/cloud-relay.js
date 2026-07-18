// Bootstrap mínimo: selecciona el driver registrado y conecta Relay Core.
(() => {
  'use strict';
  const relayV2 = globalThis.__auroraRelayV2;
  document.documentElement.dataset.auroraCloudRelayHost = location.hostname.toLowerCase();

  try {
    if (!relayV2?.findProvider || !relayV2?.createRelay) throw new Error('relay_v2_missing');
    const driver = relayV2.findProvider(location);
    if (!driver) throw new Error('provider_driver_missing');
    const existing = globalThis.__auroraRelayInstance;
    if (existing?.driverId === driver.id) {
      document.documentElement.dataset.auroraCloudRelayBootstrap = 'ready';
      return;
    }
    const instance = relayV2.createRelay(driver);
    globalThis.__auroraRelayInstance = instance;
    instance.start();
    document.documentElement.dataset.auroraCloudRelayBootstrap = 'ready';
    document.documentElement.dataset.auroraCloudRelayBootstrapDetail = `${driver.id}@${driver.version}`;
  } catch (error) {
    document.documentElement.dataset.auroraCloudRelayBootstrap = 'error';
    document.documentElement.dataset.auroraCloudRelayBootstrapDetail = error?.message || String(error);
  }
})();
