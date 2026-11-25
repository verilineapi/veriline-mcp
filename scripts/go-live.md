# Go-live: publish `@verilineapi/mcp` after API.market approval

Do not run any of the publish or login steps until the three Veriline listings are approved and the live proxy host is confirmed. This file is the exact sequence. Auth (npm login, GitHub login, `mcp-publisher login`) is performed by the repository owner, not by an assistant.

All git commits and npm metadata must stay under **Veriline API** / `verilineapi@proton.me`. No personal names, emails, machine paths, or country-specific personal domains.

## 0. Confirm the live gateway

1. Open each approved product's API Playground on API.market and copy the full endpoint URL. Official docs use:

   `https://prod.api.market/api/v1/{workspace-slug}/{product-slug}/{endpoint-path}`

   Expected (unconfirmed until you see the playground):

   | Product | Expected product base |
   |---|---|
   | Email Deliverability Auditor | `https://prod.api.market/api/v1/veriline/email-deliverability-auditor` |
   | Business & Tax-ID Verification | `https://prod.api.market/api/v1/veriline/business-tax-id-validator` |
   | US NPI Lookup | `https://prod.api.market/api/v1/veriline/npi-registry-lookup` |

   The buyer header in official API.market docs is `x-api-market-key`. Confirm that the playground's curl snippet uses the same name.

2. If the host or path differs (for example the `/api` segment is missing, or a product slug was changed), update the defaults in:

   - `src/config.ts` (`DEFAULT_API_BASE` and `PRODUCT_SLUGS`)
   - `server.json` (`VERILINE_API_BASE` default and description)
   - `.env.example` and `README.md`

3. Subscribe to each product on a test plan, set `VERILINE_API_KEY` and (if needed) `VERILINE_API_BASE`, then run:

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

Create a public repository `https://github.com/verilineapi/veriline-mcp` under the Veriline GitHub organization (or user) `verilineapi`. Empty repo, no README template (this tree already has one).

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

If the `@verilineapi` org does not yet exist on npm, the owner creates it and grants publish rights before `npm publish`.

## 3. Publish to the Official MCP Registry

Install the official `mcp-publisher` CLI (this is **not** the unrelated `mcp-publisher` package on npm):

```bash
curl -L "https://github.com/modelcontextprotocol/registry/releases/latest/download/mcp-publisher_$(uname -s | tr '[:upper:]' '[:lower:]')_$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/').tar.gz" \
  | tar xz mcp-publisher
sudo mv mcp-publisher /usr/local/bin/
mcp-publisher --help
mcp-publisher validate
```

Authenticate as the owner of the `verilineapi` GitHub org, then publish:

```bash
# Interactive device flow (personal namespace only today; see note below):
mcp-publisher login github

# To publish under the io.github.verilineapi/* org namespace, use a
# Personal Access Token that can read org membership instead:
#   Classic PAT: scope read:org
#   Fine-grained PAT: Organization permissions → Members → Read-only
#   (tracking: https://github.com/modelcontextprotocol/registry/issues/1468)
mcp-publisher login github --token <PAT>

mcp-publisher publish
```

Alternatively, publish from GitHub Actions with OIDC (`mcp-publisher login github-oidc`) once the repo exists. The owner performs any auth.

Verify:

```bash
curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.verilineapi/veriline-mcp"
```

## 4. After it is live

1. Update README product links to the public API.market listing URLs.
2. Tell customers to install with `npx -y @verilineapi/mcp` and set `VERILINE_API_KEY`.
3. Bump `package.json`, `src/config.ts` (`PACKAGE_VERSION`), and `server.json` together for later releases, then repeat `npm publish` and `mcp-publisher publish`.

## Checklist

- [ ] Live playground URLs confirmed; defaults updated if they differed
- [ ] `x-api-market-key` confirmed in the playground curl (or `VERILINE_AUTH_HEADER` default updated)
- [ ] End-to-end tests through the API.market proxy passed
- [ ] GitHub repo `verilineapi/veriline-mcp` is public; commits are `Veriline API <verilineapi@proton.me>`
- [ ] `@verilineapi/mcp` published to npm with `mcpName` set
- [ ] `mcp-publisher validate` passed
- [ ] Registry entry `io.github.verilineapi/veriline-mcp` is searchable
