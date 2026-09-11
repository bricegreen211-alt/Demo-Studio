---
name: demo-studio
description: Create or update a Cognigy Demo Studio Demo Experience and/or Remote Control voice gateway from a real Webchat v3 or click-to-call endpoint URL the SE has in hand. Use when the user has just built or configured a Cognigy AI Agent and pastes an endpoint URL or token and wants a demo or voice gateway set up, wired, or updated.
---

# Demo Studio bridge

Turns a Cognigy endpoint the SE already has into a working Demo Experience
and, if there's a voice endpoint, a matching Remote Control gateway — using
the `demo-studio` MCP tools. Nothing here talks to Cognigy directly; it only
wires an endpoint you already have into Demo Studio, running locally on the
SE's own machine.

## When to use this

Triggered by a real endpoint URL or token being in the conversation, plus
wanting it turned into something demoable — "set up a demo for this", "wire
this into Demo Studio", "add a Remote Control gateway for this agent", "I
just built this, get it demo-ready".

**Not** for: general Cognigy agent-building questions, anything that would
call Cognigy's own Management/REST API, or a request to delete or duplicate a
demo/gateway — this bridge is create/read/update only by design. For those,
say so and point at the dashboard (`http://localhost:41700`).

## Hard rule: never fabricate an endpoint

`chatEndpoint` and `voiceEndpoint` must come verbatim from the conversation —
copied text, not reconstructed or guessed. If the SE names an agent but
hasn't pasted a URL or token yet, ask for it before doing anything. Pass
whatever they give exactly as given, whether it's a full URL or a bare
token — never reformat it. Demo Studio normalizes endpoints itself, at the
moment a demo is actually opened or a call is placed, never at save time; a
tool doing its own normalization would just be duplicating (and risking
disagreeing with) work Demo Studio already does correctly.

## Workflow

1. **`check_status`** first, always. If it comes back not running, relay its
   message and stop — don't attempt anything else.
2. **`list_demos`**, filtered by the agent or company name if one was given.
   If a match exists, prefer **`update_demo`** on it over creating a new one.
   Creating a demo under a name that already exists does **not** fail and
   does **not** update the existing one — it silently creates a second,
   separate demo with a suffixed id. Worth saying to the SE if you're about
   to create rather than update, so it's a visible choice, not a surprise.
3. No match → **`create_demo`**. Let it infer the endpoint/template (webchat,
   webrtc, or both) from whichever of `chatEndpoint`/`voiceEndpoint` were
   given, unless the SE states one explicitly.
4. A voice endpoint was given → **`list_gateways`**, then
   **`create_or_update_gateway`** — same name as the demo unless told
   otherwise, and pass the existing `gatewayId` back if one already matches
   rather than creating a duplicate.
5. **`rebuild_demo`** on the demo's id — this is the deterministic build
   result; `create_demo`/`update_demo` only kick a build off in the
   background and don't confirm it.
6. **`preflight_demo`** — the full readiness checklist.
7. Report back in plain language: what got created vs. updated, the
   template (and whether it was inferred), the build result, and the
   preflight summary. Never dump raw JSON at the SE.

## Confirmation, roughly

> Created Demo Experience "Acme Corp" (webchat + voice, folder: Acme) with
> your endpoints wired in. Build succeeded. Also added a Remote Control
> gateway "Acme Corp" for the voice endpoint. Preflight: 4 of 5 checks
> passed — no customer website is set yet, so the launcher won't
> auto-appear anywhere; the chat endpoint, voice endpoint, build and widget
> bundle are all reachable and ready.

State what actually happened and what the preflight actually found — don't
report success unless it is one.
