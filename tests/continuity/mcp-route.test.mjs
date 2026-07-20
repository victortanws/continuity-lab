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
    "continuity_compile_material",
    "continuity_inspect_public_repository",
  ]);
  for (const tool of listed.body.result.tools) {
    assert.ok(tool.title);
    assert.deepEqual(tool.inputSchema, continuityMcpTools[tool.name].inputSchema);
    assert.equal(tool.outputSchema.additionalProperties, false);
    assert.ok(tool.outputSchema.required.includes("coverage"));
    assert.equal(tool.annotations.readOnlyHint, true);
    assert.equal(tool.annotations.openWorldHint, tool.name === "continuity_inspect_public_repository");
    assert.equal(tool.annotations.idempotentHint, tool.name !== "continuity_inspect_public_repository");
    assert.deepEqual(tool.securitySchemes, [{ type: "noauth" }]);
    assert.deepEqual(tool._meta.securitySchemes, tool.securitySchemes);
    if (tool.inputSchema.properties.projectId) {
      assert.equal(tool.inputSchema.properties.projectId.maxLength, 128);
    }
  }

  const ping = await call({ jsonrpc: "2.0", id: "ping", method: "ping" });
  assert.deepEqual(ping.body.result, {});
});

test("uploaded text is exact-span verified through the keyless MCP context tool", async () => {
  const compiled = await call(toolCall("compile", "continuity_compile_material", {
    question: "Who is Grandma, and does the gate open?",
    documents: [
      { name: "one.md", text: "Grandma (CHR-1) opens the gate." },
      { name: "two.md", text: "Grandma (CHR-2) does not open the gate." },
    ],
    claims: [
      { documentName: "one.md", quote: "Grandma (CHR-1) opens the gate.", claimKind: "observed", subject: "Grandma", predicate: "open", object: "gate", polarity: "positive" },
      { documentName: "two.md", quote: "Grandma (CHR-2) does not open the gate.", claimKind: "observed", subject: "Grandma", predicate: "open", object: "gate", polarity: "negative" },
    ],
    entityMentions: [
      { documentName: "one.md", quote: "Grandma (CHR-1) opens the gate.", mention: "Grandma", explicitId: "CHR-1", entityType: "character" },
      { documentName: "two.md", quote: "Grandma (CHR-2) does not open the gate.", mention: "Grandma", explicitId: "CHR-2", entityType: "character" },
    ],
  }));

  assert.equal(compiled.body.result.isError, false);
  assert.equal(compiled.body.result.structuredContent.contractVersion, "continuity.mcp.v1");
  assert.equal(compiled.body.result.structuredContent.routerVersion, "3.3.0");
  assert.equal(compiled.body.result.structuredContent.coverage.completeForProjectCorpus, false);
  assert.equal(compiled.body.result.structuredContent.claims.length, 2);
  assert.equal(compiled.body.result.structuredContent.entities.every((entity) => entity.resolution === "ambiguous"), true);
  assert.equal(compiled.body.result.structuredContent.conflicts.length, 1);
  assert.equal(compiled.body.result.structuredContent.route.graphUsed, true);
  assert.ok(compiled.body.result.structuredContent.route.validators.length <= 4);
});

test("the public-repository MCP tool uses anonymous bounded GitHub reads and pins the commit", async () => {
  const previousFetch = globalThis.fetch;
  const commit = "a".repeat(40);
  const tree = "b".repeat(40);
  const blob = "c".repeat(40);
  const source = "The payment resolver emits grandma-surgery-funded after $47,000 is paid.";
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), authorization: new Headers(init.headers).get("authorization") });
    if (String(url).includes("/commits/HEAD")) {
      return Response.json({ sha: commit, commit: { tree: { sha: tree }, committer: { date: "2026-07-20T00:00:00Z" } } });
    }
    if (String(url).includes(`/git/trees/${tree}`)) {
      return Response.json({
        tree: [{ path: "canon/payment.md", type: "blob", mode: "100644", sha: blob, size: new TextEncoder().encode(source).byteLength }],
        truncated: false,
      });
    }
    if (String(url).includes(`/git/blobs/${blob}`)) {
      return Response.json({ content: btoa(source), encoding: "base64", size: new TextEncoder().encode(source).byteLength, sha: blob });
    }
    throw new Error(`Unexpected URL ${url}`);
  };
  try {
    const inspected = await call(toolCall("repo", "continuity_inspect_public_repository", {
      repository: "example/public-story",
      question: "What produces grandma-surgery-funded?",
    }));

    assert.equal(inspected.body.result.isError, false);
    assert.equal(inspected.body.result.structuredContent.pinnedCommit, commit);
    assert.equal(inspected.body.result.structuredContent.excerpts.length, 1);
    assert.match(inspected.body.result.structuredContent.excerpts[0].locator, new RegExp(commit));
    assert.ok(calls.length <= 8);
    assert.ok(calls.every((item) => item.authorization === null), "the anonymous public tool must not use a server GitHub credential");
  } finally {
    globalThis.fetch = previousFetch;
  }
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

test("a natural capability question escalates to the bounded VCS dependency proof", async () => {
  const result = await call(toolCall("earn", "continuity_answer_question", {
    projectId: "vcs-demo",
    projectRevision: VCS_DEMO_REVISION,
    question: "Can the player earn $47,000 in the prototype?",
  }));

  assert.equal(result.body.result.isError, false);
  assert.equal(result.body.result.structuredContent.verdict, "UNREACHABLE");
  assert.equal(result.body.result.structuredContent.reachability.status, "unreachable_within_scope");
  assert.ok(result.body.result.structuredContent.dependencies.some(
    (edge) => edge.claimKey === "producer:grandma-surgery-funded" && edge.status === "blocked",
  ));
  assert.match(result.body.result.structuredContent.answer, /completion path is missing|no transition/i);
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
