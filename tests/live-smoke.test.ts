/**
 * Live smoke: hits the Cloudflare workers.dev origins directly to prove the
 * tool → HTTP mapping works end-to-end. Disabled unless LIVE_SMOKE=1.
 *
 * Secrets are read from the environment (or from a dotenv file at LIVE_SMOKE_ENV).
 * Values are never printed.
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadConfig, type EnvLike } from "../src/config.js";
import { TOOLS } from "../src/tools.js";

const ENABLED = process.env.LIVE_SMOKE === "1";

function loadDotenv(path: string): EnvLike {
  const env: EnvLike = {};
  const text = readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1);
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function liveEnv(): EnvLike {
  const fileEnv = process.env.LIVE_SMOKE_ENV && existsSync(process.env.LIVE_SMOKE_ENV)
    ? loadDotenv(process.env.LIVE_SMOKE_ENV)
    : {};
  const merged: EnvLike = { ...fileEnv, ...process.env };
  return {
    VERILINE_AUTH_HEADER: merged.VERILINE_AUTH_HEADER ?? "X-Gateway-Secret",
    VERILINE_TIMEOUT_MS: merged.VERILINE_TIMEOUT_MS ?? "10000",
    VERILINE_EMAIL_AUDITOR_BASE:
      merged.VERILINE_EMAIL_AUDITOR_BASE ?? "https://email-auditor.verilineapi.workers.dev",
    VERILINE_BUSINESS_ID_BASE:
      merged.VERILINE_BUSINESS_ID_BASE ?? "https://business-id.verilineapi.workers.dev",
    VERILINE_NPI_BASE: merged.VERILINE_NPI_BASE ?? "https://npi.verilineapi.workers.dev",
    VERILINE_EMAIL_AUDITOR_KEY:
      merged.VERILINE_EMAIL_AUDITOR_KEY ?? merged.GATEWAY_SECRET_EMAIL ?? merged.VERILINE_API_KEY,
    VERILINE_BUSINESS_ID_KEY:
      merged.VERILINE_BUSINESS_ID_KEY ?? merged.GATEWAY_SECRET_BIZ ?? merged.VERILINE_API_KEY,
    VERILINE_NPI_KEY: merged.VERILINE_NPI_KEY ?? merged.GATEWAY_SECRET_NPI ?? merged.VERILINE_API_KEY,
  };
}

function assertNoSecretLeak(text: string, secrets: Array<string | undefined>): void {
  for (const secret of secrets) {
    if (secret && secret.length > 0) {
      expect(text).not.toContain(secret);
    }
  }
}

const maybe = ENABLED ? describe : describe.skip;

maybe("live smoke against workers.dev origins", () => {
  const env = liveEnv();
  const secrets = [env.VERILINE_EMAIL_AUDITOR_KEY, env.VERILINE_BUSINESS_ID_KEY, env.VERILINE_NPI_KEY];
  const config = loadConfig(env);
  const ctx = { config, fetchImpl: fetch };

  it("has a gateway secret configured for each product (names only logged)", () => {
    expect(config.authHeader).toBe("X-Gateway-Secret");
    expect(Boolean(env.VERILINE_EMAIL_AUDITOR_KEY)).toBe(true);
    expect(Boolean(env.VERILINE_BUSINESS_ID_KEY)).toBe(true);
    expect(Boolean(env.VERILINE_NPI_KEY)).toBe(true);
  });

  const cases: Array<{ name: string; args: Record<string, unknown>; expectPath: string }> = [
    { name: "audit_email_deliverability", args: { domain: "github.com" }, expectPath: "data" },
    { name: "validate_vat", args: { vat: "IE6388047V", live: false }, expectPath: "data" },
    { name: "lookup_lei", args: { lei: "HWUPKR0MPOU8FGXBT394" }, expectPath: "data" },
    { name: "validate_iban", args: { iban: "DE89 3704 0044 0532 0130 00" }, expectPath: "data" },
    { name: "get_npi", args: { number: "1003000126" }, expectPath: "data" },
    { name: "search_npi", args: { last_name: "Smith", state: "CA", limit: 1 }, expectPath: "data" },
  ];

  it.each(cases)("$name succeeds through the tool handler", async ({ name, args, expectPath }) => {
    const tool = TOOLS.find((t) => t.name === name);
    expect(tool, `missing tool ${name}`).toBeDefined();
    const result = await tool!.handler(args, ctx);
    assertNoSecretLeak(result.content[0]?.text ?? "", secrets);
    if (result.isError) {
      throw new Error(`${name} returned isError (body redacted from this assertion)`);
    }
    const parsed = JSON.parse(result.content[0]!.text) as { success?: boolean; data?: unknown };
    expect(parsed.success).toBe(true);
    expect(parsed).toHaveProperty(expectPath);
  });
});
