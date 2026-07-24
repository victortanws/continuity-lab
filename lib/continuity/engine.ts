import {
  CLAIM_KINDS, CONTINUITY_ANSWER_VERSION,
  type AnalysisCheckFinding, type AnalysisRoute, type AuthorityPolicy, type CitationUse,
  type ClaimKind, type ContinuityAnswer, type ContinuityReasoner,
  type CompiledEntityCandidate, type EvidenceChunk, type EvidenceCompiler, type EvidenceReference,
  type EvidenceRetriever, type QueryRequest, type QueryResult, type ReachabilityEvaluator,
  type RetrievalPlan,
  type TrustedCompletenessRegistry,
  type TrustedReachability,
} from "./contracts";
import { applyAssertionBoundary, assertionBoundaryFor } from "./assertion-boundary";
import { auditAnswerObligations, compileAnswerObligations } from "./answer-obligations";
import { boundaryCoversExactClaimKey, verifyCompletenessBoundary } from "./completeness-boundary";
import { DEFAULT_AUTHORITY_POLICY } from "./policy/default";
import { authorityWeight, planRetrieval, routeEvidence } from "./routing/authority-router";
import { detectEvidenceFlags } from "./evidence-flags";
import { auditClaimClosure } from "./claim-closure";
export { detectEvidenceFlags } from "./evidence-flags";

export class ContinuityEngine {
  constructor(
    private readonly retriever: EvidenceRetriever,
    private readonly reasoner: ContinuityReasoner,
    private readonly authorityPolicy: AuthorityPolicy = DEFAULT_AUTHORITY_POLICY,
    private readonly evidenceCompiler?: EvidenceCompiler,
    private readonly reachabilityEvaluator?: ReachabilityEvaluator,
    private readonly trustedCompletenessRegistry?: TrustedCompletenessRegistry,
  ) {}

  async query(request: QueryRequest): Promise<QueryResult> {
    assertQueryRequestEnvelope(request);
    const question = request.question.trim();
    if (!question) throw new ContinuityInputError("question is required");
    if (!request.projectId.trim()) throw new ContinuityInputError("projectId is required");
    if (
      request.storyPosition !== undefined
      && request.targetPosition !== undefined
      && request.targetPosition < request.storyPosition
    ) throw new ContinuityInputError("targetPosition cannot precede storyPosition");

    const normalizedRequest = { ...request, question };
    const retrievalPlan = planRetrieval(normalizedRequest, this.authorityPolicy);
    const retrieved = await this.retriever.retrieve(normalizedRequest, retrievalPlan);
    assertEvidenceEnvelope(retrieved, "retrieved");
    const rawEvidence = retrieved.map((chunk) => applyAssertionBoundary({
      ...chunk,
      flags: detectEvidenceFlags(chunk.text, chunk.flags),
    }));
    const compilation = this.evidenceCompiler
      ? await this.evidenceCompiler.compile(normalizedRequest, rawEvidence, this.authorityPolicy)
      : { evidence: rawEvidence, diagnostics: [] };
    assertCompilationEnvelope(compilation);
    assertEvidenceEnvelope(compilation.evidence, "compiled");
    const routing = routeEvidence(
      compilation.evidence.map(applyAssertionBoundary),
      normalizedRequest,
      this.authorityPolicy,
      retrievalPlan,
      this.trustedCompletenessRegistry,
    );
    routing.route.diagnostics.unshift(...compilation.diagnostics);
    routing.evidence = routing.evidence.map((chunk) => applyAssertionBoundary({
      ...chunk,
      flags: detectEvidenceFlags(chunk.text, chunk.flags),
    }));
    const trustedReachability = this.reachabilityEvaluator
      ? await this.reachabilityEvaluator.evaluate(normalizedRequest, routing.evidence, routing.route)
      : null;
    routing.route.answerObligations = compileAnswerObligations(
      normalizedRequest,
      routing.route,
      routing.evidence,
      trustedReachability,
    );
    const proposed = await this.reasoner.answer(
      normalizedRequest,
      routing.evidence,
      routing.route,
      trustedReachability,
    );
    const validation = validateAnswer(
      proposed,
      routing.evidence,
      normalizedRequest,
      routing.route,
      this.authorityPolicy,
      trustedReachability,
      this.trustedCompletenessRegistry,
    );
    const displayedAnswer = this.reasoner.mode === "gpt-5.6-sol"
      ? sealGeneratedAnswer(validation.answer, routing.evidence, trustedReachability)
      : validation.answer;
    const obligationResults = auditAnswerObligations(
      displayedAnswer,
      routing.route,
      trustedReachability,
    );
    for (const obligation of obligationResults) {
      if (obligation.status === "unresolved") {
        validation.issues.push(`Answer obligation ${obligation.obligationId} remains unresolved: ${obligation.reason}`);
      }
    }
    if (displayedAnswer !== validation.answer) {
      validation.issues.push("Replaced generated explanatory prose with a server-composed summary of validated records");
    }
    const requestClaimClosure = auditClaimClosure(
      request.proposedChange?.trim() || request.question,
      routing.evidence.map((chunk) => ({
        id: chunk.id,
        name: chunk.title,
        text: chunk.text,
        locator: chunk.locator,
      })),
    );
    if (requestClaimClosure.numbers.some((claim) => claim.status === "conflicted")) {
      validation.issues.push("The request contains a numeric claim that conflicts with a relevant admitted source passage");
    }
    if (requestClaimClosure.citations.some((claim) => claim.status === "mismatch")) {
      validation.issues.push("The request contains a supplied locator whose passage does not support the attached claim");
    }
    if (requestClaimClosure.identifiers.some((claim) => claim.status === "unknown")) {
      validation.issues.push("The request uses an exact identifier that is neither present in admitted evidence nor explicitly proposed as new");
    }

    return {
      mode: this.reasoner.mode,
      model: this.reasoner.model,
      answer: displayedAnswer,
      retrievedEvidence: routing.evidence,
      routing: routing.route,
      trustedReachability,
      validation: {
        repaired: validation.issues.length > 0,
        issues: validation.issues,
        claimClosure: requestClaimClosure,
        obligationResults,
      },
    };
  }
}

/**
 * Model prose is a proposal, even when the model returned valid citations.
 * The public answer is composed from records that survived validation so a
 * malicious manuscript cannot keep a false instruction or claim in the main
 * answer after its structured support was rejected.
 */
export function sealGeneratedAnswer(
  answer: ContinuityAnswer,
  evidence: EvidenceChunk[],
  trustedReachability?: TrustedReachability | null,
): ContinuityAnswer {
  const byId = new Map(evidence.map((chunk) => [chunk.id, chunk]));
  const conclusionFrames = answer.conclusions.map((conclusion) =>
    `${safeIdentifier(conclusion.claimKind)}:${safeIdentifier(conclusion.claimKey)}=${conclusion.polarity}`);
  const sealedEntities = answer.entities.map((entity) => {
    const compiled = selectPinnedEntityCandidate(entity.id, entity.evidenceIds, evidence);
    return compiled ? {
      ...entity,
      name: safeDisplayText(compiled.name) || safeIdentifier(entity.id),
      // The name and aliases are exact-span validated. The category is a model
      // classification, so the public surface deliberately does not present it
      // as a source-owned fact.
      type: "entity",
      aliases: [...new Set(compiled.aliases.map(safeDisplayText).filter(Boolean))].slice(0, 12),
      resolution: compiled.resolution,
    } : {
      ...entity,
      name: safeIdentifier(entity.id),
      type: "entity",
      aliases: [],
    };
  });
  const entityLabels = sealedEntities.map((entity) => entity.name).filter(Boolean);
  const conflictFrames = answer.conflicts.map((conflict) =>
    `${safeIdentifier(conflict.claimKind)}:${safeIdentifier(conflict.frameKey)}`).filter(Boolean);
  const proofBlockers = trustedReachability?.blockers.map(safeSummaryText).filter(Boolean) ?? [];

  let summary: string;
  if (answer.verdict === "UNREACHABLE") {
    summary = `Unreachable within the pinned transition-graph scope${proofBlockers.length ? `: ${proofBlockers.join(" ")}` : "."}`;
  } else if (answer.verdict === "CONFLICT") {
    summary = `The pinned evidence contains an unresolved conflict${conflictFrames.length ? ` for ${conflictFrames.join(", ")}` : ""}.`;
  } else if (answer.verdict === "AMBIGUOUS") {
    summary = `The referent remains ambiguous${entityLabels.length ? ` among evidence-grounded candidates ${entityLabels.join(", ")}` : ""}.`;
  } else if (answer.verdict === "SUPPORTED" && answer.truthStatus === "source_assertion") {
    summary = `The pinned source states${conclusionFrames.length ? `: ${conclusionFrames.join(", ")}` : " the supported proposition"}. This establishes a source assertion, not approved project truth.`
      + (entityLabels.length ? ` Resolved source entities: ${entityLabels.join(", ")}.` : "");
  } else if (answer.verdict === "SUPPORTED") {
    summary = `Supported by the admitted evidence as current project truth${conclusionFrames.length ? `: ${conclusionFrames.join(", ")}` : "."}`
      + (entityLabels.length ? ` Resolved entities: ${entityLabels.join(", ")}.` : "");
  } else if (answer.verdict === "PROPOSAL") {
    summary = "This is a provisional possibility, not established current truth. Review and approve its typed dependencies before promotion.";
  } else {
    summary = "Not established from the pinned evidence snapshot. Add or approve the missing governing evidence, then run the question again.";
  }

  const sealedEvidence = answer.evidence.map((reference) => {
    const chunk = byId.get(reference.evidenceId);
    const claimKey = safeIdentifier(chunk?.claimKey ?? "untyped-context");
    const boundary = chunk ? assertionBoundaryFor(chunk) : {
      scope: reference.assertionScope ?? "source_assertion" as const,
      ownerId: reference.assertionOwnerId ?? "unknown-source",
    };
    return {
      ...reference,
      assertionScope: boundary.scope,
      assertionOwnerId: boundary.ownerId,
      supports: `${reference.use} evidence for ${safeIdentifier(reference.claimKind)} claim ${claimKey} in ${boundary.scope.replaceAll("_", " ")} scope.`,
    };
  });
  const sealedConclusions = answer.conclusions.map((conclusion) => ({
    ...conclusion,
    statement: `The admitted evidence records ${safeIdentifier(conclusion.claimKey)} as ${conclusion.polarity} within the ${safeIdentifier(conclusion.claimKind)} claim boundary and ${safeIdentifier(conclusion.assertionScope ?? "project_truth")} assertion scope.`,
  }));
  const sealedChecks = answer.analysisChecks.map((finding) => ({
    ...finding,
    finding: `${safeIdentifier(finding.check).replaceAll("_", " ")} is ${finding.status} for this pinned evidence snapshot.`,
  }));
  const sealedConflicts = answer.conflicts.map((conflict) => ({
    ...conflict,
    statement: `${safeIdentifier(conflict.basis).replaceAll("_", " ")} affects ${safeIdentifier(conflict.claimKind)} claim ${safeIdentifier(conflict.frameKey)}.`,
  }));
  const sealedDependencies = answer.dependencies.map((edge) => ({
    ...edge,
    from: `premise for ${safeIdentifier(edge.claimKey)}`,
    to: `target ${safeIdentifier(edge.claimKey)}`,
  }));
  const sealedProposal = answer.proposal ? {
    summary: "Provisional typed change route; not promoted to current truth.",
    assumptions: answer.proposal.assumptions.map((_item, index) => `Unverified proposal assumption ${index + 1}.`),
    requiredChanges: sealedDependencies.map((edge) => `${safeIdentifier(edge.claimKey)} (${edge.status})`).slice(0, 20),
    downstreamRisks: ["Uncompiled or uncovered downstream consumers may still invalidate this route."],
  } : null;
  const sealedReachability: ContinuityAnswer["reachability"] = trustedReachability
    ? {
        status: trustedReachability.status,
        completenessScope: safeSummaryText(trustedReachability.completenessScope),
        targetClaimKeys: trustedReachability.targetClaimKeys.map(safeIdentifier),
        blockers: trustedReachability.blockers.map(safeSummaryText),
        assumptions: trustedReachability.assumptions.map(safeSummaryText),
        path: trustedReachability.path.map(safeSummaryText),
      }
    : {
        status: ["unknown", "not_evaluated"].includes(answer.reachability.status)
          ? answer.reachability.status as "unknown" | "not_evaluated"
          : "unknown",
        completenessScope: "No matching server-owned transition proof was available for this query.",
        targetClaimKeys: answer.reachability.targetClaimKeys.map(safeIdentifier),
        blockers: answer.reachability.status === "not_evaluated" ? [] : ["Causal status remains unproved."],
        assumptions: [],
        path: [],
      };

  return {
    ...answer,
    answer: summary,
    reachability: sealedReachability,
    evidence: sealedEvidence,
    conclusions: sealedConclusions,
    analysisChecks: sealedChecks,
    entities: sealedEntities,
    conflicts: sealedConflicts,
    dependencies: sealedDependencies,
    proposal: sealedProposal,
    followUpQuestions: [],
    caveats: ["Displayed prose was composed from server-validated structured records; unvalidated model prose was not retained."],
  };
}

function safeIdentifier(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9._:=/-]+/g, "-").replace(/-+/g, "-").slice(0, 160);
}

function safeSummaryText(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 280);
}

function safeDisplayText(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
}

function selectPinnedEntityCandidate(
  entityId: string,
  evidenceIds: string[],
  evidence: EvidenceChunk[],
): CompiledEntityCandidate | null {
  const normalizedId = entityId.trim().toLowerCase();
  const cited = new Set(evidenceIds);
  const candidates = evidence.flatMap((chunk) => {
    if (!cited.has(chunk.id) || chunk.claimKind !== "identity") return [];
    return (chunk.entityCandidates ?? []).flatMap((candidate) =>
      candidate.id.trim().toLowerCase() === normalizedId ? [{ candidate, chunk }] : []);
  }).sort((left, right) =>
    authorityWeight(right.chunk.authority) - authorityWeight(left.chunk.authority)
      || left.chunk.locator.localeCompare(right.chunk.locator)
      || (left.chunk.quoteStart ?? Number.MAX_SAFE_INTEGER) - (right.chunk.quoteStart ?? Number.MAX_SAFE_INTEGER)
      || left.candidate.name.localeCompare(right.candidate.name));
  return candidates[0]?.candidate ?? null;
}

export class CompositeRetriever implements EvidenceRetriever {
  constructor(private readonly retrievers: EvidenceRetriever[]) {}

  async retrieve(request: QueryRequest, plan?: RetrievalPlan): Promise<EvidenceChunk[]> {
    const results = await Promise.all(this.retrievers.map((retriever) => retriever.retrieve(request, plan)));
    const combined: EvidenceChunk[] = [];
    for (const result of results) {
      assertEvidenceEnvelope(result, "retrieved");
      if (combined.length + result.length > CONTINUITY_INPUT_LIMITS.rawEvidenceFragments) {
        throw new ContinuityInputError(
          `Retrieved evidence exceeds the ${CONTINUITY_INPUT_LIMITS.rawEvidenceFragments}-fragment limit.`,
          "retrieval_limit_exceeded",
        );
      }
      combined.push(...result);
    }
    assertEvidenceEnvelope(combined, "retrieved");
    return combined;
  }
}

export type ContinuityInputErrorCode =
  | "invalid_request"
  | "request_limit_exceeded"
  | "invalid_evidence"
  | "retrieval_limit_exceeded"
  | "compilation_limit_exceeded";

export class ContinuityInputError extends Error {
  constructor(
    message: string,
    readonly code: ContinuityInputErrorCode = "invalid_request",
  ) {
    super(message);
    this.name = "ContinuityInputError";
  }
}

/**
 * A hard, server-owned envelope around adapters and public query input. These
 * are safety limits rather than retrieval targets: normal routing selects at
 * most 24 evidence records, while the larger adapter envelope leaves room for
 * multi-lane retrieval and exact-span compilation before that selection.
 */
export const CONTINUITY_INPUT_LIMITS = Object.freeze({
  projectIdBytes: 128,
  questionBytes: 8_000,
  proposedChangeBytes: 8_000,
  requestMetadataBytes: 512,
  requestArrayItemBytes: 240,
  conversationTurns: 6,
  contextRefs: 20,
  sourceVersionIds: 2_000,
  targetClaimKeys: 128,
  coverageItems: 256,
  rawEvidenceFragments: 256,
  compiledEvidenceFragments: 512,
  evidenceTextBytes: 64 * 1024,
  totalEvidenceTextBytes: 2 * 1024 * 1024,
  evidenceIdBytes: 256,
  evidenceTitleBytes: 512,
  evidenceLocatorBytes: 2_048,
  evidenceMetadataBytes: 512,
  evidenceArrayItems: 128,
  entityCandidates: 64,
  entityAliases: 32,
  compilerDiagnostics: 128,
  compilerDiagnosticBytes: 1_000,
  numericMagnitude: 1_000_000_000,
} as const);

const PROJECT_ID_RUNTIME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const VERDICT_VALUES = new Set(["SUPPORTED", "CONFLICT", "AMBIGUOUS", "UNREACHABLE", "INSUFFICIENT_EVIDENCE", "PROPOSAL"]);
const TRUTH_TARGET_VALUES = new Set(["packet_assertion", "project_truth", "observed_world"]);
const AUTHORITY_VALUES = new Set(["immutable", "canon", "retcon", "production", "proposal", "reference"]);
const ROLE_VALUES = new Set([
  "intent", "decision", "configuration", "implementation", "test", "observation", "proposal",
  "archive", "asset", "reference", "evaluation",
]);
const LIFECYCLE_VALUES = new Set(["active", "proposed", "superseded", "historical", "unknown"]);
const CLAIM_KIND_VALUES = new Set<string>(CLAIM_KINDS);
const RETRIEVAL_LANE_VALUES = new Set(["authority", "declared_state", "execution", "verification", "change_history"]);
const ENTITY_RESOLUTION_VALUES = new Set(["resolved", "candidate", "ambiguous"]);
const ANALYSIS_MODE_VALUES = new Set(["answer_question", "evaluate_change", "trace_dependencies"]);
const UTF8 = new TextEncoder();

/** Validate direct engine calls as strictly as HTTP calls. */
export function assertQueryRequestEnvelope(request: QueryRequest): void {
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    throw new ContinuityInputError("The continuity query must be an object.");
  }
  assertRequiredString(request.projectId, "projectId", CONTINUITY_INPUT_LIMITS.projectIdBytes, "invalid_request");
  if (!PROJECT_ID_RUNTIME_PATTERN.test(request.projectId.trim())) {
    throw new ContinuityInputError("projectId contains unsupported characters.");
  }
  assertRequiredString(request.question, "question", CONTINUITY_INPUT_LIMITS.questionBytes, "request_limit_exceeded");
  if (request.truthTarget !== undefined && !TRUTH_TARGET_VALUES.has(request.truthTarget)) {
    throw new ContinuityInputError("truthTarget is unsupported.");
  }
  assertOptionalString(request.projectRevision, "projectRevision", CONTINUITY_INPUT_LIMITS.requestMetadataBytes);
  assertOptionalString(request.timeScope, "timeScope", CONTINUITY_INPUT_LIMITS.requestMetadataBytes, true);
  assertOptionalString(request.temporalAxis, "temporalAxis", 80, true);
  assertOptionalString(request.proposedChange, "proposedChange", CONTINUITY_INPUT_LIMITS.proposedChangeBytes, true);
  if (request.analysisMode !== undefined && !ANALYSIS_MODE_VALUES.has(request.analysisMode)) {
    throw new ContinuityInputError("analysisMode is unsupported.");
  }
  assertBoundedPosition(request.storyPosition, "storyPosition");
  assertBoundedPosition(request.targetPosition, "targetPosition");

  if (request.claimKinds !== undefined) {
    assertStringArray(request.claimKinds, "claimKinds", CLAIM_KINDS.length, 32);
    if (request.claimKinds.some((kind) => !CLAIM_KIND_VALUES.has(kind))) {
      throw new ContinuityInputError("claimKinds contains an unsupported claim kind.");
    }
  }
  assertOptionalStringArray(request.contextRefs, "contextRefs", CONTINUITY_INPUT_LIMITS.contextRefs, CONTINUITY_INPUT_LIMITS.requestArrayItemBytes);
  assertOptionalStringArray(request.sourceVersionIds, "sourceVersionIds", CONTINUITY_INPUT_LIMITS.sourceVersionIds, CONTINUITY_INPUT_LIMITS.evidenceIdBytes);
  assertOptionalStringArray(request.targetClaimKeys, "targetClaimKeys", CONTINUITY_INPUT_LIMITS.targetClaimKeys, CONTINUITY_INPUT_LIMITS.requestArrayItemBytes);

  if (request.conversation !== undefined) {
    if (!Array.isArray(request.conversation) || request.conversation.length > CONTINUITY_INPUT_LIMITS.conversationTurns) {
      throw new ContinuityInputError(
        `conversation must contain at most ${CONTINUITY_INPUT_LIMITS.conversationTurns} turns.`,
        "request_limit_exceeded",
      );
    }
    request.conversation.forEach((turn, index) => {
      if (!turn || typeof turn !== "object" || Array.isArray(turn)) {
        throw new ContinuityInputError(`conversation[${index}] must be an object.`);
      }
      assertRequiredString(turn.question, `conversation[${index}].question`, 2_000, "request_limit_exceeded");
      assertRequiredString(turn.answer, `conversation[${index}].answer`, 4_000, "request_limit_exceeded");
      if (!VERDICT_VALUES.has(turn.verdict)) throw new ContinuityInputError(`conversation[${index}].verdict is unsupported.`);
    });
  }

  if (request.coverage !== undefined) {
    if (!request.coverage || typeof request.coverage !== "object" || Array.isArray(request.coverage)) {
      throw new ContinuityInputError("coverage must be an object.");
    }
    assertRequiredString(request.coverage.scope, "coverage.scope", 2_000, "request_limit_exceeded");
    if (typeof request.coverage.complete !== "boolean") throw new ContinuityInputError("coverage.complete must be a boolean.");
    if (request.coverage.truncated !== undefined && typeof request.coverage.truncated !== "boolean") {
      throw new ContinuityInputError("coverage.truncated must be a boolean.");
    }
    assertOptionalStringArray(request.coverage.excludedSources, "coverage.excludedSources", CONTINUITY_INPUT_LIMITS.coverageItems, CONTINUITY_INPUT_LIMITS.requestArrayItemBytes);
    assertOptionalStringArray(request.coverage.failures, "coverage.failures", CONTINUITY_INPUT_LIMITS.coverageItems, CONTINUITY_INPUT_LIMITS.requestMetadataBytes);
    assertOptionalStringArray(request.coverage.deferredSources, "coverage.deferredSources", CONTINUITY_INPUT_LIMITS.coverageItems, CONTINUITY_INPUT_LIMITS.requestArrayItemBytes);
  }
}

function assertCompilationEnvelope(value: unknown): asserts value is { evidence: EvidenceChunk[]; diagnostics: string[] } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ContinuityInputError("The evidence compiler returned an invalid envelope.", "invalid_evidence");
  }
  const candidate = value as { evidence?: unknown; diagnostics?: unknown };
  if (!Array.isArray(candidate.diagnostics) || candidate.diagnostics.length > CONTINUITY_INPUT_LIMITS.compilerDiagnostics) {
    throw new ContinuityInputError(
      `Compiler diagnostics must contain at most ${CONTINUITY_INPUT_LIMITS.compilerDiagnostics} items.`,
      "compilation_limit_exceeded",
    );
  }
  candidate.diagnostics.forEach((item, index) => {
    assertRequiredString(item, `compiler diagnostics[${index}]`, CONTINUITY_INPUT_LIMITS.compilerDiagnosticBytes, "compilation_limit_exceeded");
  });
  if (!Array.isArray(candidate.evidence)) {
    throw new ContinuityInputError("The evidence compiler did not return an evidence array.", "invalid_evidence");
  }
}

function assertEvidenceEnvelope(value: unknown, phase: "retrieved" | "compiled"): asserts value is EvidenceChunk[] {
  const limit = phase === "retrieved"
    ? CONTINUITY_INPUT_LIMITS.rawEvidenceFragments
    : CONTINUITY_INPUT_LIMITS.compiledEvidenceFragments;
  const code: ContinuityInputErrorCode = phase === "retrieved" ? "retrieval_limit_exceeded" : "compilation_limit_exceeded";
  if (!Array.isArray(value)) throw new ContinuityInputError(`${phase} evidence must be an array.`, "invalid_evidence");
  if (value.length > limit) throw new ContinuityInputError(`${phase} evidence exceeds the ${limit}-fragment limit.`, code);

  let totalTextBytes = 0;
  value.forEach((unknownChunk, index) => {
    if (!unknownChunk || typeof unknownChunk !== "object" || Array.isArray(unknownChunk)) {
      throw new ContinuityInputError(`${phase} evidence[${index}] must be an object.`, "invalid_evidence");
    }
    const chunk = unknownChunk as EvidenceChunk;
    const label = `${phase} evidence[${index}]`;
    assertRequiredString(chunk.id, `${label}.id`, CONTINUITY_INPUT_LIMITS.evidenceIdBytes, code);
    assertRequiredString(chunk.projectId, `${label}.projectId`, CONTINUITY_INPUT_LIMITS.projectIdBytes, code);
    assertRequiredString(chunk.sourceId, `${label}.sourceId`, CONTINUITY_INPUT_LIMITS.evidenceIdBytes, code);
    assertRequiredString(chunk.sourceVersionId, `${label}.sourceVersionId`, CONTINUITY_INPUT_LIMITS.evidenceIdBytes, code);
    assertRequiredString(chunk.title, `${label}.title`, CONTINUITY_INPUT_LIMITS.evidenceTitleBytes, code);
    assertRequiredString(chunk.locator, `${label}.locator`, CONTINUITY_INPUT_LIMITS.evidenceLocatorBytes, code);
    assertRequiredString(chunk.text, `${label}.text`, CONTINUITY_INPUT_LIMITS.evidenceTextBytes, code);
    totalTextBytes += utf8ByteLength(chunk.text, `${label}.text`, CONTINUITY_INPUT_LIMITS.evidenceTextBytes, code);
    if (totalTextBytes > CONTINUITY_INPUT_LIMITS.totalEvidenceTextBytes) {
      throw new ContinuityInputError(
        `${phase} evidence text exceeds the ${CONTINUITY_INPUT_LIMITS.totalEvidenceTextBytes}-byte aggregate limit.`,
        code,
      );
    }
    if (typeof chunk.score !== "number" || !Number.isFinite(chunk.score)) {
      throw new ContinuityInputError(`${label}.score must be finite.`, "invalid_evidence");
    }
    if (!AUTHORITY_VALUES.has(chunk.authority)) throw new ContinuityInputError(`${label}.authority is unsupported.`, "invalid_evidence");
    if (chunk.role !== undefined && !ROLE_VALUES.has(chunk.role)) throw new ContinuityInputError(`${label}.role is unsupported.`, "invalid_evidence");
    if (chunk.lifecycle !== undefined && !LIFECYCLE_VALUES.has(chunk.lifecycle)) throw new ContinuityInputError(`${label}.lifecycle is unsupported.`, "invalid_evidence");
    if (chunk.claimKinds !== undefined) {
      assertStringArray(chunk.claimKinds, `${label}.claimKinds`, CLAIM_KINDS.length, 32, code);
      if (chunk.claimKinds.some((kind) => !CLAIM_KIND_VALUES.has(kind))) throw new ContinuityInputError(`${label}.claimKinds contains an unsupported value.`, "invalid_evidence");
    }
    if (chunk.claimKind !== undefined && !CLAIM_KIND_VALUES.has(chunk.claimKind)) throw new ContinuityInputError(`${label}.claimKind is unsupported.`, "invalid_evidence");
    if (chunk.retrievalLaneIds !== undefined) {
      assertStringArray(chunk.retrievalLaneIds, `${label}.retrievalLaneIds`, 16, 64, code);
      if (chunk.retrievalLaneIds.some((lane) => !RETRIEVAL_LANE_VALUES.has(lane))) throw new ContinuityInputError(`${label}.retrievalLaneIds contains an unsupported value.`, "invalid_evidence");
    }
    assertOptionalFiniteNumber(chunk.authorityRank, `${label}.authorityRank`);
    assertOptionalString(chunk.epistemicOwner, `${label}.epistemicOwner`, CONTINUITY_INPUT_LIMITS.evidenceMetadataBytes, true, code);
    assertOptionalString(chunk.world, `${label}.world`, CONTINUITY_INPUT_LIMITS.evidenceMetadataBytes, true, code);
    assertOptionalString(chunk.validFrom, `${label}.validFrom`, CONTINUITY_INPUT_LIMITS.evidenceMetadataBytes, true, code);
    assertOptionalString(chunk.validTo, `${label}.validTo`, CONTINUITY_INPUT_LIMITS.evidenceMetadataBytes, true, code);
    assertOptionalString(chunk.temporalAxis, `${label}.temporalAxis`, 80, true, code);
    assertOptionalFiniteNumber(chunk.validFromOrder, `${label}.validFromOrder`);
    assertOptionalFiniteNumber(chunk.validToOrder, `${label}.validToOrder`);
    assertOptionalString(chunk.supersedesSourceId, `${label}.supersedesSourceId`, CONTINUITY_INPUT_LIMITS.evidenceIdBytes, true, code);
    assertOptionalString(chunk.claimKey, `${label}.claimKey`, CONTINUITY_INPUT_LIMITS.evidenceMetadataBytes, true, code);
    assertOptionalString(chunk.parentEvidenceId, `${label}.parentEvidenceId`, CONTINUITY_INPUT_LIMITS.evidenceIdBytes, true, code);
    assertOptionalStringArray(chunk.supersedesEvidenceIds, `${label}.supersedesEvidenceIds`, CONTINUITY_INPUT_LIMITS.evidenceArrayItems, CONTINUITY_INPUT_LIMITS.evidenceIdBytes, code);
    assertOptionalStringArray(chunk.referentKeys, `${label}.referentKeys`, CONTINUITY_INPUT_LIMITS.evidenceArrayItems, CONTINUITY_INPUT_LIMITS.evidenceMetadataBytes, code);
    assertOptionalStringArray(chunk.flags, `${label}.flags`, CONTINUITY_INPUT_LIMITS.evidenceArrayItems, 120, code);
    assertCompletenessBoundary(chunk.completenessBoundary, label, code);
    if (chunk.closedWorld !== undefined && typeof chunk.closedWorld !== "boolean") throw new ContinuityInputError(`${label}.closedWorld must be a boolean.`, "invalid_evidence");
    if (chunk.polarity !== undefined && chunk.polarity !== null && chunk.polarity !== "positive" && chunk.polarity !== "negative") throw new ContinuityInputError(`${label}.polarity is unsupported.`, "invalid_evidence");
    if (chunk.supersessionScope !== undefined && chunk.supersessionScope !== null && chunk.supersessionScope !== "evidence" && chunk.supersessionScope !== "source") throw new ContinuityInputError(`${label}.supersessionScope is unsupported.`, "invalid_evidence");
    assertOptionalIndex(chunk.quoteStart, `${label}.quoteStart`);
    assertOptionalIndex(chunk.quoteEnd, `${label}.quoteEnd`);
    assertEntityCandidates(chunk.entityCandidates, label, code);
  });
}

function assertCompletenessBoundary(
  value: EvidenceChunk["completenessBoundary"],
  parentLabel: string,
  code: ContinuityInputErrorCode,
): void {
  if (value === undefined) return;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ContinuityInputError(`${parentLabel}.completenessBoundary must be an object.`, code);
  }
  const label = `${parentLabel}.completenessBoundary`;
  if (value.version !== "continuity.completeness-boundary.v1") {
    throw new ContinuityInputError(`${label}.version is unsupported.`, code);
  }
  assertRequiredString(value.boundaryId, `${label}.boundaryId`, CONTINUITY_INPUT_LIMITS.evidenceIdBytes, code);
  if (!value.scope || typeof value.scope !== "object" || Array.isArray(value.scope)) {
    throw new ContinuityInputError(`${label}.scope must be an object.`, code);
  }
  if (value.scope.kind === "exact_claim_keys") {
    assertStringArray(value.scope.claimKeys, `${label}.scope.claimKeys`, 256, CONTINUITY_INPUT_LIMITS.evidenceMetadataBytes, code);
  } else if (value.scope.kind === "claim_namespace") {
    assertRequiredString(value.scope.namespace, `${label}.scope.namespace`, CONTINUITY_INPUT_LIMITS.evidenceMetadataBytes, code);
    assertStringArray(value.scope.claimKinds, `${label}.scope.claimKinds`, CLAIM_KINDS.length, 32, code);
    if (!value.scope.claimKinds.length || value.scope.claimKinds.some((kind) => !CLAIM_KIND_VALUES.has(kind))) {
      throw new ContinuityInputError(`${label}.scope.claimKinds is empty or contains an unsupported value.`, code);
    }
  } else if (value.scope.kind === "material_claim_kinds") {
    assertStringArray(value.scope.claimKinds, `${label}.scope.claimKinds`, CLAIM_KINDS.length, 32, code);
    if (!value.scope.claimKinds.length || value.scope.claimKinds.some((kind) => !CLAIM_KIND_VALUES.has(kind))) {
      throw new ContinuityInputError(`${label}.scope.claimKinds is empty or contains an unsupported value.`, code);
    }
  } else {
    throw new ContinuityInputError(`${label}.scope.kind is unsupported.`, code);
  }
  if (!value.revision || typeof value.revision !== "object" || Array.isArray(value.revision)) {
    throw new ContinuityInputError(`${label}.revision must be an object.`, code);
  }
  assertRequiredString(value.revision.projectRevision, `${label}.revision.projectRevision`, CONTINUITY_INPUT_LIMITS.requestMetadataBytes, code);
  assertStringArray(value.revision.sourceVersionIds, `${label}.revision.sourceVersionIds`, CONTINUITY_INPUT_LIMITS.sourceVersionIds, CONTINUITY_INPUT_LIMITS.evidenceIdBytes, code);
  assertRequiredString(value.revision.membershipDigest, `${label}.revision.membershipDigest`, 80, code);
  if (!/^sha256:[0-9a-f]{64}$/.test(value.revision.membershipDigest)) {
    throw new ContinuityInputError(`${label}.revision.membershipDigest must be a lowercase SHA-256 digest.`, code);
  }
}

function assertEntityCandidates(
  value: EvidenceChunk["entityCandidates"],
  parentLabel: string,
  code: ContinuityInputErrorCode,
): void {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length > CONTINUITY_INPUT_LIMITS.entityCandidates) {
    throw new ContinuityInputError(`${parentLabel}.entityCandidates must contain at most ${CONTINUITY_INPUT_LIMITS.entityCandidates} items.`, code);
  }
  value.forEach((candidate, index) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      throw new ContinuityInputError(`${parentLabel}.entityCandidates[${index}] must be an object.`, "invalid_evidence");
    }
    const label = `${parentLabel}.entityCandidates[${index}]`;
    assertRequiredString(candidate.id, `${label}.id`, CONTINUITY_INPUT_LIMITS.evidenceIdBytes, code);
    assertRequiredString(candidate.name, `${label}.name`, CONTINUITY_INPUT_LIMITS.evidenceMetadataBytes, code);
    assertRequiredString(candidate.type, `${label}.type`, 80, code);
    assertRequiredString(candidate.mention, `${label}.mention`, CONTINUITY_INPUT_LIMITS.evidenceMetadataBytes, code);
    assertRequiredString(candidate.referentKey, `${label}.referentKey`, CONTINUITY_INPUT_LIMITS.evidenceMetadataBytes, code);
    assertStringArray(candidate.aliases, `${label}.aliases`, CONTINUITY_INPUT_LIMITS.entityAliases, CONTINUITY_INPUT_LIMITS.evidenceMetadataBytes, code);
    if (!ENTITY_RESOLUTION_VALUES.has(candidate.resolution)) throw new ContinuityInputError(`${label}.resolution is unsupported.`, "invalid_evidence");
  });
}

function assertRequiredString(
  value: unknown,
  label: string,
  maxBytes: number,
  code: ContinuityInputErrorCode = "invalid_request",
): asserts value is string {
  if (typeof value !== "string" || !value.trim()) throw new ContinuityInputError(`${label} must be a non-empty string.`, code);
  utf8ByteLength(value, label, maxBytes, code);
}

function assertOptionalString(
  value: unknown,
  label: string,
  maxBytes: number,
  allowNull = false,
  code: ContinuityInputErrorCode = "request_limit_exceeded",
): void {
  if (value === undefined || (allowNull && value === null)) return;
  if (typeof value !== "string") throw new ContinuityInputError(`${label} must be a string${allowNull ? " or null" : ""}.`, "invalid_request");
  utf8ByteLength(value, label, maxBytes, code);
}

function assertOptionalStringArray(
  value: unknown,
  label: string,
  maxItems: number,
  maxItemBytes: number,
  code: ContinuityInputErrorCode = "request_limit_exceeded",
): void {
  if (value === undefined) return;
  assertStringArray(value, label, maxItems, maxItemBytes, code);
}

function assertStringArray(
  value: unknown,
  label: string,
  maxItems: number,
  maxItemBytes: number,
  code: ContinuityInputErrorCode = "request_limit_exceeded",
): asserts value is string[] {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new ContinuityInputError(`${label} must contain at most ${maxItems} items.`, code);
  }
  value.forEach((item, index) => assertRequiredString(item, `${label}[${index}]`, maxItemBytes, code));
}

function assertBoundedPosition(value: unknown, label: string): void {
  if (value === undefined) return;
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > CONTINUITY_INPUT_LIMITS.numericMagnitude) {
    throw new ContinuityInputError(`${label} must be a finite number within the supported range.`, "request_limit_exceeded");
  }
}

function assertOptionalFiniteNumber(value: unknown, label: string): void {
  if (value === undefined || value === null) return;
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > CONTINUITY_INPUT_LIMITS.numericMagnitude) {
    throw new ContinuityInputError(`${label} must be a finite number within the supported range.`, "invalid_evidence");
  }
}

function assertOptionalIndex(value: unknown, label: string): void {
  if (value === undefined || value === null) return;
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > CONTINUITY_INPUT_LIMITS.numericMagnitude) {
    throw new ContinuityInputError(`${label} must be a bounded non-negative integer.`, "invalid_evidence");
  }
}

function utf8ByteLength(
  value: string,
  label: string,
  maxBytes: number,
  code: ContinuityInputErrorCode,
): number {
  // This cheap UTF-16 check prevents an unnecessarily large encoding pass for
  // obviously oversized ASCII or BMP input. The byte check then handles
  // multi-byte Unicode exactly.
  if (value.length > maxBytes) throw new ContinuityInputError(`${label} exceeds the ${maxBytes}-byte limit.`, code);
  const bytes = UTF8.encode(value).byteLength;
  if (bytes > maxBytes) throw new ContinuityInputError(`${label} exceeds the ${maxBytes}-byte limit.`, code);
  return bytes;
}

export function prepareEvidence(
  chunks: EvidenceChunk[],
  projectId: string,
  storyPosition?: number,
  policy: AuthorityPolicy = DEFAULT_AUTHORITY_POLICY,
): EvidenceChunk[] {
  return routeEvidence(chunks.map(applyAssertionBoundary), {
    projectId,
    question: "Prepare an evidence projection.",
    storyPosition,
  }, policy).evidence.map((chunk) => applyAssertionBoundary({
    ...chunk,
    flags: detectEvidenceFlags(chunk.text, chunk.flags),
  }));
}

export function validateAnswer(
  proposed: ContinuityAnswer,
  evidence: EvidenceChunk[],
  request?: QueryRequest,
  route?: AnalysisRoute,
  policy: AuthorityPolicy = DEFAULT_AUTHORITY_POLICY,
  trustedReachability?: TrustedReachability | null,
  trustedCompletenessRegistry?: TrustedCompletenessRegistry,
): { answer: ContinuityAnswer; issues: string[] } {
  const issues: string[] = [];
  const scopedEvidence = evidence.map(applyAssertionBoundary);
  const byId = new Map(scopedEvidence.map((item) => [item.id, item]));
  let validEvidence: EvidenceReference[] = proposed.evidence.flatMap((reference) => {
    const chunk = byId.get(reference.evidenceId);
    if (!chunk || chunk.sourceId !== reference.sourceId) {
      issues.push(`Removed unknown or mismatched citation: ${reference.evidenceId}`);
      return [];
    }
    if (!citationUseAllowed(chunk, reference.claimKind, reference.use, policy)) {
      issues.push(`Removed citation with disallowed ${reference.use} use for ${reference.claimKind}: ${reference.evidenceId}`);
      return [];
    }
    if (!stanceMatchesUse(reference.stance, reference.use)) {
      issues.push(`Removed citation whose stance and use disagree: ${reference.evidenceId}`);
      return [];
    }
    // The model selects an evidence ID and explains its use. The server owns
    // the source and locator so a generated answer cannot forge a citation.
    const boundary = assertionBoundaryFor(chunk);
    return [{
      ...reference,
      sourceId: chunk.sourceId,
      locator: chunk.locator,
      assertionScope: boundary.scope,
      assertionOwnerId: boundary.ownerId,
    }];
  });

  let verdict = proposed.verdict;
  let truthStatus = proposed.truthStatus;
  let confidence = proposed.confidence;
  const generatedConflicts: ContinuityAnswer["conflicts"] = [];

  const sourceDisagreements = findSourceDisagreements(scopedEvidence, request, policy);
  if (sourceDisagreements.length) {
    issues.push("Exposed opposed assertions from separate immutable source owners");
    for (const { claimKind, claimKey, chunks } of sourceDisagreements) {
      validEvidence = addConflictEvidenceReferences(validEvidence, chunks, claimKind, claimKey, policy);
      generatedConflicts.push({
        type: "source_disagreement",
        basis: "source_disagreement",
        frameKey: claimKey,
        claimKind,
        premiseClaimKeys: [claimKey],
        candidateEntityIds: [],
        statement: `Separate pinned sources make opposed assertions about ${claimKey}; neither assertion is thereby promoted to project truth.`,
        severity: "medium",
        evidenceIds: chunks.map((chunk) => chunk.id),
      });
    }
  }

  const contradictoryClaims = findContradictoryClaims(scopedEvidence, request, policy);
  if (contradictoryClaims.length && verdict !== "PROPOSAL") {
    verdict = "CONFLICT";
    truthStatus = "conflicted";
    confidence = confidence === "high" ? "medium" : confidence;
    issues.push("Exposed an active contradiction that the proposed answer did not resolve");
    for (const { claimKind, claimKey, chunks } of contradictoryClaims) {
      validEvidence = addConflictEvidenceReferences(validEvidence, chunks, claimKind, claimKey, policy);
      generatedConflicts.push({
        type: "source_contradiction",
        basis: "claim_contradiction",
        frameKey: claimKey,
        claimKind,
        premiseClaimKeys: [claimKey],
        candidateEntityIds: [],
        statement: `Effective sources disagree about ${claimKey}`,
        severity: "high",
        evidenceIds: chunks.map((chunk) => chunk.id),
      });
    }
  }

  const validatedEntities = validateEntityReferences(proposed.entities, validEvidence, byId, issues);
  const validatedConclusions = validateConclusionClaims(
    proposed.conclusions,
    validEvidence,
    byId,
    request,
    trustedCompletenessRegistry,
    issues,
  );
  const groundedProposedConflicts = validateConflictRecords(
    proposed.conflicts,
    validEvidence,
    byId,
    validatedEntities,
    request,
    issues,
  );

  const evidentiaryVerdicts = new Set(["SUPPORTED", "CONFLICT", "AMBIGUOUS", "UNREACHABLE"]);
  if (evidentiaryVerdicts.has(verdict) && validEvidence.length === 0) {
    verdict = "INSUFFICIENT_EVIDENCE";
    truthStatus = "unknown";
    confidence = "low";
    issues.push("Downgraded evidentiary verdict because no valid citation remained");
  }
  if (verdict === "SUPPORTED" && !validEvidence.some((reference) => reference.use === "establish")) {
    verdict = "INSUFFICIENT_EVIDENCE";
    truthStatus = "unknown";
    confidence = "low";
    issues.push("Downgraded SUPPORTED because no admitted citation established the conclusion");
  }
  if (verdict === "SUPPORTED" && validatedConclusions.length === 0) {
    verdict = "INSUFFICIENT_EVIDENCE";
    truthStatus = "unknown";
    confidence = "low";
    issues.push("Downgraded SUPPORTED because no exact typed conclusion was established");
  }
  if (
    verdict === "CONFLICT"
    && !hasConflictEvidence(validEvidence, byId, request)
    && !hasSourceDisagreementEvidence(validEvidence, byId, request)
    && groundedProposedConflicts.length === 0
  ) {
    verdict = "INSUFFICIENT_EVIDENCE";
    truthStatus = "unknown";
    confidence = "low";
    issues.push("Downgraded CONFLICT because establishing and challenging evidence were not both admitted");
  }
  if (verdict === "AMBIGUOUS" && !groundedProposedConflicts.some((conflict) => conflict.basis === "referent_ambiguity")) {
    verdict = "INSUFFICIENT_EVIDENCE";
    truthStatus = "unknown";
    confidence = "low";
    issues.push("Downgraded AMBIGUOUS because fewer than two independently cited candidates were admitted");
  }
  if (
    verdict === "CONFLICT"
    && route?.coverage.closure !== "closed"
    && requestsGlobalNegative(request?.question ?? proposed.question)
    && contradictoryClaims.length === 0
    && sourceDisagreements.length === 0
    && !groundedProposedConflicts.some((conflict) => conflict.basis === "claim_contradiction")
  ) {
    verdict = "INSUFFICIENT_EVIDENCE";
    truthStatus = "unknown";
    confidence = "low";
    issues.push("Reclassified a global negative drawn from partial coverage as insufficient evidence rather than a factual contradiction");
  }

  const proofEvidenceIds = new Set((trustedReachability?.evidenceIds ?? []).filter((id) => byId.has(id)));
  const proofTargets = new Set((trustedReachability?.targetClaimKeys ?? []).map(normalizedClaimKey).filter(Boolean));
  const requestedTargets = new Set((request?.targetClaimKeys ?? []).map(normalizedClaimKey).filter(Boolean));
  const proofMatchesRequest = requestedTargets.size === 0
    || (requestedTargets.size === proofTargets.size && [...requestedTargets].every((key) => proofTargets.has(key)));
  const proofIsUsable = Boolean(
    trustedReachability
    && proofMatchesRequest
    && trustedReachability.graphRevision.trim()
    && trustedReachability.completenessScope.trim()
    && trustedReachability.evidenceIds.every((id) => proofEvidenceIds.has(id))
    && !(trustedReachability.status === "unreachable_within_scope"
      && (!trustedReachability.search.complete || trustedReachability.search.truncated)),
  );
  if (trustedReachability && !proofMatchesRequest) {
    issues.push("Ignored a transition proof whose target keys did not match the server-normalized request");
  } else if (trustedReachability && trustedReachability.evidenceIds.some((id) => !proofEvidenceIds.has(id))) {
    issues.push("Ignored a transition proof that referenced evidence outside the routed snapshot");
  } else if (trustedReachability?.status === "unreachable_within_scope"
    && (!trustedReachability.search.complete || trustedReachability.search.truncated)) {
    issues.push("Ignored an incomplete transition search that claimed unreachability");
  }
  if (proposed.verdict === "UNREACHABLE" && !proofIsUsable) {
    issues.push("Downgraded UNREACHABLE because typed reachability, a supported claim boundary, and a complete server-owned transition proof were not all established");
  }

  let reachability: ContinuityAnswer["reachability"] = proofIsUsable && trustedReachability
    ? {
        status: trustedReachability.status,
        completenessScope: trustedReachability.completenessScope,
        targetClaimKeys: trustedReachability.targetClaimKeys,
        blockers: trustedReachability.blockers,
        assumptions: trustedReachability.assumptions,
        path: trustedReachability.path,
      }
    : {
        status: proposed.reachability.status === "not_evaluated" ? "not_evaluated" : "unknown",
        completenessScope: proposed.reachability.completenessScope,
        targetClaimKeys: request?.targetClaimKeys ?? proposed.reachability.targetClaimKeys,
        blockers: proposed.reachability.status === "not_evaluated"
          ? proposed.reachability.blockers
          : ["No matching server-owned transition proof established this causal status."],
        assumptions: proposed.reachability.assumptions,
        path: [],
      };
  if (proofIsUsable && JSON.stringify(proposed.reachability) !== JSON.stringify(reachability)) {
    issues.push("Replaced model-supplied reachability with the server-owned transition proof");
  } else if (!proofIsUsable && !["unknown", "not_evaluated"].includes(proposed.reachability.status)) {
    issues.push("Downgraded model-supplied reachability because no matching server-owned transition proof was available");
  }
  if (verdict === "UNREACHABLE") {
    const targetClaimKeys = new Set(reachability.targetClaimKeys.map(normalizedClaimKey).filter(Boolean));
    const closedWorldReferences = validEvidence.filter((reference) => {
      const chunk = byId.get(reference.evidenceId);
      return Boolean(
        chunk
        && hasVerifiedClaimCompleteness(chunk, request, chunk.claimKey ?? "", trustedCompletenessRegistry)
        && chunk.claimKey
        && chunk.polarity === "negative"
        && targetClaimKeys.has(normalizedClaimKey(chunk.claimKey))
        && reference.use === "establish",
      );
    });
    const closedWorldTargetKeys = new Set(closedWorldReferences.flatMap((reference) => {
      const key = normalizedClaimKey(byId.get(reference.evidenceId)?.claimKey ?? "");
      return key ? [key] : [];
    }));
    const hasClosedWorldEvidence = targetClaimKeys.size > 0
      && [...targetClaimKeys].every((key) => closedWorldTargetKeys.has(key));
    const negativeConclusionKeys = new Set(validatedConclusions.flatMap((conclusion) => {
      const key = normalizedClaimKey(conclusion.claimKey);
      return conclusion.polarity === "negative" && key ? [key] : [];
    }));
    const hasExactNegativeConclusion = targetClaimKeys.size > 0
      && [...targetClaimKeys].every((key) => negativeConclusionKeys.has(key));
    const exactTargetCoverage = Boolean(
      hasClosedWorldEvidence
      && !route?.coverage.truncated
      && !(route?.coverage.failures.length ?? 0)
      && !(route?.coverage.deferredSources.length ?? 0)
      && !(route?.coverage.excludedSources.length ?? 0),
    );
    // Broad answer-level closure is the intersection of every material claim
    // boundary. A narrower transition proof may still establish one exact
    // target when every target key has its own negative typed completeness record and
    // the source pass had no omissions. Do not let one target registry close
    // the rest of the answer.
    const trustedCoverage = Boolean(route?.coverage.trustedComplete || exactTargetCoverage);
    const scoped = proofIsUsable
      && reachability.status === "unreachable_within_scope"
      && reachability.completenessScope.trim().length > 0
      && targetClaimKeys.size > 0
      && reachability.blockers.length > 0
      && trustedCoverage
      && hasClosedWorldEvidence
      && hasExactNegativeConclusion;
    if (!scoped) {
      verdict = "INSUFFICIENT_EVIDENCE";
      truthStatus = "unknown";
      confidence = "low";
      reachability = {
        ...reachability,
        status: "unknown",
        blockers: reachability.blockers.length ? reachability.blockers : ["The available causal coverage is not complete enough to prove unreachability."],
      };
      issues.push("Downgraded UNREACHABLE because trusted typed completeness and a concrete blocker were not both established");
    }
  }

  const expectedTruthStatus: Record<ContinuityAnswer["verdict"], ContinuityAnswer["truthStatus"]> = {
    SUPPORTED: "supported",
    CONFLICT: "conflicted",
    AMBIGUOUS: "ambiguous",
    // UNREACHABLE is a supported *answer* of "no" to a positive feasibility
    // question. The proposition being tested is contradicted within the typed,
    // complete transition scope; it is not itself supported. If that proof is
    // incomplete, the guards above and below downgrade the answer to unknown.
    UNREACHABLE: "contradicted",
    INSUFFICIENT_EVIDENCE: "unknown",
    PROPOSAL: "proposed",
  };
  const establishedOnlyAsSourceAssertion = verdict === "SUPPORTED"
    && validatedConclusions.length > 0
    && validatedConclusions.every((conclusion) => conclusion.assertionScope === "source_assertion");
  const expected = establishedOnlyAsSourceAssertion
    ? "source_assertion"
    : expectedTruthStatus[verdict];
  if (truthStatus !== expected) {
    truthStatus = expected;
    issues.push(`Aligned truth status with ${verdict}`);
  }

  const trustedObligations = proofIsUsable
    ? validateTrustedObligations(trustedReachability?.obligations ?? [], proofEvidenceIds, byId, issues)
    : [];
  if (trustedObligations.length) {
    validEvidence = addTrustedObligationReferences(
      validEvidence,
      trustedObligations,
      byId,
      policy,
      issues,
    );
  }

  const citedIds = new Set(validEvidence.map((reference) => reference.evidenceId));
  const referencesById = new Map(validEvidence.map((reference) => [reference.evidenceId, reference]));
  let dependencies = proposed.dependencies.flatMap((edge): ContinuityAnswer["dependencies"] => {
    const validIds = edge.evidenceIds.filter((id) => {
      if (!citedIds.has(id)) return false;
      const reference = referencesById.get(id);
      const chunk = byId.get(id);
      return Boolean(reference && chunk && dependencyReferenceAllowed(edge, reference, chunk));
    });
    if (validIds.length !== edge.evidenceIds.length) issues.push(`Removed unknown dependency evidence for ${edge.from} → ${edge.to}`);
    if (validIds.length === 0) {
      issues.push(`Removed unsupported dependency ${edge.from} → ${edge.to}`);
      return [];
    }
    const references = validIds.map((id) => referencesById.get(id)!).filter(Boolean);
    let status = edge.status;
    if (status === "established" && !references.some((reference) => reference.use === "establish")) {
      status = "open";
      issues.push(`Changed unestablished dependency to open: ${edge.from} → ${edge.to}`);
    }
    if (status === "missing") {
      const hasScopedNegative = references.some((reference) => {
        const chunk = byId.get(reference.evidenceId);
        return Boolean(chunk
          && hasVerifiedClaimCompleteness(chunk, request, edge.claimKey, trustedCompletenessRegistry)
          && chunk.polarity === "negative"
          && reference.use === "establish");
      });
      if (!hasScopedNegative) {
        status = "open";
        issues.push(`Changed open-world missing dependency to open: ${edge.from} → ${edge.to}`);
      }
    }
    if (status === "blocked" && !references.some((reference) => ["establish", "challenge"].includes(reference.use))) {
      status = "open";
      issues.push(`Changed unestablished blocker to open: ${edge.from} → ${edge.to}`);
    }
    return [{ ...edge, status, evidenceIds: validIds }];
  });

  for (const obligation of trustedObligations) {
    const status = obligation.status === "satisfied" ? "established" : obligation.status;
    const evidenceIds = obligation.evidenceIds.filter((id) => {
      const reference = referencesById.get(id);
      const chunk = byId.get(id);
      return Boolean(reference && chunk && dependencyReferenceAllowed({
        from: obligation.from,
        to: obligation.to,
        claimKey: obligation.claimKey,
        claimKind: obligation.claimKind,
        relation: obligation.relation,
        status,
        evidenceIds: obligation.evidenceIds,
      }, reference, chunk));
    });
    const matchingIndex = dependencies.findIndex((edge) =>
      normalizedClaimKey(edge.claimKey) === normalizedClaimKey(obligation.claimKey)
      && edge.relation === obligation.relation
      && edge.from.trim() === obligation.from.trim()
      && edge.to.trim() === obligation.to.trim());
    const serverEdge: ContinuityAnswer["dependencies"][number] = {
      from: obligation.from,
      to: obligation.to,
      claimKey: obligation.claimKey,
      claimKind: obligation.claimKind,
      relation: obligation.relation,
      status: evidenceIds.length ? status : "open",
      evidenceIds,
    };
    if (matchingIndex >= 0) {
      if (JSON.stringify(dependencies[matchingIndex]) !== JSON.stringify(serverEdge)) {
        issues.push(`Replaced model dependency with server obligation: ${obligation.id}`);
      }
      dependencies[matchingIndex] = serverEdge;
    } else {
      dependencies.push(serverEdge);
      issues.push(`Inserted omitted server dependency obligation: ${obligation.id}`);
    }
  }
  dependencies = deduplicateDependencies(dependencies);
  if (
    verdict === "SUPPORTED"
    && trustedObligations.some((obligation) =>
      obligation.required && (obligation.status === "blocked" || obligation.status === "open"))
  ) {
    verdict = "INSUFFICIENT_EVIDENCE";
    truthStatus = "unknown";
    confidence = "low";
    issues.push("Downgraded SUPPORTED because a required server-owned dependency remained blocked or open");
  }

  const validatedConflicts = groundedProposedConflicts.concat(generatedConflicts);

  const proposal = proposed.proposal && proposed.proposal.assumptions.length === 0
    ? { ...proposed.proposal, assumptions: ["No supporting assumption was supplied; treat this route as provisional."] }
    : proposed.proposal;
  if (proposed.proposal && proposed.proposal.assumptions.length === 0) issues.push("Added an explicit provisional assumption to the proposal");

  const checks = validateAnalysisChecks(proposed.analysisChecks, route, validEvidence, byId, request, issues);
  const unresolvedRequiredCheck = checks.some((finding) =>
    route?.requiredChecks.includes(finding.check)
      && (finding.status === "unknown" || finding.status === "conflicted"));
  if (unresolvedRequiredCheck && confidence === "high") {
    confidence = "medium";
    issues.push("Capped confidence because at least one routed analysis check is unresolved");
  }

  if (verdict === "UNREACHABLE") {
    const reachabilityCheck = checks.find((finding) => finding.check === "preconditions_and_reachability");
    const boundaryCheck = checks.find((finding) => finding.check === "claim_boundary");
    const closedWorldIds = new Set(validEvidence.flatMap((reference) => {
      const chunk = byId.get(reference.evidenceId);
      return chunk
        && hasVerifiedClaimCompleteness(chunk, request, chunk.claimKey ?? "", trustedCompletenessRegistry)
        && chunk.claimKey
        && chunk.polarity === "negative"
        && reachability.targetClaimKeys.map(normalizedClaimKey).includes(normalizedClaimKey(chunk.claimKey))
        && reference.use === "establish" ? [reference.evidenceId] : [];
    }));
    const reachabilityUsesClosedWorld = reachabilityCheck?.evidenceIds.some((id) => closedWorldIds.has(id)) ?? false;
    const targetKeys = new Set(reachability.targetClaimKeys.map(normalizedClaimKey).filter(Boolean));
    const hasGroundedBlockingEdge = dependencies.some((edge) =>
      targetKeys.has(normalizedClaimKey(edge.claimKey))
      && (edge.status === "missing" || edge.status === "blocked"));
    if (
      reachabilityCheck?.status !== "supported"
      || boundaryCheck?.status !== "supported"
      || !reachabilityUsesClosedWorld
      || !hasGroundedBlockingEdge
      || !proofIsUsable
    ) {
      verdict = "INSUFFICIENT_EVIDENCE";
      truthStatus = "unknown";
      confidence = "low";
      reachability = { ...reachability, status: "unknown" };
      issues.push("Downgraded UNREACHABLE because typed reachability, a supported claim boundary, and claim-scoped completeness evidence were not all established");
    }
  }
  if (verdict !== "UNREACHABLE" && reachability.status === "unreachable_within_scope") {
    reachability = { ...reachability, status: "unknown" };
  }
  if (!proofIsUsable
    && verdict === "SUPPORTED"
    && (requestedTargets.size > 0 || ["reachable", "conditionally_reachable"].includes(proposed.reachability.status))) {
    verdict = "INSUFFICIENT_EVIDENCE";
    truthStatus = "unknown";
    confidence = "low";
    issues.push("Downgraded SUPPORTED because the requested causal target had no server-owned transition proof");
  }
  if (!proofIsUsable && verdict === "UNREACHABLE") {
    verdict = "INSUFFICIENT_EVIDENCE";
    truthStatus = "unknown";
    confidence = "low";
  }
  if (!proofIsUsable && reachability.status === "unreachable_within_scope") {
    reachability = { ...reachability, status: "unknown", path: [] };
  }
  if (!proofIsUsable && (reachability.status === "reachable" || reachability.status === "conditionally_reachable")) {
    reachability = { ...reachability, status: "unknown", path: [] };
  }
  if (proofIsUsable && (reachability.status === "reachable" || reachability.status === "conditionally_reachable")) {
    const targetKeys = new Set(reachability.targetClaimKeys.map(normalizedClaimKey).filter(Boolean));
    const proofGroundsEveryTarget = targetKeys.size > 0
      && [...targetKeys].every((targetKey) => proofTargets.has(targetKey));
    if (!proofGroundsEveryTarget) {
      reachability = { ...reachability, status: "unknown" };
      if (verdict === "SUPPORTED") {
        verdict = "INSUFFICIENT_EVIDENCE";
        truthStatus = "unknown";
        confidence = "low";
      } else if (confidence === "high") {
        confidence = "medium";
      }
      issues.push("Downgraded reachable path because its exact target claims were not grounded by the server transition proof");
    }
  }
  if (!proofIsUsable) reachability = { ...reachability, path: [] };

  const pinnedRevision = request?.projectRevision?.trim() || proposed.projectRevision.trim() || "unversioned";
  const pinnedTimeScope = request ? request.timeScope ?? null : proposed.timeScope;
  const pinnedQuestion = request?.question.trim() || proposed.question.trim();
  if (request && proposed.projectRevision !== pinnedRevision) issues.push("Replaced model-supplied project revision with the server-pinned revision");
  if (request && proposed.timeScope !== pinnedTimeScope) issues.push("Replaced model-supplied time scope with the request scope");
  if (request && proposed.question.trim() !== pinnedQuestion) issues.push("Replaced model-supplied question with the current request");

  return {
    issues,
    answer: {
      ...proposed,
      version: CONTINUITY_ANSWER_VERSION,
      verdict,
      truthStatus,
      projectRevision: pinnedRevision,
      timeScope: pinnedTimeScope,
      question: pinnedQuestion,
      reachability,
      confidence,
      evidence: validEvidence,
      analysisChecks: checks,
      conclusions: validatedConclusions,
      entities: validatedEntities,
      conflicts: validatedConflicts,
      dependencies,
      proposal,
      caveats: [...proposed.caveats, ...issues],
    },
  };
}

function citationUseAllowed(
  chunk: EvidenceChunk,
  claimKind: ClaimKind,
  use: CitationUse,
  policy: AuthorityPolicy,
): boolean {
  const declaredKinds = chunk.claimKinds ?? [];
  if (!declaredKinds.includes(claimKind)) return false;
  if (chunk.flags?.includes("compiled_context_only") && use !== "contextualize") return false;
  if (chunk.flags?.includes("evidence_id_collision") && use !== "contextualize") return false;
  if (chunk.flags?.includes("possible_prompt_injection") && use !== "contextualize") return false;
  const boundary = assertionBoundaryFor(chunk);
  const allowedByScope = policy.allowedUsesByAssertionScope[boundary.scope]?.[claimKind] ?? [];
  if (!allowedByScope.includes(use)) return false;
  const role = chunk.role ?? "reference";
  const allowedByRole = policy.allowedUsesByRole[role]?.[claimKind] ?? [];
  const allowedByAuthority = policy.allowedUsesByAuthority[chunk.authority]?.[claimKind] ?? [];
  const lifecycle = chunk.lifecycle ?? "unknown";
  if (lifecycle === "superseded") return false;
  // In a source-assertion plane, `establish` means only “this source states
  // X.” The narrower scope is attached to every validated citation and
  // conclusion, so role/authority rules cannot accidentally turn X into canon.
  if (boundary.scope === "source_assertion") {
    if (lifecycle === "proposed") return false;
    if (lifecycle === "historical") {
      return claimKind === "historical"
        ? ["establish", "corroborate", "challenge", "contextualize"].includes(use)
        : use === "contextualize";
    }
    return lifecycle === "unknown" ? use === "contextualize" : true;
  }
  if (use !== "contextualize" && !allowedByRole.includes(use)) return false;
  if (!allowedByAuthority.includes(use)) return false;
  if (lifecycle === "proposed") return use === "propose" || use === "contextualize";
  if (lifecycle === "historical") {
    return claimKind === "historical"
      ? ["establish", "corroborate", "challenge", "contextualize"].includes(use)
      : use === "contextualize";
  }
  if (lifecycle === "unknown") return use === "contextualize";
  return true;
}

function stanceMatchesUse(stance: "supports" | "opposes" | "context", use: CitationUse): boolean {
  if (use === "challenge") return stance === "opposes";
  if (use === "contextualize" || use === "propose") return stance === "context";
  return stance === "supports";
}

function establishableClaimKinds(chunk: EvidenceChunk, policy: AuthorityPolicy): ClaimKind[] {
  const kinds = chunk.claimKind ? [chunk.claimKind] : chunk.claimKinds ?? [];
  return kinds.filter((kind) => citationUseAllowed(chunk, kind, "establish", policy));
}

function effectiveForAssertion(chunk: EvidenceChunk): boolean {
  return (chunk.lifecycle ?? "unknown") === "active"
    && assertionBoundaryFor(chunk).scope !== "proposal";
}

function normalizedClaimKey(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Detect claims that attempt to turn incomplete coverage into a universal
 * absence. This is intentionally domain-neutral: surveys, attendance pages,
 * manuscript ranges, logs, and image sequences all share the same logical
 * error. A direct positive counterexample is handled separately as a genuine
 * claim contradiction.
 */
function requestsGlobalNegative(question: string): boolean {
  const normalized = question.replace(/\s+/g, " ").trim().toLowerCase();
  const negative = /\b(?:no|none|nobody|nothing|never|absent|without\s+any|did\s+not\s+(?:exist|occur|appear|happen))\b/.test(normalized);
  const globalScope = /\b(?:anywhere|everywhere|everyone|everything|all|entire|whole|global|across\s+(?:the\s+)?(?:full|complete|entire|whole)|in\s+any\s+(?:part|section|chapter|page|frame|record|period|location))\b/.test(normalized);
  return negative && globalScope;
}

function validateAnalysisChecks(
  proposed: AnalysisCheckFinding[],
  route: AnalysisRoute | undefined,
  validEvidence: ContinuityAnswer["evidence"],
  evidenceById: Map<string, EvidenceChunk>,
  request: QueryRequest | undefined,
  issues: string[],
): AnalysisCheckFinding[] {
  const referencesById = new Map(validEvidence.map((reference) => [reference.evidenceId, reference]));
  const required = route?.requiredChecks ?? [];
  const candidates = Array.isArray(proposed) ? proposed : [];
  const byCheck = new Map<AnalysisCheckFinding["check"], AnalysisCheckFinding>();
  for (const finding of candidates) {
    if (route && !required.includes(finding.check)) {
      issues.push(`Removed unrouted analysis check: ${finding.check}`);
      continue;
    }
    if (byCheck.has(finding.check)) {
      issues.push(`Removed duplicate analysis check: ${finding.check}`);
      continue;
    }
    const evidenceIds = finding.evidenceIds.filter((id) => {
      const reference = referencesById.get(id);
      return reference ? checkReferenceAllowed(finding.check, reference, finding.status) : false;
    });
    let status = finding.status;
    let text = finding.finding.trim();
    if (evidenceIds.length !== finding.evidenceIds.length) issues.push(`Removed uncited or semantically incompatible evidence from analysis check: ${finding.check}`);
    if ((status === "supported" || status === "conflicted") && evidenceIds.length === 0) {
      status = "unknown";
      text = "The proposed finding did not cite valid typed evidence.";
      issues.push(`Downgraded unsupported analysis check: ${finding.check}`);
    }
    if (status === "conflicted") {
      const references = evidenceIds.map((id) => referencesById.get(id)!).filter(Boolean);
      if (
        !hasConflictEvidence(references, evidenceById, request)
        && !hasSourceDisagreementEvidence(references, evidenceById, request)
      ) {
        status = "unknown";
        text = "The proposed conflict did not include both establishing and challenging evidence.";
        issues.push(`Downgraded ungrounded conflicted analysis check: ${finding.check}`);
      }
    }
    if (
      status === "not_applicable"
      && (text.length < 24 || /^(?:not[ -]?applicable|n\/?a|none)[.!]?$/i.test(text))
    ) {
      status = "unknown";
      text = "No concrete scope-based rationale established that this check is inapplicable.";
      issues.push(`Rejected unrationalized not-applicable check: ${finding.check}`);
    }
    byCheck.set(finding.check, { ...finding, status, finding: text, evidenceIds });
  }
  for (const check of required) {
    if (byCheck.has(check)) continue;
    byCheck.set(check, {
      check,
      status: "unknown",
      finding: "Required check was not supplied by the reasoner.",
      evidenceIds: [],
    });
    issues.push(`Inserted missing required analysis check: ${check}`);
  }
  return [...byCheck.values()];
}

const CHECK_CLAIM_KINDS: Record<AnalysisCheckFinding["check"], ClaimKind[]> = {
  identity_scope: ["identity", "historical"],
  authority_and_lifecycle: ["identity", "normative", "configured", "implemented", "tested", "observed", "causal", "historical"],
  temporal_scope: ["normative", "configured", "implemented", "tested", "observed", "causal", "historical"],
  claim_boundary: ["identity", "normative", "configured", "implemented", "tested", "observed", "causal", "historical"],
  preconditions_and_reachability: ["configured", "implemented", "tested", "observed", "causal"],
  actor_knowledge_and_authorization: ["normative", "configured", "implemented", "observed", "causal"],
  resource_conservation: ["configured", "implemented", "observed", "causal"],
  transition_ordering: ["configured", "implemented", "tested", "observed", "causal"],
  repeatability_and_idempotency: ["normative", "configured", "implemented", "tested", "observed", "causal"],
  state_and_asset_compatibility: ["identity", "normative", "configured", "implemented", "tested", "observed", "causal"],
  downstream_consumers: ["normative", "configured", "implemented", "tested", "observed", "causal"],
  verification_and_unknowns: ["tested", "observed", "implemented", "configured", "causal", "historical"],
};

function checkReferenceAllowed(
  check: AnalysisCheckFinding["check"],
  reference: EvidenceReference,
  status: AnalysisCheckFinding["status"],
): boolean {
  if (!CHECK_CLAIM_KINDS[check].includes(reference.claimKind)) return false;
  if (status === "supported") return reference.use === "establish" || reference.use === "corroborate";
  if (status === "conflicted") return ["establish", "corroborate", "challenge"].includes(reference.use);
  return reference.use !== "propose";
}

function hasConflictEvidence(
  references: EvidenceReference[],
  evidenceById: Map<string, EvidenceChunk>,
  request?: QueryRequest,
): boolean {
  const frames = new Map<string, Array<{ reference: EvidenceReference; chunk: EvidenceChunk }>>();
  for (const reference of references) {
    const chunk = evidenceById.get(reference.evidenceId);
    if (!chunk?.claimKey || !chunk.polarity) continue;
    const frame = [
      reference.claimKind,
      normalizedClaimKey(chunk.claimKey),
      assertionBoundaryFor(chunk).scope,
      assertionBoundaryFor(chunk).ownerId,
      normalizedFrameValue(chunk.world),
      normalizedFrameValue(chunk.epistemicOwner),
    ].join("\u0000");
    const group = frames.get(frame) ?? [];
    group.push({ reference, chunk });
    frames.set(frame, group);
  }
  return [...frames.values()].some((group) => group.some((left, leftIndex) =>
    group.slice(leftIndex + 1).some((right) => {
      const opposedUses = (
        left.reference.use === "challenge"
        && ["establish", "corroborate"].includes(right.reference.use)
      ) || (
        right.reference.use === "challenge"
        && ["establish", "corroborate"].includes(left.reference.use)
      );
      return opposedUses
        && left.chunk.polarity !== right.chunk.polarity
        && temporalIntervalsOverlap(left.chunk, right.chunk, request);
    })));
}

/** Opposed source assertions are a corpus-level disagreement, not a
 * contradiction inside either source owner or in current project truth. */
function hasSourceDisagreementEvidence(
  references: EvidenceReference[],
  evidenceById: Map<string, EvidenceChunk>,
  request?: QueryRequest,
): boolean {
  const frames = new Map<string, Array<{ chunk: EvidenceChunk; ownerId: string }>>();
  for (const reference of references) {
    const chunk = evidenceById.get(reference.evidenceId);
    const boundary = chunk ? assertionBoundaryFor(chunk) : null;
    if (
      !chunk?.claimKey
      || !chunk.polarity
      || boundary?.scope !== "source_assertion"
      || (chunk.claimKind
        ? reference.claimKind !== chunk.claimKind
        : !(chunk.claimKinds ?? []).includes(reference.claimKind))
      || !["establish", "corroborate", "challenge"].includes(reference.use)
    ) continue;
    const frame = [
      reference.claimKind,
      normalizedClaimKey(chunk.claimKey),
      normalizedFrameValue(chunk.world),
      normalizedFrameValue(chunk.epistemicOwner),
    ].join("\u0000");
    const group = frames.get(frame) ?? [];
    group.push({ chunk, ownerId: boundary.ownerId });
    frames.set(frame, group);
  }
  return [...frames.values()].some((group) => group.some((left, leftIndex) =>
    group.slice(leftIndex + 1).some((right) =>
      left.ownerId !== right.ownerId
      && left.chunk.polarity !== right.chunk.polarity
      && temporalIntervalsOverlap(left.chunk, right.chunk, request))));
}

function normalizedFrameValue(value: string | null | undefined): string {
  return value?.trim().toLowerCase() || "global";
}

function findContradictoryClaims(
  evidence: EvidenceChunk[],
  request: QueryRequest | undefined,
  policy: AuthorityPolicy,
): Array<{ claimKind: ClaimKind; claimKey: string; chunks: EvidenceChunk[] }> {
  const groups = new Map<string, { claimKind: ClaimKind; claimKey: string; chunks: EvidenceChunk[] }>();
  for (const chunk of evidence) {
    if (!chunk.claimKey || !chunk.polarity || !effectiveForAssertion(chunk)) continue;
    for (const claimKind of establishableClaimKinds(chunk, policy)) {
      const frame = [
        claimKind,
        normalizedClaimKey(chunk.claimKey),
        assertionBoundaryFor(chunk).scope,
        assertionBoundaryFor(chunk).ownerId,
        normalizedFrameValue(chunk.world),
        normalizedFrameValue(chunk.epistemicOwner),
      ].join("\u0000");
      const group = groups.get(frame) ?? { claimKind, claimKey: chunk.claimKey, chunks: [] };
      group.chunks.push(chunk);
      groups.set(frame, group);
    }
  }

  return [...groups.values()].flatMap(({ claimKind, claimKey, chunks }) => {
    const highestWeight = Math.max(...chunks.map((chunk) =>
      chunk.authorityRank ?? authorityWeight(chunk.authority, policy)));
    const effective = chunks.filter((chunk) =>
      (chunk.authorityRank ?? authorityWeight(chunk.authority, policy)) === highestWeight);
    const conflicting = new Set<EvidenceChunk>();
    for (let leftIndex = 0; leftIndex < effective.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < effective.length; rightIndex += 1) {
        const left = effective[leftIndex];
        const right = effective[rightIndex];
        if (left.polarity === right.polarity || !temporalIntervalsOverlap(left, right, request)) continue;
        conflicting.add(left);
        conflicting.add(right);
      }
    }
    return conflicting.size ? [{ claimKind, claimKey, chunks: [...conflicting] }] : [];
  });
}

function findSourceDisagreements(
  evidence: EvidenceChunk[],
  request: QueryRequest | undefined,
  policy: AuthorityPolicy,
): Array<{ claimKind: ClaimKind; claimKey: string; chunks: EvidenceChunk[] }> {
  const groups = new Map<string, {
    claimKind: ClaimKind;
    claimKey: string;
    chunks: EvidenceChunk[];
  }>();
  for (const chunk of evidence) {
    const boundary = assertionBoundaryFor(chunk);
    if (
      !chunk.claimKey
      || !chunk.polarity
      || !effectiveForAssertion(chunk)
      || boundary.scope !== "source_assertion"
    ) continue;
    for (const claimKind of establishableClaimKinds(chunk, policy)) {
      const frame = [
        claimKind,
        normalizedClaimKey(chunk.claimKey),
        normalizedFrameValue(chunk.world),
        normalizedFrameValue(chunk.epistemicOwner),
      ].join("\u0000");
      const group = groups.get(frame) ?? { claimKind, claimKey: chunk.claimKey, chunks: [] };
      group.chunks.push(chunk);
      groups.set(frame, group);
    }
  }

  return [...groups.values()].flatMap(({ claimKind, claimKey, chunks }) => {
    const disagreeing = new Set<EvidenceChunk>();
    for (let leftIndex = 0; leftIndex < chunks.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < chunks.length; rightIndex += 1) {
        const left = chunks[leftIndex];
        const right = chunks[rightIndex];
        if (
          assertionBoundaryFor(left).ownerId === assertionBoundaryFor(right).ownerId
          || left.polarity === right.polarity
          || !temporalIntervalsOverlap(left, right, request)
        ) continue;
        disagreeing.add(left);
        disagreeing.add(right);
      }
    }
    return disagreeing.size
      ? [{ claimKind, claimKey, chunks: [...disagreeing].sort((left, right) => left.id.localeCompare(right.id)) }]
      : [];
  });
}

function temporalIntervalsOverlap(
  left: EvidenceChunk,
  right: EvidenceChunk,
  request?: QueryRequest,
): boolean {
  const leftInterval = temporalInterval(left);
  const rightInterval = temporalInterval(right);
  const requestAxis = normalizedTemporalAxis(request?.temporalAxis)
    ?? parseTemporalOrdinal(request?.timeScope)?.axis
    ?? null;
  if (leftInterval.invalid || rightInterval.invalid) return false;
  if (leftInterval.axis && rightInterval.axis && leftInterval.axis !== rightInterval.axis) return false;
  const evidenceAxis = leftInterval.axis ?? rightInterval.axis;
  if (requestAxis && evidenceAxis && requestAxis !== evidenceAxis) return false;

  const queryStart = request?.storyPosition ?? Number.NEGATIVE_INFINITY;
  const queryEnd = request?.targetPosition ?? request?.storyPosition ?? Number.POSITIVE_INFINITY;
  const leftStart = Math.max(leftInterval.start, queryStart);
  const leftEnd = Math.min(leftInterval.end, queryEnd);
  const rightStart = Math.max(rightInterval.start, queryStart);
  const rightEnd = Math.min(rightInterval.end, queryEnd);
  return leftStart <= leftEnd
    && rightStart <= rightEnd
    && Math.max(leftStart, rightStart) <= Math.min(leftEnd, rightEnd);
}

function temporalInterval(chunk: EvidenceChunk): {
  axis: string | null;
  start: number;
  end: number;
  invalid: boolean;
} {
  const parsedFrom = parseTemporalOrdinal(chunk.validFrom);
  const parsedTo = parseTemporalOrdinal(chunk.validTo);
  const declaredAxis = normalizedTemporalAxis(chunk.temporalAxis);
  const axes = new Set([declaredAxis, parsedFrom?.axis, parsedTo?.axis].filter(Boolean));
  return {
    axis: [...axes][0] ?? null,
    start: chunk.validFromOrder ?? parsedFrom?.value ?? Number.NEGATIVE_INFINITY,
    end: chunk.validToOrder ?? parsedTo?.value ?? Number.POSITIVE_INFINITY,
    invalid: axes.size > 1,
  };
}

function parseTemporalOrdinal(value: string | null | undefined): { axis: string; value: number } | null {
  const match = value?.trim().toLowerCase().match(/\b(day|chapter|ch|beat|scene|turn|episode|ep|step)[\s_:#-]*(\d+(?:\.\d+)?)\b/);
  if (!match) return null;
  return { axis: normalizedTemporalAxis(match[1]) ?? match[1], value: Number(match[2]) };
}

function normalizedTemporalAxis(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return null;
  const aliases: Record<string, string> = { ch: "chapter", ep: "episode" };
  return aliases[normalized] ?? normalized;
}

function hasVerifiedClaimCompleteness(
  chunk: EvidenceChunk,
  request: QueryRequest | undefined,
  claimKey: string,
  registry: TrustedCompletenessRegistry | undefined,
): boolean {
  if (!request) return false;
  const verified = verifyCompletenessBoundary(chunk, request, registry);
  return Boolean(verified && boundaryCoversExactClaimKey(verified, claimKey));
}

function validateConclusionClaims(
  conclusions: ContinuityAnswer["conclusions"],
  references: EvidenceReference[],
  evidenceById: Map<string, EvidenceChunk>,
  request: QueryRequest | undefined,
  trustedCompletenessRegistry: TrustedCompletenessRegistry | undefined,
  issues: string[],
): ContinuityAnswer["conclusions"] {
  const referencesById = new Map(references.map((reference) => [reference.evidenceId, reference]));
  const seen = new Set<string>();
  return conclusions.flatMap((conclusion): ContinuityAnswer["conclusions"] => {
    const claimKey = normalizedClaimKey(conclusion.claimKey);
    const frame = `${conclusion.claimKind}\u0000${claimKey}\u0000${conclusion.polarity}\u0000${conclusion.basis}`;
    if (!claimKey || seen.has(frame) || !conclusion.statement.trim()) {
      issues.push(`Removed duplicate or incomplete conclusion: ${conclusion.claimKey || "(empty)"}`);
      return [];
    }
    seen.add(frame);
    if (conclusion.basis === "closed_world_absence" && conclusion.polarity !== "negative") {
      issues.push(`Rejected proof-by-absence with a non-negative conclusion: ${conclusion.claimKey}`);
      return [];
    }
    const evidenceIds = [...new Set(conclusion.evidenceIds)].filter((id) => {
      const reference = referencesById.get(id);
      const chunk = evidenceById.get(id);
      const exactTypedEvidence = Boolean(
        reference
        && chunk
        && ["establish", "corroborate"].includes(reference.use)
        && reference.claimKind === conclusion.claimKind
        && normalizedClaimKey(chunk.claimKey ?? "") === claimKey
        && chunk.polarity === conclusion.polarity
      );
      if (!exactTypedEvidence) return false;
      return conclusion.basis !== "closed_world_absence"
        || Boolean(chunk && hasVerifiedClaimCompleteness(
          chunk,
          request,
          conclusion.claimKey,
          trustedCompletenessRegistry,
        ));
    });
    if (evidenceIds.length !== conclusion.evidenceIds.length) {
      issues.push(conclusion.basis === "closed_world_absence"
        ? `Rejected proof-by-absence outside an exact closed-world scope for ${conclusion.claimKey}`
        : `Removed semantically incompatible conclusion evidence for ${conclusion.claimKey}`);
    }
    if (!evidenceIds.length) {
      issues.push(`Removed unsupported conclusion: ${conclusion.claimKey}`);
      return [];
    }
    const establishingIds = evidenceIds.filter((id) => referencesById.get(id)?.use === "establish");
    const boundaryIds = establishingIds.length ? establishingIds : evidenceIds;
    const boundaries = boundaryIds.map((id) => assertionBoundaryFor(evidenceById.get(id)!));
    const assertionScope = boundaries.some((boundary) => boundary.scope === "project_truth")
      ? "project_truth" as const
      : boundaries.some((boundary) => boundary.scope === "source_assertion")
        ? "source_assertion" as const
        : "proposal" as const;
    const assertionOwnerIds = [...new Set(boundaries
      .filter((boundary) => boundary.scope === assertionScope)
      .map((boundary) => boundary.ownerId))];
    return [{
      ...conclusion,
      claimKey,
      statement: conclusion.statement.trim(),
      evidenceIds,
      assertionScope,
      assertionOwnerIds,
    }];
  });
}

function validateEntityReferences(
  entities: ContinuityAnswer["entities"],
  references: EvidenceReference[],
  evidenceById: Map<string, EvidenceChunk>,
  issues: string[],
): ContinuityAnswer["entities"] {
  const referencesById = new Map(references.map((reference) => [reference.evidenceId, reference]));
  const seen = new Set<string>();
  return entities.flatMap((entity): ContinuityAnswer["entities"] => {
    const normalizedId = entity.id.trim().toLowerCase();
    if (!normalizedId || seen.has(normalizedId)) {
      issues.push(`Removed duplicate or empty entity reference: ${entity.id || "(empty)"}`);
      return [];
    }
    seen.add(normalizedId);
    const evidenceIds = [...new Set(entity.evidenceIds)].filter((id) => {
      const reference = referencesById.get(id);
      return Boolean(reference && evidenceById.has(id) && reference.use !== "propose");
    });
    const hasEstablishingEvidence = evidenceIds.some((id) => {
      const reference = referencesById.get(id);
      return Boolean(reference && ["establish", "corroborate", "challenge"].includes(reference.use));
    });
    if (!evidenceIds.length || (entity.resolution === "resolved" && !hasEstablishingEvidence)) {
      issues.push(`Removed unsupported entity reference: ${entity.id}`);
      return [];
    }
    const compiledEvidenceUsed = evidenceIds.some((id) => {
      const chunk = evidenceById.get(id);
      return Boolean(
        chunk?.parentEvidenceId
        || chunk?.flags?.includes("compiled_atomic_span")
        || chunk?.flags?.includes("compiled_context_only"),
      );
    });
    if (compiledEvidenceUsed) {
      const identityEvidenceIds = evidenceIds.filter((id) => evidenceById.get(id)?.claimKind === "identity");
      const candidates = identityEvidenceIds.flatMap((id) => evidenceById.get(id)?.entityCandidates ?? [])
        .filter((candidate) => candidate.id.trim().toLowerCase() === normalizedId);
      if (!candidates.length) {
        issues.push(`Removed entity not present in identity-typed server-compiled evidence: ${entity.id}`);
        return [];
      }
      const pinned = mergeCompiledEntityCandidates(candidates);
      return [{
        id: pinned.id,
        name: pinned.name,
        type: pinned.type,
        aliases: pinned.aliases,
        resolution: pinned.resolution,
        evidenceIds,
      }];
    }
    return [{ ...entity, evidenceIds }];
  });
}

function mergeCompiledEntityCandidates(candidates: CompiledEntityCandidate[]): CompiledEntityCandidate {
  const first = candidates[0];
  const resolution = candidates.some((candidate) => candidate.resolution === "ambiguous")
    ? "ambiguous"
    : candidates.some((candidate) => candidate.resolution === "candidate") ? "candidate" : "resolved";
  return {
    ...first,
    aliases: [...new Set(candidates.flatMap((candidate) => candidate.aliases))],
    resolution,
  };
}

function validateConflictRecords(
  conflicts: ContinuityAnswer["conflicts"],
  evidenceReferences: EvidenceReference[],
  evidenceById: Map<string, EvidenceChunk>,
  entities: ContinuityAnswer["entities"],
  request: QueryRequest | undefined,
  issues: string[],
): ContinuityAnswer["conflicts"] {
  const cited = new Set(evidenceReferences.map((reference) => reference.evidenceId));
  const referencesById = new Map(evidenceReferences.map((reference) => [reference.evidenceId, reference]));
  const entityIds = new Set(entities.map((entity) => entity.id.trim().toLowerCase()));
  return conflicts.flatMap((conflict): ContinuityAnswer["conflicts"] => {
    const evidenceIds = [...new Set(conflict.evidenceIds)].filter((id) => cited.has(id));
    if (evidenceIds.length !== conflict.evidenceIds.length) issues.push(`Removed unknown conflict evidence for ${conflict.type}`);
    const references = evidenceIds.map((id) => referencesById.get(id)!).filter(Boolean);
    const frameKey = normalizedClaimKey(conflict.frameKey);
    const premiseKeys = new Set(conflict.premiseClaimKeys.map(normalizedClaimKey).filter(Boolean));
    const matchedPremiseKeys = new Set(references.flatMap((reference) => {
      const key = normalizedClaimKey(evidenceById.get(reference.evidenceId)?.claimKey ?? "");
      return premiseKeys.has(key) ? [key] : [];
    }));
    let grounded = false;

    if (conflict.basis === "claim_contradiction") {
      const framed = references.filter((reference) =>
        reference.claimKind === conflict.claimKind
        && normalizedClaimKey(evidenceById.get(reference.evidenceId)?.claimKey ?? "") === frameKey);
      grounded = Boolean(frameKey) && hasConflictEvidence(framed, evidenceById, request);
    } else if (conflict.basis === "source_disagreement") {
      const framed = references.filter((reference) =>
        reference.claimKind === conflict.claimKind
        && normalizedClaimKey(evidenceById.get(reference.evidenceId)?.claimKey ?? "") === frameKey);
      grounded = Boolean(frameKey) && hasSourceDisagreementEvidence(framed, evidenceById, request);
    } else if (conflict.basis === "referent_ambiguity") {
      const candidates = [...new Set(conflict.candidateEntityIds.map((id) => id.trim().toLowerCase()).filter(Boolean))];
      const candidateEvidenceCovered = candidates.every((candidateId) => {
        const entity = entities.find((item) => item.id.trim().toLowerCase() === candidateId);
        return entity?.evidenceIds.some((id) => evidenceIds.includes(id));
      });
      const sharedReferentCovered = candidates.every((candidateId) => {
        const entity = entities.find((item) => item.id.trim().toLowerCase() === candidateId);
        return entity?.evidenceIds.some((id) => {
          if (!evidenceIds.includes(id)) return false;
          const chunk = evidenceById.get(id);
          return chunk?.referentKeys?.some((key) => normalizedClaimKey(key) === frameKey);
        });
      });
      grounded = conflict.claimKind === "identity"
        && Boolean(frameKey)
        && candidates.length >= 2
        && candidates.every((id) => entityIds.has(id))
        && premiseKeys.size >= 2
        && matchedPremiseKeys.size === premiseKeys.size
        && candidateEvidenceCovered
        && sharedReferentCovered
        && hasIndependentReferentAnchors(
          candidates,
          entities,
          evidenceIds,
          evidenceById,
          frameKey,
        );
    } else if (conflict.basis === "constraint_violation") {
      const establishesConstraint = references.some((reference) =>
        reference.claimKind === conflict.claimKind
        && ["establish", "corroborate"].includes(reference.use)
        && normalizedClaimKey(evidenceById.get(reference.evidenceId)?.claimKey ?? "") === frameKey);
      grounded = Boolean(frameKey)
        && establishesConstraint
        && [...premiseKeys].some((key) => key !== frameKey)
        && matchedPremiseKeys.size === premiseKeys.size;
    } else if (conflict.basis === "proposal_divergence") {
      grounded = Boolean(request?.proposedChange?.trim())
        && Boolean(frameKey)
        && references.some((reference) =>
          reference.claimKind === conflict.claimKind
          && ["establish", "corroborate", "challenge"].includes(reference.use)
          && normalizedClaimKey(evidenceById.get(reference.evidenceId)?.claimKey ?? "") === frameKey);
    }

    if (!grounded) {
      issues.push(`Removed unsupported conflict: ${conflict.type}`);
      return [];
    }
    return [{ ...conflict, frameKey, premiseClaimKeys: [...premiseKeys], evidenceIds }];
  });
}

/**
 * Prove that each ambiguous candidate is anchored independently by server-owned
 * identity metadata. Approved project-truth registries are already trusted
 * anchors. Untrusted manuscript/reference worlds need distinct exact spans
 * emitted by the evidence compiler; merely supplying two model entity IDs or
 * two `sourceId` strings is never enough.
 */
function hasIndependentReferentAnchors(
  candidateIds: string[],
  entities: ContinuityAnswer["entities"],
  conflictEvidenceIds: string[],
  evidenceById: Map<string, EvidenceChunk>,
  frameKey: string,
): boolean {
  const conflictEvidence = new Set(conflictEvidenceIds);
  const anchors = new Set<string>();
  for (const candidateId of candidateIds) {
    const entity = entities.find((item) => item.id.trim().toLowerCase() === candidateId);
    if (!entity) return false;
    let candidateAnchor: string | null = null;
    for (const evidenceId of entity.evidenceIds) {
      if (!conflictEvidence.has(evidenceId)) continue;
      const chunk = evidenceById.get(evidenceId);
      if (!chunk || chunk.claimKind !== "identity") continue;
      const candidate = chunk.entityCandidates?.find((item) =>
        item.id.trim().toLowerCase() === candidateId
        && normalizedClaimKey(item.referentKey) === frameKey);
      if (!candidate) continue;

      const boundary = assertionBoundaryFor(chunk);
      if (boundary.scope === "project_truth") {
        candidateAnchor = `registry\u0000${chunk.projectId}\u0000${chunk.id}\u0000${candidate.id.toLowerCase()}`;
        break;
      }

      const exactCompiledSpan = Boolean(
        boundary.scope === "source_assertion"
        && chunk.flags?.includes("compiled_atomic_span")
        && chunk.parentEvidenceId?.trim()
        && Number.isSafeInteger(chunk.quoteStart)
        && Number.isSafeInteger(chunk.quoteEnd)
        && (chunk.quoteStart as number) >= 0
        && (chunk.quoteEnd as number) > (chunk.quoteStart as number)
        && (chunk.quoteEnd as number) - (chunk.quoteStart as number) === chunk.text.length,
      );
      if (!exactCompiledSpan) continue;
      candidateAnchor = [
        "span",
        boundary.ownerId,
        chunk.parentEvidenceId,
        String(chunk.quoteStart),
        String(chunk.quoteEnd),
        candidate.id.toLowerCase(),
      ].join("\u0000");
      break;
    }
    if (!candidateAnchor || anchors.has(candidateAnchor)) return false;
    anchors.add(candidateAnchor);
  }
  return anchors.size >= 2;
}

function validateTrustedObligations(
  obligations: NonNullable<TrustedReachability["obligations"]>,
  proofEvidenceIds: Set<string>,
  evidenceById: Map<string, EvidenceChunk>,
  issues: string[],
): NonNullable<TrustedReachability["obligations"]> {
  const seen = new Set<string>();
  return obligations.flatMap((obligation) => {
    const id = obligation.id.trim();
    const validEvidenceIds = [...new Set(obligation.evidenceIds)].filter((evidenceId) =>
      proofEvidenceIds.has(evidenceId) && evidenceById.has(evidenceId));
    const valid = Boolean(
      id
      && !seen.has(id)
      && obligation.from.trim()
      && obligation.to.trim()
      && obligation.claimKey.trim()
      && obligation.required === true
      && validEvidenceIds.length === obligation.evidenceIds.length,
    );
    if (!valid) {
      issues.push(`Ignored malformed or ungrounded server dependency obligation: ${id || "(missing id)"}`);
      return [];
    }
    seen.add(id);
    return [{ ...obligation, id, evidenceIds: validEvidenceIds }];
  });
}

function addTrustedObligationReferences(
  existing: EvidenceReference[],
  obligations: NonNullable<TrustedReachability["obligations"]>,
  evidenceById: Map<string, EvidenceChunk>,
  policy: AuthorityPolicy,
  issues: string[],
): EvidenceReference[] {
  const result = [...existing];
  const cited = new Set(result.map((reference) => reference.evidenceId));
  for (const obligation of obligations) {
    for (const evidenceId of obligation.evidenceIds) {
      if (cited.has(evidenceId)) continue;
      const chunk = evidenceById.get(evidenceId);
      if (!chunk || !(chunk.claimKinds ?? []).includes(obligation.claimKind)) {
        issues.push(`Could not cite server obligation evidence outside its claim boundary: ${obligation.id}`);
        continue;
      }
      const use: CitationUse = citationUseAllowed(chunk, obligation.claimKind, "establish", policy)
        ? "establish"
        : "contextualize";
      if (!citationUseAllowed(chunk, obligation.claimKind, use, policy)) {
        issues.push(`Could not admit server obligation evidence under the active authority policy: ${obligation.id}`);
        continue;
      }
      result.push({
        evidenceId,
        sourceId: chunk.sourceId,
        locator: chunk.locator,
        stance: use === "contextualize" ? "context" : "supports",
        claimKind: obligation.claimKind,
        use,
        supports: `Server-owned ${obligation.kind} obligation ${obligation.id}.`,
      });
      cited.add(evidenceId);
    }
  }
  return result;
}

function deduplicateDependencies(
  dependencies: ContinuityAnswer["dependencies"],
): ContinuityAnswer["dependencies"] {
  const byFrame = new Map<string, ContinuityAnswer["dependencies"][number]>();
  for (const edge of dependencies) {
    const key = [edge.from.trim(), edge.to.trim(), normalizedClaimKey(edge.claimKey), edge.relation].join("\u0000");
    byFrame.set(key, edge);
  }
  return [...byFrame.values()];
}

function dependencyReferenceAllowed(
  edge: ContinuityAnswer["dependencies"][number],
  reference: EvidenceReference,
  chunk: EvidenceChunk,
): boolean {
  if (edge.status === "proposed") return reference.use !== "challenge";
  if (!edge.claimKey.trim() || normalizedClaimKey(chunk.claimKey ?? "") !== normalizedClaimKey(edge.claimKey)) return false;
  if (reference.claimKind !== edge.claimKind) return false;
  if (edge.status === "established" && chunk.polarity !== "positive") return false;
  const allowedByRelation: Record<ContinuityAnswer["dependencies"][number]["relation"], ClaimKind[]> = {
    requires: ["normative", "configured", "implemented", "tested", "observed", "causal"],
    causes: ["configured", "implemented", "tested", "observed", "causal"],
    prevents: ["normative", "configured", "implemented", "tested", "observed", "causal"],
    supersedes: ["normative", "configured", "implemented", "observed", "historical"],
    reveals: ["identity", "normative", "observed", "causal", "historical"],
  };
  return allowedByRelation[edge.relation].includes(edge.claimKind);
}

function addConflictEvidenceReferences(
  existing: EvidenceReference[],
  chunks: EvidenceChunk[],
  claimKind: ClaimKind,
  claimKey: string,
  policy: AuthorityPolicy,
): EvidenceReference[] {
  const result = [...existing];
  const cited = new Set(result.map((reference) => reference.evidenceId));
  for (const chunk of chunks) {
    if (cited.has(chunk.id)) continue;
    const use: CitationUse = chunk.polarity === "negative" ? "challenge" : "establish";
    if (!citationUseAllowed(chunk, claimKind, use, policy)) continue;
    const boundary = assertionBoundaryFor(chunk);
    result.push({
      evidenceId: chunk.id,
      sourceId: chunk.sourceId,
      locator: chunk.locator,
      stance: chunk.polarity === "negative" ? "opposes" : "supports",
      claimKind,
      use,
      supports: `The source records the ${chunk.polarity ?? "stated"} side of ${claimKey}.`,
      assertionScope: boundary.scope,
      assertionOwnerId: boundary.ownerId,
    });
    cited.add(chunk.id);
  }
  return result;
}
