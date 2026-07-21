import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
}

async function builtWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-mcp`);
  return (await import(workerUrl.href)).default;
}

test("server-renders the Continuity Lab MVP", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /Continuity Lab/);
  assert.match(html, /Towards a new paradigm in/);
  assert.match(html, /game development and continuity/);
  assert.match(html, /How it works/);
  assert.match(html, /Show the example/);
  assert.match(html, /Add my project/);
  assert.match(html, /Try Continuity Lab today!/);
  assert.match(html, /continuity-lab-plugin-icon\.png/);
  assert.match(html, /Guide autonomous development/);
  assert.match(html, /Vibe Code Simulator/);
  assert.match(html, /No\. The current prototype cannot earn or pay the \$47,000/);
  assert.match(html, /What the question refers to/);
  assert.match(html, /Switch to dark mode/);
  assert.match(html, /Marc&#x27;s later Seed Round gives the company money/);
  assert.doesNotMatch(html, /Reviewed example/);
  assert.doesNotMatch(html, /Try the VCS sample/);
  assert.doesNotMatch(html, /graph hairball/);
  assert.doesNotMatch(html, /causal edges/i);
  assert.doesNotMatch(html, /Slap the Heavens/);
  assert.doesNotMatch(html, /Grandma Asset Record/);
  assert.doesNotMatch(html, /How should this document be read/);
  assert.doesNotMatch(html, /Use my files/);
  assert.doesNotMatch(html, /demo evaluator active/);
  assert.doesNotMatch(html, /react-loading-skeleton/);
});

test("the ChatGPT panel exposes the dependency-tracing demonstration", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /Trace every dependency required before Grandma/);
  assert.match(source, /The MCP returns the same cited entities and dependency chain/);
  assert.match(source, /continuity-lab-plugin-icon\.png/);
});

test("the built worker exposes the Sites-compatible MCP alias", async () => {
  const worker = await builtWorker();
  const response = await worker.fetch(new Request("http://localhost/api/mcp", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "MCP-Protocol-Version": "2025-06-18",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: "list", method: "tools/list", params: {} }),
  }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.result.tools.length, 5);
  assert.equal(body.result.tools[0]._meta["continuity/contractVersion"], "continuity.mcp.v1");
  assert.equal(body.result.tools[0].inputSchema.properties.projectId.default, "vcs-demo");
  assert.equal(body.result.tools[0].inputSchema.properties.projectRevision.default, "vcs-demo-r2");
});
