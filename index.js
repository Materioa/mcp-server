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
  // 🛡️ MCP Safety Guard: Redirect console.log to console.error.
  // This prevents libraries (like pdf-parse) from polluting stdout with 
  // warnings/logs, which would break the MCP JSON-RPC protocol.
  const originalLog = console.log;
  console.log = (...args) => {
    console.error(...args);
  };

  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Materio MCP Server running via stdio");
}

main().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});
