# Cognigy Demo Studio

A Sales Engineering demo platform that overlays a custom Cognigy-powered AI experience on any
customer website — the successor to the Cognigy Injector extension. Built to the Cognigy Demo
Studio SOW.

**How it works:** the Studio app (Electron) serves customer-specific *Demo Experiences* from
`http://localhost:41700`. The thin browser extension shows an animated AI launcher on the mapped
customer website and slides the Demo Experience in from the side. The customer site is pure
scenery — nothing is injected into it and no CSP/CORS tampering is needed (unlike the old
Injector).

```
Cognigy Demo Studio (Electron, localhost:41700)
        │  serves demos + config API
Demo Studio Extension (MV3: launcher + slide-out panel)
        │  iframe → localhost:41700/<demo>/
Demo Experience (React, per customer)
        │  @cognigy/socket-client · @cognigy/click-to-call-sdk
Cognigy AI Agent
```

## Getting started (development)

```bash
npm install
npm start            # Electron app (starts the service + opens the dashboard)
npm run service      # or: service only, dashboard at http://localhost:41700
```

**Extension:** open `chrome://extensions` (or `edge://extensions`) → Developer mode →
**Load unpacked** → select the `extension/` folder → pin it.

## SE workflow

1. **+ New Demo** — customer name, website, template (Webchat / WebRTC / both), paste the
   Cognigy endpoints in whatever form Cognigy gave you (hosted webchat URL, click-to-call link,
   or bare token — all normalized automatically), pick launcher + branding. **Create Demo.**
2. **Preview & test** right in the dashboard — open the chat or place a real call before you
   ever visit the customer site.
3. Browse to the customer website — the launcher appears automatically (domain mapping), or pick
   the demo manually in the extension popup.
4. **Duplicate** an existing demo for a new customer, tweak the form, done.
5. **Vibe-code** deeper customization: *Advanced → Open project folder*, point Claude Code /
   Cursor / Codex at it, save — the demo rebuilds automatically. No terminal, no extension
   rebuild.
6. **Preflight** → fix anything flagged → **Lock** → enable **Presentation Mode** for the
   meeting. The locked snapshot is served even while you keep editing.

Old Cognigy Injector demos: **Import** in the dashboard accepts `cognigy-injector-demos.json`
exports.

## Repository layout

| Path | What |
|---|---|
| `apps/studio/main.js` | Electron shell (starts service, opens dashboard) |
| `apps/studio/service/` | Local service: API, demo store, invisible Vite builds, preflight, importer |
| `apps/studio/renderer/` | Dashboard web app (served at `/`) |
| `extension/` | Manifest V3 extension (Chrome + Edge) |
| `templates/` | The three Demo Experience templates (React + Vite + TS) |
| `packages/shared/` | Endpoint normalization + demo.json schema (used by service, extension, templates) |

SE data lives in `~/CognigyDemoStudio/demos/<slug>/` — `demo.json` (config, read at runtime, no
rebuild needed), `src/` (vibe-codeable source), `dist/` (auto-built), `locked/` (presentation
snapshot).

`@cognigy/click-to-call-sdk` is pinned exactly (SOW §10) — bump it deliberately per release,
never right before a customer demo.
