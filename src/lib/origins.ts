/**
 * Trusted embedding origins, shared by the relay and the receiver.
 *
 * Live-preview messages mutate the embedded page's styles, so both the relay and
 * the receiver gate every message on `event.origin`. This module is the single
 * source of truth for the default allowlist and the matcher.
 */

/**
 * Parent origins trusted by default when a caller omits `allowedOrigins`.
 *
 * Locked to Token Designer hosts only — the apex and any `tokendesigner.com`
 * subdomain (prod `app.tokendesigner.com`, stages like `dev.app.tokendesigner.com`).
 * There is deliberately no `'*'` and no localhost here, so a deployed embed trusts
 * only tokendesigner.com. Consumers that need extra origins (e.g. localhost during
 * local dev) spread this constant and add their own:
 * `[...DEFAULT_PARENT_ORIGINS, 'http://localhost:4200']`.
 */
export const DEFAULT_PARENT_ORIGINS: readonly string[] = [
  'https://tokendesigner.com',
  'https://*.tokendesigner.com',
];

/**
 * Test whether `origin` is permitted by an allowlist entry. An entry may be:
 *  - an exact origin (`https://app.tokendesigner.com`),
 *  - the lone `'*'` (allow any — an explicit dev opt-out), or
 *  - a wildcard pattern such as `https://*.tokendesigner.com`, where each `*`
 *    matches one or more DNS labels (dots allowed) but the match stays anchored to
 *    the surrounding literal, so it never crosses into a different domain
 *    (`https://tokendesigner.com.evil.com` and `https://eviltokendesigner.com` are
 *    both rejected).
 */
export const isOriginAllowed = (origin: string, allowed: string[]): boolean =>
  allowed.some((entry) => {
    if (entry === '*') return true;
    if (!entry.includes('*')) return entry === origin;
    const pattern =
      '^' +
      entry
        .split('*')
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('[^.]+(?:\\.[^.]+)*') +
      '$';
    return new RegExp(pattern).test(origin);
  });
