import * as z from "zod/v4";
import { verilineGet, errorToToolResult, successToToolResult, type FetchLike } from "./client.js";
import type { ProductId, VerilineConfig } from "./config.js";

export interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
  [key: string]: unknown;
}

export type ToolHandler = (
  args: Record<string, unknown>,
  ctx: { config: VerilineConfig; fetchImpl: FetchLike },
) => Promise<ToolResult>;

function text(schema: z.ZodString, description: string) {
  return schema.describe(description);
}

export const auditEmailDeliverabilitySchema = z.object({
  domain: text(
    z.string().min(1),
    "Domain to audit. Also accepts an email address or URL; the domain is extracted automatically.",
  ),
  selectors: z
    .string()
    .optional()
    .describe("Up to 5 extra comma-separated DKIM selectors to check in addition to the common ones."),
});

export const validateVatSchema = z.object({
  vat: text(
    z.string().min(1),
    "VAT / tax ID, with or without country prefix. Spaces, dots and dashes are ignored.",
  ),
  country: z
    .string()
    .optional()
    .describe(
      "ISO 3166-1 alpha-2 country code. Required when the number has no VAT prefix (e.g. AU ABN, US EIN).",
    ),
  live: z
    .boolean()
    .optional()
    .describe("If false, skip the live EU VIES call. Defaults to true."),
  strict: z
    .boolean()
    .optional()
    .describe(
      "If true, return an error when VIES cannot give a definitive answer instead of verdict=format_valid_unverified.",
    ),
});

export const lookupLeiSchema = z.object({
  lei: z
    .string()
    .optional()
    .describe("20-character Legal Entity Identifier (ISO 17442). Check digits are verified before calling GLEIF."),
  name: z
    .string()
    .optional()
    .describe("Company name search (legal and other names). Used when lei is not given."),
  country: z
    .string()
    .optional()
    .describe("Filter name search by legal-address country (ISO 3166-1 alpha-2)."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe("Page size for name search (1–50, default 10)."),
  page: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Page number for name search (1–100, default 1)."),
});

export const validateIbanSchema = z.object({
  iban: text(z.string().min(1), "IBAN in electronic or print format (spaces allowed)."),
});

export const getNpiSchema = z.object({
  number: z
    .string()
    .regex(/^\d{10}$/, "NPI must be exactly 10 digits")
    .describe("10-digit National Provider Identifier."),
});

export const searchNpiSchema = z
  .object({
    first_name: z.string().optional().describe("Provider first name (individuals)."),
    last_name: z.string().optional().describe("Provider last name (individuals)."),
    organization_name: z.string().optional().describe("Organization or facility name (NPI-2)."),
    taxonomy: z
      .string()
      .optional()
      .describe(
        "NUCC taxonomy description prefix, e.g. 'Cardiovascular Disease' or 'Cardio'. Colloquial terms such as 'cardiology' are not matched.",
      ),
    city: z.string().optional().describe("Practice city."),
    state: z.string().optional().describe("Two-letter US state or territory code."),
    postal_code: z.string().optional().describe("5- or 9-digit ZIP. A trailing * wildcard is allowed."),
    entity_type: z
      .enum(["individual", "organization"])
      .optional()
      .describe("Filter to individuals (NPI-1) or organizations (NPI-2)."),
    limit: z.number().int().min(1).max(200).optional().describe("Page size (1–200, default 10)."),
    skip: z.number().int().min(0).max(1000).optional().describe("Number of results to skip (0–1000, default 0)."),
    country_code: z
      .string()
      .optional()
      .describe("ISO 3166-1 alpha-2 country code of the practice address (usually US)."),
    address_purpose: z
      .enum(["LOCATION", "MAILING", "PRIMARY", "SECONDARY"])
      .optional()
      .describe("Optional NPPES address-purpose filter."),
});

export interface ToolDef {
  name: string;
  title: string;
  description: string;
  product: ProductId;
  schema: z.ZodObject<z.ZodRawShape>;
  annotations: { readOnlyHint: true; idempotentHint: true; openWorldHint: true };
  handler: ToolHandler;
}


function missingArgs(message: string): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify({ error: "invalid_arguments", message }, null, 2) }], isError: true };
}

async function call(
  ctx: { config: VerilineConfig; fetchImpl: FetchLike },
  product: ProductId,
  path: string,
  query?: Record<string, string | number | boolean | undefined | null>,
): Promise<ToolResult> {
  try {
    const body = await verilineGet(ctx.config, { product, path, query }, ctx.fetchImpl);
    return successToToolResult(body);
  } catch (err) {
    return errorToToolResult(err);
  }
}

export const TOOLS: ToolDef[] = [
  {
    name: "audit_email_deliverability",
    title: "Audit email deliverability",
    description:
      "Audit a domain's email deliverability and security. Checks SPF, DKIM, DMARC and MX records and returns a score plus findings. Pass a domain, email address, or URL.",
    product: "emailAuditor",
    schema: auditEmailDeliverabilitySchema,
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    handler: async (args, ctx) => {
      const { domain, selectors } = args as z.infer<typeof auditEmailDeliverabilitySchema>;
      return call(ctx, "emailAuditor", "/v1/audit", { domain, selectors });
    },
  },
  {
    name: "validate_vat",
    title: "Validate VAT or tax ID",
    description:
      "Validate a VAT or national tax ID. EU numbers get a live VIES check; other countries are format and checksum validated offline (GB, AU, US EIN, and more).",
    product: "businessId",
    schema: validateVatSchema,
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    handler: async (args, ctx) => {
      const { vat, country, live, strict } = args as z.infer<typeof validateVatSchema>;
      return call(ctx, "businessId", "/v1/validate/vat", { vat, country, live, strict });
    },
  },
  {
    name: "lookup_lei",
    title: "Look up a Legal Entity Identifier",
    description:
      "Look up a Legal Entity Identifier (LEI) or search companies by name via GLEIF. Returns legal name, status, jurisdiction, and addresses. Provide lei or name.",
    product: "businessId",
    schema: lookupLeiSchema,
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    handler: async (args, ctx) => {
      const { lei, name, country, limit, page } = args as z.infer<typeof lookupLeiSchema>;
      if (!lei?.trim() && !name?.trim()) {
        return missingArgs("Provide lei or name (or both).");
      }
      return call(ctx, "businessId", "/v1/lookup/lei", { lei, name, country, limit, page });
    },
  },
  {
    name: "validate_iban",
    title: "Validate an IBAN",
    description:
      "Validate an International Bank Account Number (IBAN) for 89 countries using the official checksum, and extract country, bank, and branch codes. Spaces are allowed.",
    product: "businessId",
    schema: validateIbanSchema,
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    handler: async (args, ctx) => {
      const { iban } = args as z.infer<typeof validateIbanSchema>;
      return call(ctx, "businessId", "/v1/validate/iban", { iban });
    },
  },
  {
    name: "get_npi",
    title: "Get a US healthcare provider by NPI",
    description:
      "Look up a US healthcare provider by their 10-digit National Provider Identifier (NPI). Returns name, credentials, taxonomy, practice addresses, and status from NPPES.",
    product: "npi",
    schema: getNpiSchema,
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    handler: async (args, ctx) => {
      const { number } = args as z.infer<typeof getNpiSchema>;
      return call(ctx, "npi", `/v1/npi/${encodeURIComponent(number)}`);
    },
  },
  {
    name: "search_npi",
    title: "Search the US NPI registry",
    description:
      "Search the US NPPES NPI Registry by provider name, organization, taxonomy (NUCC description prefix), city, state, or postal code. Provide at least one search field.",
    product: "npi",
    schema: searchNpiSchema,
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    handler: async (args, ctx) => {
      const a = args as z.infer<typeof searchNpiSchema>;
      if (
        !a.first_name &&
        !a.last_name &&
        !a.organization_name &&
        !a.taxonomy &&
        !a.city &&
        !a.state &&
        !a.postal_code
      ) {
        return missingArgs(
          "Provide at least one search field (name, organization, taxonomy, city, state, or postal_code).",
        );
      }
      return call(ctx, "npi", "/v1/npi/search", {
        first_name: a.first_name,
        last_name: a.last_name,
        organization_name: a.organization_name,
        taxonomy: a.taxonomy,
        city: a.city,
        state: a.state,
        postal_code: a.postal_code,
        entity_type: a.entity_type,
        limit: a.limit,
        skip: a.skip,
        country_code: a.country_code,
        address_purpose: a.address_purpose,
      });
    },
  },
];

export const TOOL_NAMES = TOOLS.map((t) => t.name);
