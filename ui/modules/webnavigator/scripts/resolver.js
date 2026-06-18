export function resolverElemento(descriptor, root = document) {
  if (!descriptor || !root) return null;

  const candidates = [
    descriptor.selector,
    descriptor.testid ? `[data-testid="${CSS.escape(descriptor.testid)}"]` : null,
    descriptor.aria ? `[aria-label="${CSS.escape(descriptor.aria)}"]` : null,
    descriptor.placeholder ? `[placeholder="${CSS.escape(descriptor.placeholder)}"]` : null,
  ].filter(Boolean);

  for (const selector of candidates) {
    try {
      const el = root.querySelector(selector);
      if (el) return el;
    } catch {}
  }

  return null;
}
