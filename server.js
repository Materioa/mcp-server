import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createClient } from "@supabase/supabase-js";
import fetch from "node-fetch";
import express from "express";
import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Manually load .env.local if it exists
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envLocalPath = path.resolve(__dirname, ".env.local");
if (fs.existsSync(envLocalPath)) {
  const envConfig = fs.readFileSync(envLocalPath, "utf-8");
  for (const line of envConfig.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const [key, ...value] = trimmed.split("=");
      if (!process.env[key]) process.env[key] = value.join("=").trim();
    }
  }
}

// --- Configuration ---
const GITHUB_REPO = "Materioa/cdn-materio";
const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_REPO}/git/trees/main?recursive=1`;
const PPLX_API_URL = "https://api.perplexity.ai/v1/contextualizedembeddings";
const FAVICON_BASE64 = "data:image/x-icon;base64,AAABAAEAEBAAAAEAIABoBAAAFgAAACgAAAAQAAAAIAAAAAEAIAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMzMzADMzMwAzMzMAMzMzADMzMwAzMzMAMzMzADMzMwAzMzMAMzMzADMzMwAzMzMAMzMzADMzMwAAMzMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A";

// --- Feature Flags ---
const ENABLE_RAG = process.env.ENABLE_RAG === "true";

// --- Supabase ---
const supabase = createClient(
  process.env.SUPABASE_URL || "https://supabase.placeholder.com",
  process.env.SUPABASE_SERVICE_KEY || "placeholder_key"
);

/**
 * Fetches document bytes using the GitHub LFS aware logic.
 */
async function fetchFileBytes(semester, subject, topic, type = "pdf") {
  const path = type === "pdf"
    ? `pdfs/${semester}/${subject}/${topic}.pdf`
    : `pdfs/${semester}/${subject}/docx/${topic}.docx`;

  const lfsUrl = `https://media.githubusercontent.com/media/${GITHUB_REPO}/main/${encodeURIComponent(path)}`;
  const rawUrl = `https://raw.githubusercontent.com/${GITHUB_REPO}/main/${encodeURIComponent(path)}`;

  try {
    let response = await fetch(lfsUrl, { timeout: 30000 });
    if (!response.ok || parseInt(response.headers.get("content-length") || "0") < 5000) {
      response = await fetch(rawUrl, { timeout: 30000 });
    }
    if (!response.ok) return null;
    return await response.arrayBuffer();
  } catch (e) {
    return null;
  }
}

async function maskUrl(url) {
  try {
    const api = `https://materioa.vercel.app/api/share?url=${encodeURIComponent(url)}`;
    const res = await fetch(api);
    if (!res.ok) return url;
    const data = await res.json();
    return data.masked || url;
  } catch {
    return url;
  }
}

// --- Server Factory ---
export function createServer() {
  const server = new Server(
    { name: "Materio MCP", version: "2.1.1" },
    { capabilities: { tools: {} } }
  );

  const getToolsList = async () => {
    const baseTools = [
      {
        name: "fetch_pdf",
        description: "Directly retrieves full document text. Use this for a deep-dive into a specific document or to manually answer questions.",
        inputSchema: {
          type: "object",
          properties: {
            semester: { type: "string" },
            subject: { type: "string" },
            topic: { type: "string" },
            filetype: { type: "string", enum: ["pdf", "docx"], default: "pdf" },
          },
          required: ["semester", "subject", "topic"],
        },
      },
      {
        name: "get_resource",
        description: "Search library tree for materials by keyword matching filenames.",
        inputSchema: {
          type: "object",
          properties: {
            keyword: { type: "string" },
            semester: { type: "string" },
            subject: { type: "string" },
          },
          required: ["keyword"],
        },
      },
      {
        name: "list_resources",
        description: "Overview of available semesters and subjects in the library.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "share_link",
        description: "Generate a professional masked share link for any raw content URL.",
        inputSchema: {
          type: "object",
          properties: { url: { type: "string" } },
          required: ["url"],
        },
      },
    ];

    if (ENABLE_RAG) {
      baseTools.unshift({
        name: "search",
        description: "Priority 1: Semantic search across the indexed document library. Returns relevant context chunks. Use this as your primary tool for answering questions.",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "The content or question to search for." },
            semester: { type: "string" },
            subject: { type: "string" },
            limit: { type: "number", default: 5 },
          },
          required: ["query"],
        },
      });
    }

    return { tools: baseTools };
  };

  server.setRequestHandler(ListToolsRequestSchema, getToolsList);

  const callToolHandler = async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case "search": {
          if (!ENABLE_RAG) {
            return { content: [{ type: "text", text: "The knowledge base search is currently undergoing maintenance. Please use get_resource and fetch_pdf for manual retrieval." }] };
          }

          const pplxRes = await fetch(PPLX_API_URL, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${process.env.PERPLEXITY_API_KEY}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              model: "pplx-embed-context-v1-0.6b",
              input: [args.query]
            })
          });
          
          if (!pplxRes.ok) throw new Error(`Perplexity API Error: ${pplxRes.status}`);
          const json = await pplxRes.json();
          const vector = json.data[0].embedding;

          const { data, error } = await supabase.rpc("match_materio_chunks", {
            query_embedding: vector,
            match_count: args.limit || 5,
            filter_semester: args.semester || null,
            filter_subject: args.subject || null,
            similarity_threshold: 0.3
          });

          if (error) throw error;
          if (!data || data.length === 0) {
            return { content: [{ type: "text", text: "Context currently unavailable. RAG indexing is in progress via Kaggle. Fallback to 'get_resource' to retrieve full content." }] };
          }

          const chunks = data.map(item => `[Similarity: ${Math.round(item.similarity * 100)}%] ${item.subject} / ${item.topic}: ${item.chunk_text}`).join("\n\n");
          return { content: [{ type: "text", text: chunks }] };
        }

        case "fetch_pdf": {
          const bytes = await fetchFileBytes(args.semester, args.subject, args.topic, args.filetype);
          if (!bytes) return { content: [{ type: "text", text: "Retrieval failed." }], isError: true };
          return { content: [{ type: "text", text: `Successfully retrieved ${args.topic} (${bytes.byteLength} bytes).` }] };
        }

        case "get_resource": {
          const res = await fetch(GITHUB_API_URL);
          const { tree } = await res.json();
          const kw = args.keyword.toLowerCase();
          const matches = tree.filter(it => it.path.startsWith("pdfs/") && it.path.toLowerCase().includes(kw)).map(it => {
              const parts = it.path.split("/");
              return {
                semester: parts[1], subject: parts[2], topic: parts[3]?.replace(".pdf", ""),
                url: `https://media.githubusercontent.com/media/${GITHUB_REPO}/main/${it.path}`
              };
            }).slice(0, 10);
          return { content: [{ type: "text", text: JSON.stringify(matches, null, 2) }] };
        }

        case "list_resources": {
          const res = await fetch(GITHUB_API_URL);
          const { tree } = await res.json();
          const structure = {};
          tree.filter(it => it.path.startsWith("pdfs/") && it.type === "tree").forEach(it => {
            const parts = it.path.split("/");
            if (parts.length === 2) structure[parts[1]] = structure[parts[1]] || [];
            if (parts.length === 3) structure[parts[1]].push(parts[2]);
          });
          return { content: [{ type: "text", text: JSON.stringify(structure, null, 2) }] };
        }

        case "share_link": {
          const masked = await maskUrl(args.url);
          return { content: [{ type: "text", text: masked }] };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
    }
  };

  server.setRequestHandler(CallToolRequestSchema, callToolHandler);

  // Manual methods for Vercel Serverless compatibility
  server.listToolsManual = async () => {
    return await getToolsList();
  };

  server.executeToolManual = async (name, args) => {
    return await callToolHandler({ params: { name, arguments: args } });
  };

  return server;
}

// --- Local Execution Only ---
const isMainModule = typeof process !== "undefined" && process.argv && process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMainModule) {
  // Minimal Identity Service for Icons
  const app = express();
  app.get("/favicon.ico", (req, res) => {
    const img = Buffer.from(FAVICON_BASE64.split(",")[1], 'base64');
    res.writeHead(200, { 'Content-Type': 'image/x-icon', 'Content-Length': img.length });
    res.end(img);
  });
  app.listen(3000, () => console.error("Identity/Favicon service active on port 3000"));

  // Connect via STDIO
  const server = createServer();
  const transport = new StdioServerTransport();
  server.connect(transport).then(() => {
    console.error("Materio MCP active via STDIO");
  });
}
