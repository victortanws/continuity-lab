import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("README and MVP keep the keyless MCP entry point and compatibility boundary visible", async () => {
  const [readme, page] = await Promise.all([
    readFile(new URL("../../README.md", import.meta.url), "utf8"),
    readFile(new URL("../../app/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(readme, /^## Try it out in the repo$/m);
  assert.match(readme, /https:\/\/<host>\/api\/mcp/);
  assert.match(readme, /continuity_compile_material/);
  assert.match(readme, /continuity_inspect_public_repository/);
  assert.match(readme, /present adapters, not the limits of\s+the product/i);
  assert.match(readme, /game design documents, software\s+requirements/i);
  assert.match(readme, /does not require\s+you or the user to put an OpenAI API\s+key/i);
  assert.match(readme, /The public transport remains MCP `2025-06-18`/);
  assert.match(readme, /`continuity\.mcp\.v1`/);
  assert.match(readme, /cannot.*automatically inherit.*attachment.*Git checkout/is);

  assert.match(page, /five read-only tools/);
  assert.match(page, /domain-neutral evidence, identity, authority, and causality engine/);
  assert.match(page, /VCS is the current reviewed demonstration adapter/);
  assert.match(page, /Version to analyze/);
  assert.match(page, /Branch, release tag, or commit ID/);
  assert.match(page, /continuity_compile_material/);
  assert.match(page, /continuity_inspect_public_repository/);
  assert.match(page, /makes no OpenAI API call/);
  assert.match(page, /host’s \/api\/mcp endpoint/);
  assert.doesNotMatch(page, /exposes three read-only analysis tools/);
});
