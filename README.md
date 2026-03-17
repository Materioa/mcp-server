# Materio MCP Server

An MCP (Model Context Protocol) server that enables AI assistants like **Claude**, **ChatGPT**, and others to directly search and read Materio's educational PDF resources — no manual file uploads needed.

When a user asks `@materio` about a topic, the AI can use this server to:
- 📚 **Browse** all available semesters, subjects, and resources
- 🔍 **Search** for specific topics, chapters, question banks, and more
- 📄 **Read** full PDF content and answer questions using the material's own terminology
- 🔗 **Get URLs** to share or reference specific PDFs

## How It Works

```
User → AI Assistant → MCP Server → Materio CDN → PDFs
                          ↓
                   Resource Library
                   (resource.lib.json)
```

1. The server fetches Materio's resource library from `cdn-materioa.vercel.app`
2. It indexes all semesters, subjects, categories, and topics
3. When the AI needs a PDF, it fetches it from the CDN and extracts the text
4. The AI uses the extracted text to answer questions with proper terminology

## Available Tools

| Tool | Purpose |
|------|---------|
| `materio_list_resources` | Browse all available resources (filterable by semester) |
| `materio_search` | Search across all resources by keyword |
| `materio_get_pdf` | Fetch and read the full text content of a PDF |
| `materio_get_pdf_url` | Get the CDN download URL for a PDF |
| `materio_get_subject_overview` | Get a complete overview of a subject's resources |

---

## Deployment Options

### Option 1: Deploy to Vercel (Remote — for ChatGPT, remote Claude, etc.)

#### Quick Deploy

```bash
cd materio-mcp-server
npx vercel
```

Or link to your Vercel account and deploy:

```bash
npx vercel --prod
```

#### What Gets Deployed

- **Endpoint:** `https://your-project.vercel.app/mcp` (POST for MCP, GET for health check)
- **Transport:** Streamable HTTP (stateless JSON-RPC)
- **Function:** `api/mcp.js` — 60s timeout, 1GB memory

#### Using the Deployed Server

Once deployed, configure your AI client with the remote URL:

**Claude Desktop (remote MCP):**
```json
{
  "mcpServers": {
    "materio": {
      "url": "https://your-project.vercel.app/mcp"
    }
  }
}
```

**ChatGPT (Custom GPT / Actions):**
Use the endpoint URL `https://your-project.vercel.app/mcp` as the MCP server URL in your GPT configuration.

**Health Check:**
```bash
curl https://your-project.vercel.app/mcp
```

---

### Option 2: Run Locally (stdio — for Claude Desktop)

#### Install

```bash
cd materio-mcp-server
npm install
```

#### Configure Claude Desktop

Add to `%APPDATA%\Claude\claude_desktop_config.json` (Windows) or `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "materio": {
      "command": "node",
      "args": ["D:\\v4\\materio\\materio-mcp-server\\index.js"]
    }
  }
}
```

> ⚠️ Update the path to match your system.

Then restart Claude Desktop.

---

## Usage Examples

Once configured, you can ask your AI assistant things like:

- *"What subjects are available in semester 4?"*
- *"Find me notes on Deadlocks in Operating System"*
- *"Read the Laplace Transform chapter from Maths-2 and explain the key concepts for exams"*
- *"Get me the question bank for DBMS"*
- *"What topics are covered in Object Oriented Programming with Java?"*
- *"Read the Inheritance chapter and create a study guide covering all exam-relevant points"*

## Project Structure

```
materio-mcp-server/
├── server.js         # Shared core — all tools, utilities, server factory
├── index.js          # Local entry point (stdio transport)
├── api/
│   └── mcp.js        # Vercel entry point (HTTP transport)
├── vercel.json       # Vercel deployment config
├── package.json      # Dependencies and metadata
└── README.md         # This file
```

## Technical Details

- **Runtime:** Node.js ≥ 18
- **Transport:** stdio (local) / Streamable HTTP (Vercel)
- **CDN:** `https://cdn-materioa.vercel.app`
- **Resource Library:** Fetched from CDN and cached for 5 minutes
- **PDF Parsing:** Uses `pdf-parse` to extract text from PDFs
- **Character Limit:** PDF text output is capped at 80,000 characters
- **Vercel Function:** 60s timeout, 1GB memory (for large PDF parsing)

## License

MIT — © 2024-2026, Materio by JTC.
