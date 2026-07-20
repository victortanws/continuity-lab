import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalInspectionCatalog,
  INSPECTION_POLICY_PRESETS,
  MAX_DETECTION_EDGES,
  MAX_INSPECTION_CHECKS,
  MAX_INSPECTION_ID_LENGTH,
  MAX_INSPECTION_LABEL_LENGTH,
  MAX_INSPECTION_RISKS,
  planInspections as runPlanInspections,
} from "../../lib/continuity/inspection-planner.ts";

const calibration = { authority: "server_policy", revision: "qa-policy-r1" };
const approvalWindow = {
  validFrom: "2026-01-01T00:00:00.000Z",
  expiresAt: "2027-01-01T00:00:00.000Z",
  riskProbabilityUpperBoundFactor: 1,
  detectionProbabilityLowerBoundFactor: 1,
};
const calibrationRegistry = {
  authority: "server_registry",
  revision: "inspection-calibrations-2026-07-20",
  approvals: [
    { ...calibration, ...approvalWindow },
    { authority: "measured_history", revision: "render-qc-2026-07", ...approvalWindow },
    { authority: "approved_operator", revision: "release-gate-r4", ...approvalWindow },
    { authority: "measured_history", revision: "joint-log-study-r1", ...approvalWindow },
    { authority: "approved_operator", revision: "software-rollout-r1", ...approvalWindow },
    { authority: "approved_operator", revision: "financial-reconciliation-r1", ...approvalWindow },
    { authority: "approved_operator", revision: "data-migration-r1", ...approvalWindow },
    {
      authority: "measured_history",
      revision: "conservative-detection-r1",
      ...approvalWindow,
      detectionProbabilityLowerBoundFactor: 0.95,
    },
    {
      authority: "measured_history",
      revision: "conservative-incidence-r1",
      ...approvalWindow,
      riskProbabilityUpperBoundFactor: 2,
    },
    {
      authority: "server_policy",
      revision: "expired-policy-r1",
      ...approvalWindow,
      expiresAt: "2026-06-01T00:00:00.000Z",
    },
  ],
};
const plannerRuntime = {
  calibrationRegistry,
  evaluatedAt: "2026-07-20T00:00:00.000Z",
};
const bindPlannerRuntime = (input, runtime = plannerRuntime) => {
  const catalogCanonical = canonicalInspectionCatalog(input);
  return {
    ...runtime,
    calibrationRegistry: {
      ...runtime.calibrationRegistry,
      approvals: runtime.calibrationRegistry.approvals.map((approval) =>
        approval.authority === input.calibration.authority
          && approval.revision === input.calibration.revision
          ? { ...approval, catalogCanonical }
          : approval),
    },
  };
};
const planInspections = (input, runtime = plannerRuntime) =>
  runPlanInspections(input, bindPlannerRuntime(input, runtime));

test("a cheap lookup stays on the shallow one-check preset", () => {
  const plan = planInspections({
    calibration,
    policy: INSPECTION_POLICY_PRESETS.lookup,
    risks: [
      { id: "wrong-record", probability: 0.2, missCost: 100, rerunCost: 0.5 },
      { id: "stale-alias", probability: 0.1, missCost: 4, rerunCost: 0.2 },
    ],
    checks: [
      { id: "exact-id-lookup", costUnits: 0.5, timeUnits: 0.5, detectionProbabilities: { "wrong-record": 0.95 } },
      { id: "alias-scan", costUnits: 0.5, timeUnits: 0.5, detectionProbabilities: { "stale-alias": 0.9 } },
    ],
  });

  assert.deepEqual(plan.selectedChecks.map((check) => check.id), ["exact-id-lookup"]);
  assert.equal(plan.selectedChecks.length, 1);
  assert.equal(plan.stopReason, "no_positive_value");
  assert.ok(plan.totalCostUnits <= INSPECTION_POLICY_PRESETS.lookup.maxTotalCostUnits);
});

test("high-rework work receives deeper mandatory and expected-value checks", () => {
  const plan = planInspections({
    calibration: { authority: "measured_history", revision: "render-qc-2026-07" },
    policy: { ...INSPECTION_POLICY_PRESETS.high_rework, minimumMandatoryDetectionProbability: 0.9 },
    risks: [
      { id: "identity-drift", probability: 0.35, missCost: 800, rerunCost: 80, releaseBlocking: true },
      { id: "causal-panel-gap", probability: 0.3, missCost: 650, rerunCost: 70, mandatory: true },
      { id: "lettering-defect", probability: 0.2, missCost: 150, rerunCost: 20 },
    ],
    checks: [
      { id: "identity-anchor", mandatory: true, costUnits: 4, timeUnits: 3, detectionProbabilities: { "identity-drift": 0.95 } },
      { id: "sequence-causality", costUnits: 5, timeUnits: 5, detectionProbabilities: { "causal-panel-gap": 0.94 } },
      { id: "lettering-proof", costUnits: 2, timeUnits: 2, detectionProbabilities: { "lettering-defect": 0.9 } },
    ],
  });

  assert.deepEqual(plan.selectedChecks.map((check) => check.id), [
    "identity-anchor", "sequence-causality", "lettering-proof",
  ]);
  assert.deepEqual(plan.selectedChecks.map((check) => check.reason), [
    "mandatory_check", "mandatory_risk", "expected_value",
  ]);
  assert.deepEqual(plan.uncoveredMandatoryRiskIds, []);
  assert.ok(plan.selectedChecks.length > INSPECTION_POLICY_PRESETS.lookup.maxChecksPerPass);
});

test("overlapping perfect detection makes a redundant check lose all marginal value", () => {
  const plan = planInspections({
    calibration,
    policy: { ...INSPECTION_POLICY_PRESETS.standard, residualLossThreshold: 0 },
    risks: [{ id: "broken-state", probability: 0.5, missCost: 100, rerunCost: 0 }],
    checks: [
      { id: "state-proof-a", costUnits: 1, timeUnits: 1, detectionProbabilities: { "broken-state": 1 } },
      { id: "state-proof-b", costUnits: 2, timeUnits: 2, detectionProbabilities: { "broken-state": 1 } },
    ],
  });

  assert.deepEqual(plan.selectedChecks.map((check) => check.id), ["state-proof-a"]);
  assert.equal(plan.residualExpectedLoss, 0);
  assert.equal(plan.stopReason, "residual_below_threshold");
  assert.deepEqual(plan.deferredChecks, [{
    id: "state-proof-b",
    reason: "no_positive_value",
    marginalExpectedAvoidedLoss: 0,
    avoidedLossPerEffortUnit: 0,
  }]);
});

test("insufficient budget reports a mandatory release risk without retrying", () => {
  const plan = planInspections({
    calibration: { authority: "approved_operator", revision: "release-gate-r4" },
    policy: { ...INSPECTION_POLICY_PRESETS.promotion, maxChecksPerPass: 1, maxTotalCostUnits: 2, maxTotalTimeUnits: 2 },
    risks: [{ id: "unsafe-promotion", probability: 0.4, missCost: 1_000, rerunCost: 50, releaseBlocking: true }],
    checks: [{ id: "release-audit", mandatory: true, costUnits: 3, timeUnits: 3, detectionProbabilities: { "unsafe-promotion": 0.99 } }],
  });

  assert.deepEqual(plan.selectedChecks, []);
  assert.deepEqual(plan.uncoveredMandatoryRiskIds, ["unsafe-promotion"]);
  assert.equal(plan.stopReason, "mandatory_uncovered");
  assert.equal(plan.deferredChecks[0].reason, "mandatory_budget");
  assert.equal(plan.totalCostUnits, 0);
  assert.equal(plan.totalTimeUnits, 0);
});

test("planner rejects uncalibrated probabilities and unknown risk mappings", () => {
  assert.throws(() => planInspections({
    calibration,
    policy: INSPECTION_POLICY_PRESETS.standard,
    risks: [{ id: "known", probability: 0.5, missCost: 10, rerunCost: 1 }],
    checks: [{ id: "bad", costUnits: 1, timeUnits: 1, detectionProbabilities: { invented: 0.9 } }],
  }), /unknown risk invented/i);
});

test("a check whose rerun consequence exceeds its avoided miss has no positive value", () => {
  const plan = planInspections({
    calibration,
    policy: { ...INSPECTION_POLICY_PRESETS.standard, residualLossThreshold: 0 },
    risks: [{ id: "cosmetic", probability: 0.2, missCost: 5, rerunCost: 20 }],
    checks: [{ id: "expensive-review", costUnits: 1, timeUnits: 1, detectionProbabilities: { cosmetic: 0.9 } }],
  });

  assert.deepEqual(plan.selectedChecks, []);
  assert.equal(plan.stopReason, "no_positive_value");
  assert.equal(plan.deferredChecks[0].reason, "no_positive_value");
});

test("the expensive_rerender policy remains a compatible alias for high_rework", () => {
  const { consequenceClass: ignoredNewClass, ...highRework } = INSPECTION_POLICY_PRESETS.high_rework;
  const { consequenceClass: ignoredOldClass, ...legacy } = INSPECTION_POLICY_PRESETS.expensive_rerender;
  assert.equal(ignoredNewClass, "high_rework");
  assert.equal(ignoredOldClass, "expensive_rerender");
  assert.deepEqual(legacy, highRework);
});

test("same-signal checks do not compound mandatory detection without a joint calibration", () => {
  const base = {
    calibration,
    policy: { ...INSPECTION_POLICY_PRESETS.promotion, minimumMandatoryDetectionProbability: 0.95 },
    risks: [{ id: "release-contradiction", probability: 0.4, missCost: 1_000, rerunCost: 30, releaseBlocking: true }],
    checks: [
      {
        id: "review-a",
        costUnits: 1,
        timeUnits: 1,
        evidenceFamily: "same-build-log",
        detectionProbabilities: { "release-contradiction": 0.8 },
      },
      {
        id: "review-b",
        costUnits: 1,
        timeUnits: 1,
        evidenceFamily: "same-build-log",
        detectionProbabilities: { "release-contradiction": 0.8 },
      },
    ],
  };

  const uncalibrated = planInspections(base);
  assert.deepEqual(uncalibrated.uncoveredMandatoryRiskIds, ["release-contradiction"]);
  assert.equal(uncalibrated.stopReason, "mandatory_uncovered");
  assert.equal(uncalibrated.selectedChecks.length, 1);

  const calibrated = planInspections({
    ...base,
    jointDetectionCalibrations: [{
      id: "joint-log-review-r1",
      riskId: "release-contradiction",
      checkIds: ["review-a", "review-b"],
      combinedDetectionProbability: 0.96,
      calibration: { authority: "measured_history", revision: "joint-log-study-r1" },
    }],
  });
  assert.deepEqual(calibrated.selectedChecks.map((check) => check.id), ["review-a", "review-b"]);
  assert.deepEqual(calibrated.uncoveredMandatoryRiskIds, []);
});

test("a shared independence group also prevents cross-family signal stacking", () => {
  const plan = planInspections({
    calibration,
    policy: { ...INSPECTION_POLICY_PRESETS.promotion, minimumMandatoryDetectionProbability: 0.95 },
    risks: [{ id: "shared-parser-miss", probability: 0.3, missCost: 900, rerunCost: 20, mandatory: true }],
    checks: [
      {
        id: "json-view",
        costUnits: 1,
        timeUnits: 1,
        evidenceFamily: "json-export",
        independenceGroup: "same-parser-channel",
        detectionProbabilities: { "shared-parser-miss": 0.8 },
      },
      {
        id: "csv-view",
        costUnits: 1,
        timeUnits: 1,
        evidenceFamily: "csv-export",
        independenceGroup: "same-parser-channel",
        detectionProbabilities: { "shared-parser-miss": 0.8 },
      },
    ],
  });

  assert.deepEqual(plan.uncoveredMandatoryRiskIds, ["shared-parser-miss"]);
  assert.equal(plan.selectedChecks.length, 1);
});

test("labels never manufacture independence for a release gate", () => {
  const base = {
    calibration,
    policy: { ...INSPECTION_POLICY_PRESETS.promotion, minimumMandatoryDetectionProbability: 0.95 },
    risks: [{ id: "unknown-correlation", probability: 0.4, missCost: 1_000, rerunCost: 20, releaseBlocking: true }],
    checks: [
      { id: "review-one", costUnits: 1, timeUnits: 1, evidenceFamily: "file-a", detectionProbabilities: { "unknown-correlation": 0.8 } },
      { id: "review-two", costUnits: 1, timeUnits: 1, evidenceFamily: "file-b", detectionProbabilities: { "unknown-correlation": 0.8 } },
    ],
  };

  const unknown = planInspections(base);
  assert.deepEqual(unknown.uncoveredMandatoryRiskIds, ["unknown-correlation"]);
  assert.equal(unknown.selectedChecks.length, 1);

  const differentlyLabelled = planInspections({
    ...base,
    checks: [
      { ...base.checks[0], independenceGroup: "human-source-review" },
      { ...base.checks[1], independenceGroup: "runtime-observation" },
    ],
  });
  assert.deepEqual(differentlyLabelled.uncoveredMandatoryRiskIds, ["unknown-correlation"]);
  assert.equal(differentlyLabelled.selectedChecks.length, 1);
});

test("bounded feasibility search avoids the classic greedy-stranding combination", () => {
  const plan = planInspections({
    calibration,
    policy: {
      ...INSPECTION_POLICY_PRESETS.promotion,
      maxChecksPerPass: 2,
      maxTotalCostUnits: 2,
      maxTotalTimeUnits: 2,
      minimumMandatoryDetectionProbability: 0.95,
    },
    risks: [
      { id: "state-a", probability: 0.5, missCost: 100, rerunCost: 1, releaseBlocking: true },
      { id: "state-b", probability: 0.5, missCost: 100, rerunCost: 1, releaseBlocking: true },
    ],
    checks: [
      { id: "tempting-partial", costUnits: 1, timeUnits: 1, detectionProbabilities: { "state-a": 0.8, "state-b": 0.8 } },
      { id: "proof-a", costUnits: 1, timeUnits: 1, detectionProbabilities: { "state-a": 0.95 } },
      { id: "proof-b", costUnits: 1, timeUnits: 1, detectionProbabilities: { "state-b": 0.95 } },
    ],
  });

  assert.deepEqual(plan.selectedChecks.map((check) => check.id), ["proof-a", "proof-b"]);
  assert.deepEqual(plan.uncoveredMandatoryRiskIds, []);
});

test("release-blocking policy is enforced even when calibrated incidence is zero", () => {
  const plan = planInspections({
    calibration,
    policy: { ...INSPECTION_POLICY_PRESETS.promotion, minimumMandatoryDetectionProbability: 0.95 },
    risks: [{
      id: "policy-contradiction",
      probability: 0,
      missCost: 10_000,
      rerunCost: 100,
      releaseBlocking: true,
    }],
    checks: [{
      id: "policy-proof",
      costUnits: 1,
      timeUnits: 1,
      detectionProbabilities: { "policy-contradiction": 1 },
    }],
  });

  assert.deepEqual(plan.selectedChecks.map((check) => check.id), ["policy-proof"]);
  assert.deepEqual(plan.uncoveredMandatoryRiskIds, []);
  assert.equal(plan.selectedChecks[0].marginalExpectedAvoidedLoss, 0);
});

test("mandatory selection agrees with an independent conservative exhaustive oracle", () => {
  const risks = [
    { id: "a", probability: 0.3, missCost: 80, rerunCost: 2, releaseBlocking: true },
    { id: "b", probability: 0.2, missCost: 120, rerunCost: 3, mandatory: true },
    { id: "optional", probability: 0.1, missCost: 20, rerunCost: 1 },
  ];
  const checks = [
    { id: "wide", costUnits: 3, timeUnits: 2, detectionProbabilities: { a: 0.96, b: 0.96 } },
    { id: "a-only", costUnits: 1, timeUnits: 1, detectionProbabilities: { a: 0.97 } },
    { id: "b-only", costUnits: 1, timeUnits: 1, detectionProbabilities: { b: 0.97 } },
    { id: "optional-proof", costUnits: 1, timeUnits: 1, detectionProbabilities: { optional: 0.9 } },
  ];
  const policy = {
    ...INSPECTION_POLICY_PRESETS.promotion,
    maxChecksPerPass: 2,
    maxTotalCostUnits: 4,
    maxTotalTimeUnits: 4,
    minimumMandatoryDetectionProbability: 0.95,
    residualLossThreshold: 0,
  };

  const oracle = exhaustiveConservativeMandatoryOracle(risks, checks, policy);
  const plan = planInspections({ calibration, risks, checks, policy });
  const mandatoryPhaseIds = plan.selectedChecks
    .filter((check) => check.reason !== "expected_value")
    .map((check) => check.id);
  assert.deepEqual(mandatoryPhaseIds, oracle);
  assert.deepEqual(oracle, ["a-only", "b-only"]);
});

const unrelatedDomainFixtures = [
  {
    name: "software rollout",
    policy: { ...INSPECTION_POLICY_PRESETS.promotion, minimumMandatoryDetectionProbability: 0.95 },
    risks: [{ id: "rollback-path-broken", probability: 0.12, missCost: 5_000, rerunCost: 80, releaseBlocking: true }],
    checks: [{ id: "staging-rollback-drill", costUnits: 3, timeUnits: 4, independenceGroup: "staging", detectionProbabilities: { "rollback-path-broken": 0.98 } }],
  },
  {
    name: "financial reconciliation",
    policy: { ...INSPECTION_POLICY_PRESETS.high_rework, minimumMandatoryDetectionProbability: 0.98 },
    risks: [{ id: "unexplained-balance", probability: 0.08, missCost: 20_000, rerunCost: 200, mandatory: true }],
    checks: [{ id: "independent-ledger-tieout", costUnits: 5, timeUnits: 5, independenceGroup: "external-ledger", detectionProbabilities: { "unexplained-balance": 0.99 } }],
  },
  {
    name: "data migration",
    policy: { ...INSPECTION_POLICY_PRESETS.high_rework, minimumMandatoryDetectionProbability: 0.97 },
    risks: [{ id: "referential-loss", probability: 0.18, missCost: 15_000, rerunCost: 300, releaseBlocking: true }],
    checks: [{ id: "post-copy-foreign-key-proof", costUnits: 4, timeUnits: 4, independenceGroup: "destination-db", detectionProbabilities: { "referential-loss": 0.99 } }],
  },
];

for (const fixture of unrelatedDomainFixtures) {
  test(`the same planner clears a bounded ${fixture.name} gate`, () => {
    const plan = planInspections({
      calibration: { authority: "approved_operator", revision: `${fixture.name.replaceAll(" ", "-")}-r1` },
      policy: fixture.policy,
      risks: fixture.risks,
      checks: fixture.checks,
    });
    assert.deepEqual(plan.uncoveredMandatoryRiskIds, []);
    assert.equal(plan.selectedChecks.length, 1);
  });
}

test("candidate enumeration is capped and only explicit joint evidence may combine signals", () => {
  assert.throws(() => planInspections({
    calibration,
    policy: INSPECTION_POLICY_PRESETS.standard,
    risks: [],
    checks: Array.from({ length: MAX_INSPECTION_CHECKS + 1 }, (_, index) => ({
      id: `check-${index}`,
      costUnits: 0,
      timeUnits: 0,
      detectionProbabilities: {},
    })),
  }), new RegExp(`at most ${MAX_INSPECTION_CHECKS} candidates`, "i"));

  const calibratedAcrossLabels = planInspections({
    calibration,
    policy: INSPECTION_POLICY_PRESETS.promotion,
    risks: [{ id: "risk", probability: 0.5, missCost: 10, rerunCost: 1, mandatory: true }],
    checks: [
      { id: "a", costUnits: 1, timeUnits: 1, evidenceFamily: "family-a", independenceGroup: "channel-a", detectionProbabilities: { risk: 0.7 } },
      { id: "b", costUnits: 1, timeUnits: 1, evidenceFamily: "family-b", independenceGroup: "channel-b", detectionProbabilities: { risk: 0.7 } },
    ],
    jointDetectionCalibrations: [{
      id: "invalid-cross-family-joint",
      riskId: "risk",
      checkIds: ["a", "b"],
      combinedDetectionProbability: 0.95,
      calibration,
    }],
  });
  assert.deepEqual(calibratedAcrossLabels.uncoveredMandatoryRiskIds, []);
  assert.deepEqual(calibratedAcrossLabels.selectedChecks.map((check) => check.id), ["a", "b"]);
});

function exhaustiveConservativeMandatoryOracle(risks, checks, policy) {
  const mandatoryRisks = risks.filter((risk) => risk.mandatory || risk.releaseBlocking);
  const feasible = [];
  for (let mask = 0; mask < 2 ** checks.length; mask += 1) {
    const selected = checks.filter((_, index) => (mask & (2 ** index)) !== 0);
    const cost = selected.reduce((total, check) => total + check.costUnits, 0);
    const time = selected.reduce((total, check) => total + check.timeUnits, 0);
    if (selected.length > policy.maxChecksPerPass
      || cost > policy.maxTotalCostUnits
      || time > policy.maxTotalTimeUnits) continue;
    const clears = mandatoryRisks.every((risk) => Math.max(
      0,
      ...selected.map((check) => check.detectionProbabilities[risk.id] ?? 0),
    ) >= policy.minimumMandatoryDetectionProbability);
    if (!clears) continue;
    feasible.push({
      selected,
      effort: cost + time * policy.timeUnitWeight,
      cost,
      time,
    });
  }
  feasible.sort((left, right) =>
    left.effort - right.effort
      || left.selected.length - right.selected.length
      || left.cost - right.cost
      || left.time - right.time
      || left.selected.map((check) => check.id).join("\0")
        .localeCompare(right.selected.map((check) => check.id).join("\0")));
  return feasible[0].selected.map((check) => check.id);
}

test("a statistically useful check is still skipped when its expected saving is smaller than inspection effort", () => {
  const plan = planInspections({
    calibration,
    policy: { ...INSPECTION_POLICY_PRESETS.standard, residualLossThreshold: 0 },
    risks: [{ id: "minor-copy-risk", probability: 0.01, missCost: 5, rerunCost: 0 }],
    checks: [{ id: "slow-copy-audit", costUnits: 5, timeUnits: 5, detectionProbabilities: { "minor-copy-risk": 1 } }],
  });

  assert.deepEqual(plan.selectedChecks, []);
  assert.equal(plan.stopReason, "no_positive_value");
  assert.ok(plan.deferredChecks[0].marginalExpectedAvoidedLoss > 0);
  assert.equal(plan.deferredChecks[0].reason, "no_positive_value");
});

test("global subset optimization can buy a calibrated bundle that no member justifies alone", () => {
  const plan = planInspections({
    calibration,
    policy: {
      ...INSPECTION_POLICY_PRESETS.promotion,
      maxChecksPerPass: 2,
      maxTotalCostUnits: 2,
      maxTotalTimeUnits: 2,
      effortUnitCost: 1,
      residualLossThreshold: 0,
      minimumMandatoryDetectionProbability: 0.95,
    },
    risks: [
      { id: "release-proof", probability: 0, missCost: 100, rerunCost: 0, releaseBlocking: true },
      { id: "latent-sequence-defect", probability: 1, missCost: 1_000, rerunCost: 0 },
    ],
    checks: [
      {
        id: "cheap-gate-only",
        costUnits: 0.1,
        timeUnits: 0,
        detectionProbabilities: { "release-proof": 0.95 },
      },
      {
        id: "gate-and-first-signal",
        costUnits: 1,
        timeUnits: 0,
        evidenceFamily: "sequence-observation",
        detectionProbabilities: { "release-proof": 0.95, "latent-sequence-defect": 0.0001 },
      },
      {
        id: "second-signal",
        costUnits: 1,
        timeUnits: 0,
        evidenceFamily: "sequence-observation",
        detectionProbabilities: { "latent-sequence-defect": 0.0001 },
      },
    ],
    jointDetectionCalibrations: [{
      id: "sequence-pair-r1",
      riskId: "latent-sequence-defect",
      checkIds: ["gate-and-first-signal", "second-signal"],
      combinedDetectionProbability: 0.95,
      calibration: { authority: "measured_history", revision: "joint-log-study-r1" },
    }],
  });

  assert.deepEqual(plan.selectedChecks.map((check) => check.id), [
    "gate-and-first-signal",
    "second-signal",
  ]);
  assert.deepEqual(plan.selectedChecks.map((check) => check.reason), [
    "mandatory_risk",
    "expected_value",
  ]);
  assert.equal(plan.deferredChecks.find((check) => check.id === "cheap-gate-only").reason, "no_positive_value");
  assert.ok(plan.selectedChecks[0].marginalExpectedAvoidedLoss < 1);
  assert.ok(plan.selectedChecks[1].marginalExpectedAvoidedLoss > 900);
});

test("calibration must resolve server-side, remain current, and uses conservative uncertainty bounds", () => {
  assert.throws(() => planInspections({
    calibration: { authority: "server_policy", revision: "request-invented-r1" },
    policy: INSPECTION_POLICY_PRESETS.standard,
    risks: [],
    checks: [],
  }), /not approved by the server registry/i);

  assert.throws(() => planInspections({
    calibration: { authority: "server_policy", revision: "expired-policy-r1" },
    policy: INSPECTION_POLICY_PRESETS.standard,
    risks: [],
    checks: [],
  }), /not valid at evaluatedAt/i);

  const lowerBounded = planInspections({
    calibration: { authority: "measured_history", revision: "conservative-detection-r1" },
    policy: { ...INSPECTION_POLICY_PRESETS.promotion, minimumMandatoryDetectionProbability: 0.95 },
    risks: [{ id: "calibration-sensitive-gate", probability: 0.4, missCost: 1_000, rerunCost: 20, releaseBlocking: true }],
    checks: [{
      id: "nominally-sufficient-check",
      costUnits: 1,
      timeUnits: 1,
      detectionProbabilities: { "calibration-sensitive-gate": 0.96 },
    }],
  });
  assert.deepEqual(lowerBounded.uncoveredMandatoryRiskIds, ["calibration-sensitive-gate"]);
  assert.equal(lowerBounded.stopReason, "mandatory_uncovered");
  assert.equal(lowerBounded.calibrationProvenance[0].detectionProbabilityLowerBoundFactor, 0.95);

  const upperBounded = planInspections({
    calibration: { authority: "measured_history", revision: "conservative-incidence-r1" },
    policy: { ...INSPECTION_POLICY_PRESETS.standard, maxChecksPerPass: 0, residualLossThreshold: 0 },
    risks: [{ id: "uncertain-incidence", probability: 0.1, missCost: 100, rerunCost: 0 }],
    checks: [],
  });
  assert.equal(upperBounded.residualExpectedLoss, 20);
});

test("the approved calibration is bound to the exact risk and inspection catalog", () => {
  const approved = {
    calibration,
    policy: INSPECTION_POLICY_PRESETS.standard,
    risks: [{ id: "bound-risk", probability: 0.2, missCost: 100, rerunCost: 5 }],
    checks: [{
      id: "bound-check",
      costUnits: 1,
      timeUnits: 1,
      independenceGroup: "review-channel",
      detectionProbabilities: { "bound-risk": 0.8 },
    }],
  };
  const approvedRuntime = bindPlannerRuntime(approved);
  const replay = runPlanInspections(structuredClone(approved), approvedRuntime);
  assert.equal(replay.calibrationProvenance[0].catalogBound, true);

  const altered = structuredClone(approved);
  altered.checks[0].independenceGroup = "invented-independent-channel";
  assert.throws(
    () => runPlanInspections(altered, approvedRuntime),
    /not approved for this exact inspection catalog/i,
  );
  const alteredProbability = structuredClone(approved);
  alteredProbability.risks[0].probability = 0.01;
  assert.throws(
    () => runPlanInspections(alteredProbability, approvedRuntime),
    /not approved for this exact inspection catalog/i,
  );
});

test("catalog approval and planning are invariant to caller array order", () => {
  const first = {
    calibration,
    policy: { ...INSPECTION_POLICY_PRESETS.lookup, maxChecksPerPass: 1 },
    risks: [
      { id: "risk-z", probability: 0.2, missCost: 100, rerunCost: 0 },
      { id: "risk-a", probability: 0.2, missCost: 100, rerunCost: 0 },
    ],
    checks: [
      { id: "beta", costUnits: 0.1, timeUnits: 0.1, detectionProbabilities: { "risk-z": 0.8, "risk-a": 0.8 } },
      { id: "alpha", costUnits: 0.1, timeUnits: 0.1, detectionProbabilities: { "risk-z": 0.8, "risk-a": 0.8 } },
    ],
  };
  const reordered = {
    ...structuredClone(first),
    risks: [...first.risks].reverse(),
    checks: [...first.checks].reverse().map((check) => ({
      ...check,
      detectionProbabilities: Object.fromEntries(Object.entries(check.detectionProbabilities).reverse()),
    })),
  };
  const approvedRuntime = bindPlannerRuntime(first);

  assert.equal(canonicalInspectionCatalog(first), canonicalInspectionCatalog(reordered));
  const firstPlan = runPlanInspections(first, approvedRuntime);
  const reorderedPlan = runPlanInspections(reordered, approvedRuntime);
  assert.deepEqual(reorderedPlan, firstPlan);
  assert.deepEqual(firstPlan.selectedChecks.map((check) => check.id), ["alpha"]);
});

test("canonical catalog fixes semantic field order and enforces its own input cap", () => {
  const normal = {
    calibration,
    policy: { ...INSPECTION_POLICY_PRESETS.standard },
    risks: [{ id: "bounded", probability: 0.1, missCost: 1, rerunCost: 0 }],
    checks: [],
  };
  const p = normal.policy;
  const reorderedPolicy = {
    minimumMandatoryDetectionProbability: p.minimumMandatoryDetectionProbability,
    residualLossThreshold: p.residualLossThreshold,
    effortUnitCost: p.effortUnitCost,
    timeUnitWeight: p.timeUnitWeight,
    maxTotalTimeUnits: p.maxTotalTimeUnits,
    maxTotalCostUnits: p.maxTotalCostUnits,
    maxChecksPerPass: p.maxChecksPerPass,
    consequenceClass: p.consequenceClass,
  };
  assert.equal(
    canonicalInspectionCatalog(normal),
    canonicalInspectionCatalog({ ...normal, policy: reorderedPolicy }),
  );
  assert.throws(() => canonicalInspectionCatalog({
    ...normal,
    risks: Array.from({ length: MAX_INSPECTION_RISKS + 1 }, (_, index) => ({
      id: `direct-catalog-risk-${index}`,
      probability: 0,
      missCost: 0,
      rerunCost: 0,
    })),
  }), new RegExp(`at most ${MAX_INSPECTION_RISKS} entries`, "i"));
});

test("mixed cost scales preserve a smaller economically valuable check", () => {
  const smallRisks = Array.from({ length: 15 }, (_, index) => ({
    id: `small-${String(index).padStart(2, "0")}`,
    probability: 1,
    missCost: 0.00005,
    rerunCost: 0,
  }));
  const input = {
    calibration,
    policy: {
      ...INSPECTION_POLICY_PRESETS.standard,
      maxChecksPerPass: 1,
      maxTotalCostUnits: 1,
      maxTotalTimeUnits: 1,
      timeUnitWeight: 0,
      effortUnitCost: 1,
      residualLossThreshold: 0,
    },
    risks: [
      { id: "large-common", probability: 1, missCost: 1_000_000_000_000, rerunCost: 0 },
      ...smallRisks,
    ],
    checks: [{
      id: "small-risk-check",
      costUnits: 0.0003,
      timeUnits: 0,
      detectionProbabilities: Object.fromEntries(smallRisks.map((risk) => [risk.id, 1])),
    }],
  };
  const reversed = { ...structuredClone(input), risks: [...input.risks].reverse() };
  const runtime = bindPlannerRuntime(input);
  const first = runPlanInspections(input, runtime);
  const second = runPlanInspections(reversed, runtime);

  assert.deepEqual(first.selectedChecks.map((check) => check.id), ["small-risk-check"]);
  assert.equal(first.selectedChecks[0].marginalExpectedAvoidedLoss, 0.00075);
  assert.deepEqual(second, first);
});

test("a sub-ULP residual above a large threshold still triggers a worthwhile check", () => {
  const input = {
    calibration,
    policy: {
      ...INSPECTION_POLICY_PRESETS.standard,
      maxChecksPerPass: 1,
      maxTotalCostUnits: 1,
      maxTotalTimeUnits: 1,
      timeUnitWeight: 0,
      effortUnitCost: 1,
      residualLossThreshold: 1_000_000_000_000,
    },
    risks: [
      { id: "large-threshold-floor", probability: 1, missCost: 1_000_000_000_000, rerunCost: 0 },
      { id: "small-actionable-risk", probability: 1, missCost: 0.00005, rerunCost: 0 },
    ],
    checks: [{
      id: "small-actionable-check",
      costUnits: 0.00001,
      timeUnits: 0,
      detectionProbabilities: { "small-actionable-risk": 1 },
    }],
  };
  const reversed = { ...structuredClone(input), risks: [...input.risks].reverse() };
  const runtime = bindPlannerRuntime(input);
  const first = runPlanInspections(input, runtime);
  const second = runPlanInspections(reversed, runtime);

  assert.deepEqual(first.selectedChecks.map((check) => check.id), ["small-actionable-check"]);
  assert.equal(first.stopReason, "residual_below_threshold");
  assert.deepEqual(second, first);
});

test("hard cost and time ceilings do not admit a swallowed tiny overage", () => {
  for (const constrainedField of ["costUnits", "timeUnits"]) {
    const otherField = constrainedField === "costUnits" ? "timeUnits" : "costUnits";
    const input = {
      calibration,
      policy: {
        ...INSPECTION_POLICY_PRESETS.high_rework,
        maxChecksPerPass: 2,
        maxTotalCostUnits: constrainedField === "costUnits" ? 1_000_000_000_000 : 1,
        maxTotalTimeUnits: constrainedField === "timeUnits" ? 1_000_000_000_000 : 1,
      },
      risks: [],
      checks: [
        {
          id: `${constrainedField}-large-mandatory`,
          mandatory: true,
          [constrainedField]: 1_000_000_000_000,
          [otherField]: 0,
          detectionProbabilities: {},
        },
        {
          id: `${constrainedField}-small-mandatory`,
          mandatory: true,
          [constrainedField]: 0.00005,
          [otherField]: 0,
          detectionProbabilities: {},
        },
      ],
    };
    const plan = planInspections(input);
    assert.equal(plan.selectedChecks.length, 1);
    assert.equal(plan.selectedChecks[0].id, `${constrainedField}-small-mandatory`);
    assert.equal(plan.stopReason, "mandatory_uncovered");
  }
});

test("a mandatory detection value infinitesimally below its gate fails closed", () => {
  const plan = planInspections({
    calibration,
    policy: {
      ...INSPECTION_POLICY_PRESETS.promotion,
      minimumMandatoryDetectionProbability: 0.95,
    },
    risks: [{
      id: "near-gate-release-risk",
      probability: 1,
      missCost: 100,
      rerunCost: 0,
      releaseBlocking: true,
    }],
    checks: [{
      id: "near-gate-check",
      costUnits: 0,
      timeUnits: 0,
      detectionProbabilities: { "near-gate-release-risk": 0.95 - 5e-13 },
    }],
  });

  assert.deepEqual(plan.selectedChecks.map((check) => check.id), ["near-gate-check"]);
  assert.deepEqual(plan.uncoveredMandatoryRiskIds, ["near-gate-release-risk"]);
  assert.equal(plan.stopReason, "mandatory_uncovered");
});

test("timestamps and numeric magnitudes fail closed before optimization", () => {
  const small = {
    calibration,
    policy: INSPECTION_POLICY_PRESETS.standard,
    risks: [{ id: "finite-risk", probability: 0.2, missCost: 100, rerunCost: 5 }],
    checks: [{ id: "finite-check", costUnits: 1, timeUnits: 1, detectionProbabilities: { "finite-risk": 0.8 } }],
  };
  const naturalLanguageRuntime = bindPlannerRuntime(small, {
    ...plannerRuntime,
    evaluatedAt: "July 20, 2026",
  });
  assert.throws(
    () => runPlanInspections(small, naturalLanguageRuntime),
    /RFC3339 timestamp with an explicit timezone/i,
  );
  const timezoneLessRuntime = bindPlannerRuntime(small, {
    ...plannerRuntime,
    evaluatedAt: "2026-07-20T00:00:00",
  });
  assert.throws(
    () => runPlanInspections(small, timezoneLessRuntime),
    /RFC3339 timestamp with an explicit timezone/i,
  );
  const impossibleDateRuntime = bindPlannerRuntime(small, {
    ...plannerRuntime,
    evaluatedAt: "2026-02-30T00:00:00Z",
  });
  assert.throws(
    () => runPlanInspections(small, impossibleDateRuntime),
    /valid RFC3339 timestamp/i,
  );
  const subMillisecondRuntime = bindPlannerRuntime(small, {
    ...plannerRuntime,
    evaluatedAt: "2026-07-20T00:00:00.0001Z",
    calibrationRegistry: {
      ...plannerRuntime.calibrationRegistry,
      approvals: plannerRuntime.calibrationRegistry.approvals.map((approval) =>
        approval.authority === calibration.authority && approval.revision === calibration.revision
          ? {
              ...approval,
              validFrom: "2026-07-20T00:00:00.0009Z",
              expiresAt: "2027-01-01T00:00:00Z",
            }
          : approval),
    },
  });
  assert.throws(
    () => runPlanInspections(small, subMillisecondRuntime),
    /not valid at evaluatedAt/i,
  );

  const unsafe = structuredClone(small);
  unsafe.risks[0].missCost = Number.MAX_VALUE;
  assert.throws(() => planInspections(unsafe), /no larger than/i);
  const safePlan = planInspections(small);
  assert.doesNotMatch(JSON.stringify(safePlan), /null/);
});

test("risk, edge, identifier, and label inputs have explicit hard ceilings", () => {
  assert.throws(() => planInspections({
    calibration,
    policy: INSPECTION_POLICY_PRESETS.standard,
    risks: Array.from({ length: MAX_INSPECTION_RISKS + 1 }, (_, index) => ({
      id: `risk-${index}`,
      probability: 0,
      missCost: 0,
      rerunCost: 0,
    })),
    checks: [],
  }), new RegExp(`at most ${MAX_INSPECTION_RISKS} entries`, "i"));

  const cappedRisks = Array.from({ length: MAX_INSPECTION_RISKS }, (_, index) => ({
    id: `edge-risk-${index}`,
    probability: 0,
    missCost: 0,
    rerunCost: 0,
  }));
  assert.throws(() => planInspections({
    calibration,
    policy: INSPECTION_POLICY_PRESETS.standard,
    risks: cappedRisks,
    checks: Array.from({ length: Math.ceil((MAX_DETECTION_EDGES + 1) / MAX_INSPECTION_RISKS) }, (_, checkIndex) => ({
      id: `dense-check-${checkIndex}`,
      costUnits: 0,
      timeUnits: 0,
      detectionProbabilities: Object.fromEntries(cappedRisks.map((risk) => [risk.id, 0])),
    })),
  }), new RegExp(`at most ${MAX_DETECTION_EDGES} total edges`, "i"));

  assert.throws(() => planInspections({
    calibration,
    policy: INSPECTION_POLICY_PRESETS.standard,
    risks: [{
      id: "r".repeat(MAX_INSPECTION_ID_LENGTH + 1),
      probability: 0,
      missCost: 0,
      rerunCost: 0,
    }],
    checks: [],
  }), new RegExp(`at most ${MAX_INSPECTION_ID_LENGTH} characters`, "i"));

  assert.throws(() => planInspections({
    calibration,
    policy: INSPECTION_POLICY_PRESETS.standard,
    risks: [],
    checks: [{
      id: "label-check",
      costUnits: 0,
      timeUnits: 0,
      evidenceFamily: "f".repeat(MAX_INSPECTION_LABEL_LENGTH + 1),
      detectionProbabilities: {},
    }],
  }), new RegExp(`at most ${MAX_INSPECTION_LABEL_LENGTH} characters`, "i"));

  assert.throws(() => planInspections({
    calibration,
    policy: INSPECTION_POLICY_PRESETS.standard,
    risks: [{ id: "typed-risk", probability: 0, missCost: 0, rerunCost: 0, mandatory: "false" }],
    checks: [],
  }), /mandatory must be a boolean/i);
  assert.throws(() => planInspections({
    calibration,
    policy: INSPECTION_POLICY_PRESETS.standard,
    risks: [],
    checks: [{ id: "typed-check", costUnits: 0, timeUnits: 0, mandatory: "false", detectionProbabilities: {} }],
  }), /mandatory must be a boolean/i);
});

test("the maximum candidate set remains a single finite pass", () => {
  const plan = planInspections({
    calibration,
    policy: { ...INSPECTION_POLICY_PRESETS.high_rework, maxChecksPerPass: MAX_INSPECTION_CHECKS },
    risks: [{ id: "bounded-stress", probability: 0.5, missCost: 10, rerunCost: 0 }],
    checks: Array.from({ length: MAX_INSPECTION_CHECKS }, (_, index) => ({
      id: `bounded-check-${index}`,
      costUnits: 0.1,
      timeUnits: 0.1,
      evidenceFamily: "one-signal",
      detectionProbabilities: { "bounded-stress": index === 0 ? 0.9 : 0.1 },
    })),
  });
  assert.deepEqual(plan.selectedChecks.map((check) => check.id), ["bounded-check-0"]);
  assert.equal(plan.deferredChecks.length, MAX_INSPECTION_CHECKS - 1);
});

test("the maximum structural risk and joint shape remains inside the work ceiling", () => {
  const risks = Array.from({ length: MAX_INSPECTION_RISKS }, (_, index) => ({
    id: `max-risk-${index}`,
    probability: 0.1,
    missCost: 100,
    rerunCost: 5,
    releaseBlocking: true,
  }));
  const checks = Array.from({ length: MAX_INSPECTION_CHECKS }, (_, index) => ({
    id: `max-check-${index}`,
    costUnits: 0.1,
    timeUnits: 0.1,
    detectionProbabilities: Object.fromEntries(risks.flatMap((risk, riskIndex) =>
      index * risks.length + riskIndex < MAX_DETECTION_EDGES ? [[risk.id, 0.1]] : [])),
  }));
  const jointBundles = [];
  for (let omittedLeft = 0; omittedLeft < checks.length && jointBundles.length < 64; omittedLeft += 1) {
    for (let omittedRight = omittedLeft + 1; omittedRight < checks.length && jointBundles.length < 64; omittedRight += 1) {
      jointBundles.push(checks
        .filter((_check, index) => index !== omittedLeft && index !== omittedRight)
        .map((check) => check.id));
    }
  }
  const input = {
    calibration,
    policy: { ...INSPECTION_POLICY_PRESETS.high_rework, maxChecksPerPass: MAX_INSPECTION_CHECKS },
    risks,
    checks,
    jointDetectionCalibrations: jointBundles.map((checkIds, index) => ({
      id: `max-joint-${index}`,
      riskId: risks[0].id,
      checkIds,
      combinedDetectionProbability: 0.2,
      calibration: { authority: "measured_history", revision: "joint-log-study-r1" },
    })),
  };
  assert.equal(checks.reduce((total, check) => total + Object.keys(check.detectionProbabilities).length, 0), MAX_DETECTION_EDGES);
  assert.equal(input.jointDetectionCalibrations.length, 64);
  assert.ok(input.jointDetectionCalibrations.every((joint) => joint.checkIds.length === MAX_INSPECTION_CHECKS - 2));
  const plan = planInspections(input);
  assert.ok(plan.selectedChecks.length <= MAX_INSPECTION_CHECKS);
  assert.doesNotMatch(JSON.stringify(plan), /null/);
});
