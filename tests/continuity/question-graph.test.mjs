import test from "node:test";
import assert from "node:assert/strict";

import {
  QUESTION_GRAPH_VERSION,
  buildQuestionGraph,
  planQuestionGraphUse,
  queryQuestionGraph,
} from "../../lib/continuity/question-graph.ts";

const closedCoverage = {
  scope: "all admitted project sources at revision",
  closure: "closed",
  trustedComplete: true,
  truncated: false,
  failures: [],
  deferredEvidenceIds: [],
  deferredSources: [],
  excludedSources: [],
};

function evidence(overrides) {
  return {
    id: overrides.id,
    projectId: overrides.projectId ?? "project",
    sourceId: overrides.sourceId ?? "canon",
    sourceVersionId: overrides.sourceVersionId ?? "canon@1",
    title: overrides.title ?? "Ground truth",
    locator: overrides.locator ?? `line:${overrides.id}`,
    text: overrides.text,
    score: 1,
    authority: overrides.authority ?? "canon",
    role: overrides.role ?? "decision",
    lifecycle: "active",
    claimKinds: [overrides.claimKind],
    claimKind: overrides.claimKind,
    claimKey: overrides.claimKey,
    polarity: overrides.polarity ?? "positive",
    assertionScope: "project_truth",
    assertionOwnerId: overrides.projectId ?? "project",
    entityCandidates: overrides.entityCandidates ?? [],
    temporalAxis: overrides.temporalAxis ?? null,
    validFromOrder: overrides.validFromOrder ?? null,
    flags: ["compiled_atomic_span"],
  };
}

test("short lookups bypass the graph while causal and change questions use it", () => {
  assert.deepEqual(planQuestionGraphUse("Who is Grandma?"), {
    useGraph: false,
    path: "direct_lookup",
    reason: "A short factual lookup can use the smallest relevant evidence set.",
  });
  assert.equal(planQuestionGraphUse("What happens after Grandma's operation, and what depends on it?").useGraph, true);
  assert.equal(planQuestionGraphUse("Who is Grandma, and does the gate open?").useGraph, true);
  assert.equal(planQuestionGraphUse("Who is Grandma?", "evaluate_change").useGraph, true);
});

test("story causality produces typed event, precondition, consequence, identity, and temporal edges", () => {
  const jiraiya = {
    id: "ENT-JIRAIYA",
    name: "Jiraiya",
    type: "person",
    aliases: ["the Toad Sage"],
    mention: "Jiraiya",
    referentKey: "mention:jiraiya",
    resolution: "resolved",
  };
  const items = [
    evidence({
      id: "EV-ALIVE",
      projectId: "ninja-story",
      text: "Jiraiya is alive before the battle.",
      claimKind: "observed",
      claimKey: "state:jiraiya:alive",
      entityCandidates: [jiraiya],
      temporalAxis: "chapter",
      validFromOrder: 370,
    }),
    evidence({
      id: "EV-DEATH",
      projectId: "ninja-story",
      text: "Jiraiya dies before Pain's later attack.",
      claimKind: "historical",
      claimKey: "event:jiraiya:death",
      entityCandidates: [jiraiya],
      temporalAxis: "chapter",
      validFromOrder: 383,
    }),
    evidence({
      id: "EV-NOT-ALIVE",
      projectId: "ninja-story",
      text: "A conflicting draft says Jiraiya is not alive before the battle.",
      claimKind: "observed",
      claimKey: "state:jiraiya:alive",
      polarity: "negative",
      entityCandidates: [jiraiya],
      temporalAxis: "chapter",
      validFromOrder: 370,
    }),
    evidence({
      id: "EV-FIGHT",
      projectId: "ninja-story",
      text: "Jiraiya fights Pain during the village attack.",
      claimKind: "historical",
      claimKey: "event:jiraiya:fights-pain",
      entityCandidates: [jiraiya],
      temporalAxis: "chapter",
      validFromOrder: 430,
    }),
  ];
  const graph = buildQuestionGraph({
    projectId: "ninja-story",
    projectRevision: "rev-1",
    evidence: items,
    coverage: closedCoverage,
    semanticRecords: [
      { evidenceId: "EV-DEATH", assertionKind: "event", consequenceClaimKeys: ["state:jiraiya:alive"] },
      { evidenceId: "EV-FIGHT", assertionKind: "event", preconditionClaimKeys: ["state:jiraiya:alive"] },
    ],
  });

  assert.equal(graph.version, QUESTION_GRAPH_VERSION);
  assert.equal(graph.receipt.corpusCoverage, "closed");
  assert.equal(graph.receipt.unresolvedReferencedNodes, 0);
  assert.ok(graph.nodes.some((node) => node.kind === "entity" && node.key === "ENT-JIRAIYA"));
  assert.ok(graph.nodes.some((node) => node.kind === "event" && node.key === "event:jiraiya:death"));
  for (const relation of ["supports", "contradicts", "mentions", "precondition", "consequence", "temporal_before"]) {
    assert.ok(graph.edges.some((edge) => edge.relation === relation), `missing ${relation}`);
  }
  const alive = graph.nodes.find((node) => node.key === "state:jiraiya:alive");
  assert.equal(alive.grounding, "conflicted", "opposed exact-frame evidence remains visible");

  const result = queryQuestionGraph(graph, {
    question: "Could Jiraiya fight Pain after his death, and what precondition conflicts?",
    maxDepth: 3,
  });
  assert.ok(result.nodes.some((node) => node.key === "event:jiraiya:fights-pain"));
  assert.ok(result.nodes.some((node) => node.key === "event:jiraiya:death"));
  assert.ok(result.edges.some((edge) => edge.relation === "precondition"));
  assert.equal(result.receipt.corpusCoverage, "closed");
});

test("the same graph protocol handles museum custody and software release dependencies", () => {
  const museumEvidence = [
    evidence({ id: "M-1", projectId: "museum", text: "Artifact A remains in vault custody.", claimKind: "configured", claimKey: "state:artifact-a:vault-custody" }),
    evidence({ id: "M-2", projectId: "museum", text: "A signed loan approval is required before dispatch.", claimKind: "normative", claimKey: "constraint:artifact-a:loan-approved" }),
    evidence({ id: "M-3", projectId: "museum", text: "Artifact A is dispatched to Gallery B.", claimKind: "observed", claimKey: "event:artifact-a:dispatch", temporalAxis: "day", validFromOrder: 12 }),
  ];
  const museum = buildQuestionGraph({
    projectId: "museum",
    projectRevision: "loan-7",
    evidence: museumEvidence,
    semanticRecords: [{ evidenceId: "M-3", assertionKind: "event", preconditionClaimKeys: ["constraint:artifact-a:loan-approved"], consequenceClaimKeys: ["state:artifact-a:gallery-b-custody"] }],
  });
  const museumAnswer = queryQuestionGraph(museum, { question: "Can Artifact A be dispatched before loan approval?" });
  assert.ok(museumAnswer.edges.some((edge) => edge.relation === "precondition"));
  assert.ok(museum.nodes.some((node) => node.key === "state:artifact-a:gallery-b-custody" && node.grounding === "referenced"));
  assert.equal(museumAnswer.receipt.warning?.includes("not proof"), true);

  const releaseEvidence = [
    evidence({ id: "S-1", projectId: "software", text: "Release 3.3 requires a passing security gate.", claimKind: "normative", claimKey: "constraint:release-3.3:security-pass" }),
    evidence({ id: "S-2", projectId: "software", text: "Release 3.3 is deployed to production.", claimKind: "implemented", claimKey: "event:release-3.3:deploy", temporalAxis: "build", validFromOrder: 33 }),
  ];
  const request = {
    projectId: "software",
    projectRevision: "3.3.0",
    evidence: releaseEvidence,
    semanticRecords: [{ evidenceId: "S-2", assertionKind: "event", preconditionClaimKeys: ["constraint:release-3.3:security-pass"], consequenceClaimKeys: ["state:production:3.3-running"] }],
    coverage: closedCoverage,
  };
  const forward = buildQuestionGraph(request);
  const reversed = buildQuestionGraph({ ...request, evidence: releaseEvidence.slice().reverse() });
  assert.deepEqual(reversed, forward, "stable IDs and output ordering do not depend on source order");
  assert.ok(queryQuestionGraph(forward, { question: "What does deployment require?" }).edges.some((edge) => edge.relation === "precondition"));
});

test("question traversal stops at hard node, edge, and depth budgets with an explicit receipt", () => {
  const evidenceItems = Array.from({ length: 8 }, (_, index) => evidence({
    id: `B-${index}`,
    projectId: "budget",
    text: `Milestone ${index} follows the prior milestone.`,
    claimKind: "causal",
    claimKey: `event:milestone:${index}`,
    temporalAxis: "step",
    validFromOrder: index,
  }));
  const graph = buildQuestionGraph({ projectId: "budget", projectRevision: "1", evidence: evidenceItems });
  const result = queryQuestionGraph(graph, {
    question: "How does milestone progress?",
    seedKeys: ["event:milestone:0"],
    maxNodes: 2,
    maxEdges: 1,
    maxDepth: 1,
  });
  assert.ok(result.nodes.length <= 2);
  assert.ok(result.edges.length <= 1);
  assert.equal(result.receipt.graphTraversalComplete, false);
  assert.ok(result.receipt.truncatedBy.length > 0);
  assert.ok(result.receipt.deferredNodeCount > 0);
});

test("the same claim at different times remains two states and a bare temporal join stays unresolved", () => {
  const graph = buildQuestionGraph({
    projectId: "clinic",
    projectRevision: "patient-4",
    evidence: [
      evidence({ id: "C-1", projectId: "clinic", text: "The patient is awaiting surgery on day 1.", claimKind: "observed", claimKey: "state:patient:awaiting-surgery", temporalAxis: "day", validFromOrder: 1 }),
      evidence({ id: "C-2", projectId: "clinic", text: "The patient is no longer awaiting surgery on day 8.", claimKind: "observed", claimKey: "state:patient:awaiting-surgery", polarity: "negative", temporalAxis: "day", validFromOrder: 8 }),
      evidence({ id: "C-3", projectId: "clinic", text: "Discharge requires the surgery state to be resolved.", claimKind: "causal", claimKey: "event:patient:discharge", temporalAxis: "day", validFromOrder: 9 }),
    ],
    semanticRecords: [{ evidenceId: "C-3", assertionKind: "event", preconditionClaimKeys: ["state:patient:awaiting-surgery"] }],
  });
  const temporalStates = graph.nodes.filter((node) => node.key === "state:patient:awaiting-surgery" && node.grounding !== "referenced");
  assert.equal(temporalStates.length, 2);
  assert.equal(temporalStates.every((node) => node.grounding === "grounded"), true, "a later negation is a state transition, not a same-frame contradiction");
  assert.equal(graph.receipt.unresolvedReferencedNodes, 1, "a relation lacking a temporal frame is not silently bound to one state");
});

test("context-only, injection-flagged, and ungrounded semantic records are rejected", () => {
  const broad = evidence({ id: "R-1", text: "Uncompiled paragraph.", claimKind: "causal", claimKey: "claim:broad" });
  broad.flags = ["compiled_context_only"];
  const graph = buildQuestionGraph({
    projectId: "project",
    projectRevision: "1",
    evidence: [broad],
    semanticRecords: [{ evidenceId: "missing", consequenceClaimKeys: ["claim:invented"] }],
  });
  assert.equal(graph.nodes.length, 0);
  assert.equal(graph.receipt.rejectedEvidence, 1);
  assert.equal(graph.receipt.semanticRecordsRejected, 1);
});

test("excluded sources prevent a nominally closed graph from claiming closed corpus coverage", () => {
  const graph = buildQuestionGraph({
    projectId: "records",
    projectRevision: "4",
    evidence: [evidence({ id: "X-1", projectId: "records", text: "One register entry.", claimKind: "observed", claimKey: "entry:one" })],
    coverage: { ...closedCoverage, excludedSources: ["restricted-register"] },
  });

  assert.equal(graph.receipt.corpusCoverage, "partial");
  assert.match(graph.receipt.coverageWarnings.join("\n"), /excluded/i);
});

test("graph compilation rejects a node fan-out beyond the hard build ceiling", () => {
  const tooMany = Array.from({ length: 129 }, (_, index) => evidence({
    id: `N-${index}`,
    projectId: "oversized",
    sourceVersionId: `source@${index}`,
    text: `Independent claim ${index}.`,
    claimKind: "observed",
    claimKey: `claim:${index}`,
  }));

  assert.throws(
    () => buildQuestionGraph({ projectId: "oversized", projectRevision: "1", evidence: tooMany }),
    /256-node limit/i,
  );
});
