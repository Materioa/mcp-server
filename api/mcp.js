/**
 * Materio MCP Server — Vercel Serverless HTTP Entry Point
 * 
 * This is the Vercel serverless function that handles MCP requests
 * over Streamable HTTP. Each request creates a fresh stateless transport.
 * 
 * Endpoint: POST /api/mcp
 * 
 * © 2024-2026, Materio by JTC.
 */

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
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
  // ─── CORS headers (allow any origin for MCP clients) ───────────────────
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  // ─── OPTIONS: CORS preflight ───────────────────────────────────────────
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  // ─── GET: Health check / server info ───────────────────────────────────
  if (req.method === "GET") {
    res.status(200).json({
      name: "materio-mcp-server",
      version: "1.0.0",
      description: "Materio MCP Server — search and read educational PDFs via MCP protocol",
      status: "ok",
      transport: "streamable-http",
      endpoint: "/api/mcp",
      logo: "/logo.png",
      icon: "/logo.svg",
      usage: "Send MCP JSON-RPC requests via POST to this endpoint."
    });
    return;
  }

  // ─── POST: Handle MCP requests ─────────────────────────────────────────
  if (req.method === "POST") {
    // 🛡️ Super-Patch: Use a Proxy to guarantee the headers are present.
    // This ensures even if the SDK reads headers in a weird way, it gets the right values.
    const patchedReq = new Proxy(req, {
      get(target, prop) {
        if (prop === 'headers') {
          return {
            ...target.headers,
            'accept': 'application/json, text/event-stream',
            'content-type': target.headers['content-type'] || 'application/json'
          };
        }
        return Reflect.get(target, prop);
      }
    });

    try {
      const server = createServer();

      // Stateless transport — no session tracking, returns JSON responses
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,  // Stateless: no session IDs
        enableJsonResponse: true         // Return JSON instead of SSE streams
      });

      // Clean up transport when response closes
      res.on("close", () => {
        transport.close();
        server.close();
      });

      await server.connect(transport);
      await transport.handleRequest(patchedReq, res, req.body);
    } catch (error) {
      console.error("MCP handler error:", error);

      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Internal server error"
          },
          id: null
        });
      }
    }
    return;
  }

  // ─── Other methods: 405 ────────────────────────────────────────────────
  res.status(405).json({
    error: "Method not allowed. Use POST for MCP requests, GET for server info."
  });
}
