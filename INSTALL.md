# Installing Cognigy Demo Studio

This guide is for a Sales Engineer setting up Cognigy Demo Studio on their own machine for the
first time. It assumes no prior developer setup. Steps are given for **macOS** and **Windows**
side by side — skip to whichever matches your machine.

**Heads up before you start:** Cognigy Demo Studio doesn't yet ship as a double-click installer
(no `.dmg` / `.exe` like the old NiCE Voice Agent app) — you run it from its source folder with
one command. That's still no terminal *day-to-day*: the one-time setup below takes a few minutes,
and after that you launch it the same way every time.

---

## System requirements

| | macOS | Windows |
|---|---|---|
| OS version | macOS 11 (Big Sur) or later | Windows 10 (64-bit) or later |
| Processor | Apple Silicon or Intel | 64-bit Intel/AMD |
| Disk space | ~500 MB free (dependencies + your demo files) | ~500 MB free |
| Memory | 8 GB RAM recommended | 8 GB RAM recommended |
| Browser | Google Chrome or Microsoft Edge (Chromium-based) | Google Chrome or Microsoft Edge (Chromium-based) |
| Node.js | Version **20 LTS** or later | Version **20 LTS** or later |
| Microphone | Required for voice demos and Cognigy Remote Control | Required for voice demos and Cognigy Remote Control |
| Network | Outbound HTTPS access to `*.cognigy.ai` (and your own Cognigy tenant) | Outbound HTTPS access to `*.cognigy.ai` (and your own Cognigy tenant) |

You do **not** need admin/root rights for any of this on either OS — Node.js installs per-user,
and the project itself just lives in a folder you choose.

---

## What you need first

1. **The project folder** — a copy of the `Cognigy Demo Studio` folder (from wherever your team
   shares it: a zip, a shared drive, or a git repo). Unzip it somewhere permanent — e.g.
   `~/Cognigy Demo Studio` on macOS or `C:\Cognigy Demo Studio` on Windows. Don't run it from
   inside a zip file or a Downloads folder you plan to clear out.
2. **Node.js 20 LTS** — the runtime the Studio app and its local service run on.
   - Go to [nodejs.org](https://nodejs.org) and download the **LTS** version.
     - **macOS**: choose the **macOS Installer (.pkg)**, matching your chip (Apple Silicon or
       Intel — the site auto-detects this for you).
     - **Windows**: choose the **Windows Installer (.msi)**, 64-bit.
   - Run the installer with all default options. This also installs `npm`, which you'll use once
     below.
   - **Windows only**: when the installer offers to install "tools for native modules," leave
     that checkbox **unchecked** — it isn't needed here and takes a long time.
3. **Google Chrome or Microsoft Edge** — for the browser extension. Both are Chromium, so either
   works the same way; install whichever you don't already have from
   [google.com/chrome](https://www.google.com/chrome/) or it's already on Windows.

---

## Step 1 — Install dependencies

1. Open a terminal:
   - **macOS**: open **Terminal** (press `Cmd + Space`, type "Terminal", press Enter).
   - **Windows**: open **PowerShell** (press the Start key, type "PowerShell", press Enter — the
     regular, non-admin PowerShell is fine).
2. Navigate into the project folder:
   - Type `cd ` (with a trailing space).
   - Drag the `Cognigy Demo Studio` folder from **Finder** (macOS) or **File Explorer** (Windows)
     into the terminal window — it fills in the path for you.
   - Press Enter.
3. Run:

   ```bash
   npm install
   ```

   This downloads everything the app needs (a few minutes, one-time, needs the network access
   above). You'll see a lot of text scroll by — that's normal. It's done when you get your prompt
   back with no red "error" lines.

   > **Windows note:** if this is the very first time you've run `npm` on this machine, Windows
   > may show a firewall prompt ("Windows Defender Firewall has blocked some features…") — click
   > **Allow access**.

---

## Step 2 — Start Cognigy Demo Studio

In the same terminal, in the same folder, run:

```bash
npm start
```

A window titled **Cognigy Demo Studio** opens automatically — this is the app. Behind the scenes
it also started a small local service on your machine (`http://localhost:41700`) that the
extension talks to; you don't need to do anything with that URL directly.

**Keep this window open** while you work — closing it (or the terminal) stops the Studio.

- **macOS**: the first launch will ask for **microphone access** — click **Allow** (needed for
  voice demos and Cognigy Remote Control). It may also warn that the app is from an
  "unidentified developer" the very first time — if so, right-click the app window in the Dock
  (or go to **System Settings → Privacy & Security**) and choose **Open** to confirm once.
- **Windows**: **Windows Defender SmartScreen** may show "Windows protected your PC" the first
  time Electron runs — click **More info**, then **Run anyway**. Windows will also ask for
  **microphone access** the first time a voice demo tries to use it — click **Yes**.

---

## Step 3 — Install the browser extension

The extension is what actually shows the animated launcher and demo panel on a customer's
website. Steps are identical on macOS and Windows.

1. Open **`chrome://extensions`** (Chrome) or **`edge://extensions`** (Edge) — paste that into
   the address bar.
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked**.
4. Select the **`extension`** folder inside the `Cognigy Demo Studio` project folder (not a zip —
   the folder itself).
5. You should see **NiCE Cognigy Demo Studio** appear in your extensions list. Click the
   puzzle-piece icon in your browser toolbar and **pin** it so it's always visible.

Repeat this in both Chrome and Edge if you use both.

---

## Step 4 — Create your first demo

Back in the Cognigy Demo Studio window:

1. Click **+ New Demo**.
2. Fill in the customer's name and website, pick a template (Webchat, WebRTC, or both), and paste
   in your Cognigy endpoint(s) — whatever format Cognigy gave you works.
3. Click **Create Demo**. A live preview appears on the right — try the chat or call there first.
4. Browse to the customer's website in Chrome/Edge — the animated launcher should appear
   automatically. Click it to see the demo slide in.

If the launcher doesn't appear, click the extension icon in your toolbar — it tells you whether
Cognigy Demo Studio is running and which demo (if any) is mapped to the site you're on.

---

## Everyday use, after this first setup

You don't need to repeat Steps 1 or 3 again — those were one-time. Every time after that, you
just need to get the app running again:

- **macOS**: reopen **Terminal**, `cd` into the project folder (or press the Up arrow to recall
  the last command), and run `npm start`. To skip retyping the path each time, you can create a
  simple double-clickable shortcut that runs `npm start` in that folder — ask a teammate familiar
  with the project to set one up.
- **Windows**: reopen **PowerShell**, `cd` into the project folder, and run `npm start`. A
  `.bat` file with `cd /d "C:\Cognigy Demo Studio" && npm start` saved to your Desktop gives you
  a double-clickable shortcut — again, worth asking a teammate to set up once.
- The browser extension, once loaded, stays installed — you don't reload it each session.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `npm: command not found` (or `'npm' is not recognized...` on Windows) | Node.js isn't installed, or you need to fully close and reopen the terminal after installing it (PATH changes need a fresh terminal window). Reinstall from nodejs.org if unsure. |
| `npm start` does nothing / errors immediately | Make sure you ran `npm install` first, in the same folder. |
| macOS: "app can't be opened because it is from an unidentified developer" | Right-click the app window in the Dock and choose **Open**, or approve it in **System Settings → Privacy & Security → Open Anyway**. |
| Windows: "Windows protected your PC" (SmartScreen) | Click **More info** → **Run anyway**. This is expected for an unsigned internal tool. |
| Extension shows "Cognigy Demo Studio isn't running" | The Studio app (or at least its window) needs to be open — go back to Step 2. |
| Launcher doesn't appear on the customer site | Check the extension popup: is a demo mapped to this website? Set the demo's **Website** field, or pick it manually in the popup. |
| Microphone doesn't work in a voice demo | Grant microphone access when your OS/browser prompts. macOS: check **System Settings → Privacy & Security → Microphone**. Windows: check **Settings → Privacy & security → Microphone**. |
| Port already in use / service won't start | Another copy of Cognigy Demo Studio may already be running (check for another open window, on either OS) — only one instance is needed. |

---

## For your IT/engineering team: packaging a real installer

Today, `npm start` runs the Electron app straight from source — there's no `.dmg`/`.exe` build
step configured yet. If you want a one-click installer like the old Voice Agent app, the natural
next step is adding [`electron-builder`](https://www.electron.build/) to this project, which can
produce a signed `.dmg` + Apple notarization (macOS) and an `.exe`/MSI installer (Windows) from
the same `apps/studio/` source — removing the Gatekeeper/SmartScreen prompts above along with the
terminal step entirely. That's a separate, small project — flag it if it'd help your rollout.
