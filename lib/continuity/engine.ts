import type {
  ContinuityAnswer, ContinuityReasoner, EvidenceChunk, EvidenceRetriever,
  QueryRequest, QueryResult,
} from "./contracts";

const AUTHORITY_WEIGHT = {
  immutable: 6,
  retcon: 5,
  canon: 4,
  production: 3,
  proposal: 2,
  reference: 1,
} as const;

export class ContinuityEngine {
  constructor(
    private readonly retriever: EvidenceRetriever,
    private readonly reasoner: ContinuityReasoner,
  ) {}

  async query(request: QueryRequest): Promise<QueryResult> {
    const question = request.question.trim();
    if (!question) throw new ContinuityInputError("question is required");
    if (!request.projectId.trim()) throw new ContinuityInputError("projectId is required");

    const rawEvidence = await this.retriever.retrieve({ ...request, question });
    const evidence = prepareEvidence(rawEvidence, request.projectId, request.storyPosition);
    const proposed = await this.reasoner.answer({ ...request, question }, evidence);
    const validation = validateAnswer(proposed, evidence);

    return {
      mode: this.reasoner.mode,
      model: this.reasoner.model,
      answer: validation.answer,
      retrievedEvidence: evidence,
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

export function prepareEvidence(chunks: EvidenceChunk[], projectId: string, storyPosition?: number): EvidenceChunk[] {
  const seen = new Set<string>();
  const sameProject = chunks.filter((chunk) => chunk.projectId === projectId);
  const deduplicated = sameProject.filter((chunk) => {
    if (seen.has(chunk.id)) return false;
    seen.add(chunk.id);
    return true;
  });

  const temporallyValid = storyPosition === undefined
    ? deduplicated
    : deduplicated.filter((chunk) =>
      (chunk.validFromOrder == null || chunk.validFromOrder <= storyPosition)
      && (chunk.validToOrder == null || storyPosition <= chunk.validToOrder));

  const superseded = new Set(
    temporallyValid
      .filter((chunk) => chunk.authority === "retcon" && chunk.supersedesSourceId)
      .map((chunk) => chunk.supersedesSourceId as string),
  );

  return temporallyValid
    .filter((chunk) => !superseded.has(chunk.sourceId))
    .map((chunk) => ({ ...chunk, flags: detectEvidenceFlags(chunk.text, chunk.flags) }))
    .sort((a, b) => {
      const authority = AUTHORITY_WEIGHT[b.authority] - AUTHORITY_WEIGHT[a.authority];
      return authority || b.score - a.score || a.id.localeCompare(b.id);
    })
    .slice(0, 16);
}

export function validateAnswer(
  proposed: ContinuityAnswer,
  evidence: EvidenceChunk[],
): { answer: ContinuityAnswer; issues: string[] } {
  const issues: string[] = [];
  const byId = new Map(evidence.map((item) => [item.id, item]));
  const validEvidence = proposed.evidence.filter((reference) => {
    const chunk = byId.get(reference.evidenceId);
    if (!chunk || chunk.sourceId !== reference.sourceId) {
      issues.push(`Removed unknown or mismatched citation: ${reference.evidenceId}`);
      return false;
    }
    return true;
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
    const highestWeight = Math.max(...chunks.map((chunk) => AUTHORITY_WEIGHT[chunk.authority]));
    const effective = chunks.filter((chunk) => AUTHORITY_WEIGHT[chunk.authority] === highestWeight);
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
    const scoped = reachability.status === "unreachable_within_scope"
      && reachability.completenessScope.trim().length > 0
      && reachability.blockers.length > 0;
    if (!scoped) {
      verdict = "INSUFFICIENT_EVIDENCE";
      truthStatus = "unknown";
      confidence = "low";
      reachability = {
        ...reachability,
        status: "unknown",
        blockers: reachability.blockers.length ? reachability.blockers : ["The available causal coverage is not complete enough to prove unreachability."],
      };
      issues.push("Downgraded UNREACHABLE because the answer did not establish a complete causal scope and blocker");
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
      conflicts,
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
