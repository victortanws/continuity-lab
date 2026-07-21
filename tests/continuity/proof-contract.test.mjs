import assert from "node:assert/strict";
import test from "node:test";

import { compileProofContract } from "../../lib/continuity/proof-contract.ts";

const request = (question, extra = {}) => ({ projectId: "project-neutral", question, ...extra });

test("a positive lookup asks for one local proof rather than repository closure", () => {
  const contract = compileProofContract(request("Who is the harbor pilot?"));
  assert.equal(contract.routeClass, "lookup");
  assert.equal(contract.proofKind, "direct_citation");
  assert.equal(contract.closureDemand, "local");
  assert.equal(contract.dependenciesRequired, false);
  assert.deepEqual(contract.retrievalLanes, ["authority"]);
});

test("negative and exhaustive lookups require a bounded scope without becoming causal", () => {
  const contract = compileProofContract(request("Which configured records are missing?"));
  assert.equal(contract.routeClass, "lookup");
  assert.equal(contract.mode, "answer_question");
  assert.equal(contract.closureDemand, "exhaustive");
  assert.equal(contract.transitionCertificateRequired, false);
});

test("causal, verification, and change questions receive different proof shapes", () => {
  const causal = compileProofContract(request("Can the account reach the release threshold?"));
  const verification = compileProofContract(request("Which tests verify that the migration runs exactly once?"));
  const change = compileProofContract(request("If we raise the threshold, what else is affected?"));

  assert.equal(causal.proofKind, "transition_certificate");
  assert.equal(causal.transitionCertificateRequired, true);
  assert.deepEqual(verification.retrievalLanes, ["execution", "verification"]);
  assert.equal(verification.dependenciesRequired, false);
  assert.equal(change.proofKind, "change_impact");
  assert.equal(change.closureDemand, "exhaustive");
  assert.ok(change.retrievalLanes.includes("change_history"));
});

test("a caller may deepen or broaden a route but cannot narrow the server minimum", () => {
  const deepLookup = compileProofContract(request("Who is Mara?", { analysisMode: "trace_dependencies" }));
  const causal = compileProofContract(request("Why did settlement fail?", { analysisMode: "answer_question" }));
  const broadened = compileProofContract(request("What value is configured?", { claimKinds: ["tested"] }));

  assert.equal(deepLookup.mode, "trace_dependencies");
  assert.equal(causal.mode, "trace_dependencies");
  assert.ok(broadened.claimKinds.includes("configured"));
  assert.ok(broadened.claimKinds.includes("tested"));
  assert.ok(broadened.retrievalLanes.includes("verification"));
});
