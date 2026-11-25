import { describe, expect, it } from "vitest";
import {
  DEFAULT_API_BASE,
  DEFAULT_AUTH_HEADER,
  DEFAULT_TIMEOUT_MS,
  PRODUCT_SLUGS,
  keyFor,
  loadConfig,
} from "../src/config.js";

describe("loadConfig", () => {
  it("applies documented API.market defaults", () => {
    const cfg = loadConfig({});
    expect(cfg.apiKey).toBeUndefined();
    expect(cfg.apiBase).toBe(DEFAULT_API_BASE);
    expect(cfg.authHeader).toBe(DEFAULT_AUTH_HEADER);
    expect(cfg.timeoutMs).toBe(DEFAULT_TIMEOUT_MS);
    expect(cfg.productBases.emailAuditor).toBe(`${DEFAULT_API_BASE}/${PRODUCT_SLUGS.emailAuditor}`);
    expect(cfg.productBases.businessId).toBe(`${DEFAULT_API_BASE}/${PRODUCT_SLUGS.businessId}`);
    expect(cfg.productBases.npi).toBe(`${DEFAULT_API_BASE}/${PRODUCT_SLUGS.npi}`);
  });

  it("strips trailing slashes from bases", () => {
    const cfg = loadConfig({
      VERILINE_API_BASE: "https://example.example/v1/veriline/",
      VERILINE_NPI_BASE: "https://npi.example.test/",
    });
    expect(cfg.apiBase).toBe("https://example.example/v1/veriline");
    expect(cfg.productBases.emailAuditor).toBe(
      `https://example.example/v1/veriline/${PRODUCT_SLUGS.emailAuditor}`,
    );
    expect(cfg.productBases.npi).toBe("https://npi.example.test");
  });

  it("honours per-product base and key overrides", () => {
    const cfg = loadConfig({
      VERILINE_API_KEY: "shared-key",
      VERILINE_EMAIL_AUDITOR_BASE: "https://email-auditor.example.test",
      VERILINE_BUSINESS_ID_BASE: "https://business-id.example.test",
      VERILINE_NPI_BASE: "https://npi.example.test",
      VERILINE_NPI_KEY: "npi-only-key",
      VERILINE_AUTH_HEADER: "X-Gateway-Secret",
      VERILINE_TIMEOUT_MS: "8000",
    });
    expect(cfg.authHeader).toBe("X-Gateway-Secret");
    expect(cfg.timeoutMs).toBe(8000);
    expect(keyFor(cfg, "emailAuditor")).toBe("shared-key");
    expect(keyFor(cfg, "npi")).toBe("npi-only-key");
    expect(cfg.productBases.emailAuditor).toBe("https://email-auditor.example.test");
  });

  it("rejects non-http bases and bad timeouts", () => {
    expect(() => loadConfig({ VERILINE_API_BASE: "ftp://nope.example" })).toThrow(/http/);
    expect(() => loadConfig({ VERILINE_API_BASE: "not-a-url" })).toThrow(/VERILINE_API_BASE/);
    expect(() => loadConfig({ VERILINE_TIMEOUT_MS: "0" })).toThrow(/VERILINE_TIMEOUT_MS/);
    expect(() => loadConfig({ VERILINE_AUTH_HEADER: "X-Key: sneaky" })).toThrow(/VERILINE_AUTH_HEADER/);
  });
});
