/**
 * Safety validation for CSS that crosses an origin boundary.
 *
 * This util is meant to be embedded in pages on origins you do not fully
 * control, so the CSS arriving over `postMessage` must be treated as untrusted
 * input. `validateCss` is a pure, DOM-free string check (it runs in Node too)
 * and is applied at every hop — by the sender before posting and again by the
 * receiver/relay before injecting — so a single trusted layer is never assumed.
 *
 * It is intentionally conservative: it rejects rather than tries to "clean" the
 * input. Anything that looks like an attempt to break out of a `<style>` element
 * or pull in active/external content is refused. The companion injection step
 * still uses `textContent` (never `innerHTML`), so even valid CSS cannot inject
 * markup.
 */

/** Default ceiling on payload size, guarding against memory-exhaustion DoS. */
export const DEFAULT_MAX_CSS_LENGTH = 100_000;

/** URL schemes allowed inside `url(...)` by default (plus relative / `#`). */
export const DEFAULT_ALLOWED_URL_SCHEMES = ['https', 'data'] as const;

/** Schemes that are never allowed inside `url(...)`, even with opt-outs. */
const FORBIDDEN_URL_SCHEMES = ['javascript', 'vbscript', 'file'];

export interface CssValidationOptions {
  /** Max allowed length in characters. Defaults to {@link DEFAULT_MAX_CSS_LENGTH}. */
  maxLength?: number;
  /** Allow `@import` rules. Off by default (they trigger external fetches). */
  allowAtImport?: boolean;
  /**
   * Allow any `url(...)` scheme except the always-forbidden ones. Off by
   * default. When off, only {@link allowedUrlSchemes} (plus relative/`#`) pass.
   */
  allowExternalUrls?: boolean;
  /** Permitted `url(...)` schemes when `allowExternalUrls` is off. */
  allowedUrlSchemes?: readonly string[];
}

export interface CssValidationResult {
  /** True when the input is safe to inject as-is. */
  valid: boolean;
  /** The original CSS when valid, otherwise an empty string. */
  css: string;
  /** Human-readable reasons the input was rejected (empty when valid). */
  errors: string[];
}

// Matches any ASCII control character except tab (\t \x09), newline (\n \x0a)
// and carriage return (\r \x0d), which are legitimate whitespace in CSS. Built
// from escapes so no literal control bytes live in this source file. Matching
// control characters is the whole point here, so the rule is intentionally off.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = new RegExp('[\\x00-\\x08\\x0b\\x0c\\x0e-\\x1f\\x7f]');

// Active-content / breakout constructs that have no place in injected CSS.
const FORBIDDEN_PATTERNS: ReadonlyArray<{ pattern: RegExp; message: string }> = [
  { pattern: /<\/?\s*style/i, message: 'contains a <style> tag (possible breakout)' },
  { pattern: /<\s*script/i, message: 'contains a <script> tag' },
  { pattern: /<\/?\s*[a-z]/i, message: 'contains HTML-like markup' },
  { pattern: /expression\s*\(/i, message: 'contains an expression() call' },
  { pattern: /javascript\s*:/i, message: 'contains a javascript: reference' },
  { pattern: /vbscript\s*:/i, message: 'contains a vbscript: reference' },
  { pattern: /-moz-binding/i, message: 'contains a -moz-binding declaration' },
  { pattern: /behavior\s*:/i, message: 'contains a behavior: declaration' },
  { pattern: CONTROL_CHARS, message: 'contains control characters' },
];

// Captures the scheme of every url(...) target so each can be checked.
const URL_PATTERN = /url\(\s*(['"]?)([^'")]*)\1\s*\)/gi;

const schemeOf = (target: string): string | null => {
  const match = /^\s*([a-z][a-z0-9+.-]*)\s*:/i.exec(target);
  return match ? match[1].toLowerCase() : null;
};

/**
 * Validate a CSS string. Never throws; returns a result describing why the
 * input was rejected.
 */
export function validateCss(
  input: unknown,
  options: CssValidationOptions = {}
): CssValidationResult {
  const errors: string[] = [];
  const {
    maxLength = DEFAULT_MAX_CSS_LENGTH,
    allowAtImport = false,
    allowExternalUrls = false,
    allowedUrlSchemes = DEFAULT_ALLOWED_URL_SCHEMES,
  } = options;

  if (typeof input !== 'string') {
    return { valid: false, css: '', errors: ['css must be a string'] };
  }

  if (input.length > maxLength) {
    errors.push(`css exceeds the maximum length of ${maxLength} characters`);
  }

  for (const { pattern, message } of FORBIDDEN_PATTERNS) {
    if (pattern.test(input)) {
      errors.push(`css ${message}`);
    }
  }

  if (!allowAtImport && /@import\b/i.test(input)) {
    errors.push('css contains an @import rule');
  }

  if (!allowExternalUrls) {
    const allowed = allowedUrlSchemes.map((scheme) => scheme.toLowerCase());
    for (const match of input.matchAll(URL_PATTERN)) {
      const scheme = schemeOf(match[2]);
      // No scheme => relative URL or fragment, which is fine.
      if (scheme !== null && !allowed.includes(scheme)) {
        errors.push(`css contains a disallowed url() scheme: ${scheme}:`);
      }
    }
  } else {
    for (const match of input.matchAll(URL_PATTERN)) {
      const scheme = schemeOf(match[2]);
      if (scheme !== null && FORBIDDEN_URL_SCHEMES.includes(scheme)) {
        errors.push(`css contains a forbidden url() scheme: ${scheme}:`);
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, css: '', errors };
  }

  return { valid: true, css: input, errors: [] };
}
