#!/usr/bin/env node
/*
 * Cognigy Demo Studio MCP bridge — entry point.
 *
 * Talks over stdio, exactly like every other locally-registered MCP server.
 * All the actual logic lives in lib/tools.js; this file is wiring only:
 * describe each tool's arguments to the SDK, hand off to the matching
 * handler.
 *
 * This is not published to npm — it is registered by absolute path
 * (assets/register-mcp.js does this automatically on `npm install`, or
 * `npm run mcp:register` by hand), so it only ever runs from inside a
 * Demo Studio checkout, against that same checkout's local service.
 */
"use strict";

const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { z } = require("zod");
const tools = require("./lib/tools.js");
const pkg = require("./package.json");

const server = new McpServer({ name: "cognigy-demo-studio", version: pkg.version });

// Shared fragments so the ten tool schemas below don't repeat themselves.
const endpointFields = {
  chatEndpoint: z.string().optional().describe(
    "Cognigy Webchat v3 endpoint — a full URL or bare token, pasted exactly as given. Never reformat or normalize it; Demo Studio does that itself when the demo is actually opened."),
  voiceEndpoint: z.string().optional().describe(
    "Cognigy click-to-call voice endpoint — a full URL or bare token, pasted exactly as given, same rule as chatEndpoint.")
};
const demoEditableFields = {
  template: z.enum(["webchat", "webrtc", "webchat-webrtc"]).optional().describe(
    "Which endpoint(s) this demo serves. Omit on create to infer from which of chatEndpoint/voiceEndpoint are given."),
  website: z.string().optional().describe("The customer's website — lets the browser extension auto-match this demo to that domain."),
  folder: z.string().optional().describe("Folder to file this demo under in the dashboard. Any string; it appears automatically, no separate creation step."),
  agentName: z.string().optional(),
  welcomeMessage: z.string().optional(),
  themePreset: z.string().optional().describe("A theme id from list_themes for this template. Omit to use the template's own default."),
  panelStyle: z.enum(["overlay", "solid"]).optional()
};

server.registerTool(
  "check_status",
  {
    title: "Check Demo Studio status",
    description: "Call this first. Confirms Cognigy Demo Studio's local service is running before anything else touches it.",
    inputSchema: {}
  },
  tools.checkStatus
);

server.registerTool(
  "list_demos",
  {
    title: "List Demo Experiences",
    description: "List existing demos, optionally filtered — use before create_demo to check whether one for this customer already exists.",
    inputSchema: {
      nameContains: z.string().optional().describe("Case-insensitive substring match on the demo name."),
      folder: z.string().optional().describe("Exact folder match.")
    }
  },
  tools.listDemos
);

server.registerTool(
  "get_demo",
  {
    title: "Get one demo",
    description: "Full config for one Demo Experience, plus its last build result.",
    inputSchema: { id: z.string().describe("The demo's id/slug, from list_demos or a prior create_demo.") }
  },
  tools.getDemo
);

server.registerTool(
  "create_demo",
  {
    title: "Create a Demo Experience",
    description:
      "Creates a new Demo Experience. Only name is required — endpoints can be added later with update_demo if " +
      "not known yet. IMPORTANT: creating a demo with a name that already exists does NOT fail and does NOT " +
      "update the existing one — it silently creates a second, separate demo. Always call list_demos first and " +
      "prefer update_demo on a match.",
    inputSchema: Object.assign(
      { name: z.string().describe("The customer/agent name this demo is for.") },
      endpointFields,
      demoEditableFields
    )
  },
  tools.createDemo
);

server.registerTool(
  "update_demo",
  {
    title: "Update a Demo Experience",
    description:
      "Patches an existing demo — most commonly to fill in an endpoint that wasn't known at creation time, or " +
      "to fix one that changed. Only send the fields you want to change; everything else is left as-is.",
    inputSchema: Object.assign(
      { id: z.string().describe("The demo's id/slug.") },
      endpointFields,
      demoEditableFields
    )
  },
  tools.updateDemo
);

server.registerTool(
  "rebuild_demo",
  {
    title: "Rebuild a demo and confirm it",
    description:
      "Forces a rebuild and waits for it, unlike create_demo/update_demo whose build happens in the background. " +
      "This is the reliable way to know whether a demo actually built successfully.",
    inputSchema: { id: z.string() }
  },
  tools.rebuildDemo
);

server.registerTool(
  "preflight_demo",
  {
    title: "Run preflight on a demo",
    description:
      "The full \"ready to show a customer\" checklist — endpoint reachability, build/bundle presence, whether " +
      "a website is mapped. Run this last and relay its verdict to the SE in plain language.",
    inputSchema: { id: z.string() }
  },
  tools.preflightDemo
);

server.registerTool(
  "list_themes",
  {
    title: "List available themes",
    description: "Real theme ids to suggest for themePreset, instead of guessing one.",
    inputSchema: { template: z.enum(["webchat", "webrtc", "webchat-webrtc"]).optional() }
  },
  tools.listThemes
);

server.registerTool(
  "create_or_update_gateway",
  {
    title: "Create or update a Remote Control voice gateway",
    description:
      "Adds a Remote Control voice gateway for a click-to-call endpoint, so the SE can place a test call. Pass " +
      "gatewayId (from list_gateways) to edit an existing one in place instead of adding a new one.",
    inputSchema: {
      name: z.string().describe("Gateway name, shown in the Remote Control list — usually the same name as the matching demo."),
      voiceEndpoint: z.string().describe("Cognigy click-to-call endpoint — full URL or bare token, pasted exactly as given."),
      folder: z.string().optional(),
      gatewayId: z.string().optional().describe("Present -> edit that gateway in place. Omit to create a new one.")
    }
  },
  tools.createOrUpdateGateway
);

server.registerTool(
  "list_gateways",
  {
    title: "List Remote Control voice gateways",
    description: "List existing voice gateways — use before create_or_update_gateway to check for a duplicate.",
    inputSchema: {}
  },
  tools.listGateways
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("[demo-studio-mcp] failed to start:", err);
  process.exit(1);
});
