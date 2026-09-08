# Installing Cognigy Demo Studio

This guide is for a Sales Engineer setting up Cognigy Demo Studio on their own machine for the
first time. It assumes no prior developer setup. Steps are given for **macOS** and **Windows**
side by side — skip to whichever matches your machine.

**Heads up before you start:** the setup below uses a terminal **once**, for a single command.
After that you get a **Cognigy Demo Studio icon** on your Desktop, in your Applications / Start
Menu, and in the project folder — you launch it by double-clicking, like any other app, and never
touch a terminal again. It can also start itself when you log in, so it's simply always ready.

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
2. Unzip it into your **Documents** folder, so it sits with the rest of your files and doesn't
   get cleared out:
   - **macOS**: `~/Documents/Demo-Studio`
   - **Windows**: `Documents\Demo-Studio` (i.e. `C:\Users\<you>\Documents\Demo-Studio`)

   Don't run it from inside the zip, and avoid the Downloads folder.

**Option B — `git clone` (if you already have git, or the app told you it's installed)**

Open a terminal (see Step 2 below for how) and run:

```bash
cd ~/Documents          # macOS
cd %USERPROFILE%\Documents   # Windows (PowerShell: cd $HOME\Documents)

git clone https://github.com/bricegreen211-alt/Demo-Studio.git
cd Demo-Studio
```

This puts a `Demo-Studio` folder inside your Documents folder and — unlike the ZIP — makes it easy
to pull future updates later with `git pull`.

---

## Step 2 — Run setup (the one terminal command)

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
   above) and then creates your **Cognigy Demo Studio** launcher icons. You'll see a lot of text
   scroll by — that's normal. It's done when the last lines look like this:

   ```
   [setup] created /Users/you/Applications/Cognigy Demo Studio.app
   [setup] created /Users/you/Desktop/Cognigy Demo Studio.app
   [setup] Double-click "Cognigy Demo Studio" to start. No terminal needed from here on.
   ```

   > **Windows note:** if this is the very first time you've run `npm` on this machine, Windows
   > may show a firewall prompt ("Windows Defender Firewall has blocked some features…") — click
   > **Allow access**.

4. Check everything landed correctly:

   ```bash
   npm run doctor
   ```

   This prints where your files will live and flags anything missing. If it ends with
   **"Everything looks good"** you're ready. If it lists a ✗, fix that first — it tells you how.

**That's the last time you need a terminal.** You can close it now.

---

## Step 3 — Start Cognigy Demo Studio

**Double-click the Cognigy Demo Studio icon** — on your Desktop, in Applications (macOS) or the
Start Menu (Windows), or in the project folder. All three are the same app.

A window titled **Cognigy Demo Studio** opens. Behind the scenes it also starts a small local
service (`http://localhost:41700`) that the extension talks to; you never need that URL yourself.

Because the launcher was created on your own machine rather than downloaded, **macOS Gatekeeper and
Windows SmartScreen leave it alone** — there's no "unidentified developer" or "Windows protected
your PC" warning to click through.

- **macOS**: the first launch asks for **microphone access** — click **Allow** (needed for voice
  demos and Cognigy Remote Control).
- **Windows**: Windows asks for **microphone access** the first time a voice demo uses it — click
  **Yes**.

> ### Turn on "Start when I log in"
>
> Open **Settings → Starting up** in the app and tick **Start Demo Studio when I log in**. Demo
> Studio will then be running before you need it, every day, without you thinking about it.

### Closing the window doesn't stop it

Demo Studio keeps running in the background — look for its icon in the **menu bar** (macOS) or the
**system tray** (Windows). That's deliberate: your demos are served by that background service, so
closing the Studio window leaves them working on customer sites.

To actually stop it, click that icon and choose **Quit (stops all demos)**.

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

**Want something to look at right away?** Before building your own, you can load five ready-made
sample demos that run without any Cognigy connection — solid and clear side panels plus three overlay
widgets. In the terminal, in the project folder:

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

Steps 1, 2 and 4 were one-time. From now on:

- **Double-click the Cognigy Demo Studio icon** — Desktop, Applications / Start Menu, or the
  project folder. No terminal, ever.
- Better still, turn on **Settings → Starting up → Start Demo Studio when I log in**, and it will
  already be running whenever you need it.
- **Closing the Studio window doesn't stop it.** It keeps serving your demos from the menu bar
  (macOS) or system tray (Windows). Use **Quit** on that icon when you really want it stopped.
- The browser extension, once loaded, stays installed — you don't reload it each session. Just
  remember to turn **Show demos** on when you want demos to appear.

> **If you move or rename the project folder**, the icons point at the old location. Open the
> folder in a terminal once more and run `npm run setup` to recreate them. Demo Studio also warns
> you about this in **Settings → Starting up**.

---

## Updating to a new version

When someone ships changes, here's the whole routine. Steps 3 and 4 are the ones people forget.

1. **Quit the app** — click the Cognigy Demo Studio icon in the menu bar (macOS) or system tray
   (Windows) and choose **Quit (stops all demos)**. Closing the window alone isn't enough; it
   deliberately keeps running.
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

   This also refreshes your launcher icons, so they keep working if anything moved.

4. **Start it again** by double-clicking the Cognigy Demo Studio icon.

5. **Reload the browser extension** — only needed when the `extension` folder changed, but it's
   harmless to always do it:
   - Open `chrome://extensions` (or `edge://extensions`)
   - Click **Reload** (↻) on the **NiCE Cognigy Demo Studio** card
   - Refresh any customer tab you already had open

   Skipping this is the most common reason an update "doesn't seem to have worked" — the browser
   keeps running the old copy until you reload it. Demo Studio now catches this for you: if the
   extension is older than the app, **Settings → Browser extension** shows a **Needs reloading**
   badge telling you exactly that.

6. **Check Settings → About** in the app to confirm the version and last-updated date match what
   you expect.

### Your demos are never touched by an update

Demos live in your Documents folder — `~/Documents/CognigyDemoStudio` (macOS) or
`C:\Users\<you>\Documents\CognigyDemoStudio` (Windows) — a completely separate folder from the app.
If you used an earlier version that stored them directly in your home folder, they're moved there
automatically the first time you start this version; nothing is lost. Updating, reinstalling, or even deleting the project
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

**Run `npm run doctor` first** — it checks the most common problems and tells you what to do.

| Symptom | Fix |
|---|---|
| `npm: command not found` (or `'npm' is not recognized...` on Windows) | Node.js isn't installed, or you need to fully close and reopen the terminal after installing it (PATH changes need a fresh terminal window). Reinstall from nodejs.org if unsure. |
| No **Cognigy Demo Studio** icon after `npm install` | Re-run `npm run setup` in the project folder and read what it prints — it names each icon it creates, and says why if it can't. |
| Double-clicking the icon does nothing, or says its files have moved | The project folder was moved or renamed. Open it in a terminal and run `npm run setup`. |
| **Everything worked, then demos stopped appearing** | Demo Studio was quit from the menu-bar / system-tray icon. Double-click the icon to start it again — nothing is lost. |
| Launcher never appears anywhere | Click the extension icon — is **Show demos** on? It's off by default. |
| Updated, but nothing changed | Reload the extension at `chrome://extensions` (↻) and refresh the tab. For demo-level features, use **Sync** on the demo row. |
| Extension shows "Cognigy Demo Studio isn't running" | Double-click the Cognigy Demo Studio icon. If it's already running you'll see it in the menu bar / system tray. |
| Launcher doesn't appear on the customer site | Check the extension popup: is a demo mapped to this website? Set the demo's **Website** field, or pick it manually in the popup. |
| Microphone doesn't work in a voice demo | Grant microphone access when your OS/browser prompts. macOS: check **System Settings → Privacy & Security → Microphone**. Windows: check **Settings → Privacy & security → Microphone**. |
| "Port 41700 is being used by another program" | Something else on your machine has claimed the port Demo Studio needs. Close it and start Demo Studio again. If Demo Studio itself is already running, it will tell you so and point you at the menu-bar / tray icon. |
| The extension pill says **Needs reloading** | The extension is older than the app. Open `chrome://extensions`, click the reload arrow on Cognigy Demo Studio, then refresh any customer tab. |

---

## For your IT/engineering team: why there's no .dmg / .exe

Demo Studio deliberately runs from source with generated launchers rather than shipping a signed
installer. The trade is a one-time `npm install` in exchange for:

- **No security warnings.** Because the launcher is created on the SE's own machine it never picks
  up macOS's quarantine flag, so there's no Gatekeeper prompt and no SmartScreen warning. An
  unsigned `.dmg`/`.exe` would show both — and on macOS Sequoia the old right-click → Open bypass
  no longer exists, so the SE would have to go into System Settings → Privacy & Security.
- **No certificates to buy or renew** (Apple Developer ID, Windows Authenticode).
- **Demos keep building.** The app runs Vite against its own `node_modules` at runtime to build
  each demo; packing that into an `app.asar` archive is where a naive installer breaks.

If you later want a true double-click installer, [`electron-builder`](https://www.electron.build/)
is the path, and it will need code-signing on both platforms to be worth it — plus `asarUnpack`
for `node_modules`, `templates/`, `packages/shared/` and `extension/`, since Vite has to read real
files from disk.
