#!/usr/bin/env node
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createServer } from "./server.js";
import { loadConfig, PACKAGE_VERSION, SERVER_NAME } from "./config.js";

function parseArgs(argv: string[]): { http: boolean; port: number; host: string } {
  let http = false;
  let port = 3000;
  let host = "127.0.0.1";
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--http" || a === "--transport=http" || a === "--transport=streamable-http") {
      http = true;
    } else if (a?.startsWith("--transport=")) {
      const t = a.slice("--transport=".length);
      if (t === "http" || t === "streamable-http") http = true;
      else if (t !== "stdio") {
        console.error(`Unknown transport: ${t}. Use stdio or streamable-http.`);
        process.exit(2);
      }
    } else if (a === "--port" && argv[i + 1]) {
      port = Number(argv[++i]);
    } else if (a?.startsWith("--port=")) {
      port = Number(a.slice("--port=".length));
    } else if (a === "--host" && argv[i + 1]) {
      host = argv[++i] ?? host;
    } else if (a?.startsWith("--host=")) {
      host = a.slice("--host=".length);
    } else if (a === "--help" || a === "-h") {
      console.error(`Usage: ${SERVER_NAME} [--transport=stdio|streamable-http] [--port=3000] [--host=127.0.0.1]

Environment:
  VERILINE_API_KEY              Required to call tools (API.market subscriber key)
  VERILINE_API_BASE             Default https://prod.api.market/api/v1/veriline
  VERILINE_AUTH_HEADER          Default x-api-market-key
  VERILINE_EMAIL_AUDITOR_BASE   Optional per-product base URL override
  VERILINE_BUSINESS_ID_BASE     Optional per-product base URL override
  VERILINE_NPI_BASE             Optional per-product base URL override
  VERILINE_TIMEOUT_MS           Default 5000
`);
      process.exit(0);
    } else if (a === "--version" || a === "-v") {
      console.error(`${SERVER_NAME} ${PACKAGE_VERSION}`);
      process.exit(0);
    }
  }
  if (process.env.VERILINE_MCP_HTTP === "1") http = true;
  if (process.env.VERILINE_MCP_PORT) port = Number(process.env.VERILINE_MCP_PORT);
  if (!Number.isFinite(port) || port <= 0) {
    console.error("Invalid --port");
    process.exit(2);
  }
  return { http, port, host };
}

async function serveHttp(host: string, port: number, config: ReturnType<typeof loadConfig>): Promise<void> {
  // Lazy-import so the stdio entry stays slim unless HTTP is requested.
  const http = await import("node:http");
  const { createMcpHandler } = await import("@modelcontextprotocol/server");

  const handler = createMcpHandler(() => createServer(config), { responseMode: "json" });

  const listener = http.createServer((req, res) => {
    void (async () => {
      try {
        const url = new URL(req.url ?? "/", `http://${req.headers.host ?? `${host}:${port}`}`);
        const rawHeaders = new Headers();
        for (const [key, value] of Object.entries(req.headers)) {
          if (value === undefined) continue;
          if (Array.isArray(value)) {
            for (const v of value) rawHeaders.append(key, v);
          } else {
            rawHeaders.set(key, value);
          }
        }
        const method = (req.method ?? "GET").toUpperCase();
        let body: Buffer | undefined;
        if (method !== "GET" && method !== "HEAD") {
          const chunks: Buffer[] = [];
          for await (const chunk of req) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          }
          body = Buffer.concat(chunks);
        }
        const request = new Request(url, { method, headers: rawHeaders, body });
        const response = await handler.fetch(request);
        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          if (key.toLowerCase() === "transfer-encoding") return;
          responseHeaders[key] = value;
        });
        const buf = Buffer.from(await response.arrayBuffer());
        res.writeHead(response.status, responseHeaders);
        res.end(buf);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("HTTP request failed:", message);
        if (!res.headersSent) {
          res.writeHead(500).end("Internal Server Error");
        } else if (!res.writableEnded) {
          res.end();
        }
      }
    })();
  });

  await new Promise<void>((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(port, host, () => resolve());
  });
  console.error(`${SERVER_NAME} ${PACKAGE_VERSION} listening on http://${host}:${port} (streamable-http)`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(2);
    return;
  }

  if (!config.apiKey && !Object.values(config.productKeys).some(Boolean)) {
    console.error(
      "Warning: VERILINE_API_KEY is not set. tools/list will work, but tool calls will return a configuration error.",
    );
  }

  if (args.http) {
    await serveHttp(args.host, args.port, config);
    return;
  }

  serveStdio(() => createServer(config));
  console.error(`${SERVER_NAME} ${PACKAGE_VERSION} running on stdio`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
