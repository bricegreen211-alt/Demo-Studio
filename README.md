# Cognigy Demo Studio

Puts a live AI experience on any customer website, connected to a real Agent, Flow, or Endpoint you
already have — the successor to the Injector extension. Every transcript line, Adaptive Card and
chat bubble a demo shows comes from that live agent at runtime; themes and panel styles only ever
change the frame, never the content. The one exception is the literal endpoint value `mock`, which
runs a scripted conversation and is always badged **SIM**, so a real customer demo can never
quietly serve canned answers.

**How it works:** the Studio app (Electron) serves customer-specific *Demo Experiences* from
`http://localhost:41700`. A thin browser extension shows a launcher on the mapped customer website
and slides the Demo Experience in from the side, or floats it directly on the page. The customer
site is pure scenery — nothing is injected into it and no CSP/CORS tampering is needed.

```
Demo Studio (Electron, localhost:41700)
        │  serves demos + config API
Browser extension (launcher + slide-out / overlay panel)
        │  iframe → localhost:41700/<demo>/
Demo Experience (per customer) — or the platform's own Webchat / click-to-call widget
        │
Your AI Agent
```

Setting this up for the first time? See **[INSTALL.md](INSTALL.md)** for step-by-step install
instructions (no developer background assumed). The section below is the short version.

## Getting started

Clone the project into your **Documents** folder (`~/Documents/Demo-Studio`, or
`%USERPROFILE%\Documents\Demo-Studio` on Windows) — that's what the app assumes.

```bash
git clone https://github.com/bricegreen211-alt/Demo-Studio.git
cd Demo-Studio
npm install
```

That one install does everything: it pulls in the dependencies, creates a double-click launcher on
your Desktop and in your Applications / Start Menu, and connects Claude to this project (see
**Claude Plug-in** below) — nothing further to set up there. Day to day, double-click the launcher
that install created. To start it from a terminal instead:

```bash
npm start
```

Not sure everything landed correctly? Run:

```bash
npm run doctor
```

It checks your setup end to end and tells you exactly what to fix if something's off — a good
first step any time something isn't working, and the first thing worth pasting back if you're
asking someone else for help.

**Extension:** open `chrome://extensions` (or `edge://extensions`), turn on Developer mode, click
**Load unpacked**, and select the `extension/` folder. Pin it, then click the icon and turn on
**Show demos**. That switch starts **off** on purpose — nothing is injected on any site until you
turn it on, so demos don't follow you around every tab while you work. The toolbar icon shows an
**ON** badge when it's active. The same instructions, with a copy-able path, live in the app under
**Settings → Browser extension**.

Demo Studio keeps running when you close its window — the local service that feeds every demo
lives in the app process, so closing the window just hides it. Look for its icon in the menu bar
(macOS) or system tray (Windows); choose **Quit (stops all demos)** there when you actually want it
stopped.

### Updating

Quit the app first, then:

```bash
git pull
npm install
npm start
```

Then reload the extension at `chrome://extensions` (the ↻ icon on the Demo Studio card) and refresh
any open customer tab — the browser keeps running the old copy until you do, which is the usual
reason an update looks like it didn't apply. If a saved setting seems to revert on its own, quit
the app fully rather than just closing the window — a copy left running in the background will
keep re-validating old data against out-of-date rules.

Two things an update never breaks: your demos live in `~/Documents/CognigyDemoStudio`, outside the
project folder, so they're untouched; and if an older demo doesn't pick up a new feature, hit
**Sync** on its row to refresh its code (your previous source is backed up first, its settings are
kept).

## Day to day

Your demos show up as a **list** with a **Find** box, grouped into **folders** — drag a demo into
one, reorder folders by dragging their header, rename or delete them (hover a folder for the
controls; deleting one returns its demos to the top level, it never deletes them). Every demo and
voice gateway connects with one Follow user ID, set once under **Settings → Live Follow**
(`followme` by default), so you can track any demo conversation from the platform's own side with
no per-demo setup.

1. **+ New Demo** — name, website, folder, then **Endpoint**: Webchat, WebRTC, or Webchat + WebRTC.
   Paste the endpoint(s) in whatever form you were given them — a hosted webchat URL, a
   click-to-call link, or a bare token — they're all recognized automatically.
2. Pick a **Theme** — the list depends on the Endpoint (see below). The platform's own default
   theme always means "Demo Studio paints nothing; your Endpoint styles the real widget." Picking
   anything else reveals **Appearance** (agent name, launcher, welcome message, up to 3
   conversation-starter chips) and **Automations** (starting behavior, teaser message) — fields
   that only mean something once Demo Studio is drawing the interface itself.
3. Set **Panel** — Side, Width (Compact 360px through Full 1200px, or the theme's own default) and
   Style: **Overlay** (nothing of ours paints; the widget or the demo's own card floats on the
   page — the default) or **Panel** (the extension paints a drawer with a title bar). Both styles
   work on every Endpoint and theme — Style only changes how it's framed, never which interface
   renders.
4. **Preview & test** right in the dashboard — try the chat or place a real call before you ever
   visit the customer site.
5. Browse to the customer website — the launcher appears automatically once the domain matches, or
   pick the demo manually from the extension popup.
6. **Duplicate** an existing demo for a new customer, tweak the form, done.
7. **Vibe-code** deeper customization: the demo form's *Vibe-code customization* row (under
   Advanced) shows the project folder's path — Copy it, or Open it in your editor — point Claude
   Code, Cursor, or Codex at it, and save. The demo rebuilds on its own; no terminal, no extension
   reload.
8. **Preflight** → fix anything flagged → present.

**Settings** (sidebar) holds everything that applies across every demo: appearance (System / Light
/ Dark, also toggleable from the sidebar rail, which itself collapses to icons), the Follow user
ID, diagnostics, microphone cleanup for calls, the browser extension install steps, the Claude
Plug-in, and **Export / Import** to move demos between machines. Import also accepts an export from
the older Injector tool.

### Try it without a live connection — sample demos

```bash
npm run seed:samples
```

Creates simulated demos (endpoint `mock`, no live connection needed) covering Webchat, WebRTC and
the combination, in both panel styles, all mapped to one real site so you can compare them side by
side. Only one demo can auto-match a domain at a time, so use the extension popup's **Demo on this
browser** override to switch between them.

```bash
npm run seed:test-sites
```

Seeds your team's shared test endpoints as a **Test Sites** folder — live agents, never `mock`, so
they're never SIM-badged.

### Themes — what renders is the theme's choice, not the panel style

| Endpoint | Themes |
|---|---|
| **Webchat** | Default, then 9 presets, then Custom |
| **WebRTC** | **Halo** (default) — a voice panel Demo Studio draws: call status, live transcript, Mute/Call — then Default (the platform's own click-to-call widget) and Custom |
| **Webchat + WebRTC** | **Halo** (default) — chat and voice in one panel with a Chat/Voice switch, identity stated once at the top — then Custom |

The **Default** theme is the one where Demo Studio contributes nothing visual: on Webchat it's the
real widget, on WebRTC it's the real click-to-call widget, styled entirely from your Endpoint
(colors, logo, welcome text, style preset). Because it's served by the Studio itself, **any
existing demo can switch to it with no rebuild** — pick it and refresh.

Any other theme means Demo Studio draws the interface (Halo, or a Webchat CSS skin) and unlocks
Appearance/Automations. **Custom** starts as a copy of the selected theme with a token editor and a
free CSS block, for a one-off look.

Halo's panel is **resizable** in Overlay style — drag the grip on the corner nearest the middle of
the page, double-click to reset to the form's Width setting — and its collapsed launcher grows
smoothly into the open panel rather than cutting to it.

### Panel Style — Overlay or Panel

| Style | What the customer sees |
|---|---|
| **Overlay** (default) | Nothing of Demo Studio's paints. The widget (or Halo's own launcher/card) floats on the customer's site exactly as if it had been deployed there directly — the cleanest, most realistic look, with the fewest CSP surprises. |
| **Panel** | The extension paints a drawer at your chosen Side and Width, with a title bar, and the same content fills it. |

The customer's page stays fully clickable in both styles, including while the panel is open — the
extension clips its frame to exactly what's showing rather than covering the page with an opaque
iframe.

### Something not looking right?

Turn on **Settings → Show demo diagnostics**. You get a small badge on the demo showing the panel
style, theme, open/closed state, the measured widget size and the endpoint, plus verbose logging in
the browser console — screenshot the badge or paste the console output and it's usually obvious
what went wrong.

If a change to a demo seems to do nothing, reload the extension at `chrome://extensions` (the ↻
icon on the Demo Studio card) and refresh the customer tab.

## Remote Control

The sidebar's **Remote Control** page:

- **Voice Agent tab** — your voice gateways as a list (same layout as Demo Experiences: Find,
  drag-and-drop folders, + New Gateway / Edit / Delete). Calling a gateway replaces its row with a
  **Halo** voice panel — call status, live transcript, Mute/End — running on the same client the
  WebRTC demos use, so what you see here is what the customer would see. **⧉ Pop Out** opens that
  same panel in a compact off-screen window, with live microphone/speaker device switching and the
  Follow user ID shown for copying to the platform side.
- **Outbound Trigger tab** — **Call a number**: type one, press Enter, the phone rings. Nothing is
  saved. Contacts below it are for numbers you dial often.

### Outbound Trigger — Voice Gateway, or your flow

**Voice Gateway** (recommended) posts straight to the Voice Gateway Calls API, so the phone rings
without anything wired in the flow. Fill in the six fields once, all from the VG Self-Service
Portal: API Base URL (your region), Account SID, API Key, Application SID, the From number, and a
carrier only if you have more than one. **Application SID** is what decides which flow runs once the
call connects — that is where the agent's opening line belongs.

The API Key here is an **account-level key from the VG portal**. It is not the flow's Endpoint Key,
and the two are not interchangeable.

**Agent flow** is the original path: the contact is POSTed to your flow's REST endpoint and the flow
places the call itself. Worth knowing before you pick it — posting to a flow endpoint runs the flow
as a **text** conversation. If it answers with your call script instead of ringing a phone, the flow
matched its branch and produced its script correctly, and nothing ever asked Voice Gateway to dial;
the flow needs its own HTTP Request node against the Calls API.

Either way, every trigger shows **What was sent and received** — the exact URL, status, timing and
both JSON bodies — which is usually enough to see what went wrong without leaving the app.

### Outbound Trigger — what your flow receives

Configure the tab with your flow's REST endpoint and, if it needs one, its key. Each trigger sends
this body:

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

In your flow, branch on `data.trigger == "outboundDemo"` / `data.channel`, then place the call. The
first text output your flow returns is shown back to you as confirmation.

## Claude Plug-in

Once you have a real Agent, Flow, or Endpoint, Claude can create or update a Demo Experience and a
Remote Control gateway for it directly — in Claude Code or the Claude desktop app, from whatever
project you're already working in, not just this one. Ask it to wire an endpoint in once you have
one, and it checks first for a demo that already matches, creates or updates one, adds a matching
voice gateway if there's a voice endpoint, confirms the build, and reports back what's ready.

It's set up automatically the first time you run `npm install` — nothing to configure, including a
skill that teaches Claude when to reach for it. **Settings → Claude Plug-in** shows whether it's
currently connected, and has a command to reconnect it if you've moved this project folder.

## Under the hood

Your demos live in `~/Documents/CognigyDemoStudio/` (Windows: `Documents\CognigyDemoStudio`),
entirely outside the project folder, so updating or reinstalling the app never touches them.

For how the pieces fit together — the service, the extension, the demo templates, and the rules
that are easy to get wrong — see [CLAUDE.md](CLAUDE.md).
