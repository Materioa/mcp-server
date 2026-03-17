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
import { createServer } from "./server.js";

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
