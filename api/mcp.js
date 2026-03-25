/**
 * Materio MCP Server — Vercel Serverless HTTP Entry Point
 * 
 * This is the Vercel serverless function that handles MCP requests.
 * Each request is handled via manual JSON-RPC handlers.
 * 
 * Endpoint: POST /api/mcp
 * 
 * © 2024-2026, Materio by JTC.
 */

import { createServer } from "../server.js";

/**
 * Vercel serverless handler for MCP over HTTP.
 * 
 * Supports:
 *  - POST /api/mcp  → MCP JSON-RPC requests
 *  - GET  /api/mcp  → Health check / info
 *  - OPTIONS /api/mcp → CORS preflight
 */
export default async function handler(req, res) {
  //  MCP Safety Guard: Suppress all console output to prevent pollution.
  // This prevents libraries (like pdf-parse) from polluting responses with 
  // warnings/logs/info/debug, which would break the MCP JSON-RPC protocol.
  // Only apply this once per request, not for every tool call.
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalInfo = console.info;
  const originalDebug = console.debug;

  console.log = console.warn = console.info = console.debug = (...args) => {
    // Silently discard or redirect to console.error if debugging is needed
    // For now, just suppress to keep responses clean
  };

  try {
    // ─── CORS headers (allow any origin for MCP clients) ───────────────────
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    // ─── OPTIONS: CORS preflight ───────────────────────────────────────────
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }

    // ─── GET: Stealth Redirect & Favicon Scraper Support ───────────────────
    if (req.method === "GET") {
      // Google's s2 scraper requires an HTML page with <link> tags to confidently
      // index high-resolution icons (like sz=48 or sz=64) for the Claude App.
      // This returns explicit sizes for the bot, while instantly redirecting humans.
      const stealthHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Materio MCP</title>
  <link rel="icon" type="image/x-icon" href="/favicon.ico">
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon.png">
  <link rel="icon" type="image/png" sizes="48x48" href="/favicon.png">
  <link rel="icon" type="image/png" sizes="64x64" href="/favicon.png">
  <link rel="apple-touch-icon" sizes="180x180" href="/favicon.png">
  <meta http-equiv="refresh" content="0;url=https://materioa.vercel.app/docs/mcp">
  <script>window.location.replace("https://materioa.vercel.app/docs/mcp");</script>
</head>
<body>
  Redirecting to documentation...
</body>
</html>`;
      res.setHeader("Content-Type", "text/html");
      res.status(200).send(stealthHtml);
      return;
    }

    // ─── POST: Handle MCP requests ─────────────────────────────────────────
    if (req.method === "POST") {
      try {
        const server = createServer();
        const { method, params, id } = req.body;

        //  Universal Handler: Manual execution for initialize, tools/list, and tools/call
        const isRestfulChatGPT = req.url && req.url.includes('/api/mcp/') && req.url.split('/api/mcp/')[1];
        const effectiveMethod = isRestfulChatGPT ? "tools/call" : method;

        if (effectiveMethod === "initialize") {
          res.status(200).json({
            jsonrpc: "2.0",
            id,
            result: {
              protocolVersion: "2025-11-25",
              capabilities: {
                tools: {
                  listChanged: true
                }
              },
              serverInfo: {
                name: "materio-mcp-server",
                version: "1.0.0"
              }
            }
          });
          return;
        }

        if (effectiveMethod === "tools/list") {
          try {
            const result = await server.listToolsManual();
            res.status(200).json({
              jsonrpc: "2.0",
              result,
              id
            });
          } catch (e) {
            res.status(500).json({ error: e.message });
          } finally {
            try { await server.close(); } catch (e) { }
          }
          return;
        }

        if (effectiveMethod === "tools/call") {
          try {
            //  Argument Resolver:
            // ChatGPT sometimes sends arguments nested in 'params.arguments', 
            // but sometimes sends them directly in 'params' or 'req.body'.
            const toolName = params?.name || (req.url && req.url.split('/api/mcp/')[1]?.split('?')[0]);

            // If RESTful ChatGPT, args are the entire body (or params if nested)
            let rawArgs = req.body;
            if (params) rawArgs = params.arguments || params;

            const toolArgs = { ...rawArgs };

            // Clean up toolArgs so we don't pass system keys
            if (toolArgs.name) delete toolArgs.name;
            if (toolArgs.method) delete toolArgs.method;
            if (toolArgs.id) delete toolArgs.id;
            if (toolArgs.params) delete toolArgs.params;

            const result = await server.executeToolManual(toolName, toolArgs);
            res.status(200).json({
              jsonrpc: "2.0",
              result,
              id
            });
          } catch (toolError) {
            res.status(200).json({
              jsonrpc: "2.0",
              error: { code: -32603, message: toolError.message },
              id
            });
          } finally {
            // Explicit cleanup to prevent Windows-specific handle assertions
            try { await server.close(); } catch (e) { }
          }
          return;
        }

        // ─── Unsupported Methods ────────────────────────────────────────────
        // For any other MCP method not handled above, return error
        res.status(200).json({
          jsonrpc: "2.0",
          error: {
            code: -32601,
            message: `Method '${method}' is not supported by this MCP server`
          },
          id
        });
        return;
      } catch (error) {
        // Use original console.error for logging errors
        originalLog("MCP handler error:", error);
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: req.body?.id || null
        });
      }
      return;
    }

    // ─── Other methods: 405 ────────────────────────────────────────────────
    res.status(405).json({
      error: "Method not allowed. Use POST for MCP requests, GET for server info."
    });
  } finally {
    // Restore original console methods
    console.log = originalLog;
    console.warn = originalWarn;
    console.info = originalInfo;
    console.debug = originalDebug;
  }
}
