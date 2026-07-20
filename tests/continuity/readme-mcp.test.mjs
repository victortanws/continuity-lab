import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("README keeps the keyless MCP entry point and compatibility boundary visible", async () => {
  const readme = await readFile(new URL("../../README.md", import.meta.url), "utf8");

  assert.match(readme, /^## Try it out in the repo$/m);
  assert.match(readme, /https:\/\/<host>\/mcp/);
  assert.match(readme, /continuity_compile_material/);
  assert.match(readme, /continuity_inspect_public_repository/);
  assert.match(readme, /does not require\s+you or the user to put an OpenAI API\s+key/i);
  assert.match(readme, /The public transport remains MCP `2025-06-18`/);
  assert.match(readme, /`continuity\.mcp\.v1`/);
  assert.match(readme, /cannot.*automatically inherit.*attachment.*Git checkout/is);
});
