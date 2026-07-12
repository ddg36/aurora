const { useState, useEffect } = globalThis.preactHooks;

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => globalThis.matchMedia?.('(max-width: 760px)').matches || false);

  useEffect(() => {
    const mq = globalThis.matchMedia?.('(max-width: 760px)');
    if (!mq) return;
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener?.('change', sync);
    return () => mq.removeEventListener?.('change', sync);
  }, []);

  return isMobile;
}
