/**
 * Heavy image data (originals, cutouts, exports) is kept out of the React
 * state tree — the store only references string keys into this cache.
 * Object URLs are tracked here so they can be revoked deterministically.
 */

const blobs = new Map<string, Blob>();

export function putBlob(key: string, blob: Blob): string {
  blobs.set(key, blob);
  return key;
}

export function getBlob(key: string | undefined): Blob | undefined {
  if (!key) return undefined;
  return blobs.get(key);
}

export function dropBlob(key: string | undefined): void {
  if (!key) return;
  blobs.delete(key);
}

export function previewUrl(key: string | undefined): string {
  const blob = getBlob(key);
  if (!blob) return "";
  return URL.createObjectURL(blob);
}

let counter = 0;
export function newKey(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}
