# Changelog

All notable changes to `@verilineapi/mcp` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Confirmed

- Default `VERILINE_API_BASE` (`https://prod.api.market/api/v1/veriline`) and buyer header `x-api-market-key` confirmed against the live API.market Veriline listings on 26 Nov 2026 (Australia/Brisbane). No default value changed.

## [1.0.0] - 2026-11-25

### Added

- Thin stdio MCP server (optional streamable HTTP) wrapping the three Veriline APIs sold on API.market.
- Six tools, one per endpoint:
  - `audit_email_deliverability` — `GET /v1/audit`
  - `validate_vat` — `GET /v1/validate/vat`
  - `lookup_lei` — `GET /v1/lookup/lei`
  - `validate_iban` — `GET /v1/validate/iban`
  - `get_npi` — `GET /v1/npi/{number}`
  - `search_npi` — `GET /v1/npi/search`
- Configurable host and auth: `VERILINE_API_KEY`, `VERILINE_API_BASE`, `VERILINE_AUTH_HEADER`, and per-product base/key overrides.
- 5 second default request timeout, clean JSON error mapping, secret redaction in error payloads.
- `server.json` for the Official MCP Registry (`io.github.verilineapi/veriline-mcp`).

[1.0.0]: https://github.com/verilineapi/veriline-mcp/releases/tag/v1.0.0
