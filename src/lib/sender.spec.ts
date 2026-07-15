import { createLivePreviewSender } from './sender';
import { LIVE_PREVIEW_CSS_TYPE, LIVE_PREVIEW_GOOGLE_FONTS_TYPE } from './protocol';

const makeTargetWindow = () => ({ postMessage: jest.fn() }) as unknown as Window & {
  postMessage: jest.Mock;
};

describe('createLivePreviewSender', () => {
  it('throws without an explicit targetOrigin', () => {
    const targetWindow = makeTargetWindow();
    expect(() => createLivePreviewSender({ targetWindow, targetOrigin: '' })).toThrow();
    expect(() => createLivePreviewSender({ targetWindow, targetOrigin: '*' })).toThrow();
  });

  it('validates and posts valid CSS to the exact origin', () => {
    const targetWindow = makeTargetWindow();
    const sender = createLivePreviewSender({
      targetWindow,
      targetOrigin: 'https://preview.example.com',
    });

    const result = sender.sendCss('.x { color: red; }');

    expect(result.valid).toBe(true);
    expect(targetWindow.postMessage).toHaveBeenCalledWith(
      { type: LIVE_PREVIEW_CSS_TYPE, css: '.x { color: red; }' },
      'https://preview.example.com'
    );
  });

  it('does not post invalid CSS', () => {
    const targetWindow = makeTargetWindow();
    const sender = createLivePreviewSender({
      targetWindow,
      targetOrigin: 'https://preview.example.com',
    });

    const result = sender.sendCss('.x{}</style><script>');

    expect(result.valid).toBe(false);
    expect(targetWindow.postMessage).not.toHaveBeenCalled();
  });

  it('validates and posts Google Fonts to the exact origin', () => {
    const targetWindow = makeTargetWindow();
    const sender = createLivePreviewSender({
      targetWindow,
      targetOrigin: 'https://preview.example.com',
    });

    const result = sender.sendGoogleFonts([{ family: 'Poppins', weights: [400, 600] }]);

    expect(result.valid).toBe(true);
    expect(targetWindow.postMessage).toHaveBeenCalledWith(
      { type: LIVE_PREVIEW_GOOGLE_FONTS_TYPE, fonts: [{ family: 'Poppins', weights: [400, 600] }] },
      'https://preview.example.com'
    );
  });

  it('does not post unsafe font families', () => {
    const targetWindow = makeTargetWindow();
    const sender = createLivePreviewSender({
      targetWindow,
      targetOrigin: 'https://preview.example.com',
    });

    const result = sender.sendGoogleFonts([{ family: 'Roboto&display=block' }]);

    expect(result.valid).toBe(false);
    expect(targetWindow.postMessage).not.toHaveBeenCalled();
  });
});
