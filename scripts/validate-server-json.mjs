#!/usr/bin/env node
/**
 * Validate server.json against the Official MCP Registry schema
 * (https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json).
 */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA_URL = "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json";

const serverPath = join(ROOT, "server.json");
const pkgPath = join(ROOT, "package.json");

const [AjvModule, schemaRes, serverRaw, pkgRaw] = await Promise.all([
  import("ajv"),
  fetch(SCHEMA_URL),
  readFile(serverPath, "utf8"),
  readFile(pkgPath, "utf8"),
]);

if (!schemaRes.ok) {
  console.error(`Failed to fetch schema: HTTP ${schemaRes.status}`);
  process.exit(1);
}

const Ajv = AjvModule.default;
const addFormats = (await import("ajv-formats")).default;
const schema = await schemaRes.json();
const server = JSON.parse(serverRaw);
const pkg = JSON.parse(pkgRaw);

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);
const ok = validate(server);

const extras = [];
if (server.name !== pkg.mcpName) {
  extras.push(`server.json name (${server.name}) != package.json mcpName (${pkg.mcpName})`);
}
if (server.version !== pkg.version) {
  extras.push(`server.json version (${server.version}) != package.json version (${pkg.version})`);
}
const npmPkg = server.packages?.find((p) => p.registryType === "npm");
if (!npmPkg) {
  extras.push("server.json is missing an npm packages[] entry");
} else {
  if (npmPkg.identifier !== pkg.name) {
    extras.push(`packages[].identifier (${npmPkg.identifier}) != package.json name (${pkg.name})`);
  }
  if (npmPkg.version !== pkg.version) {
    extras.push(`packages[].version (${npmPkg.version}) != package.json version (${pkg.version})`);
  }
  const envNames = new Set((npmPkg.environmentVariables ?? []).map((e) => e.name));
  for (const required of ["VERILINE_API_KEY", "VERILINE_API_BASE"]) {
    if (!envNames.has(required)) extras.push(`packages[].environmentVariables missing ${required}`);
  }
  const key = (npmPkg.environmentVariables ?? []).find((e) => e.name === "VERILINE_API_KEY");
  if (key && key.isSecret !== true) extras.push("VERILINE_API_KEY must be isSecret: true");
  if (key && key.isRequired !== true) extras.push("VERILINE_API_KEY must be isRequired: true");
}
if (typeof server.description === "string" && server.description.length > 100) {
  extras.push(`description is ${server.description.length} chars; official registry limit is 100`);
}

if (!ok || extras.length) {
  if (!ok) {
    console.error("Schema validation failed:");
    for (const err of validate.errors ?? []) {
      console.error(`  ${err.instancePath || "/"} ${err.message}`);
    }
  }
  for (const e of extras) console.error(`  ${e}`);
  process.exit(1);
}

console.error(`server.json is valid against ${SCHEMA_URL}`);
console.error(`  name: ${server.name}`);
console.error(`  npm:  ${npmPkg.identifier}@${npmPkg.version}`);
