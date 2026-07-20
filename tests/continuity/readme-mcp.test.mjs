import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("README and MVP explain the MCP entry point and its current access boundary", async () => {
  const [readme, page] = await Promise.all([
    readFile(new URL("../../README.md", import.meta.url), "utf8"),
    readFile(new URL("../../app/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(readme, /^## Try it out in the repo$/m);
  assert.match(readme, /^## Quick start guide$/m);
  assert.match(readme, /^## How we collaborated with Codex$/m);
  assert.match(readme, /^## For the Technical-Minded$/m);
  assert.match(readme, /https:\/\/continuity-lab-vcs\.synthesys\.chatgpt\.site\/api\/mcp/);
  assert.match(readme, /owner-only private\s+preview/i);
  assert.match(readme, /continuity_compile_material/);
  assert.match(readme, /continuity_inspect_public_repository/);
  assert.match(readme, /present adapters, not the limits of\s+the product/i);
  assert.match(readme, /game design documents, software\s+requirements/i);
  assert.match(readme, /does not require\s+you or the user to put an OpenAI API\s+key/i);
  assert.match(readme, /The public transport remains MCP `2025-06-18`/);
  assert.match(readme, /`continuity\.mcp\.v1`/);
  assert.match(readme, /cannot.*automatically inherit.*attachment.*Git checkout/is);

  assert.match(page, /Settings → Security and login/);
  assert.match(page, /Settings → Plugins/);
  assert.match(page, /Private preview/);
  assert.match(page, /ChatGPT cannot complete its server-to-server connection/);
  assert.match(page, /continuity-lab-vcs\.synthesys\.chatgpt\.site\/api\/mcp/);
  assert.match(page, /Version to use/);
  assert.match(page, /A branch, release tag, or commit ID/);
  assert.match(page, /Official connection guide/);
  assert.doesNotMatch(page, /exposes three read-only analysis tools/);
  assert.doesNotMatch(page, /Try the VCS sample/);
  assert.doesNotMatch(page, /Which story state has a consumer but no producer/);
  assert.doesNotMatch(page, /graph hairball/);
  assert.doesNotMatch(page, /VibeCode Simulator/);
});
