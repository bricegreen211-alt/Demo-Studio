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

Setting this up for the first time? See **[INSTALL.md](INSTALL.md)** for step-by-step install
instructions (no developer background assumed). The section below is the short version, for
people already working in this repo.

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
5. **Vibe-code** deeper customization: the demo form's *Vibe-code customization* row shows the
   project folder path (Copy, or Open in the desktop app) — point Claude Code / Cursor / Codex at
   it, save — the demo rebuilds automatically. No terminal, no extension rebuild.
6. **Preflight** → fix anything flagged → **Lock** → flip **Presentation Mode** on right before
   the meeting.

Old Cognigy Injector demos: **Import** in the dashboard accepts `cognigy-injector-demos.json`
exports.

### What Presentation Mode actually does

Presentation Mode is one switch in the sidebar, and it does exactly one thing: it decides which
build of a demo the extension shows — your **live working copy**, or the **frozen Lock snapshot**.

| | Presentation Mode **off** (default) | Presentation Mode **on** |
|---|---|---|
| What the customer sees | `demos/<slug>/dist/` — rebuilds every time you save a source file | `demos/<slug>/locked/dist/` — exactly what existed the moment you last clicked **Lock** |
| Config (branding, endpoints) | Live from `demo.json` | Frozen from the locked copy — a branding tweak won't show until you Lock again |
| Risk | A bad edit can break what's on screen mid-demo | None — background edits keep happening but never reach the customer-facing copy |

The intended rhythm: build/vibe-code with it **off** → **Lock** once the demo is good → switch it
**on** right before you walk into the room → keep tinkering on other demos (or even this one)
without any chance of the presentation changing under you.

Two things worth knowing:

- The toggle is **global**, not per-demo — turning it on freezes *every* demo that has a Lock,
  not just the one you're about to present.
- It only changes what gets **served** to the customer. It does not hide or change anything in
  the Studio dashboard itself — the dashboard keeps looking and behaving the same whether the
  toggle is on or off.

## Cognigy Remote Control

The sidebar's **Remote Control** page absorbs the old "NiCE Voice Agent" desktop app:

- **Voice Agent tab** — your voice gateways as a list (same layout as Demo Experiences: Find at
  the top, collapsible folders, + New Gateway / Edit / Delete; the endpoint field suggests your
  demos' voice endpoints). Each row can **📞 Call / Mute / End inline** — no pop-up needed — via
  the vendored Click-to-Call SDK. **⧉ Pop Out** on a row opens that gateway in the compact
  480×720 full-widget window (drag it off-screen during the demo) with live mic/speaker
  switching mid-call, end call, the call-state dot, and the auto-copied `webrtc-voice-…` session
  ID for Live Follow.
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
