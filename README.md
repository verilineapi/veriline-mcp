# Veriline API MCP Server

[![Run in Postman](https://run.pstmn.io/button.svg)](https://www.postman.com/verilineapi-3605162/veriline-api/overview)

The collections cover the three live APIs. Subscriber keys come from [API.market](https://api.market/store/veriline).

Thin, open-source [Model Context Protocol](https://modelcontextprotocol.io) server for the **Veriline API** suite. It exposes six read-only tools that call the same HTTP APIs sold on [API.market](https://api.market) under the `veriline` store:

| Tool | HTTP | What it does |
|---|---|---|
| `audit_email_deliverability` | `GET /v1/audit` | SPF, DKIM, DMARC and MX audit for a domain |
| `validate_vat` | `GET /v1/validate/vat` | VAT / tax-ID check (live EU VIES + offline checksums) |
| `lookup_lei` | `GET /v1/lookup/lei` | GLEIF Legal Entity Identifier lookup or name search |
| `validate_iban` | `GET /v1/validate/iban` | IBAN checksum and bank/branch extraction (89 countries) |
| `get_npi` | `GET /v1/npi/{number}` | US healthcare provider by 10-digit NPI |
| `search_npi` | `GET /v1/npi/search` | NPPES search by name, org, taxonomy, or location |

Package: [`@verilineapi/mcp`](https://www.npmjs.com/package/@verilineapi/mcp)
Registry name: `io.github.verilineapi/veriline-mcp`

<!-- mcp-name: io.github.verilineapi/veriline-mcp -->

## Get an API key

1. Create an account at [API.market](https://api.market).
2. Subscribe to one or more Veriline products (a free trial is enough to try the tools):
   - [Email Deliverability Auditor](https://api.market) — product slug `email-deliverability-auditor`
   - [Business & Tax-ID Verification](https://api.market) — product slug `business-tax-id-validator`
   - [US Healthcare Provider NPI Lookup](https://api.market) — product slug `npi-registry-lookup`
3. Copy your API.market subscriber key and set `VERILINE_API_KEY`.

Public listing URLs will be added here once the store listings are approved.

## Install

Node.js 20 or later.

```bash
npm install -g @verilineapi/mcp
# or run without installing:
npx -y @verilineapi/mcp
```

The server speaks MCP over **stdio** by default. An optional streamable-HTTP listener is available for local experiments:

```bash
npx -y @verilineapi/mcp --transport=streamable-http --port=3000
```

## Configuration

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `VERILINE_API_KEY` | Yes (to call tools) | — | API.market subscriber key (secret) |
| `VERILINE_API_BASE` | No | `https://prod.api.market/api/v1/veriline` | Org/base URL. Per-product paths are appended when the product-specific override is unset. |
| `VERILINE_AUTH_HEADER` | No | `x-api-market-key` | Buyer auth header sent with every request |
| `VERILINE_EMAIL_AUDITOR_BASE` | No | `{VERILINE_API_BASE}/email-deliverability-auditor` | Full product base URL |
| `VERILINE_BUSINESS_ID_BASE` | No | `{VERILINE_API_BASE}/business-tax-id-validator` | Full product base URL |
| `VERILINE_NPI_BASE` | No | `{VERILINE_API_BASE}/npi-registry-lookup` | Full product base URL |
| `VERILINE_EMAIL_AUDITOR_KEY` / `VERILINE_BUSINESS_ID_KEY` / `VERILINE_NPI_KEY` | No | `VERILINE_API_KEY` | Per-product key override |
| `VERILINE_TIMEOUT_MS` | No | `5000` | HTTP timeout in milliseconds |

`VERILINE_API_BASE` defaults to `https://prod.api.market/api/v1/veriline`, confirmed on 26 Nov 2026 (Australia/Brisbane) against the live Veriline product pages. Per-product bases are `{VERILINE_API_BASE}/email-deliverability-auditor`, `{VERILINE_API_BASE}/business-tax-id-validator` and `{VERILINE_API_BASE}/npi-registry-lookup`. The buyer header is `x-api-market-key` (the gateway also accepts the legacy alias `x-magicapi-key`). Store: https://api.market/store/veriline.

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "veriline": {
      "command": "npx",
      "args": ["-y", "@verilineapi/mcp"],
      "env": {
        "VERILINE_API_KEY": "your-api-market-key"
      }
    }
  }
}
```

### Cursor

Add to `~/.cursor/mcp.json` (or the project `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "veriline": {
      "command": "npx",
      "args": ["-y", "@verilineapi/mcp"],
      "env": {
        "VERILINE_API_KEY": "your-api-market-key"
      }
    }
  }
}
```

Restart the client after saving. If you already installed the package globally, you can use `"command": "veriline-mcp"` and omit `args`.

## Tools

All tools are read-only. They return the upstream JSON envelope as formatted text:

```json
{
  "success": true,
  "data": {},
  "error": null,
  "meta": { "request_id": "…", "took_ms": 42, "service": "npi", "version": "1.0.0" }
}
```

HTTP and validation errors come back as a tool error (`isError: true`) with a status, message, and `request_id` when the API provided one. API keys are never included in those payloads.

### `audit_email_deliverability`

| Argument | Type | Required | Notes |
|---|---|---|---|
| `domain` | string | yes | Domain, email address, or URL |
| `selectors` | string | no | Up to 5 extra comma-separated DKIM selectors |

### `validate_vat`

| Argument | Type | Required | Notes |
|---|---|---|---|
| `vat` | string | yes | VAT / tax ID, with or without country prefix |
| `country` | string | no | ISO 3166-1 alpha-2; required when the number has no prefix |
| `live` | boolean | no | Default true; set false to skip the live VIES call |
| `strict` | boolean | no | Default false; if true, treat an inconclusive VIES result as an error |

### `lookup_lei`

Provide `lei` or `name` (or both).

| Argument | Type | Required | Notes |
|---|---|---|---|
| `lei` | string | one of lei/name | 20-character LEI |
| `name` | string | one of lei/name | Company name search |
| `country` | string | no | Legal-address country (ISO alpha-2) |
| `limit` | number | no | 1–50, default 10 |
| `page` | number | no | 1–100, default 1 |

### `validate_iban`

| Argument | Type | Required | Notes |
|---|---|---|---|
| `iban` | string | yes | Electronic or print format (spaces allowed) |

### `get_npi`

| Argument | Type | Required | Notes |
|---|---|---|---|
| `number` | string | yes | Exactly 10 digits |

### `search_npi`

Provide at least one of `first_name`, `last_name`, `organization_name`, `taxonomy`, `city`, `state`, or `postal_code`.

| Argument | Type | Required | Notes |
|---|---|---|---|
| `first_name` / `last_name` | string | no | Individuals |
| `organization_name` | string | no | Facilities (NPI-2) |
| `taxonomy` | string | no | NUCC description **prefix** (e.g. `Cardiovascular Disease`) |
| `city` / `state` / `postal_code` | string | no | `state` is a US two-letter code; ZIP may end in `*` |
| `entity_type` | string | no | `individual` or `organization` |
| `limit` / `skip` | number | no | Page size 1–200 (default 10); skip 0–1000 |
| `country_code` | string | no | ISO alpha-2 (usually `US`) |
| `address_purpose` | string | no | `LOCATION`, `MAILING`, `PRIMARY`, or `SECONDARY` |

## Development

```bash
npm install
npm test
npm run build
npm run validate:server-json
node dist/index.js --help
```

Live smoke tests (optional) send real traffic to whatever bases you configure. Point them at a marketplace proxy or at an origin that accepts `X-Gateway-Secret`, and never log the key:

```bash
LIVE_SMOKE=1 \
  LIVE_SMOKE_ENV=./.env \
  npm run test:live
```

`LIVE_SMOKE_ENV` is a dotenv file read only by the live test. It is gitignored.

## License

[MIT](LICENSE) © 2026 Veriline API

Maintainer: Veriline API · `verilineapi@proton.me`
