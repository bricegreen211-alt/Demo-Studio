# Installing Cognigy Demo Studio

This guide is for a Sales Engineer setting up Cognigy Demo Studio on their own machine for the
first time. It assumes no prior developer setup.

**Heads up before you start:** Cognigy Demo Studio doesn't yet ship as a double-click installer
(no `.dmg` / `.exe` like the old NiCE Voice Agent app) — you run it from its source folder with
one command. That's still no terminal *day-to-day*: the one-time setup below takes a few minutes,
and after that you launch it the same way every time.

---

## What you need first

1. **The project folder** — a copy of the `Cognigy Demo Studio` folder (from wherever your team
   shares it: a zip, a shared drive, or a git repo).
2. **Node.js** — the runtime the Studio app and its local service run on.
   - Go to [nodejs.org](https://nodejs.org) and download the **LTS** version for your OS.
   - Run the installer with the defaults. This also installs `npm`, which you'll use once below.
3. **Google Chrome or Microsoft Edge** — for the browser extension. Both are Chromium, so either
   works the same way.

---

## Step 1 — Install dependencies

1. Open a terminal:
   - **macOS**: open the **Terminal** app (Cmd+Space, type "Terminal", Enter).
   - **Windows**: open **PowerShell** (Start menu, type "PowerShell", Enter).
2. Navigate into the project folder. Type `cd ` (with a trailing space), then drag the
   `Cognigy Demo Studio` folder from Finder/Explorer into the terminal window, and press Enter.
3. Run:

   ```bash
   npm install
   ```

   This downloads everything the app needs (a few minutes, one-time). You'll see a lot of text
   scroll by — that's normal. It's done when you get your prompt back with no red "error" lines.

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

> macOS will likely ask for **microphone access** the first time — click **Allow** (needed for
> the Voice Agent / voice demos later).

---

## Step 3 — Install the browser extension

The extension is what actually shows the animated launcher and demo panel on a customer's
website.

1. Open **`chrome://extensions`** (Chrome) or **`edge://extensions`** (Edge) — paste that into
   the address bar.
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked**.
4. Select the **`extension`** folder inside the `Cognigy Demo Studio` project folder (not a zip —
   the folder itself).
5. You should see **NiCE Cognigy Demo Studio** appear in your extensions list. Click the puzzle-piece
   icon in your browser toolbar and **pin** it so it's always visible.

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

You don't need the terminal again for normal use:

- **macOS**: many people add the project folder to the Dock, or create a simple double-clickable
  shortcut that runs `npm start` in that folder (ask a teammate familiar with the project to set
  this up once). Until that exists, reopen the terminal, `cd` into the folder, and run `npm start`
  — it's the same two steps each time.
- The extension, once loaded, stays installed — you don't reload it each session.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `npm: command not found` | Node.js isn't installed (or you need to restart the terminal after installing it). Reinstall from nodejs.org. |
| `npm start` does nothing / errors immediately | Make sure you ran `npm install` first, in the same folder. |
| Extension shows "Cognigy Demo Studio isn't running" | The Studio app (or at least its window) needs to be open — go back to Step 2. |
| Launcher doesn't appear on the customer site | Check the extension popup: is a demo mapped to this website? Set the demo's **Website** field, or pick it manually in the popup. |
| Microphone doesn't work in a voice demo | Grant microphone access when your OS/browser prompts; check the browser tab's site permissions if you dismissed the prompt earlier. |
| Port already in use / service won't start | Another copy of Cognigy Demo Studio may already be running (check for another open window) — only one instance is needed. |

---

## For your IT/engineering team: packaging a real installer

Today, `npm start` runs the Electron app straight from source — there's no `.dmg`/`.exe` build
step configured yet. If you want a one-click installer like the old Voice Agent app, the natural
next step is adding [`electron-builder`](https://www.electron.build/) to this project, which can
produce a signed `.dmg` (macOS) and `.exe`/installer (Windows) from the same `apps/studio/`
source. That's a separate, small project — flag it if it'd help your rollout.
