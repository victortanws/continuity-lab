import {
  AUTHORITY_ROUTER_VERSION,
  type AnalysisRoute,
  type AnswerObligation,
  type ContinuityAnswer,
  type EvidenceChunk,
  type QueryRequest,
  type TrustedReachability,
} from "./contracts";

export type ObligationResult = {
  obligationId: string;
  status: "satisfied" | "repaired" | "unresolved" | "not_applicable";
  reason: string;
};

/**
 * Compile the task contract before drafting. The list is intentionally based
 * on operations and claim planes, never on project names or benchmark facts.
 */
export function compileAnswerObligations(
  request: QueryRequest,
  route: AnalysisRoute,
  evidence: EvidenceChunk[],
  trustedReachability?: TrustedReachability | null,
): AnswerObligation[] {
  const truthTarget = request.truthTarget ?? "project_truth";
  const entityEvidenceIds = evidence
    .filter((item) => item.claimKind === "identity" || item.claimKinds?.includes("identity") || item.entityCandidates?.length)
    .map((item) => item.id);
  const targetClaimKeys = [...new Set([
    ...(request.targetClaimKeys ?? []),
    ...(trustedReachability?.targetClaimKeys ?? []),
  ].map(normalizedToken).filter(Boolean))];
  const obligationEvidenceIds = [...new Set(trustedReachability?.obligations?.flatMap((item) => item.evidenceIds) ?? [])];
  const full = route.presentationDepth === "full";
  const proof = route.proofContract;
  const obligations: AnswerObligation[] = [
    obligation("direct_answer", true, "answer", "Answer the current question before optional audit detail.", route.claimKinds),
    obligation("truth_and_verdict", true, "answer", "Keep answer support separate from the proposition's truth state.", route.claimKinds),
    obligation(
      "evidence_world",
      true,
      truthTarget === "project_truth" && !full ? "receipt" : "answer",
      `Evaluate the proposition in the ${truthTarget.replaceAll("_", " ")} evidence world.`,
      route.claimKinds,
    ),
    obligation("decisive_evidence", true, "answer", "Cite only evidence that materially supports, opposes, or bounds the answer.", route.claimKinds),
    obligation(
      "claim_boundary",
      true,
      full ? "answer" : "receipt",
      "Preserve the exact identity, authority, temporal, and outcome boundary of every visible claim.",
      route.claimKinds,
      targetClaimKeys,
    ),
  ];

  // A direct positive lookup needs a decisive citation, not an exhaustive
  // audit of everything that was not retrieved. Closure becomes material for
  // negative/exhaustive, causal, scoped-authority, and change questions.
  if (!proof || proof.closureDemand !== "local") {
    obligations.push(obligation(
      "coverage_closure",
      true,
      route.coverage.closure === "closed" && !full ? "receipt" : "answer",
      "Report evidence coverage independently from source authority or proposition status.",
      route.claimKinds,
    ));
  }

  if (route.claimKinds.includes("identity") || entityEvidenceIds.length) {
    obligations.push(obligation(
      "entity_resolution",
      true,
      "answer",
      "Resolve, preserve as candidates, or explicitly leave ambiguous every material referent.",
      ["identity"],
      [],
      entityEvidenceIds,
    ));
  }

  if (proof?.dependenciesRequired || (!proof && route.mode !== "answer_question") || targetClaimKeys.length || trustedReachability?.obligations?.length) {
    obligations.push(obligation(
      "dependency_inventory",
      true,
      "answer",
      "Preserve every server-owned prerequisite and do not add explanatory pseudo-dependencies.",
      ["causal"],
      targetClaimKeys,
      obligationEvidenceIds,
    ));
  }

  if (proof?.transitionCertificateRequired || (!proof && route.mode === "trace_dependencies") || targetClaimKeys.length) {
    obligations.push(obligation(
      "reachability_certificate",
      true,
      "answer",
      "Use a typed source, arithmetic, or exhaustive-graph certificate; otherwise keep reachability unknown.",
      ["causal"],
      targetClaimKeys,
      trustedReachability?.certificate?.evidenceIds ?? [],
    ));
  }

  if (route.mode === "evaluate_change" || request.proposedChange?.trim()) {
    obligations.push(
      obligation("proposal_separation", true, "answer", "Keep the requested possibility provisional until it is approved.", ["normative", "causal"]),
      obligation("downstream_effects", true, "answer", "Expose material consumers, validation work, and consequences of the proposed change.", ["causal"]),
    );
  }

  return obligations;
}

export function auditAnswerObligations(
  answer: ContinuityAnswer,
  route: AnalysisRoute,
  trustedReachability?: TrustedReachability | null,
): ObligationResult[] {
  return (route.answerObligations ?? []).map((item): ObligationResult => {
    switch (item.kind) {
      case "direct_answer":
        return result(item, Boolean(answer.answer.trim()), "The answer field is populated.", "No direct answer survived validation.");
      case "truth_and_verdict":
        return result(item, Boolean(answer.verdict && answer.truthStatus), "Verdict and truth status are explicit.", "Verdict or truth status is absent.");
      case "evidence_world": {
        const target = route.truthTarget ?? "project_truth";
        const sourceOnly = answer.conclusions.length > 0
          && answer.conclusions.every((claim) => claim.assertionScope === "source_assertion");
        const valid = target !== "packet_assertion" || answer.truthStatus === "source_assertion"
          || answer.verdict === "INSUFFICIENT_EVIDENCE" || sourceOnly;
        return result(item, valid, `The answer is calibrated to ${target}.`, "Packet assertions were presented as broader project or observed truth.");
      }
      case "decisive_evidence": {
        const calibratedWithoutSupport = ["INSUFFICIENT_EVIDENCE", "PROPOSAL"].includes(answer.verdict);
        return result(item, answer.evidence.length > 0 || calibratedWithoutSupport, "Decisive citations or an explicit evidence limitation are present.", "An evidentiary verdict has no admitted citation.");
      }
      case "entity_resolution": {
        const unknownIdentity = answer.analysisChecks.some((check) => check.check === "identity_scope" && check.status === "unknown");
        return result(item, answer.entities.length > 0 || unknownIdentity || answer.verdict === "INSUFFICIENT_EVIDENCE", "Material identity is resolved or explicitly unresolved.", "A material identity obligation disappeared from the projection.");
      }
      case "claim_boundary": {
        const boundaryUnknown = answer.analysisChecks.some((check) => check.check === "claim_boundary" && check.status === "unknown");
        return result(item, answer.conclusions.length > 0 || boundaryUnknown || ["INSUFFICIENT_EVIDENCE", "PROPOSAL"].includes(answer.verdict), "Claim boundaries are typed or explicitly unknown.", "No typed conclusion or boundary limitation remains.");
      }
      case "coverage_closure":
        return result(item, Boolean(route.coverage.closure), `Coverage is ${route.coverage.closure}.`, "Coverage closure is missing.");
      case "dependency_inventory": {
        const expected = trustedReachability?.obligations ?? [];
        if (!expected.length && !item.targetClaimKeys.length) {
          return { obligationId: item.id, status: "not_applicable", reason: "No trusted dependency catalog or target key was supplied." };
        }
        const present = new Set(answer.dependencies.map((edge) => [
          normalizedToken(edge.claimKey), edge.relation, edge.from.trim(), edge.to.trim(),
        ].join("|")));
        const missing = expected.filter((edge) => !present.has([
          normalizedToken(edge.claimKey), edge.relation, edge.from.trim(), edge.to.trim(),
        ].join("|")));
        return result(item, missing.length === 0 && (expected.length > 0 || answer.dependencies.length > 0), "All available dependency obligations are represented.", `${missing.length || "The"} required dependency obligation${missing.length === 1 ? " is" : "s are"} unresolved.`);
      }
      case "reachability_certificate": {
        if (!trustedReachability) {
          const calibrated = ["unknown", "not_evaluated"].includes(answer.reachability.status);
          return result(item, calibrated, "No trusted proof was supplied and reachability remains unknown.", "Reachability was asserted without a trusted proof.");
        }
        const certificate = trustedReachability.certificate;
        const safeMigration = !certificate && trustedReachability.status === "unknown";
        return result(item, Boolean(certificate?.summary.trim()) || safeMigration, certificate ? `Reachability uses a ${certificate.kind.replaceAll("_", " ")} certificate.` : "Legacy adapter returned an explicit unknown.", "A deterministic reachability result lacks a v3.3 certificate.");
      }
      case "proposal_separation":
        return result(item, answer.verdict === "PROPOSAL" && Boolean(answer.proposal), "The change remains a typed proposal.", "The proposed change was not kept on a separate provisional track.");
      case "downstream_effects":
        return result(item, Boolean(answer.dependencies.length || answer.proposal?.downstreamRisks.length), "Downstream dependencies or risks are explicit.", "No downstream consumer or risk survived validation.");
      default:
        return { obligationId: item.id, status: "unresolved", reason: "Unknown answer obligation kind." };
    }
  });
}

export function routerReceiptVersion(): string {
  return AUTHORITY_ROUTER_VERSION;
}

function obligation(
  kind: AnswerObligation["kind"],
  required: boolean,
  visibility: AnswerObligation["visibility"],
  rationale: string,
  claimKinds: AnswerObligation["claimKinds"],
  targetClaimKeys: string[] = [],
  evidenceIds: string[] = [],
): AnswerObligation {
  return {
    id: `answer:${kind}`,
    kind,
    required,
    visibility,
    rationale,
    claimKinds: [...new Set(claimKinds)],
    targetClaimKeys: [...new Set(targetClaimKeys)],
    evidenceIds: [...new Set(evidenceIds)],
  };
}

function result(
  item: AnswerObligation,
  passed: boolean,
  success: string,
  failure: string,
): ObligationResult {
  return {
    obligationId: item.id,
    status: passed ? "satisfied" : "unresolved",
    reason: passed ? success : failure,
  };
}

function normalizedToken(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}
