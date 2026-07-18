import { signal } from '../../../../store.js';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGES = 10;

// Fuente de verdad nueva: una colección de imágenes pendientes. Cada entrada
// conserva el File original para metadatos y el data URL que consumen Lyra y
// los proveedores Cloud.
export const pendingImages = signal([]);

// Compatibilidad temporal con módulos antiguos que todavía esperan una sola
// imagen. Siempre reflejan la última de la colección.
export const pendingImage = signal(null);
export const pendingImageDataUrl = signal(null);

function syncLegacy(items) {
  const last = items[items.length - 1] || null;
  pendingImage.value = last?.file || null;
  pendingImageDataUrl.value = last?.dataUrl || null;
}

export function setPendingImage(file, dataUrl) {
  if (!dataUrl || (file && file.size > MAX_IMAGE_BYTES)) return false;

  const current = pendingImages.value || [];
  if (current.length >= MAX_IMAGES) return false;

  const item = {
    id: globalThis.crypto?.randomUUID?.() || `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    file: file || null,
    name: file?.name || `imagen-${current.length + 1}`,
    type: file?.type || String(dataUrl).slice(5, String(dataUrl).indexOf(';')) || 'image/png',
    size: file?.size || 0,
    dataUrl,
  };
  const next = [...current, item];
  pendingImages.value = next;
  syncLegacy(next);
  return true;
}

export function removePendingImage(idOrIndex) {
  const current = pendingImages.value || [];
  const next = typeof idOrIndex === 'number'
    ? current.filter((_, index) => index !== idOrIndex)
    : current.filter(item => item.id !== idOrIndex);
  pendingImages.value = next;
  syncLegacy(next);
}

export function clearPendingImage() {
  pendingImages.value = [];
  syncLegacy([]);
}

export const MAX_PENDING_IMAGES = MAX_IMAGES;
