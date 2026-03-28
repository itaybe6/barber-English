/** Path segment before ?/# — avoids missing video when URL has query params. */
function urlPathOnly(url: string): string {
  return url.trim().split('?')[0].split('#')[0];
}

/** Extensions we may store (incl. legacy `.quicktime` from video/quicktime uploads). */
const VIDEO_EXT = /\.(mp4|mov|m4v|webm|quicktime|3gp|3gpp|mkv|avi)$/i;

export function isVideoUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false;
  return VIDEO_EXT.test(urlPathOnly(url));
}

/**
 * File extension for Supabase storage path. video/quicktime must become .mov (not .quicktime)
 * so URLs match players and isVideoUrl.
 */
export function storageExtensionFromContentType(contentType: string): string {
  const ct = contentType.split(';')[0].trim().toLowerCase();
  if (ct.startsWith('video/')) {
    if (ct === 'video/mp4') return 'mp4';
    if (ct === 'video/quicktime') return 'mov';
    if (ct.includes('m4v')) return 'm4v';
    if (ct === 'video/webm') return 'webm';
    if (ct === 'video/3gpp' || ct === 'video/3gp') return '3gp';
    return 'mp4';
  }
  if (ct.startsWith('image/')) {
    const sub = ct.slice(6) || 'jpeg';
    if (sub === 'jpeg') return 'jpg';
    return sub.replace(/\+/g, '.').replace(/[^a-z0-9.]/g, '') || 'jpg';
  }
  const sub = ct.split('/')[1] || 'bin';
  return sub.replace(/[^a-z0-9]/g, '') || 'bin';
}

/** MIME guess for picked uploads (images + video). */
export function guessMediaMimeFromUri(uriOrName: string): string {
  const ext = uriOrName.split('.').pop()?.toLowerCase().split('?')[0] || '';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'heic' || ext === 'heif') return 'image/heic';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'mp4') return 'video/mp4';
  if (ext === 'mov') return 'video/quicktime';
  if (ext === 'm4v') return 'video/x-m4v';
  if (ext === 'webm') return 'video/webm';
  return 'image/jpeg';
}
