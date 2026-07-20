import type {
  AnalysisCheck,
  AnalysisMode,
  AnalysisRoute,
  AuthorityPolicy,
  CanonAuthority,
  ClaimKind,
  EvidenceChunk,
  EvidenceRole,
  QueryRequest,
} from "../contracts";
import { classifyEvidence, DEFAULT_AUTHORITY_POLICY } from "../policy/default";

export type AuthorityRoutingResult = {
  evidence: EvidenceChunk[];
  route: AnalysisRoute;
};

export function routeEvidence(
  chunks: EvidenceChunk[],
  request: QueryRequest,
  policy: AuthorityPolicy = DEFAULT_AUTHORITY_POLICY,
): AuthorityRoutingResult {
  const diagnostics: string[] = [];
  const seen = new Set<string>();
  let crossProject = 0;
  let duplicates = 0;
  let outsideTime = 0;

  const candidates = chunks.flatMap((chunk): EvidenceChunk[] => {
    if (chunk.projectId !== request.projectId) {
      crossProject += 1;
      return [];
    }
    if (seen.has(chunk.id)) {
      duplicates += 1;
      return [];
    }
    seen.add(chunk.id);
    if (request.storyPosition !== undefined && !isTemporallyValid(chunk, request.storyPosition)) {
      outsideTime += 1;
      return [];
    }
    const profile = classifyEvidence(chunk, policy);
    if (policy.excludedRoles.includes(profile.role)) return [];
    return [{
      ...chunk,
      role: profile.role,
      lifecycle: profile.lifecycle,
      claimKinds: profile.claimKinds,
      authorityRank: normalizedAuthority(chunk, policy),
    }];
  });

  if (crossProject) diagnostics.push(`Removed ${crossProject} cross-project evidence fragment${crossProject === 1 ? "" : "s"}.`);
  if (duplicates) diagnostics.push(`Removed ${duplicates} duplicate evidence ID${duplicates === 1 ? "" : "s"}.`);
  if (outsideTime) diagnostics.push(`Removed ${outsideTime} fragment${outsideTime === 1 ? "" : "s"} outside the requested temporal scope.`);
  const excludedEvaluation = chunks.filter((chunk) => classifyEvidence(chunk, policy).role === "evaluation").length;
  if (excludedEvaluation) diagnostics.push(`Excluded ${excludedEvaluation} evaluation or answer-key fragment${excludedEvaluation === 1 ? "" : "s"} from reasoning evidence.`);

  const supersession = applySupersession(candidates, policy);
  diagnostics.push(...supersession.diagnostics);

  const mode = analysisMode(request);
  const claimKinds = requestedClaimKinds(request, mode);
  const requiredRoles = rolesForMode(mode);
  const availableByRole = countByRole(supersession.evidence);
  for (const role of requiredRoles) {
    if (!availableByRole[role]) diagnostics.push(`No ${role} evidence lane was available in this revision.`);
  }

  const selected = laneBalancedSelection(supersession.evidence, requiredRoles, claimKinds, policy);
  const selectedByRole = countByRole(selected);
  const closedWorldEvidenceIds = selected.filter((chunk) => chunk.closedWorld).map((chunk) => chunk.id);
  const requestedCoverage = request.coverage ?? { scope: "retrieved evidence only", complete: false, excludedSources: [] };
  const trustedComplete = Boolean(requestedCoverage.complete && closedWorldEvidenceIds.length > 0);
  if (requestedCoverage.complete && !closedWorldEvidenceIds.length) {
    diagnostics.push("The request claimed complete coverage, but no selected fragment was an explicit closed-world registry.");
  }
  if (!requestedCoverage.complete) diagnostics.push("Semantic coverage is partial; retrieval silence cannot prove a negative.");

  return {
    evidence: selected,
    route: {
      version: "continuity.route.v2",
      policyId: policy.id,
      policyVersion: policy.version,
      mode,
      claimKinds,
      requiredRoles,
      requiredChecks: checksForMode(mode),
      selectedByRole,
      availableByRole,
      coverage: {
        scope: requestedCoverage.scope,
        trustedComplete,
        closedWorldEvidenceIds,
        excludedSources: requestedCoverage.excludedSources ?? [],
      },
      diagnostics,
    },
  };
}

export function authorityWeight(
  authority: CanonAuthority,
  policy: AuthorityPolicy = DEFAULT_AUTHORITY_POLICY,
): number {
  return policy.authorityWeights[authority] ?? 0;
}

function analysisMode(request: QueryRequest): AnalysisMode {
  if (request.analysisMode) return request.analysisMode;
  return request.proposedChange?.trim() ? "evaluate_change" : "answer_question";
}

function requestedClaimKinds(request: QueryRequest, mode: AnalysisMode): ClaimKind[] {
  if (request.claimKinds?.length) return [...new Set(request.claimKinds)];
  if (mode === "evaluate_change") {
    return ["identity", "normative", "configured", "implemented", "tested", "observed", "causal", "historical"];
  }
  if (mode === "trace_dependencies") return ["configured", "implemented", "tested", "observed", "causal"];
  return ["identity", "normative", "implemented", "observed"];
}

function rolesForMode(mode: AnalysisMode): EvidenceRole[] {
  if (mode === "evaluate_change") {
    return ["intent", "decision", "configuration", "implementation", "test", "observation", "proposal", "archive", "asset", "reference"];
  }
  if (mode === "trace_dependencies") return ["decision", "configuration", "implementation", "test", "observation", "reference"];
  return ["intent", "decision", "implementation", "test", "observation", "reference"];
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
  requiredRoles: EvidenceRole[],
  claimKinds: ClaimKind[],
  policy: AuthorityPolicy,
): EvidenceChunk[] {
  const ranked = [...evidence].sort((a, b) =>
    routingScore(b, claimKinds, policy) - routingScore(a, claimKinds, policy)
      || b.score - a.score
      || a.id.localeCompare(b.id));
  const selected = new Map<string, EvidenceChunk>();

  for (const role of requiredRoles) {
    const lane = ranked.filter((chunk) => chunk.role === role).slice(0, policy.minimumPerLane);
    for (const chunk of lane) {
      if (selected.size >= policy.maxEvidence) break;
      selected.set(chunk.id, chunk);
    }
  }

  // Contradictory polarities are retrieved together so fluency cannot hide the
  // opposing side of an active claim.
  const claimGroups = new Map<string, EvidenceChunk[]>();
  for (const chunk of ranked) {
    if (!chunk.claimKey || !chunk.polarity) continue;
    const group = claimGroups.get(chunk.claimKey) ?? [];
    group.push(chunk);
    claimGroups.set(chunk.claimKey, group);
  }
  const contradictoryGroups = [...claimGroups.values()]
    .filter((group) => new Set(group.map((chunk) => chunk.polarity)).size > 1)
    .sort((a, b) => Math.max(...b.map((chunk) => routingScore(chunk, claimKinds, policy)))
      - Math.max(...a.map((chunk) => routingScore(chunk, claimKinds, policy))));
  for (const group of contradictoryGroups) {
    const polarities = new Set(group.map((chunk) => chunk.polarity));
    const pair: EvidenceChunk[] = [];
    for (const polarity of polarities) {
      const chunk = group.find((candidate) => candidate.polarity === polarity);
      if (chunk && !selected.has(chunk.id)) pair.push(chunk);
    }
    if (selected.size + pair.length > policy.maxEvidence) continue;
    for (const chunk of pair) selected.set(chunk.id, chunk);
  }

  for (const chunk of ranked) {
    if (selected.size >= policy.maxEvidence) break;
    selected.set(chunk.id, chunk);
  }

  return [...selected.values()].sort((a, b) =>
    routingScore(b, claimKinds, policy) - routingScore(a, claimKinds, policy)
      || b.score - a.score
      || a.id.localeCompare(b.id)).slice(0, policy.maxEvidence);
}

function routingScore(chunk: EvidenceChunk, claimKinds: ClaimKind[], policy: AuthorityPolicy): number {
  const relevance = Number.isFinite(chunk.score) ? Math.max(0, Math.min(1, chunk.score)) : 0;
  const authority = chunk.authorityRank ?? normalizedAuthority(chunk, policy);
  const role = chunk.role ?? "reference";
  const roleFit = Math.max(0, ...claimKinds.map((kind) => policy.roleWeightsByClaimKind[kind]?.[role] ?? 0));
  return relevance * 0.6 + authority * 0.25 + roleFit * 0.15;
}

function normalizedAuthority(chunk: EvidenceChunk, policy: AuthorityPolicy): number {
  if (typeof chunk.authorityRank === "number" && Number.isFinite(chunk.authorityRank)) {
    return Math.max(0, Math.min(1, chunk.authorityRank));
  }
  return authorityWeight(chunk.authority, policy);
}

function applySupersession(
  evidence: EvidenceChunk[],
  policy: AuthorityPolicy,
): { evidence: EvidenceChunk[]; diagnostics: string[] } {
  const diagnostics: string[] = [];
  const byId = new Map(evidence.map((chunk) => [chunk.id, chunk]));
  const targets = new Set<string>();
  const sourceTargets = new Set<string>();

  for (const replacement of evidence) {
    const exactTargets = replacement.supersedesEvidenceIds ?? [];
    const legacySourceScope = replacement.authority === "retcon" && replacement.supersedesSourceId && !replacement.supersessionScope;
    const sourceScope = replacement.supersessionScope === "source" || legacySourceScope;
    for (const targetId of exactTargets) {
      const target = byId.get(targetId);
      if (target && canSupersede(replacement, target, policy)) targets.add(target.id);
      else if (target) diagnostics.push(`Ignored unauthorized supersession ${replacement.id} → ${target.id}.`);
    }
    if (sourceScope && replacement.supersedesSourceId) {
      const sourceChunks = evidence.filter((candidate) => candidate.sourceId === replacement.supersedesSourceId);
      const allowed = sourceChunks.filter((target) => canSupersede(replacement, target, policy));
      if (allowed.length === sourceChunks.length && allowed.length) sourceTargets.add(replacement.supersedesSourceId);
      else if (sourceChunks.length) diagnostics.push(`Ignored unsafe source-wide supersession from ${replacement.id}; use exact evidence IDs or sufficient authority.`);
    }
  }

  const filtered = evidence.filter((chunk) =>
    chunk.lifecycle !== "superseded"
      && !targets.has(chunk.id)
      && !sourceTargets.has(chunk.sourceId));
  const removed = evidence.length - filtered.length;
  if (removed) diagnostics.push(`Removed ${removed} explicitly superseded fragment${removed === 1 ? "" : "s"}.`);
  return { evidence: filtered, diagnostics };
}

function canSupersede(replacement: EvidenceChunk, target: EvidenceChunk, policy: AuthorityPolicy): boolean {
  if (replacement.id === target.id) return false;
  if (policy.protectedAuthorities.includes(target.authority)) return false;
  return normalizedAuthority(replacement, policy) >= normalizedAuthority(target, policy);
}

function countByRole(evidence: EvidenceChunk[]): Partial<Record<EvidenceRole, number>> {
  const counts: Partial<Record<EvidenceRole, number>> = {};
  for (const chunk of evidence) {
    const role = chunk.role ?? "reference";
    counts[role] = (counts[role] ?? 0) + 1;
  }
  return counts;
}

function isTemporallyValid(chunk: EvidenceChunk, position: number): boolean {
  return (chunk.validFromOrder == null || chunk.validFromOrder <= position)
    && (chunk.validToOrder == null || position <= chunk.validToOrder);
}
