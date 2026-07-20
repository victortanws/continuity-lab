import assert from "node:assert/strict";
import test from "node:test";

import { POST } from "../../app/mcp/route.ts";
import { continuityMcpTools } from "../../lib/continuity/mcp-contract.ts";
import { VCS_DEMO_REVISION } from "../../lib/continuity/demo.ts";

function request(payload, headers = {}) {
  return new Request("https://continuity.example/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "MCP-Protocol-Version": "2025-06-18",
      ...headers,
    },
    body: JSON.stringify(payload),
  });
}

async function call(payload) {
  const response = await POST(request(payload));
  const body = response.status === 202 ? null : await response.json();
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  assert.equal(response.headers.get("content-type"), "application/json");
  return { response, body };
}

function toolCall(id, name, argumentsValue) {
  return {
    jsonrpc: "2.0",
    id,
    method: "tools/call",
    params: { name, arguments: argumentsValue },
  };
}

test("stateless MCP initialization advertises only read-only tools", async () => {
  const initialized = await call({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } },
  });
  assert.equal(initialized.response.status, 200);
  assert.equal(initialized.body.result.protocolVersion, "2025-06-18");
  assert.deepEqual(initialized.body.result.capabilities, { tools: { listChanged: false } });
  assert.match(initialized.body.result.instructions, /never synchronize/i);
  assert.match(initialized.body.result.instructions, /proposals? (?:are|and) never become canon/i);

  const notification = await call({ jsonrpc: "2.0", method: "notifications/initialized" });
  assert.equal(notification.response.status, 202);

  const listed = await call({ jsonrpc: "2.0", id: "list", method: "tools/list", params: {} });
  assert.deepEqual(listed.body.result.tools.map((tool) => tool.name), [
    "continuity_answer_question",
    "continuity_trace_dependencies",
    "continuity_analyze_change",
  ]);
  for (const tool of listed.body.result.tools) {
    assert.ok(tool.title);
    assert.deepEqual(tool.inputSchema, continuityMcpTools[tool.name].inputSchema);
    assert.equal(tool.outputSchema.additionalProperties, false);
    assert.ok(tool.outputSchema.required.includes("coverage"));
    assert.equal(tool.annotations.readOnlyHint, true);
    assert.equal(tool.annotations.openWorldHint, false);
    assert.equal(tool.inputSchema.properties.projectId.maxLength, 128);
  }

  const ping = await call({ jsonrpc: "2.0", id: "ping", method: "ping" });
  assert.deepEqual(ping.body.result, {});
});

test("the three MCP tools execute deterministic VCS analysis without network or provider calls", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("MCP reviewed-sample tools must not call fetch"); };
  try {
    const answer = await call(toolCall(1, "continuity_answer_question", {
      projectId: "vcs-demo",
      projectRevision: VCS_DEMO_REVISION,
      question: "Who is Grandma?",
    }));
    assert.equal(answer.body.result.isError, false);
    assert.equal(answer.body.result.structuredContent.verdict, "AMBIGUOUS");
    assert.equal(answer.body.result.structuredContent.coverage.closure, "open");
    assert.equal(answer.body.result.structuredContent.reachability, null);
    assert.equal("routing" in answer.body.result.structuredContent, false);
    assert.equal("validation" in answer.body.result.structuredContent, false);

    const trace = await call(toolCall(2, "continuity_trace_dependencies", {
      projectId: "vcs-demo",
      projectRevision: VCS_DEMO_REVISION,
      targetRef: "the $47,000 operation for CAST-27 by Day 24",
    }));
    assert.equal(trace.body.result.isError, false);
    assert.equal(trace.body.result.structuredContent.verdict, "UNREACHABLE");
    assert.equal(trace.body.result.structuredContent.reachability.status, "unreachable_within_scope");

    const change = await call(toolCall(3, "continuity_analyze_change", {
      projectId: "vcs-demo",
      projectRevision: VCS_DEMO_REVISION,
      change: "Raise the operation cost to $60,000.",
    }));
    assert.equal(change.body.result.isError, false);
    assert.equal(change.body.result.structuredContent.verdict, "PROPOSAL");
    assert.ok(change.body.result.structuredContent.proposal);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("MCP rejects arbitrary workspaces and revisions as clear tool errors without syncing", async () => {
  const privateWorkspace = await call(toolCall(1, "continuity_answer_question", {
    projectId: "private-story",
    projectRevision: "main",
    question: "What is true?",
  }));
  assert.equal(privateWorkspace.response.status, 200);
  assert.equal(privateWorkspace.body.result.isError, true);
  assert.equal("structuredContent" in privateWorkspace.body.result, false);
  assert.match(privateWorkspace.body.result.content[0].text, /workspace_auth_not_implemented/);
  assert.match(privateWorkspace.body.result.content[0].text, /no repository synchronization was attempted/i);

  const mutableRevision = await call(toolCall(2, "continuity_trace_dependencies", {
    projectId: "vcs-demo",
    projectRevision: "HEAD",
    targetRef: "the operation",
  }));
  assert.equal(mutableRevision.body.result.isError, true);
  assert.equal("structuredContent" in mutableRevision.body.result, false);
  assert.match(mutableRevision.body.result.content[0].text, /revision_not_available/);
  assert.match(mutableRevision.body.result.content[0].text, /will not silently substitute or synchronize/i);
});

test("MCP validates JSON-RPC, arguments, and the 32 KB request boundary", async () => {
  const unexpectedArgument = await call(toolCall(1, "continuity_answer_question", {
    projectId: "vcs-demo",
    projectRevision: VCS_DEMO_REVISION,
    question: "Who is Grandma?",
    repositoryUrl: "https://example.invalid/surprise",
  }));
  assert.equal(unexpectedArgument.body.result.isError, true);
  assert.equal("structuredContent" in unexpectedArgument.body.result, false);
  assert.match(unexpectedArgument.body.result.content[0].text, /invalid_arguments/);

  const duplicateRefs = await call(toolCall("refs", "continuity_answer_question", {
    projectId: "vcs-demo",
    projectRevision: VCS_DEMO_REVISION,
    question: "Who is Grandma?",
    contextRefs: ["CAST-27", "CAST-27"],
  }));
  assert.equal(duplicateRefs.body.result.isError, true);
  assert.match(duplicateRefs.body.result.content[0].text, /contextRefs/);

  const unknownMethod = await call({ jsonrpc: "2.0", id: 2, method: "resources/list" });
  assert.equal(unknownMethod.response.status, 404);
  assert.equal(unknownMethod.body.error.code, -32601);

  const oversized = await POST(request({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "continuity_answer_question", arguments: { padding: "x".repeat(33 * 1024) } },
  }));
  assert.equal(oversized.status, 413);
  assert.match(oversized.headers.get("cache-control") ?? "", /no-store/);
  const oversizedBody = await oversized.json();
  assert.equal(oversizedBody.error.data.code, "request_body_too_large");
});

test("MCP validates initialization and the negotiated protocol header", async () => {
  const missingClientInfo = await call({
    jsonrpc: "2.0",
    id: "init-missing",
    method: "initialize",
    params: { protocolVersion: "2025-06-18", capabilities: {} },
  });
  assert.equal(missingClientInfo.response.status, 400);
  assert.equal(missingClientInfo.body.error.code, -32602);
  assert.match(missingClientInfo.body.error.message, /clientInfo/);

  const unsupportedInitialize = await call({
    jsonrpc: "2.0",
    id: "init-old",
    method: "initialize",
    params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test", version: "1" } },
  });
  assert.equal(unsupportedInitialize.response.status, 400);
  assert.match(unsupportedInitialize.body.error.message, /unsupported initialize protocolVersion/i);

  const mismatchedInitializeHeader = await POST(request({
    jsonrpc: "2.0",
    id: "init-header-old",
    method: "initialize",
    params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } },
  }, { "MCP-Protocol-Version": "2024-11-05" }));
  assert.equal(mismatchedInitializeHeader.status, 400);
  assert.match((await mismatchedInitializeHeader.json()).error.message, /unsupported MCP-Protocol-Version/i);

  const missingHeaderResponse = await POST(request(
    { jsonrpc: "2.0", id: "missing-header", method: "ping" },
    { "MCP-Protocol-Version": "" },
  ));
  assert.equal(missingHeaderResponse.status, 400);
  assert.equal(missingHeaderResponse.headers.get("content-type"), "application/json");
  assert.match((await missingHeaderResponse.json()).error.message, /MCP-Protocol-Version is required/);

  const unsupportedHeaderResponse = await POST(request(
    { jsonrpc: "2.0", id: "old-header", method: "tools/list", params: {} },
    { "MCP-Protocol-Version": "2024-11-05" },
  ));
  assert.equal(unsupportedHeaderResponse.status, 400);
  assert.match((await unsupportedHeaderResponse.json()).error.message, /unsupported MCP-Protocol-Version/i);
});
