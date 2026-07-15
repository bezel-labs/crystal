/**
 * Embedded-app side of the live preview channel.
 *
 * The receiver listens for `live-preview-css` messages and injects the CSS into
 * a single dedicated `<style>` element. Because the embedding page may live on a
 * different origin than the parent app, two trust gates apply to every message:
 *
 *  1. `event.origin` must be in the configured allowlist. The allowlist is
 *     required — there is no implicit default. Pass `['*']` only to deliberately
 *     opt out (e.g. local development).
 *  2. The CSS is re-validated here even though the sender already validated it;
 *     this layer never assumes an upstream hop is trustworthy.
 *
 * Injection uses `textContent` (never `innerHTML`) and reuses one style node, so
 * markup cannot be injected and the DOM does not grow on repeated updates.
 */

import {
  LIVE_PREVIEW_READY_TYPE,
  isCssMessage,
  isGoogleFontsMessage,
  type LivePreviewReadyMessage,
} from './protocol';
import { validateCss, type CssValidationOptions } from './validate-css';
import {
  loadGoogleFonts,
  validateGoogleFonts,
  type GoogleFontDef,
  type GoogleFontsValidationOptions,
} from './google-fonts';
import { DEFAULT_PARENT_ORIGINS, isOriginAllowed } from './origins';

export const DEFAULT_STYLE_ID = 'live-preview-styles';

export interface LivePreviewReceiverOptions {
  /**
   * Origins permitted to send CSS. Optional; defaults to {@link DEFAULT_PARENT_ORIGINS}
   * (Token Designer hosts). Entries may be exact origins or `*.domain` wildcards; use
   * `['*']` only to intentionally accept any origin (development). An explicit empty
   * array is a caller error and throws.
   */
  allowedOrigins?: string[];
  /** Document to inject into. Defaults to the ambient `document`. */
  target?: Document;
  /** Window to attach the message listener to. Defaults to the ambient `window`. */
  source?: Window;
  /** Id of the injected `<style>` element. Defaults to {@link DEFAULT_STYLE_ID}. */
  styleId?: string;
  /** Validation overrides applied to incoming CSS. */
  validation?: CssValidationOptions;
  /** Validation overrides applied to incoming Google Fonts. */
  fontsValidation?: GoogleFontsValidationOptions;
  /** Load Google Fonts requested via `live-preview-google-fonts`. Default `true`. */
  loadGoogleFonts?: boolean;
  /** Called after CSS is successfully applied. */
  onApply?: (css: string) => void;
  /** Called after Google Fonts are successfully loaded. */
  onGoogleFontsApply?: (fonts: GoogleFontDef[]) => void;
  /** Called when a message is rejected, with a human-readable reason. */
  onReject?: (reason: string) => void;
}

export interface LivePreviewReceiver {
  /** Detach the listener. */
  stop: () => void;
}

const getOrCreateStyle = (doc: Document, styleId: string): HTMLStyleElement => {
  const existing = doc.getElementById(styleId);
  if (existing instanceof HTMLStyleElement) {
    return existing;
  }
  const style = doc.createElement('style');
  style.id = styleId;
  style.setAttribute('data-live-preview', '');
  doc.head.appendChild(style);
  return style;
};

export function startLivePreviewReceiver(
  options: LivePreviewReceiverOptions
): LivePreviewReceiver {
  const {
    allowedOrigins = [...DEFAULT_PARENT_ORIGINS],
    target = document,
    source = window,
    styleId = DEFAULT_STYLE_ID,
    validation,
    fontsValidation,
    loadGoogleFonts: enableFonts = true,
    onApply,
    onGoogleFontsApply,
    onReject,
  } = options;

  if (!allowedOrigins || allowedOrigins.length === 0) {
    throw new Error('startLivePreviewReceiver requires a non-empty allowedOrigins list');
  }

  const handleMessage = (event: MessageEvent): void => {
    if (!isOriginAllowed(event.origin, allowedOrigins)) {
      return; // Silently ignore untrusted origins — not actionable to the page.
    }

    if (isCssMessage(event.data)) {
      const result = validateCss(event.data.css, validation);
      if (!result.valid) {
        onReject?.(`rejected css from ${event.origin}: ${result.errors.join('; ')}`);
        return;
      }

      getOrCreateStyle(target, styleId).textContent = result.css;
      onApply?.(result.css);
      return;
    }

    if (enableFonts && isGoogleFontsMessage(event.data)) {
      const result = validateGoogleFonts(event.data.fonts, fontsValidation);
      if (!result.valid) {
        onReject?.(`rejected google fonts from ${event.origin}: ${result.errors.join('; ')}`);
        return;
      }

      loadGoogleFonts(result.fonts, { document: target });
      onGoogleFontsApply?.(result.fonts);
    }
  };

  source.addEventListener('message', handleMessage);

  // Announce readiness upward so a parent can (re)send the current CSS without
  // racing this listener's attachment.
  if (source.parent && source.parent !== source) {
    const ready: LivePreviewReadyMessage = { type: LIVE_PREVIEW_READY_TYPE };
    source.parent.postMessage(ready, '*');
  }

  return {
    stop() {
      source.removeEventListener('message', handleMessage);
    },
  };
}
