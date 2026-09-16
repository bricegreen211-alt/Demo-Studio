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

## Unreleased

### Fixed

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
