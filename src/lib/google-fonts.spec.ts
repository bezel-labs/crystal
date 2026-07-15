import {
  validateGoogleFonts,
  buildGoogleFontsHref,
  loadGoogleFonts,
  GOOGLE_FONTS_MARKER,
} from './google-fonts';

describe('validateGoogleFonts', () => {
  it('accepts well-formed families and weights', () => {
    const result = validateGoogleFonts([
      { family: 'Poppins', weights: [400, 600] },
      { family: 'IBM Plex Sans' },
    ]);
    expect(result.valid).toBe(true);
    expect(result.fonts).toEqual([
      { family: 'Poppins', weights: [400, 600] },
      { family: 'IBM Plex Sans' },
    ]);
  });

  it('rejects non-array input', () => {
    expect(validateGoogleFonts('Poppins').valid).toBe(false);
    expect(validateGoogleFonts(null).valid).toBe(false);
  });

  it('rejects families with URL-injection characters', () => {
    expect(validateGoogleFonts([{ family: 'Roboto&display=block' }]).valid).toBe(false);
    expect(validateGoogleFonts([{ family: 'Roboto?foo' }]).valid).toBe(false);
    expect(validateGoogleFonts([{ family: 'a/b' }]).valid).toBe(false);
    expect(validateGoogleFonts([{ family: 'a%20b' }]).valid).toBe(false);
    expect(validateGoogleFonts([{ family: '"Roboto"' }]).valid).toBe(false);
  });

  it('rejects families with CR/LF', () => {
    expect(validateGoogleFonts([{ family: 'Roboto\r\nHost: evil' }]).valid).toBe(false);
  });

  it('rejects an empty or overlong family', () => {
    expect(validateGoogleFonts([{ family: '' }]).valid).toBe(false);
    expect(validateGoogleFonts([{ family: 'a'.repeat(101) }]).valid).toBe(false);
  });

  it('drops invalid weights and de-duplicates/sorts the rest', () => {
    const result = validateGoogleFonts([{ family: 'Lora', weights: [700, 400, 400, 0, 1001, 2.5] }]);
    expect(result.valid).toBe(true);
    expect(result.fonts[0].weights).toEqual([400, 700]);
  });

  it('rejects non-array weights', () => {
    expect(validateGoogleFonts([{ family: 'Lora', weights: 400 }]).valid).toBe(false);
  });

  it('enforces the family count cap', () => {
    const many = Array.from({ length: 21 }, (_, i) => ({ family: `Font${i}` }));
    expect(validateGoogleFonts(many).valid).toBe(false);
    expect(validateGoogleFonts(many, { maxFonts: 25 }).valid).toBe(true);
  });
});

describe('buildGoogleFontsHref', () => {
  it('builds a deterministic css2 URL with sorted families and weights', () => {
    const href = buildGoogleFontsHref([
      { family: 'Open Sans', weights: [600, 400] },
      { family: 'Lora' },
    ]);
    expect(href).toBe(
      'https://fonts.googleapis.com/css2?family=Lora&family=Open+Sans:wght@400;600&display=swap'
    );
  });
});

describe('loadGoogleFonts', () => {
  afterEach(() => {
    document.head
      .querySelectorAll(`[${GOOGLE_FONTS_MARKER}]`)
      .forEach((el) => el.remove());
  });

  it('injects one stylesheet link plus preconnect hints', () => {
    loadGoogleFonts([{ family: 'Poppins', weights: [400] }]);

    const sheet = document.head.querySelector(`link[${GOOGLE_FONTS_MARKER}="stylesheet"]`);
    expect(sheet).toBeInstanceOf(HTMLLinkElement);
    expect(sheet?.getAttribute('href')).toContain('family=Poppins:wght@400');
    expect(document.head.querySelectorAll(`link[${GOOGLE_FONTS_MARKER}="preconnect"]`).length).toBe(2);
  });

  it('is idempotent for the same font set', () => {
    loadGoogleFonts([{ family: 'Poppins' }]);
    loadGoogleFonts([{ family: 'Poppins' }]);
    expect(document.head.querySelectorAll(`link[${GOOGLE_FONTS_MARKER}="stylesheet"]`).length).toBe(1);
  });

  it('replaces the stylesheet when the set changes', () => {
    loadGoogleFonts([{ family: 'Poppins' }]);
    loadGoogleFonts([{ family: 'Lora' }]);
    const sheets = document.head.querySelectorAll(`link[${GOOGLE_FONTS_MARKER}="stylesheet"]`);
    expect(sheets.length).toBe(1);
    expect(sheets[0].getAttribute('href')).toContain('family=Lora');
  });

  it('does not inject anything for invalid fonts', () => {
    loadGoogleFonts([{ family: 'Roboto&evil' }]);
    expect(document.head.querySelector(`link[${GOOGLE_FONTS_MARKER}="stylesheet"]`)).toBeNull();
  });
});
