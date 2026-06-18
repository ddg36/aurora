import { signal } from '../../../../store.js';

export const pendingImage       = signal(null);
export const pendingImageDataUrl = signal(null);

export function setPendingImage(file, dataUrl) {
  if (file && file.size > 5 * 1024 * 1024) return;
  pendingImage.value        = file;
  pendingImageDataUrl.value = dataUrl;
}

export function clearPendingImage() {
  pendingImage.value        = null;
  pendingImageDataUrl.value = null;
}
