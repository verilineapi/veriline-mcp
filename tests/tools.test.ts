import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.js";
import {
  TOOLS,
  TOOL_NAMES,
  auditEmailDeliverabilitySchema,
  getNpiSchema,
  lookupLeiSchema,
  searchNpiSchema,
} from "../src/tools.js";

const SECRET = "tool-test-secret-value";

function ctx(fetchImpl: typeof fetch) {
  return {
    config: loadConfig({
      VERILINE_API_KEY: SECRET,
      VERILINE_API_BASE: "https://gateway.example.test/v1/veriline",
    }),
    fetchImpl,
  };
}

function jsonOk(data: unknown) {
  return new Response(JSON.stringify({ success: true, data, error: null }), { status: 200 });
}

describe("tool catalog", () => {
  it("exposes exactly the six Veriline endpoints", () => {
    expect(TOOL_NAMES).toEqual([
      "audit_email_deliverability",
      "validate_vat",
      "lookup_lei",
      "validate_iban",
      "get_npi",
      "search_npi",
    ]);
    for (const tool of TOOLS) {
      expect(tool.description.length).toBeGreaterThan(40);
      expect(tool.annotations.readOnlyHint).toBe(true);
    }
  });
});

describe("zod schemas", () => {
  it("accepts a domain or email for the auditor", () => {
    expect(auditEmailDeliverabilitySchema.parse({ domain: "github.com" }).domain).toBe("github.com");
    expect(() => auditEmailDeliverabilitySchema.parse({})).toThrow();
  });

  it("accepts lei or name for LEI lookup", () => {
    expect(lookupLeiSchema.parse({ lei: "HWUPKR0MPOU8FGXBT394" }).lei).toBe("HWUPKR0MPOU8FGXBT394");
    expect(lookupLeiSchema.parse({ name: "Apple" }).name).toBe("Apple");
  });

  it("requires a 10-digit NPI and accepts search fields", () => {
    expect(() => getNpiSchema.parse({ number: "123" })).toThrow();
    expect(getNpiSchema.parse({ number: "1003000126" }).number).toBe("1003000126");
    expect(searchNpiSchema.parse({ last_name: "Smith", state: "CA", limit: 1 }).state).toBe("CA");
  });
});

describe("tool HTTP mapping", () => {
  const cases: Array<{
    name: string;
    args: Record<string, unknown>;
    url: string;
  }> = [
    {
      name: "audit_email_deliverability",
      args: { domain: "github.com", selectors: "google" },
      url: "https://gateway.example.test/v1/veriline/email-deliverability-auditor/v1/audit?domain=github.com&selectors=google",
    },
    {
      name: "validate_vat",
      args: { vat: "IE6388047V", live: false },
      url: "https://gateway.example.test/v1/veriline/business-tax-id-validator/v1/validate/vat?vat=IE6388047V&live=false",
    },
    {
      name: "lookup_lei",
      args: { lei: "HWUPKR0MPOU8FGXBT394" },
      url: "https://gateway.example.test/v1/veriline/business-tax-id-validator/v1/lookup/lei?lei=HWUPKR0MPOU8FGXBT394",
    },
    {
      name: "validate_iban",
      args: { iban: "DE89 3704 0044 0532 0130 00" },
      url: "https://gateway.example.test/v1/veriline/business-tax-id-validator/v1/validate/iban?iban=DE89+3704+0044+0532+0130+00",
    },
    {
      name: "get_npi",
      args: { number: "1003000126" },
      url: "https://gateway.example.test/v1/veriline/npi-registry-lookup/v1/npi/1003000126",
    },
    {
      name: "search_npi",
      args: { last_name: "Smith", state: "CA", limit: 1, entity_type: "individual" },
      url: "https://gateway.example.test/v1/veriline/npi-registry-lookup/v1/npi/search?last_name=Smith&state=CA&entity_type=individual&limit=1",
    },
  ];

  it.each(cases)("$name hits the expected URL", async ({ name, args, url }) => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      expect(String(input)).toBe(url);
      return jsonOk({ tool: name });
    });
    const tool = TOOLS.find((t) => t.name === name);
    expect(tool).toBeDefined();
    const result = await tool!.handler(args, ctx(fetchImpl));
    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toContain(`"tool": "${name}"`);
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(result.content[0]?.text).not.toContain(SECRET);
  });

  it("surfaces a mapped HTTP error as an isError tool result without leaking the key", async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            success: false,
            error: { code: "not_found", message: `no such NPI ${SECRET}` },
            meta: { request_id: "abc" },
          }),
          { status: 404 },
        ),
    );
    const tool = TOOLS.find((t) => t.name === "get_npi")!;
    const result = await tool.handler({ number: "1003000126" }, ctx(fetchImpl));
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("not_found");
    expect(result.content[0]?.text).toContain("abc");
    expect(result.content[0]?.text).not.toContain(SECRET);
  });
});

describe("handler argument checks", () => {
  it("returns isError when lookup_lei has neither lei nor name", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const tool = TOOLS.find((t) => t.name === "lookup_lei")!;
    const result = await tool.handler({}, ctx(fetchImpl));
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/lei or name/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns isError when search_npi has no search fields", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const tool = TOOLS.find((t) => t.name === "search_npi")!;
    const result = await tool.handler({ limit: 1 }, ctx(fetchImpl));
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/at least one search field/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
