/**
 * Validates that a URL uses http: or https: protocol only.
 * Prevents javascript:, data:, and other dangerous protocols.
 */
export function isSafeUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
