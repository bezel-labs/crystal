# @bezel-labs/crystal

Push **live, validated CSS and Google Fonts** from a parent application into an
embedded preview (such as a Storybook hosted on a different subdomain or origin)
over `window.postMessage`.

It is framework-agnostic, has no runtime dependencies, and is built
security-first — previews are often hosted on origins you do not fully control,
so every message is gated by an origin allowlist and the CSS is validated at
every hop before it is injected.

## Install

```bash
npm install @bezel-labs/crystal
```

## Why

When the preview lives on a different origin, you cannot reach into its DOM
directly. This library gives you a tiny, safe channel:

- **Sender** (parent app): validate CSS, then post it to a specific iframe and
  origin.
- **Receiver** (embedded app): accept CSS only from allowlisted origins,
  re-validate it, and inject it into a single `<style>` element via
  `textContent` (never `innerHTML`).
- **Relay** (nested-iframe host, e.g. a Storybook *manager*): forward CSS one hop
  down to the real preview frame, since a grandparent window can only post to its
  direct child.

Message types on the wire: `live-preview-css` and `live-preview-google-fonts`.
Receivers/relays announce readiness with `live-preview-ready` so the parent can
(re)send without racing startup.

Setting a `font-family` over CSS is not enough — the font resource must be
loaded or the browser falls back. The `live-preview-google-fonts` message asks
the preview to load specific Google Fonts so the chosen families actually render.

## Security model

- **Origin allowlist is required.** The receiver and relay reject any message
  whose `event.origin` is not listed. Pass `['*']` only to deliberately opt out
  (e.g. local development).
- **Explicit target origin.** The sender never posts to `'*'`; it always
  addresses a concrete origin so a swapped/navigated iframe cannot receive CSS.
- **CSS is validated at every hop.** `validateCss` rejects (does not "clean")
  anything dangerous: `<style>`/`<script>`/HTML markup (breakout attempts),
  `expression()`, `javascript:`/`vbscript:`, `-moz-binding`, `behavior:`, control
  characters, `@import` (off by default), non-`https`/`data` `url()` schemes (off
  by default), and oversized payloads.
- **Safe injection.** CSS is written with `textContent` into one reused `<style>`
  node, so markup cannot be injected and the DOM does not grow.
- **Google Fonts carry no URLs.** A fonts message contains only `{ family, weights }`.
  The receiver builds the href from a hardcoded `fonts.googleapis.com/css2` base,
  so message data can never become the request's host/scheme. Family names must
  match a strict charset (`A–Z a–z 0–9 space . _ -`), so they cannot inject URL
  params or do CRLF tricks; weights are clamped to integers 1–1000 and the family
  count is capped. The font `<link>` loads no script.

## Usage

### Parent app (sender)

```ts
import { createLivePreviewSender } from '@bezel-labs/crystal';

const iframe = document.querySelector('iframe')!;
const sender = createLivePreviewSender({
  targetWindow: iframe.contentWindow!,
  targetOrigin: new URL(iframe.src).origin, // never '*'
});

// Resend whenever the preview reports it is ready.
window.addEventListener('message', (e) => {
  if (e.origin === new URL(iframe.src).origin && e.data?.type === 'live-preview-ready') {
    sender.sendCss(currentCss);
  }
});

const result = sender.sendCss(':root { --color-primary: #06f; }');
if (!result.valid) console.warn(result.errors);

// Ask the preview to load the fonts the CSS references:
sender.sendGoogleFonts([{ family: 'Poppins', weights: [400, 600] }]);
```

### Embedded app (receiver)

```ts
import { startLivePreviewReceiver } from '@bezel-labs/crystal';

startLivePreviewReceiver({
  allowedOrigins: ['https://app.example.com'],
  styleId: 'live-preview-styles',
  onReject: (reason) => console.warn(reason),
  // Google Fonts requested over `live-preview-google-fonts` are loaded by
  // default; set `loadGoogleFonts: false` to opt out.
});
```

### Nested iframe host (relay)

```ts
import { createLivePreviewRelay } from '@bezel-labs/crystal';

createLivePreviewRelay({
  allowedOrigins: ['https://app.example.com'],
  getTargetWindow: () =>
    (document.getElementById('preview-iframe') as HTMLIFrameElement | null)?.contentWindow,
  targetOrigin: window.location.origin,
});
```

## Validation options

`validateCss(input, options)` and the `validation` option on the sender/receiver/
relay accept:

- `maxLength` — size cap (default 100,000 chars).
- `allowAtImport` — permit `@import` (default `false`).
- `allowExternalUrls` — permit any `url()` scheme except `javascript:`/`vbscript:`/
  `file:` (default `false`).
- `allowedUrlSchemes` — schemes allowed when `allowExternalUrls` is off (default
  `['https', 'data']`; relative URLs and fragments always pass).

## Development

```bash
npm install     # install deps
npm run build   # bundle ESM + CJS + types with tsup
npm test        # run the Jest test suite
npm run typecheck
```

## License

[PolyForm Shield 1.0.0](./LICENSE) — free to use, modify, and redistribute for
any purpose **except** building or providing a product that competes with
[Bezel](https://bezel.new). Open-source, internal, and commercial use are all
permitted within that bound.
