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

1. **Node.js 20 LTS** — the runtime the Studio app and its local service run on.
   - Go to [nodejs.org](https://nodejs.org) and download the **LTS** version.
     - **macOS**: choose the **macOS Installer (.pkg)**, matching your chip (Apple Silicon or
       Intel — the site auto-detects this for you).
     - **Windows**: choose the **Windows Installer (.msi)**, 64-bit.
   - Run the installer with all default options. This also installs `npm` and `git`-related
     tooling you'll use below.
   - **Windows only**: when the installer offers to install "tools for native modules," leave
     that checkbox **unchecked** — it isn't needed here and takes a long time.
2. **Google Chrome or Microsoft Edge** — for the browser extension. Both are Chromium, so either
   works the same way; install whichever you don't already have from
   [google.com/chrome](https://www.google.com/chrome/) or it's already on Windows.

---

## Step 1 — Get the code

The project lives on GitHub at **[github.com/bricegreen211-alt/Demo-Studio](https://github.com/bricegreen211-alt/Demo-Studio)**.
Pick whichever of these feels more comfortable — both end with the same folder on your computer.

**Option A — Download ZIP (no git needed)**

1. On the [repo page](https://github.com/bricegreen211-alt/Demo-Studio), click the green **Code**
   button → **Download ZIP**.
2. Unzip it somewhere permanent — e.g. `~/Demo-Studio` on macOS or `C:\Demo-Studio` on Windows.
   Don't run it from inside a zip file or a Downloads folder you plan to clear out.

**Option B — `git clone` (if you already have git, or the app told you it's installed)**

Open a terminal (see Step 2 below for how) and run:

```bash
git clone https://github.com/bricegreen211-alt/Demo-Studio.git
cd Demo-Studio
```

This puts a `Demo-Studio` folder wherever you ran the command from (your home folder, by
default), and — unlike the ZIP — makes it easy to pull future updates later with `git pull`.

---

## Step 2 — Install dependencies

1. Open a terminal:
   - **macOS**: open **Terminal** (press `Cmd + Space`, type "Terminal", press Enter).
   - **Windows**: open **PowerShell** (press the Start key, type "PowerShell", press Enter — the
     regular, non-admin PowerShell is fine).
2. Navigate into the project folder (skip this if you used `git clone` above and are already
   there):
   - Type `cd ` (with a trailing space).
   - Drag the `Demo-Studio` folder from **Finder** (macOS) or **File Explorer** (Windows) into
     the terminal window — it fills in the path for you.
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

## Step 3 — Start Cognigy Demo Studio

In the same terminal, in the same folder, run:

```bash
npm start
```

A window titled **Cognigy Demo Studio** opens automatically — this is the app. Behind the scenes
it also started a small local service on your machine (`http://localhost:41700`) that the
extension talks to; you don't need to do anything with that URL directly.

> ### ⚠️ Leave the terminal window open
>
> Demo Studio runs *inside* that terminal session. If you close the terminal, the app is shut down
> with it, and your demos stop appearing on customer sites — the panel will say "Demo Studio isn't
> running."
>
> **Minimize the terminal, don't close it.** The same applies to the Studio window itself: closing
> it quits the app. Minimize it instead while you're presenting.
>
> Nothing is lost when this happens — your demos live in a separate folder. Just run `npm start`
> again and everything is back. (A double-clickable app that removes the terminal entirely is the
> planned fix; see the note at the end of this guide.)

- **macOS**: the first launch will ask for **microphone access** — click **Allow** (needed for
  voice demos and Cognigy Remote Control). It may also warn that the app is from an
  "unidentified developer" the very first time — if so, right-click the app window in the Dock
  (or go to **System Settings → Privacy & Security**) and choose **Open** to confirm once.
- **Windows**: **Windows Defender SmartScreen** may show "Windows protected your PC" the first
  time Electron runs — click **More info**, then **Run anyway**. Windows will also ask for
  **microphone access** the first time a voice demo tries to use it — click **Yes**.

---

## Step 4 — Install the browser extension

The extension is what actually shows the animated launcher and demo panel on a customer's
website. Steps are identical on macOS and Windows.

1. Open **`chrome://extensions`** (Chrome) or **`edge://extensions`** (Edge) — paste that into
   the address bar.
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked**.
4. Select the **`extension`** folder inside the `Demo-Studio` project folder (not a zip — the
   folder itself).
5. You should see **NiCE Cognigy Demo Studio** appear in your extensions list. Click the
   puzzle-piece icon in your browser toolbar and **pin** it so it's always visible.
6. **Click the pinned icon and turn on "Show demos."** The extension ships with this switch
   **off**, so nothing appears on any website until you turn it on. That's deliberate — it keeps
   demos from popping up in unrelated tabs while you work. The icon shows an **ON** badge while
   it's active.

Repeat this in both Chrome and Edge if you use both.

> **Tip:** these same steps live inside the app under **Settings → Browser extension**, with a
> Copy button for the folder path — handier than retyping it from here.

---

## Step 5 — Create your first demo

**Want something to look at right away?** Before building your own, you can load four ready-made
sample demos that run without any Cognigy connection — one per panel style (solid, clear, phone)
plus a multimodal one. In the terminal, in the project folder:

```bash
npm run seed:samples
```

They appear in your demo list immediately and are badged **SIM** so they're never mistaken for a
live agent. Swap in a real endpoint whenever you're ready.

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

You don't need to repeat Steps 1, 2, or 4 again — those were one-time. Every time after that, you
just need to get the app running again:

- **macOS**: reopen **Terminal**, `cd` into the project folder (or press the Up arrow to recall
  the last command), and run `npm start`. To skip retyping the path each time, you can create a
  simple double-clickable shortcut that runs `npm start` in that folder — ask a teammate familiar
  with the project to set one up.
- **Windows**: reopen **PowerShell**, `cd` into the project folder, and run `npm start`. A
  `.bat` file with `cd /d "C:\Demo-Studio" && npm start` saved to your Desktop gives you a
  double-clickable shortcut — again, worth asking a teammate to set up once.
- The browser extension, once loaded, stays installed — you don't reload it each session. Just
  remember to turn **Show demos** on when you want demos to appear.

---

## Updating to a new version

When someone ships changes, here's the whole routine. Steps 3 and 4 are the ones people forget.

1. **Quit the app** — close the Studio window, and press `Ctrl+C` in the terminal (or close it).
   You can't update files that are in use.

2. **Get the new code.** In the project folder:

   ```bash
   git pull
   ```

   (If you downloaded a ZIP instead of cloning, download the new ZIP and replace the folder —
   but keep reading, because your demos are safe either way.)

3. **Update dependencies**, in case the new version needs something new:

   ```bash
   npm install
   ```

4. **Start it again** with `npm start`.

5. **Reload the browser extension** — only needed when the `extension` folder changed, but it's
   harmless to always do it:
   - Open `chrome://extensions` (or `edge://extensions`)
   - Click **Reload** (↻) on the **NiCE Cognigy Demo Studio** card
   - Refresh any customer tab you already had open

   Skipping this is the most common reason an update "doesn't seem to have worked" — the browser
   keeps running the old copy until you reload it.

6. **Check Settings → About** in the app to confirm the version and last-updated date match what
   you expect.

### Your demos are never touched by an update

Demos live in `~/CognigyDemoStudio` (macOS) or `C:\Users\<you>\CognigyDemoStudio` (Windows) —
a completely separate folder from the app. Updating, reinstalling, or even deleting the project
folder leaves them alone. **Settings → Back up & move demos → Export** writes them all to one
file if you want a backup before a big change.

### Picking up new demo features on older demos

Each demo keeps its own copy of the template it was built from, so a demo you created last month
won't automatically gain features added to the templates since. If a new feature doesn't show up
on an existing demo, click **Sync** on that demo's row in the demo list — it refreshes the demo's
code from the current template, backs up its previous source inside the demo folder first, and
keeps all your settings and branding.

Newly created demos always start from the current templates, so this only applies to older ones.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `npm: command not found` (or `'npm' is not recognized...` on Windows) | Node.js isn't installed, or you need to fully close and reopen the terminal after installing it (PATH changes need a fresh terminal window). Reinstall from nodejs.org if unsure. |
| `npm start` does nothing / errors immediately | Make sure you ran `npm install` first, in the same folder. |
| **Everything worked, then demos stopped appearing** | The terminal window was closed, which shuts down Demo Studio. Reopen it, `cd` to the project folder, and run `npm start` again. Nothing is lost. |
| Launcher never appears anywhere | Click the extension icon — is **Show demos** on? It's off by default. |
| Updated, but nothing changed | Reload the extension at `chrome://extensions` (↻) and refresh the tab. For demo-level features, use **Sync** on the demo row. |
| macOS: "app can't be opened because it is from an unidentified developer" | Right-click the app window in the Dock and choose **Open**, or approve it in **System Settings → Privacy & Security → Open Anyway**. |
| Windows: "Windows protected your PC" (SmartScreen) | Click **More info** → **Run anyway**. This is expected for an unsigned internal tool. |
| Extension shows "Cognigy Demo Studio isn't running" | The Studio app (or at least its window) needs to be open — go back to Step 3. |
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
