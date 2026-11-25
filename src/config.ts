/**
 * Runtime configuration for the Veriline MCP server.
 *
 * Host and per-product bases are configurable. Defaults were confirmed
 * on 26 Nov 2026 (Australia/Brisbane) against the live API.market Veriline
 * product pages and playground docs:
 *   https://prod.api.market/api/v1/veriline/{product-slug}/{endpoint-path}
 *
 * The buyer auth header default (`x-api-market-key`) is confirmed in official
 * API.market documentation and on the live Veriline listings. The gateway
 * also accepts the legacy alias `x-magicapi-key`.
 */

export const PACKAGE_VERSION = "1.0.0";
export const SERVER_NAME = "veriline-mcp";

/** Confirmed API.market org/base (live Veriline listings, 26 Nov 2026). */
export const DEFAULT_API_BASE = "https://prod.api.market/api/v1/veriline";

/** Confirmed in official API.market docs and live Veriline listings. */
export const DEFAULT_AUTH_HEADER = "x-api-market-key";

export const DEFAULT_TIMEOUT_MS = 5000;

export const PRODUCT_SLUGS = {
  emailAuditor: "email-deliverability-auditor",
  businessId: "business-tax-id-validator",
  npi: "npi-registry-lookup",
} as const;

export type ProductId = keyof typeof PRODUCT_SLUGS;

export interface VerilineConfig {
  /** Subscriber / buyer key sent in the auth header. */
  apiKey: string | undefined;
  /** Org-level base, e.g. https://prod.api.market/api/v1/veriline */
  apiBase: string;
  /** Buyer (or origin) auth header name. */
  authHeader: string;
  timeoutMs: number;
  /** Full product base URLs, no trailing slash. */
  productBases: Record<ProductId, string>;
  /** Optional per-product keys; fall back to apiKey. */
  productKeys: Record<ProductId, string | undefined>;
}

export interface EnvLike {
  [key: string]: string | undefined;
}

function trimSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function optionalTrim(value: string | undefined): string | undefined {
  const t = value?.trim();
  return t ? t : undefined;
}

function parseTimeout(raw: string | undefined): number {
  if (!raw || raw.trim() === "") return DEFAULT_TIMEOUT_MS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n > 120_000) {
    throw new Error(
      `VERILINE_TIMEOUT_MS must be a positive number of milliseconds (got ${JSON.stringify(raw)})`,
    );
  }
  return Math.floor(n);
}

function assertHttpUrl(name: string, value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute http(s) URL (got ${JSON.stringify(value)})`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`${name} must be an http(s) URL (got ${url.protocol})`);
  }
  return trimSlash(value);
}

/**
 * Load configuration from an env-like object (defaults to process.env).
 * Does not throw if the API key is missing — tools/list should still work;
 * tool calls return a clear error instead.
 */
export function loadConfig(env: EnvLike = process.env): VerilineConfig {
  const apiBase = assertHttpUrl(
    "VERILINE_API_BASE",
    optionalTrim(env.VERILINE_API_BASE) ?? DEFAULT_API_BASE,
  );
  const authHeader = optionalTrim(env.VERILINE_AUTH_HEADER) ?? DEFAULT_AUTH_HEADER;
  if (!/^[A-Za-z0-9-]+$/.test(authHeader)) {
    throw new Error("VERILINE_AUTH_HEADER must be a simple HTTP header name (letters, digits, hyphen)");
  }

  const productBases: Record<ProductId, string> = {
    emailAuditor: assertHttpUrl(
      "VERILINE_EMAIL_AUDITOR_BASE",
      optionalTrim(env.VERILINE_EMAIL_AUDITOR_BASE) ?? `${apiBase}/${PRODUCT_SLUGS.emailAuditor}`,
    ),
    businessId: assertHttpUrl(
      "VERILINE_BUSINESS_ID_BASE",
      optionalTrim(env.VERILINE_BUSINESS_ID_BASE) ?? `${apiBase}/${PRODUCT_SLUGS.businessId}`,
    ),
    npi: assertHttpUrl(
      "VERILINE_NPI_BASE",
      optionalTrim(env.VERILINE_NPI_BASE) ?? `${apiBase}/${PRODUCT_SLUGS.npi}`,
    ),
  };

  return {
    apiKey: optionalTrim(env.VERILINE_API_KEY),
    apiBase,
    authHeader,
    timeoutMs: parseTimeout(env.VERILINE_TIMEOUT_MS),
    productBases,
    productKeys: {
      emailAuditor: optionalTrim(env.VERILINE_EMAIL_AUDITOR_KEY),
      businessId: optionalTrim(env.VERILINE_BUSINESS_ID_KEY),
      npi: optionalTrim(env.VERILINE_NPI_KEY),
    },
  };
}

export function keyFor(config: VerilineConfig, product: ProductId): string | undefined {
  return config.productKeys[product] ?? config.apiKey;
}
