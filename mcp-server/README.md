# Cognigy Demo Studio MCP bridge

Lets Claude — in Claude Code or Claude Desktop, from any project — create or
update a **Demo Experience** and a **Remote Control voice gateway** in this
Demo Studio checkout, once you have a real Cognigy endpoint URL or token in
hand. See the [`demo-studio` skill](SKILL.md) for the workflow this is meant
to be used through.

## Install

Nothing to do by hand. `npm install` at the repo root registers this
automatically — see `assets/register-mcp.js`, run via `postinstall`. If you
ever need to re-run it (you moved the project folder, or installed Claude
Code/Desktop after the fact):

```bash
npm run mcp:register
```

`npm run doctor` reports whether it's currently registered, in Claude Code
and in Claude Desktop.

## What it actually does

A small stdio MCP server (`index.js`) that proxies Demo Studio's own local
API (`apps/studio/service/server.js`, on `http://127.0.0.1:41700` — no auth,
same trust boundary the dashboard and browser extension already use). It
adds almost no logic of its own: the server's own `sanitize()`
(`packages/shared/demo-schema.js`) is the single source of truth for what a
valid demo looks like, so this bridge passes values straight through rather
than re-validating them. See `lib/tools.js` for the ten tools and
`CLAUDE.md` at the repo root for the fuller architecture.

Demo Studio itself has to be running (the app, or `npm run service`) for any
of this to work — every tool checks first and says so plainly if it isn't.

## Manual registration reference

What the install step above does automatically, spelled out here for
diagnosing a registration that went wrong. Claude Code:

```bash
claude mcp add --scope user demo-studio -- node "<repo-path>/mcp-server/index.js"
```

Claude Desktop has no CLI for this — `register-mcp.js` merges a `demo-studio`
entry into `claude_desktop_config.json` directly (backing up the file first,
and leaving every other server already configured there untouched). Desktop
needs a restart to pick up a new entry.

## Scope, on purpose

Create/read/update only — there is no `delete_demo` or `delete_gateway` tool,
even though the underlying API supports both. That's deliberate: this bridge
should never be able to remove a real customer demo or voice gateway by
itself. Deleting is a dashboard action.

This also doesn't reach into Cognigy's own Management API — it only wires an
endpoint you already have into Demo Studio.
