# Go-live: publish `@verilineapi/mcp` after API.market approval

The three Veriline listings were approved and published on API.market on 26 Nov 2026 (03:36 Australia/Brisbane) and the live proxy host is confirmed. Remaining steps below (GitHub, npm, Official MCP Registry) still require the repository owner's login — do not run them from an assistant session.

All git commits and npm metadata must stay under **Veriline API** / `verilineapi@proton.me`. No personal names, emails, machine paths, or country-specific personal domains.

## 0. Live gateway (confirmed 26 Nov 2026, Australia/Brisbane)

Confirmed from the public store pages and product docs at https://api.market/store/veriline:

`https://prod.api.market/api/v1/{workspace-slug}/{product-slug}/{endpoint-path}`

| Product | Store | Product base |
|---|---|---|
| Email Deliverability Auditor | https://api.market/store/veriline/email-deliverability-auditor | `https://prod.api.market/api/v1/veriline/email-deliverability-auditor` |
| Business & Tax-ID Verification | https://api.market/store/veriline/business-tax-id-validator | `https://prod.api.market/api/v1/veriline/business-tax-id-validator` |
| US NPI Lookup | https://api.market/store/veriline/npi-registry-lookup | `https://prod.api.market/api/v1/veriline/npi-registry-lookup` |

Buyer header: `x-api-market-key` (legacy alias `x-magicapi-key` is also accepted). Do not call `https://api.market/api/v1/...` — that host returns HTTP 421 and tells clients to use `https://prod.api.market`.

Defaults in `src/config.ts`, `server.json`, `.env.example` and `README.md` already match the confirmed host. No further swap is required.

Unauthenticated curls of every listed endpoint return HTTP 400 (`No x-api-market-key or x-magicapi-key defined in headers`), not 404. The gateway validates the key before routing, so a typo slug also returns that auth error until a valid key is sent.

Each product is also reachable as an API.market MCP server (tools/list works unauthenticated):

- https://api.market/api/mcp/veriline/email-deliverability-auditor
- https://api.market/api/mcp/veriline/business-tax-id-validator
- https://api.market/api/mcp/veriline/npi-registry-lookup

The shared MCP gateway https://api.market/api/mcp/gateway exists but requires a buyer key (HTTP 401) and was not listed from public info alone.

End-to-end proxy tests still need a subscribed API.market buyer key (subscribe to each product's Basic free trial in the console, then copy the key). Until then, origin live tests on `*.verilineapi.workers.dev` remain the baseline. Then run:

   ```bash
   npm test
   VERILINE_API_KEY=... VERILINE_API_BASE=... VERILINE_TIMEOUT_MS=10000 npm run test:live
   ```

   For a first check against the workers.dev origins instead of API.market (already proven in pre-release):

   ```bash
   LIVE_SMOKE=1 LIVE_SMOKE_ENV=/path/to/dotenv-with-gateway-secrets npm run test:live
   ```

   Never print or commit those secrets.

## 1. Create the public GitHub repository

`verilineapi` is a GitHub **user** account (confirmed 26 Nov 2026: public profile is `schema.org/Person` / `og:type=profile`; `https://api.github.com/orgs/verilineapi` returns 404). It is not an organization. The public repo `https://github.com/verilineapi/veriline-mcp` does not exist yet.

Signed in as `verilineapi`, create an empty public repository named `veriline-mcp` (no README, license, or gitignore template — this tree already has them). Keep the GitHub display name as **Veriline API** (the login is currently shown with no display name).

This checkout already has a repo-local git identity:

```bash
git config --local user.name   # must be: Veriline API
git config --local user.email  # must be: verilineapi@proton.me
```

If you clone fresh, set those two values **in this repository only** before the first commit:

```bash
git config --local user.name "Veriline API"
git config --local user.email "verilineapi@proton.me"
```

Scan, commit if needed, and push (owner does GitHub auth):

```bash
# OPSEC scan — must print nothing but the "clean" line
git grep -I -e '@gmail.com' -e '@proton.me' -e '\.com\.au' -e '/Users/' -e '/home/' || true
# verilineapi@proton.me in package metadata / LICENSE contact is expected; no other emails, no personal names.

git remote add origin https://github.com/verilineapi/veriline-mcp.git
git push -u origin main
```

## 2. Publish the npm package

From this repository, with Node.js 20+:

```bash
npm install
npm run typecheck
npm test
npm run build
npm run validate:server-json
npm pack --dry-run    # inspect the tarball contents
npm login             # owner: npmjs.com account for the @verilineapi scope
npm publish --access public
```

Confirm:

- `https://www.npmjs.com/package/@verilineapi/mcp` shows version `1.0.0` (or the version you just bumped).
- The published `package.json` includes `"mcpName": "io.github.verilineapi/veriline-mcp"`. You can check with:

  ```bash
  npm view @verilineapi/mcp mcpName name version
  ```

`@verilineapi/mcp` is a **scoped** package. The `@verilineapi` scope can belong to either an npm user named `verilineapi` or an npm organization of the same name. An npm organization is **not** required: if you register (or already own) the npm username `verilineapi`, that user automatically owns the `@verilineapi` user scope and can publish with `npm publish --access public`.

As of 26 Nov 2026 the package is unpublished (`registry.npmjs.org/@verilineapi/mcp` is 404) and no packages exist under that scope. Public npm pages did not confirm whether the *username* `verilineapi` is still free. Sign up or log in as npm user `verilineapi` with the Veriline brand Gmail, then publish. Create an npm organization named `verilineapi` only if the username is already taken and the org name is still free; otherwise you cannot use this scope and the package name in `package.json` / `server.json` would have to change.

## 3. Publish to the Official MCP Registry

Install the official `mcp-publisher` CLI (this is **not** the unrelated `mcp-publisher` package on npm):

```bash
curl -L "https://github.com/modelcontextprotocol/registry/releases/latest/download/mcp-publisher_$(uname -s | tr '[:upper:]' '[:lower:]')_$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/').tar.gz" \
  | tar xz mcp-publisher
sudo mv mcp-publisher /usr/local/bin/
mcp-publisher --help
mcp-publisher validate
```

Authenticate as the GitHub **user** `verilineapi`, then publish. Because this is a personal namespace (`io.github.verilineapi/*`), the interactive device flow is enough. Registry issue #1468 applies only to GitHub *organizations* (a GitHub App token cannot read org membership) and does not apply here. A PAT is not required.

```bash
mcp-publisher login github
mcp-publisher publish
```

An optional GitHub Actions workflow lives at `docs/ci/publish-mcp.yml.example`. It is **not enabled** (manual `workflow_dispatch` only; no tag or push trigger). Use it later if you prefer CI with `mcp-publisher login github-oidc`. The owner performs any auth.

Verify:

```bash
curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.verilineapi/veriline-mcp"
```

## 4. After it is live

1. README already cites https://api.market/store/veriline and the confirmed gateway; add any extra marketing links you want after npm/registry publish.
2. Tell customers to install with `npx -y @verilineapi/mcp` and set `VERILINE_API_KEY`.
3. For batch 2 tools (webpage markdown and SEC EDGAR), follow `scripts/v1.1.0-batch2.md` after those listings are approved: bump to 1.1.0, add the five new tools, then repeat `npm publish` and `mcp-publisher publish`. Do not start that branch until v1.0.0 is live.

## Checklist

- [x] Live playground URLs confirmed (26 Nov 2026); defaults already matched
- [x] `x-api-market-key` confirmed on the live listings (legacy alias `x-magicapi-key` also accepted)
- [ ] End-to-end tests through the API.market proxy passed (needs a subscribed buyer key)
- [ ] GitHub repo `verilineapi/veriline-mcp` is public; commits are `Veriline API <verilineapi@proton.me>`
- [ ] `@verilineapi/mcp` published to npm with `mcpName` set
- [ ] `mcp-publisher validate` passed
- [ ] Registry entry `io.github.verilineapi/veriline-mcp` is searchable
