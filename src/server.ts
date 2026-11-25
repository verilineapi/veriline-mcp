import { McpServer } from "@modelcontextprotocol/server";
import { PACKAGE_VERSION, SERVER_NAME, type VerilineConfig } from "./config.js";
import {
  TOOLS,
  auditEmailDeliverabilitySchema,
  getNpiSchema,
  lookupLeiSchema,
  searchNpiSchema,
  validateIbanSchema,
  validateVatSchema,
} from "./tools.js";
import type { FetchLike } from "./client.js";

function named(name: (typeof TOOLS)[number]["name"]) {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) throw new Error(`Internal error: tool ${name} is not registered in TOOLS`);
  return tool;
}

export function createServer(config: VerilineConfig, fetchImpl: FetchLike = fetch): McpServer {
  const server = new McpServer(
    {
      name: SERVER_NAME,
      version: PACKAGE_VERSION,
      title: "Veriline API",
    },
    {
      instructions:
        "Veriline API tools for email deliverability audits, VAT/LEI/IBAN checks, and US NPI lookups. " +
        "These call the customer's API.market subscription (or a configured origin). " +
        "Set VERILINE_API_KEY to an API.market subscriber key.",
    },
  );

  const ctx = { config, fetchImpl };

  const audit = named("audit_email_deliverability");
  server.registerTool(
    audit.name,
    {
      title: audit.title,
      description: audit.description,
      inputSchema: auditEmailDeliverabilitySchema,
      annotations: audit.annotations,
    },
    async (args) => audit.handler(args, ctx),
  );

  const vat = named("validate_vat");
  server.registerTool(
    vat.name,
    {
      title: vat.title,
      description: vat.description,
      inputSchema: validateVatSchema,
      annotations: vat.annotations,
    },
    async (args) => vat.handler(args, ctx),
  );

  const lei = named("lookup_lei");
  server.registerTool(
    lei.name,
    {
      title: lei.title,
      description: lei.description,
      inputSchema: lookupLeiSchema,
      annotations: lei.annotations,
    },
    async (args) => lei.handler(args, ctx),
  );

  const iban = named("validate_iban");
  server.registerTool(
    iban.name,
    {
      title: iban.title,
      description: iban.description,
      inputSchema: validateIbanSchema,
      annotations: iban.annotations,
    },
    async (args) => iban.handler(args, ctx),
  );

  const getNpi = named("get_npi");
  server.registerTool(
    getNpi.name,
    {
      title: getNpi.title,
      description: getNpi.description,
      inputSchema: getNpiSchema,
      annotations: getNpi.annotations,
    },
    async (args) => getNpi.handler(args, ctx),
  );

  const searchNpi = named("search_npi");
  server.registerTool(
    searchNpi.name,
    {
      title: searchNpi.title,
      description: searchNpi.description,
      inputSchema: searchNpiSchema,
      annotations: searchNpi.annotations,
    },
    async (args) => searchNpi.handler(args, ctx),
  );

  return server;
}
