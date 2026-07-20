import assert from "node:assert/strict";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
}

test("server-renders the Continuity Lab MVP", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /Continuity Lab/);
  assert.match(html, /Can the story/);
  assert.match(html, /Bring the project in once/);
  assert.match(html, /Try the VCS sample/);
  assert.match(html, /Pin revision/);
  assert.match(html, /question-scoped/);
  assert.doesNotMatch(html, /Slap the Heavens/);
  assert.doesNotMatch(html, /Grandma Asset Record/);
  assert.doesNotMatch(html, /demo evaluator active/);
  assert.doesNotMatch(html, /react-loading-skeleton/);
});
