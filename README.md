# Cognigy Demo Studio

A Sales Engineering demo platform that overlays a custom Cognigy-powered AI experience on any
customer website — the successor to the Cognigy Injector extension. Built to the Cognigy Demo
Studio SOW, in the **NiCE Cognigy** brand (dark `#21212b` · blue `#3694fc` · teal `#36ead0`,
Be Vietnam Pro, ΛI app icon).

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

The dashboard shows your demos as a **list** with a **Find** box, and you can group them into
**folders** (+ New Folder, or type a folder name on the demo form). Every demo connects with the
**Follow** user ID — `followme` by default — so Cognigy Live Follow / the Interaction Panel can
track your demo conversations without any setup. **Vibe-code customization** lives at the bottom
of the demo form: the project folder path with Copy (and Open in the desktop app).

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

## Cognigy Remote Control

The sidebar's **Remote Control** page absorbs the old "NiCE Voice Agent" desktop app:

- **Voice Agent tab** — hosts the Cognigy click-to-call widget (vendored locally, no internet
  fetch) so you can take or place WebRTC calls **off-screen** during a demo. Pick a voice
  gateway (saved gateways or any demo's voice endpoint), switch microphone/speaker **live
  mid-call**, watch the call-state dot, and grab the auto-copied `webrtc-voice-…` session ID for
  Live Follow. **⧉ Pop out** opens the compact 480×720 window to drag onto a second/off screen.
- **Outbound Trigger tab** — a mini-CRM (name, telephone, SMS, email). **📞 Call** POSTs the
  contact to your Agent flow's REST endpoint and the flow places the outbound call (SMS/Email
  buttons work the same way and are labeled beta).

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
