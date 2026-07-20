import type {
  AuthorityPolicy,
  ClaimKind,
  EvidenceChunk,
} from "./contracts";
import { findCausalGaps, type CausalGapFinding, type ObservedSnapshot } from "./causal-gap";
import { classifyEvidence, DEFAULT_AUTHORITY_POLICY } from "./policy/default";
import {
  REACHABILITY_LIMITS,
  targetKeyOf,
  type GraphState,
  type ReachabilityTargetLeaf,
  type TransitionGraph,
} from "./reachability";

export const PRODUCTION_AUDIT_VERSION = "continuity.production-audit.v1" as const;
export const PRODUCTION_AUDIT_LIMITS = Object.freeze({
  maxEvidence: 1_024,
  maxEvidenceTextBytes: 4 * 1024 * 1024,
  maxSteps: 256,
  maxOutcomesPerStep: 64,
  maxAttemptsPerStep: 64,
  maxAmbiguitiesPerStep: 64,
  maxGates: 128,
  maxReferencesPerRecord: 128,
  maxTextBytes: 8_192,
} as const);

export class ProductionAuditInputError extends Error {
  readonly code = "production_audit_limit_exceeded";

  constructor(message: string) {
    super(message);
    this.name = "ProductionAuditInputError";
  }
}

export type AuditArtifactKind = "image_description" | "text_description" | "event_record";
export type AuditLifecycleState = "candidate" | "in_review" | "approved" | "promoted" | "rejected";

export type AuditIntentOutcome = {
  id: string;
  label: string;
  target: ReachabilityTargetLeaf;
  /** When supplied, observing the target before this position is a timing defect. */
  notBeforePosition?: number;
};

export type AuditAmbiguity = {
  id: string;
  description: string;
  impact: "blocking" | "residual";
  evidenceIds: string[];
  /** A later observed step may resolve a local ambiguity in sequence. */
  resolvedByStepId?: string;
};

export type ProductionAttempt = {
  id: string;
  outcome: "qualified" | "rejected";
  evidenceIds: string[];
  rejectionReason?: string;
  /** A qualified retry can point at the rejected attempt it replaced. */
  replacesAttemptId?: string;
  retryScope?: "localized" | "full";
};

export type ProductionAuditStep = {
  id: string;
  label: string;
  position: number;
  intent: {
    summary: string;
    evidenceIds: string[];
    claimKind?: "normative" | "configured";
    outcomes: AuditIntentOutcome[];
  };
  observation?: {
    artifactId: string;
    kind: AuditArtifactKind;
    description: string;
    evidenceIds: string[];
    state: GraphState;
    observationScope?: ObservedSnapshot["observationScope"];
    ambiguities?: AuditAmbiguity[];
  };
  attempts?: ProductionAttempt[];
};

export type AuditGateDecision = {
  id: string;
  label: string;
  required: boolean;
  status: "passed" | "failed" | "pending";
  /** The kind of evidence that establishes this gate; verification is the default. */
  claimKind?: ClaimKind;
  evidenceIds: string[];
};

export type ProductionAuditRequest = {
  version: typeof PRODUCTION_AUDIT_VERSION;
  auditId: string;
  projectId: string;
  projectRevision: string;
  temporalAxis: string;
  evidence: EvidenceChunk[];
  graph: TransitionGraph;
  steps: ProductionAuditStep[];
  workflow: {
    declaredState: AuditLifecycleState;
    gates: AuditGateDecision[];
    approvalEvidenceIds?: string[];
    promotionEvidenceIds?: string[];
  };
};

export type OutcomeAssessment = {
  outcomeId: string;
  targetKey: string;
  status: "observed" | "contradicted" | "unknown";
};

export type AuditStepAssessment = {
  stepId: string;
  label: string;
  position: number;
  artifactId: string | null;
  intentStatus: "aligned" | "partial" | "conflicted" | "unknown" | "not_observed";
  outcomes: OutcomeAssessment[];
  causalAssessment: "explained" | "proposed_bridge" | "causal_gap" | "unknown" | "no_change" | "not_applicable";
  causalFinding: CausalGapFinding | null;
  evidenceIds: string[];
};

export type AuditAmbiguityFinding = AuditAmbiguity & {
  stepId: string;
  status: "resolved_in_sequence" | "unresolved";
};

export type PrematureEventFinding = {
  outcomeId: string;
  intendedStepId: string;
  observedStepId: string;
  targetKey: string;
  notBeforePosition: number;
  observedPosition: number;
  evidenceIds: string[];
};

export type RejectedAttemptFinding = {
  attemptId: string;
  stepId: string;
  reason: string;
  evidenceIds: string[];
  recoveredByAttemptId: string | null;
  retryScope: "localized" | "full" | null;
};

export type AuditEfficiency = {
  totalAttempts: number;
  qualifiedAttempts: number;
  rejectedAttempts: number;
  qualificationRate: number | null;
  attemptsPerQualified: number | null;
  localizedRetries: number;
  recoveredRejectedAttempts: number;
};

export type ApprovalAssessment = {
  declaredState: AuditLifecycleState;
  effectiveState: AuditLifecycleState;
  status: "consistent" | "blocked";
  passedGateIds: string[];
  blockingGateIds: string[];
  blockingFindingIds: string[];
  evidenceIds: string[];
};

export type NextPermissibleAction = {
  code:
    | "correct_audit_evidence"
    | "revise_or_rerun_step"
    | "resolve_ambiguity"
    | "complete_causal_evidence"
    | "satisfy_gate"
    | "request_approval"
    | "promote"
    | "produce_next_step"
    | "none";
  label: string;
  stepId: string | null;
  gateId: string | null;
  rationale: string;
};

export type ProductionAuditReport = {
  version: typeof PRODUCTION_AUDIT_VERSION;
  auditId: string;
  projectId: string;
  projectRevision: string;
  stepAssessments: AuditStepAssessment[];
  ambiguities: AuditAmbiguityFinding[];
  prematureEvents: PrematureEventFinding[];
  rejectedAttempts: RejectedAttemptFinding[];
  efficiency: AuditEfficiency;
  approval: ApprovalAssessment;
  nextPermissibleAction: NextPermissibleAction;
  diagnostics: string[];
};

/**
 * Audits an already-extracted sequential production record. It does not read
 * image bytes, perform OCR, call a model, approve a proposal, or mutate a
 * project revision. Every observation remains attributable to caller-supplied
 * evidence and every causal claim is delegated to the deterministic graph.
 */
export function auditProductionProcess(
  request: ProductionAuditRequest,
  policy: AuthorityPolicy = DEFAULT_AUTHORITY_POLICY,
): ProductionAuditReport {
  assertProductionAuditEnvelope(request);
  const diagnostics: string[] = [];
  const evidence = indexEvidence(request, diagnostics);
  const steps = request.steps.slice().sort((left, right) =>
    left.position - right.position || left.id.localeCompare(right.id));
  validateRequest(request, steps, evidence, policy, diagnostics);

  const observedSteps = steps.filter((step) => step.observation);
  const causalFindings = request.graph.projectId === request.projectId
    && request.graph.projectRevision === request.projectRevision
    ? findCausalGaps(request.graph, observedSteps.map((step) => ({
        id: step.id,
        evidenceIds: step.observation!.evidenceIds,
        state: step.observation!.state,
        observationScope: step.observation!.observationScope,
      })))
    : [];
  const causalByToStep = new Map(causalFindings.map((finding) => [finding.toSnapshotId, finding]));
  const firstObservedStepId = observedSteps[0]?.id;

  const stepAssessments = steps.map((step): AuditStepAssessment => {
    const observationGrounded = Boolean(step.observation)
      && refsCanSupport(step.observation!.evidenceIds, "observed", evidence, policy);
    const intentGrounded = refsCanSupport(
      step.intent.evidenceIds,
      step.intent.claimKind ?? "normative",
      evidence,
      policy,
    );
    const outcomes = step.intent.outcomes.map((outcome): OutcomeAssessment => ({
      outcomeId: outcome.id,
      targetKey: targetKeyOf(outcome.target),
      status: step.observation
        ? assessTarget(step.observation.state, outcome.target, step.observation.observationScope)
        : "unknown",
    }));
    let intentStatus: AuditStepAssessment["intentStatus"];
    if (!step.observation) intentStatus = "not_observed";
    else if (!intentGrounded || !observationGrounded || !outcomes.length) intentStatus = "unknown";
    else if (outcomes.some((item) => item.status === "contradicted")) intentStatus = "conflicted";
    else if (outcomes.every((item) => item.status === "observed")) intentStatus = "aligned";
    else if (outcomes.some((item) => item.status === "observed")) intentStatus = "partial";
    else intentStatus = "unknown";

    let causalFinding = causalByToStep.get(step.id) ?? null;
    if (causalFinding && !causalEvidenceGrounded(causalFinding, request.graph, evidence, policy)) {
      causalFinding = {
        ...causalFinding,
        status: "unknown",
        explanation: "The transition or coverage references are not backed by active in-project evidence.",
      };
    }
    const causalAssessment = !step.observation || step.id === firstObservedStepId
      ? "not_applicable"
      : causalFinding?.status ?? "unknown";
    return {
      stepId: step.id,
      label: step.label,
      position: step.position,
      artifactId: step.observation?.artifactId ?? null,
      intentStatus,
      outcomes,
      causalAssessment,
      causalFinding,
      evidenceIds: uniqueSorted([
        ...step.intent.evidenceIds,
        ...(step.observation?.evidenceIds ?? []),
        ...(causalFinding?.evidenceIds ?? []),
      ]),
    };
  });

  const ambiguities = collectAmbiguities(steps);
  const prematureEvents = collectPrematureEvents(steps);
  const rejectedAttempts = collectRejectedAttempts(steps);
  const efficiency = calculateEfficiency(steps);
  const evidenceDefects = diagnostics.filter((item) => /evidence/i.test(item));
  const qualityBlockers = collectQualityBlockers(
    stepAssessments,
    ambiguities,
    prematureEvents,
    rejectedAttempts,
  );
  const approval = assessApproval(request, evidence, policy, qualityBlockers);
  const nextPermissibleAction = chooseNextAction(
    stepAssessments,
    ambiguities,
    prematureEvents,
    rejectedAttempts,
    approval,
    evidenceDefects,
  );

  return {
    version: PRODUCTION_AUDIT_VERSION,
    auditId: request.auditId,
    projectId: request.projectId,
    projectRevision: request.projectRevision,
    stepAssessments,
    ambiguities,
    prematureEvents,
    rejectedAttempts,
    efficiency,
    approval,
    nextPermissibleAction,
    diagnostics: uniqueSorted(diagnostics),
  };
}

function assertProductionAuditEnvelope(request: ProductionAuditRequest): void {
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    throw new ProductionAuditInputError("The production audit request must be an object.");
  }
  assertBoundedArray(request.evidence, PRODUCTION_AUDIT_LIMITS.maxEvidence, "evidence");
  assertBoundedArray(request.steps, PRODUCTION_AUDIT_LIMITS.maxSteps, "steps");
  assertBoundedArray(request.workflow?.gates, PRODUCTION_AUDIT_LIMITS.maxGates, "workflow.gates");
  assertBoundedArray(request.graph?.rules, REACHABILITY_LIMITS.maxRules, "graph.rules");

  let evidenceTextBytes = 0;
  for (const item of request.evidence) {
    evidenceTextBytes += byteLength(item.text);
    if (evidenceTextBytes > PRODUCTION_AUDIT_LIMITS.maxEvidenceTextBytes) {
      throw new ProductionAuditInputError(`evidence text exceeds ${PRODUCTION_AUDIT_LIMITS.maxEvidenceTextBytes} bytes.`);
    }
  }
  for (const step of request.steps) {
    assertText(step.id, "step.id");
    assertText(step.label, "step.label");
    assertText(step.intent?.summary, "step.intent.summary");
    assertBoundedArray(step.intent?.evidenceIds, PRODUCTION_AUDIT_LIMITS.maxReferencesPerRecord, "step.intent.evidenceIds");
    assertBoundedArray(step.intent?.outcomes, PRODUCTION_AUDIT_LIMITS.maxOutcomesPerStep, "step.intent.outcomes");
    assertBoundedArray(step.attempts ?? [], PRODUCTION_AUDIT_LIMITS.maxAttemptsPerStep, "step.attempts");
    assertBoundedArray(step.observation?.evidenceIds ?? [], PRODUCTION_AUDIT_LIMITS.maxReferencesPerRecord, "step.observation.evidenceIds");
    assertBoundedArray(step.observation?.ambiguities ?? [], PRODUCTION_AUDIT_LIMITS.maxAmbiguitiesPerStep, "step.observation.ambiguities");
    if (step.observation) assertText(step.observation.description, "step.observation.description");
    for (const outcome of step.intent.outcomes) {
      assertText(outcome.id, "outcome.id");
      assertText(outcome.label, "outcome.label");
    }
    for (const attempt of step.attempts ?? []) {
      assertBoundedArray(attempt.evidenceIds, PRODUCTION_AUDIT_LIMITS.maxReferencesPerRecord, "attempt.evidenceIds");
      if (attempt.rejectionReason !== undefined) assertText(attempt.rejectionReason, "attempt.rejectionReason");
    }
    for (const ambiguity of step.observation?.ambiguities ?? []) {
      assertText(ambiguity.description, "ambiguity.description");
      assertBoundedArray(ambiguity.evidenceIds, PRODUCTION_AUDIT_LIMITS.maxReferencesPerRecord, "ambiguity.evidenceIds");
    }
  }
  for (const gate of request.workflow.gates) {
    assertBoundedArray(gate.evidenceIds, PRODUCTION_AUDIT_LIMITS.maxReferencesPerRecord, "gate.evidenceIds");
  }
  assertBoundedArray(request.workflow.approvalEvidenceIds ?? [], PRODUCTION_AUDIT_LIMITS.maxReferencesPerRecord, "workflow.approvalEvidenceIds");
  assertBoundedArray(request.workflow.promotionEvidenceIds ?? [], PRODUCTION_AUDIT_LIMITS.maxReferencesPerRecord, "workflow.promotionEvidenceIds");
}

function assertBoundedArray(value: unknown, maximum: number, label: string): asserts value is unknown[] {
  if (!Array.isArray(value) || value.length > maximum) {
    throw new ProductionAuditInputError(`${label} must contain at most ${maximum} items.`);
  }
}

function assertText(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || byteLength(value) > PRODUCTION_AUDIT_LIMITS.maxTextBytes) {
    throw new ProductionAuditInputError(`${label} must be text no larger than ${PRODUCTION_AUDIT_LIMITS.maxTextBytes} bytes.`);
  }
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function indexEvidence(
  request: ProductionAuditRequest,
  diagnostics: string[],
): Map<string, EvidenceChunk> {
  const groups = new Map<string, EvidenceChunk[]>();
  for (const item of request.evidence) {
    if (item.projectId !== request.projectId) {
      diagnostics.push(`Excluded cross-project evidence ${item.id}.`);
      continue;
    }
    const group = groups.get(item.id) ?? [];
    group.push(item);
    groups.set(item.id, group);
  }
  const indexed = new Map<string, EvidenceChunk>();
  for (const [id, group] of groups) {
    if (group.length !== 1) {
      diagnostics.push(`Excluded ambiguous duplicate evidence ID ${id}.`);
      continue;
    }
    indexed.set(id, group[0]);
  }
  return indexed;
}

function validateRequest(
  request: ProductionAuditRequest,
  steps: ProductionAuditStep[],
  evidence: Map<string, EvidenceChunk>,
  policy: AuthorityPolicy,
  diagnostics: string[],
): void {
  if (request.version !== PRODUCTION_AUDIT_VERSION) diagnostics.push("The production audit version is unsupported.");
  if (request.graph.projectId !== request.projectId) diagnostics.push("The transition graph belongs to another project.");
  if (request.graph.projectRevision !== request.projectRevision) diagnostics.push("The transition graph is not pinned to the audited revision.");
  if (request.graph.temporalAxis !== request.temporalAxis) diagnostics.push("The transition graph uses a different temporal axis.");
  const seenStepIds = new Set<string>();
  const seenPositions = new Set<number>();
  const knownStepIds = new Set(steps.map((step) => step.id));
  const knownAttemptIds = new Set(steps.flatMap((step) => step.attempts ?? []).map((attempt) => attempt.id));
  for (const step of steps) {
    if (seenStepIds.has(step.id)) diagnostics.push(`Duplicate audit step ID ${step.id}.`);
    if (seenPositions.has(step.position)) diagnostics.push(`Multiple audit steps use position ${step.position}.`);
    seenStepIds.add(step.id);
    seenPositions.add(step.position);
    if (step.observation && (step.observation.state.position.axis !== request.temporalAxis
      || step.observation.state.position.order !== step.position)) {
      diagnostics.push(`Observation ${step.observation.artifactId} does not match step ${step.id}'s position.`);
    }
    for (const ambiguity of step.observation?.ambiguities ?? []) {
      if (ambiguity.resolvedByStepId && !knownStepIds.has(ambiguity.resolvedByStepId)) {
        diagnostics.push(`Ambiguity ${ambiguity.id} names unknown resolving step ${ambiguity.resolvedByStepId}.`);
      }
    }
    for (const attempt of step.attempts ?? []) {
      if (attempt.replacesAttemptId && !knownAttemptIds.has(attempt.replacesAttemptId)) {
        diagnostics.push(`Attempt ${attempt.id} names unknown replaced attempt ${attempt.replacesAttemptId}.`);
      }
      if (attempt.outcome === "rejected" && !attempt.rejectionReason?.trim()) {
        diagnostics.push(`Rejected attempt ${attempt.id} lacks a rejection reason.`);
      }
    }
  }
  const referencedIds = uniqueSorted([
    ...steps.flatMap((step) => [
      ...step.intent.evidenceIds,
      ...(step.observation?.evidenceIds ?? []),
      ...(step.observation?.ambiguities ?? []).flatMap((item) => item.evidenceIds),
      ...(step.attempts ?? []).flatMap((item) => item.evidenceIds),
    ]),
    ...request.workflow.gates.flatMap((gate) => gate.evidenceIds),
    ...(request.workflow.approvalEvidenceIds ?? []),
    ...(request.workflow.promotionEvidenceIds ?? []),
    ...request.graph.rules.flatMap((rule) => rule.evidenceIds),
    ...(request.graph.coverage.evidenceIds ?? []),
  ]);
  for (const id of referencedIds) {
    const item = evidence.get(id);
    if (!item) diagnostics.push(`Referenced evidence ${id} is missing or ineligible.`);
    else {
      const profile = classifyEvidence(item, policy);
      if (profile.lifecycle !== "active" || policy.excludedRoles.includes(profile.role)) {
        diagnostics.push(`Referenced evidence ${id} is not active audit evidence.`);
      }
    }
  }
}

function refsCanSupport(
  ids: string[],
  claimKind: ClaimKind,
  evidence: Map<string, EvidenceChunk>,
  policy: AuthorityPolicy,
): boolean {
  if (!ids.length) return false;
  return ids.some((id) => {
    const item = evidence.get(id);
    if (!item) return false;
    const profile = classifyEvidence(item, policy);
    return profile.lifecycle === "active"
      && !policy.excludedRoles.includes(profile.role)
      && (policy.allowedUsesByRole[profile.role]?.[claimKind] ?? []).includes("establish")
      && (policy.allowedUsesByAuthority[item.authority]?.[claimKind] ?? []).includes("establish");
  });
}

function causalEvidenceGrounded(
  finding: CausalGapFinding,
  graph: TransitionGraph,
  evidence: Map<string, EvidenceChunk>,
  policy: AuthorityPolicy,
): boolean {
  if (finding.status === "no_change") return true;
  if (finding.status === "explained" || finding.status === "proposed_bridge") {
    const ruleEvidence = finding.proof?.rulePath.flatMap((step) => step.evidenceIds) ?? [];
    return refsCanSupport(ruleEvidence, "causal", evidence, policy);
  }
  if (finding.status === "causal_gap") {
    return refsCanSupport(graph.coverage.evidenceIds ?? [], "configured", evidence, policy);
  }
  return true;
}

function assessTarget(
  state: GraphState,
  target: ReachabilityTargetLeaf,
  scope?: ObservedSnapshot["observationScope"],
): OutcomeAssessment["status"] {
  const complete = new Set(scope?.completeDimensions ?? []);
  if (target.kind === "fact") {
    if (target.value && state.trueAtoms.includes(target.atomKey)) return "observed";
    if (!target.value && state.falseAtoms.includes(target.atomKey)) return "observed";
    if (target.value && state.falseAtoms.includes(target.atomKey)) return "contradicted";
    if (!target.value && state.trueAtoms.includes(target.atomKey)) return "contradicted";
    if (!target.value && (scope?.explicitAbsent?.facts?.includes(target.atomKey) || complete.has("facts"))) return "observed";
    return "unknown";
  }
  if (target.kind === "event") {
    const occurred = state.eventHistory.some((event) => event.eventKey === target.eventKey);
    if (target.state === "not_occurred") {
      if (occurred) return "contradicted";
      return scope?.explicitAbsent?.events?.includes(target.eventKey) || complete.has("history") ? "observed" : "unknown";
    }
    return occurred ? "observed" : "unknown";
  }
  if (target.kind === "permission") {
    const present = state.permissions.some((item) => item.actorKey === target.actorKey
      && item.actionKey === target.actionKey && item.scopeKey === target.scopeKey);
    if (target.present === false) {
      if (present) return "contradicted";
      const explicit = scope?.explicitAbsent?.permissions?.some((item) => item.actorKey === target.actorKey
        && item.actionKey === target.actionKey && item.scopeKey === target.scopeKey);
      return explicit || complete.has("permissions") ? "observed" : "unknown";
    }
    return present ? "observed" : "unknown";
  }
  if (target.kind === "knowledge") {
    const present = state.knowledge.some((item) => item.actorKey === target.actorKey && item.atomKey === target.atomKey);
    if (target.present === false) {
      if (present) return "contradicted";
      const explicit = scope?.explicitAbsent?.knowledge?.some((item) => item.actorKey === target.actorKey
        && item.atomKey === target.atomKey);
      return explicit || complete.has("knowledge") ? "observed" : "unknown";
    }
    return present ? "observed" : "unknown";
  }
  const balance = state.balances.find((item) => item.accountKey === target.accountKey
    && item.resourceKey === target.resourceKey && item.unit === target.unit);
  if (!balance) {
    const explicit = scope?.explicitAbsent?.resources?.some((item) => item.accountKey === target.accountKey
      && item.resourceKey === target.resourceKey && item.unit === target.unit);
    if (!explicit && !complete.has("resources")) return "unknown";
  }
  try {
    const actual = BigInt(balance?.amountMinor ?? "0");
    const expected = BigInt(target.amountMinor);
    const observed = target.compare === "eq" ? actual === expected
      : target.compare === "gte" ? actual >= expected : actual <= expected;
    return observed ? "observed" : "contradicted";
  } catch {
    return "unknown";
  }
}

function collectAmbiguities(steps: ProductionAuditStep[]): AuditAmbiguityFinding[] {
  const observedStepIds = new Set(steps.filter((step) => step.observation).map((step) => step.id));
  return steps.flatMap((step) => (step.observation?.ambiguities ?? []).map((ambiguity) => ({
    ...ambiguity,
    stepId: step.id,
    evidenceIds: uniqueSorted(ambiguity.evidenceIds),
    status: ambiguity.resolvedByStepId && observedStepIds.has(ambiguity.resolvedByStepId)
      ? "resolved_in_sequence" as const
      : "unresolved" as const,
  }))).sort((left, right) => left.stepId.localeCompare(right.stepId) || left.id.localeCompare(right.id));
}

function collectPrematureEvents(steps: ProductionAuditStep[]): PrematureEventFinding[] {
  const findings: PrematureEventFinding[] = [];
  for (const intendedStep of steps) {
    for (const outcome of intendedStep.intent.outcomes) {
      if (outcome.notBeforePosition === undefined) continue;
      for (const observedStep of steps) {
        if (!observedStep.observation || observedStep.position >= outcome.notBeforePosition) continue;
        if (assessTarget(
          observedStep.observation.state,
          outcome.target,
          observedStep.observation.observationScope,
        ) !== "observed") continue;
        findings.push({
          outcomeId: outcome.id,
          intendedStepId: intendedStep.id,
          observedStepId: observedStep.id,
          targetKey: targetKeyOf(outcome.target),
          notBeforePosition: outcome.notBeforePosition,
          observedPosition: observedStep.position,
          evidenceIds: uniqueSorted([...intendedStep.intent.evidenceIds, ...observedStep.observation.evidenceIds]),
        });
      }
    }
  }
  return findings.sort((left, right) => left.observedPosition - right.observedPosition
    || left.outcomeId.localeCompare(right.outcomeId));
}

function collectRejectedAttempts(steps: ProductionAuditStep[]): RejectedAttemptFinding[] {
  const attempts = steps.flatMap((step) => (step.attempts ?? []).map((attempt) => ({ stepId: step.id, attempt })));
  return attempts.filter(({ attempt }) => attempt.outcome === "rejected").map(({ stepId, attempt }) => {
    const recovery = attempts.find(({ attempt: candidate }) =>
      candidate.outcome === "qualified" && candidate.replacesAttemptId === attempt.id);
    return {
      attemptId: attempt.id,
      stepId,
      reason: attempt.rejectionReason?.trim() || "Rejection reason was not recorded.",
      evidenceIds: uniqueSorted(attempt.evidenceIds),
      recoveredByAttemptId: recovery?.attempt.id ?? null,
      retryScope: recovery?.attempt.retryScope ?? null,
    };
  }).sort((left, right) => left.attemptId.localeCompare(right.attemptId));
}

function calculateEfficiency(steps: ProductionAuditStep[]): AuditEfficiency {
  const attempts = steps.flatMap((step) => step.attempts ?? []);
  const qualifiedAttempts = attempts.filter((attempt) => attempt.outcome === "qualified").length;
  const rejectedAttempts = attempts.length - qualifiedAttempts;
  const recovered = new Set(attempts.filter((attempt) =>
    attempt.outcome === "qualified" && attempt.replacesAttemptId).map((attempt) => attempt.replacesAttemptId));
  return {
    totalAttempts: attempts.length,
    qualifiedAttempts,
    rejectedAttempts,
    qualificationRate: attempts.length ? qualifiedAttempts / attempts.length : null,
    attemptsPerQualified: qualifiedAttempts ? attempts.length / qualifiedAttempts : null,
    localizedRetries: attempts.filter((attempt) => attempt.retryScope === "localized").length,
    recoveredRejectedAttempts: recovered.size,
  };
}

function collectQualityBlockers(
  steps: AuditStepAssessment[],
  ambiguities: AuditAmbiguityFinding[],
  prematureEvents: PrematureEventFinding[],
  rejectedAttempts: RejectedAttemptFinding[],
): string[] {
  return uniqueSorted([
    ...steps.filter((step) => step.intentStatus === "conflicted").map((step) => `intent:${step.stepId}`),
    ...steps.filter((step) => step.artifactId && (step.intentStatus === "partial" || step.intentStatus === "unknown"))
      .map((step) => `intent-incomplete:${step.stepId}`),
    ...steps.filter((step) => step.causalAssessment === "causal_gap").map((step) => `causal:${step.stepId}`),
    ...steps.filter((step) => step.causalAssessment === "unknown" || step.causalAssessment === "proposed_bridge")
      .map((step) => `causal-incomplete:${step.stepId}`),
    ...ambiguities.filter((item) => item.impact === "blocking" && item.status === "unresolved")
      .map((item) => `ambiguity:${item.id}`),
    ...prematureEvents.map((item) => `premature:${item.outcomeId}:${item.observedStepId}`),
    ...rejectedAttempts.filter((item) => !item.recoveredByAttemptId).map((item) => `rejection:${item.attemptId}`),
  ]);
}

function assessApproval(
  request: ProductionAuditRequest,
  evidence: Map<string, EvidenceChunk>,
  policy: AuthorityPolicy,
  qualityBlockers: string[],
): ApprovalAssessment {
  const gateIsGrounded = (gate: AuditGateDecision) => gate.status === "passed"
    && refsCanSupport(gate.evidenceIds, gate.claimKind ?? "tested", evidence, policy);
  const passedGateIds = request.workflow.gates.filter(gateIsGrounded)
    .map((gate) => gate.id).sort();
  const blockingGateIds = request.workflow.gates.filter((gate) => gate.required && !gateIsGrounded(gate))
    .map((gate) => gate.id).sort();
  const approvalGrounded = refsCanSupport(request.workflow.approvalEvidenceIds ?? [], "normative", evidence, policy);
  const promotionGrounded = refsCanSupport(request.workflow.promotionEvidenceIds ?? [], "normative", evidence, policy);
  const qualityClear = qualityBlockers.length === 0;
  const gatesClear = blockingGateIds.length === 0;
  const mayApprove = qualityClear && gatesClear && approvalGrounded;
  const mayPromote = mayApprove && promotionGrounded;
  let effectiveState = request.workflow.declaredState;
  if (request.workflow.declaredState === "approved" && !mayApprove) effectiveState = "in_review";
  if (request.workflow.declaredState === "promoted" && !mayPromote) {
    effectiveState = mayApprove ? "approved" : "in_review";
  }
  return {
    declaredState: request.workflow.declaredState,
    effectiveState,
    status: effectiveState === request.workflow.declaredState ? "consistent" : "blocked",
    passedGateIds,
    blockingGateIds,
    blockingFindingIds: qualityBlockers,
    evidenceIds: uniqueSorted([
      ...(request.workflow.approvalEvidenceIds ?? []),
      ...(request.workflow.promotionEvidenceIds ?? []),
      ...request.workflow.gates.flatMap((gate) => gate.evidenceIds),
    ]),
  };
}

function chooseNextAction(
  assessments: AuditStepAssessment[],
  ambiguities: AuditAmbiguityFinding[],
  prematureEvents: PrematureEventFinding[],
  rejectedAttempts: RejectedAttemptFinding[],
  approval: ApprovalAssessment,
  evidenceDefects: string[],
): NextPermissibleAction {
  if (evidenceDefects.length) return action("correct_audit_evidence", "Correct or supply the cited audit evidence.", null, null,
    "Evidence defects prevent a reliable intent, observation, or approval claim.");
  const defectiveStep = assessments.find((step) => step.intentStatus === "conflicted"
    || step.causalAssessment === "causal_gap")
    ?? assessments.find((step) => prematureEvents.some((item) => item.observedStepId === step.stepId))
    ?? assessments.find((step) => rejectedAttempts.some((item) => item.stepId === step.stepId && !item.recoveredByAttemptId));
  if (defectiveStep) return action("revise_or_rerun_step", `Revise or rerun ${defectiveStep.label}.`, defectiveStep.stepId, null,
    "The current artifact conflicts with intent, lacks an established cause, is premature, or has no qualified replacement.");
  const ambiguity = ambiguities.find((item) => item.impact === "blocking" && item.status === "unresolved");
  if (ambiguity) return action("resolve_ambiguity", "Resolve the blocking ambiguity.", ambiguity.stepId, null, ambiguity.description);
  const unknownStep = assessments.find((step) => step.artifactId && (step.intentStatus === "unknown"
    || step.causalAssessment === "unknown" || step.causalAssessment === "proposed_bridge"));
  if (unknownStep) return action("complete_causal_evidence", `Complete evidence for ${unknownStep.label}.`, unknownStep.stepId, null,
    "The observed result is not fully established by current intent and transition evidence.");
  const gate = approval.blockingGateIds[0];
  if (gate) return action("satisfy_gate", `Satisfy required gate ${gate}.`, null, gate,
    "A required approval gate is failed or pending.");
  if (approval.effectiveState === "candidate" || approval.effectiveState === "in_review") {
    return action("request_approval", "Request an evidence-backed approval decision.", null, null,
      "The audited work is qualified but has not been approved.");
  }
  if (approval.effectiveState === "approved") return action("promote", "Promote the approved candidate.", null, null,
    "Approval is established, but promotion remains a separate action.");
  if (approval.effectiveState === "promoted") {
    const next = assessments.find((step) => step.intentStatus === "not_observed");
    if (next) return action("produce_next_step", `Produce ${next.label}.`, next.stepId, null,
      "The prior audited work is promoted and the next planned step is unobserved.");
  }
  return action("none", "No further action is established by this audit.", null, null,
    approval.effectiveState === "rejected" ? "The workflow is rejected." : "All observed planned steps are promoted.");
}

function action(
  code: NextPermissibleAction["code"],
  label: string,
  stepId: string | null,
  gateId: string | null,
  rationale: string,
): NextPermissibleAction {
  return { code, label, stepId, gateId, rationale };
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}
