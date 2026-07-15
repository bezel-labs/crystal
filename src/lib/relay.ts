/**
 * Nested-iframe glue for hosts that sit between the parent app and the actual
 * preview document — most notably a Storybook *manager*, which the parent posts
 * to but which renders stories in a nested `#storybook-preview-iframe`.
 *
 * A grandparent window can only `postMessage` its direct child, so CSS has to be
 * relayed one hop down. The relay:
 *
 *  - accepts `live-preview-css` only from allowlisted parent origins,
 *  - re-validates the CSS (defense in depth) before forwarding,
 *  - forwards it to a child window resolved lazily (the child may not exist yet
 *    when the relay starts), and
 *  - forwards the child's `live-preview-ready` ping back up to its own parent so
 *    the original sender's readiness handshake works end to end.
 */

import {
  LIVE_PREVIEW_CSS_TYPE,
  LIVE_PREVIEW_GOOGLE_FONTS_TYPE,
  isCssMessage,
  isGoogleFontsMessage,
  isReadyMessage,
  type LivePreviewCssMessage,
  type LivePreviewGoogleFontsMessage,
} from './protocol';
import { validateCss, type CssValidationOptions } from './validate-css';
import { validateGoogleFonts, type GoogleFontsValidationOptions } from './google-fonts';
import { DEFAULT_PARENT_ORIGINS, isOriginAllowed } from './origins';

export interface LivePreviewRelayOptions {
  /**
   * Parent origins permitted to send CSS. Optional; defaults to
   * {@link DEFAULT_PARENT_ORIGINS}. `['*']` opts out (dev). An explicit empty
   * array is a caller error and throws.
   */
  allowedOrigins?: string[];
  /** Resolves the child window to forward to (e.g. the nested preview iframe). */
  getTargetWindow: () => Window | null | undefined;
  /** Exact origin of the child window. Usually `window.location.origin`. */
  targetOrigin: string;
  /** Window to listen on. Defaults to the ambient `window`. */
  source?: Window;
  /** Validation overrides applied to relayed CSS. */
  validation?: CssValidationOptions;
  /** Validation overrides applied to relayed Google Fonts. */
  fontsValidation?: GoogleFontsValidationOptions;
  /** Called when a message is rejected before forwarding, with a reason. */
  onReject?: (reason: string) => void;
}

export interface LivePreviewRelay {
  /** Detach the listener. */
  stop: () => void;
}

export function createLivePreviewRelay(options: LivePreviewRelayOptions): LivePreviewRelay {
  const {
    allowedOrigins = [...DEFAULT_PARENT_ORIGINS],
    getTargetWindow,
    targetOrigin,
    source = window,
    validation,
    fontsValidation,
    onReject,
  } = options;

  if (allowedOrigins.length === 0) {
    throw new Error('createLivePreviewRelay requires a non-empty allowedOrigins list');
  }
  if (!targetOrigin || targetOrigin === '*') {
    throw new Error('createLivePreviewRelay requires an explicit targetOrigin (cannot be "*")');
  }

  const handleMessage = (event: MessageEvent): void => {
    // A ready ping bubbling up from the child preview: pass it to our parent so
    // the original sender can complete its handshake.
    if (isReadyMessage(event.data)) {
      if (source.parent && source.parent !== source) {
        source.parent.postMessage(event.data, '*');
      }
      return;
    }

    if (!isOriginAllowed(event.origin, allowedOrigins)) {
      return;
    }

    // Re-validate here (defense in depth) and forward the relevant message types
    // to the child preview frame. The child re-validates again before applying.
    let message: LivePreviewCssMessage | LivePreviewGoogleFontsMessage | null = null;

    if (isCssMessage(event.data)) {
      const result = validateCss(event.data.css, validation);
      if (!result.valid) {
        onReject?.(`relay rejected css from ${event.origin}: ${result.errors.join('; ')}`);
        return;
      }
      message = { type: LIVE_PREVIEW_CSS_TYPE, css: result.css };
    } else if (isGoogleFontsMessage(event.data)) {
      const result = validateGoogleFonts(event.data.fonts, fontsValidation);
      if (!result.valid) {
        onReject?.(`relay rejected google fonts from ${event.origin}: ${result.errors.join('; ')}`);
        return;
      }
      message = { type: LIVE_PREVIEW_GOOGLE_FONTS_TYPE, fonts: result.fonts };
    } else {
      return;
    }

    const child = getTargetWindow();
    if (!child) {
      return; // Preview frame not mounted yet; the sender resends on ready.
    }

    child.postMessage(message, targetOrigin);
  };

  source.addEventListener('message', handleMessage);

  return {
    stop() {
      source.removeEventListener('message', handleMessage);
    },
  };
}
