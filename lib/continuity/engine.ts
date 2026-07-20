import type {
  AnalysisRoute, AuthorityPolicy, ContinuityAnswer, ContinuityReasoner,
  EvidenceChunk, EvidenceRetriever, QueryRequest, QueryResult,
} from "./contracts";
import { DEFAULT_AUTHORITY_POLICY } from "./policy/default";
import { authorityWeight, routeEvidence } from "./routing/authority-router";

export class ContinuityEngine {
  constructor(
    private readonly retriever: EvidenceRetriever,
    private readonly reasoner: ContinuityReasoner,
    private readonly authorityPolicy: AuthorityPolicy = DEFAULT_AUTHORITY_POLICY,
  ) {}

  async query(request: QueryRequest): Promise<QueryResult> {
    const question = request.question.trim();
    if (!question) throw new ContinuityInputError("question is required");
    if (!request.projectId.trim()) throw new ContinuityInputError("projectId is required");

    const normalizedRequest = { ...request, question };
    const rawEvidence = await this.retriever.retrieve(normalizedRequest);
    const routing = routeEvidence(rawEvidence, normalizedRequest, this.authorityPolicy);
    routing.evidence = routing.evidence.map((chunk) => ({
      ...chunk,
      flags: detectEvidenceFlags(chunk.text, chunk.flags),
    }));
    const proposed = await this.reasoner.answer(normalizedRequest, routing.evidence, routing.route);
    const validation = validateAnswer(
      proposed,
      routing.evidence,
      normalizedRequest,
      routing.route,
      this.authorityPolicy,
    );

    return {
      mode: this.reasoner.mode,
      model: this.reasoner.model,
      answer: validation.answer,
      retrievedEvidence: routing.evidence,
      routing: routing.route,
      validation: { repaired: validation.issues.length > 0, issues: validation.issues },
    };
  }
}

export class CompositeRetriever implements EvidenceRetriever {
  constructor(private readonly retrievers: EvidenceRetriever[]) {}

  async retrieve(request: QueryRequest): Promise<EvidenceChunk[]> {
    const results = await Promise.all(this.retrievers.map((retriever) => retriever.retrieve(request)));
    return results.flat();
  }
}

export class ContinuityInputError extends Error {}

export function prepareEvidence(
  chunks: EvidenceChunk[],
  projectId: string,
  storyPosition?: number,
  policy: AuthorityPolicy = DEFAULT_AUTHORITY_POLICY,
): EvidenceChunk[] {
  return routeEvidence(chunks, {
    projectId,
    question: "Prepare an evidence projection.",
    storyPosition,
  }, policy).evidence.map((chunk) => ({
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
): { answer: ContinuityAnswer; issues: string[] } {
  const issues: string[] = [];
  const byId = new Map(evidence.map((item) => [item.id, item]));
  const validEvidence = proposed.evidence.flatMap((reference) => {
    const chunk = byId.get(reference.evidenceId);
    if (!chunk || chunk.sourceId !== reference.sourceId) {
      issues.push(`Removed unknown or mismatched citation: ${reference.evidenceId}`);
      return [];
    }
    // The model selects an evidence ID and explains its use. The server owns
    // the source and locator so a generated answer cannot forge a citation.
    return [{ ...reference, sourceId: chunk.sourceId, locator: chunk.locator }];
  });

  let verdict = proposed.verdict;
  let truthStatus = proposed.truthStatus;
  let confidence = proposed.confidence;
  const conflicts = [...proposed.conflicts];
  const citedChunks = validEvidence.map((reference) => byId.get(reference.evidenceId)!).filter(Boolean);

  const claimGroups = new Map<string, EvidenceChunk[]>();
  for (const chunk of evidence) {
    if (!chunk.claimKey || !chunk.polarity) continue;
    const group = claimGroups.get(chunk.claimKey) ?? [];
    group.push(chunk);
    claimGroups.set(chunk.claimKey, group);
  }
  const contradictoryClaims = [...claimGroups.entries()].flatMap(([claimKey, chunks]) => {
    const highestWeight = Math.max(...chunks.map((chunk) =>
      chunk.authorityRank ?? authorityWeight(chunk.authority, policy)));
    const effective = chunks.filter((chunk) =>
      (chunk.authorityRank ?? authorityWeight(chunk.authority, policy)) === highestWeight);
    return new Set(effective.map((chunk) => chunk.polarity)).size > 1 ? [[claimKey, effective] as const] : [];
  });
  if (contradictoryClaims.length && verdict !== "PROPOSAL") {
    verdict = "CONFLICT";
    truthStatus = "conflicted";
    confidence = confidence === "high" ? "medium" : confidence;
    issues.push("Exposed an active contradiction that the proposed answer did not resolve");
    for (const [claimKey, chunks] of contradictoryClaims) {
      conflicts.push({
        type: "source_contradiction",
        statement: `Effective sources disagree about ${claimKey}`,
        severity: "high",
        evidenceIds: chunks.map((chunk) => chunk.id),
      });
    }
  }

  const evidentiaryVerdicts = new Set(["SUPPORTED", "CONFLICT", "AMBIGUOUS", "UNREACHABLE"]);
  if (evidentiaryVerdicts.has(verdict) && validEvidence.length === 0) {
    verdict = "INSUFFICIENT_EVIDENCE";
    truthStatus = "unknown";
    confidence = "low";
    issues.push("Downgraded evidentiary verdict because no valid citation remained");
  }

  if (proposed.answer.toLowerCase().includes("does not exist") || proposed.answer.toLowerCase().includes("never occurs")) {
    const hasClosedWorldEvidence = citedChunks.some((chunk) => chunk.closedWorld);
    if (!hasClosedWorldEvidence && verdict === "SUPPORTED") {
      verdict = "INSUFFICIENT_EVIDENCE";
      truthStatus = "unknown";
      confidence = "low";
      issues.push("Rejected proof-by-absence outside a closed-world source");
    }
  }

  let reachability = proposed.reachability;
  if (verdict === "UNREACHABLE") {
    const hasClosedWorldEvidence = citedChunks.some((chunk) => chunk.closedWorld);
    const trustedCoverage = route
      ? route.coverage.trustedComplete
      : Boolean(request?.coverage?.complete && hasClosedWorldEvidence);
    const scoped = reachability.status === "unreachable_within_scope"
      && reachability.completenessScope.trim().length > 0
      && reachability.blockers.length > 0
      && trustedCoverage
      && hasClosedWorldEvidence;
    if (!scoped) {
      verdict = "INSUFFICIENT_EVIDENCE";
      truthStatus = "unknown";
      confidence = "low";
      reachability = {
        ...reachability,
        status: "unknown",
        blockers: reachability.blockers.length ? reachability.blockers : ["The available causal coverage is not complete enough to prove unreachability."],
      };
      issues.push("Downgraded UNREACHABLE because trusted closed-world coverage and a concrete blocker were not both established");
    }
  }

  const expectedTruthStatus: Partial<Record<ContinuityAnswer["verdict"], ContinuityAnswer["truthStatus"]>> = {
    CONFLICT: "conflicted",
    AMBIGUOUS: "ambiguous",
    INSUFFICIENT_EVIDENCE: "unknown",
  };
  const expected = expectedTruthStatus[verdict];
  if (expected && truthStatus !== expected) {
    truthStatus = expected;
    issues.push(`Aligned truth status with ${verdict}`);
  }

  const dependencies = proposed.dependencies.map((edge) => {
    const validIds = edge.evidenceIds.filter((id) => byId.has(id));
    if (validIds.length !== edge.evidenceIds.length) issues.push(`Removed unknown dependency evidence for ${edge.from} → ${edge.to}`);
    return { ...edge, evidenceIds: validIds };
  });

  const validatedConflicts = conflicts.map((conflict) => {
    const validIds = conflict.evidenceIds.filter((id) => byId.has(id));
    if (validIds.length !== conflict.evidenceIds.length) issues.push(`Removed unknown conflict evidence for ${conflict.type}`);
    return { ...conflict, evidenceIds: validIds };
  });

  const proposal = proposed.proposal && proposed.proposal.assumptions.length === 0
    ? { ...proposed.proposal, assumptions: ["No supporting assumption was supplied; treat this route as provisional."] }
    : proposed.proposal;
  if (proposed.proposal && proposed.proposal.assumptions.length === 0) issues.push("Added an explicit provisional assumption to the proposal");

  return {
    issues,
    answer: {
      ...proposed,
      version: "continuity.answer.v1",
      verdict,
      truthStatus,
      projectRevision: proposed.projectRevision.trim() || "unversioned",
      reachability,
      confidence,
      evidence: validEvidence,
      conflicts: validatedConflicts,
      dependencies,
      proposal,
      caveats: [...proposed.caveats, ...issues],
    },
  };
}

export function detectEvidenceFlags(text: string, existing: string[] = []): string[] {
  const flags = new Set(existing);
  if (/ignore (all|any|the) (previous|prior|system) instructions|you are now|system prompt/i.test(text)) {
    flags.add("possible_prompt_injection");
  }
  return [...flags];
}
