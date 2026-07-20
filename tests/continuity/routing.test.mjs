import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  classifyRepositoryPath,
  DEFAULT_AUTHORITY_POLICY,
} from "../../lib/continuity/policy/default.ts";
import {
  analysisBudgetFor,
  inferFocusedClaimKinds,
  inferMinimumAnalysisMode,
  planRetrieval,
  presentationDepthFor,
  routeEvidence,
} from "../../lib/continuity/routing/authority-router.ts";
import { revisionMembershipDigest } from "../../lib/continuity/completeness-boundary.ts";

function evidence(overrides = {}) {
  return {
    id: "EV-1",
    projectId: "project-a",
    sourceId: "SRC-1",
    sourceVersionId: "SRC-1@v1",
    title: "README.md",
    locator: "README.md",
    text: "A project statement.",
    score: 0.8,
    authority: "reference",
    ...overrides,
  };
}

function materialBoundary(chunk, projectRevision, sourceVersionIds, claimKinds) {
  return {
    version: "continuity.completeness-boundary.v1",
    boundaryId: `BOUNDARY-${chunk.id}`,
    scope: { kind: "material_claim_kinds", claimKinds },
    revision: {
      projectRevision,
      sourceVersionIds,
      membershipDigest: revisionMembershipDigest(projectRevision, sourceVersionIds),
    },
  };
}

function trustedRegistry(chunk, boundary, projectRevision = boundary.revision.projectRevision) {
  return {
    version: "continuity.trusted-completeness-registry.v1",
    projectId: chunk.projectId,
    projectRevision,
    grants: [{
      boundary,
      evidenceBinding: {
        evidenceId: chunk.id,
        sourceId: chunk.sourceId,
        sourceVersionId: chunk.sourceVersionId,
        claimKey: chunk.claimKey ?? null,
        polarity: chunk.polarity ?? null,
      },
    }],
  };
}

test("revision membership digests use canonical SHA-256", () => {
  const members = ["SRC-B@v2", "SRC-A@v1"];
  const canonical = JSON.stringify(["revision-4", "SRC-A@v1", "SRC-B@v2"]);
  const expected = `sha256:${createHash("sha256").update(canonical).digest("hex")}`;
  assert.equal(revisionMembershipDigest("revision-4", members), expected);
});

test("path routing distinguishes intent, implementation, tests, archives, and evaluation material", () => {
  assert.equal(classifyRepositoryPath("docs/PROTOTYPE-CONTRACT.md").role, "intent");
  assert.equal(classifyRepositoryPath("src/story-engine.ts").role, "implementation");
  assert.equal(classifyRepositoryPath("tests/story-engine.test.ts").role, "test");
  assert.equal(classifyRepositoryPath("docs/archive/old-plan.md").role, "archive");
  assert.equal(classifyRepositoryPath("benchmarks/gold-key.json").role, "evaluation");
  assert.equal(classifyRepositoryPath("archive/old.md").role, "archive");
  assert.equal(classifyRepositoryPath("proposals/new.md").role, "proposal");
  assert.equal(classifyRepositoryPath("decisions/001.md").role, "decision");
  assert.equal(classifyRepositoryPath("tests/helper.ts").role, "test");
  assert.equal(classifyRepositoryPath("evals/case.md").role, "evaluation");
  assert.equal(classifyRepositoryPath("logs/run.md").role, "observation");
});

test("path routing recognizes lifecycle-bearing basenames and narrative data files", () => {
  assert.deepEqual(
    ["DRAFT.md", "story/chapter.DRAFT.yaml", "data/proposal.csv"].map((path) => classifyRepositoryPath(path).role),
    ["proposal", "proposal", "proposal"],
  );
  assert.deepEqual(
    ["ARCHIVED.md", "story/chapter.archived.yaml", "data/legacy-events.csv"].map((path) => classifyRepositoryPath(path).role),
    ["archive", "archive", "archive"],
  );
  assert.deepEqual(
    ["canon/STORY_BIBLE.yaml", "story/chapters/chapter-001.yaml", "characters/cast.csv", "data/events.json"]
      .map((path) => classifyRepositoryPath(path).role),
    ["intent", "intent", "intent", "intent"],
  );
  assert.equal(classifyRepositoryPath("config/events.yaml").role, "configuration");
  assert.equal(classifyRepositoryPath("src/story/runtime.ts").role, "implementation");
  assert.deepEqual(
    ["STORY_BIBLE.pdf", "novel.epub", "screenplay.docx", "chapter-001.md"]
      .map((path) => classifyRepositoryPath(path).role),
    ["intent", "intent", "intent", "intent"],
  );
});

test("evaluation artifacts are excluded even when stored under ordinary documentation or fixture paths", () => {
  assert.deepEqual(
    [
      "docs/CANONFORGE-MVP-EVALS.md",
      "BENCHMARK.md",
      "docs/model-evaluation.md",
      "src/__fixtures__/expected-output.json",
      "reviews/answer-key-v2.yaml",
    ].map((path) => classifyRepositoryPath(path).role),
    ["evaluation", "evaluation", "evaluation", "evaluation", "evaluation"],
  );
});

test("numeric story position enforces parseable narrative time labels", () => {
  const oldFact = evidence({ id: "EV-DAY-1", claimKey: "fact:active", validFrom: "Day 1" });
  const futureRetcon = evidence({
    id: "EV-DAY-10",
    sourceId: "SRC-DAY-10",
    authority: "retcon",
    role: "intent",
    lifecycle: "active",
    claimKinds: ["normative"],
    claimKey: "fact:active",
    validFrom: "Day 10",
    supersedesEvidenceIds: [oldFact.id],
  });

  const early = routeEvidence([oldFact, futureRetcon], {
    projectId: "project-a",
    question: "What is true on Day 1?",
    storyPosition: 1,
  });
  assert.deepEqual(early.evidence.map((item) => item.id), [oldFact.id]);

  const later = routeEvidence([oldFact, futureRetcon], {
    projectId: "project-a",
    question: "What is true on Day 10?",
    storyPosition: 10,
  });
  assert.deepEqual(later.evidence.map((item) => item.id), [futureRetcon.id]);
});

test("a planning horizon includes evidence that becomes valid after the starting position", () => {
  const futureProducer = evidence({
    id: "EV-DAY-20-PRODUCER",
    sourceId: "SRC-DAY-20",
    role: "implementation",
    authority: "production",
    claimKinds: ["causal"],
    claimKey: "producer:goal",
    validFrom: "Day 20",
  });

  const asOfDayEight = routeEvidence([futureProducer], {
    projectId: "project-a",
    question: "What exists on Day 8?",
    storyPosition: 8,
  });
  assert.equal(asOfDayEight.evidence.length, 0);

  const throughDayTwentyFour = routeEvidence([futureProducer], {
    projectId: "project-a",
    question: "Can the goal occur by Day 24?",
    analysisMode: "trace_dependencies",
    storyPosition: 8,
    targetPosition: 24,
  });
  assert.equal(throughDayTwentyFour.evidence.some((item) => item.id === futureProducer.id), true);
});

test("numeric temporal scopes do not collapse different axes", () => {
  const dayTen = evidence({ id: "EV-DAY-10", validFrom: "Day 10", temporalAxis: "day" });
  const chapterTen = evidence({ id: "EV-CHAPTER-10", sourceId: "SRC-CHAPTER", validFrom: "Chapter 10", temporalAxis: "chapter" });

  const dayQuery = routeEvidence([chapterTen, dayTen], {
    projectId: "project-a",
    question: "What is true by Day 12?",
    timeScope: "Day 1 through Day 12",
    temporalAxis: "day",
    storyPosition: 1,
    targetPosition: 12,
  });

  assert.deepEqual(dayQuery.evidence.map((item) => item.id), [dayTen.id]);
  assert.match(dayQuery.route.diagnostics.join("\n"), /outside the requested temporal scope/i);
});

test("scope and lifecycle gates run before duplicate ID reconciliation", () => {
  const result = routeEvidence([
    evidence({ id: "EV-SHARED", projectId: "project-b", text: "Foreign duplicate.", score: 1 }),
    evidence({ id: "EV-SHARED", title: "benchmarks/gold-key.md", locator: "benchmarks/gold-key.md", text: "Evaluation duplicate.", score: 1 }),
    evidence({ id: "EV-SHARED", validToOrder: 4, text: "Expired duplicate.", score: 1 }),
    evidence({ id: "EV-SHARED", lifecycle: "superseded", text: "Superseded duplicate.", score: 1 }),
    evidence({ id: "EV-SHARED", title: "src/current.ts", locator: "src/current.ts", text: "Valid current evidence.", score: 0.4 }),
  ], {
    projectId: "project-a",
    question: "What is current?",
    storyPosition: 5,
  });

  assert.deepEqual(result.evidence.map((item) => item.text), ["Valid current evidence."]);
  assert.match(result.route.diagnostics.join("\n"), /cross-project/i);
  assert.match(result.route.diagnostics.join("\n"), /outside the requested temporal scope/i);
  assert.match(result.route.diagnostics.join("\n"), /already-superseded/i);
  assert.match(result.route.diagnostics.join("\n"), /evaluation or answer-key/i);
});

test("differing payloads under one evidence ID are reconciled deterministically and diagnosed", () => {
  const result = routeEvidence([
    evidence({
      id: "EV-COLLISION",
      title: "src/low.ts",
      locator: "src/low.ts",
      text: "Lower-ranked payload.",
      score: 0.1,
      closedWorld: true,
      flags: ["possible_prompt_injection"],
      retrievalLaneIds: ["authority"],
      supersedesSourceId: "SRC-OLD",
      supersessionScope: "source",
    }),
    evidence({
      id: "EV-COLLISION",
      title: "src/high.ts",
      locator: "src/high.ts",
      text: "Higher-ranked payload.",
      score: 0.95,
      retrievalLaneIds: ["execution"],
    }),
  ], { projectId: "project-a", question: "What is implemented?" });

  assert.equal(result.evidence.length, 1);
  assert.equal(result.evidence[0].text, "Higher-ranked payload.");
  assert.equal(result.evidence[0].closedWorld, false);
  assert.deepEqual(result.evidence[0].supersedesEvidenceIds, []);
  assert.ok(result.evidence[0].flags.includes("possible_prompt_injection"));
  assert.deepEqual(result.evidence[0].retrievalLaneIds, ["execution"]);
  assert.match(result.route.diagnostics.join("\n"), /Evidence ID collision EV-COLLISION/i);
});

test("analysis routing enforces its evidence budget even with many contradictions", () => {
  const fragments = Array.from({ length: 30 }, (_, index) => [
    evidence({ id: `EV-${index}-YES`, claimKey: `claim-${index}`, polarity: "positive", score: 1 - index / 100 }),
    evidence({ id: `EV-${index}-NO`, claimKey: `claim-${index}`, polarity: "negative", score: 0.99 - index / 100 }),
  ]).flat();

  const result = routeEvidence(fragments, { projectId: "project-a", question: "Which claims conflict?" });

  assert.ok(result.evidence.length <= 24);
  assert.equal(result.route.coverage.truncated, true);
  assert.equal(result.route.coverage.closure, "open");
});

test("quarantined context cannot satisfy a lane or crowd admissible evidence out of the budget", () => {
  const quarantined = Array.from({ length: 20 }, (_, index) => evidence({
    id: `EV-QUARANTINED-${index}`,
    sourceId: `SRC-QUARANTINED-${index}`,
    role: "reference",
    lifecycle: "active",
    claimKinds: ["identity"],
    score: 1,
    flags: ["possible_prompt_injection"],
  }));
  const safe = evidence({
    id: "EV-SAFE-IDENTITY",
    sourceId: "SRC-SAFE-IDENTITY",
    role: "reference",
    lifecycle: "active",
    claimKinds: ["identity"],
    score: 0.1,
  });

  const result = routeEvidence([...quarantined, safe], {
    projectId: "project-a",
    question: "Who is Mara?",
  });

  assert.equal(result.evidence.some((chunk) => chunk.id === safe.id), true);
  assert.equal(result.route.availableByRole.reference, 1);
  assert.equal(result.route.selectedByRole.reference, 1);
});

test("analysis routing excludes answer keys and opens only the explicit implementation and test boundaries", () => {
  const result = routeEvidence([
    evidence({ id: "EV-INTENT", title: "docs/PROTOTYPE-CONTRACT.md", locator: "docs/PROTOTYPE-CONTRACT.md", authority: "canon", score: 0.9 }),
    evidence({ id: "EV-CODE", title: "src/story-engine.ts", locator: "src/story-engine.ts", authority: "production", score: 0.55 }),
    evidence({ id: "EV-TEST", title: "tests/story-engine.test.ts", locator: "tests/story-engine.test.ts", authority: "production", score: 0.5 }),
    evidence({ id: "EV-GOLD", title: "benchmarks/gold-key.json", locator: "benchmarks/gold-key.json", text: "The expected answer is yes.", score: 1 }),
    evidence({ id: "EV-FOREIGN", projectId: "project-b", text: "private evidence", score: 1 }),
  ], { projectId: "project-a", question: "What is implemented and tested?" });

  assert.deepEqual(new Set(result.evidence.map((item) => item.id)), new Set(["EV-CODE", "EV-TEST"]));
  assert.deepEqual(result.route.claimKinds, ["implemented", "tested"]);
  assert.equal(result.evidence.some((item) => item.text.includes("expected answer")), false);
  assert.equal(result.evidence.some((item) => item.text.includes("private evidence")), false);
  assert.match(result.route.diagnostics.join("\n"), /Excluded 1 evaluation/i);
  assert.match(result.route.diagnostics.join("\n"), /cross-project/i);
});

test("a claimed complete corpus requires closed-world evidence for every material answer boundary", () => {
  const open = routeEvidence([
    evidence({ id: "EV-OPEN", title: "src/story-engine.ts", locator: "src/story-engine.ts", authority: "production" }),
  ], {
    projectId: "project-a",
    question: "Does a producer exist?",
    coverage: { scope: "repository snapshot", complete: true },
  });
  assert.equal(open.route.coverage.trustedComplete, false);

  const closedRecord = evidence({
      id: "EV-CLOSED",
      title: "config/runtime.yaml",
      locator: "config/runtime.yaml",
      authority: "production",
      role: "configuration",
      lifecycle: "active",
      claimKinds: ["configured"],
      closedWorld: true,
    });
  closedRecord.completenessBoundary = materialBoundary(
    closedRecord,
    "revision-config-1",
    [closedRecord.sourceVersionId],
    ["configured"],
  );
  const closedRequest = {
    projectId: "project-a",
    projectRevision: "revision-config-1",
    sourceVersionIds: [closedRecord.sourceVersionId],
    question: "What value is configured?",
    coverage: { scope: "complete configuration registry", complete: true },
  };
  const closed = routeEvidence(
    [closedRecord],
    closedRequest,
    undefined,
    undefined,
    trustedRegistry(closedRecord, closedRecord.completenessBoundary),
  );
  assert.equal(closed.route.coverage.trustedComplete, true);
  assert.deepEqual(closed.route.coverage.closedWorldEvidenceIds, ["EV-CLOSED"]);

  const identityOnly = evidence({
      id: "EV-IDENTITY-ONLY",
      role: "intent",
      lifecycle: "active",
      authority: "canon",
      claimKinds: ["identity"],
      closedWorld: true,
    });
  identityOnly.completenessBoundary = materialBoundary(
    identityOnly,
    "revision-broad-1",
    [identityOnly.sourceVersionId],
    ["identity"],
  );
  const broadRequest = {
    projectId: "project-a",
    projectRevision: "revision-broad-1",
    sourceVersionIds: [identityOnly.sourceVersionId],
    question: "What is true now?",
    coverage: { scope: "complete identity registry only", complete: true },
  };
  const broad = routeEvidence(
    [identityOnly],
    broadRequest,
    undefined,
    undefined,
    trustedRegistry(identityOnly, identityOnly.completenessBoundary),
  );
  assert.equal(broad.route.coverage.trustedComplete, false);
  assert.equal(broad.route.coverage.closure, "open");
  assert.match(broad.route.diagnostics.join("\n"), /did not cover every material answer boundary/i);

  const broadFailureRequest = {
    ...broadRequest,
    coverage: {
      scope: "identity registry plus failed runtime source",
      complete: true,
      failures: ["runtime-events.json failed to parse"],
      deferredSources: ["SRC-RUNTIME-EVENTS"],
    },
  };
  const broadWithFailure = routeEvidence(
    [identityOnly],
    broadFailureRequest,
    undefined,
    undefined,
    trustedRegistry(identityOnly, identityOnly.completenessBoundary),
  );
  assert.equal(broadWithFailure.route.coverage.closure, "open");
  assert.equal(broadWithFailure.route.coverage.trustedComplete, false);

  const quarantined = routeEvidence([
    evidence({
      id: "EV-QUARANTINED-CLOSED",
      role: "intent",
      lifecycle: "active",
      authority: "canon",
      claimKinds: ["identity"],
      closedWorld: true,
      flags: ["possible_prompt_injection"],
    }),
  ], {
    projectId: "project-a",
    question: "Who is Mara?",
    coverage: { scope: "untrusted identity index", complete: true },
  });
  assert.equal(quarantined.route.coverage.trustedComplete, false);
  assert.equal(quarantined.route.coverage.closure, "open");

  const excluded = routeEvidence([
    evidence({ id: "EV-CLOSED", title: "data/trigger-registry.json", locator: "data/trigger-registry.json", authority: "production", closedWorld: true }),
  ], {
    projectId: "project-a",
    question: "Does a producer exist?",
    coverage: { scope: "incomplete trigger registry", complete: true, excludedSources: ["SRC-REDACTED"] },
  });
  assert.equal(excluded.route.coverage.trustedComplete, false);
  assert.match(excluded.route.diagnostics.join("\n"), /excluded sources/i);
});

test("legacy flags and forged revision attestations cannot close an answer", () => {
  const legacy = evidence({
    id: "EV-LEGACY-CLOSED",
    role: "configuration",
    authority: "production",
    claimKinds: ["configured"],
    closedWorld: true,
  });
  const request = {
    projectId: "project-a",
    projectRevision: "revision-attested-1",
    sourceVersionIds: [legacy.sourceVersionId],
    question: "What value is configured?",
    coverage: { scope: "configuration registry", complete: true },
  };
  const legacyResult = routeEvidence([legacy], request);
  assert.equal(legacyResult.route.coverage.closure, "open");
  assert.match(legacyResult.route.diagnostics.join("\n"), /legacy closedWorld flag/i);

  const selfMinted = {
    ...legacy,
    completenessBoundary: materialBoundary(
      legacy,
      request.projectRevision,
      request.sourceVersionIds,
      ["configured"],
    ),
  };
  const selfMintedResult = routeEvidence([selfMinted], request);
  assert.equal(selfMintedResult.route.coverage.closure, "open");
  assert.match(selfMintedResult.route.diagnostics.join("\n"), /without an exact trusted runtime grant/i);

  const genuineRegistry = trustedRegistry(legacy, selfMinted.completenessBoundary);
  const copiedOntoAnotherFragment = { ...selfMinted, id: "EV-COPIED-BOUNDARY" };
  const copiedResult = routeEvidence(
    [copiedOntoAnotherFragment],
    request,
    undefined,
    undefined,
    genuineRegistry,
  );
  assert.equal(copiedResult.route.coverage.closure, "open");

  const forged = {
    ...legacy,
    id: "EV-FORGED-BOUNDARY",
    completenessBoundary: {
      ...materialBoundary(legacy, request.projectRevision, request.sourceVersionIds, ["configured"]),
      boundaryId: "BOUNDARY-FORGED",
      revision: {
        projectRevision: request.projectRevision,
        sourceVersionIds: request.sourceVersionIds,
        membershipDigest: `sha256:${"0".repeat(64)}`,
      },
    },
  };
  const forgedResult = routeEvidence(
    [forged],
    request,
    undefined,
    undefined,
    trustedRegistry(legacy, materialBoundary(legacy, request.projectRevision, request.sourceVersionIds, ["configured"])),
  );
  assert.equal(forgedResult.route.coverage.closure, "open");
  assert.deepEqual(forgedResult.route.coverage.completenessBoundaryEvidenceIds, []);
});

test("a complete exact target registry does not close an unrelated museum answer", () => {
  const record = evidence({
    id: "EV-MUSEUM-SEAL-REGISTRY",
    sourceVersionId: "SRC-MUSEUM-SEALS@v4",
    role: "configuration",
    authority: "production",
    claimKinds: ["configured", "causal"],
    claimKey: "seal:crate-17",
    polarity: "negative",
  });
  const members = [record.sourceVersionId];
  record.completenessBoundary = {
    version: "continuity.completeness-boundary.v1",
    boundaryId: "BOUNDARY-MUSEUM-SEAL-17",
    scope: { kind: "exact_claim_keys", claimKeys: [record.claimKey] },
    revision: {
      projectRevision: "museum-r4",
      sourceVersionIds: members,
      membershipDigest: revisionMembershipDigest("museum-r4", members),
    },
  };
  const museumRequest = {
    projectId: "project-a",
    projectRevision: "museum-r4",
    sourceVersionIds: members,
    question: "What is the complete custody history and present condition of every object?",
    coverage: { scope: "one exact seal registry", complete: true },
  };
  const result = routeEvidence(
    [record],
    museumRequest,
    undefined,
    undefined,
    trustedRegistry(record, record.completenessBoundary),
  );
  assert.equal(result.route.coverage.closure, "open");
  assert.equal(result.route.coverage.trustedComplete, false);
});

test("required roles and retrieval lanes follow explicit claim kinds", () => {
  const result = routeEvidence([
    evidence({ id: "EV-CONFIG", title: "config/runtime.yaml", locator: "config/runtime.yaml", authority: "production" }),
    evidence({ id: "EV-CODE", title: "src/runtime.ts", locator: "src/runtime.ts", authority: "production" }),
  ], {
    projectId: "project-a",
    question: "What value is configured?",
    claimKinds: ["configured"],
  });

  assert.deepEqual(result.route.claimKinds, ["configured"]);
  assert.ok(result.route.requiredRoles.includes("configuration"));
  assert.ok(result.route.retrieval.lanes.some((lane) => lane.id === "declared_state"));
  assert.ok(result.route.selectedByRole.configuration);
});

test("simple entity questions take a bounded one-lane route", () => {
  assert.deepEqual(inferFocusedClaimKinds("Who is Grandma?"), ["identity"]);
  assert.deepEqual(inferFocusedClaimKinds("Which grandma is this?"), ["identity"]);
  assert.deepEqual(inferFocusedClaimKinds("How is Grandma related to the protagonist?"), ["identity"]);
  assert.deepEqual(inferFocusedClaimKinds("Tell me about Grandma."), ["identity"]);
  const plan = planRetrieval({ projectId: "project-a", question: "Who is Grandma?" });
  assert.deepEqual(plan.lanes.map((lane) => lane.id), ["authority"]);
  assert.ok(plan.lanes.every((lane) => lane.maxResults <= 10));
});

test("a focused route does not spend its evidence budget on unrelated claims from the same source lane", () => {
  const result = routeEvidence([
    evidence({ id: "EV-IDENTITY", role: "intent", claimKinds: ["identity"], text: "Mara is the pilot." }),
    evidence({ id: "EV-UNRELATED-NORM", sourceId: "SRC-NORM", role: "intent", claimKinds: ["normative"], text: "The ending must remain hopeful." }),
    evidence({ id: "EV-UNRELATED-CAUSE", sourceId: "SRC-CAUSE", role: "intent", claimKinds: ["causal"], text: "The storm causes an evacuation." }),
  ], { projectId: "project-a", question: "Who is Mara?" });

  assert.deepEqual(result.evidence.map((item) => item.id), ["EV-IDENTITY"]);
  assert.deepEqual(result.route.coverage.deferredEvidenceIds, []);
  assert.equal(result.route.coverage.truncated, false);
});

test("the server owns presentation depth and uses bounded non-recursive budgets", () => {
  const focused = routeEvidence([], { projectId: "project-a", question: "Who is Grandma?" });
  assert.equal(focused.route.presentationDepth, "focused");
  assert.deepEqual(focused.route.budget, {
    profile: "answer_focused",
    maxRetrievalLanes: 1,
    maxResultsPerLane: 6,
    maxEvidence: 8,
    maxCompilerPasses: 1,
    maxReasonerPasses: 1,
    maxReachabilityPasses: 0,
  });

  const broad = routeEvidence([], { projectId: "project-a", question: "What is true now?" });
  assert.equal(broad.route.presentationDepth, "full");
  assert.equal(broad.route.budget.profile, "answer_broad");
  assert.equal(broad.route.budget.maxEvidence, 18);

  const traceBudget = analysisBudgetFor("trace_dependencies", presentationDepthFor("trace_dependencies", ["causal"]));
  const changeBudget = analysisBudgetFor("evaluate_change", presentationDepthFor("evaluate_change", ["causal"]));
  assert.equal(traceBudget.profile, "dependency_trace");
  assert.equal(traceBudget.maxReachabilityPasses, 1);
  assert.equal(changeBudget.profile, "change_evaluation");
  assert.equal(changeBudget.maxReachabilityPasses, 1);
  assert.ok(changeBudget.maxRetrievalLanes >= traceBudget.maxRetrievalLanes);
  assert.ok(changeBudget.maxEvidence <= DEFAULT_AUTHORITY_POLICY.maxEvidence);
});

test("focused identity routing requires one best available authority role, not every identity-shaped role", () => {
  const result = routeEvidence([
    evidence({ id: "EV-REFERENCE", role: "reference", claimKinds: ["identity"] }),
    evidence({ id: "EV-DECISION", sourceId: "SRC-DECISION", role: "decision", authority: "canon", claimKinds: ["identity"] }),
    evidence({ id: "EV-ASSET", sourceId: "SRC-ASSET", role: "asset", claimKinds: ["identity"] }),
  ], { projectId: "project-a", question: "Who is Grandma?" });

  assert.deepEqual(result.route.requiredRoles, ["decision"]);
  assert.doesNotMatch(result.route.diagnostics.join("\n"), /No (?:intent|reference|asset) evidence lane/i);
});

test("causal routing does not require a software configuration-test stack from a narrative corpus", () => {
  const result = routeEvidence([
    evidence({
      id: "EV-MANUSCRIPT-BRIDGE",
      sourceId: "SRC-MANUSCRIPT",
      role: "intent",
      authority: "reference",
      claimKinds: ["causal"],
      claimKey: "beat:storm-causes-evacuation",
      text: "The storm forces the village evacuation before the reunion.",
    }),
  ], {
    projectId: "project-a",
    question: "What must happen before the reunion?",
    analysisMode: "trace_dependencies",
  });

  assert.deepEqual(result.route.requiredRoles, ["intent"]);
  assert.doesNotMatch(result.route.diagnostics.join("\n"), /No (?:configuration|implementation|test|observation) evidence lane was available/i);
  assert.equal(result.route.mode, "trace_dependencies");
});

test("coverage distinguishes open retrieval, partial omissions, and trusted closed-world scope", () => {
  const open = routeEvidence([], { projectId: "project-a", question: "Who is Grandma?" });
  assert.equal(open.route.coverage.closure, "open");
  assert.equal(open.route.coverage.truncated, false);
  assert.deepEqual(open.route.coverage.failures, []);

  const partialRecords = Array.from({ length: 10 }, (_, index) => evidence({
      id: `EV-IDENTITY-${index}`,
      sourceId: `SRC-IDENTITY-${index}`,
      sourceVersionId: `SRC-IDENTITY-${index}@v1`,
      role: "intent",
      authority: "canon",
      claimKinds: ["identity"],
      closedWorld: index === 0,
    }));
  const partialMembers = partialRecords.map((item) => item.sourceVersionId);
  partialRecords[0].completenessBoundary = materialBoundary(
    partialRecords[0],
    "revision-partial-1",
    partialMembers,
    ["identity"],
  );
  const partialRequest = {
    projectId: "project-a",
    projectRevision: "revision-partial-1",
    sourceVersionIds: partialMembers,
    question: "Who is Grandma?",
    coverage: {
      scope: "uploaded manuscript",
      complete: true,
      failures: ["appendix.pdf could not be parsed"],
      deferredSources: ["SRC-APPENDIX"],
    },
  };
  const partial = routeEvidence(
    partialRecords,
    partialRequest,
    undefined,
    undefined,
    trustedRegistry(partialRecords[0], partialRecords[0].completenessBoundary),
  );
  assert.equal(partial.route.coverage.closure, "partial");
  assert.equal(partial.route.coverage.trustedComplete, false);
  assert.equal(partial.route.coverage.truncated, true);
  assert.deepEqual(partial.route.coverage.deferredSources, ["SRC-APPENDIX"]);
  assert.equal(partial.route.coverage.deferredEvidenceIds.length, 2);
  assert.deepEqual(partial.route.coverage.failures, ["appendix.pdf could not be parsed"]);

  const closedIdentity = evidence({
      id: "EV-CLOSED-IDENTITY",
      role: "intent",
      authority: "canon",
      claimKinds: ["identity"],
      closedWorld: true,
    });
  closedIdentity.completenessBoundary = materialBoundary(
    closedIdentity,
    "revision-identity-1",
    [closedIdentity.sourceVersionId],
    ["identity"],
  );
  const closedIdentityRequest = {
    projectId: "project-a",
    projectRevision: "revision-identity-1",
    sourceVersionIds: [closedIdentity.sourceVersionId],
    question: "Who is Grandma?",
    coverage: { scope: "complete cast registry", complete: true },
  };
  const closed = routeEvidence(
    [closedIdentity],
    closedIdentityRequest,
    undefined,
    undefined,
    trustedRegistry(closedIdentity, closedIdentity.completenessBoundary),
  );
  assert.equal(closed.route.coverage.closure, "closed");
  assert.equal(closed.route.coverage.trustedComplete, true);
});

test("a supplied retrieval plan is clamped to the server-owned route budget", () => {
  const oversizedPlan = {
    version: "continuity.retrieval-plan.v1",
    lanes: ["authority", "declared_state", "execution", "verification", "change_history"].map((id) => ({
      id,
      roles: ["intent", "implementation"],
      claimKinds: ["identity", "implemented"],
      query: `untrusted ${id}`,
      maxResults: 10_000,
    })),
  };
  const result = routeEvidence(
    [],
    { projectId: "project-a", question: "Who is Grandma?" },
    DEFAULT_AUTHORITY_POLICY,
    oversizedPlan,
  );

  assert.equal(result.route.retrieval.lanes.length, result.route.budget.maxRetrievalLanes);
  assert.ok(result.route.retrieval.lanes.every((lane) => lane.maxResults <= result.route.budget.maxResultsPerLane));
});

test("causal and ambiguous questions retain the broader bounded route", () => {
  assert.equal(inferFocusedClaimKinds("Can Grandma's operation be funded by Day 24?"), null);
  assert.equal(inferFocusedClaimKinds("What is true now?"), null);
  const plan = planRetrieval({
    projectId: "project-a",
    question: "Can the operation happen by Day 24?",
    analysisMode: "trace_dependencies",
  });
  assert.ok(plan.lanes.some((lane) => lane.id === "declared_state"));
  assert.ok(plan.lanes.some((lane) => lane.id === "execution"));
  assert.ok(plan.lanes.some((lane) => lane.id === "verification"));
  assert.ok(plan.lanes.length <= DEFAULT_AUTHORITY_POLICY.maxRetrievalLanes);
});

test("the server upgrades causal and change questions but never downgrades a requested deeper route", () => {
  assert.equal(
    inferMinimumAnalysisMode("Can the operation happen by Day 24?", null, "answer_question"),
    "trace_dependencies",
  );
  assert.equal(
    inferMinimumAnalysisMode("What breaks if we replace the payment event?", null, "answer_question"),
    "evaluate_change",
  );
  assert.equal(
    inferMinimumAnalysisMode("Who is Grandma?", null, "trace_dependencies"),
    "trace_dependencies",
  );
  for (const question of [
    "Why did settlement fail?",
    "What prevents settlement?",
    "Trace the chain from approval to disbursement.",
    "Is disbursement feasible under the current rule?",
    "Explain the mechanism linking approval and payment.",
  ]) {
    assert.equal(
      inferMinimumAnalysisMode(question, null, "answer_question"),
      "trace_dependencies",
      question,
    );
  }
});

test("client claim-kind hints can broaden a focused route but cannot narrow an ambiguous question", () => {
  const focused = routeEvidence([], {
    projectId: "project-a",
    question: "Who is Grandma?",
    claimKinds: ["historical"],
  });
  assert.deepEqual(focused.route.claimKinds, ["identity", "historical"]);

  const protectedBroad = routeEvidence([], {
    projectId: "project-a",
    question: "What is true now?",
    claimKinds: ["identity"],
  });
  assert.deepEqual(protectedBroad.route.claimKinds, [
    "identity", "normative", "configured", "implemented", "tested", "observed", "causal",
  ]);
});

test("retriever-supplied lane labels cannot bypass role and claim compatibility", () => {
  const result = routeEvidence([
    evidence({
      id: "EV-INTENT",
      title: "docs/contract.md",
      locator: "docs/contract.md",
      role: "intent",
      claimKinds: ["normative"],
      retrievalLaneIds: ["execution", "verification"],
    }),
  ], { projectId: "project-a", question: "What executes?" });

  assert.deepEqual(result.evidence, []);
  assert.equal(result.route.retrieval.availableByLane.execution, undefined);
  assert.equal(result.route.retrieval.availableByLane.verification, undefined);
});

test("ordinary questions inspect every active claim boundary without implicitly opening history", () => {
  const result = routeEvidence([
    evidence({ id: "EV-CONFIG", title: "config/runtime.yaml", locator: "config/runtime.yaml", authority: "production" }),
  ], { projectId: "project-a", question: "What is true now?" });

  assert.deepEqual(result.route.claimKinds, [
    "identity", "normative", "configured", "implemented", "tested", "observed", "causal",
  ]);
  assert.ok(result.route.retrieval.lanes.some((lane) => lane.id === "declared_state"));
  assert.ok(result.route.retrieval.lanes.some((lane) => lane.id === "execution"));
  assert.ok(result.route.retrieval.lanes.some((lane) => lane.id === "verification"));
  assert.equal(result.route.retrieval.lanes.some((lane) => lane.id === "change_history"), false);
});

test("contradiction preservation does not merge different claim, world, owner, or temporal scopes", () => {
  const policy = { ...DEFAULT_AUTHORITY_POLICY, maxEvidence: 2 };
  const positive = evidence({
    id: "EV-POSITIVE",
    title: "config/state.yaml",
    locator: "config/state.yaml",
    role: "configuration",
    lifecycle: "active",
    claimKinds: ["configured"],
    claimKind: "configured",
    claimKey: "feature.enabled",
    polarity: "positive",
    world: "main",
    epistemicOwner: "system",
    validFromOrder: 1,
    validToOrder: 10,
    score: 1,
  });
  const matchingNegative = evidence({
    ...positive,
    id: "EV-MATCHING-NEGATIVE",
    sourceId: "SRC-MATCHING-NEGATIVE",
    sourceVersionId: "SRC-MATCHING-NEGATIVE@v1",
    polarity: "negative",
    score: 0.05,
  });
  const variants = [
    { claimKind: "implemented" },
    { world: "alternate" },
    { epistemicOwner: "player" },
    { validToOrder: 11 },
  ];

  for (const [index, scopeChange] of variants.entries()) {
    const offScopeNegative = evidence({
      ...positive,
      ...scopeChange,
      id: `EV-OFF-SCOPE-${index}`,
      sourceId: `SRC-OFF-SCOPE-${index}`,
      sourceVersionId: `SRC-OFF-SCOPE-${index}@v1`,
      polarity: "negative",
      score: 0.99,
    });
    const result = routeEvidence(
      [positive, offScopeNegative, matchingNegative],
      { projectId: "project-a", question: "Is the feature enabled?", claimKinds: ["configured"] },
      policy,
    );
    assert.deepEqual(
      new Set(result.evidence.map((item) => item.id)),
      new Set(["EV-POSITIVE", "EV-MATCHING-NEGATIVE"]),
      `scope variant ${index} must not displace the matching contradiction`,
    );
  }

  const overlappingAtPoint = evidence({
    ...matchingNegative,
    id: "EV-OVERLAPPING-AT-POINT",
    sourceId: "SRC-OVERLAPPING-AT-POINT",
    sourceVersionId: "SRC-OVERLAPPING-AT-POINT@v1",
    validFromOrder: 2,
    validToOrder: 20,
  });
  const otherWorldAtPoint = evidence({
    ...matchingNegative,
    id: "EV-OTHER-WORLD-AT-POINT",
    sourceId: "SRC-OTHER-WORLD-AT-POINT",
    sourceVersionId: "SRC-OTHER-WORLD-AT-POINT@v1",
    world: "alternate",
    score: 0.99,
  });
  const atPoint = routeEvidence(
    [positive, otherWorldAtPoint, overlappingAtPoint],
    { projectId: "project-a", question: "Is the feature enabled at order 5?", claimKinds: ["configured"], storyPosition: 5 },
    policy,
  );
  assert.deepEqual(
    new Set(atPoint.evidence.map((item) => item.id)),
    new Set(["EV-POSITIVE", "EV-OVERLAPPING-AT-POINT"]),
    "overlapping validity intervals share the requested point-in-time frame",
  );
});

test("exact supersession requires an active approved and scope-compatible replacement", () => {
  const target = evidence({
    id: "EV-TARGET",
    sourceId: "SRC-OLD",
    sourceVersionId: "SRC-OLD@v1",
    title: "src/old.ts",
    locator: "src/old.ts",
    authority: "production",
    role: "implementation",
    lifecycle: "active",
    claimKinds: ["implemented"],
    claimKind: "implemented",
    claimKey: "payment.completed",
    world: "main",
    epistemicOwner: "system",
  });
  const replacement = evidence({
    id: "EV-REPLACEMENT",
    sourceId: "SRC-NEW",
    sourceVersionId: "SRC-NEW@v2",
    title: "src/new.ts",
    locator: "src/new.ts",
    authority: "retcon",
    role: "implementation",
    lifecycle: "active",
    claimKinds: ["implemented"],
    claimKind: "implemented",
    claimKey: "payment.completed",
    world: "main",
    epistemicOwner: "system",
    supersedesEvidenceIds: ["EV-TARGET"],
  });

  const accepted = routeEvidence([target, replacement], { projectId: "project-a", question: "What is implemented?" });
  assert.equal(accepted.evidence.some((item) => item.id === "EV-TARGET"), false);
  assert.equal(accepted.evidence.some((item) => item.id === "EV-REPLACEMENT"), true);

  const unsafeVariants = [
    { lifecycle: "proposed" },
    { authority: "proposal", lifecycle: "active" },
    { claimKind: "configured", claimKinds: ["configured"] },
    { claimKey: "different.claim" },
    { world: "alternate" },
    { epistemicOwner: "player" },
    { flags: ["possible_prompt_injection"] },
    { flags: ["compiled_context_only", "compiler_security_quarantine"] },
  ];
  for (const [index, change] of unsafeVariants.entries()) {
    const unsafe = { ...replacement, ...change, id: `EV-UNSAFE-${index}` };
    const result = routeEvidence([target, unsafe], { projectId: "project-a", question: "What is implemented?" });
    assert.equal(result.evidence.some((item) => item.id === "EV-TARGET"), true, `unsafe variant ${index} must preserve target`);
    assert.match(result.route.diagnostics.join("\n"), /Ignored unauthorized supersession/i);
  }
});

test("source-scoped supersession removes compatible claims without erasing unrelated claim kinds", () => {
  const compatible = evidence({
    id: "EV-OLD-IMPLEMENTATION",
    sourceId: "SRC-OLD",
    sourceVersionId: "SRC-OLD@v1",
    title: "src/old.ts",
    locator: "src/old.ts",
    authority: "production",
    role: "implementation",
    lifecycle: "active",
    claimKinds: ["implemented"],
    claimKind: "implemented",
    claimKey: "payment.completed",
    world: "main",
    epistemicOwner: "system",
  });
  const unrelated = evidence({
    id: "EV-OLD-IDENTITY",
    sourceId: "SRC-OLD",
    sourceVersionId: "SRC-OLD@v1",
    authority: "canon",
    role: "intent",
    lifecycle: "active",
    claimKinds: ["identity"],
    claimKind: "identity",
    claimKey: "actor.identity",
    world: "main",
    epistemicOwner: "system",
  });
  const replacement = evidence({
    id: "EV-NEW-IMPLEMENTATION",
    sourceId: "SRC-NEW",
    sourceVersionId: "SRC-NEW@v2",
    title: "src/new.ts",
    locator: "src/new.ts",
    authority: "retcon",
    role: "implementation",
    lifecycle: "active",
    claimKinds: ["implemented"],
    claimKind: "implemented",
    claimKey: "payment.completed",
    world: "main",
    epistemicOwner: "system",
    supersedesSourceId: "SRC-OLD",
    supersessionScope: "source",
  });

  const result = routeEvidence(
    [compatible, unrelated, replacement],
    { projectId: "project-a", question: "What remains active?" },
  );
  assert.equal(result.evidence.some((item) => item.id === "EV-OLD-IMPLEMENTATION"), false);
  assert.equal(result.evidence.some((item) => item.id === "EV-OLD-IDENTITY"), true);
  assert.match(result.route.diagnostics.join("\n"), /preserved 1 incompatible or unauthorized fragment/i);
});

test("a source cannot supersede a claim kind it may only contextualize", () => {
  const implemented = evidence({
    id: "EV-RUNTIME",
    sourceId: "SRC-RUNTIME",
    authority: "production",
    role: "implementation",
    lifecycle: "active",
    claimKinds: ["causal"],
    claimKind: "causal",
    claimKey: "transition:payment",
  });
  const narrativeRetcon = evidence({
    id: "EV-INTENT-RETCON",
    sourceId: "SRC-INTENT",
    authority: "retcon",
    role: "intent",
    lifecycle: "active",
    claimKinds: ["causal"],
    claimKind: "causal",
    claimKey: "transition:payment",
    supersedesEvidenceIds: [implemented.id],
  });

  const result = routeEvidence(
    [implemented, narrativeRetcon],
    { projectId: "project-a", question: "What transition is implemented?", claimKinds: ["causal"] },
  );

  assert.equal(result.evidence.some((item) => item.id === implemented.id), true);
  assert.match(result.route.diagnostics.join("\n"), /Ignored unauthorized supersession/i);
});

test("cyclic supersession preserves every participant and reports the cycle", () => {
  const first = evidence({
    id: "EV-RETCON-A",
    sourceId: "SRC-A",
    authority: "retcon",
    role: "intent",
    lifecycle: "active",
    claimKinds: ["normative"],
    claimKey: "policy:gate",
    supersedesEvidenceIds: ["EV-RETCON-B"],
  });
  const second = evidence({
    id: "EV-RETCON-B",
    sourceId: "SRC-B",
    authority: "retcon",
    role: "intent",
    lifecycle: "active",
    claimKinds: ["normative"],
    claimKey: "policy:gate",
    supersedesEvidenceIds: ["EV-RETCON-A"],
  });

  const result = routeEvidence([first, second], { projectId: "project-a", question: "Which retcon applies?" });

  assert.deepEqual(new Set(result.evidence.map((item) => item.id)), new Set([first.id, second.id]));
  assert.match(result.route.diagnostics.join("\n"), /cyclic supersession/i);
});

test("source-scoped supersession without an atomic claim key removes nothing", () => {
  const oldA = evidence({ id: "EV-OLD-A", sourceId: "SRC-OLD", role: "intent", claimKinds: ["normative"] });
  const oldB = evidence({ id: "EV-OLD-B", sourceId: "SRC-OLD", role: "intent", claimKinds: ["normative"] });
  const retcon = evidence({
    id: "EV-RETCON",
    sourceId: "SRC-NEW",
    authority: "retcon",
    role: "intent",
    lifecycle: "active",
    claimKinds: ["normative"],
    supersedesSourceId: "SRC-OLD",
    supersessionScope: "source",
  });

  const result = routeEvidence([oldA, oldB, retcon], { projectId: "project-a", question: "What changed?" });
  assert.deepEqual(new Set(result.evidence.map((item) => item.id)), new Set([oldA.id, oldB.id, retcon.id]));
});
