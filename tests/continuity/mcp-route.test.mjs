import assert from "node:assert/strict";
import test from "node:test";

import { POST, reservePublicRepositoryInspection } from "../../app/mcp/route.ts";
import { continuityMcpTools } from "../../lib/continuity/mcp-contract.ts";
import { VCS_DEMO_REVISION } from "../../lib/continuity/demo.ts";

function request(payload, headers = {}, url = "https://continuity.example/mcp") {
  return new Request(url, {
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
    if (["continuity_answer_question", "continuity_trace_dependencies", "continuity_analyze_change"].includes(tool.name)) {
      assert.deepEqual(tool.inputSchema.required,
        continuityMcpTools[tool.name].inputSchema.required.filter(
          (key) => key !== "projectId" && key !== "projectRevision",
        ));
      assert.equal(tool.inputSchema.properties.projectId.const, "vcs-demo");
      assert.equal(tool.inputSchema.properties.projectId.default, "vcs-demo");
      assert.equal(tool.inputSchema.properties.projectRevision.const, VCS_DEMO_REVISION);
      assert.equal(tool.inputSchema.properties.projectRevision.default, VCS_DEMO_REVISION);
    } else {
      assert.deepEqual(tool.inputSchema, continuityMcpTools[tool.name].inputSchema);
    }
    assert.equal(tool.outputSchema.additionalProperties, false);
    assert.ok(tool.outputSchema.required.includes("coverage"));
    assert.equal(tool.annotations.readOnlyHint, true);
    assert.equal(tool.annotations.openWorldHint, tool.name === "continuity_inspect_public_repository");
    assert.equal(tool.annotations.idempotentHint, tool.name !== "continuity_inspect_public_repository");
    assert.deepEqual(tool.securitySchemes, [{ type: "noauth" }]);
    assert.deepEqual(tool._meta.securitySchemes, tool.securitySchemes);
    assert.equal(tool._meta["continuity/contractVersion"], "continuity.mcp.v1");
    assert.equal(tool._meta["continuity/routerVersion"], "3.3.0");
    if (tool.inputSchema.properties.projectId) {
      assert.equal(tool.inputSchema.properties.projectId.maxLength, 128);
    }
  }
  const compileTool = listed.body.result.tools.find((tool) => tool.name === "continuity_compile_material");
  assert.equal(compileTool.inputSchema.properties.claims.items.properties.object.minLength, 0);
  assert.deepEqual(compileTool.inputSchema.properties.claims.items.properties.frameArity.enum, ["transitive", "intransitive"]);
  assert.match(compileTool.description, /empty object requires frameArity intransitive/i);
  assert.match(compileTool.description, /relation requires an exact cue and two accepted endpoint spans/i);
  assert.match(initialized.body.result.instructions, /copy subject, predicate, and any non-empty object byte-for-byte/i);
  assert.match(initialized.body.result.instructions, /omit explicitId unless that exact ID occurs/i);

  const ping = await call({ jsonrpc: "2.0", id: "ping", method: "ping" });
  assert.deepEqual(ping.body.result, {});
});

test("MCP initialization negotiates current and legacy client protocol versions", async () => {
  for (const protocolVersion of ["2025-11-25", "2025-06-18", "2025-03-26"]) {
    const initialized = await POST(request({
      jsonrpc: "2.0",
      id: `init-${protocolVersion}`,
      method: "initialize",
      params: { protocolVersion, capabilities: {}, clientInfo: { name: "compatibility-test", version: "1" } },
    }, { "MCP-Protocol-Version": protocolVersion }));
    const body = await initialized.json();
    assert.equal(initialized.status, 200);
    assert.equal(body.result.protocolVersion, protocolVersion);

    const listed = await POST(request({
      jsonrpc: "2.0",
      id: `list-${protocolVersion}`,
      method: "tools/list",
      params: {},
    }, { "MCP-Protocol-Version": protocolVersion }));
    assert.equal(listed.status, 200);
    assert.equal((await listed.json()).result.tools.length, 5);
  }

  const futureClient = await POST(request({
    jsonrpc: "2.0",
    id: "future-client",
    method: "initialize",
    params: { protocolVersion: "2099-01-01", capabilities: {}, clientInfo: { name: "future-test", version: "1" } },
  }, { "MCP-Protocol-Version": "" }));
  assert.equal(futureClient.status, 200);
  assert.equal((await futureClient.json()).result.protocolVersion, "2025-11-25");
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

test("unrelated software-release material admits exact transitive and intransitive claims without invented IDs", async () => {
  const policy = "Release 3.3 may deploy only after migration M7 completes and test suite T9 passes.";
  const deployment = "Release 3.3 deployed on July 20.";
  const migration = "Migration M7 was not completed.";
  const testResult = "Test suite T9 passed.";
  const compiled = await call(toolCall("software", "continuity_compile_material", {
    question: "Is Release 3.3 causally ready to deploy?",
    documents: [
      { name: "policy.md", text: policy, authority: "reference" },
      { name: "release.log", text: `${deployment}\n${migration}\n${testResult}`, authority: "production_record" },
    ],
    claims: [
      {
        documentName: "policy.md", quote: policy, claimKind: "normative",
        subject: "Release 3.3", predicate: "may deploy only after",
        object: "migration M7 completes and test suite T9 passes", polarity: "positive",
      },
      {
        documentName: "policy.md", quote: "Release 3.3 may deploy", claimKind: "normative",
        subject: "Release 3.3", predicate: "deploy", object: "", frameArity: "intransitive", polarity: "positive",
      },
      {
        documentName: "policy.md", quote: "migration M7 completes", claimKind: "normative",
        subject: "migration M7", predicate: "completes", object: "", frameArity: "intransitive", polarity: "positive",
      },
      {
        documentName: "policy.md", quote: "test suite T9 passes", claimKind: "normative",
        subject: "test suite T9", predicate: "passes", object: "", frameArity: "intransitive", polarity: "positive",
      },
      {
        documentName: "release.log", quote: deployment, claimKind: "observed",
        subject: "Release 3.3", predicate: "deployed", object: "on July 20", polarity: "positive",
      },
      {
        documentName: "release.log", quote: migration, claimKind: "observed",
        subject: "Migration M7", predicate: "completed", object: "", frameArity: "intransitive", polarity: "negative",
      },
      {
        documentName: "release.log", quote: testResult, claimKind: "tested",
        subject: "Test suite T9", predicate: "passed", object: "", frameArity: "intransitive", polarity: "positive",
      },
    ],
    relations: [
      { relation: "precondition", evidenceClaimIndex: 0, fromClaimIndex: 2, toClaimIndex: 1, cue: "only after" },
      { relation: "precondition", evidenceClaimIndex: 0, fromClaimIndex: 3, toClaimIndex: 1, cue: "only after" },
    ],
    entityMentions: [
      { documentName: "policy.md", quote: policy, mention: "Release 3.3", entityType: "software_release" },
      { documentName: "policy.md", quote: policy, mention: "migration M7", entityType: "migration" },
      { documentName: "policy.md", quote: policy, mention: "test suite T9", entityType: "test_suite" },
    ],
  }));

  const result = compiled.body.result.structuredContent;
  assert.equal(compiled.body.result.isError, false);
  assert.equal(result.claims.length, 7);
  assert.equal(result.claims.find((claim) => claim.quote === policy)?.authority, "reference");
  assert.equal(result.claims.filter((claim) => claim.authority === "production_record").length, 3);
  assert.equal(result.entities.length, 3);
  assert.equal(result.entities.every((entity) => entity.authority === "reference"), true);
  assert.equal(result.relations.length, 2);
  assert.equal(result.rejected.length, 0);
  assert.equal(result.route.path, "question_graph");
  assert.equal(result.route.graphUsed, true);
  assert.ok(result.graph.nodes.some((node) => node.kind === "constraint"));
  assert.equal(result.graph.edges.filter((edge) => edge.relation === "precondition").length, 2);
  assert.ok(result.relations.every((relation) => relation.truthStatus === "source_assertion" && relation.materialized));
  assert.ok(result.claims.some((claim) => claim.polarity === "negative"));
  assert.equal(result.entities.every((entity) => entity.resolution === "candidate"), true);
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

test("public repository inspection consumes one durable service-global reservation", async () => {
  const calls = [];
  const decision = await reservePublicRepositoryInspection({
    async consumeUsage(...args) {
      calls.push(args);
      return { allowed: true, count: 1, limit: 7, retryAfterSeconds: 86_400 };
    },
  }, 7);

  assert.equal(decision.allowed, true);
  assert.deepEqual(calls, [[
    "global:mcp:public-github",
    "inspect_public_repository",
    7,
    86_400,
  ]]);
  await assert.rejects(
    reservePublicRepositoryInspection({ consumeUsage: async () => decision }, 0),
    /integer from 1 through 500/i,
  );
});

test("a remote repository inspection fails before GitHub when durable quota storage is unavailable", async () => {
  const previousFetch = globalThis.fetch;
  let providerCalled = false;
  globalThis.fetch = async () => {
    providerCalled = true;
    throw new Error("GitHub must not be called without a durable reservation");
  };
  try {
    const response = await POST(request(toolCall("budget", "continuity_inspect_public_repository", {
      repository: "example/public-story",
      question: "Who is Grandma?",
    }), {}, "https://continuity.invalid/mcp"));
    const body = await response.json();
    assert.equal(body.result.isError, true);
    assert.match(body.result.content[0].text, /service_budget_unavailable/);
    assert.equal(providerCalled, false);
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

  const legacyInitialize = await call({
    jsonrpc: "2.0",
    id: "init-old",
    method: "initialize",
    params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test", version: "1" } },
  });
  assert.equal(legacyInitialize.response.status, 200);
  assert.equal(legacyInitialize.body.result.protocolVersion, "2024-11-05");

  const mismatchedInitializeHeader = await POST(request({
    jsonrpc: "2.0",
    id: "init-header-old",
    method: "initialize",
    params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } },
  }, { "MCP-Protocol-Version": "2023-01-01" }));
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
    { "MCP-Protocol-Version": "2023-01-01" },
  ));
  assert.equal(unsupportedHeaderResponse.status, 400);
  assert.match((await unsupportedHeaderResponse.json()).error.message, /unsupported MCP-Protocol-Version/i);
});
