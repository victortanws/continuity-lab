import type {
  AnalysisMode,
  ClaimKind,
  QueryRequest,
  RetrievalLaneId,
  TruthTarget,
} from "./contracts";
import {
  inferContinuityQuestionIntent,
  normalizedQuestionText,
  type ContinuityQuestionIntent,
} from "./question-intent";

export type ProofRouteClass = "lookup" | "scoped" | "causal" | "change";
export type ProofKind =
  | "direct_citation"
  | "authority_resolution"
  | "verification_evidence"
  | "transition_certificate"
  | "change_impact";
export type ClosureDemand = "local" | "bounded" | "exhaustive";

/**
 * The server compiles this small contract before retrieval. It is deliberately
 * domain-neutral: it says what kind of proof the question needs, not what the
 * answer should be. That prevents a story name, benchmark phrase, or fluent
 * source passage from silently changing the analysis task.
 */
export type ProofContract = {
  version: "continuity.proof-contract.v1";
  intent: ContinuityQuestionIntent;
  routeClass: ProofRouteClass;
  mode: AnalysisMode;
  truthTarget: TruthTarget;
  proofKind: ProofKind;
  closureDemand: ClosureDemand;
  claimKinds: ClaimKind[];
  retrievalLanes: RetrievalLaneId[];
  dependenciesRequired: boolean;
  transitionCertificateRequired: boolean;
  citationBudget: { minimum: number; maximum: number };
  rationale: string;
};

export function compileProofContract(request: QueryRequest): ProofContract {
  const intent = inferContinuityQuestionIntent(request.question);
  const normalized = normalizedQuestionText(`${request.question} ${request.proposedChange ?? ""}`);
  const routeClass = routeClassFor(intent, Boolean(request.proposedChange?.trim()));
  const minimumMode: AnalysisMode = routeClass === "change"
    ? "evaluate_change"
    : routeClass === "causal" ? "trace_dependencies" : "answer_question";
  const mode = deeperMode(request.analysisMode ?? "answer_question", minimumMode);
  const claimKinds = [...new Set([
    ...claimKindsFor(intent, normalized, routeClass),
    ...(request.claimKinds ?? []),
  ])];
  const exhaustive = asksForExhaustiveOrNegativeProof(normalized);
  const closureDemand: ClosureDemand = exhaustive
    ? "exhaustive"
    : routeClass === "lookup" ? "local" : "bounded";
  const proofKind = proofKindFor(intent, routeClass);
  const retrievalLanes = [...new Set([
    ...lanesFor(intent, normalized, routeClass),
    ...claimKinds.flatMap(lanesForClaimKind),
  ])];
  const dependenciesRequired = routeClass === "causal" || routeClass === "change";
  const transitionCertificateRequired = intent === "reachability" || intent === "repair_plan";
  const maximum = routeClass === "lookup" ? 3 : routeClass === "scoped" ? 6 : routeClass === "causal" ? 12 : 16;

  return {
    version: "continuity.proof-contract.v1",
    intent,
    routeClass,
    mode,
    truthTarget: request.truthTarget ?? "project_truth",
    proofKind,
    closureDemand,
    claimKinds,
    retrievalLanes,
    dependenciesRequired,
    transitionCertificateRequired,
    citationBudget: { minimum: 1, maximum },
    rationale: rationaleFor(routeClass, closureDemand),
  };
}

function routeClassFor(intent: ContinuityQuestionIntent, hasProposal: boolean): ProofRouteClass {
  if (hasProposal || intent === "change_analysis") return "change";
  if (intent === "reachability" || intent === "repair_plan") return "causal";
  if (["verification_plan", "source_authority", "visual_binding"].includes(intent)) return "scoped";
  if (["identity", "relationship", "fact_lookup"].includes(intent)) return "lookup";
  return "scoped";
}

function proofKindFor(intent: ContinuityQuestionIntent, routeClass: ProofRouteClass): ProofKind {
  if (routeClass === "change") return "change_impact";
  if (routeClass === "causal") return "transition_certificate";
  if (intent === "source_authority") return "authority_resolution";
  if (intent === "verification_plan") return "verification_evidence";
  return "direct_citation";
}

function claimKindsFor(
  intent: ContinuityQuestionIntent,
  normalized: string,
  routeClass: ProofRouteClass,
): ClaimKind[] {
  if (intent === "identity" || intent === "relationship") return ["identity"];
  if (intent === "visual_binding") return ["identity", "observed"];
  if (intent === "verification_plan") return ["implemented", "tested", "observed"];
  if (routeClass === "change") {
    return ["identity", "normative", "configured", "implemented", "tested", "observed", "causal", "historical"];
  }
  if (routeClass === "causal") return ["identity", "configured", "implemented", "tested", "observed", "causal"];
  if (intent === "fact_lookup") {
    const explicit: ClaimKind[] = [];
    if (/\b(?:configured|configuration|setting|value|limit|threshold|price|cost|date|status|amount)\b/.test(normalized)) explicit.push("configured");
    if (/\b(?:runtime|implemented|implementation|handler|function|executes|writes?)\b/.test(normalized)) explicit.push("implemented");
    if (/\b(?:test|tested|verification|result|pass|fail)\b/.test(normalized)) explicit.push("tested");
    if (/\b(?:observed|happened|recorded|measured|reported)\b/.test(normalized)) explicit.push("observed");
    if (explicit.length) return [...new Set(explicit)];
    return ["normative", "configured"];
  }
  if (intent === "source_authority") return ["identity", "normative", "configured", "implemented", "tested", "observed"];
  return ["identity", "normative", "configured", "implemented", "tested", "observed", "causal"];
}

function lanesFor(
  intent: ContinuityQuestionIntent,
  normalized: string,
  routeClass: ProofRouteClass,
): RetrievalLaneId[] {
  if (intent === "identity" || intent === "relationship") return ["authority"];
  if (intent === "visual_binding") return ["authority", "verification"];
  if (intent === "verification_plan") return ["execution", "verification"];
  if (intent === "fact_lookup") {
    const lanes: RetrievalLaneId[] = [];
    if (/\b(?:configured|configuration|setting|value|limit|threshold|price|cost|date|status|amount)\b/.test(normalized)) lanes.push("declared_state");
    if (/\b(?:runtime|implemented|implementation|handler|function|executes|writes?)\b/.test(normalized)) lanes.push("execution");
    if (/\b(?:test|tested|verification|result|pass|fail|observed|measured|reported)\b/.test(normalized)) lanes.push("verification");
    if (lanes.length) return [...new Set(lanes)];
    return ["authority", "declared_state"];
  }
  if (intent === "source_authority") return ["authority", "declared_state", "execution", "verification"];
  if (routeClass === "change") return ["authority", "declared_state", "execution", "verification", "change_history"];
  if (routeClass === "causal") return ["authority", "declared_state", "execution", "verification"];
  return ["authority", "declared_state", "execution"];
}

function lanesForClaimKind(kind: ClaimKind): RetrievalLaneId[] {
  if (kind === "identity" || kind === "normative") return ["authority"];
  if (kind === "configured") return ["declared_state"];
  if (kind === "implemented") return ["execution"];
  if (kind === "tested" || kind === "observed") return ["verification"];
  if (kind === "historical") return ["change_history"];
  return ["declared_state", "execution", "verification"];
}

function asksForExhaustiveOrNegativeProof(normalized: string): boolean {
  return /\b(?:none|no |not |never|missing|absent|without|all |every |any |only |complete|entire|exhaustive|what else|everything|nothing)\b/.test(normalized);
}

function deeperMode(requested: AnalysisMode, minimum: AnalysisMode): AnalysisMode {
  const rank: Record<AnalysisMode, number> = {
    answer_question: 0,
    trace_dependencies: 1,
    evaluate_change: 2,
  };
  return rank[requested] >= rank[minimum] ? requested : minimum;
}

function rationaleFor(routeClass: ProofRouteClass, closureDemand: ClosureDemand): string {
  if (routeClass === "lookup") {
    return closureDemand === "local"
      ? "One directly supported fact is sufficient; corpus-wide closure and dependency tracing are not required."
      : "The lookup contains a negative or exhaustive claim, so its named scope must be bounded before absence is inferred.";
  }
  if (routeClass === "scoped") return "Resolve the governing identity, rule, state, or verification boundary without expanding into an unrelated causal audit.";
  if (routeClass === "causal") return "Establish one compatible transition path, its blockers, and the proof boundary before deciding reachability.";
  return "Keep the proposed state separate, trace affected consumers, and return reviewable validation work rather than promoting the change.";
}
