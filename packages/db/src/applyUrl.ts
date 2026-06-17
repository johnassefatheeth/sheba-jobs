/** HaHu listing pages often 404 for aggregated jobs — not valid apply targets. */
export function isHahuListingUrl(raw?: string | null): boolean {
  const value = raw?.trim();
  if (!value) return false;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return /(^|\.)hahu\.jobs$/i.test(url.hostname) && /^\/jobs?(\/|$)/i.test(url.pathname);
  } catch {
    return false;
  }
}

export function sanitizeApplyUrl(raw?: string | null): string | null {
  const value = raw?.trim();
  if (!value || isHahuListingUrl(value)) return null;
  return value;
}
