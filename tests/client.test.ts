import { describe, expect, it, vi } from "vitest";
import {
  VerilineApiError,
  VerilineConfigError,
  VerilineTimeoutError,
  errorToToolResult,
  verilineGet,
} from "../src/client.js";
import { loadConfig } from "../src/config.js";

const SECRET = "super-secret-key-DO-NOT-LEAK";

function config(overrides: Record<string, string> = {}) {
  return loadConfig({
    VERILINE_API_KEY: SECRET,
    VERILINE_API_BASE: "https://gateway.example.test/v1/veriline",
    ...overrides,
  });
}

describe("verilineGet", () => {
  it("sends GET with the configured auth header and builds the path + query", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      expect(String(input)).toBe(
        "https://gateway.example.test/v1/veriline/email-deliverability-auditor/v1/audit?domain=example.com&selectors=foo",
      );
      expect(init?.method).toBe("GET");
      const headers = new Headers(init?.headers);
      expect(headers.get("x-api-market-key")).toBe(SECRET);
      expect(headers.get("accept")).toBe("application/json");
      return new Response(JSON.stringify({ success: true, data: { ok: true }, error: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const body = await verilineGet(
      config(),
      { product: "emailAuditor", path: "/v1/audit", query: { domain: "example.com", selectors: "foo", skip: undefined } },
      fetchImpl,
    );
    expect(body).toMatchObject({ success: true, data: { ok: true } });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("uses per-product base, key, and a custom auth header", async () => {
    const cfg = config({
      VERILINE_NPI_BASE: "https://npi.example.test",
      VERILINE_NPI_KEY: "npi-secret",
      VERILINE_AUTH_HEADER: "X-Gateway-Secret",
    });
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      expect(String(input)).toBe("https://npi.example.test/v1/npi/1003000126");
      expect(new Headers(init?.headers).get("X-Gateway-Secret")).toBe("npi-secret");
      return new Response(JSON.stringify({ success: true, data: { npi: "1003000126" }, error: null }), {
        status: 200,
      });
    });
    await verilineGet(cfg, { product: "npi", path: "/v1/npi/1003000126" }, fetchImpl);
  });

  it("throws a config error when no key is set", async () => {
    const cfg = loadConfig({ VERILINE_API_BASE: "https://gateway.example.test" });
    await expect(verilineGet(cfg, { product: "npi", path: "/v1/npi/1" }, vi.fn())).rejects.toBeInstanceOf(
      VerilineConfigError,
    );
  });

  it("maps worker-style 400 errors and includes request_id", async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            success: false,
            data: null,
            error: { code: "bad_request", message: "domain is required" },
            meta: { request_id: "req-123", took_ms: 1, service: "email-auditor" },
          }),
          { status: 400 },
        ),
    );
    await expect(
      verilineGet(config(), { product: "emailAuditor", path: "/v1/audit" }, fetchImpl),
    ).rejects.toMatchObject({
      name: "VerilineApiError",
      status: 400,
      code: "bad_request",
      requestId: "req-123",
    });
  });

  it("maps 403/401 with a helpful hint and never echoes the secret", async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            success: false,
            error: { code: "forbidden", message: `Rejected key ${SECRET}` },
          }),
          { status: 403 },
        ),
    );
    try {
      await verilineGet(config(), { product: "businessId", path: "/v1/validate/iban" }, fetchImpl);
      expect.unreachable("should throw");
    } catch (err) {
      expect(err).toBeInstanceOf(VerilineApiError);
      const e = err as VerilineApiError;
      expect(e.status).toBe(403);
      expect(e.message).toMatch(/Authentication failed/);
      expect(e.message).not.toContain(SECRET);
      expect(JSON.stringify(e.body)).not.toContain(SECRET);
      const result = errorToToolResult(e);
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).not.toContain(SECRET);
      expect(result.content[0]?.text).toContain("[redacted]");
    }
  });

  it("maps API.market-style 401 bodies", async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ error: "invalid_api_key" }), { status: 401 }),
    );
    await expect(
      verilineGet(config(), { product: "npi", path: "/v1/npi/1003000126" }, fetchImpl),
    ).rejects.toMatchObject({ status: 401, message: expect.stringContaining("invalid_api_key") });
  });

  it("times out when the request exceeds VERILINE_TIMEOUT_MS", async () => {
    const cfg = config({ VERILINE_TIMEOUT_MS: "30" });
    const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => {
      await new Promise((_, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("This operation was aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
      throw new Error("unreachable");
    });
    await expect(
      verilineGet(cfg, { product: "businessId", path: "/v1/validate/iban" }, fetchImpl),
    ).rejects.toBeInstanceOf(VerilineTimeoutError);
  });

  it("sends booleans as query strings and omits empty values", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      expect(String(input)).toBe(
        "https://gateway.example.test/v1/veriline/business-tax-id-validator/v1/validate/vat?vat=IE6388047V&live=false",
      );
      return new Response(JSON.stringify({ success: true, data: {}, error: null }), { status: 200 });
    });
    await verilineGet(
      config(),
      { product: "businessId", path: "/v1/validate/vat", query: { vat: "IE6388047V", live: false, country: "" } },
      fetchImpl,
    );
  });
});
