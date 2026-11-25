import type { ProductId, VerilineConfig } from "./config.js";
import { PACKAGE_VERSION, keyFor } from "./config.js";

export type FetchLike = typeof fetch;

export class VerilineApiError extends Error {
  readonly status?: number;
  readonly code?: string;
  readonly requestId?: string;
  readonly body?: unknown;

  constructor(
    message: string,
    opts: { status?: number; code?: string; requestId?: string; body?: unknown } = {},
  ) {
    super(message);
    this.name = "VerilineApiError";
    this.status = opts.status;
    this.code = opts.code;
    this.requestId = opts.requestId;
    this.body = opts.body;
  }
}

export class VerilineTimeoutError extends VerilineApiError {
  constructor(timeoutMs: number) {
    super(`The Veriline API did not respond within ${timeoutMs}ms.`, {
      status: 504,
      code: "timeout",
    });
    this.name = "VerilineTimeoutError";
  }
}

export class VerilineConfigError extends VerilineApiError {
  constructor(message: string) {
    super(message, { code: "config" });
    this.name = "VerilineConfigError";
  }
}

export interface RequestOptions {
  product: ProductId;
  path: string;
  query?: Record<string, string | number | boolean | undefined | null>;
  signal?: AbortSignal;
}

export interface VerilineEnvelope {
  success: boolean;
  data: unknown;
  error: { code?: string; message?: string } | string | null;
  meta?: { request_id?: string; took_ms?: number; service?: string; version?: string };
}

const USER_AGENT = `veriline-mcp/${PACKAGE_VERSION} (https://github.com/verilineapi/veriline-mcp; verilineapi@proton.me)`;

function redact(value: string, secret: string | undefined): string {
  if (!secret || secret.length === 0) return value;
  return value.split(secret).join("[redacted]");
}

function buildQuery(query: RequestOptions["query"]): string {
  const params = new URLSearchParams();
  if (!query) return "";
  for (const [key, raw] of Object.entries(query)) {
    if (raw === undefined || raw === null || raw === "") continue;
    params.set(key, String(raw));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function extractMessage(body: unknown, status: number): { message: string; code?: string; requestId?: string } {
  const rec = asRecord(body);
  const meta = asRecord(rec?.meta);
  const requestId = typeof meta?.request_id === "string" ? meta.request_id : undefined;

  const err = rec?.error;
  if (typeof err === "string" && err.trim()) {
    return { message: err, requestId };
  }
  const errObj = asRecord(err);
  if (errObj) {
    const message =
      (typeof errObj.message === "string" && errObj.message) ||
      (typeof errObj.error === "string" && errObj.error) ||
      undefined;
    const code = typeof errObj.code === "string" ? errObj.code : undefined;
    if (message) return { message, code, requestId };
  }
  if (typeof rec?.message === "string" && rec.message.trim()) {
    return { message: rec.message, requestId };
  }
  if (typeof rec?.error === "string" && rec.error.trim()) {
    return { message: rec.error, requestId };
  }
  return { message: `HTTP ${status}`, requestId };
}

function statusHint(status: number): string | undefined {
  switch (status) {
    case 401:
    case 403:
      return "Authentication failed. Check VERILINE_API_KEY and that you are subscribed to this API.";
    case 404:
      return "The resource was not found. If every call 404s, confirm VERILINE_API_BASE matches the live API.market host.";
    case 429:
      return "Rate limited or plan quota exceeded on API.market.";
    case 502:
      return "Upstream data source failed. Retry later.";
    case 503:
      return "Service unavailable. The origin may be missing a required secret, or an upstream is down.";
    case 504:
      return "Upstream timed out.";
    default:
      return undefined;
  }
}

export async function verilineGet(
  config: VerilineConfig,
  opts: RequestOptions,
  fetchImpl: FetchLike = fetch,
): Promise<unknown> {
  const apiKey = keyFor(config, opts.product);
  if (!apiKey) {
    throw new VerilineConfigError(
      "Missing VERILINE_API_KEY. Subscribe at https://api.market and set the env var to your API.market key.",
    );
  }

  const url = joinUrl(config.productBases[opts.product], opts.path) + buildQuery(opts.query);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  const onOuterAbort = () => controller.abort();
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort();
    else opts.signal.addEventListener("abort", onOuterAbort, { once: true });
  }

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        [config.authHeader]: apiKey,
        "User-Agent": USER_AGENT,
      },
      signal: controller.signal,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const name = err instanceof Error ? err.name : "";
    if (name === "AbortError" || /aborted|abort/i.test(message)) {
      throw new VerilineTimeoutError(config.timeoutMs);
    }
    throw new VerilineApiError(`Network error calling the Veriline API: ${redact(message, apiKey)}`, {
      code: "network",
    });
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onOuterAbort);
  }

  const text = await response.text();
  let body: unknown = text;
  if (text) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = { raw: text.slice(0, 2000) };
    }
  } else {
    body = null;
  }

  const safeBody = JSON.parse(redact(JSON.stringify(body), apiKey)) as unknown;
  const extracted = extractMessage(safeBody, response.status);

  if (!response.ok) {
    const hint = statusHint(response.status);
    const parts = [
      `Veriline API error (${response.status})`,
      extracted.message,
      extracted.requestId ? `request_id=${extracted.requestId}` : undefined,
      hint,
    ].filter(Boolean);
    throw new VerilineApiError(parts.join(" — "), {
      status: response.status,
      code: extracted.code,
      requestId: extracted.requestId,
      body: safeBody,
    });
  }

  return safeBody;
}

/** Map a thrown error into an MCP tool result (never includes secrets). */
export function errorToToolResult(err: unknown): { content: Array<{ type: "text"; text: string }>; isError: true; [key: string]: unknown } {
  let text: string;
  if (err instanceof VerilineApiError) {
    const payload = {
      error: err.code ?? err.name,
      message: err.message,
      status: err.status ?? null,
      request_id: err.requestId ?? null,
      body: err.body ?? null,
    };
    text = JSON.stringify(payload, null, 2);
  } else if (err instanceof Error) {
    text = JSON.stringify({ error: err.name, message: err.message }, null, 2);
  } else {
    text = JSON.stringify({ error: "unknown", message: String(err) }, null, 2);
  }
  return { content: [{ type: "text", text }], isError: true };
}

export function successToToolResult(body: unknown): { content: Array<{ type: "text"; text: string }>; [key: string]: unknown } {
  return {
    content: [{ type: "text", text: JSON.stringify(body, null, 2) }],
  };
}
