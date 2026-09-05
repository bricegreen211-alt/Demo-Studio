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
npm run doctor       # checks your setup and where files will live
npm start            # Electron app (starts the service + opens the dashboard)
npm run service      # or: service only, dashboard at http://localhost:41700
```

Clone it into your **Documents** folder (`~/Documents/Demo-Studio`, or
`%USERPROFILE%\Documents\Demo-Studio` on Windows) — that's what the docs assume.

**Extension:** open `chrome://extensions` (or `edge://extensions`) → Developer mode →
**Load unpacked** → select the `extension/` folder → pin it → click the icon and turn on
**Show demos**.

That switch starts **off** by design: nothing is injected on any site until you turn it on, so
demos don't follow you around every tab while you work. The toolbar icon shows an **ON** badge
when it's active. The same instructions, with a copy-able path, live in the app under
**Settings → Browser extension**.

> **The app runs in your terminal session.** Closing the terminal — or the Studio window — quits
> Demo Studio, and demos stop appearing until you run `npm start` again. Minimize rather than
> close. Packaging it as a double-clickable app is the planned fix.

### Updating

```bash
# quit the app first (Ctrl+C in the terminal), then:
git pull
npm install     # in case dependencies changed
npm start
```

Then **reload the extension** at `chrome://extensions` (↻ on the Demo Studio card) and refresh any
open customer tab — the browser keeps running the old copy until you do, which is the usual reason
an update looks like it didn't apply. Confirm what you're running under **Settings → About**.

Two things updates never break: your demos live in `~/Documents/CognigyDemoStudio`, outside the project, so
they're untouched; and if an older demo doesn't pick up a new template feature, hit **Sync** on its
row to refresh its code (previous source is backed up, settings kept).

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

**Settings** (sidebar) holds the system-wide bits: extension install/update instructions with the
folder path to load, **Export / Import** of all demo configuration, where your files live, and the
app version with its last-updated date. Import accepts both a Demo Studio export and an old
Cognigy Injector v3 export.

### Try it without Cognigy — sample demos

```bash
npm run seed:samples
```

Creates eight ready-built demos that run **simulated** (no Cognigy connection needed), all mapped to
**https://www.cognigy.com** so you can compare them on one real site:

| Sample | Template | Panel style | Looks like |
|---|---|---|---|
| Webchat bubble — Overlay | Webchat | Overlay | A small native chat widget in the corner |
| Voice widget — Overlay | WebRTC | Overlay | A compact click-to-call widget |
| AI assistant, chat + voice — Overlay | Both | Overlay | One widget that does both |
| Webchat — Clear side panel | Webchat | Clear | Full-height panel, site visible through it |
| Voice — Phone mockup | WebRTC | Phone | A phone sitting on the page |
| Webchat — Solid side panel | Webchat | Solid | The classic opaque slide-out |
| Webchat — Solid lower third | Webchat | Solid — lower third | A band across the bottom that hides their own chat bubble |
| Webchat — Opaque (frosted) panel | Webchat | Opaque | Frosted glass with the site blurred behind it |

Only one demo can auto-match a domain, so use the extension popup's **Demo on this browser**
override to switch between them. The chat samples answer with a scripted conversation (quick
replies, buttons, cards, structured data); the voice samples run a scripted call with call states,
a timer, and a transcript.

Simulated mode is opt-in via the literal endpoint value **`mock`** — a blank or wrong endpoint
still fails loudly, so a real customer demo can never quietly serve scripted answers as if they
came from a Cognigy agent. Anything simulated is badged **SIM** in the demo's header. To go live,
just replace `mock` with your real endpoint in the demo form.

### Chat UI — Cognigy Webchat v3, or the built-in chat

| Chat UI | What it is |
|---|---|
| **Cognigy Webchat v3** (default) | The real Cognigy Webchat v3 widget — the same one your customer would deploy, with its own launcher, teaser, chat window and close button. |
| **Built-in** | Demo Studio's own chat UI, vibe-codeable in the demo's `src/chat/`. The only option that can run a **simulated** demo. |

In Webchat v3 mode, **everything about how the chat looks comes from your Webchat v3 Endpoint in
Cognigy** — colors, logo, avatar, welcome text, Home screen, teaser message and the Style Preset
(Classic / Modern / Slick). Change it in Cognigy, refresh the demo, done. Demo Studio deliberately sends
nothing cosmetic, so it can never fight your Endpoint. The demo form greys out the fields that no longer
apply (Welcome Message, AI Agent Name, colors, logo, launcher) to make that obvious.

Because the widget is served by the Studio itself, **any existing demo can switch to it with no rebuild
and no Sync** — pick it and refresh. Simulated (`mock`) demos always fall back to the built-in UI, so the
SIM badge and scripted conversation keep working exactly as before.

It's available for the **Webchat** template on Solid or Clear panel style.

### Panel Style — solid or clear

All Demo Studio does in Webchat v3 mode is frame the widget. There are two ways:

| Style | What the customer sees | Good for |
|---|---|---|
| **Solid** (default) | Cognigy's launcher sits in the corner as normal; opening the chat slides in a full-height white drawer at your Panel Width, flush to your Panel Side | A clear "here is the assistant" moment, and long conversations |
| **Clear** | Nothing of Demo Studio's paints at all. Cognigy's launcher, teaser and chat window float on the customer's site exactly as if they had deployed it themselves | The most realistic demo — what the customer's own site would look like |

**Panel Side** and **Panel Width** apply to Solid. **Overlay** stays available for the built-in chat UI,
where the demo draws its own launcher and card in `src/shell/`.

The customer's page stays fully clickable in both styles, including while the chat is open — Demo Studio
clips its frame to exactly what Cognigy is showing.

Clear mode for the **built-in** chat still works by serving an extra stylesheet
([`clear-mode.css`](apps/studio/service/clear-mode.css)) into the demo page at request time, so existing
demos get it without a rebuild.

### Something not looking right?

Turn on **Settings → Show demo diagnostics** (on by default while Webchat v3 support settles). You get a
small badge on the demo showing the panel style, chat UI, open/closed state, the measured widget size and
the endpoint, plus verbose `[cds]` logging in the browser console. Screenshot the badge or paste the
console output and it's usually obvious what went wrong.

**If a panel style change seems to do nothing, reload the extension** at `chrome://extensions` (↻ on the
Demo Studio card) and refresh the customer tab. The browser keeps running the old copy of the extension
until you do, which is the single most common cause of "I changed it and nothing happened".

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

SE data lives in `~/Documents/CognigyDemoStudio/demos/<slug>/` (Windows:
`Documents\CognigyDemoStudio`) — `demo.json` (config, read at runtime, no rebuild needed), `src/`
(vibe-codeable source) and `dist/` (auto-built). Resolved by
[`paths.js`](apps/studio/service/paths.js), overridable with `CDS_DATA_DIR`; demos from older
versions are moved here automatically. See [CLAUDE.md](CLAUDE.md) for architecture notes.

`@cognigy/click-to-call-sdk` is pinned exactly (SOW §10) — bump it deliberately per release,
never right before a customer demo.
