/**
 * Live Google Fonts loading for an embedded preview.
 *
 * Setting a `font-family` is not enough — the font resource must be fetched or
 * the browser falls back. This module lets a parent app ask an embedded preview
 * to load specific Google Fonts so the chosen families actually render.
 *
 * Security is the priority here, because a family name flows into a URL the page
 * then fetches. The defenses are layered so no single one is load-bearing:
 *
 *  - **No URLs on the wire.** Messages carry only `{ family, weights }`. The href
 *    is always built from a hardcoded Google Fonts base, so message data can
 *    never become the request's origin/host/scheme.
 *  - **Strict family charset.** A family must fully match a small allowlist
 *    charset, so it cannot inject extra URL params, smuggle a second URL, or do
 *    CRLF tricks.
 *  - **Clamped weights, bounded counts.** Weights are integers in 1–1000; the
 *    number of families is capped.
 *  - **Validated at every hop** (sender, relay, receiver) and injected via
 *    `createElement`/`setAttribute` into one idempotent `<link>` (never
 *    `innerHTML`).
 */

/** Attribute marking elements this module injected, so loads are idempotent. */
export const GOOGLE_FONTS_MARKER = 'data-live-preview-google-fonts';

const GOOGLE_FONTS_CSS_BASE = 'https://fonts.googleapis.com/css2';
const GOOGLE_FONTS_PRECONNECT = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'];

/** Default ceiling on families per message. */
export const DEFAULT_MAX_FONTS = 20;

/** A Google web font to load: a family name and (optionally) the weights wanted. */
export interface GoogleFontDef {
  family: string;
  weights?: number[];
}

export interface GoogleFontsValidationOptions {
  /** Max number of families accepted. Defaults to {@link DEFAULT_MAX_FONTS}. */
  maxFonts?: number;
}

export interface GoogleFontsValidationResult {
  /** True when every font is safe to load. */
  valid: boolean;
  /** The sanitized fonts when valid, otherwise an empty array. */
  fonts: GoogleFontDef[];
  /** Human-readable rejection reasons (empty when valid). */
  errors: string[];
}

export interface LoadGoogleFontsOptions {
  /** `font-display` strategy. Defaults to `swap`. */
  display?: string;
  /** Document to inject into. Defaults to the ambient `document` (no-op if absent). */
  document?: Document;
  /** Inject `<link rel="preconnect">` hints. Defaults to `true`. */
  preconnect?: boolean;
}

// A family must be exactly this: letters, digits, spaces, and . _ - only. This
// excludes & ? # : / % " ' \ < > and CR/LF, defeating URL-param injection,
// second-URL smuggling, and CRLF tricks.
const SAFE_FAMILY = /^[A-Za-z0-9 ._-]{1,100}$/;

const isValidWeight = (weight: unknown): weight is number =>
  typeof weight === 'number' && Number.isInteger(weight) && weight >= 1 && weight <= 1000;

/**
 * Validate and sanitize a list of Google fonts. Never throws; returns a result
 * describing why the input was rejected. A single bad family rejects the whole
 * batch (the sender should only ever send safe families).
 */
export function validateGoogleFonts(
  input: unknown,
  options: GoogleFontsValidationOptions = {}
): GoogleFontsValidationResult {
  const { maxFonts = DEFAULT_MAX_FONTS } = options;
  const errors: string[] = [];

  if (!Array.isArray(input)) {
    return { valid: false, fonts: [], errors: ['fonts must be an array'] };
  }
  if (input.length > maxFonts) {
    errors.push(`too many fonts (max ${maxFonts})`);
  }

  const fonts: GoogleFontDef[] = [];
  for (const entry of input) {
    const family = (entry as { family?: unknown })?.family;
    if (typeof family !== 'string' || !SAFE_FAMILY.test(family)) {
      errors.push(`invalid font family: ${JSON.stringify(family)}`);
      continue;
    }

    const rawWeights = (entry as { weights?: unknown }).weights;
    let weights: number[] | undefined;
    if (rawWeights != null) {
      if (!Array.isArray(rawWeights)) {
        errors.push(`invalid weights for ${family}`);
        continue;
      }
      // Keep only valid weights; de-duplicate and sort for a deterministic URL.
      weights = [...new Set(rawWeights.filter(isValidWeight))].sort((a, b) => a - b);
    }

    fonts.push(weights && weights.length ? { family: family.trim(), weights } : { family: family.trim() });
  }

  if (errors.length > 0) {
    return { valid: false, fonts: [], errors };
  }

  return { valid: true, fonts, errors: [] };
}

/** Google Fonts css2 param for one family, e.g. `family=Open+Sans:wght@400;600`. */
const googleParam = (font: GoogleFontDef): string => {
  const name = font.family.trim().replace(/\s+/g, '+');
  const weights = font.weights && font.weights.length ? [...font.weights].sort((a, b) => a - b) : [];
  return `family=${name}${weights.length ? `:wght@${weights.join(';')}` : ''}`;
};

/**
 * Build the Google Fonts stylesheet URL for the given fonts. Families are sorted
 * so the same set always yields the same URL (idempotent loads). Assumes the
 * fonts already passed {@link validateGoogleFonts}.
 */
export function buildGoogleFontsHref(
  fonts: readonly GoogleFontDef[],
  display = 'swap'
): string {
  const families = [...fonts]
    .sort((a, b) => a.family.localeCompare(b.family))
    .map(googleParam)
    .join('&');
  return `${GOOGLE_FONTS_CSS_BASE}?${families}&display=${display}`;
}

/**
 * Load Google Fonts by injecting a single, idempotent stylesheet `<link>` (plus
 * preconnect hints) into `<head>`. Re-validates the fonts defensively. Replaces
 * the previous link when the set changes; no-op when there is no `document` or
 * no valid fonts. Returns the stylesheet `<link>`, or `null` if nothing changed.
 */
export function loadGoogleFonts(
  fonts: readonly GoogleFontDef[],
  options: LoadGoogleFontsOptions = {}
): HTMLLinkElement | null {
  const doc =
    options.document ?? (typeof document !== 'undefined' ? document : undefined);
  if (!doc) return null;

  // Defense in depth: never trust the caller; build the URL only from safe data.
  const result = validateGoogleFonts(fonts);
  if (!result.valid || result.fonts.length === 0) return null;

  const href = buildGoogleFontsHref(result.fonts, options.display ?? 'swap');

  const existing = doc.head.querySelector<HTMLLinkElement>(
    `link[${GOOGLE_FONTS_MARKER}="stylesheet"]`
  );
  if (existing) {
    if (existing.href === href) return existing;
    existing.remove();
  }

  if (options.preconnect ?? true) {
    for (const host of GOOGLE_FONTS_PRECONNECT) {
      if (doc.head.querySelector(`link[${GOOGLE_FONTS_MARKER}="preconnect"][href="${host}"]`)) {
        continue;
      }
      const pre = doc.createElement('link');
      pre.rel = 'preconnect';
      pre.href = host;
      if (host.includes('gstatic')) pre.crossOrigin = 'anonymous';
      pre.setAttribute(GOOGLE_FONTS_MARKER, 'preconnect');
      doc.head.appendChild(pre);
    }
  }

  const link = doc.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.setAttribute(GOOGLE_FONTS_MARKER, 'stylesheet');
  doc.head.appendChild(link);
  return link;
}
