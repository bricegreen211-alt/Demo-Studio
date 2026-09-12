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
- If a change must reach *existing* demos with no action, it can't live in the template. The service
  injects Studio-owned assets into the demo's HTML at request time instead —
  [`clear-mode.css`](apps/studio/service/clear-mode.css), keyed by `panelStyle` in
  `PANEL_STYLE_SHEETS` (`server.js`). A good pattern to copy for CSS-only behaviour.
- The same escape hatch is why **Chat UI `webchat3` needs no template at all**: the service serves its
  own [`webchat3.html`](apps/studio/service/webchat3.html) in place of the demo's build, so an existing
  demo switches to real Webchat v3 with no rebuild and no Sync. See §Chat UI below.

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

## Themes

**Adding a theme is dropping one file in:** `assets/themes/<endpoint>/<id>.json`. Nothing else is
edited, and the service does not need restarting.

That file is read by three things that used to be three separate registries:

| What | Reads | Was |
|---|---|---|
| the allowlist `sanitize()` validates against | `themes.syncSchema()` → `schema.registerThemes()` | a hardcoded array in `demo-schema.js` |
| the picker tile (label, note, swatch) | `themes.catalog()` → `GET /api/themes` | a hand-written table in `renderer/themes.js` |
| the CSS injected into the demo | `themes.styleFor()` | already the file |

`name` and `note` come from the file; `swatch` does too, or is derived from the theme's own
`--surface` / `--accent` / `--surface-sunk` tokens, so a theme file never has to carry picker
metadata just to render a tile. The scan runs **per request** (a `themes.syncSchema()` middleware in
`server.js`), which is what makes it restart-free; parsed themes are cached by mtime, so the repeat
cost is a readdir per endpoint.

Things worth knowing before changing this:

- **`THEMES` in `demo-schema.js` is still there, and disk discovery *merges into* it** rather than
  replacing it. `demo-schema.js` is shared with the extension and the templates, which run in a
  browser with no `fs`, so that array is their only list.
- **Webchat offers exactly Cognigy Default and Custom.** Aurora, Tech, Bloom, Hibiscus, Trailhead,
  Minimal, Nebula, Sunset and Ivory were retired: they were CognigyWindowThemeBuilder preset *names*
  whose styling lives on the Endpoint, so Demo Studio composed nothing for any of them and all nine
  rendered identically to Cognigy Default. Their ids are kept in `RETIRED_THEMES` purely so
  `themes.warnDropped()` can explain the fallback to an SE whose demo still names one — the fallback
  changes nothing on screen, only the record of which Endpoint theme they'd configured. A real
  Webchat theme mechanism is the next version's job; when it lands, a file in
  `assets/themes/webchat/` registers itself with no edit to either list.
- **Discovered ids are appended, never prepended,** because `pickTheme()` falls back to the FIRST
  entry — position is what makes a theme the endpoint's default (see §Panel styles for the same
  rule on `panelStyle`). A dropped-in file must not silently become what every unset demo gets.
- **Registration is additive and never un-registers.** Deleting a theme file mid-session leaves the
  id valid until the service restarts, so demos keep the preset and merely render unstyled. The
  alternative — dropping it — would rewrite the value out of every `demo.json` that used it, which
  is the thing this whole page exists to prevent.
- **`cognigy-default` and `custom` are reserved and can never be files.** The first composes to
  nothing on purpose; the second's tokens live in `demo.json`. A `custom.json` in `assets/themes/`
  would be loaded by nothing, so registration refuses it and says so.
- **A dropped preset is now explained, not silent.** `sanitize()` still falls back quietly — it is
  pure and runs on every read and write — so `store.js` compares what went in with what came out and
  `themes.warnDropped()` says why once: no file, wrong endpoint directory, unparseable JSON, or a
  theme dir that isn't an endpoint at all. Watch the service log; that is where these land.

## Panel styles

| Style | Frame drawn by | Notes |
|---|---|---|
| `solid` | extension | on open the frame paints a full-height drawer at `panelWidth`, flush to `panelSide` |
| `clear` | nothing | the frame paints nothing; Cognigy's own launcher and window float on the site |
| `overlay` | **the demo** | `src/shell/` — launcher and card are vibe-codeable. Built-in chat UI only. |

`phone`, `solid-lower` and `opaque` were retired and are **aliased** in
`PANEL_STYLE_ALIASES` (`demo-schema.js`), not deleted. `sanitize()` runs on every read *and* every
write and `pick()` silently falls back to `solid`, so a dropped value would get rewritten out of
`demo.json` the next time anything saved the demo — including `POST /api/demos/:id/panel`, the
drag-resize handler, which no SE would think of as a config change. Add or alias; never delete.

In `overlay`, the extension supplies only a transparent iframe and sizes it from messages the demo
posts: `CDS_SIZE` (collapsed launcher size), `CDS_OPEN` (open state + desired size) and `CDS_MOVE`
(a drag offset), relayed up through `panel.js`. The collapsed iframe must hug the launcher, or an
invisible rectangle swallows clicks meant for the customer's page.

That hug is also why **every overlay template needs `html.cds-overlay body { overflow: hidden }`**.
The closed card stays mounted (so a call and the conversation survive a minimize) and its parked
transform sits below the launcher the frame was measured for — invisible at `opacity: 0`, but still
counted in scroll extent. Without the rule the collapsed frame scrolls, and a scrollbar in a 72px
iframe eats 15px of the width the launcher needs: the launcher renders visibly cut off on the
customer's page. Halo shipped without it on both voice templates and did exactly that.

**Halo can be dragged**, for a customer page with its own furniture in the corner it wants — the same
problem the Cognigy widgets have, solved the same way. The panel can't move itself (the extension
owns the frame), so `Shell.tsx` posts `CDS_MOVE` and `content.js` applies it to the frame as
`translate` — the same property the two Cognigy host pages use, and deliberately not in the frame's
transition list, so the offset lands on the same frame as the cursor while width/height keep their
open/close animation. Grab the card's top 52px or the collapsed launcher; the `.cds-grip` corner is
excluded, or resizing would move the panel too. Position is stored under its own key
(`cds:panelpos:v1:`) separate from size (`cds:panel:v2:`) — resetting one shouldn't discard the
other, and each has its own double-click reset. **Both templates carry this**, and they are byte-
identical, so edit one and copy it over; existing demos need **Sync** before they see it.

## Chat UI — Cognigy Webchat v3 (default) or the built-in chat

`demo.json`'s `chatUi` picks what renders:

- **`webchat3`** (default) — the real Cognigy Webchat v3 widget, served by
  [`webchat3.html`](apps/studio/service/webchat3.html) + `.js` + `.css` from the service, using the
  pinned `@cognigy/webchat` bundle at `/_cds/webchat.js`. `templates/**` is not involved.
- **`studio`** — the hand-built React chat in the demo's own `src/chat/`. Vibe-codeable, and the only
  path that can run a simulated (`mock`) demo.

`schema.usesWebchat3(cfg)` is the single source of truth for "is this demo on the real widget" — the
service, preflight and `/api/resolve` all call it. `template`/`panelStyle` constraints are coerced in
`sanitize()`; the `mock` check deliberately is not, because the endpoint can flip mock ↔ real
independently of `chatUi`.

### The design rule for this mode

**Demo Studio contributes nothing visual.** No launcher, no title bar, no resize handle, and nothing
cosmetic passed to `initWebchat` — no colours, no logo, no style preset. Cognigy's widget brings its own
launcher, window, teaser and close button, and everything about how it looks is configured on the
Webchat v3 Endpoint. This is the whole point of the mode: the demo should be indistinguishable from the
customer's own deployment. Resist adding options here; they belong on the Endpoint.

**The panel can be dragged.** A customer site can park its own furniture in the corner Cognigy pins
to (forthepeople.com has a "TEXT US" tab against the right edge, over the panel) and no stacking
trick reliably beats a widget in the browser's top layer — so `webchat3.js` lets the SE move it
instead. Drag the open window by its top 52px, or drag the collapsed launcher; movement under 4px is
still delivered as a normal click, so the chat stays usable and the launcher still opens. Double-click
the same strip resets it. The offset is `--cds-drag-x/y` on `<html>`, **not** an inline style, because
the widget rebuilds its subtree on every open/close; it's a `transform`, so Cognigy's own anchoring is
untouched and `getBoundingClientRect()` still reports the moved box, which is what keeps the clip
tracking it. Saved per demo in `localStorage`, keyed by path, the same way Halo's resize is. Overlay
only — in `solid` the extension paints a drawer behind the widget and a moved widget would just look
detached from it.

**One exception — the `custom` theme.** `demo.json`'s `theme.custom.colors` / `theme.custom.customColors`
map 1:1 onto Cognigy's own `settings.colors` / `settings.customColors` and are merged into `initWebchat`
by `webchat3.js`. That is an SE hand-authoring one demo's own escape hatch — the same one WebRTC's Custom
has through tokens/css — not Demo Studio choosing a look for Webchat demos generally, so the rule above
still holds for the other ten themes. The gate lives in `server.js`'s `sendWebchat3Host()`, **not** in
`sanitize()`: sanitize is pure and runs on every read, so clearing these for a non-Custom preset would
delete an SE's hand-edit the moment they previewed a different theme. Every other theme sends `{}` and
boots byte-identically to before this existed. There is no dashboard UI for it — like every other Custom
slot in this app, it is hand-edited in `demo.json` or vibe-coded through the demo's project folder. And
because `store.update()` shallow-merges, edit the file directly or Save the whole form: a partial
`PUT /api/demos/:id` carrying only `theme.preset` wipes `theme.custom` (already true of tokens/css).

### Why the frame is full-viewport and clipped

`mountWebchat3()` in `extension/content.js` creates a **full-viewport, transparent iframe that is never
resized**, and clips it to the widget's footprint with `clip-path`.

That shape is not incidental. The widget positions itself `position: fixed` against the *frame's*
viewport, so a frame sized to the widget changes the very viewport the widget measures itself against —
measure, resize, re-measure, forever. (An earlier attempt did exactly this and oscillated between
`70x64` and `96x96`.) At full size Cognigy lays itself out exactly as it would on the customer's page.

`clip-path` blocks **hit-testing** as well as painting, which is what keeps the rest of the customer's
page clickable — verified: a click at the viewport centre reaches the page while the chat is open.

The host page reports insets, not sizes: `{ type: "CDS_WC3_CLIP", open, top, right, bottom, left }`,
relayed by `panel.js`. It measures the **union** of everything Cognigy paints, because more than one
thing shows at once — while the window is open the launcher stays as a collapse chevron, and an Endpoint
can add a teaser bubble above it.

### Endpoint URLs come in two hostname shapes

`normalize.chatEndpoint()` converts the *hosted webchat page* URL an SE copies out of Cognigy into the
Endpoint URL that actually serves config JSON. Two shapes exist in the wild:

```
https://webchat-trial-us.cognigy.ai/v3/<token>          -> https://endpoint-trial-us.cognigy.ai/<token>
https://cognigy-webchat-na1.nicecxone.com/v3/<token>    -> https://cognigy-endpoint-na1.nicecxone.com/<token>
```

It is handled as a **pattern** — on any host containing "webchat", swap that word for "endpoint" and
drop the `/v<n>/` segment — not a list of known hosts, because NiCE keeps adding branded domains. A
hard-coded list quietly passes the webchat page URL through untouched, and the widget then fetches HTML
where it expects JSON; the visible symptom is "Couldn't start Webchat v3 against …".

**`voiceEndpoint()` has not been given the same treatment** — it still only recognises
`static-<cluster>.cognigy.ai/webrtc/?token=`. A NiCE-branded click-to-call link will fall through
unconverted. Fix it the same way once there's a real URL to test against.

### Things the public Webchat v3 docs get wrong

All verified against 3.49.0 — re-check on upgrade:

- `initWebchat` returns a **Promise**, and it **resolves even against a bad URL token**, so "resolved"
  is not "working". `webchat3.js` treats *the root element having children* as success instead, or a
  wrong endpoint silently leaves a blank panel forever.
- `userId` / `sessionId` / `channel` are **top-level** options, not under `settings`.
- `disableLocalStorage: true` is load-bearing: without it the widget persists a random `userId` that
  overrides the `followme` we pass, silently breaking Cognigy Live Follow.
- The widget uses **no shadow DOM**, so the host page's own stylesheet can reach it.
- `disableToggleButton` lives at `settings.widgetSettings` — we deliberately leave it off.
- **`settings.colors` takes exactly six fields** — `primaryColor`, `secondaryColor`, `chatInterfaceColor`,
  `botMessageColor`, `userMessageColor`, `textLinkColor` — and **`settings.customColors` exactly three**:
  `deleteButtonColor`, `cancelButtonColor`, `deleteAllConversationIconColor`. This is the authoritative
  copy of that list (the `custom` theme above feeds it; `demo-schema.js` points here rather than keeping
  a second copy to drift). Nothing else is read: the widget takes every one as `settings?.colors?.x`, so
  a misspelled key is silently ignored rather than erroring. Both lists came out of the pinned bundle's
  own defaults object and its live render sites, not the public docs — re-derive them on upgrade with
  `grep -oE 'colors\?\.[A-Za-z0-9_]+' node_modules/@cognigy/webchat/dist/webchat.js | sort -u`.

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

- **The shadow host sits at `z-index: 2147483647`** — the CSS maximum, set inline with `!important`,
  because third-party chat widgets park at the top of the range (Chatbase's launcher is 2147483645,
  its window 2147483646). Anything lower paints *underneath* the customer's own bot. The z-indexes
  inside the shadow root are 1/2/3 and only order siblings there. `keepInFront()` re-asserts this and
  re-attaches a detached host, but **never moves a still-attached one** — that would re-attach the
  panel iframe and reload the demo mid-conversation.
- **The host is also promoted into the top layer**, as a `popover="manual"`, because the maximum
  z-index is not actually a win: a page parking its own widget at the same 2147483647 (OneTrust does)
  beats us on **DOM order**, since equal z-index is resolved by who comes last. `showPopover()` fixes
  that without the thing `keepInFront()` may never do — it changes paint order *without moving the
  element*, so the iframe is not re-attached (measured: promotion leaves the demo's load count at 1,
  a re-append takes it to 2). `manual`, not `auto`, or an outside click would light-dismiss the panel.
  Entirely best-effort: `all:initial` on the host already neutralises the UA popover styling,
  including the `display:none` a closed popover would otherwise get, so any failure lands back on the
  plain max-z-index behaviour. It is not absolute — a page that shows its own top-layer element after
  us takes the layer back until `keepInFront()` re-asserts, and that only runs on a DOM mutation it
  observes. The occlusion probe still logs a warning when something covers us.
- **`requestAnimationFrame` never fires in a hidden tab**, so anything that must survive the SE
  switching tabs needs a timer fallback. Both `content.js` (`keepInFront`) and
  `apps/studio/service/webchat3.js` (measuring) have their own `soon()` for this; both were caught
  stalling completely before it was added.
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
