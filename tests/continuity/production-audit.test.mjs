import assert from "node:assert/strict";
import test from "node:test";

import {
  auditProductionProcess,
  PRODUCTION_AUDIT_LIMITS,
  ProductionAuditInputError,
  PRODUCTION_AUDIT_VERSION,
} from "../../lib/continuity/production-audit.ts";

function evidence(id, role, authority = "production", claimKinds = []) {
  return {
    id,
    projectId: "project-a",
    sourceId: `SRC-${id}`,
    sourceVersionId: `SRC-${id}@v1`,
    title: `${role}/${id}.md`,
    locator: `${role}/${id}.md#1`,
    text: id,
    score: 1,
    authority,
    role,
    lifecycle: "active",
    claimKinds,
  };
}

function state(order, events, trueAtoms) {
  return {
    position: { axis: "step", order },
    trueAtoms,
    falseAtoms: [],
    balances: [],
    permissions: [],
    knowledge: [],
    eventHistory: events.map((eventKey, index) => ({ eventKey, position: index + 1 })),
    applications: [],
  };
}

function rule(ruleId, conditionEvent, eventKey, atomKey, at, evidenceId) {
  return {
    ruleId,
    label: ruleId,
    admission: "established",
    plane: "observed",
    activation: { kind: "automatic" },
    conditions: conditionEvent
      ? [{ id: `${ruleId}-condition`, kind: "event", eventKey: conditionEvent, state: "occurred" }]
      : [],
    effects: [
      { id: `${ruleId}-event`, kind: "emit_event", eventKey },
      { id: `${ruleId}-fact`, kind: "set_fact", atomKey, value: true },
    ],
    idempotency: { mode: "once", applicationKey: ruleId },
    window: { axis: "step", earliest: at, latest: at, duration: 0 },
    evidenceIds: [evidenceId],
  };
}

function baseRequest() {
  const evidenceRecords = [
    evidence("INTENT-1", "intent", "canon", ["normative"]),
    evidence("INTENT-2", "intent", "canon", ["normative"]),
    evidence("INTENT-3", "intent", "canon", ["normative"]),
    evidence("OBS-1", "observation", "production", ["observed"]),
    evidence("OBS-2", "observation", "production", ["observed"]),
    evidence("OBS-3", "observation", "production", ["observed"]),
    evidence("RULE-2", "implementation", "production", ["causal"]),
    evidence("RULE-3", "implementation", "production", ["causal"]),
    evidence("GRAPH-COVERAGE", "configuration", "production", ["configured"]),
    evidence("QA", "test", "production", ["tested"]),
    evidence("APPROVAL", "decision", "production", ["normative"]),
    evidence("PROMOTION", "decision", "production", ["normative"]),
  ];
  const steps = [
    {
      id: "STEP-1",
      label: "Establish the turning point",
      position: 1,
      intent: {
        summary: "The contact changes the encounter.",
        evidenceIds: ["INTENT-1"],
        outcomes: [{ id: "OUTCOME-1", label: "Contact occurs", target: { kind: "event", eventKey: "CONTACT" } }],
      },
      observation: {
        artifactId: "ART-1",
        kind: "image_description",
        description: "A curator-authored description of the first frame.",
        evidenceIds: ["OBS-1"],
        state: state(1, ["CONTACT"], ["contact-established"]),
        ambiguities: [{
          id: "AMB-1",
          description: "Direction is unclear in isolation.",
          impact: "residual",
          evidenceIds: ["OBS-1"],
          resolvedByStepId: "STEP-2",
        }],
      },
      attempts: [{ id: "TRY-1", outcome: "qualified", evidenceIds: ["OBS-1"] }],
    },
    {
      id: "STEP-2",
      label: "Show the consequence",
      position: 2,
      intent: {
        summary: "The consequence follows the contact.",
        evidenceIds: ["INTENT-2"],
        outcomes: [{ id: "OUTCOME-2", label: "Consequence occurs", target: { kind: "event", eventKey: "CONSEQUENCE" } }],
      },
      observation: {
        artifactId: "ART-2",
        kind: "text_description",
        description: "A curator-authored description of the second artifact.",
        evidenceIds: ["OBS-2"],
        state: state(2, ["CONTACT", "CONSEQUENCE"], ["contact-established", "consequence-visible"]),
      },
      attempts: [
        { id: "TRY-2A", outcome: "rejected", rejectionReason: "The terminal state was not readable.", evidenceIds: ["OBS-2"] },
        { id: "TRY-2B", outcome: "qualified", replacesAttemptId: "TRY-2A", retryScope: "localized", evidenceIds: ["OBS-2"] },
      ],
    },
    {
      id: "STEP-3",
      label: "Confirm the terminal state",
      position: 3,
      intent: {
        summary: "Confirmation follows the consequence.",
        evidenceIds: ["INTENT-3"],
        outcomes: [{
          id: "OUTCOME-3",
          label: "Terminal confirmation occurs",
          target: { kind: "event", eventKey: "TERMINAL" },
          notBeforePosition: 3,
        }],
      },
      observation: {
        artifactId: "ART-3",
        kind: "event_record",
        description: "A structured observation of the final artifact.",
        evidenceIds: ["OBS-3"],
        state: state(3, ["CONTACT", "CONSEQUENCE", "TERMINAL"], [
          "contact-established", "consequence-visible", "terminal-visible",
        ]),
      },
      attempts: [{ id: "TRY-3", outcome: "qualified", evidenceIds: ["OBS-3"] }],
    },
  ];
  return {
    version: PRODUCTION_AUDIT_VERSION,
    auditId: "AUDIT-1",
    projectId: "project-a",
    projectRevision: "revision-1",
    temporalAxis: "step",
    evidence: evidenceRecords,
    graph: {
      version: "continuity.transition-graph.v1",
      projectId: "project-a",
      projectRevision: "revision-1",
      plane: "observed",
      temporalAxis: "step",
      initialState: state(1, ["CONTACT"], ["contact-established"]),
      rules: [
        rule("CAUSE-CONSEQUENCE", "CONTACT", "CONSEQUENCE", "consequence-visible", 2, "RULE-2"),
        rule("CAUSE-TERMINAL", "CONSEQUENCE", "TERMINAL", "terminal-visible", 3, "RULE-3"),
      ],
      coverage: {
        completeTargetKeys: [
          "event:CONSEQUENCE", "fact:consequence-visible=true", "event:TERMINAL", "fact:terminal-visible=true",
        ],
        completeInitialDimensions: ["facts", "history"],
        evidenceIds: ["GRAPH-COVERAGE"],
        excludedSources: [],
        parseFailures: [],
      },
    },
    steps,
    workflow: {
      declaredState: "approved",
      gates: [{ id: "QA-GATE", label: "Quality gate", required: true, status: "passed", evidenceIds: ["QA"] }],
      approvalEvidenceIds: ["APPROVAL"],
      promotionEvidenceIds: [],
    },
  };
}

test("audits intent, causality, ambiguity recovery, rejected retries, efficiency, and lifecycle separately", () => {
  const report = auditProductionProcess(baseRequest());

  assert.deepEqual(report.stepAssessments.map((step) => step.intentStatus), ["aligned", "aligned", "aligned"]);
  assert.deepEqual(report.stepAssessments.map((step) => step.causalAssessment), ["not_applicable", "explained", "explained"]);
  assert.equal(report.ambiguities[0].status, "resolved_in_sequence");
  assert.deepEqual(report.prematureEvents, []);
  assert.equal(report.rejectedAttempts[0].recoveredByAttemptId, "TRY-2B");
  assert.equal(report.rejectedAttempts[0].retryScope, "localized");
  assert.deepEqual(report.efficiency, {
    totalAttempts: 4,
    qualifiedAttempts: 3,
    rejectedAttempts: 1,
    qualificationRate: 0.75,
    attemptsPerQualified: 4 / 3,
    localizedRetries: 1,
    recoveredRejectedAttempts: 1,
  });
  assert.equal(report.approval.effectiveState, "approved");
  assert.equal(report.nextPermissibleAction.code, "promote");
  assert.deepEqual(report.diagnostics, []);
});

test("a premature outcome blocks a declared promotion and routes to the offending step", () => {
  const request = baseRequest();
  request.steps[0].observation.state.eventHistory.push({ eventKey: "TERMINAL", position: 1 });
  request.workflow.declaredState = "promoted";
  request.workflow.promotionEvidenceIds = ["PROMOTION"];

  const report = auditProductionProcess(request);

  assert.equal(report.prematureEvents.length, 1);
  assert.equal(report.prematureEvents[0].observedStepId, "STEP-1");
  assert.equal(report.approval.status, "blocked");
  assert.equal(report.approval.effectiveState, "in_review");
  assert.ok(report.approval.blockingFindingIds.some((id) => id.startsWith("premature:")));
  assert.equal(report.nextPermissibleAction.code, "revise_or_rerun_step");
  assert.equal(report.nextPermissibleAction.stepId, "STEP-1");
});

test("incomplete or low-authority graph coverage produces unknown rather than a false causal gap", () => {
  const request = baseRequest();
  request.graph.rules = [];
  request.graph.coverage.completeTargetKeys = ["event:CONSEQUENCE", "fact:consequence-visible=true"];
  request.evidence = request.evidence.map((item) => item.id === "GRAPH-COVERAGE"
    ? { ...item, role: "reference", authority: "reference", claimKinds: ["historical"] }
    : item);
  request.workflow.declaredState = "in_review";
  request.workflow.approvalEvidenceIds = [];

  const report = auditProductionProcess(request);

  assert.equal(report.stepAssessments[1].causalAssessment, "unknown");
  assert.match(report.stepAssessments[1].causalFinding.explanation, /not backed by active in-project evidence/i);
  assert.equal(report.approval.effectiveState, "in_review");
  assert.equal(report.nextPermissibleAction.code, "complete_causal_evidence");
});

test("a promoted unit routes to the next planned unobserved step without promoting it", () => {
  const request = baseRequest();
  request.workflow.declaredState = "promoted";
  request.workflow.promotionEvidenceIds = ["PROMOTION"];
  request.steps.push({
    id: "STEP-4",
    label: "Begin the next unit",
    position: 4,
    intent: {
      summary: "A future step remains a plan.",
      evidenceIds: ["INTENT-3"],
      outcomes: [{ id: "OUTCOME-4", label: "Next unit begins", target: { kind: "event", eventKey: "NEXT" } }],
    },
  });

  const report = auditProductionProcess(request);

  assert.equal(report.approval.effectiveState, "promoted");
  assert.equal(report.nextPermissibleAction.code, "produce_next_step");
  assert.equal(report.nextPermissibleAction.stepId, "STEP-4");
  assert.equal(report.stepAssessments[3].intentStatus, "not_observed");
});

test("production audits reject structural fan-out before sorting or graph search", () => {
  const request = baseRequest();
  request.steps = Array.from({ length: PRODUCTION_AUDIT_LIMITS.maxSteps + 1 }, (_, index) => ({
    ...request.steps[0],
    id: `STEP-${index}`,
    label: `Step ${index}`,
    position: index,
  }));

  assert.throws(
    () => auditProductionProcess(request),
    (error) => error instanceof ProductionAuditInputError
      && error.code === "production_audit_limit_exceeded"
      && /steps must contain at most/i.test(error.message),
  );
});
