import assert from "node:assert/strict";
import test from "node:test";

import { ContinuityEngine } from "../../lib/continuity/engine.ts";
import { CONTINUITY_ANSWER_VERSION } from "../../lib/continuity/contracts.ts";

function source(overrides) {
  return {
    id: "EV-GATE-SEALED",
    projectId: "temporal-canon-test",
    sourceId: "SRC-EARLY",
    sourceVersionId: "SRC-EARLY@1",
    title: "Early story state",
    locator: "Chapter notes / Day 1",
    text: "The gate remains sealed.",
    score: 0.9,
    authority: "canon",
    role: "intent",
    lifecycle: "active",
    claimKinds: ["normative"],
    claimKey: "state:gate-sealed",
    polarity: "positive",
    temporalAxis: "day",
    validFromOrder: 1,
    ...overrides,
  };
}

function reasonerFor(chunk, statement) {
  return {
    mode: "demonstration",
    model: null,
    async answer(request) {
      return {
        version: CONTINUITY_ANSWER_VERSION,
        projectRevision: request.projectRevision,
        timeScope: request.timeScope,
        question: request.question,
        verdict: "SUPPORTED",
        truthStatus: "supported",
        reachability: { status: "not_evaluated", completenessScope: "", targetClaimKeys: [], blockers: [], assumptions: [], path: [] },
        answer: statement,
        confidence: "high",
        evidence: [{
          evidenceId: chunk.id,
          sourceId: chunk.sourceId,
          locator: chunk.locator,
          stance: "supports",
          claimKind: "normative",
          use: "establish",
          supports: statement,
        }],
        conclusions: [{
          claimKey: chunk.claimKey,
          claimKind: "normative",
          polarity: chunk.polarity,
          basis: "explicit_evidence",
          statement,
          evidenceIds: [chunk.id],
        }],
        analysisChecks: [],
        entities: [],
        conflicts: [],
        dependencies: [],
        proposal: null,
        followUpQuestions: [],
        caveats: [],
      };
    },
  };
}

function request(day) {
  return {
    projectId: "temporal-canon-test",
    projectRevision: "revision-1",
    question: `Is the gate sealed on Day ${day}?`,
    timeScope: `Day ${day}`,
    temporalAxis: "day",
    storyPosition: day,
  };
}

test("canon can remain coherent through one point and become contradictory later", async () => {
  const early = source({});
  const laterContradiction = source({
    id: "EV-GATE-OPEN",
    sourceId: "SRC-LATE",
    sourceVersionId: "SRC-LATE@1",
    title: "Later scene",
    locator: "Scene / Day 10",
    text: "The same gate is still sealed, yet the party enters through it without opening it.",
    polarity: "negative",
    validFromOrder: 10,
  });
  const engine = new ContinuityEngine(
    { async retrieve() { return [early, laterContradiction]; } },
    reasonerFor(early, "The gate is sealed."),
  );

  const beforeBreak = await engine.query(request(5));
  const afterBreak = await engine.query(request(12));

  assert.equal(beforeBreak.answer.verdict, "SUPPORTED");
  assert.equal(afterBreak.answer.verdict, "CONFLICT");
  assert.equal(afterBreak.answer.truthStatus, "conflicted");
  assert.deepEqual(
    afterBreak.answer.conflicts.find((item) => item.basis === "claim_contradiction").evidenceIds.sort(),
    [early.id, laterContradiction.id].sort(),
  );
});

test("an explicit authorized retcon resolves the temporal contradiction without rewriting history", async () => {
  const early = source({});
  const retcon = source({
    id: "EV-GATE-RETCON",
    sourceId: "SRC-RETCON",
    sourceVersionId: "SRC-RETCON@1",
    title: "Approved retcon",
    locator: "Decision / Day 10",
    text: "From Day 10 onward, the gate is open; this replaces the earlier continuing-state claim.",
    authority: "retcon",
    polarity: "negative",
    validFromOrder: 10,
    supersedesEvidenceIds: [early.id],
  });
  const engine = new ContinuityEngine(
    { async retrieve() { return [early, retcon]; } },
    reasonerFor(retcon, "From Day 10 onward, the gate is no longer sealed."),
  );

  const afterRetcon = await engine.query(request(12));

  assert.equal(afterRetcon.answer.verdict, "SUPPORTED");
  assert.deepEqual(afterRetcon.retrievedEvidence.map((item) => item.id), [retcon.id]);
  assert.equal(afterRetcon.answer.conflicts.length, 0);
});
