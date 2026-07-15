import { createLivePreviewRelay } from './relay';
import { DEFAULT_PARENT_ORIGINS } from './origins';
import { LIVE_PREVIEW_CSS_TYPE, LIVE_PREVIEW_GOOGLE_FONTS_TYPE } from './protocol';

const ALLOWED = 'https://app.example.com';
const CHILD_ORIGIN = 'https://preview.example.com';

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

describe('createLivePreviewRelay', () => {
  let relay: { stop: () => void } | null = null;

  afterEach(() => {
    relay?.stop();
    relay = null;
  });

  it('forwards valid CSS from an allowed origin to the child window', () => {
    const child = { postMessage: jest.fn() } as unknown as Window & { postMessage: jest.Mock };
    relay = createLivePreviewRelay({
      allowedOrigins: [ALLOWED],
      getTargetWindow: () => child,
      targetOrigin: CHILD_ORIGIN,
    });

    dispatchCss('.x { color: red; }', ALLOWED);

    expect(child.postMessage).toHaveBeenCalledWith(
      { type: LIVE_PREVIEW_CSS_TYPE, css: '.x { color: red; }' },
      CHILD_ORIGIN
    );
  });

  it('does not forward CSS from a disallowed origin', () => {
    const child = { postMessage: jest.fn() } as unknown as Window & { postMessage: jest.Mock };
    relay = createLivePreviewRelay({
      allowedOrigins: [ALLOWED],
      getTargetWindow: () => child,
      targetOrigin: CHILD_ORIGIN,
    });

    dispatchCss('.x { color: red; }', 'https://evil.example.com');

    expect(child.postMessage).not.toHaveBeenCalled();
  });

  it('does not forward unsafe CSS even from an allowed origin', () => {
    const child = { postMessage: jest.fn() } as unknown as Window & { postMessage: jest.Mock };
    const onReject = jest.fn();
    relay = createLivePreviewRelay({
      allowedOrigins: [ALLOWED],
      getTargetWindow: () => child,
      targetOrigin: CHILD_ORIGIN,
      onReject,
    });

    dispatchCss('.x{}</style><script>', ALLOWED);

    expect(child.postMessage).not.toHaveBeenCalled();
    expect(onReject).toHaveBeenCalled();
  });

  it('tolerates a missing child window (preview not mounted yet)', () => {
    relay = createLivePreviewRelay({
      allowedOrigins: [ALLOWED],
      getTargetWindow: () => null,
      targetOrigin: CHILD_ORIGIN,
    });

    expect(() => dispatchCss('.x { color: red; }', ALLOWED)).not.toThrow();
  });

  it('forwards valid Google Fonts to the child window', () => {
    const child = { postMessage: jest.fn() } as unknown as Window & { postMessage: jest.Mock };
    relay = createLivePreviewRelay({
      allowedOrigins: [ALLOWED],
      getTargetWindow: () => child,
      targetOrigin: CHILD_ORIGIN,
    });

    dispatchFonts([{ family: 'Poppins', weights: [400] }], ALLOWED);

    expect(child.postMessage).toHaveBeenCalledWith(
      { type: LIVE_PREVIEW_GOOGLE_FONTS_TYPE, fonts: [{ family: 'Poppins', weights: [400] }] },
      CHILD_ORIGIN
    );
  });

  it('does not forward unsafe font families', () => {
    const child = { postMessage: jest.fn() } as unknown as Window & { postMessage: jest.Mock };
    const onReject = jest.fn();
    relay = createLivePreviewRelay({
      allowedOrigins: [ALLOWED],
      getTargetWindow: () => child,
      targetOrigin: CHILD_ORIGIN,
      onReject,
    });

    dispatchFonts([{ family: 'Roboto&display=block' }], ALLOWED);

    expect(child.postMessage).not.toHaveBeenCalled();
    expect(onReject).toHaveBeenCalled();
  });

  it('forwards CSS from origins matching a wildcard entry, including nested subdomains', () => {
    const child = { postMessage: jest.fn() } as unknown as Window & { postMessage: jest.Mock };
    relay = createLivePreviewRelay({
      allowedOrigins: ['https://*.app.example.com'],
      getTargetWindow: () => child,
      targetOrigin: CHILD_ORIGIN,
    });

    dispatchCss('.x { color: red; }', 'https://dev.app.example.com'); // one label
    dispatchCss('.y { color: red; }', 'https://a.b.app.example.com'); // nested labels

    expect(child.postMessage).toHaveBeenCalledTimes(2);
  });

  it('keeps a wildcard anchored to its domain suffix', () => {
    const child = { postMessage: jest.fn() } as unknown as Window & { postMessage: jest.Mock };
    relay = createLivePreviewRelay({
      allowedOrigins: ['https://*.app.example.com'],
      getTargetWindow: () => child,
      targetOrigin: CHILD_ORIGIN,
    });

    // `*` matches one or more subdomain labels but stays anchored to the suffix —
    // these fall outside `.app.example.com` and must NOT match.
    dispatchCss('.x { color: red; }', 'https://app.example.com'); // no label before .app
    dispatchCss('.x { color: red; }', 'https://dev.app.example.com.evil.com'); // different domain

    expect(child.postMessage).not.toHaveBeenCalled();
  });

  it('still honors exact origins and the lone "*" wildcard', () => {
    const exactChild = { postMessage: jest.fn() } as unknown as Window & { postMessage: jest.Mock };
    relay = createLivePreviewRelay({
      allowedOrigins: [ALLOWED],
      getTargetWindow: () => exactChild,
      targetOrigin: CHILD_ORIGIN,
    });
    dispatchCss('.x { color: red; }', ALLOWED);
    expect(exactChild.postMessage).toHaveBeenCalledTimes(1);
    relay.stop();

    const anyChild = { postMessage: jest.fn() } as unknown as Window & { postMessage: jest.Mock };
    relay = createLivePreviewRelay({
      allowedOrigins: ['*'],
      getTargetWindow: () => anyChild,
      targetOrigin: CHILD_ORIGIN,
    });
    dispatchCss('.x { color: red; }', 'https://anything.example.org');
    expect(anyChild.postMessage).toHaveBeenCalledTimes(1);
  });

  it('falls back to DEFAULT_PARENT_ORIGINS when allowedOrigins is omitted', () => {
    // The default trusts any tokendesigner.com host via a subdomain wildcard.
    expect(DEFAULT_PARENT_ORIGINS).toContain('https://*.tokendesigner.com');

    const child = { postMessage: jest.fn() } as unknown as Window & { postMessage: jest.Mock };
    relay = createLivePreviewRelay({
      getTargetWindow: () => child,
      targetOrigin: CHILD_ORIGIN,
    });

    dispatchCss('.x { color: red; }', 'https://app.tokendesigner.com'); // exact prod
    dispatchCss('.y { color: blue; }', 'https://dev.app.tokendesigner.com'); // wildcard subdomain
    dispatchCss('.z { color: lime; }', 'https://evil.example.com'); // not in the default list

    expect(child.postMessage).toHaveBeenCalledTimes(2);
    expect(child.postMessage).toHaveBeenCalledWith(
      { type: LIVE_PREVIEW_CSS_TYPE, css: '.x { color: red; }' },
      CHILD_ORIGIN
    );
    expect(child.postMessage).toHaveBeenCalledWith(
      { type: LIVE_PREVIEW_CSS_TYPE, css: '.y { color: blue; }' },
      CHILD_ORIGIN
    );
  });

  it('throws when allowedOrigins is an explicit empty array', () => {
    expect(() =>
      createLivePreviewRelay({
        allowedOrigins: [],
        getTargetWindow: () => null,
        targetOrigin: CHILD_ORIGIN,
      })
    ).toThrow();
  });

  it('requires an explicit targetOrigin', () => {
    expect(() =>
      createLivePreviewRelay({
        allowedOrigins: [ALLOWED],
        getTargetWindow: () => null,
        targetOrigin: '*',
      })
    ).toThrow();
  });
});
