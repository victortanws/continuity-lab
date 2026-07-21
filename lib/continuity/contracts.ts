export const CONTINUITY_ANSWER_VERSION = "continuity.answer.v7" as const;
/**
 * The router implementation can evolve without changing the public answer or
 * MCP contract. Keep this separate from `CONTINUITY_ANSWER_VERSION`: v3.4 is
 * a proof-contract/routing upgrade, not a wire-format reset.
 */
export const AUTHORITY_ROUTER_VERSION = "3.8.0" as const;

export type CanonAuthority =
  | "immutable"
  | "canon"
  | "retcon"
  | "production"
  | "proposal"
  | "reference";

/**
 * Source role and lifecycle are deliberately separate from authority. A source
 * can be excellent evidence of what is implemented while having no authority
 * to decide what ought to be implemented.
 */
export type EvidenceRole =
  | "intent"
  | "decision"
  | "configuration"
  | "implementation"
  | "test"
  | "observation"
  | "proposal"
  | "archive"
  | "asset"
  | "reference"
  | "evaluation";

export type EvidenceLifecycle = "active" | "proposed" | "superseded" | "historical" | "unknown";

export const CLAIM_KINDS = [
  "identity",
  "normative",
  "configured",
  "implemented",
  "tested",
  "observed",
  "causal",
  "historical",
] as const;

export type ClaimKind = typeof CLAIM_KINDS[number];

export type AnalysisMode = "answer_question" | "evaluate_change" | "trace_dependencies";

/** The world in which the caller is asking the proposition to be evaluated. */
export type TruthTarget = "packet_assertion" | "project_truth" | "observed_world";

/**
 * Presentation is a server decision, not a caller-controlled analysis mode.
 * A focused answer may still retain a complete internal routing receipt while
 * keeping that receipt out of the default user-facing projection.
 */
export type PresentationDepth = "focused" | "full";

export type CoverageClosure = "closed" | "partial" | "open";

/**
 * The truth plane in which an atomic claim can be established. In particular,
 * `source_assertion` means “this pinned source states X”; it is not approval of
 * X as current project canon or runtime truth.
 */
export type AssertionScope = "project_truth" | "source_assertion" | "proposal";

/**
 * A route can only claim closed coverage when it has affirmative closed-world
 * evidence and no known omissions. The legacy fields remain present for
 * consumers that predate the explicit closure assessment.
 */
export type CoverageAssessment = {
  scope: string;
  closure: CoverageClosure;
  trustedComplete: boolean;
  /** Evidence carrying a verified, revision-pinned completeness boundary.
   * `closedWorldEvidenceIds` is retained as a compatibility alias. */
  completenessBoundaryEvidenceIds: string[];
  closedWorldEvidenceIds: string[];
  /** True when either an upstream source or this route hit a hard bound. */
  truncated: boolean;
  /** Failures that prevented an otherwise in-scope source from being read. */
  failures: string[];
  /** Evidence retained outside this bounded reasoning pass. */
  deferredEvidenceIds: string[];
  /** Upstream sources known to exist but deferred before evidence routing. */
  deferredSources: string[];
  /** Sources intentionally omitted from this coverage claim. */
  excludedSources: string[];
};

export type AnalysisBudgetProfile =
  | "answer_focused"
  | "answer_broad"
  | "dependency_trace"
  | "change_evaluation";

/**
 * Hard, server-owned fan-out and pass limits. These are deliberately phrased
 * as counts rather than an accuracy promise: exhausting a budget lowers
 * coverage; it never licenses an unsupported conclusion or an unbounded retry.
 */
export type AnalysisBudget = {
  profile: AnalysisBudgetProfile;
  maxRetrievalLanes: number;
  maxResultsPerLane: number;
  maxEvidence: number;
  maxCompilerPasses: number;
  maxReasonerPasses: number;
  maxReachabilityPasses: number;
};

export type AnalysisCheck =
  | "identity_scope"
  | "authority_and_lifecycle"
  | "temporal_scope"
  | "claim_boundary"
  | "preconditions_and_reachability"
  | "actor_knowledge_and_authorization"
  | "resource_conservation"
  | "transition_ordering"
  | "repeatability_and_idempotency"
  | "state_and_asset_compatibility"
  | "downstream_consumers"
  | "verification_and_unknowns";

export type CitationUse = "establish" | "corroborate" | "challenge" | "contextualize" | "propose";

export type AnalysisCheckFinding = {
  check: AnalysisCheck;
  status: "supported" | "conflicted" | "unknown" | "not_applicable";
  finding: string;
  evidenceIds: string[];
};

export type AnswerObligationKind =
  | "direct_answer"
  | "truth_and_verdict"
  | "evidence_world"
  | "decisive_evidence"
  | "entity_resolution"
  | "claim_boundary"
  | "coverage_closure"
  | "dependency_inventory"
  | "reachability_certificate"
  | "proposal_separation"
  | "downstream_effects";

/**
 * Server-authored checklist used before and after model drafting. It prevents
 * response compression from silently dropping a required invariant while
 * keeping internal diagnostics out of fast lookup answers.
 */
export type AnswerObligation = {
  id: string;
  kind: AnswerObligationKind;
  required: boolean;
  visibility: "answer" | "receipt";
  rationale: string;
  claimKinds: ClaimKind[];
  targetClaimKeys: string[];
  evidenceIds: string[];
};

export type RetrievalLaneId = "authority" | "declared_state" | "execution" | "verification" | "change_history";

export type RetrievalLane = {
  id: RetrievalLaneId;
  roles: EvidenceRole[];
  claimKinds: ClaimKind[];
  query: string;
  maxResults: number;
};

export type RetrievalPlan = {
  version: "continuity.retrieval-plan.v1";
  lanes: RetrievalLane[];
};

export type AuthorityPolicyRule = {
  id: string;
  pathPattern: string;
  role: EvidenceRole;
  lifecycle?: EvidenceLifecycle;
  authority?: CanonAuthority;
  claimKinds?: ClaimKind[];
};

export type AuthorityPolicy = {
  id: string;
  version: string;
  authorityWeights: Record<CanonAuthority, number>;
  roleWeightsByClaimKind: Record<ClaimKind, Partial<Record<EvidenceRole, number>>>;
  allowedUsesByRole: Record<EvidenceRole, Partial<Record<ClaimKind, CitationUse[]>>>;
  /** Authority and role are independent gates. A manuscript uploaded at
   * reference authority cannot become approved canon merely because its
   * document shape resembles an intent source. */
  allowedUsesByAuthority: Record<CanonAuthority, Partial<Record<ClaimKind, CitationUse[]>>>;
  /** A second, independent gate that prevents document assertions and change
   * proposals from leaking into the current-project truth plane. */
  allowedUsesByAssertionScope: Record<AssertionScope, Partial<Record<ClaimKind, CitationUse[]>>>;
  sourceRules: AuthorityPolicyRule[];
  excludedRoles: EvidenceRole[];
  protectedAuthorities: CanonAuthority[];
  maxEvidence: number;
  minimumPerLane: number;
  maxRetrievalLanes: number;
  maxResultsPerLane: number;
};

export type AnalysisRoute = {
  version: "continuity.route.v2";
  routerVersion?: typeof AUTHORITY_ROUTER_VERSION;
  policyId: string;
  policyVersion: string;
  mode: AnalysisMode;
  /** The query-specific proof boundary compiled before retrieval. Optional on
   * older stored receipts so v3.3 analyses remain readable. */
  proofContract?: import("./proof-contract").ProofContract;
  truthTarget?: TruthTarget;
  presentationDepth: PresentationDepth;
  budget: AnalysisBudget;
  claimKinds: ClaimKind[];
  requiredRoles: EvidenceRole[];
  requiredChecks: AnalysisCheck[];
  selectedByRole: Partial<Record<EvidenceRole, number>>;
  availableByRole: Partial<Record<EvidenceRole, number>>;
  retrieval: {
    lanes: RetrievalLane[];
    availableByLane: Partial<Record<RetrievalLaneId, number>>;
    selectedByLane: Partial<Record<RetrievalLaneId, number>>;
  };
  coverage: CoverageAssessment;
  answerObligations?: AnswerObligation[];
  diagnostics: string[];
};

export type Verdict =
  | "SUPPORTED"
  | "CONFLICT"
  | "AMBIGUOUS"
  | "UNREACHABLE"
  | "INSUFFICIENT_EVIDENCE"
  | "PROPOSAL";

export type EvidenceChunk = {
  id: string;
  projectId: string;
  sourceId: string;
  sourceVersionId: string;
  title: string;
  locator: string;
  text: string;
  score: number;
  authority: CanonAuthority;
  role?: EvidenceRole;
  lifecycle?: EvidenceLifecycle;
  claimKinds?: ClaimKind[];
  claimKind?: ClaimKind;
  retrievalLaneIds?: RetrievalLaneId[];
  authorityRank?: number | null;
  epistemicOwner?: string | null;
  world?: string | null;
  /** Server-derived; caller/model values are overwritten before reasoning. */
  assertionScope?: AssertionScope;
  /** Project ID for project truth; source-version ID for document/proposal worlds. */
  assertionOwnerId?: string | null;
  validFrom?: string | null;
  validTo?: string | null;
  temporalAxis?: string | null;
  validFromOrder?: number | null;
  validToOrder?: number | null;
  supersedesSourceId?: string | null;
  supersedesEvidenceIds?: string[];
  supersessionScope?: "evidence" | "source" | null;
  /**
   * A server-issued completeness attestation. The legacy `closedWorld` flag is
   * descriptive only: it cannot close an answer or prove absence without this
   * typed, revision-pinned boundary.
   */
  completenessBoundary?: CompletenessBoundary;
  closedWorld?: boolean;
  claimKey?: string | null;
  polarity?: "positive" | "negative" | null;
  /** Evidence-owned mention groups used to prove that distinct candidates
   * genuinely compete for the same name, pronoun, or source mention. */
  referentKeys?: string[];
  /** Query-scoped entity candidates extracted from an exact source span. The
   * server, rather than the model, assigns candidate IDs. */
  entityCandidates?: CompiledEntityCandidate[];
  /** Present on an atomic projection produced from a broader retrieved
   * fragment. Source authority, lifecycle, and locator remain inherited from
   * this server-owned parent. */
  parentEvidenceId?: string | null;
  quoteStart?: number | null;
  quoteEnd?: number | null;
  flags?: string[];
};

export type CompletenessBoundary = {
  version: "continuity.completeness-boundary.v1";
  /** Stable server-side identifier for audit receipts and later revocation. */
  boundaryId: string;
  scope:
    | { kind: "exact_claim_keys"; claimKeys: string[] }
    | { kind: "claim_namespace"; namespace: string; claimKinds: ClaimKind[] }
    | { kind: "material_claim_kinds"; claimKinds: ClaimKind[] };
  revision: {
    projectRevision: string;
    /** Canonical membership of the revision inspected to issue this boundary. */
    sourceVersionIds: string[];
    /** SHA-256 over the canonical revision-and-membership tuple. */
    membershipDigest: `sha256:${string}`;
  };
};

/**
 * Runtime trust anchor stored outside analyzed source content. A source chunk
 * may carry the matching boundary for auditability, but it has no authority
 * unless this registry binds the exact evidence identity and atomic claim.
 */
export type TrustedCompletenessRegistry = {
  version: "continuity.trusted-completeness-registry.v1";
  projectId: string;
  projectRevision: string;
  grants: Array<{
    boundary: CompletenessBoundary;
    evidenceBinding: {
      evidenceId: string;
      sourceId: string;
      sourceVersionId: string;
      claimKey: string | null;
      polarity: "positive" | "negative" | null;
    };
  }>;
};

export type CompiledEntityCandidate = {
  id: string;
  name: string;
  type: string;
  aliases: string[];
  mention: string;
  referentKey: string;
  resolution: "resolved" | "candidate" | "ambiguous";
};

export type ConversationTurn = {
  question: string;
  answer: string;
  verdict: Verdict;
};

export type QueryRequest = {
  projectId: string;
  projectRevision?: string;
  timeScope?: string | null;
  temporalAxis?: string | null;
  storyPosition?: number;
  targetPosition?: number;
  question: string;
  /**
   * Defaults to project truth. Only a trusted adapter should select a narrower
   * packet/source-assertion world on behalf of a public caller.
   */
  truthTarget?: TruthTarget;
  analysisMode?: AnalysisMode;
  claimKinds?: ClaimKind[];
  conversation?: ConversationTurn[];
  proposedChange?: string | null;
  contextRefs?: string[];
  /** Server-pinned immutable membership for this revision. Callers cannot
   * supply it through the public route. Retrieval must fail closed outside it. */
  sourceVersionIds?: string[];
  /** Optional caller-selected goal keys. A reachability provider must still
   * resolve them against a server-owned graph; naming a key does not prove it. */
  targetClaimKeys?: string[];
  coverage?: {
    scope: string;
    complete: boolean;
    excludedSources?: string[];
    /** Omission metadata can only make a coverage assertion weaker. Public
     * callers must not be allowed to remove server-observed omissions. */
    truncated?: boolean;
    failures?: string[];
    deferredSources?: string[];
  };
};

export type TrustedReachability = {
  source: "server_transition_graph";
  status: "reachable" | "conditionally_reachable" | "unreachable_within_scope" | "unknown";
  graphRevision: string;
  plane: "normative" | "configured" | "implemented" | "observed";
  completenessScope: string;
  targetClaimKeys: string[];
  blockers: string[];
  assumptions: string[];
  path: string[];
  evidenceIds: string[];
  /** Required causal edges compiled by trusted project logic. Optional while
   * legacy graph adapters migrate; absence means no server completeness claim
   * about dependency discovery. */
  obligations?: DependencyObligation[];
  diagnostics: string[];
  search: { complete: boolean; statesExplored: number; truncated: boolean };
  /** Optional during v3.2 migration; v3.3 adapters should always emit one. */
  certificate?: {
    kind: "source_declared" | "bounded_arithmetic" | "exhaustive_graph";
    summary: string;
    evidenceIds: string[];
  };
};

export type EvidenceReference = {
  evidenceId: string;
  sourceId: string;
  locator: string;
  stance: "supports" | "opposes" | "context";
  claimKind: ClaimKind;
  use: CitationUse;
  supports: string;
  /** Added by validation from the cited evidence, never trusted from model output. */
  assertionScope?: AssertionScope;
  assertionOwnerId?: string;
};

export type EntityReference = {
  id: string;
  name: string;
  type: string;
  aliases: string[];
  resolution: "resolved" | "candidate" | "ambiguous";
  evidenceIds: string[];
};

export type ConclusionClaim = {
  claimKey: string;
  claimKind: ClaimKind;
  polarity: "positive" | "negative";
  /** Whether the conclusion is stated directly by the cited evidence or is an
   * absence inferred from a server-declared complete scope. */
  basis: "explicit_evidence" | "closed_world_absence";
  statement: string;
  evidenceIds: string[];
  /** Added by validation. Multiple source owners may independently state the
   * same proposition without jointly promoting it to project truth. */
  assertionScope?: AssertionScope;
  assertionOwnerIds?: string[];
};

export type Conflict = {
  type: string;
  /** `source_disagreement` is deliberately distinct from a contradiction in
   * current project truth: two immutable source-version owners can state
   * opposite propositions without either assertion being promoted to canon. */
  basis: "claim_contradiction" | "source_disagreement" | "constraint_violation" | "referent_ambiguity" | "proposal_divergence";
  frameKey: string;
  claimKind: ClaimKind;
  premiseClaimKeys: string[];
  candidateEntityIds: string[];
  statement: string;
  severity: "low" | "medium" | "high";
  evidenceIds: string[];
};

export type DependencyEdge = {
  from: string;
  to: string;
  claimKey: string;
  claimKind: ClaimKind;
  relation: "requires" | "causes" | "prevents" | "supersedes" | "reveals";
  status: "established" | "missing" | "proposed" | "blocked" | "open";
  evidenceIds: string[];
};

export type DependencyObligationKind =
  | "identity"
  | "temporal"
  | "permission"
  | "knowledge"
  | "resource"
  | "producer"
  | "ordering"
  | "idempotency"
  | "consumer";

/**
 * A required edge derived by trusted project logic rather than volunteered by
 * the language model. The model may explain an obligation, but it cannot omit,
 * weaken, or mark it satisfied when the server graph says otherwise.
 */
export type DependencyObligation = {
  id: string;
  kind: DependencyObligationKind;
  from: string;
  to: string;
  claimKey: string;
  claimKind: ClaimKind;
  relation: DependencyEdge["relation"];
  required: true;
  status: "satisfied" | "blocked" | "open";
  evidenceIds: string[];
};

export type ChangeProposal = {
  summary: string;
  assumptions: string[];
  requiredChanges: string[];
  downstreamRisks: string[];
};

export type ContinuityAnswer = {
  version: typeof CONTINUITY_ANSWER_VERSION;
  projectRevision: string;
  timeScope: string | null;
  question: string;
  verdict: Verdict;
  /** Proposition status is separate from answer support (`verdict`). */
  truthStatus: "supported" | "source_assertion" | "proposed" | "contradicted" | "ambiguous" | "conflicted" | "unknown" | "superseded";
  reachability: {
    status: "reachable" | "conditionally_reachable" | "unreachable_within_scope" | "unknown" | "not_evaluated";
    completenessScope: string;
    targetClaimKeys: string[];
    blockers: string[];
    assumptions: string[];
    path: string[];
  };
  answer: string;
  confidence: "low" | "medium" | "high";
  evidence: EvidenceReference[];
  conclusions: ConclusionClaim[];
  analysisChecks: AnalysisCheckFinding[];
  entities: EntityReference[];
  conflicts: Conflict[];
  dependencies: DependencyEdge[];
  proposal: ChangeProposal | null;
  followUpQuestions: string[];
  caveats: string[];
};

export type QueryResult = {
  mode: "gpt-5.6-sol" | "demonstration";
  model: string | null;
  answer: ContinuityAnswer;
  retrievedEvidence: EvidenceChunk[];
  routing: AnalysisRoute;
  trustedReachability: TrustedReachability | null;
  validation: {
    repaired: boolean;
    issues: string[];
    obligationResults?: Array<{
      obligationId: string;
      status: "satisfied" | "repaired" | "unresolved" | "not_applicable";
      reason: string;
    }>;
  };
};

export interface EvidenceRetriever {
  retrieve(request: QueryRequest, plan?: RetrievalPlan): Promise<EvidenceChunk[]>;
}

export type EvidenceCompilation = {
  evidence: EvidenceChunk[];
  diagnostics: string[];
};

export interface EvidenceCompiler {
  compile(
    request: QueryRequest,
    evidence: EvidenceChunk[],
    policy: AuthorityPolicy,
  ): Promise<EvidenceCompilation>;
}

export interface ReachabilityEvaluator {
  evaluate(
    request: QueryRequest,
    evidence: EvidenceChunk[],
    route: AnalysisRoute,
  ): Promise<TrustedReachability | null>;
}

export interface ContinuityReasoner {
  readonly mode: QueryResult["mode"];
  readonly model: string | null;
  answer(
    request: QueryRequest,
    evidence: EvidenceChunk[],
    route?: AnalysisRoute,
    trustedReachability?: TrustedReachability | null,
  ): Promise<ContinuityAnswer>;
}

export const CONTINUITY_ANSWER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "version", "projectRevision", "timeScope", "question", "verdict", "truthStatus", "reachability", "answer", "confidence", "evidence",
    "conclusions", "analysisChecks", "entities", "conflicts", "dependencies", "proposal", "followUpQuestions", "caveats",
  ],
  properties: {
    version: { type: "string", enum: [CONTINUITY_ANSWER_VERSION] },
    projectRevision: { type: "string" },
    timeScope: { anyOf: [{ type: "string" }, { type: "null" }] },
    question: { type: "string" },
    verdict: { type: "string", enum: ["SUPPORTED", "CONFLICT", "AMBIGUOUS", "UNREACHABLE", "INSUFFICIENT_EVIDENCE", "PROPOSAL"] },
    truthStatus: { type: "string", enum: ["supported", "source_assertion", "proposed", "contradicted", "ambiguous", "conflicted", "unknown", "superseded"] },
    reachability: {
      type: "object", additionalProperties: false,
      required: ["status", "completenessScope", "targetClaimKeys", "blockers", "assumptions", "path"],
      properties: {
        status: { type: "string", enum: ["reachable", "conditionally_reachable", "unreachable_within_scope", "unknown", "not_evaluated"] },
        completenessScope: { type: "string" },
        targetClaimKeys: { type: "array", items: { type: "string" } },
        blockers: { type: "array", items: { type: "string" } },
        assumptions: { type: "array", items: { type: "string" } },
        path: { type: "array", items: { type: "string" } },
      },
    },
    answer: { type: "string" },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    evidence: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["evidenceId", "sourceId", "locator", "stance", "claimKind", "use", "supports"],
        properties: {
          evidenceId: { type: "string" }, sourceId: { type: "string" },
          locator: { type: "string" }, stance: { type: "string", enum: ["supports", "opposes", "context"] },
          claimKind: { type: "string", enum: ["identity", "normative", "configured", "implemented", "tested", "observed", "causal", "historical"] },
          use: { type: "string", enum: ["establish", "corroborate", "challenge", "contextualize", "propose"] },
          supports: { type: "string" },
        },
      },
    },
    conclusions: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["claimKey", "claimKind", "polarity", "basis", "statement", "evidenceIds"],
        properties: {
          claimKey: { type: "string" },
          claimKind: { type: "string", enum: CLAIM_KINDS },
          polarity: { type: "string", enum: ["positive", "negative"] },
          basis: { type: "string", enum: ["explicit_evidence", "closed_world_absence"] },
          statement: { type: "string" },
          evidenceIds: { type: "array", items: { type: "string" } },
        },
      },
    },
    analysisChecks: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["check", "status", "finding", "evidenceIds"],
        properties: {
          check: { type: "string", enum: [
            "identity_scope", "authority_and_lifecycle", "temporal_scope", "claim_boundary",
            "preconditions_and_reachability", "actor_knowledge_and_authorization", "resource_conservation",
            "transition_ordering", "repeatability_and_idempotency", "state_and_asset_compatibility",
            "downstream_consumers", "verification_and_unknowns",
          ] },
          status: { type: "string", enum: ["supported", "conflicted", "unknown", "not_applicable"] },
          finding: { type: "string" },
          evidenceIds: { type: "array", items: { type: "string" } },
        },
      },
    },
    entities: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["id", "name", "type", "aliases", "resolution", "evidenceIds"],
        properties: {
          id: { type: "string" }, name: { type: "string" }, type: { type: "string" },
          aliases: { type: "array", items: { type: "string" } },
          resolution: { type: "string", enum: ["resolved", "candidate", "ambiguous"] },
          evidenceIds: { type: "array", items: { type: "string" } },
        },
      },
    },
    conflicts: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["type", "basis", "frameKey", "claimKind", "premiseClaimKeys", "candidateEntityIds", "statement", "severity", "evidenceIds"],
        properties: {
          type: { type: "string" },
          basis: { type: "string", enum: ["claim_contradiction", "source_disagreement", "constraint_violation", "referent_ambiguity", "proposal_divergence"] },
          frameKey: { type: "string" },
          claimKind: { type: "string", enum: CLAIM_KINDS },
          premiseClaimKeys: { type: "array", items: { type: "string" } },
          candidateEntityIds: { type: "array", items: { type: "string" } },
          statement: { type: "string" },
          severity: { type: "string", enum: ["low", "medium", "high"] },
          evidenceIds: { type: "array", items: { type: "string" } },
        },
      },
    },
    dependencies: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["from", "to", "claimKey", "claimKind", "relation", "status", "evidenceIds"],
        properties: {
          from: { type: "string" }, to: { type: "string" },
          claimKey: { type: "string" },
          claimKind: { type: "string", enum: CLAIM_KINDS },
          relation: { type: "string", enum: ["requires", "causes", "prevents", "supersedes", "reveals"] },
          status: { type: "string", enum: ["established", "missing", "proposed", "blocked", "open"] },
          evidenceIds: { type: "array", items: { type: "string" } },
        },
      },
    },
    proposal: {
      anyOf: [
        { type: "null" },
        {
          type: "object", additionalProperties: false,
          required: ["summary", "assumptions", "requiredChanges", "downstreamRisks"],
          properties: {
            summary: { type: "string" }, assumptions: { type: "array", items: { type: "string" } },
            requiredChanges: { type: "array", items: { type: "string" } },
            downstreamRisks: { type: "array", items: { type: "string" } },
          },
        },
      ],
    },
    followUpQuestions: { type: "array", items: { type: "string" } },
    caveats: { type: "array", items: { type: "string" } },
  },
} as const;

/**
 * Economy contract for bounded Tier-1 identity lookups. The server restores
 * the omitted invariant fields before the ordinary validator runs; this is not
 * a weaker answer type or an alternate trust path.
 */
export const FOCUSED_CONTINUITY_ANSWER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "verdict", "truthStatus", "answer", "confidence", "evidence", "conclusions",
    "analysisChecks", "entities", "conflicts", "caveats",
  ],
  properties: {
    verdict: { type: "string", enum: ["SUPPORTED", "CONFLICT", "AMBIGUOUS", "INSUFFICIENT_EVIDENCE"] },
    truthStatus: { type: "string", enum: ["supported", "source_assertion", "contradicted", "ambiguous", "conflicted", "unknown", "superseded"] },
    answer: CONTINUITY_ANSWER_SCHEMA.properties.answer,
    confidence: CONTINUITY_ANSWER_SCHEMA.properties.confidence,
    evidence: CONTINUITY_ANSWER_SCHEMA.properties.evidence,
    conclusions: CONTINUITY_ANSWER_SCHEMA.properties.conclusions,
    analysisChecks: CONTINUITY_ANSWER_SCHEMA.properties.analysisChecks,
    entities: CONTINUITY_ANSWER_SCHEMA.properties.entities,
    conflicts: CONTINUITY_ANSWER_SCHEMA.properties.conflicts,
    caveats: CONTINUITY_ANSWER_SCHEMA.properties.caveats,
  },
} as const;
