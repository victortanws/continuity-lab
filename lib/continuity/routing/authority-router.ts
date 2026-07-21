import type {
  AnalysisCheck,
  AnalysisBudget,
  AnalysisMode,
  AnalysisRoute,
  AuthorityPolicy,
  CanonAuthority,
  ClaimKind,
  EvidenceChunk,
  EvidenceRole,
  PresentationDepth,
  QueryRequest,
  RetrievalLane,
  RetrievalLaneId,
  RetrievalPlan,
  TrustedCompletenessRegistry,
} from "../contracts";
import { AUTHORITY_ROUTER_VERSION } from "../contracts";
import { classifyEvidence, DEFAULT_AUTHORITY_POLICY } from "../policy/default";
import {
  boundaryCoversMaterialClaimKind,
  verifyCompletenessBoundary,
} from "../completeness-boundary";
import { compileProofContract } from "../proof-contract";

export type AuthorityRoutingResult = {
  evidence: EvidenceChunk[];
  route: AnalysisRoute;
};

export function routeEvidence(
  chunks: EvidenceChunk[],
  request: QueryRequest,
  policy: AuthorityPolicy = DEFAULT_AUTHORITY_POLICY,
  retrievalPlan: RetrievalPlan = planRetrieval(request, policy),
  trustedCompletenessRegistry?: TrustedCompletenessRegistry,
): AuthorityRoutingResult {
  const diagnostics: string[] = [];
  let crossProject = 0;
  let outsideTime = 0;
  let excludedEvaluation = 0;
  let inactiveSuperseded = 0;

  const proofContract = compileProofContract(request);
  const mode = proofContract.mode;
  const claimKinds = requestedClaimKinds(request, proofContract.claimKinds);
  const presentationDepth = presentationDepthFor(mode, claimKinds);
  const budget = analysisBudgetFor(mode, presentationDepth, policy);
  const boundedRetrievalPlan = boundRetrievalPlan(retrievalPlan, budget);

  // Scope and lifecycle gates deliberately run before ID reconciliation. A
  // stale, foreign, or evaluation-only fragment must never be able to reserve
  // an ID and shadow a valid in-scope fragment that arrives later.
  const eligible = chunks.flatMap((chunk): EvidenceChunk[] => {
    if (chunk.projectId !== request.projectId) {
      crossProject += 1;
      return [];
    }
    if (!isTemporallyValid(chunk, request)) {
      outsideTime += 1;
      return [];
    }
    const profile = classifyEvidence(chunk, policy);
    if (policy.excludedRoles.includes(profile.role)) {
      if (profile.role === "evaluation") excludedEvaluation += 1;
      return [];
    }
    if (profile.lifecycle === "superseded") {
      inactiveSuperseded += 1;
      return [];
    }
    const compatibleLaneIds = boundedRetrievalPlan.lanes.filter((lane) =>
      lane.roles.includes(profile.role)
      && profile.claimKinds.some((kind) => claimKinds.includes(kind) && lane.claimKinds.includes(kind))).map((lane) => lane.id);
    const retrievalLaneIds = chunk.retrievalLaneIds?.length
      ? [...new Set(chunk.retrievalLaneIds)].filter((laneId) => compatibleLaneIds.includes(laneId))
      : compatibleLaneIds;
    return [{
      ...chunk,
      role: profile.role,
      lifecycle: profile.lifecycle,
      claimKinds: profile.claimKinds,
      authorityRank: normalizedAuthority(chunk, policy),
      retrievalLaneIds,
    }];
  });

  const reconciliation = reconcileDuplicateIds(eligible, claimKinds, policy, boundedRetrievalPlan.lanes);
  const candidates = reconciliation.evidence;

  if (crossProject) diagnostics.push(`Removed ${crossProject} cross-project evidence fragment${crossProject === 1 ? "" : "s"}.`);
  if (outsideTime) diagnostics.push(`Removed ${outsideTime} fragment${outsideTime === 1 ? "" : "s"} outside the requested temporal scope.`);
  if (excludedEvaluation) diagnostics.push(`Excluded ${excludedEvaluation} evaluation or answer-key fragment${excludedEvaluation === 1 ? "" : "s"} from reasoning evidence.`);
  if (inactiveSuperseded) diagnostics.push(`Excluded ${inactiveSuperseded} already-superseded fragment${inactiveSuperseded === 1 ? "" : "s"} before evidence ID reconciliation.`);
  diagnostics.push(...reconciliation.diagnostics);

  const supersession = applySupersession(candidates, policy);
  diagnostics.push(...supersession.diagnostics);

  const admissibleEvidence = supersession.evidence.filter((chunk) => !isQuarantinedEvidence(chunk));
  const availableByRole = countByRole(admissibleEvidence);
  const requiredRoles = requiredRolesFor(claimKinds, mode, admissibleEvidence, policy);
  if (presentationDepth === "focused" && !requiredRoles.length) {
    diagnostics.push(`No active evidence was available for the focused ${claimKinds.join("/")} boundary.`);
  }
  for (const role of requiredRoles) {
    if (!availableByRole[role]) diagnostics.push(`No ${role} evidence lane was available in this revision.`);
  }

  const selected = laneBalancedSelection(
    supersession.evidence,
    boundedRetrievalPlan.lanes,
    requiredRoles,
    claimKinds,
    policy,
    budget.maxEvidence,
    request.storyPosition,
    request.temporalAxis,
    request.targetClaimKeys,
    request.contextRefs,
  );
  const selectedAdmissibleEvidence = selected.filter((chunk) => !isQuarantinedEvidence(chunk));
  const selectedByRole = countByRole(selectedAdmissibleEvidence);
  const availableByLane = countByLane(admissibleEvidence);
  const selectedByLane = countByLane(selectedAdmissibleEvidence);
  for (const lane of boundedRetrievalPlan.lanes) {
    if (!availableByLane[lane.id]) diagnostics.push(`No evidence was returned for the ${lane.id} retrieval lane.`);
  }
  const requestedCoverage = request.coverage ?? { scope: "retrieved evidence only", complete: false, excludedSources: [] };
  const verifiedBoundaries = selected.flatMap((chunk) => {
    if (!isClosureEligibleEvidence(chunk)) return [];
    const verified = verifyCompletenessBoundary(chunk, request, trustedCompletenessRegistry);
    return verified ? [{ chunk, verified }] : [];
  });
  const completenessBoundaryEvidence = verifiedBoundaries.filter(({ chunk, verified }) =>
    claimKinds.some((kind) => canEstablishClaimKind(chunk, kind, policy)
      && boundaryCoversMaterialClaimKind(verified, kind)));
  const completenessBoundaryEvidenceIds = completenessBoundaryEvidence.map(({ chunk }) => chunk.id);
  const completeClaimKinds = new Set(completenessBoundaryEvidence.flatMap(({ chunk, verified }) =>
    claimKinds.filter((kind) => canEstablishClaimKind(chunk, kind, policy)
      && boundaryCoversMaterialClaimKind(verified, kind))));
  const uncoveredMaterialClaimKinds = claimKinds.filter((kind) => !completeClaimKinds.has(kind));
  const legacyClosedWorldCount = selected.filter((chunk) =>
    chunk.closedWorld && !verifyCompletenessBoundary(chunk, request, trustedCompletenessRegistry)).length;
  const untrustedBoundaryCount = selected.filter((chunk) =>
    chunk.completenessBoundary
    && !verifyCompletenessBoundary(chunk, request, trustedCompletenessRegistry)).length;
  const deferredEvidenceIds = supersession.evidence
    .filter((chunk) => (chunk.claimKinds ?? []).some((kind) => claimKinds.includes(kind)))
    .filter((chunk) => !selected.some((candidate) => candidate.id === chunk.id))
    .map((chunk) => chunk.id);
  const failures = [...new Set((requestedCoverage.failures ?? []).map((item) => item.trim()).filter(Boolean))];
  const upstreamDeferred = [...new Set((requestedCoverage.deferredSources ?? []).map((item) => item.trim()).filter(Boolean))];
  const excludedSources = [...new Set((requestedCoverage.excludedSources ?? []).map((item) => item.trim()).filter(Boolean))];
  const truncated = Boolean(requestedCoverage.truncated || deferredEvidenceIds.length || upstreamDeferred.length);
  const trustedComplete = Boolean(
    requestedCoverage.complete
    && completenessBoundaryEvidenceIds.length > 0
    && uncoveredMaterialClaimKinds.length === 0
    && !excludedSources.length
    && !truncated
    && !failures.length,
  );
  if (legacyClosedWorldCount) {
    diagnostics.push(`Ignored ${legacyClosedWorldCount} legacy closedWorld flag${legacyClosedWorldCount === 1 ? "" : "s"} without a verified revision-pinned completeness boundary.`);
  }
  if (untrustedBoundaryCount) {
    diagnostics.push(`Ignored ${untrustedBoundaryCount} source-carried completeness boundar${untrustedBoundaryCount === 1 ? "y" : "ies"} without an exact trusted runtime grant.`);
  }
  if (requestedCoverage.complete && !completenessBoundaryEvidenceIds.length) {
    diagnostics.push("The request claimed complete coverage, but no selected fragment carried a verified revision-pinned material completeness boundary.");
  }
  if (requestedCoverage.complete && completenessBoundaryEvidenceIds.length && uncoveredMaterialClaimKinds.length) {
    diagnostics.push(
      `Closed-world evidence did not cover every material answer boundary: ${uncoveredMaterialClaimKinds.join(", ")}.`,
    );
  }
  if (requestedCoverage.complete && excludedSources.length) {
    diagnostics.push("The request excluded sources, so the declared coverage cannot prove a corpus-wide negative.");
  }
  if (requestedCoverage.complete && truncated) {
    diagnostics.push("The analysis was truncated or deferred evidence, so the declared coverage cannot prove a corpus-wide negative.");
  }
  if (requestedCoverage.complete && failures.length) {
    diagnostics.push("One or more in-scope source operations failed, so the declared coverage cannot prove a corpus-wide negative.");
  }
  if (!requestedCoverage.complete) diagnostics.push("Semantic coverage is open; retrieval silence cannot prove a negative.");
  const hasBoundedOmission = Boolean(
    requestedCoverage.complete
    && completenessBoundaryEvidenceIds.length > 0
    && uncoveredMaterialClaimKinds.length === 0
    && (truncated || failures.length || excludedSources.length),
  );
  const closure = trustedComplete
    ? "closed"
    : hasBoundedOmission
      ? "partial"
      : "open";

  return {
    evidence: selected,
    route: {
      version: "continuity.route.v2",
      routerVersion: AUTHORITY_ROUTER_VERSION,
      policyId: policy.id,
      policyVersion: policy.version,
      mode,
      proofContract,
      truthTarget: request.truthTarget ?? "project_truth",
      presentationDepth,
      budget,
      claimKinds,
      requiredRoles,
      requiredChecks: checksForMode(mode),
      selectedByRole,
      availableByRole,
      retrieval: { lanes: boundedRetrievalPlan.lanes, availableByLane, selectedByLane },
      coverage: {
        scope: requestedCoverage.scope,
        closure,
        trustedComplete,
        completenessBoundaryEvidenceIds,
        closedWorldEvidenceIds: completenessBoundaryEvidenceIds,
        truncated,
        failures,
        deferredEvidenceIds,
        deferredSources: upstreamDeferred,
        excludedSources,
      },
      diagnostics,
    },
  };
}

export function planRetrieval(
  request: QueryRequest,
  policy: AuthorityPolicy = DEFAULT_AUTHORITY_POLICY,
): RetrievalPlan {
  const proofContract = compileProofContract(request);
  const mode = proofContract.mode;
  const claimKinds = requestedClaimKinds(request, proofContract.claimKinds);
  const presentationDepth = presentationDepthFor(mode, claimKinds);
  const budget = analysisBudgetFor(mode, presentationDepth, policy);
  const base = request.proposedChange?.trim()
    ? `${request.question}\nProposed change: ${request.proposedChange.trim()}`
    : request.question;
  const definitions: Array<Omit<RetrievalLane, "query" | "maxResults"> & { purpose: string; include: boolean }> = [
    {
      id: "authority",
      roles: ["intent", "decision", "reference", "asset"],
      claimKinds: ["identity", "normative", "causal"],
      purpose: "Find governing intent, accepted decisions, identity definitions, exclusions, scope, and authority limits.",
      include: proofContract.retrievalLanes.includes("authority"),
    },
    {
      id: "declared_state",
      roles: ["configuration", "decision", "intent"],
      claimKinds: ["configured", "normative", "causal"],
      purpose: "Find declared values, registries, prerequisites, ownership, resource limits, and configured state.",
      include: proofContract.retrievalLanes.includes("declared_state"),
    },
    {
      id: "execution",
      roles: ["implementation", "configuration", "observation"],
      claimKinds: ["implemented", "observed", "causal"],
      purpose: "Find executable mechanisms, ordering, authorization checks, state mutations, transfers, and downstream consumers.",
      include: proofContract.retrievalLanes.includes("execution"),
    },
    {
      id: "verification",
      roles: ["test", "observation", "implementation"],
      claimKinds: ["tested", "observed", "implemented", "causal"],
      purpose: "Find tests, assertions, observed runs, failures, counterevidence, and verification gaps.",
      include: proofContract.retrievalLanes.includes("verification"),
    },
    {
      id: "change_history",
      roles: ["proposal", "archive", "observation", "decision"],
      claimKinds: ["historical", "normative", "causal"],
      purpose: "Find proposals, superseded material, prior states, migrations, and historical alternatives without treating them as active truth.",
      include: proofContract.retrievalLanes.includes("change_history"),
    },
  ];
  return {
    version: "continuity.retrieval-plan.v1",
    lanes: definitions.filter((lane) => lane.include).slice(0, budget.maxRetrievalLanes).map(({ id, roles, claimKinds: laneClaimKinds, purpose }) => ({
      id,
      roles,
      claimKinds: laneClaimKinds,
      query: `${base}\nRetrieval lane ${id}: ${purpose}`,
      maxResults: budget.maxResultsPerLane,
    })),
  };
}

export function authorityWeight(
  authority: CanonAuthority,
  policy: AuthorityPolicy = DEFAULT_AUTHORITY_POLICY,
): number {
  return policy.authorityWeights[authority] ?? 0;
}

function requestedClaimKinds(request: QueryRequest, contractClaimKinds: ClaimKind[]): ClaimKind[] {
  const requested = request.claimKinds ?? [];
  return [...new Set([...contractClaimKinds, ...requested])];
}

/**
 * A caller may request a deeper analysis, but cannot force a question whose
 * language clearly asks for causality or a proposed change through the cheaper
 * lookup route. This is intentionally conservative: an unrecognized question
 * stays on the broad active-truth path even when its mode remains
 * `answer_question`.
 */
export function inferMinimumAnalysisMode(
  question: string,
  proposedChange?: string | null,
  requested: AnalysisMode = "answer_question",
): AnalysisMode {
  return compileProofContract({
    projectId: "route-probe",
    question,
    proposedChange,
    analysisMode: requested,
  }).mode;
}

/**
 * High-precision fast paths for questions whose evidence boundary is explicit.
 * Ambiguous questions deliberately fall back to the broader active-truth route;
 * speed must not be purchased by silently omitting a material claim plane.
 */
export function inferFocusedClaimKinds(question: string): ClaimKind[] | null {
  if (!question.trim() || question.length > 400) return null;
  const contract = compileProofContract({ projectId: "route-probe", question });
  return contract.routeClass === "lookup" ? contract.claimKinds : null;
}

export function presentationDepthFor(mode: AnalysisMode, claimKinds: ClaimKind[]): PresentationDepth {
  return mode === "answer_question"
    && claimKinds.length > 0
    && claimKinds.length <= 2
    && claimKinds.every((kind) => ["identity", "configured", "implemented", "tested", "observed"].includes(kind))
    ? "focused"
    : "full";
}

export function analysisBudgetFor(
  mode: AnalysisMode,
  presentationDepth: PresentationDepth,
  policy: AuthorityPolicy = DEFAULT_AUTHORITY_POLICY,
): AnalysisBudget {
  const bounded = (value: number, policyLimit: number) => Math.max(0, Math.min(value, policyLimit));
  if (mode === "answer_question" && presentationDepth === "focused") {
    return {
      profile: "answer_focused",
      maxRetrievalLanes: bounded(2, policy.maxRetrievalLanes),
      maxResultsPerLane: bounded(6, policy.maxResultsPerLane),
      maxEvidence: bounded(8, policy.maxEvidence),
      maxCompilerPasses: 1,
      maxReasonerPasses: 1,
      maxReachabilityPasses: 0,
    };
  }
  if (mode === "answer_question") {
    return {
      profile: "answer_broad",
      maxRetrievalLanes: bounded(4, policy.maxRetrievalLanes),
      maxResultsPerLane: bounded(8, policy.maxResultsPerLane),
      maxEvidence: bounded(18, policy.maxEvidence),
      maxCompilerPasses: 1,
      maxReasonerPasses: 1,
      maxReachabilityPasses: 0,
    };
  }
  return {
    profile: mode === "trace_dependencies" ? "dependency_trace" : "change_evaluation",
    maxRetrievalLanes: bounded(mode === "trace_dependencies" ? 4 : 5, policy.maxRetrievalLanes),
    maxResultsPerLane: bounded(10, policy.maxResultsPerLane),
    maxEvidence: bounded(24, policy.maxEvidence),
    maxCompilerPasses: 1,
    maxReasonerPasses: 1,
    maxReachabilityPasses: 1,
  };
}

function boundRetrievalPlan(plan: RetrievalPlan, budget: AnalysisBudget): RetrievalPlan {
  return {
    version: "continuity.retrieval-plan.v1",
    lanes: plan.lanes.slice(0, budget.maxRetrievalLanes).map((lane) => ({
      ...lane,
      roles: [...new Set(lane.roles)],
      claimKinds: [...new Set(lane.claimKinds)],
      maxResults: Math.max(0, Math.min(lane.maxResults, budget.maxResultsPerLane)),
    })),
  };
}

function requiredRolesFor(
  claimKinds: ClaimKind[],
  mode: AnalysisMode,
  evidence: EvidenceChunk[],
  policy: AuthorityPolicy,
): EvidenceRole[] {
  const chooseOne = (kind: ClaimKind, roles: EvidenceRole[]): EvidenceRole | null => {
    const candidates = roles.flatMap((role) => {
      const matching = evidence.filter((chunk) =>
        chunk.role === role && (chunk.claimKind === kind || chunk.claimKinds?.includes(kind)));
      if (!matching.length) return [];
      const bestAuthority = Math.max(...matching.map((chunk) => authorityWeight(chunk.authority, policy)));
      const roleWeight = policy.roleWeightsByClaimKind[kind]?.[role] ?? 0;
      return [{ role, score: bestAuthority * 100 + roleWeight }];
    });
    return candidates.sort((left, right) =>
      right.score - left.score || roles.indexOf(left.role) - roles.indexOf(right.role))[0]?.role ?? null;
  };
  const one = (kind: ClaimKind, roles: EvidenceRole[]): EvidenceRole[] => {
    const selected = chooseOne(kind, roles);
    return selected ? [selected] : [];
  };
  const byClaim: Record<ClaimKind, () => EvidenceRole[]> = {
    // Document shapes are alternatives, not an obligation to manufacture a
    // software-style configuration/test stack for manuscripts, ledgers, lab
    // provenance, or visual production records. Deep routes still open the
    // independent retrieval lanes; this list only reserves the strongest
    // actually available role for each claim boundary.
    identity: () => one("identity", ["decision", "intent", "reference", "asset", "observation"]),
    normative: () => one("normative", ["decision", "intent", "reference"]),
    configured: () => one("configured", ["configuration", "decision", "reference"]),
    implemented: () => one("implemented", ["implementation", "observation", "reference"]),
    tested: () => one("tested", ["test", "observation", "reference"]),
    observed: () => one("observed", ["observation", "reference", "asset"]),
    causal: () => one("causal", ["configuration", "implementation", "observation", "decision", "intent", "reference", "test"]),
    historical: () => one("historical", ["observation", "archive", "reference"]),
  };
  const roles = claimKinds.flatMap((kind) => byClaim[kind]());
  if (mode === "evaluate_change") roles.push("proposal", "asset");
  return [...new Set(roles)];
}

function checksForMode(mode: AnalysisMode): AnalysisCheck[] {
  const common: AnalysisCheck[] = [
    "identity_scope",
    "authority_and_lifecycle",
    "temporal_scope",
    "claim_boundary",
    "verification_and_unknowns",
  ];
  if (mode === "answer_question") return common;
  const causal: AnalysisCheck[] = [
    "preconditions_and_reachability",
    "actor_knowledge_and_authorization",
    "resource_conservation",
    "transition_ordering",
    "repeatability_and_idempotency",
    "downstream_consumers",
  ];
  return mode === "trace_dependencies"
    ? [...common, ...causal]
    : [...common, ...causal, "state_and_asset_compatibility"];
}

function laneBalancedSelection(
  evidence: EvidenceChunk[],
  retrievalLanes: RetrievalLane[],
  requiredRoles: EvidenceRole[],
  claimKinds: ClaimKind[],
  policy: AuthorityPolicy,
  maxEvidence: number,
  storyPosition?: number,
  temporalAxis?: string | null,
  targetClaimKeys: string[] = [],
  contextRefs: string[] = [],
): EvidenceChunk[] {
  const relevant = evidence
    .filter((chunk) => (chunk.claimKinds ?? []).some((kind) => claimKinds.includes(kind)));
  const rank = (items: EvidenceChunk[]) => items.sort((a, b) =>
    routingScore(b, claimKinds, policy, targetClaimKeys, contextRefs) - routingScore(a, claimKinds, policy, targetClaimKeys, contextRefs)
      || b.score - a.score
      || a.id.localeCompare(b.id));
  const admissibleRanked = rank(relevant.filter((chunk) => !isQuarantinedEvidence(chunk)));
  const contextOnlyRanked = rank(relevant.filter((chunk) => isQuarantinedEvidence(chunk)));
  const ranked = [...admissibleRanked, ...contextOnlyRanked];
  const selected = new Map<string, EvidenceChunk>();

  for (const lane of retrievalLanes) {
    const candidates = admissibleRanked.filter((chunk) => chunk.retrievalLaneIds?.includes(lane.id)).slice(0, policy.minimumPerLane);
    for (const chunk of candidates) {
      if (selected.size >= maxEvidence) break;
      selected.set(chunk.id, chunk);
    }
  }

  for (const role of requiredRoles) {
    const lane = admissibleRanked.filter((chunk) => chunk.role === role).slice(0, policy.minimumPerLane);
    for (const chunk of lane) {
      if (selected.size >= maxEvidence) break;
      selected.set(chunk.id, chunk);
    }
  }

  // Contradictory polarities are retrieved together so fluency cannot hide the
  // opposing side of an active claim.
  const claimGroups = new Map<string, EvidenceChunk[]>();
  for (const chunk of admissibleRanked) {
    if (!chunk.claimKey || !chunk.polarity) continue;
    for (const scopeKey of contradictionScopeKeys(chunk, storyPosition, temporalAxis)) {
      const group = claimGroups.get(scopeKey) ?? [];
      group.push(chunk);
      claimGroups.set(scopeKey, group);
    }
  }
  const contradictoryGroups = [...claimGroups.values()]
    .filter((group) => new Set(group.map((chunk) => chunk.polarity)).size > 1)
    .sort((a, b) => Math.max(...b.map((chunk) => routingScore(chunk, claimKinds, policy, targetClaimKeys, contextRefs)))
      - Math.max(...a.map((chunk) => routingScore(chunk, claimKinds, policy, targetClaimKeys, contextRefs))));
  for (const group of contradictoryGroups) {
    const polarities = new Set(group.map((chunk) => chunk.polarity));
    const pair: EvidenceChunk[] = [];
    for (const polarity of polarities) {
      const chunk = group.find((candidate) => candidate.polarity === polarity);
      if (chunk && !selected.has(chunk.id)) pair.push(chunk);
    }
    if (selected.size + pair.length > maxEvidence) continue;
    for (const chunk of pair) selected.set(chunk.id, chunk);
  }

  for (const chunk of ranked) {
    if (selected.size >= maxEvidence) break;
    selected.set(chunk.id, chunk);
  }

  return [...selected.values()].sort((a, b) =>
    routingScore(b, claimKinds, policy, targetClaimKeys, contextRefs) - routingScore(a, claimKinds, policy, targetClaimKeys, contextRefs)
      || b.score - a.score
      || a.id.localeCompare(b.id)).slice(0, maxEvidence);
}

function routingScore(
  chunk: EvidenceChunk,
  claimKinds: ClaimKind[],
  policy: AuthorityPolicy,
  targetClaimKeys: string[] = [],
  contextRefs: string[] = [],
): number {
  const relevance = Number.isFinite(chunk.score) ? Math.max(0, Math.min(1, chunk.score)) : 0;
  const authority = chunk.authorityRank ?? normalizedAuthority(chunk, policy);
  const role = chunk.role ?? "reference";
  const roleFit = Math.max(0, ...claimKinds.map((kind) => policy.roleWeightsByClaimKind[kind]?.[role] ?? 0));
  const normalizedTargets = new Set(targetClaimKeys.map(normalizedRouteKey).filter(Boolean));
  const targetFit = chunk.claimKey && normalizedTargets.has(normalizedRouteKey(chunk.claimKey)) ? 1 : 0;
  const normalizedRefs = contextRefs.map(normalizedRouteKey).filter(Boolean);
  const locator = normalizedRouteKey(chunk.locator);
  const sourceId = normalizedRouteKey(chunk.sourceId);
  const contextFit = normalizedRefs.some((ref) => ref === locator || ref === sourceId || locator.includes(ref)) ? 1 : 0;
  // Server-resolved exact targets and explicit context references outrank
  // semantic similarity. They do not establish truth; they only prevent a
  // large repository from crowding the requested proof object out of its
  // bounded evidence capsule.
  return relevance * 0.6 + authority * 0.25 + roleFit * 0.15 + targetFit * 0.75 + contextFit * 0.5;
}

function normalizedRouteKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizedAuthority(chunk: EvidenceChunk, policy: AuthorityPolicy): number {
  if (typeof chunk.authorityRank === "number" && Number.isFinite(chunk.authorityRank)) {
    return Math.max(0, Math.min(1, chunk.authorityRank));
  }
  return authorityWeight(chunk.authority, policy);
}

function reconcileDuplicateIds(
  evidence: EvidenceChunk[],
  claimKinds: ClaimKind[],
  policy: AuthorityPolicy,
  retrievalLanes: RetrievalLane[],
): { evidence: EvidenceChunk[]; diagnostics: string[] } {
  const diagnostics: string[] = [];
  const groups = new Map<string, EvidenceChunk[]>();
  for (const chunk of evidence) {
    const group = groups.get(chunk.id) ?? [];
    group.push(chunk);
    groups.set(chunk.id, group);
  }

  const reconciled: EvidenceChunk[] = [];
  let exactDuplicates = 0;
  for (const [id, group] of groups) {
    if (group.length === 1) {
      reconciled.push(group[0]);
      continue;
    }

    const ranked = [...group].sort((a, b) =>
      routingScore(b, claimKinds, policy) - routingScore(a, claimKinds, policy)
        || normalizedAuthority(b, policy) - normalizedAuthority(a, policy)
        || b.score - a.score
        || evidencePayloadSignature(a).localeCompare(evidencePayloadSignature(b)));
    const signatures = new Set(group.map(evidencePayloadSignature));
    exactDuplicates += group.length - signatures.size;
    const collision = signatures.size > 1;
    let selected: EvidenceChunk = {
      ...ranked[0],
      score: Math.max(...group.map((chunk) => Number.isFinite(chunk.score) ? chunk.score : 0)),
      flags: [...new Set(group.flatMap((chunk) => chunk.flags ?? []))],
    };
    selected.retrievalLaneIds = [...new Set(group.flatMap((chunk) => chunk.retrievalLaneIds ?? []))]
      .filter((laneId) => {
        const lane = retrievalLanes.find((candidate) => candidate.id === laneId);
        return lane
          ? lane.roles.includes(selected.role ?? "reference")
            && (selected.claimKinds ?? []).some((kind) => lane.claimKinds.includes(kind))
          : false;
      });
    if (collision) {
      // A colliding variant cannot manufacture closed-world coverage or a
      // destructive supersession directive. Safety flags and retrieval-lane
      // provenance, on the other hand, are monotonically combined.
      selected = {
        ...selected,
        flags: [...new Set([...(selected.flags ?? []), "evidence_id_collision"])],
        closedWorld: group.every((chunk) => chunk.closedWorld === true),
        ...(unanimousSupersession(group) ? {} : {
          supersedesSourceId: null,
          supersedesEvidenceIds: [],
          supersessionScope: null,
        }),
      };
      diagnostics.push(
        `Evidence ID collision ${id}: selected the highest-scoring in-scope payload (${selected.locator}) from ${signatures.size} distinct variants; safety metadata was combined conservatively.`,
      );
    }
    reconciled.push(selected);
  }
  if (exactDuplicates) {
    diagnostics.push(`Removed ${exactDuplicates} semantically equivalent duplicate evidence fragment${exactDuplicates === 1 ? "" : "s"} after scope filtering.`);
  }
  return { evidence: reconciled, diagnostics };
}

function evidencePayloadSignature(chunk: EvidenceChunk): string {
  return JSON.stringify({
    projectId: chunk.projectId,
    sourceId: chunk.sourceId,
    sourceVersionId: chunk.sourceVersionId,
    title: chunk.title,
    locator: chunk.locator,
    text: chunk.text,
    authority: chunk.authority,
    role: chunk.role,
    lifecycle: chunk.lifecycle,
    claimKinds: chunk.claimKinds,
    claimKind: chunk.claimKind,
    epistemicOwner: chunk.epistemicOwner,
    world: chunk.world,
    validFrom: chunk.validFrom,
    validTo: chunk.validTo,
    temporalAxis: chunk.temporalAxis,
    validFromOrder: chunk.validFromOrder,
    validToOrder: chunk.validToOrder,
    supersedesSourceId: chunk.supersedesSourceId,
    supersedesEvidenceIds: chunk.supersedesEvidenceIds,
    supersessionScope: chunk.supersessionScope,
    completenessBoundary: chunk.completenessBoundary ?? null,
    closedWorld: chunk.closedWorld,
    claimKey: chunk.claimKey,
    polarity: chunk.polarity,
    referentKeys: [...(chunk.referentKeys ?? [])].sort(),
    flags: chunk.flags,
  });
}

function unanimousSupersession(group: EvidenceChunk[]): boolean {
  const directives = new Set(group.map((chunk) => JSON.stringify({
    supersedesSourceId: chunk.supersedesSourceId ?? null,
    supersedesEvidenceIds: [...(chunk.supersedesEvidenceIds ?? [])].sort(),
    supersessionScope: chunk.supersessionScope ?? null,
  })));
  return directives.size === 1;
}

function contradictionScopeKeys(chunk: EvidenceChunk, storyPosition?: number, temporalAxis?: string | null): string[] {
  const kinds = chunk.claimKind
    ? [chunk.claimKind]
    : chunk.claimKinds?.length ? [...new Set(chunk.claimKinds)] : ["unspecified"];
  const temporalFrame = storyPosition === undefined
    ? [chunk.validFrom ?? null, chunk.validTo ?? null, chunk.validFromOrder ?? null, chunk.validToOrder ?? null]
    : ["story_position", normalizedTemporalAxis(temporalAxis ?? chunk.temporalAxis) ?? "unspecified", storyPosition];
  return kinds.map((kind) => JSON.stringify([
    chunk.claimKey,
    kind,
    normalizedScopeValue(chunk.world),
    normalizedScopeValue(chunk.epistemicOwner),
    temporalFrame,
  ]));
}

function normalizedScopeValue(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized || null;
}

function applySupersession(
  evidence: EvidenceChunk[],
  policy: AuthorityPolicy,
): { evidence: EvidenceChunk[]; diagnostics: string[] } {
  const diagnostics: string[] = [];
  const byId = new Map(evidence.map((chunk) => [chunk.id, chunk]));
  const edges: Array<{ from: string; to: string }> = [];

  for (const replacement of evidence) {
    const exactTargets = replacement.supersedesEvidenceIds ?? [];
    const legacySourceScope = replacement.authority === "retcon" && replacement.supersedesSourceId && !replacement.supersessionScope;
    const sourceScope = replacement.supersessionScope === "source" || legacySourceScope;
    for (const targetId of exactTargets) {
      const target = byId.get(targetId);
      if (target && canSupersede(replacement, target, policy)) edges.push({ from: replacement.id, to: target.id });
      else if (target) diagnostics.push(`Ignored unauthorized supersession ${replacement.id} → ${target.id}.`);
    }
    if (sourceScope && replacement.supersedesSourceId) {
      const sourceChunks = evidence.filter((candidate) =>
        candidate.id !== replacement.id && candidate.sourceId === replacement.supersedesSourceId);
      const allowed = replacement.claimKey
        ? sourceChunks.filter((target) => target.claimKey && canSupersede(replacement, target, policy))
        : [];
      for (const target of allowed) edges.push({ from: replacement.id, to: target.id });
      const skipped = sourceChunks.length - allowed.length;
      if (skipped) {
        diagnostics.push(
          `Source-scoped supersession from ${replacement.id} preserved ${skipped} incompatible or unauthorized fragment${skipped === 1 ? "" : "s"}.`,
        );
      }
    }
  }

  const adjacency = new Map<string, string[]>();
  for (const edge of edges) adjacency.set(edge.from, [...(adjacency.get(edge.from) ?? []), edge.to]);
  const cyclicEdges = edges.filter((edge) => pathExists(edge.to, edge.from, adjacency));
  const cyclicKeys = new Set(cyclicEdges.map((edge) => `${edge.from}\u0000${edge.to}`));
  if (cyclicEdges.length) {
    diagnostics.push(`Ignored ${cyclicEdges.length} cyclic supersession directive${cyclicEdges.length === 1 ? "" : "s"}; cycle participants remain visible as a conflict.`);
  }
  const targets = new Set(edges
    .filter((edge) => !cyclicKeys.has(`${edge.from}\u0000${edge.to}`))
    .map((edge) => edge.to));

  const filtered = evidence.filter((chunk) =>
    !targets.has(chunk.id));
  const removed = evidence.length - filtered.length;
  if (removed) diagnostics.push(`Removed ${removed} explicitly superseded fragment${removed === 1 ? "" : "s"}.`);
  return { evidence: filtered, diagnostics };
}

function pathExists(start: string, goal: string, adjacency: Map<string, string[]>): boolean {
  const pending = [start];
  const seen = new Set<string>();
  while (pending.length) {
    const current = pending.pop()!;
    if (current === goal) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    pending.push(...(adjacency.get(current) ?? []));
  }
  return false;
}

function canSupersede(replacement: EvidenceChunk, target: EvidenceChunk, policy: AuthorityPolicy): boolean {
  if (replacement.id === target.id) return false;
  if (isQuarantinedEvidence(replacement)) return false;
  if (!isApprovedActiveReplacement(replacement)) return false;
  if (policy.protectedAuthorities.includes(target.authority)) return false;
  if (normalizedAuthority(replacement, policy) < normalizedAuthority(target, policy)) return false;
  if (!claimKindsOverlap(replacement, target)) return false;
  if (!canEstablishOverlappingClaim(replacement, target, policy)) return false;
  if (!compatibleOptionalScope(replacement.claimKey, target.claimKey)) return false;
  if (!compatibleOptionalScope(replacement.world, target.world)) return false;
  if (!compatibleOptionalScope(replacement.epistemicOwner, target.epistemicOwner)) return false;
  return true;
}

function canEstablishOverlappingClaim(
  replacement: EvidenceChunk,
  target: EvidenceChunk,
  policy: AuthorityPolicy,
): boolean {
  const replacementKinds = new Set(replacement.claimKind ? [replacement.claimKind] : replacement.claimKinds ?? []);
  const targetKinds = target.claimKind ? [target.claimKind] : target.claimKinds ?? [];
  const role = replacement.role ?? "reference";
  return targetKinds.some((kind) =>
    replacementKinds.has(kind)
    && (policy.allowedUsesByRole[role]?.[kind] ?? []).includes("establish")
    && (policy.allowedUsesByAuthority[replacement.authority]?.[kind] ?? []).includes("establish"));
}

function canEstablishClaimKind(
  chunk: EvidenceChunk,
  kind: ClaimKind,
  policy: AuthorityPolicy,
): boolean {
  if (isQuarantinedEvidence(chunk) || chunk.lifecycle !== "active") return false;
  const declaredKinds = new Set(chunk.claimKind ? [chunk.claimKind] : chunk.claimKinds ?? []);
  if (!declaredKinds.has(kind)) return false;
  const role = chunk.role ?? "reference";
  return (policy.allowedUsesByRole[role]?.[kind] ?? []).includes("establish")
    && (policy.allowedUsesByAuthority[chunk.authority]?.[kind] ?? []).includes("establish");
}

const QUARANTINE_FLAGS = new Set([
  "evidence_id_collision",
  "possible_prompt_injection",
  "compiled_context_only",
  "compiler_security_quarantine",
]);

const CLOSURE_DISQUALIFYING_FLAGS = new Set([
  ...QUARANTINE_FLAGS,
  "repository_frame_invalid",
  "repository_frame_mismatch",
  "repository_frame_truncated",
  "repository_frame_unframed",
]);

function isQuarantinedEvidence(chunk: EvidenceChunk): boolean {
  return Boolean(chunk.flags?.some((flag) => QUARANTINE_FLAGS.has(flag)));
}

function isClosureEligibleEvidence(chunk: EvidenceChunk): boolean {
  return !chunk.flags?.some((flag) => CLOSURE_DISQUALIFYING_FLAGS.has(flag));
}

function isApprovedActiveReplacement(chunk: EvidenceChunk): boolean {
  if (chunk.lifecycle !== "active") return false;
  if (["proposal", "archive", "evaluation"].includes(chunk.role ?? "reference")) return false;
  return chunk.authority !== "proposal" && chunk.authority !== "reference";
}

function claimKindsOverlap(replacement: EvidenceChunk, target: EvidenceChunk): boolean {
  const replacementKinds = new Set(replacement.claimKind ? [replacement.claimKind] : replacement.claimKinds ?? []);
  const targetKinds = target.claimKind ? [target.claimKind] : target.claimKinds ?? [];
  return replacementKinds.size > 0 && targetKinds.some((kind) => replacementKinds.has(kind));
}

function compatibleOptionalScope(left: string | null | undefined, right: string | null | undefined): boolean {
  const normalizedLeft = normalizedScopeValue(left);
  const normalizedRight = normalizedScopeValue(right);
  if (normalizedLeft == null || normalizedRight == null) return normalizedLeft === normalizedRight;
  return normalizedLeft === normalizedRight;
}

function countByRole(evidence: EvidenceChunk[]): Partial<Record<EvidenceRole, number>> {
  const counts: Partial<Record<EvidenceRole, number>> = {};
  for (const chunk of evidence) {
    const role = chunk.role ?? "reference";
    counts[role] = (counts[role] ?? 0) + 1;
  }
  return counts;
}

function countByLane(evidence: EvidenceChunk[]): Partial<Record<RetrievalLaneId, number>> {
  const counts: Partial<Record<RetrievalLaneId, number>> = {};
  for (const chunk of evidence) {
    for (const lane of chunk.retrievalLaneIds ?? []) counts[lane] = (counts[lane] ?? 0) + 1;
  }
  return counts;
}

function isTemporallyValid(chunk: EvidenceChunk, request: QueryRequest): boolean {
  const requestedAxis = normalizedTemporalAxis(request.temporalAxis)
    ?? parseNarrativeOrdinal(request.timeScope)?.unit
    ?? null;
  const parsedFrom = parseNarrativeOrdinal(chunk.validFrom);
  const parsedTo = parseNarrativeOrdinal(chunk.validTo);
  const declaredChunkAxis = normalizedTemporalAxis(chunk.temporalAxis);
  const inferredChunkAxes = new Set([declaredChunkAxis, parsedFrom?.unit, parsedTo?.unit].filter(Boolean));
  if (inferredChunkAxes.size > 1) return false;
  const chunkAxis = [...inferredChunkAxes][0] ?? null;
  if (requestedAxis && chunkAxis && requestedAxis !== chunkAxis) return false;

  if (request.storyPosition !== undefined) {
    const from = chunk.validFromOrder ?? parsedFrom?.value ?? null;
    const to = chunk.validToOrder ?? parsedTo?.value ?? null;
    const start = request.storyPosition;
    const end = request.targetPosition ?? start;
    return (from == null || from <= end)
      && (to == null || start <= to);
  }
  if (request.targetPosition !== undefined) {
    const from = chunk.validFromOrder ?? parsedFrom?.value ?? null;
    const to = chunk.validToOrder ?? parsedTo?.value ?? null;
    return (from == null || from <= request.targetPosition)
      && (to == null || request.targetPosition <= to);
  }
  const requested = parseNarrativeOrdinal(request.timeScope);
  if (!requested) return true;
  return (!parsedFrom || parsedFrom.unit !== requested.unit || parsedFrom.value <= requested.value)
    && (!parsedTo || parsedTo.unit !== requested.unit || requested.value <= parsedTo.value);
}

function normalizedTemporalAxis(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return null;
  const aliases: Record<string, string> = { ch: "chapter", ep: "episode" };
  return aliases[normalized] ?? normalized;
}

function parseNarrativeOrdinal(value: string | null | undefined): { unit: string; value: number } | null {
  const match = value?.trim().toLowerCase().match(/\b(day|chapter|ch|beat|scene|turn|episode|ep|step)[\s_:#-]*(\d+(?:\.\d+)?)\b/);
  if (!match) return null;
  const aliases: Record<string, string> = { ch: "chapter", ep: "episode" };
  return { unit: aliases[match[1]] ?? match[1], value: Number(match[2]) };
}
