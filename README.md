# Cognigy Demo Studio

A Sales Engineering demo platform that overlays a custom Cognigy-powered AI experience on any
customer website — the successor to the Cognigy Injector extension. Built in the **NiCE Cognigy**
brand (ink `#21212b` · blue `#3694fc` · teal `#36ead0` · pink `#ff5c8a`, Be Vietnam Pro, Material
Symbols Rounded icons), with a light/dark dashboard and a collapsible icon rail.

**How it works:** the Studio app (Electron) serves customer-specific *Demo Experiences* from
`http://localhost:41700`. The thin browser extension shows a launcher on the mapped customer
website and slides the Demo Experience in from the side (or floats it, overlay-style, drawn by the
demo itself). The customer site is pure scenery — nothing is injected into it and no CSP/CORS
tampering is needed.

```
Cognigy Demo Studio (Electron, localhost:41700)
        │  serves demos + config API
Demo Studio Extension (MV3: launcher + slide-out / overlay panel)
        │  iframe → localhost:41700/<demo>/
Demo Experience (React, per customer) — or Cognigy's own Webchat v3 / click-to-call widget
        │  @cognigy/socket-client · @cognigy/click-to-call-sdk
Cognigy AI Agent
```

Every transcript line, Adaptive Card and chat bubble a demo shows comes from a live Cognigy
agent at runtime — themes and panel styles change the frame, never the content. The one
exception is the literal endpoint value `mock`, which runs a scripted conversation and is always
badged **SIM**, so a real customer demo can never quietly serve canned answers.

Setting this up for the first time? See **[INSTALL.md](INSTALL.md)** for step-by-step install
instructions (no developer background assumed). The section below is the short version, for
people already working in this repo.

## Getting started (development)

```bash
git clone https://github.com/bricegreen211-alt/Demo-Studio.git
cd Demo-Studio
npm install          # installs deps AND creates the launcher icons
npm run doctor       # checks your setup and where files will live
npm start            # Electron app (starts the service + opens the dashboard)
npm run service      # or: service only, dashboard at http://localhost:41700
npm run setup        # recreate the launcher icons (after moving the folder)
```

`npm install` puts a **Cognigy Demo Studio** launcher on the Desktop, in Applications / the Start
Menu, and in the project folder. Day to day you double-click that — `npm start` is the developer
path.

Clone it into your **Documents** folder (`~/Documents/Demo-Studio`, or
`%USERPROFILE%\Documents\Demo-Studio` on Windows) — that's what the docs assume.

**Extension:** open `chrome://extensions` (or `edge://extensions`) → Developer mode →
**Load unpacked** → select the `extension/` folder → pin it → click the icon and turn on
**Show demos**.

That switch starts **off** by design: nothing is injected on any site until you turn it on, so
demos don't follow you around every tab while you work. The toolbar icon shows an **ON** badge
when it's active. The same instructions, with a copy-able path, live in the app under
**Settings → Browser extension**.

> **Demo Studio keeps running when you close its window.** The local service that feeds every demo
> lives in the app process, so closing the window just hides it — look for the icon in the menu bar
> (macOS) or system tray (Windows). Choose **Quit (stops all demos)** there when you actually want
> it stopped.

### Updating

```bash
# quit the app first (Ctrl+C in the terminal), then:
git pull
npm install     # in case dependencies changed
npm start
```

Then **reload the extension** at `chrome://extensions` (↻ on the Demo Studio card) and refresh any
open customer tab — the browser keeps running the old copy until you do, which is the usual reason
an update looks like it didn't apply. If a saved demo seems to revert on its own, quit the app
fully rather than just closing the window — a copy left running in the background will keep
re-validating old data against out-of-date rules.

Two things updates never break: your demos live in `~/Documents/CognigyDemoStudio`, outside the
project, so they're untouched; and if an older demo doesn't pick up a new template feature, hit
**Sync** on its row to refresh its code (previous source is backed up to a `_backup-<timestamp>/`
folder, `demo.json` settings kept).

## SE workflow

The dashboard shows your demos as a **list** with a **Find** box, grouped into **folders** you can
drag demos into, reorder by dragging the folder header, rename or delete (hover a folder for the
controls — deleting a folder returns its demos to the top level, it never deletes them). Every
demo and voice gateway connects with one **Follow Me** user ID, set once under **Settings → Live
Follow** (`followme` by default), so Cognigy Live Follow / the Interaction Panel can track any
demo conversation with no per-demo setup.

1. **+ New Demo** — customer name, website, folder, then **Endpoint**: Webchat, WebRTC, or
   Webchat + WebRTC. Paste the Cognigy endpoint(s) in whatever form Cognigy gave you (hosted
   webchat URL, click-to-call link, or bare token — all normalized automatically).
2. Pick a **Theme** — the list depends on the Endpoint (see below). **Cognigy Default** always
   means "Demo Studio paints nothing; the Endpoint styles the real widget." Picking anything else
   reveals **Appearance** (agent name, launcher, welcome message, up to 3 conversation-starter
   chips) and **Automations** (starting behavior, teaser message) — fields that only mean
   something once Demo Studio is drawing the UI.
3. Set **Panel** — Side, Width (Compact 360px through Full 1200px, or the theme's own default) and
   Style: **Overlay** (nothing of ours paints; the widget or the demo's own card floats on the
   page, default) or **Panel** (the extension paints a drawer with a title bar). Both styles are
   available on every endpoint and theme — Style is purely how it's framed, never which UI renders.
4. **Preview & test** right in the dashboard — open the chat or place a real call before you ever
   visit the customer site.
5. Browse to the customer website — the launcher appears automatically (domain mapping), or pick
   the demo manually in the extension popup.
6. **Duplicate** an existing demo for a new customer, tweak the form, done.
7. **Vibe-code** deeper customization: the demo form's *Vibe-code customization* row (under
   Advanced) shows the project folder path (Copy, or Open in the desktop app) — point Claude Code /
   Cursor / Codex at it, save — the demo rebuilds automatically. No terminal, no extension rebuild.
8. **Preflight** → fix anything flagged → present.

**Settings** (sidebar) holds the system-wide bits: dashboard appearance (System / Light / Dark,
also toggleable from the sidebar rail, which itself collapses to icons), the Live Follow user ID,
demo diagnostics, microphone cleanup for outbound calls, extension install/update instructions
with the folder path to load, and **Export / Import** to move demos between machines. Import also
accepts an old Cognigy Injector v3 export.

### Try it without Cognigy — sample demos

```bash
npm run seed:samples
```

Creates simulated demos (endpoint `mock`, no Cognigy connection needed) covering Webchat, WebRTC
and the combination in Overlay and Panel styles, all mapped to **https://www.cognigy.com** so you
can compare them on one real site. Only one can auto-match the domain at a time, so use the
extension popup's **Demo on this browser** override to switch between them.

```bash
npm run seed:test-sites
```

Seeds your team's real Webchat and WebRTC endpoints (from `Testing Link.docx`) as a **Test Sites**
folder — live agents, never `mock`, so they're never SIM-badged.

### Themes — what renders is the theme's choice, not the panel style

| Endpoint | Themes |
|---|---|
| **Webchat** | Cognigy Default, then 9 presets ported from [CognigyWindowThemeBuilder](https://github.com/danieltucker/CognigyWindowThemeBuilder) (Aurora, Tech, Bloom, Hibiscus, Trailhead, Minimal, Nebula, Sunset, Ivory), then Custom |
| **WebRTC** | **Halo** (default) — a voice panel Demo Studio draws: call status, live transcript, Mute/Call — then Cognigy Default (the real click-to-call widget) and Custom |
| **Webchat + WebRTC** | **Halo** (default) — chat and voice in one panel with a Chat/Voice switch, identity stated once at the top — then Custom |

**Cognigy Default** is the one theme where Demo Studio contributes nothing visual: on Webchat it's
the real **Cognigy Webchat v3** widget, on WebRTC it's the real **click-to-call** widget, styled
entirely from the Cognigy Endpoint (colors, logo, welcome text, Style Preset). Because it's served
by the Studio itself, **any existing demo can switch to it with no rebuild and no Sync** — pick it
and refresh.

Any other theme means Demo Studio draws the UI (Halo, or a Webchat v3 CSS skin) and unlocks
Appearance/Automations. **Custom** starts as a copy of the selected theme with a token editor and a
free CSS block for vibe-coding a one-off look.

Halo's panel is **resizable** in Overlay style — drag the grip on the corner nearest the middle of
the page, double-click to reset to the form's Width setting — and its collapsed launcher grows
smoothly into the open panel rather than cutting to it.

### Panel Style — Overlay or Panel

| Style | What the customer sees |
|---|---|
| **Overlay** (default) | Nothing of Demo Studio's paints. The widget (or Halo's own launcher/card) floats on the customer's site exactly as if they had deployed it themselves — the cleanest, most realistic look, and the one with the fewest CSP surprises. |
| **Panel** | The extension paints a drawer at your chosen Side and Width, with a title bar, and the same content fills it. |

The customer's page stays fully clickable in both styles, including while the panel is open — the
extension clips its frame to exactly what's showing rather than covering the page with an opaque
iframe.

### Something not looking right?

Turn on **Settings → Show demo diagnostics**. You get a small badge on the demo showing the panel
style, theme, open/closed state, the measured widget size and the endpoint, plus verbose `[cds]`
logging in the browser console (`[cds:voice]` for the transcript path) — screenshot the badge or
paste the console output and it's usually obvious what went wrong.

**If a change to a demo seems to do nothing, reload the extension** at `chrome://extensions` (↻ on
the Demo Studio card) and refresh the customer tab — and if a *saved setting itself* keeps
reverting, quit the Studio app fully rather than leaving an old copy running in the background.

## Cognigy Remote Control

The sidebar's **Remote Control** page:

- **Voice Agent tab** — your voice gateways as a list (same layout as Demo Experiences: Find,
  drag-and-drop folders you can rename or delete, + New Gateway / Edit / Delete). Calling a
  gateway replaces its row with a **Halo** voice panel — call status, live transcript, Mute/End —
  running on the same headless click-to-call client the WebRTC demos use, so what you see here is
  what the customer would see. **⧉ Pop Out** opens that same panel in a compact off-screen window
  with live microphone/speaker device switching and the Live Follow user ID shown for copying into
  Cognigy.
- **Outbound Trigger tab** — a mini-CRM (name, phone, SMS, email). **Call** POSTs the contact to
  your Agent flow's REST endpoint and the flow places the outbound call (SMS/Email are labeled
  beta).

### Outbound Trigger — what your flow receives

Configure the tab with your flow's REST endpoint (`https://endpoint-<cluster>.cognigy.ai/<token>`,
optional `x-cognigy-endpoint-key`). Each trigger POSTs the standard Cognigy REST body:

```json
{
  "userId": "cds-remote-…",
  "sessionId": "cds-outbound-…",
  "text": "",
  "data": {
    "trigger": "outboundDemo",
    "channel": "voice",
    "contact": { "name": "Jane Doe", "phone": "+1555…", "sms": "+1555…", "email": "jane@…" }
  }
}
```

In your flow, branch on `data.trigger == "outboundDemo"` / `data.channel`, then place the call —
e.g. an HTTP Request node to the Voice Gateway outbound-call API
(`POST https://api-vg-<region>.cognigy.ai/v1/Accounts/<account_sid>/Calls` with
`application_sid`, `from`, and `to.number = data.contact.phone` — see
docs.cognigy.com → Voice Gateway → Create Outbound Calls). The first text output your flow
returns is shown to the SE as confirmation.

## Repository layout

| Path | What |
|---|---|
| `apps/studio/main.js` | Electron shell (starts service, opens dashboard) |
| `apps/studio/service/` | Local service: API, demo store, invisible Vite builds, preflight, theme injection, Webchat v3 / click-to-call host pages |
| `apps/studio/renderer/` | Dashboard web app (served at `/`) — vendored icons, brand assets and fonts live under `renderer/brand/` and `renderer/vendor/` |
| `extension/` | Manifest V3 extension (Chrome + Edge) |
| `templates/` | The three Demo Experience templates (React + Vite + TS) |
| `assets/themes/` | Theme token files (`<endpoint>/<id>.json`), injected server-side so an existing demo picks up a theme change with no rebuild |
| `packages/shared/` | Endpoint normalization, the `demo.json` schema, and the Cognigy transcript-payload reader — shared by the service, extension, and templates so they can't disagree |

SE data lives in `~/Documents/CognigyDemoStudio/demos/<slug>/` (Windows:
`Documents\CognigyDemoStudio`) — `demo.json` (config, read at runtime, no rebuild needed), `src/`
(vibe-codeable source) and `dist/` (auto-built). Resolved by
[`paths.js`](apps/studio/service/paths.js), overridable with `CDS_DATA_DIR`; demos from older
versions are moved here automatically. See [CLAUDE.md](CLAUDE.md) for architecture notes.

`@cognigy/click-to-call-sdk` is pinned exactly — bump it deliberately per release, never right
before a customer demo.
