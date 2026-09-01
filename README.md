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
git clone https://github.com/bricegreen211-alt/Demo-Studio.git
cd Demo-Studio
npm install
npm start            # Electron app (starts the service + opens the dashboard)
npm run service      # or: service only, dashboard at http://localhost:41700
```

**Extension:** open `chrome://extensions` (or `edge://extensions`) → Developer mode →
**Load unpacked** → select the `extension/` folder → pin it.

The extension has a master **Show demos** switch in its popup, and it starts **off** — nothing is
injected on any site until you turn it on, so demos don't follow you around every tab when you're
not demoing. The toolbar icon shows an **ON** badge while it's active. Reload the extension from
`chrome://extensions` whenever anything in `extension/` changes.

## SE workflow

The dashboard shows your demos as a **list** with a **Find** box, and you can group them into
**folders** (+ New Folder, or type a folder name on the demo form). Every demo connects with the
**Follow** user ID — `followme` by default — so Cognigy Live Follow / the Interaction Panel can
track your demo conversations without any setup. **Sync** re-copies the current template over an
older demo (backing its source up first) so it can pick up new features like the overlay launcher.
**Vibe-code customization** lives at the bottom of the demo form: the project folder path with Copy
(and Open in the desktop app).

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
6. **Preflight** → fix anything flagged → present.

Old Cognigy Injector demos: **Import** in the dashboard accepts `cognigy-injector-demos.json`
exports.

### Try it without Cognigy — sample demos

```bash
npm run seed:samples
```

Creates six ready-built demos that run **simulated** (no Cognigy connection needed), all mapped to
**https://www.cognigy.com** so you can compare them on one real site:

| Sample | Template | Panel style | Looks like |
|---|---|---|---|
| Webchat bubble — Overlay | Webchat | Overlay | A small native chat widget in the corner |
| Voice widget — Overlay | WebRTC | Overlay | A compact click-to-call widget |
| AI assistant, chat + voice — Overlay | Both | Overlay | One widget that does both |
| Webchat — Clear side panel | Webchat | Clear | Full-height panel, site visible through it |
| Voice — Phone mockup | WebRTC | Phone | A phone sitting on the page |
| Webchat — Solid side panel | Webchat | Solid | The classic opaque slide-out |

Only one demo can auto-match a domain, so use the extension popup's **Demo on this browser**
override to switch between them. The chat samples answer with a scripted conversation (quick
replies, buttons, cards, structured data); the voice samples run a scripted call with call states,
a timer, and a transcript.

Simulated mode is opt-in via the literal endpoint value **`mock`** — a blank or wrong endpoint
still fails loudly, so a real customer demo can never quietly serve scripted answers as if they
came from a Cognigy agent. Anything simulated is badged **SIM** in the demo's header. To go live,
just replace `mock` with your real endpoint in the demo form.

### Panel Style — solid, clear, phone, or overlay

Each demo picks how its slide-out renders over the customer's website:

| Style | What the customer sees | Good for |
|---|---|---|
| **Solid** (default) | Opaque panel, classic slide-out with a title bar | Straightforward chat/voice demos |
| **Clear** | The customer's website shows straight through the panel — only the chat bubbles, header, composer, and voice orb paint, each with its own shadow so they stay readable | Making the AI feel like it's floating on *their* site rather than boxed beside it |
| **Phone** | A floating phone mockup (bezel, dynamic island, home indicator) with the demo running on its screen; everything around the device is transparent | Simulating a call or mobile app experience on top of their desktop site |
| **Overlay** | The extension supplies only a transparent, self-sizing iframe — the demo draws its own launcher icon and compact panel | A small widget that looks like it was always part of the customer's site, and is fully vibe-codeable |

**Overlay is the one to reach for when you want it to look native.** Because the launcher and the
panel live in the demo's own source (`src/shell/Launcher.tsx` and `src/shell/Shell.tsx`), you can
vibe-code them like anything else: swap the icon, restyle the pill, change the opened size, or
wrap the card in your own device frame. The extension just follows the size the demo reports —
it hugs the launcher while collapsed (so it never swallows clicks meant for the customer's page)
and grows to the panel size when opened. The other three styles have their shell drawn by the
extension, which is why they can't be vibe-coded.

Clear mode works by serving an extra stylesheet ([`clear-mode.css`](apps/studio/service/clear-mode.css))
into the demo page at request time, so **existing demos get it without a rebuild** — a demo folder
keeps its own copy of the template source, so building it in would only ever reach new demos.


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
rebuild needed), `src/` (vibe-codeable source) and `dist/` (auto-built).

`@cognigy/click-to-call-sdk` is pinned exactly (SOW §10) — bump it deliberately per release,
never right before a customer demo.
