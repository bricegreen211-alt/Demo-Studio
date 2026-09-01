# Working on Cognigy Demo Studio

Orientation for AI coding tools and new contributors. [README.md](README.md) explains what the
product does and how to use it; this file covers how it's put together and the things that are
easy to get wrong.

## The three layers, and who owns what

```
Studio app (Electron)          apps/studio/
  └─ local service :41700      apps/studio/service/    demo CRUD, builds, serving, preflight
  └─ dashboard (vanilla JS)    apps/studio/renderer/   served at /, no build step
Browser extension (MV3)        extension/              launcher + panel shell on customer sites
Demo Experience (React+Vite)   templates/ → per demo   the chat/voice UI itself
```

The customer's website is **scenery**. Nothing is injected into it and no CSP/CORS headers are
touched (the predecessor, Cognigy Injector, did both — don't reintroduce that). The extension
mounts a closed Shadow DOM host, and the demo runs inside
`chrome-extension://…/panel.html` → `iframe` → `http://localhost:41700/<slug>/`. The extension
page in the middle exists so the demo is exempt from the customer page's CSP and so the
microphone permission chain works.

**Rule of thumb:** anything the customer sees *inside* the panel belongs to the demo (and is
vibe-codeable). The shell *around* it — slide-in, phone bezel, transparency — belongs to the
extension, except in `overlay` style where the demo owns that too.

## The constraint that surprises everyone

**Each demo folder holds its own copy of the template source.** `store.create()` copies
`templates/<name>/` into `~/Documents/CognigyDemoStudio/demos/<slug>/`. So:

- Editing `templates/` only affects **demos created afterwards**.
- Existing demos pick up template changes only via **Sync** (`store.syncTemplate`), which re-copies
  the template and backs the old source up to `_backup-<timestamp>/`.
- If a change must reach *existing* demos with no action, it can't live in the template. Clear
  mode does this by having the service inject
  [`clear-mode.css`](apps/studio/service/clear-mode.css) into the demo's HTML at request time —
  a good pattern to copy for CSS-only behaviour.

## Builds

Demos have no `node_modules` and never run `npm`. The service drives Vite programmatically
([`builder.js`](apps/studio/service/builder.js)) with the demo folder as `root` and aliases every
bare import to the Studio's own dependencies. A chokidar watcher rebuilds on save — that's the
"vibe-coding" loop; no terminal, no extension reload.

Alias replacements are substituted into import specifiers, so they must use **forward slashes even
on Windows**. `builder.js` normalizes them; don't pass raw `path.join()` results.

## Configuration

`demo.json` is the single source of truth and is **read at runtime** by the demo
(`fetch("./demo.json")`), so form edits apply on refresh with no rebuild. Schema and sanitizing live
in [`packages/shared/demo-schema.js`](packages/shared/demo-schema.js), which is shared by the
service, the extension and the templates. Add new fields there, with a default, and let `sanitize()`
own the validation.

Endpoint normalization ([`packages/shared/normalize.js`](packages/shared/normalize.js)) accepts
whatever Cognigy hands an SE — hosted webchat URL, click-to-call link, or a bare token — and turns
it into the endpoint form the SDKs want. Reuse it rather than parsing URLs again.

## Panel styles

| Style | Shell drawn by | Notes |
|---|---|---|
| `solid` | extension | opaque slide-out, the default |
| `clear` | extension | transparent frame; demo surfaces are cleared by injected CSS |
| `phone` | extension | CSS phone bezel; screen is inset into a safe area |
| `overlay` | **the demo** | `src/shell/` — launcher and card are vibe-codeable |

In `overlay`, the extension supplies only a transparent iframe and sizes it from messages the demo
posts: `CDS_SIZE` (collapsed launcher size) and `CDS_OPEN` (open state + desired size), relayed up
through `panel.js`. The collapsed iframe must hug the launcher, or an invisible rectangle swallows
clicks meant for the customer's page.

## Simulated mode

Endpoint value `mock` (literal, case-insensitive) runs a scripted conversation or call instead of
connecting to Cognigy. It is **opt-in on that exact value** — a blank or wrong endpoint still fails
loudly, so a live customer demo can never quietly serve scripted answers. Anything simulated is
badged **SIM** in the UI. Preserve both properties if you touch this.

## Data lives outside the app

`~/Documents/CognigyDemoStudio/` (resolved via
[`paths.js`](apps/studio/service/paths.js) — Electron's known-folder API on Windows, so OneDrive
redirection works). Override with `CDS_DATA_DIR`. App updates never touch demos. There's a one-time
migration from the older `~/CognigyDemoStudio` location.

## Gotchas already paid for

- **Reload the extension** at `chrome://extensions` after changing anything in `extension/`.
  Chrome keeps running the old copy; this is the usual "my change did nothing".
- **`min-height: 0`** on the panel's inner iframe — a replaced element won't shrink below its
  intrinsic 150px, which overflows a launcher-sized overlay.
- **ResizeObserver feedback loops**: measuring an element whose size depends on the iframe you're
  about to resize will hang the page. The launcher uses `width: max-content` plus a change guard.
- **Private Network Access**: Chrome blocks a public HTTPS page from framing `localhost`, so you
  can't test the extension against a live https:// site by injecting a plain iframe. Save a local
  replica of the page and serve it over `http://localhost`. The real extension is exempt (it frames
  localhost from its own `chrome-extension://` origin).
- The vendored SDKs in `apps/studio/renderer/vendor/` are committed on purpose — the upstream
  click-to-call widget release URL 404s. Rebuild the bundle with `node assets/build-voice-sdk.js`.
- `@cognigy/click-to-call-sdk` is **pinned exactly**. Don't bump it casually, and never right
  before a customer demo.

## Running and checking

```bash
npm start           # Electron app: service + dashboard
npm run service     # service only, dashboard at http://localhost:41700
npm run doctor      # environment check — run this first on a new machine
npm run seed:samples # six simulated demos, no Cognigy account needed
```

There is no test suite. Verify by exercising the real thing: the dashboard at `localhost:41700`,
a demo at `localhost:41700/<slug>/`, and the extension loaded unpacked in Chrome. The service must
be restarted after changing anything under `apps/studio/service/`; the dashboard and demos are
served live.
