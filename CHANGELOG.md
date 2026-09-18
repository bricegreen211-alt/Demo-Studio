# Changelog

What changed in each release of Cognigy Demo Studio, newest first.

Two things worth knowing when an update looks like it did nothing:

- **Restart the app after pulling.** The version shown in **Settings → About** is read once when
  Demo Studio starts, so a copy left running keeps reporting the old one and serving old code.
- **Existing demos don't gain template features on their own.** Each demo holds its own copy of the
  template it was built from. Entries below marked **(Sync)** only reach an existing demo after you
  click **Sync** on its row; new demos get them automatically.

Versions follow `MAJOR.MINOR.PATCH`. `package.json` is the source of truth — `extension/manifest.json`
and `mcp-server/package.json` are written from it by `npm run version:set`, so all three always match.

---

## 1.2.0 — 2026-09-18

### Fixed

- **Remote Control hijacked the Logs pop-out.** Its pop-out test matched `popout=1` anywhere in the
  URL, so opening the log stream in its own window booted Remote Control into it, renamed the window
  and drew its own surface over the logs. Each pop-out now matches only its own page.

- **"+ New Folder" and "Duplicate" did nothing in the desktop app.** Both, on Demo Experiences
  *and* Remote Control, asked for the name with the browser's `prompt()` — which Electron does not
  implement, so the click died silently. Delete kept working because `confirm()` *is* implemented,
  which is what made it look random. They now use Demo Studio's own dialog. Renaming a folder was
  broken the same way and is fixed with them.
- **The launcher icon you picked was not always the one the customer saw.** "Voice Wave" drew a
  waveform on the picker tile, animated bars in Panel style, and a **telephone handset** in Halo —
  and since Voice Wave is the default for WebRTC, most voice demos showed the wrong one. It is a
  waveform everywhere now, and the handset has become its own **Phone** option. "Chat Bubble" had no
  case at all in Panel style and quietly fell back to the AI Orb; AI Spark lost its dark disc in
  Halo. Both fixed. **(Sync** for the Halo side — the icons live in the demo's own copy of the
  template.**)**
- **The microphone gear was unreachable on voice demos.** Noise suppression, the noise gate, echo
  cancellation and auto gain were behind **Settings → Show demo diagnostics**, which is off by
  default before a customer call — so most SEs never found them, on Cognigy Default or on Halo. The
  gear now always shows on a WebRTC demo, on every theme, and no longer depends on diagnostics. Chat
  demos have no microphone to control and stay as they were; Remote Control is unchanged.
- **The gear sat in the wrong corner on Halo.** Only Cognigy Default's host page ever positioned it,
  so on a demo that draws its own voice UI it pinned to the top-right of the frame — which in
  Overlay style is a box no bigger than the launcher, putting it on top of the mark. It now follows
  the launcher, and the panel once that opens.
- **Folder names no longer collide by case.** "Banking" and "banking" became two folders sitting
  next to each other; a clashing name is now reported instead of silently doing nothing.
- **A folder that failed to save no longer stays on screen.** It was added to the list before the
  save, and a failure was neither undone nor reported.

- **Demos and the app no longer land in OneDrive — on Windows *and* macOS.** The data root followed
  OneDrive's Known Folder Move into the sync root, which meant the sync client saw every demo
  rebuild — and demos rebuild on every file save. On a work machine this saturated OneDrive and
  crashed it. Known Folder Move does this on both platforms by different mechanisms, so both are
  handled:
  - **Windows** — the Documents known folder is repointed at `<home>\OneDrive\Documents`. Demos now
    go to `%USERPROFILE%\Documents` literally, falling back to `%LOCALAPPDATA%` if even that is a
    junction into the sync root.
  - **macOS** — `~/Documents` is replaced by a *symlink* into
    `~/Library/CloudStorage/OneDrive-<tenant>/Documents`, and there is no local Documents left to
    use. Demos go to `~/Library/Application Support/CognigyDemoStudio` instead.

  Existing demos move themselves out of OneDrive once, on first start, from any of these locations.
  `npm run doctor` warns if either the app folder or the data folder is still inside OneDrive, and
  says where to move it.
- **The "Needs reloading" banner named the wrong culprit.** Any version difference was reported as a
  stale extension, so pulling an update without restarting Demo Studio told you to reload the
  extension — which fixes nothing. It now says which side is actually behind.

### Added

- **A Logs page**, in the sidebar before Settings, for troubleshooting a demo while it's still
  happening. It opens on the Project you used last and the newest conversations, with nothing to
  type. Each conversation is a row — who ran it, which Flow, when, how many turns, its channel, and
  an error count — so you don't need a Session ID to find the one that went wrong. **Logs** buttons
  on every demo and voice gateway row jump straight there with the Project already worked out.
  Every filter — Project, Flow, User ID, Session ID and the time window — sits on one row at the
  top, and each row carries the **date and time** so a 12-hour window that straddles midnight still
  reads correctly. Flow, User ID and Session ID each suggest the values the API has just confirmed
  exist and carry an **✕** to clear back to all — Cognigy matches all three exactly, so a forgotten
  one reads as "nothing ran". **Reset** clears every filter and draws a line under everything
  already logged so the next test starts on an empty screen; nothing is deleted, and
  **Show everything** puts it back.
- **A live log dock**, opened from the rail button above Appearance or from **Raw logs** on the
  Logs page. It is a fixed panel down the right of the *whole app*, not part of the Logs page:
  open it, go back to Remote Control or a Demo Experience to make the agent do the thing, and
  watch Cognigy's log arrive next to what you're driving. It keeps tailing across navigation and
  stops only when you close it. Its own controls sit at the top — Project, **Log levels and
  limits**, and **Reset** — because from Remote Control the Logs page isn't on screen to reach
  them. It opens on **Raw log**; the **Conversation** tab pins one transcript, chosen there or by
  clicking a row on the Logs page.
- A failed conversation is now visible instead of blank. Conversations reads `error` and `fatal`
  alongside `info`, because a call that died before it said anything has only error entries — and
  those are the ones carrying the Flow name. Such a session used to render as
  "unknown flow &middot; 0 turns" with no error count, which is exactly the one you're hunting for.
- **Copy or download just the conversation.** A timestamped `User:` / `Agent:` transcript and
  nothing else — no ids, no log levels, no metadata — ready to paste into a ticket or send to a
  customer. Cognigy keeps logs for only about 24 hours, so this is the way to keep one. It also
  de-duplicates: Cognigy logs every utterance two or three times (once per channel, once
  canonically, once more at debug level), and a naive copy repeats every line.
- **Settings → Cognigy API**, which the Logs page runs on. If you already use the Cognigy MCP server
  with Claude, Demo Studio finds that key and offers to import it so you never paste a 128-character
  string. The key is stored on this machine, is never sent to the dashboard, and is deliberately
  **left out of Export** — unlike the Voice Gateway and Endpoint keys, which Export has always
  carried in clear.
- **Upload your own launcher mark.** The Upload tile in the demo form's Launcher group was greyed
  out and dropped whatever you picked. It works, and the form now states what it wants: PNG, SVG,
  JPG or WebP, square, 128×128 or larger, under 512 KB. The image is stored in the demo's
  `demo.json`, so it survives Sync and Rebuild, and it shows in both panel styles.
- **A Launcher colour picker**, next to the launcher icons, for the circle's background and its
  glow. It applies on refresh — no rebuild and **no Sync**, including on demos built before this
  release. "Reset to theme" puts it back.
- **A Phone launcher icon.**
- **Duplicate a voice gateway** on Remote Control → Voice Agent, the same as duplicating a demo. The
  copy keeps its endpoint and its folder.
- **`npm run version:set <version>`** writes one version into all three manifests and tags the commit.
- **Uninstalling** and **Moving the app instead of removing it** sections in the README. `npm install`
  writes launchers, a login item and a Claude registration outside the project folder; none of that
  was documented.
- This changelog.

---

## 1.1.0 — 2026-09-13

### Demo Experience

- **Halo** replaces the old combination panel: an icon launcher that grows into the panel, taller,
  and draggable. It's now the default for WebRTC as well, at the same size. **(Sync)**
- **Drag the panel out of the way.** Customer sites park their own furniture in the corner Cognigy
  pins to, so the panel can now be moved — on Webchat v3, on WebRTC, and on the combination. Grab the
  card's top strip or the collapsed launcher; double-click the same strip to reset. Position is saved
  per demo. **(Sync)**
- **Halo's collapsed launcher is no longer cut off** on the customer's page. **(Sync)**
- **Two panel styles**, Overlay by default with Panel always available. `phone`, `solid-lower` and
  `opaque` are aliased to their replacements rather than dropped, so no existing demo loses its setting.
- **WebRTC demos serve Cognigy's real click-to-call widget**, with the host page it's meant to run in.
- **Themes actually apply** — composed per demo and injected at request time, with panel geometry
  driven by the theme. Adding a theme is now dropping one JSON file into `assets/themes/`.
- **Webchat: the nine preset names were retired**, leaving Cognigy Default and Custom. They were
  Endpoint-side preset *names* that Demo Studio composed nothing for — all nine rendered identically.
  Their ids still validate, so an existing demo keeps its setting and simply renders as before.
- **Webchat v3: the Custom theme now does something** — `theme.custom.colors` maps onto Cognigy's own
  `settings.colors`, hand-edited per demo.
- **Webchat v3 and the overlay launcher honour Panel Side left.**
- **Simulated demo mode** and sample demos, so the app demos itself with no Cognigy account.

### Voice and Remote Control

- **Outbound Trigger**: dial Voice Gateway directly, dial a number without filing a contact first,
  see exactly what was sent and what came back, and copy the whole trace in one click.
- **Voice Gateway carries the contact on the call**, in every region.
- **Quick call** no longer passes the number off as a name, and says which path it's dialling.
- **Remote Control's pop-out runs Halo** instead of Cognigy's widget, with one shared transcript reader.
- **Mic gear in the pop-out dialer** — noise gate and noise suppression.
- **Transcripts fixed**: the payload shape had been guessed, and guessed wrong.

### Extension

- **The demo shell sits in the browser's top layer**, so a customer's own widget parked at the maximum
  z-index can't paint over it.
- **The popup says plainly whether the website matched**, instead of leaving you guessing why no
  launcher appeared.
- **Master switch** — nothing is injected on any site until you turn **Show demos** on.
- Fixed the launcher appearing on every site, the overlay widget losing its shadow, and the viewport
  being posted at an `about:blank` frame.

### Dashboard

- **Light and dark themes**, a rail that collapses to icons, and a two-tier design token layer.
- **Folders** with drag and drop, rename and delete — for demos and for Remote Control gateways.
- **Demo list** with Find, a Follow field, and an always-visible vibe-code section.
- **Settings**, rebuilt for non-technical users: extension setup, export/import, files, about.
- **NiCE Cognigy rebrand** — official lockups vendored, Be Vietnam Pro self-hosted, Material Symbols
  in place of Unicode glyphs.

### Claude plug-in

- **MCP bridge**: wire a Cognigy endpoint into Demo Studio from any Claude session. Registered
  automatically by `npm install`, with a live connection light in Settings.

### Install and data

- **Demos live outside the app**, under your Documents folder, so updates never touch them. Demos from
  the older `~/CognigyDemoStudio` location move themselves once.
- **`npm run doctor`** — one command that prints where everything resolved and checks what actually
  breaks a fresh install.
- Windows fixes throughout, and `INSTALL.md` written for someone with no developer setup.

---

## 1.0.0 — 2026-08-29

Initial release: the Electron studio, the MV3 browser extension, and three demo templates.
