#!/usr/bin/env node

/**
 * Materio MCP Server — Local stdio entry point
 * 
 * Run this directly with `node index.js` for local AI client integration
 * (e.g. Claude Desktop). For Vercel deployment, see api/mcp.js instead.
 * 
 * © 2024-2026, Materio by JTC.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createServer } from "./server.js";

// Load .env.local / .env so RAG keys are available in local (stdio) mode
const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnvFile(filePath) {
  try {
    const content = readFileSync(filePath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  } catch { }
}

loadEnvFile(resolve(__dirname, ".env.local"));
loadEnvFile(resolve(__dirname, ".env"));

async function main() {
  // 🛡️ MCP Safety Guard: Suppress all console output except stderr.
  // This prevents libraries (like pdf-parse) from polluting stdout with 
  // warnings/logs/info/debug, which would break the MCP JSON-RPC protocol.
  // Redirect all console methods to console.error (which writes to stderr).
  const noop = () => {};
  const redirectToStderr = (...args) => console.error(...args);
  
  console.log = redirectToStderr;
  console.warn = redirectToStderr;
  console.info = redirectToStderr;
  console.debug = redirectToStderr;
  // Keep console.error unchanged (it uses stderr)

  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Materio MCP Server running via stdio");
}

main().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});
