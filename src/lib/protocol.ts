/**
 * Wire protocol shared by the sender (parent app), the receiver (embedded app),
 * and the relay (a nested-iframe host such as a Storybook manager).
 *
 * Messages travel over `window.postMessage`, so they must be plain,
 * structured-clonable objects. The `type` discriminator is namespaced with the
 * `live-preview-` prefix so it is easy to identify and unlikely to collide with
 * other postMessage traffic on the same window.
 */

import type { GoogleFontDef } from './google-fonts';

/** Message type for pushing a CSS payload into an embedded preview. */
export const LIVE_PREVIEW_CSS_TYPE = 'live-preview-css' as const;

/** Message type for asking an embedded preview to load Google Fonts. */
export const LIVE_PREVIEW_GOOGLE_FONTS_TYPE = 'live-preview-google-fonts' as const;

/** Message type a receiver/relay emits upward once it is ready to apply CSS. */
export const LIVE_PREVIEW_READY_TYPE = 'live-preview-ready' as const;

/** Carries a CSS string from a parent app to an embedded preview. */
export interface LivePreviewCssMessage {
  type: typeof LIVE_PREVIEW_CSS_TYPE;
  css: string;
}

/**
 * Asks an embedded preview to load Google Fonts. Carries only family names and
 * weights — never URLs; the receiver builds the Google CDN URL itself.
 */
export interface LivePreviewGoogleFontsMessage {
  type: typeof LIVE_PREVIEW_GOOGLE_FONTS_TYPE;
  fonts: GoogleFontDef[];
}

/**
 * Announces that a receiver (or relay) has attached its listener. A parent app
 * can wait for this before sending so the initial CSS is not lost to a startup
 * race.
 */
export interface LivePreviewReadyMessage {
  type: typeof LIVE_PREVIEW_READY_TYPE;
}

export type LivePreviewMessage =
  | LivePreviewCssMessage
  | LivePreviewGoogleFontsMessage
  | LivePreviewReadyMessage;

/** Narrows arbitrary `postMessage` data to a CSS message. */
export function isCssMessage(value: unknown): value is LivePreviewCssMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === LIVE_PREVIEW_CSS_TYPE &&
    typeof (value as { css?: unknown }).css === 'string'
  );
}

/** Narrows arbitrary `postMessage` data to a Google Fonts message. */
export function isGoogleFontsMessage(value: unknown): value is LivePreviewGoogleFontsMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === LIVE_PREVIEW_GOOGLE_FONTS_TYPE &&
    Array.isArray((value as { fonts?: unknown }).fonts)
  );
}

/** Narrows arbitrary `postMessage` data to a ready message. */
export function isReadyMessage(value: unknown): value is LivePreviewReadyMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === LIVE_PREVIEW_READY_TYPE
  );
}
