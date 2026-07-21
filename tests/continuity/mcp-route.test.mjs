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
    assert.equal(tool._meta["continuity/routerVersion"], "3.8.0");
    if (tool.inputSchema.properties.projectId) {
      assert.equal(tool.inputSchema.properties.projectId.maxLength, 128);
    }
  }
  const compileTool = listed.body.result.tools.find((tool) => tool.name === "continuity_compile_material");
  const repositoryTool = listed.body.result.tools.find((tool) => tool.name === "continuity_inspect_public_repository");
  const reviewedAnswerTool = listed.body.result.tools.find((tool) => tool.name === "continuity_answer_question");
  assert.equal(compileTool.inputSchema.properties.claims.items.properties.object.minLength, 0);
  assert.equal(compileTool._meta["continuity/entityPackageVersion"], "continuity.entity-package.v1");
  assert.equal(compileTool._meta["continuity/identityLinkPackageVersion"], "continuity.identity-links.v1");
  assert.equal(compileTool._meta["continuity/domainProfileVersion"], "continuity.domain-profile.v1");
  assert.equal(compileTool._meta["continuity/reviewedKnowledgeVersion"], "continuity.reviewed-knowledge.v1");
  assert.equal(compileTool._meta["continuity/knowledgeSnapshotVersion"], "continuity.knowledge-snapshot.v1");
  assert.equal(compileTool.outputSchema.properties.entityPackage.additionalProperties, false);
  assert.equal(compileTool.outputSchema.properties.identityLinks.additionalProperties, false);
  assert.equal(compileTool.outputSchema.properties.domainProfile.additionalProperties, false);
  assert.equal(compileTool.outputSchema.properties.reviewedKnowledge.additionalProperties, false);
  assert.equal(compileTool.outputSchema.properties.knowledgeSnapshot.additionalProperties, false);
  assert.equal(compileTool.outputSchema.properties.entityPackage.properties.mentions.items.additionalProperties, false);
  assert.deepEqual(
    compileTool.outputSchema.properties.entityPackage.properties.mentions.items.properties.coordinateSystem.enum,
    ["utf16_code_units"],
  );
  assert.deepEqual(compileTool.inputSchema.properties.claims.items.properties.frameArity.enum, ["transitive", "intransitive"]);
  assert.deepEqual(compileTool.inputSchema.properties.entityMentions.items.properties.identityProfile.enum,
    ["natural_language", "case_sensitive_symbol", "opaque_identifier"]);
  assert.ok(compileTool.inputSchema.properties.knowledgeReview);
  assert.ok(compileTool.inputSchema.properties.previousSnapshot);
  assert.equal(compileTool.inputSchema.properties.knowledgeReview.properties.identityDecisions.maxItems, 128);
  assert.equal(compileTool.inputSchema.properties.knowledgeReview.properties.parameterDecisions.maxItems, 128);
  assert.equal(compileTool.inputSchema.properties.knowledgeReview.properties.validatorDecisions.maxItems, 32);
  assert.equal(compileTool.inputSchema.properties.previousSnapshot.properties.documents.maxItems, 256);
  assert.deepEqual(compileTool.inputSchema.properties.snapshotMode.enum, ["delta_packet", "complete_packet"]);
  assert.match(compileTool.description, /empty object requires frameArity intransitive/i);
  assert.match(compileTool.description, /relation requires an exact cue and two accepted endpoint spans/i);
  assert.match(initialized.body.result.instructions, /copy subject, predicate, and any non-empty object byte-for-byte/i);
  assert.match(initialized.body.result.instructions, /omit explicitId unless that exact ID occurs/i);
  assert.match(initialized.body.result.instructions, /prefer entityPackage and obey its ambiguity sets and QA action-safety flags/i);
  assert.match(initialized.body.result.instructions, /identityLinks are suggest-only/i);
  assert.match(initialized.body.result.instructions, /domainProfile is an inactive schema-on-read proposal/i);
  assert.match(initialized.body.result.instructions, /caller-attested rather than authenticated project canon/i);
  assert.match(initialized.body.result.instructions, /GitHub excerpts are always a delta/i);
  assert.match(initialized.body.result.instructions, /never treat ambient ChatGPT attachments, Codex working-directory files/i);
  assert.match(initialized.body.result.instructions, /scopeReceipt/i);
  assert.match(repositoryTool.description, /multiple project scopes/i);
  assert.equal(repositoryTool.title, "Ask about a public GitHub repository");
  assert.match(repositoryTool.description, /if the user says only 'this repository', ask them for the URL/i);
  assert.ok(repositoryTool.inputSchema.properties.projectScope);
  assert.ok(compileTool.inputSchema.properties.sourceContext);
  assert.match(reviewedAnswerTool.description, /Vibe Code Simulator example only/i);

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
  assert.equal(compiled.body.result.structuredContent.routerVersion, "3.8.0");
  assert.equal(compiled.body.result.structuredContent.coverage.completeForProjectCorpus, false);
  assert.equal(compiled.body.result.structuredContent.claims.length, 2);
  assert.equal(compiled.body.result.structuredContent.entities.every((entity) => entity.resolution === "ambiguous"), true);
  assert.equal(compiled.body.result.structuredContent.entityPackage.version, "continuity.entity-package.v1");
  assert.equal(compiled.body.result.structuredContent.entityPackage.mentions.length, 2);
  assert.equal(compiled.body.result.structuredContent.entityPackage.entities.length, 2);
  assert.equal(compiled.body.result.structuredContent.entityPackage.ambiguitySets.length, 1);
  assert.equal(compiled.body.result.structuredContent.entityPackage.qa.safeForAutomaticIdentityMerge, false);
  assert.equal(compiled.body.result.structuredContent.entityPackage.qa.safeForProjectCanonPromotion, false);
  assert.equal(compiled.body.result.structuredContent.identityLinks.version, "continuity.identity-links.v1");
  assert.equal(compiled.body.result.structuredContent.identityLinks.qa.safeForAutomaticMerge, false);
  assert.equal(compiled.body.result.structuredContent.domainProfile.version, "continuity.domain-profile.v1");
  assert.equal(compiled.body.result.structuredContent.domainProfile.activated, false);
  assert.equal(compiled.body.result.structuredContent.reviewedKnowledge.version, "continuity.reviewed-knowledge.v1");
  assert.equal(compiled.body.result.structuredContent.reviewedKnowledge.status, "not_submitted");
  assert.equal(compiled.body.result.structuredContent.knowledgeSnapshot.version, "continuity.knowledge-snapshot.v1");
  assert.equal(compiled.body.result.structuredContent.knowledgeSnapshot.coverage.completeForProjectCorpus, false);
  assert.equal(compiled.body.result.structuredContent.conflicts.length, 1);
  assert.equal(compiled.body.result.structuredContent.route.graphUsed, true);
  assert.ok(compiled.body.result.structuredContent.route.validators.length <= 4);
});

test("the compile tool supports a fingerprint-bound review and snapshot round trip", async () => {
  const argumentsValue = {
    question: "Are Asteria and Asterai the same person, and should payments conserve cash?",
    documents: [{ name: "chapter.md", text: "Asteria pays $50. Later, Asterai speaks." }],
    claims: [{
      documentName: "chapter.md", quote: "Asteria pays $50.", claimKind: "observed",
      subject: "Asteria", predicate: "pays", object: "$50", polarity: "positive",
    }],
    entityMentions: [
      { documentName: "chapter.md", quote: "Asteria pays $50.", mention: "Asteria", entityType: "character" },
      { documentName: "chapter.md", quote: "Later, Asterai speaks.", mention: "Asterai", entityType: "character" },
    ],
  };
  const first = await call(toolCall("review-first", "continuity_compile_material", argumentsValue));
  const proposal = first.body.result.structuredContent;
  const link = proposal.identityLinks.candidateLinks[0];
  const canonical = proposal.entityPackage.entities.find((entity) => entity.aliases.includes("Asteria"));
  const parameter = proposal.domainProfile.candidateParameters.find((candidate) => candidate.kind === "resource");
  const validator = proposal.domainProfile.validatorCandidates.find((candidate) => candidate.validator === "resource_conservation");
  assert.ok(link && canonical && parameter && validator);

  const previousSnapshot = {
    version: proposal.knowledgeSnapshot.version,
    snapshotFingerprint: proposal.knowledgeSnapshot.snapshotFingerprint,
    sourceBinding: proposal.knowledgeSnapshot.sourceBinding,
    documents: proposal.knowledgeSnapshot.documents,
    componentFingerprints: proposal.knowledgeSnapshot.componentFingerprints,
  };
  const second = await call(toolCall("review-second", "continuity_compile_material", {
    ...argumentsValue,
    knowledgeReview: {
      reviewId: "director-pass-1",
      projectScope: "example-story",
      revision: "rev-1",
      reviewerRole: "director",
      identityPackageFingerprint: proposal.identityLinks.packageFingerprint,
      domainProfileFingerprint: proposal.domainProfile.profileFingerprint,
      identityDecisions: [{
        candidateLinkId: link.id, outcome: "accept_misspelling", basis: "human_review",
        canonicalEntityId: canonical.id, rationale: "The director confirms this spelling error.",
      }],
      parameterDecisions: [{ parameterId: parameter.id, decision: "approve", rationale: "Cash is a conserved resource." }],
      validatorDecisions: [{ validatorId: validator.id, decision: "approve", rationale: "Payments must balance." }],
      activateDomainProfile: true,
    },
    previousSnapshot,
    snapshotMode: "complete_packet",
  }));
  const reviewed = second.body.result.structuredContent;
  assert.equal(second.body.result.isError, false);
  assert.equal(reviewed.reviewedKnowledge.status, "accepted");
  assert.equal(reviewed.reviewedKnowledge.identityLedger.acceptedDecisions.length, 1);
  assert.equal(reviewed.reviewedKnowledge.identityLedger.canonicalGroups.length, 1);
  assert.equal(reviewed.reviewedKnowledge.domainConfiguration.activated, true);
  assert.equal(reviewed.reviewedKnowledge.review.authenticated, false);
  assert.equal(reviewed.reviewedKnowledge.review.projectCanon, false);
  assert.equal(reviewed.entityPackage.entities.length, 2, "reviewed projection must not rewrite source entities");
  assert.equal(reviewed.knowledgeSnapshot.comparison.status, "validated_previous_snapshot");
  assert.deepEqual(reviewed.knowledgeSnapshot.comparison.unchangedDocuments, ["chapter.md"]);
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
    assert.equal(inspected.body.result.structuredContent.scope.status, "resolved");
    assert.equal(inspected.body.result.structuredContent.scope.selected.rootPath, ".");
    assert.equal(inspected.body.result.structuredContent.excerpts.length, 1);
    assert.match(inspected.body.result.structuredContent.excerpts[0].locator, new RegExp(commit));
    assert.equal(inspected.body.result.structuredContent.scopeReceipt.repository, "example/public-story");
    assert.equal(inspected.body.result.structuredContent.scopeReceipt.pinnedCommit, commit);
    assert.equal(inspected.body.result.structuredContent.scopeReceipt.scope.rootPath, ".");
    assert.equal(inspected.body.result.structuredContent.scopeReceipt.excerpts.length, 1);
    assert.equal(inspected.body.result.structuredContent.scopeReceipt.trust, "integrity_check_only");
    assert.equal(inspected.body.result.structuredContent.scopeReceipt.grantsAuthority, false);

    const excerpts = inspected.body.result.structuredContent.excerpts;
    const compiled = await call(toolCall("repo-compile", "continuity_compile_material", {
      question: "What is the canon of this repository?",
      sourceContext: {
        kind: "public_github_excerpts",
        receipt: inspected.body.result.structuredContent.scopeReceipt,
      },
      documents: excerpts.map((excerpt) => ({ name: excerpt.path, text: excerpt.text })),
    }));
    assert.equal(compiled.body.result.isError, false);
    assert.equal(compiled.body.result.structuredContent.sourceKind, "public_github_excerpts");
    assert.equal(compiled.body.result.structuredContent.sourceContext.repository, "example/public-story");
    assert.equal(compiled.body.result.structuredContent.sourceContext.pinnedCommit, commit);

    const tamperedReceipt = structuredClone(inspected.body.result.structuredContent.scopeReceipt);
    tamperedReceipt.scope.label = "A different project";
    const tampered = await call(toolCall("repo-tampered", "continuity_compile_material", {
      question: "What is the canon of this repository?",
      sourceContext: { kind: "public_github_excerpts", receipt: tamperedReceipt },
      documents: excerpts.map((excerpt) => ({ name: excerpt.path, text: excerpt.text })),
    }));
    assert.equal(tampered.body.result.isError, true);
    assert.match(tampered.body.result.content[0].text, /repository_scope_mismatch/i);

    const crossScope = await call(toolCall("repo-cross-scope", "continuity_compile_material", {
      question: "What is the canon of this repository?",
      sourceContext: {
        kind: "public_github_excerpts",
        receipt: inspected.body.result.structuredContent.scopeReceipt,
      },
      documents: [
        ...excerpts.map((excerpt) => ({ name: excerpt.path, text: excerpt.text })),
        { name: "other-project/canon.md", text: "Unrelated canon." },
      ],
    }));
    assert.equal(crossScope.body.result.isError, true);
    assert.match(crossScope.body.result.content[0].text, /repository_scope_mismatch/i);
    assert.ok(calls.length <= 8);
    assert.ok(calls.every((item) => item.authorization === null), "the anonymous public tool must not use a server GitHub credential");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("an ambiguous public repository returns project choices but no excerpts or scope receipt", async () => {
  const previousFetch = globalThis.fetch;
  const commit = "d".repeat(40);
  const tree = "e".repeat(40);
  globalThis.fetch = async (url) => {
    if (String(url).includes("/commits/HEAD")) {
      return Response.json({ sha: commit, commit: { tree: { sha: tree } } });
    }
    if (String(url).includes(`/git/trees/${tree}`)) {
      return Response.json({
        tree: [
          { path: "apps/story-one/package.json", type: "blob", mode: "100644", sha: "1".repeat(40), size: 2 },
          { path: "apps/story-two/package.json", type: "blob", mode: "100644", sha: "2".repeat(40), size: 2 },
        ],
        truncated: false,
      });
    }
    throw new Error(`No blob should be read before project scope is selected: ${url}`);
  };
  try {
    const inspected = await call(toolCall("repo-ambiguous", "continuity_inspect_public_repository", {
      repository: "example/multiple-stories",
      question: "What is canon in this repository?",
    }));
    assert.equal(inspected.body.result.isError, false);
    assert.equal(inspected.body.result.structuredContent.scope.status, "ambiguous");
    assert.ok(inspected.body.result.structuredContent.scope.candidates.length >= 2);
    assert.ok(inspected.body.result.structuredContent.scope.candidates.some((scope) => scope.rootPath === "apps/story-one"));
    assert.ok(inspected.body.result.structuredContent.scope.candidates.some((scope) => scope.rootPath === "apps/story-two"));
    assert.equal(inspected.body.result.structuredContent.excerpts.length, 0);
    assert.equal(inspected.body.result.structuredContent.scopeReceipt, null);
    assert.match(inspected.body.result.content[0].text, /ask the user which one they mean/i);
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
    assert.equal(trace.body.result.structuredContent.truthStatus, "contradicted");
    assert.equal(trace.body.result.structuredContent.reachability.status, "unreachable_within_scope");
    assert.ok(trace.body.result.structuredContent.dependencies.some(
      (edge) => edge.claimKey === "producer:founder-personal-funds-47000" && edge.status === "blocked",
    ));
    assert.ok(trace.body.result.structuredContent.dependencies.some(
      (edge) => edge.claimKey === "producer:grandma-surgery-funded" && edge.status === "missing",
    ));
    assert.ok(trace.body.result.structuredContent.dependencies.some(
      (edge) => edge.claimKey === "consumer:grandma-surgery-funded" && edge.status === "blocked",
    ));
    assert.ok(trace.body.result.structuredContent.proposal.requiredChanges.some(
      (change) => /deducts \$47,000/i.test(change),
    ));
    assert.ok(trace.body.result.structuredContent.proposal.requiredChanges.some(
      (change) => /reload|repeated payment/i.test(change),
    ));

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
  assert.equal(result.body.result.structuredContent.truthStatus, "contradicted");
  assert.equal(result.body.result.structuredContent.reachability.status, "unreachable_within_scope");
  assert.ok(result.body.result.structuredContent.dependencies.some(
    (edge) => edge.claimKey === "producer:grandma-surgery-funded" && edge.status === "blocked",
  ));
  assert.match(result.body.result.structuredContent.answer, /completion path is missing|no transition/i);
});

test("reviewed VCS tools refuse to guess what a caller means by this folder", async () => {
  const result = await call(toolCall("scope", "continuity_answer_question", {
    question: "What is considered canon in this folder?",
  }));

  assert.equal(result.body.result.isError, true);
  assert.match(result.body.result.content[0].text, /project_scope_required/);
  assert.match(result.body.result.content[0].text, /public GitHub repository|attachment text/i);
});

test("material compilation refuses repository-wide questions without an inspected scope receipt", async () => {
  for (const sourceContext of [undefined, { kind: "direct_upload" }]) {
    const result = await call(toolCall(`compile-scope-${sourceContext ? "direct" : "missing"}`, "continuity_compile_material", {
      question: "What is the canon of this repository?",
      ...(sourceContext ? { sourceContext } : {}),
      documents: [{ name: "STORY_BIBLE.md", text: "The hero remains human." }],
    }));
    assert.equal(result.body.result.isError, true);
    assert.match(result.body.result.content[0].text, /repository_scope_receipt_required/i);
    assert.match(result.body.result.content[0].text, /explicit public GitHub repository/i);
  }
});

test("ordinary direct uploads remain compatible without a repository scope receipt", async () => {
  const result = await call(toolCall("compile-upload", "continuity_compile_material", {
    question: "Who remains human in this manuscript?",
    sourceContext: { kind: "direct_upload" },
    documents: [{ name: "manuscript.md", text: "Han remains human." }],
    entityMentions: [{ documentName: "manuscript.md", quote: "Han remains human.", mention: "Han", entityType: "character" }],
  }));
  assert.equal(result.body.result.isError, false);
  assert.equal(result.body.result.structuredContent.sourceKind, "uploaded_text");
  assert.equal(result.body.result.structuredContent.sourceContext.kind, "direct_upload");
  assert.equal(result.body.result.structuredContent.sourceContext.repository, null);
});

test("the public MCP answers the central VCS build question with proof and a minimal repair", async () => {
  const result = await call(toolCall("save-grandma", "continuity_answer_question", {
    question: "Can the player actually save Grandma by Day 24 in the current version of the game?",
  }));

  assert.equal(result.body.result.isError, false);
  const output = result.body.result.structuredContent;
  assert.equal(output.verdict, "UNREACHABLE");
  assert.equal(output.truthStatus, "contradicted");
  assert.equal(output.reachability.status, "unreachable_within_scope");
  assert.match(output.answer, /current playable prototype|current build|prototype/i);
  assert.ok(output.citations.length >= 3);
  assert.ok(output.dependencies.some((edge) =>
    edge.claimKey === "producer:grandma-surgery-funded" && edge.status === "missing"));
  assert.ok(output.proposal.requiredChanges.some((change) => /hospital-payment|hospital payment/i.test(change)));
  assert.ok(output.proposal.requiredChanges.some((change) => /persist/i.test(change)));
  assert.ok(output.proposal.requiredChanges.some((change) => /test/i.test(change)));
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
