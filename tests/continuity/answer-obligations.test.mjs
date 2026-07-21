import assert from "node:assert/strict";
import test from "node:test";

import {
  auditAnswerObligations,
  compileAnswerObligations,
  routerReceiptVersion,
} from "../../lib/continuity/answer-obligations.ts";
import { AUTHORITY_ROUTER_VERSION, CONTINUITY_ANSWER_VERSION } from "../../lib/continuity/contracts.ts";
import { routeEvidence } from "../../lib/continuity/routing/authority-router.ts";

function evidence(overrides = {}) {
  return {
    id: "EV-PERSON",
    projectId: "project-a",
    sourceId: "SRC-1",
    sourceVersionId: "SRC-1@v1",
    title: "record.md",
    locator: "record.md:1-1",
    text: "Mara is the archivist.",
    score: 0.9,
    authority: "reference",
    role: "reference",
    lifecycle: "active",
    claimKinds: ["identity"],
    claimKind: "identity",
    claimKey: "identity:mara:archivist",
    polarity: "positive",
    ...overrides,
  };
}

function answer(overrides = {}) {
  return {
    version: CONTINUITY_ANSWER_VERSION,
    projectRevision: "rev-1",
    timeScope: null,
    question: "Who is Mara?",
    verdict: "INSUFFICIENT_EVIDENCE",
    truthStatus: "unknown",
    reachability: {
      status: "not_evaluated",
      completenessScope: "",
      targetClaimKeys: [],
      blockers: [],
      assumptions: [],
      path: [],
    },
    answer: "The packet does not resolve Mara.",
    confidence: "low",
    evidence: [],
    conclusions: [],
    analysisChecks: [],
    entities: [],
    conflicts: [],
    dependencies: [],
    proposal: null,
    followUpQuestions: [],
    caveats: [],
    ...overrides,
  };
}

test("router and answer contracts evolve independently across router upgrades", () => {
  assert.equal(routerReceiptVersion(), "3.5.0");
  assert.equal(AUTHORITY_ROUTER_VERSION, "3.5.0");
  assert.equal(CONTINUITY_ANSWER_VERSION, "continuity.answer.v7");
});

test("a focused identity lookup gets only the obligations it needs", () => {
  const chunk = evidence();
  const request = {
    projectId: "project-a",
    projectRevision: "rev-1",
    question: "Who is Mara?",
    truthTarget: "packet_assertion",
  };
  const routed = routeEvidence([chunk], request);
  const obligations = compileAnswerObligations(request, routed.route, routed.evidence);

  assert.equal(routed.route.presentationDepth, "focused");
  assert.equal(routed.route.routerVersion, "3.5.0");
  assert.equal(routed.route.truthTarget, "packet_assertion");
  assert.ok(obligations.some((item) => item.kind === "entity_resolution"));
  assert.equal(obligations.some((item) => item.kind === "reachability_certificate"), false);
  assert.equal(obligations.some((item) => item.kind === "downstream_effects"), false);
});

test("a causal target requires server-owned dependencies and a typed certificate", () => {
  const chunk = evidence({
    id: "EV-GATE",
    text: "Release requires an approved inspection.",
    claimKinds: ["causal"],
    claimKind: "causal",
    claimKey: "release:requires:inspection",
  });
  const request = {
    projectId: "project-a",
    projectRevision: "rev-1",
    question: "Can the release happen?",
    analysisMode: "trace_dependencies",
    targetClaimKeys: ["release:complete"],
  };
  const routed = routeEvidence([chunk], request);
  const obligations = compileAnswerObligations(request, routed.route, routed.evidence);

  assert.ok(obligations.some((item) => item.kind === "dependency_inventory"));
  assert.ok(obligations.some((item) => item.kind === "reachability_certificate"));

  routed.route.answerObligations = obligations;
  const audited = auditAnswerObligations(answer({
    question: request.question,
    reachability: {
      status: "reachable",
      completenessScope: "invented",
      targetClaimKeys: ["release:complete"],
      blockers: [],
      assumptions: [],
      path: ["invented"],
    },
  }), routed.route, null);

  assert.equal(audited.find((item) => item.obligationId === "answer:dependency_inventory")?.status, "unresolved");
  assert.equal(audited.find((item) => item.obligationId === "answer:reachability_certificate")?.status, "unresolved");
});

test("packet-relative support is valid without claiming project canon", () => {
  const chunk = evidence();
  const request = {
    projectId: "project-a",
    projectRevision: "rev-1",
    question: "According to this packet, who is Mara?",
    truthTarget: "packet_assertion",
  };
  const routed = routeEvidence([chunk], request);
  routed.route.answerObligations = compileAnswerObligations(request, routed.route, routed.evidence);
  const conclusion = {
    claimKey: chunk.claimKey,
    claimKind: "identity",
    polarity: "positive",
    basis: "explicit_evidence",
    statement: "The packet calls Mara the archivist.",
    evidenceIds: [chunk.id],
    assertionScope: "source_assertion",
    assertionOwnerIds: [chunk.sourceVersionId],
  };
  const audited = auditAnswerObligations(answer({
    verdict: "SUPPORTED",
    truthStatus: "source_assertion",
    evidence: [{
      evidenceId: chunk.id,
      sourceId: chunk.sourceId,
      locator: chunk.locator,
      stance: "supports",
      claimKind: "identity",
      use: "establish",
      supports: conclusion.statement,
      assertionScope: "source_assertion",
      assertionOwnerId: chunk.sourceVersionId,
    }],
    conclusions: [conclusion],
    entities: [{
      id: "ENT-MARA",
      name: "Mara",
      type: "person",
      aliases: [],
      resolution: "resolved",
      evidenceIds: [chunk.id],
    }],
  }), routed.route, null);

  assert.equal(audited.find((item) => item.obligationId === "answer:evidence_world")?.status, "satisfied");
});
