/**
 * Domain-neutral, single-pass inspection planning over server-owned risk
 * calibrations. Probabilities here are measured or policy-approved inputs; they
 * are not language-model confidence scores and this planner never revises them.
 */

export type ConsequenceClass =
  | "lookup"
  | "standard"
  | "promotion"
  | "high_rework"
  /** @deprecated Use high_rework. Retained for persisted v3.1 policies. */
  | "expensive_rerender";

export type InspectionCalibration = {
  authority: "server_policy" | "approved_operator" | "measured_history";
  revision: string;
};

/**
 * A calibration is usable only when a server-owned registry resolves the exact
 * authority/revision pair for the evaluation time. The factors turn nominal
 * observations into conservative planning bounds: defect incidence is moved
 * upward and detection performance downward.
 */
export type ApprovedInspectionCalibration = InspectionCalibration & {
  validFrom: string;
  expiresAt: string;
  riskProbabilityUpperBoundFactor: number;
  detectionProbabilityLowerBoundFactor: number;
  /**
   * Exact canonical catalog admitted for a primary planning run. This binds
   * risks, costs, checks, correlation labels, joint calibrations, and policy to
   * the approved server revision. Joint-only calibration rows may omit it.
   */
  catalogCanonical?: string;
};

export type InspectionCalibrationRegistry = {
  authority: "server_registry";
  revision: string;
  approvals: ApprovedInspectionCalibration[];
};

export type InspectionPlannerRuntime = {
  /** Resolve this object in trusted server code; never accept it from a request. */
  calibrationRegistry: InspectionCalibrationRegistry;
  /** Server-authored ISO timestamp, pinned so a run can be reproduced. */
  evaluatedAt: string;
};

export type AppliedInspectionCalibration = Omit<ApprovedInspectionCalibration, "catalogCanonical"> & {
  registryRevision: string;
  evaluatedAt: string;
  catalogBound: boolean;
};

export type InspectionRisk = {
  id: string;
  probability: number;
  /** Consequence paid when the defect escapes inspection. */
  missCost: number;
  /** Consequence paid when the defect is found and the work is rerun. */
  rerunCost: number;
  mandatory?: boolean;
  releaseBlocking?: boolean;
};

export type CandidateInspection = {
  id: string;
  costUnits: number;
  timeUnits: number;
  /** Conditional detection probability for each calibrated risk ID. */
  detectionProbabilities: Record<string, number>;
  /**
   * Checks reading the same evidence family are correlated. Their detection
   * probabilities do not stack unless a joint calibration explicitly allows it.
   */
  evidenceFamily?: string;
  /**
   * Descriptive signal channel retained in the approved catalog. Different
   * names never prove statistical independence. Signals combine only through
   * an exact registry-bound joint calibration.
   */
  independenceGroup?: string;
  /** A server policy may require this check independent of expected value. */
  mandatory?: boolean;
};

/**
 * Explicit evidence that a particular combination detects more than its best
 * member alone. The combination is honored only when every listed check runs
 * and the whole catalog is bound to the primary calibration approval.
 */
export type JointDetectionCalibration = {
  id: string;
  riskId: string;
  checkIds: string[];
  combinedDetectionProbability: number;
  calibration: InspectionCalibration;
};

export type InspectionPolicy = {
  consequenceClass: ConsequenceClass;
  maxChecksPerPass: number;
  maxTotalCostUnits: number;
  maxTotalTimeUnits: number;
  /** Converts time into the common effort denominator. */
  timeUnitWeight: number;
  /** Converts one combined effort unit into the same loss units as missCost.
   * Optional checks run only when avoided loss exceeds this inspection cost. */
  effortUnitCost: number;
  residualLossThreshold: number;
  minimumMandatoryDetectionProbability: number;
};

export type InspectionPlannerInput = {
  calibration: InspectionCalibration;
  risks: InspectionRisk[];
  checks: CandidateInspection[];
  jointDetectionCalibrations?: JointDetectionCalibration[];
  policy: InspectionPolicy;
};

export type InspectionSelection = {
  id: string;
  order: number;
  reason: "mandatory_check" | "mandatory_risk" | "expected_value";
  costUnits: number;
  timeUnits: number;
  marginalExpectedAvoidedLoss: number;
  avoidedLossPerEffortUnit: number;
  residualExpectedLossAfter: number;
};

export type DeferredInspection = {
  id: string;
  reason: "mandatory_budget" | "budget_limit" | "no_positive_value" | "stopped";
  marginalExpectedAvoidedLoss: number;
  avoidedLossPerEffortUnit: number;
};

export type InspectionStopReason =
  | "residual_below_threshold"
  | "budget_exhausted"
  | "mandatory_uncovered"
  | "no_positive_value";

export type InspectionPlan = {
  calibration: InspectionCalibration;
  calibrationProvenance: AppliedInspectionCalibration[];
  policy: InspectionPolicy;
  selectedChecks: InspectionSelection[];
  deferredChecks: DeferredInspection[];
  totalCostUnits: number;
  totalTimeUnits: number;
  residualExpectedLoss: number;
  uncoveredMandatoryRiskIds: string[];
  stopReason: InspectionStopReason;
};

const highReworkPolicy = {
  consequenceClass: "high_rework" as const,
  maxChecksPerPass: 8,
  maxTotalCostUnits: 60,
  maxTotalTimeUnits: 60,
  timeUnitWeight: 1.25,
  effortUnitCost: 0.5,
  residualLossThreshold: 0.01,
  minimumMandatoryDetectionProbability: 0.98,
};

export const INSPECTION_POLICY_PRESETS: Record<ConsequenceClass, InspectionPolicy> = Object.freeze({
  lookup: Object.freeze({
    consequenceClass: "lookup",
    maxChecksPerPass: 1,
    maxTotalCostUnits: 2,
    maxTotalTimeUnits: 2,
    timeUnitWeight: 0.5,
    effortUnitCost: 1,
    residualLossThreshold: 1,
    minimumMandatoryDetectionProbability: 0.6,
  }),
  standard: Object.freeze({
    consequenceClass: "standard",
    maxChecksPerPass: 4,
    maxTotalCostUnits: 12,
    maxTotalTimeUnits: 12,
    timeUnitWeight: 0.75,
    effortUnitCost: 1,
    residualLossThreshold: 0.25,
    minimumMandatoryDetectionProbability: 0.85,
  }),
  promotion: Object.freeze({
    consequenceClass: "promotion",
    maxChecksPerPass: 6,
    maxTotalCostUnits: 30,
    maxTotalTimeUnits: 30,
    timeUnitWeight: 1,
    effortUnitCost: 0.75,
    residualLossThreshold: 0.05,
    minimumMandatoryDetectionProbability: 0.95,
  }),
  high_rework: Object.freeze(highReworkPolicy),
  expensive_rerender: Object.freeze({
    ...highReworkPolicy,
    consequenceClass: "expensive_rerender",
  }),
});

/** Keeps exact feasibility search fast and auditable (at most 2^14 sets). */
export const MAX_INSPECTION_CHECKS = 14;
export const MAX_INSPECTION_RISKS = 16;
export const MAX_DETECTION_EDGES = 192;
export const MAX_JOINT_DETECTION_CALIBRATIONS = 64;
export const MAX_CALIBRATION_REGISTRY_ENTRIES = 128;
export const MAX_INSPECTION_ID_LENGTH = 96;
export const MAX_INSPECTION_LABEL_LENGTH = 160;
export const MAX_INSPECTION_NUMERIC_MAGNITUDE = 1_000_000_000_000;
export const MAX_INSPECTION_CATALOG_CHARACTERS = 256 * 1024;
export const MAX_INSPECTION_WORK_UNITS = 25_000_000;

type PreparedCheck = CandidateInspection & { canonicalOrder: number };

type PlannerContext = {
  checks: PreparedCheck[];
  jointCalibrations: JointDetectionCalibration[];
};

type PlanCandidate = {
  indices: number[];
  detectionByRisk: number[];
  mandatoryChecksCovered: number;
  mandatoryRisksCleared: number;
  mandatoryProgress: number;
  costTerms: number[];
  timeTerms: number[];
  totalCostUnits: number;
  totalTimeUnits: number;
  residualExpectedLoss: number;
};

type OptimizationResult = {
  selected: PlanCandidate;
  bestUnboundedFeasible: PlanCandidate | null;
};

/**
 * Stable, exact catalog representation stored in the trusted calibration
 * registry. Equality—not a caller-supplied label—authorizes a planning input.
 * The catalog is deliberately small and bounded, so retaining the canonical
 * value avoids relying on a non-cryptographic in-process hash.
 */
export function canonicalInspectionCatalog(input: InspectionPlannerInput): string {
  validateInput(input);
  const risks = [...input.risks].map((risk) => ({
    id: risk.id,
    probability: risk.probability,
    missCost: risk.missCost,
    rerunCost: risk.rerunCost,
    mandatory: Boolean(risk.mandatory),
    releaseBlocking: Boolean(risk.releaseBlocking),
  })).sort((left, right) => compareStableText(left.id, right.id));
  const checks = [...input.checks].map((check) => ({
    id: check.id,
    costUnits: check.costUnits,
    timeUnits: check.timeUnits,
    evidenceFamily: check.evidenceFamily ?? null,
    independenceGroup: check.independenceGroup ?? null,
    mandatory: Boolean(check.mandatory),
    detectionProbabilities: Object.fromEntries(
      Object.entries(check.detectionProbabilities).sort(([left], [right]) => compareStableText(left, right)),
    ),
  })).sort((left, right) => compareStableText(left.id, right.id));
  const jointDetectionCalibrations = [...(input.jointDetectionCalibrations ?? [])].map((joint) => ({
    id: joint.id,
    riskId: joint.riskId,
    checkIds: [...joint.checkIds].sort(compareStableText),
    combinedDetectionProbability: joint.combinedDetectionProbability,
    calibration: {
      authority: joint.calibration.authority,
      revision: joint.calibration.revision,
    },
  })).sort((left, right) => compareStableText(left.id, right.id));
  const value = JSON.stringify({
    version: "continuity.inspection-catalog.v1",
    calibration: {
      authority: input.calibration.authority,
      revision: input.calibration.revision,
    },
    risks,
    checks,
    jointDetectionCalibrations,
    policy: {
      consequenceClass: input.policy.consequenceClass,
      maxChecksPerPass: input.policy.maxChecksPerPass,
      maxTotalCostUnits: input.policy.maxTotalCostUnits,
      maxTotalTimeUnits: input.policy.maxTotalTimeUnits,
      timeUnitWeight: input.policy.timeUnitWeight,
      effortUnitCost: input.policy.effortUnitCost,
      residualLossThreshold: input.policy.residualLossThreshold,
      minimumMandatoryDetectionProbability: input.policy.minimumMandatoryDetectionProbability,
    },
  });
  if (value.length > MAX_INSPECTION_CATALOG_CHARACTERS) {
    throw new TypeError(
      `Inspection catalog must contain at most ${MAX_INSPECTION_CATALOG_CHARACTERS} canonical characters.`,
    );
  }
  return value;
}

export function planInspections(
  input: InspectionPlannerInput,
  runtime: InspectionPlannerRuntime,
): InspectionPlan {
  validateInput(input);
  validateRuntime(runtime);
  const catalogCanonical = canonicalInspectionCatalog(input);
  const mainCalibration = resolveCalibration(
    input.calibration,
    runtime,
    "calibration",
    catalogCanonical,
  );
  const jointInputs = [...(input.jointDetectionCalibrations ?? [])]
    .sort((left, right) => compareStableText(left.id, right.id));
  const jointCalibrationApprovals = jointInputs.map((item) =>
    resolveCalibration(item.calibration, runtime, `joint calibration ${item.id}`));

  // Execution uses the same order-independent representation that the
  // approval binds. Reordering a request must never change floating reduction,
  // subset indices, tie-breaking, or the reported execution sequence.
  const risks = [...input.risks].sort((left, right) => compareStableText(left.id, right.id)).map((risk) => ({
    ...risk,
    probability: Math.min(1, risk.probability * mainCalibration.riskProbabilityUpperBoundFactor),
  }));
  const checks = prepareChecks(input.checks.map((check) => ({
    ...check,
    detectionProbabilities: Object.fromEntries(Object.entries(check.detectionProbabilities)
      .map(([riskId, probability]) => [
        riskId,
        probability * mainCalibration.detectionProbabilityLowerBoundFactor,
      ])),
  })));
  const context: PlannerContext = {
    checks,
    jointCalibrations: jointInputs.map((item, index) => ({
      ...item,
      checkIds: [...item.checkIds].sort(compareStableText),
      calibration: { ...item.calibration },
      combinedDetectionProbability: item.combinedDetectionProbability
        * jointCalibrationApprovals[index].detectionProbabilityLowerBoundFactor,
    })),
  };
  validateJointCalibrations(input, context);

  const workUnits = (2 ** checks.length)
    * Math.max(1, checks.length + risks.length * (checks.length + context.jointCalibrations.length));
  if (!Number.isSafeInteger(workUnits) || workUnits > MAX_INSPECTION_WORK_UNITS) {
    throw new TypeError(
      `Inspection catalog exceeds the deterministic ${MAX_INSPECTION_WORK_UNITS}-work-unit ceiling.`,
    );
  }

  // Every feasible subset is considered exactly once. With 14 checks this is
  // capped at 16,384 subsets, which is finite, auditable, and cannot recurse.
  // Mandatory clearance and optional expected value are optimized together so
  // a cheapest mandatory prefix cannot consume the capacity needed by a more
  // valuable calibrated bundle.
  const optimization = optimizeInspectionPlan(risks, context, input.policy);
  const selectedIds = new Set<string>();
  const selectedChecks: InspectionSelection[] = [];
  const selectedCostTerms: number[] = [];
  const selectedTimeTerms: number[] = [];
  let totalCostUnits = 0;
  let totalTimeUnits = 0;

  const feasible = (check: PreparedCheck) =>
    selectedChecks.length < input.policy.maxChecksPerPass
    && exactSumSign([...selectedCostTerms, check.costUnits, -input.policy.maxTotalCostUnits]) <= 0
    && exactSumSign([...selectedTimeTerms, check.timeUnits, -input.policy.maxTotalTimeUnits]) <= 0;

  const select = (
    check: PreparedCheck,
    reason: InspectionSelection["reason"],
  ) => {
    const marginal = marginalAvoidedLoss(check, risks, selectedIds, context);
    selectedCostTerms.push(check.costUnits);
    selectedTimeTerms.push(check.timeUnits);
    totalCostUnits = stableSum(selectedCostTerms);
    totalTimeUnits = stableSum(selectedTimeTerms);
    selectedIds.add(check.id);
    selectedChecks.push({
      id: check.id,
      order: selectedChecks.length + 1,
      reason,
      costUnits: check.costUnits,
      timeUnits: check.timeUnits,
      marginalExpectedAvoidedLoss: cleanNumber(marginal),
      avoidedLossPerEffortUnit: cleanNumber(score(marginal, check, input.policy)),
      residualExpectedLossAfter: cleanNumber(residualExpectedLoss(risks, selectedIds, context)),
    });
  };

  const targetIds = new Set(optimization.selected.indices.map((index) => checks[index].id));
  const mandatoryCriticalIds = new Set(optimization.selected.indices
    .filter((index) => {
      if (checks[index].mandatory) return false;
      const without = new Set(targetIds);
      without.delete(checks[index].id);
      return uncoveredMandatoryRisks(risks, without, context, input.policy).length > 0;
    })
    .map((index) => checks[index].id));
  const reasonFor = (check: PreparedCheck): InspectionSelection["reason"] =>
    check.mandatory ? "mandatory_check"
      : mandatoryCriticalIds.has(check.id) ? "mandatory_risk" : "expected_value";
  const orderedIndices = [...optimization.selected.indices].sort((left, right) => {
    const reasonRank = (check: PreparedCheck) => check.mandatory ? 0
      : mandatoryCriticalIds.has(check.id) ? 1 : 2;
    return reasonRank(checks[left]) - reasonRank(checks[right])
      || checks[left].canonicalOrder - checks[right].canonicalOrder
      || compareStableText(checks[left].id, checks[right].id);
  });
  for (const index of orderedIndices) {
    const check = checks[index];
    if (feasible(check)) select(check, reasonFor(check));
  }

  const mandatoryChecksDeferred = checks.some((check) => check.mandatory && !selectedIds.has(check.id));
  const uncoveredMandatoryRiskIds = uncoveredMandatoryRisks(
    risks, selectedIds, context, input.policy,
  );
  const residual = residualExpectedLoss(risks, selectedIds, context);
  const stopReason: InspectionStopReason = mandatoryChecksDeferred || uncoveredMandatoryRiskIds.length
    ? "mandatory_uncovered"
    : compareResidualToThreshold(
      risks,
      risks.map((risk) => aggregateDetectionProbability(risk.id, selectedIds, context)),
      input.policy.residualLossThreshold,
    ) <= 0
      ? "residual_below_threshold"
      : optimization.bestUnboundedFeasible
        && compareEconomicPlans(
          optimization.bestUnboundedFeasible,
          optimization.selected,
          risks,
          input.policy,
        ) < 0
        ? "budget_exhausted"
        : "no_positive_value";

  const deferredChecks = checks.filter((check) => !selectedIds.has(check.id)).map((check): DeferredInspection => {
    const marginal = marginalAvoidedLoss(check, risks, selectedIds, context);
    const budgetLimited = !feasible(check);
    return {
      id: check.id,
      reason: check.mandatory && budgetLimited ? "mandatory_budget"
        : !hasPositiveNetValue(marginal, check, input.policy) ? "no_positive_value"
          : budgetLimited ? "budget_limit" : "stopped",
      marginalExpectedAvoidedLoss: cleanNumber(marginal),
      avoidedLossPerEffortUnit: cleanNumber(score(marginal, check, input.policy)),
    };
  });

  return {
    calibration: { ...input.calibration },
    calibrationProvenance: uniqueAppliedCalibrations([
      mainCalibration,
      ...jointCalibrationApprovals,
    ]),
    policy: { ...input.policy },
    selectedChecks,
    deferredChecks,
    totalCostUnits: cleanNumber(totalCostUnits),
    totalTimeUnits: cleanNumber(totalTimeUnits),
    residualExpectedLoss: cleanNumber(residual),
    uncoveredMandatoryRiskIds,
    stopReason,
  };
}

function optimizeInspectionPlan(
  risks: InspectionRisk[],
  context: PlannerContext,
  policy: InspectionPolicy,
): OptimizationResult {
  const mandatoryRiskIds = new Set(
    risks.filter((risk) => risk.mandatory || risk.releaseBlocking).map((risk) => risk.id),
  );
  const mandatoryCheckCount = context.checks.filter((check) => check.mandatory).length;
  let bestFeasible: PlanCandidate | null = null;
  let bestUnboundedFeasible: PlanCandidate | null = null;
  let bestPartial: PlanCandidate | null = null;
  const combinationCount = 2 ** context.checks.length;

  // Iterative bitmask enumeration is intentionally bounded and non-recursive.
  for (let mask = 0; mask < combinationCount; mask += 1) {
    const indices: number[] = [];
    const costTerms: number[] = [];
    const timeTerms: number[] = [];
    for (let offset = 0; offset < context.checks.length; offset += 1) {
      if ((mask & (2 ** offset)) === 0) continue;
      const check = context.checks[offset];
      indices.push(offset);
      costTerms.push(check.costUnits);
      timeTerms.push(check.timeUnits);
    }
    const totalCostUnits = stableSum(costTerms);
    const totalTimeUnits = stableSum(timeTerms);

    const selectedIds = new Set(indices.map((index) => context.checks[index].id));
    const mandatoryChecksCovered = context.checks.filter((check) =>
      check.mandatory && selectedIds.has(check.id)).length;
    const detectionByRisk = risks.map((risk) =>
      aggregateDetectionProbability(risk.id, selectedIds, context));
    let mandatoryRisksCleared = 0;
    let mandatoryProgress = 0;
    for (const [riskIndex, risk] of risks.entries()) {
      if (!risk.mandatory && !risk.releaseBlocking) continue;
      const detection = detectionByRisk[riskIndex];
      if (exactSumSign([detection, -policy.minimumMandatoryDetectionProbability]) >= 0) {
        mandatoryRisksCleared += 1;
      }
      mandatoryProgress += policy.minimumMandatoryDetectionProbability === 0
        ? 1
        : Math.min(1, detection / policy.minimumMandatoryDetectionProbability);
    }
    const residual = residualExpectedLossForDetections(risks, detectionByRisk);
    const candidate: PlanCandidate = {
      indices,
      detectionByRisk,
      mandatoryChecksCovered,
      mandatoryRisksCleared,
      mandatoryProgress,
      costTerms,
      timeTerms,
      totalCostUnits,
      totalTimeUnits,
      residualExpectedLoss: residual,
    };
    const allChecksCovered = mandatoryChecksCovered === mandatoryCheckCount;
    const allRisksCleared = mandatoryRisksCleared === mandatoryRiskIds.size;
    const mandatoryCleared = allChecksCovered && allRisksCleared;
    if (mandatoryCleared
      && (!bestUnboundedFeasible
        || compareOptimalPlans(candidate, bestUnboundedFeasible, risks, policy) < 0)) {
      bestUnboundedFeasible = candidate;
    }

    const withinBudget = indices.length <= policy.maxChecksPerPass
      && exactSumSign([...costTerms, -policy.maxTotalCostUnits]) <= 0
      && exactSumSign([...timeTerms, -policy.maxTotalTimeUnits]) <= 0;
    if (!withinBudget) continue;

    if (mandatoryCleared) {
      if (!bestFeasible || compareOptimalPlans(candidate, bestFeasible, risks, policy) < 0) {
        bestFeasible = candidate;
      }
    } else if (!bestPartial || comparePartialPlans(candidate, bestPartial, risks, policy) < 0) {
      bestPartial = candidate;
    }
  }

  const empty: PlanCandidate = {
    indices: [],
    detectionByRisk: risks.map(() => 0),
    mandatoryChecksCovered: 0,
    mandatoryRisksCleared: 0,
    mandatoryProgress: 0,
    costTerms: [],
    timeTerms: [],
    totalCostUnits: 0,
    totalTimeUnits: 0,
    residualExpectedLoss: residualExpectedLoss(risks, new Set(), context),
  };
  return {
    selected: bestFeasible ?? bestPartial ?? empty,
    bestUnboundedFeasible,
  };
}

function compareOptimalPlans(
  left: PlanCandidate,
  right: PlanCandidate,
  risks: InspectionRisk[],
  policy: InspectionPolicy,
): number {
  return compareEconomicPlans(left, right, risks, policy)
    || compareResidualPlans(left, right, risks)
    || left.indices.length - right.indices.length
    || exactSumSign([...left.costTerms, ...right.costTerms.map((value) => -value)])
    || exactSumSign([...left.timeTerms, ...right.timeTerms.map((value) => -value)])
    || compareIndexArrays(left.indices, right.indices);
}

function comparePartialPlans(
  left: PlanCandidate,
  right: PlanCandidate,
  risks: InspectionRisk[],
  policy: InspectionPolicy,
): number {
  return right.mandatoryChecksCovered - left.mandatoryChecksCovered
    || right.mandatoryRisksCleared - left.mandatoryRisksCleared
    || compareNumber(right.mandatoryProgress, left.mandatoryProgress)
    || exactSumSign(inspectionEffortDifferenceTerms(left, right, policy, false))
    || left.indices.length - right.indices.length
    || compareResidualPlans(left, right, risks)
    || compareIndexArrays(left.indices, right.indices);
}

/** Compare two plans from per-risk deltas so a large common loss cannot erase
 * a smaller economically meaningful difference in IEEE-754 addition. */
function compareEconomicPlans(
  left: PlanCandidate,
  right: PlanCandidate,
  risks: InspectionRisk[],
  policy: InspectionPolicy,
): number {
  const leftThresholdComparison = compareResidualToThreshold(
    risks, left.detectionByRisk, policy.residualLossThreshold,
  );
  const rightThresholdComparison = compareResidualToThreshold(
    risks, right.detectionByRisk, policy.residualLossThreshold,
  );
  const effortTerms = inspectionEffortDifferenceTerms(left, right, policy, true);
  if (leftThresholdComparison > 0 && rightThresholdComparison > 0) {
    return exactSumSign([...residualDifferenceTerms(left, right, risks), ...effortTerms]);
  }
  if (leftThresholdComparison <= 0 && rightThresholdComparison <= 0) {
    return exactSumSign(effortTerms);
  }
  if (leftThresholdComparison > 0) {
    return exactSumSign([
      ...residualTerms(risks, left.detectionByRisk),
      -policy.residualLossThreshold,
      ...effortTerms,
    ]);
  }
  return exactSumSign([
    policy.residualLossThreshold,
    ...residualTerms(risks, right.detectionByRisk).map((value) => -value),
    ...effortTerms,
  ]);
}

function compareResidualPlans(
  left: PlanCandidate,
  right: PlanCandidate,
  risks: InspectionRisk[],
): number {
  return exactSumSign(residualDifferenceTerms(left, right, risks));
}

function residualDifferenceTerms(
  left: PlanCandidate,
  right: PlanCandidate,
  risks: InspectionRisk[],
): number[] {
  return risks.map((risk, index) => finiteDerived(
    risk.probability
      * (right.detectionByRisk[index] - left.detectionByRisk[index])
      * (risk.missCost - risk.rerunCost),
    "pairwise residual difference term",
  ));
}

function residualTerms(risks: InspectionRisk[], detectionByRisk: number[]): number[] {
  return risks.map((risk, index) => {
    const detected = detectionByRisk[index];
    return finiteDerived(
      risk.probability * ((1 - detected) * risk.missCost + detected * risk.rerunCost),
      "residual expected loss term",
    );
  });
}

function compareResidualToThreshold(
  risks: InspectionRisk[],
  detectionByRisk: number[],
  threshold: number,
): number {
  return exactSumSign([...residualTerms(risks, detectionByRisk), -threshold]);
}

function inspectionEffortDifferenceTerms(
  left: PlanCandidate,
  right: PlanCandidate,
  policy: InspectionPolicy,
  includeUnitCost: boolean,
): number[] {
  const multiplier = includeUnitCost ? policy.effortUnitCost : 1;
  return [
    ...left.costTerms.map((value) => finiteDerived(value * multiplier, "inspection cost term")),
    ...left.timeTerms.map((value) => finiteDerived(
      value * policy.timeUnitWeight * multiplier,
      "inspection time term",
    )),
    ...right.costTerms.map((value) => finiteDerived(-value * multiplier, "inspection cost term")),
    ...right.timeTerms.map((value) => finiteDerived(
      -value * policy.timeUnitWeight * multiplier,
      "inspection time term",
    )),
  ];
}

function compareIndexArrays(left: number[], right: number[]): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return left.length - right.length;
}

function compareNumber(left: number, right: number): number {
  return exactSumSign([left, -right]);
}

/**
 * Returns the sign of the exact mathematical sum of the supplied finite
 * IEEE-754 values. Each term has already been rounded by JavaScript, but the
 * comparison itself cannot lose a small term beside a much larger one.
 */
function exactSumSign(values: number[]): number {
  const parts: Array<{ coefficient: bigint; exponent: number }> = [];
  let minimumExponent = Number.POSITIVE_INFINITY;
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  for (const value of values) {
    finiteDerived(value, "exact comparison term");
    if (value === 0) continue;
    view.setFloat64(0, value, false);
    const high = view.getUint32(0, false);
    const low = view.getUint32(4, false);
    const exponentBits = (high >>> 20) & 0x7ff;
    const fraction = (BigInt(high & 0xfffff) << 32n) | BigInt(low);
    const magnitude = exponentBits === 0 ? fraction : (1n << 52n) | fraction;
    const exponent = exponentBits === 0 ? -1074 : exponentBits - 1023 - 52;
    const coefficient = (high >>> 31) === 1 ? -magnitude : magnitude;
    parts.push({ coefficient, exponent });
    minimumExponent = Math.min(minimumExponent, exponent);
  }
  if (!parts.length) return 0;
  let exact = 0n;
  for (const part of parts) {
    exact += part.coefficient << BigInt(part.exponent - minimumExponent);
  }
  return exact < 0n ? -1 : exact > 0n ? 1 : 0;
}

/** Compensated summation prevents a large common risk from erasing smaller
 * calibrated contributions before plans are compared. */
function stableSum(values: number[]): number {
  let sum = 0;
  let compensation = 0;
  for (const value of values) {
    const next = sum + value;
    compensation += Math.abs(sum) >= Math.abs(value)
      ? (sum - next) + value
      : (value - next) + sum;
    sum = next;
  }
  return finiteDerived(sum + compensation, "compensated sum");
}

function marginalAvoidedLoss(
  check: CandidateInspection,
  risks: InspectionRisk[],
  selectedIds: Set<string>,
  context: PlannerContext,
): number {
  const withCheck = new Set(selectedIds);
  withCheck.add(check.id);
  return finiteDerived(stableSum(risks.map((risk) => {
    const before = aggregateDetectionProbability(risk.id, selectedIds, context);
    const after = aggregateDetectionProbability(risk.id, withCheck, context);
    return risk.probability * (after - before) * (risk.missCost - risk.rerunCost);
  })), "marginal expected avoided loss");
}

function aggregateDetectionProbability(
  riskId: string,
  selectedIds: Set<string>,
  context: PlannerContext,
): number {
  // Different labels are not statistical proof of independence. Without one
  // exact registry-bound joint calibration, the conservative lower bound is
  // the strongest selected signal, regardless of family/channel names.
  let detection = 0;
  for (const check of context.checks) {
    if (!selectedIds.has(check.id)) continue;
    detection = Math.max(detection, check.detectionProbabilities[riskId] ?? 0);
  }
  for (const joint of context.jointCalibrations) {
    if (joint.riskId !== riskId || !joint.checkIds.every((id) => selectedIds.has(id))) continue;
    detection = Math.max(detection, joint.combinedDetectionProbability);
  }
  return Math.min(1, Math.max(0, detection));
}

function score(value: number, check: CandidateInspection, policy: InspectionPolicy): number {
  const effort = effortUnits(check, policy);
  if (effort === 0) return value > 0 ? Number.MAX_VALUE : value;
  return finiteDerived(value / effort, "avoided loss per effort unit");
}

function effortUnits(check: CandidateInspection, policy: InspectionPolicy): number {
  return finiteDerived(
    check.costUnits + check.timeUnits * policy.timeUnitWeight,
    "inspection effort",
  );
}

function hasPositiveNetValue(
  marginalExpectedAvoidedLoss: number,
  check: CandidateInspection,
  policy: InspectionPolicy,
): boolean {
  const inspectionCost = effortUnits(check, policy) * policy.effortUnitCost;
  return exactSumSign([marginalExpectedAvoidedLoss, -inspectionCost]) > 0;
}

function residualExpectedLoss(
  risks: InspectionRisk[],
  selectedIds: Set<string>,
  context: PlannerContext,
): number {
  return residualExpectedLossForDetections(
    risks,
    risks.map((risk) => aggregateDetectionProbability(risk.id, selectedIds, context)),
  );
}

function residualExpectedLossForDetections(
  risks: InspectionRisk[],
  detectionByRisk: number[],
): number {
  return finiteDerived(stableSum(risks.map((risk, index) => {
    const detected = detectionByRisk[index];
    return risk.probability * ((1 - detected) * risk.missCost + detected * risk.rerunCost);
  })), "residual expected loss");
}

function uncoveredMandatoryRisks(
  risks: InspectionRisk[],
  selectedIds: Set<string>,
  context: PlannerContext,
  policy: InspectionPolicy,
): string[] {
  // Release policy is independent of expected incidence. A zero-probability
  // blocking contradiction must still meet the mandatory detection threshold.
  return risks.filter((risk) => risk.mandatory || risk.releaseBlocking).filter((risk) =>
    exactSumSign([
      aggregateDetectionProbability(risk.id, selectedIds, context),
      -policy.minimumMandatoryDetectionProbability,
    ]) < 0).map((risk) => risk.id);
}

function prepareChecks(checks: CandidateInspection[]): PreparedCheck[] {
  return [...checks].sort((left, right) => compareStableText(left.id, right.id)).map((check, index) => ({
    ...check,
    detectionProbabilities: { ...check.detectionProbabilities },
    canonicalOrder: index,
  }));
}

function compareStableText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function cleanNumber(value: number): number {
  finiteDerived(value, "planner output");
  return Object.is(value, -0) ? 0 : Number(value.toPrecision(12));
}

function finiteDerived(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new TypeError(`${label} exceeded the supported numeric range.`);
  return value;
}

function validateRuntime(runtime: InspectionPlannerRuntime): void {
  if (!runtime || typeof runtime !== "object") {
    throw new TypeError("a server-resolved inspection planner runtime is required.");
  }
  const registry = runtime.calibrationRegistry;
  if (!registry || typeof registry !== "object" || registry.authority !== "server_registry") {
    throw new TypeError("calibrationRegistry must be a server_registry.");
  }
  validateBoundedLabel(registry.revision, "calibrationRegistry.revision");
  if (!Array.isArray(registry.approvals)) {
    throw new TypeError("calibrationRegistry.approvals must be an array.");
  }
  if (registry.approvals.length > MAX_CALIBRATION_REGISTRY_ENTRIES) {
    throw new TypeError(
      `calibrationRegistry.approvals must contain at most ${MAX_CALIBRATION_REGISTRY_ENTRIES} entries.`,
    );
  }
  parseIsoTimestamp(runtime.evaluatedAt, "evaluatedAt");
  const signatures = new Set<string>();
  for (const approval of registry.approvals) {
    validateCalibration(approval, "calibrationRegistry approval");
    const signature = calibrationSignature(approval);
    if (signatures.has(signature)) {
      throw new TypeError(`Duplicate calibration registry approval: ${signature}.`);
    }
    signatures.add(signature);
    const validFrom = parseIsoTimestamp(approval.validFrom, `${signature}.validFrom`);
    const expiresAt = parseIsoTimestamp(approval.expiresAt, `${signature}.expiresAt`);
    if (expiresAt <= validFrom) {
      throw new TypeError(`${signature}.expiresAt must be after validFrom.`);
    }
    validateBoundedFactor(
      approval.riskProbabilityUpperBoundFactor,
      1,
      10,
      `${signature}.riskProbabilityUpperBoundFactor`,
    );
    validateBoundedFactor(
      approval.detectionProbabilityLowerBoundFactor,
      0,
      1,
      `${signature}.detectionProbabilityLowerBoundFactor`,
    );
    if (approval.catalogCanonical !== undefined) {
      if (typeof approval.catalogCanonical !== "string" || !approval.catalogCanonical.length) {
        throw new TypeError(`${signature}.catalogCanonical must be a non-empty string when provided.`);
      }
      if (approval.catalogCanonical.length > MAX_INSPECTION_CATALOG_CHARACTERS) {
        throw new TypeError(
          `${signature}.catalogCanonical must contain at most ${MAX_INSPECTION_CATALOG_CHARACTERS} characters.`,
        );
      }
    }
  }
}

function resolveCalibration(
  reference: InspectionCalibration,
  runtime: InspectionPlannerRuntime,
  label: string,
  expectedCatalogCanonical?: string,
): AppliedInspectionCalibration {
  const signature = calibrationSignature(reference);
  const approval = runtime.calibrationRegistry.approvals.find((candidate) =>
    calibrationSignature(candidate) === signature);
  if (!approval) {
    throw new TypeError(`${label} ${signature} is not approved by the server registry.`);
  }
  const evaluatedAt = parseIsoTimestamp(runtime.evaluatedAt, "evaluatedAt");
  const validFrom = parseIsoTimestamp(approval.validFrom, `${signature}.validFrom`);
  const expiresAt = parseIsoTimestamp(approval.expiresAt, `${signature}.expiresAt`);
  if (evaluatedAt < validFrom || evaluatedAt >= expiresAt) {
    throw new TypeError(`${label} ${signature} is not valid at evaluatedAt.`);
  }
  if (expectedCatalogCanonical !== undefined
    && approval.catalogCanonical !== expectedCatalogCanonical) {
    throw new TypeError(
      `${label} ${signature} is not approved for this exact inspection catalog.`,
    );
  }
  const {
    catalogCanonical: approvedCatalogCanonical,
    ...publicApproval
  } = approval;
  return {
    ...publicApproval,
    registryRevision: runtime.calibrationRegistry.revision,
    evaluatedAt: runtime.evaluatedAt,
    catalogBound: approvedCatalogCanonical === expectedCatalogCanonical
      && expectedCatalogCanonical !== undefined,
  };
}

function uniqueAppliedCalibrations(
  calibrations: AppliedInspectionCalibration[],
): AppliedInspectionCalibration[] {
  const seen = new Set<string>();
  return calibrations.filter((calibration) => {
    const signature = calibrationSignature(calibration);
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  }).map((calibration) => ({ ...calibration }));
}

function calibrationSignature(value: InspectionCalibration): string {
  return `${value.authority}:${value.revision}`;
}

function parseIsoTimestamp(value: string, label: string): bigint {
  validateBoundedLabel(value, label);
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|([+-])(\d{2}):(\d{2}))$/);
  if (!match) {
    throw new TypeError(`${label} must be an RFC3339 timestamp with an explicit timezone.`);
  }
  const [
    , yearText, monthText, dayText, hourText, minuteText, secondText,
    fractionText = "", , offsetSign, offsetHourText = "0", offsetMinuteText = "0",
  ] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const offsetHour = Number(offsetHourText);
  const offsetMinute = Number(offsetMinuteText);
  const daysInMonth = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1]
    || hour > 23 || minute > 59 || second > 59 || offsetHour > 23 || offsetMinute > 59) {
    throw new TypeError(`${label} must be a valid RFC3339 timestamp.`);
  }
  const localSeconds = daysFromCivil(year, month, day) * 86_400
    + hour * 3_600 + minute * 60 + second;
  const offsetSeconds = (offsetHour * 3_600 + offsetMinute * 60)
    * (offsetSign === "-" ? -1 : 1);
  const fractionNanos = BigInt((fractionText || "0").padEnd(9, "0"));
  return BigInt(localSeconds - offsetSeconds) * 1_000_000_000n + fractionNanos;
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

/** Proleptic Gregorian civil date to days since 1970-01-01. */
function daysFromCivil(yearValue: number, month: number, day: number): number {
  const year = yearValue - (month <= 2 ? 1 : 0);
  const era = Math.floor(year / 400);
  const yearOfEra = year - era * 400;
  const monthPrime = month + (month > 2 ? -3 : 9);
  const dayOfYear = Math.floor((153 * monthPrime + 2) / 5) + day - 1;
  const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4)
    - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146_097 + dayOfEra - 719_468;
}

function validateBoundedFactor(value: number, minimum: number, maximum: number, label: string): void {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new TypeError(`${label} must be between ${minimum} and ${maximum}.`);
  }
}

function validateInput(input: InspectionPlannerInput): void {
  if (!input || typeof input !== "object") throw new TypeError("planner input is required.");
  validateCalibration(input.calibration, "calibration");
  if (!Array.isArray(input.risks)) throw new TypeError("risks must be an array.");
  if (input.risks.length > MAX_INSPECTION_RISKS) {
    throw new TypeError(`risks must contain at most ${MAX_INSPECTION_RISKS} entries.`);
  }
  const riskIds = new Set<string>();
  for (const risk of input.risks) {
    if (!risk || typeof risk !== "object") throw new TypeError("each risk must be an object.");
    validateId(risk.id, "risk");
    if (riskIds.has(risk.id)) throw new TypeError(`Duplicate risk ID: ${risk.id}.`);
    riskIds.add(risk.id);
    validateProbability(risk.probability, `risk ${risk.id} probability`);
    validateNonNegative(risk.missCost, `risk ${risk.id} missCost`);
    validateNonNegative(risk.rerunCost, `risk ${risk.id} rerunCost`);
    validateOptionalBoolean(risk.mandatory, `risk ${risk.id} mandatory`);
    validateOptionalBoolean(risk.releaseBlocking, `risk ${risk.id} releaseBlocking`);
  }
  if (!Array.isArray(input.checks)) throw new TypeError("checks must be an array.");
  if (input.checks.length > MAX_INSPECTION_CHECKS) {
    throw new TypeError(`checks must contain at most ${MAX_INSPECTION_CHECKS} candidates.`);
  }
  const checkIds = new Set<string>();
  let detectionEdgeCount = 0;
  for (const check of input.checks) {
    if (!check || typeof check !== "object") throw new TypeError("each check must be an object.");
    validateId(check.id, "check");
    if (checkIds.has(check.id)) throw new TypeError(`Duplicate check ID: ${check.id}.`);
    checkIds.add(check.id);
    validateNonNegative(check.costUnits, `check ${check.id} costUnits`);
    validateNonNegative(check.timeUnits, `check ${check.id} timeUnits`);
    validateOptionalLabel(check.evidenceFamily, `check ${check.id} evidenceFamily`);
    validateOptionalLabel(check.independenceGroup, `check ${check.id} independenceGroup`);
    validateOptionalBoolean(check.mandatory, `check ${check.id} mandatory`);
    if (!check.detectionProbabilities
      || typeof check.detectionProbabilities !== "object"
      || Array.isArray(check.detectionProbabilities)) {
      throw new TypeError(`check ${check.id} detectionProbabilities must be an object.`);
    }
    detectionEdgeCount += Object.keys(check.detectionProbabilities).length;
    if (detectionEdgeCount > MAX_DETECTION_EDGES) {
      throw new TypeError(
        `detectionProbabilities must contain at most ${MAX_DETECTION_EDGES} total edges.`,
      );
    }
    for (const [riskId, probability] of Object.entries(check.detectionProbabilities)) {
      if (!riskIds.has(riskId)) throw new TypeError(`Check ${check.id} references unknown risk ${riskId}.`);
      validateProbability(probability, `check ${check.id} detection probability for ${riskId}`);
    }
  }
  if (input.jointDetectionCalibrations !== undefined
    && !Array.isArray(input.jointDetectionCalibrations)) {
    throw new TypeError("jointDetectionCalibrations must be an array when provided.");
  }
  if ((input.jointDetectionCalibrations?.length ?? 0) > MAX_JOINT_DETECTION_CALIBRATIONS) {
    throw new TypeError(
      `jointDetectionCalibrations must contain at most ${MAX_JOINT_DETECTION_CALIBRATIONS} entries.`,
    );
  }
  for (const joint of input.jointDetectionCalibrations ?? []) {
    if (!joint || typeof joint !== "object") {
      throw new TypeError("each joint calibration must be an object.");
    }
    validateId(joint.id, "joint calibration");
    validateId(joint.riskId, `joint calibration ${joint.id} risk`);
    validateCalibration(joint.calibration, `joint calibration ${joint.id}`);
    validateProbability(
      joint.combinedDetectionProbability,
      `joint calibration ${joint.id} combinedDetectionProbability`,
    );
    if (!Array.isArray(joint.checkIds)) {
      throw new TypeError(`Joint calibration ${joint.id} checkIds must be an array.`);
    }
    if (joint.checkIds.length < 2
      || joint.checkIds.length > MAX_INSPECTION_CHECKS
      || new Set(joint.checkIds).size !== joint.checkIds.length) {
      throw new TypeError(`Joint calibration ${joint.id} requires at least two unique check IDs.`);
    }
    for (const checkId of joint.checkIds) validateId(checkId, `joint calibration ${joint.id} check`);
  }
  if (!input.policy || typeof input.policy !== "object") {
    throw new TypeError("policy is required.");
  }
  if (!Number.isInteger(input.policy.maxChecksPerPass)
    || input.policy.maxChecksPerPass < 0
    || input.policy.maxChecksPerPass > MAX_INSPECTION_CHECKS) {
    throw new TypeError(
      `policy.maxChecksPerPass must be a non-negative integer no larger than ${MAX_INSPECTION_CHECKS}.`,
    );
  }
  validateNonNegative(input.policy.maxTotalCostUnits, "policy.maxTotalCostUnits");
  validateNonNegative(input.policy.maxTotalTimeUnits, "policy.maxTotalTimeUnits");
  validateNonNegative(input.policy.timeUnitWeight, "policy.timeUnitWeight");
  validateNonNegative(input.policy.effortUnitCost, "policy.effortUnitCost");
  validateNonNegative(input.policy.residualLossThreshold, "policy.residualLossThreshold");
  validateProbability(
    input.policy.minimumMandatoryDetectionProbability,
    "policy.minimumMandatoryDetectionProbability",
  );
  if (!Object.hasOwn(INSPECTION_POLICY_PRESETS, input.policy.consequenceClass)) {
    throw new TypeError("policy.consequenceClass is invalid.");
  }
}

function validateJointCalibrations(input: InspectionPlannerInput, context: PlannerContext): void {
  const riskIds = new Set(input.risks.map((risk) => risk.id));
  const checksById = new Map(context.checks.map((check) => [check.id, check]));
  const calibrationIds = new Set<string>();
  const signatures = new Set<string>();
  for (const joint of context.jointCalibrations) {
    if (!joint || typeof joint !== "object") {
      throw new TypeError("each joint calibration must be an object.");
    }
    validateId(joint.id, "joint calibration");
    validateId(joint.riskId, `joint calibration ${joint.id} risk`);
    if (calibrationIds.has(joint.id)) throw new TypeError(`Duplicate joint calibration ID: ${joint.id}.`);
    calibrationIds.add(joint.id);
    validateCalibration(joint.calibration, `joint calibration ${joint.id}`);
    if (!riskIds.has(joint.riskId)) {
      throw new TypeError(`Joint calibration ${joint.id} references unknown risk ${joint.riskId}.`);
    }
    validateProbability(
      joint.combinedDetectionProbability,
      `joint calibration ${joint.id} combinedDetectionProbability`,
    );
    if (!Array.isArray(joint.checkIds)
      || joint.checkIds.length < 2
      || joint.checkIds.length > MAX_INSPECTION_CHECKS
      || new Set(joint.checkIds).size !== joint.checkIds.length) {
      throw new TypeError(`Joint calibration ${joint.id} requires at least two unique check IDs.`);
    }
    for (const checkId of joint.checkIds) validateId(checkId, `joint calibration ${joint.id} check`);
    const listedChecks = joint.checkIds.map((id) => {
      const check = checksById.get(id);
      if (!check) throw new TypeError(`Joint calibration ${joint.id} references unknown check ${id}.`);
      return check;
    });
    const strongestMember = Math.max(...listedChecks.map((check) =>
      check.detectionProbabilities[joint.riskId] ?? 0));
    if (exactSumSign([joint.combinedDetectionProbability, -strongestMember]) < 0) {
      throw new TypeError(
        `Joint calibration ${joint.id} cannot be weaker than its strongest member.`,
      );
    }
    const signature = `${joint.riskId}:${[...joint.checkIds].sort().join(",")}`;
    if (signatures.has(signature)) {
      throw new TypeError(`Duplicate joint calibration combination for ${joint.riskId}.`);
    }
    signatures.add(signature);
  }
}

function validateCalibration(value: InspectionCalibration, label: string): void {
  if (!value || typeof value !== "object") throw new TypeError(`${label} is required.`);
  validateBoundedLabel(value.revision, `${label}.revision`);
  if (!["server_policy", "approved_operator", "measured_history"].includes(value.authority)) {
    throw new TypeError(`${label}.authority must be server-owned or approved.`);
  }
}

function validateId(value: string, kind: string): void {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${kind} ID is required.`);
  if (value !== value.trim()) throw new TypeError(`${kind} ID must not have surrounding whitespace.`);
  if (value.length > MAX_INSPECTION_ID_LENGTH) {
    throw new TypeError(`${kind} ID must contain at most ${MAX_INSPECTION_ID_LENGTH} characters.`);
  }
}

function validateOptionalLabel(value: string | undefined, label: string): void {
  if (value !== undefined) validateBoundedLabel(value, label);
}

function validateOptionalBoolean(value: boolean | undefined, label: string): void {
  if (value !== undefined && typeof value !== "boolean") {
    throw new TypeError(`${label} must be a boolean when provided.`);
  }
}

function validateBoundedLabel(value: string, label: string): void {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
  if (value !== value.trim()) throw new TypeError(`${label} must not have surrounding whitespace.`);
  if (value.length > MAX_INSPECTION_LABEL_LENGTH) {
    throw new TypeError(
      `${label} must contain at most ${MAX_INSPECTION_LABEL_LENGTH} characters.`,
    );
  }
}

function validateProbability(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new TypeError(`${label} must be between 0 and 1.`);
  }
}

function validateNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > MAX_INSPECTION_NUMERIC_MAGNITUDE) {
    throw new TypeError(
      `${label} must be a finite non-negative number no larger than ${MAX_INSPECTION_NUMERIC_MAGNITUDE}.`,
    );
  }
}
