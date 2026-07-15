import { startLivePreviewReceiver, DEFAULT_STYLE_ID } from './receiver';
import { LIVE_PREVIEW_CSS_TYPE, LIVE_PREVIEW_GOOGLE_FONTS_TYPE } from './protocol';
import { GOOGLE_FONTS_MARKER } from './google-fonts';
import { DEFAULT_PARENT_ORIGINS } from './origins';

const ALLOWED = 'https://app.example.com';

const dispatchCss = (css: unknown, origin: string) => {
  window.dispatchEvent(
    new MessageEvent('message', { data: { type: LIVE_PREVIEW_CSS_TYPE, css }, origin })
  );
};

const dispatchFonts = (fonts: unknown, origin: string) => {
  window.dispatchEvent(
    new MessageEvent('message', { data: { type: LIVE_PREVIEW_GOOGLE_FONTS_TYPE, fonts }, origin })
  );
};

describe('startLivePreviewReceiver', () => {
  let receiver: { stop: () => void } | null = null;

  afterEach(() => {
    receiver?.stop();
    receiver = null;
    document.getElementById(DEFAULT_STYLE_ID)?.remove();
    document.head.querySelectorAll(`[${GOOGLE_FONTS_MARKER}]`).forEach((el) => el.remove());
  });

  it('throws on an empty allowlist', () => {
    expect(() => startLivePreviewReceiver({ allowedOrigins: [] })).toThrow();
  });

  it('defaults to DEFAULT_PARENT_ORIGINS (tokendesigner.com only, no localhost/"*")', () => {
    expect(DEFAULT_PARENT_ORIGINS).toEqual([
      'https://tokendesigner.com',
      'https://*.tokendesigner.com',
    ]);
  });

  it('accepts a nested tokendesigner.com subdomain under the default allowlist', () => {
    receiver = startLivePreviewReceiver({});

    dispatchCss('.x { color: red; }', 'https://app.tokendesigner.com');
    dispatchCss('.y { color: blue; }', 'https://dev.app.tokendesigner.com');

    expect(document.getElementById(DEFAULT_STYLE_ID)?.textContent).toBe('.y { color: blue; }');
  });

  it('ignores non-tokendesigner origins under the default allowlist', () => {
    receiver = startLivePreviewReceiver({});

    dispatchCss('.x { color: red; }', 'https://eviltokendesigner.com');
    dispatchCss('.x { color: red; }', 'https://tokendesigner.com.evil.com');
    dispatchCss('.x { color: red; }', 'http://localhost:4200');

    expect(document.getElementById(DEFAULT_STYLE_ID)).toBeNull();
  });

  it('injects valid CSS from an allowed origin into one style node', () => {
    const onApply = jest.fn();
    receiver = startLivePreviewReceiver({ allowedOrigins: [ALLOWED], onApply });

    dispatchCss('.x { color: red; }', ALLOWED);

    const style = document.getElementById(DEFAULT_STYLE_ID);
    expect(style).toBeInstanceOf(HTMLStyleElement);
    expect(style?.textContent).toBe('.x { color: red; }');
    expect(onApply).toHaveBeenCalledWith('.x { color: red; }');
  });

  it('reuses the same style node on repeated updates', () => {
    receiver = startLivePreviewReceiver({ allowedOrigins: [ALLOWED] });

    dispatchCss('.x { color: red; }', ALLOWED);
    dispatchCss('.x { color: blue; }', ALLOWED);

    expect(document.querySelectorAll(`#${DEFAULT_STYLE_ID}`)).toHaveLength(1);
    expect(document.getElementById(DEFAULT_STYLE_ID)?.textContent).toBe('.x { color: blue; }');
  });

  it('ignores messages from a disallowed origin', () => {
    receiver = startLivePreviewReceiver({ allowedOrigins: [ALLOWED] });

    dispatchCss('.x { color: red; }', 'https://evil.example.com');

    expect(document.getElementById(DEFAULT_STYLE_ID)).toBeNull();
  });

  it('rejects unsafe CSS via onReject without injecting', () => {
    const onReject = jest.fn();
    receiver = startLivePreviewReceiver({ allowedOrigins: [ALLOWED], onReject });

    dispatchCss('.x{}</style><script>alert(1)</script>', ALLOWED);

    expect(onReject).toHaveBeenCalled();
    expect(document.getElementById(DEFAULT_STYLE_ID)).toBeNull();
  });

  it('stops listening after stop()', () => {
    receiver = startLivePreviewReceiver({ allowedOrigins: [ALLOWED] });
    receiver.stop();
    receiver = null;

    dispatchCss('.x { color: red; }', ALLOWED);

    expect(document.getElementById(DEFAULT_STYLE_ID)).toBeNull();
  });

  it('loads Google Fonts from an allowed origin', () => {
    const onGoogleFontsApply = jest.fn();
    receiver = startLivePreviewReceiver({ allowedOrigins: [ALLOWED], onGoogleFontsApply });

    dispatchFonts([{ family: 'Poppins', weights: [400] }], ALLOWED);

    const sheet = document.head.querySelector(`link[${GOOGLE_FONTS_MARKER}="stylesheet"]`);
    expect(sheet?.getAttribute('href')).toContain('family=Poppins:wght@400');
    expect(onGoogleFontsApply).toHaveBeenCalledWith([{ family: 'Poppins', weights: [400] }]);
  });

  it('ignores Google Fonts from a disallowed origin', () => {
    receiver = startLivePreviewReceiver({ allowedOrigins: [ALLOWED] });

    dispatchFonts([{ family: 'Poppins' }], 'https://evil.example.com');

    expect(document.head.querySelector(`link[${GOOGLE_FONTS_MARKER}="stylesheet"]`)).toBeNull();
  });

  it('rejects unsafe font families via onReject', () => {
    const onReject = jest.fn();
    receiver = startLivePreviewReceiver({ allowedOrigins: [ALLOWED], onReject });

    dispatchFonts([{ family: 'Roboto&display=block' }], ALLOWED);

    expect(onReject).toHaveBeenCalled();
    expect(document.head.querySelector(`link[${GOOGLE_FONTS_MARKER}="stylesheet"]`)).toBeNull();
  });

  it('does not load fonts when loadGoogleFonts is disabled', () => {
    receiver = startLivePreviewReceiver({ allowedOrigins: [ALLOWED], loadGoogleFonts: false });

    dispatchFonts([{ family: 'Poppins' }], ALLOWED);

    expect(document.head.querySelector(`link[${GOOGLE_FONTS_MARKER}="stylesheet"]`)).toBeNull();
  });
});
