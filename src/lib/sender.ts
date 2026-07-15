/**
 * Parent-app side of the live preview channel.
 *
 * A sender is bound to one target window (typically an embedded `<iframe>`'s
 * `contentWindow`) and one explicit target origin. CSS is validated before it
 * leaves this window, and the post is always addressed to a concrete origin —
 * never `'*'` — so a navigated-away or swapped iframe can never receive it.
 */

import {
  LIVE_PREVIEW_CSS_TYPE,
  LIVE_PREVIEW_GOOGLE_FONTS_TYPE,
  type LivePreviewCssMessage,
  type LivePreviewGoogleFontsMessage,
} from './protocol';
import { validateCss, type CssValidationOptions, type CssValidationResult } from './validate-css';
import {
  validateGoogleFonts,
  type GoogleFontDef,
  type GoogleFontsValidationOptions,
  type GoogleFontsValidationResult,
} from './google-fonts';

export interface LivePreviewSenderOptions {
  /** The window to post to, e.g. `iframe.contentWindow`. */
  targetWindow: Window;
  /**
   * The exact origin of the embedded preview, e.g. `https://preview.example.com`.
   * Wildcards are rejected: posting CSS to `'*'` would leak it to whatever
   * document currently occupies the frame.
   */
  targetOrigin: string;
  /** Validation overrides applied before sending CSS. */
  validation?: CssValidationOptions;
  /** Validation overrides applied before sending Google Fonts. */
  fontsValidation?: GoogleFontsValidationOptions;
}

export interface LivePreviewSender {
  /**
   * Validate and post a CSS payload. Returns the validation result; when
   * invalid, nothing is sent and `result.errors` explains why.
   */
  sendCss(css: string): CssValidationResult;
  /**
   * Validate and post a list of Google Fonts to load. Returns the validation
   * result; when invalid, nothing is sent and `result.errors` explains why.
   */
  sendGoogleFonts(fonts: GoogleFontDef[]): GoogleFontsValidationResult;
}

export function createLivePreviewSender(options: LivePreviewSenderOptions): LivePreviewSender {
  const { targetWindow, targetOrigin, validation, fontsValidation } = options;

  if (!targetOrigin || targetOrigin === '*') {
    throw new Error(
      'createLivePreviewSender requires an explicit targetOrigin (cannot be "*")'
    );
  }

  return {
    sendCss(css: string): CssValidationResult {
      const result = validateCss(css, validation);
      if (!result.valid) {
        return result;
      }

      const message: LivePreviewCssMessage = { type: LIVE_PREVIEW_CSS_TYPE, css: result.css };
      targetWindow.postMessage(message, targetOrigin);
      return result;
    },

    sendGoogleFonts(fonts: GoogleFontDef[]): GoogleFontsValidationResult {
      const result = validateGoogleFonts(fonts, fontsValidation);
      if (!result.valid) {
        return result;
      }

      const message: LivePreviewGoogleFontsMessage = {
        type: LIVE_PREVIEW_GOOGLE_FONTS_TYPE,
        fonts: result.fonts,
      };
      targetWindow.postMessage(message, targetOrigin);
      return result;
    },
  };
}
