import type { DomainProfileProposal } from "./domain-profile";
import type { ContinuityEntityPackage, EvidenceBearingEntity } from "./entity-package";
import type { IdentityLinkPackage } from "./identity-link-package";
import type { McpContextPacket } from "./mcp-context";

export const REVIEWED_KNOWLEDGE_VERSION = "continuity.reviewed-knowledge.v1" as const;
export const REVIEWED_KNOWLEDGE_LIMITS = Object.freeze({
  maxIdentityDecisions: 128,
  maxParameterDecisions: 128,
  maxValidatorDecisions: 32,
} as const);

export type IdentityDecisionOutcome =
  | "accept_same_entity"
  | "accept_alias"
  | "accept_misspelling"
  | "accept_former_name"
  | "accept_title"
  | "accept_translation"
  | "mark_related"
  | "keep_distinct"
  | "reject_candidate";

export type IdentityDecisionBasis = "human_review" | "explicit_source_statement" | "parser_binding";

export type ReviewedKnowledgeInput = {
  reviewId: string;
  projectScope: string;
  revision: string;
  reviewerRole: "director" | "maintainer" | "editor" | "domain_owner";
  identityPackageFingerprint: string;
  domainProfileFingerprint: string;
  identityDecisions?: Array<{
    candidateLinkId: string;
    outcome: IdentityDecisionOutcome;
    basis: IdentityDecisionBasis;
    canonicalEntityId?: string;
    evidenceIds?: string[];
    rationale: string;
  }>;
  parameterDecisions?: Array<{
    parameterId: string;
    decision: "approve" | "reject";
    rationale: string;
  }>;
  validatorDecisions?: Array<{
    validatorId: string;
    decision: "approve" | "reject";
    rationale: string;
  }>;
  activateDomainProfile?: boolean;
};

type InvalidDecision = {
  area: "review" | "identity" | "parameter" | "validator";
  referenceId: string;
  code: string;
  message: string;
};

type AcceptedIdentityDecision = {
  id: string;
  candidateLinkId: string;
  outcome: IdentityDecisionOutcome;
  basis: IdentityDecisionBasis;
  canonicalEntityId: string | null;
  memberEntityIds: string[];
  sourceForms: string[];
  evidenceIds: string[];
  rationale: string;
  status: "accepted";
};

export type ReviewedKnowledgeReceipt = {
  version: typeof REVIEWED_KNOWLEDGE_VERSION;
  receiptFingerprint: string;
  status: "not_submitted" | "accepted" | "partially_accepted" | "rejected";
  review: {
    reviewId: string | null;
    projectScope: string | null;
    revision: string | null;
    reviewerRole: ReviewedKnowledgeInput["reviewerRole"] | null;
    authorityKind: "none" | "caller_attested_review";
    authenticated: false;
    projectCanon: false;
  };
  bindings: {
    identityPackageFingerprint: string;
    identityBindingValid: boolean;
    domainProfileFingerprint: string;
    domainBindingValid: boolean;
  };
  identityLedger: {
    exactSourceFormsPreserved: true;
    acceptedDecisions: AcceptedIdentityDecision[];
    canonicalGroups: Array<{
      canonicalEntityId: string;
      memberEntityIds: string[];
      canonicalName: string;
      acceptedForms: string[];
      decisionIds: string[];
      projectTruth: false;
    }>;
    relatedCandidateIds: string[];
    distinctCandidateIds: string[];
    rejectedCandidateIds: string[];
    unresolvedCandidateIds: string[];
  };
  domainConfiguration: {
    requestedActivation: boolean;
    activated: boolean;
    approvedParameters: Array<Omit<DomainProfileProposal["candidateParameters"][number], "status" | "activation"> & {
      status: "approved";
      activation: "active_in_caller_attested_profile";
    }>;
    rejectedParameterIds: string[];
    approvedValidators: Array<Omit<DomainProfileProposal["validatorCandidates"][number], "status"> & { status: "approved" }>;
    rejectedValidatorIds: string[];
    projectTruth: false;
  };
  invalidDecisions: InvalidDecision[];
  qa: {
    safeForAutomatedIdentityApplication: boolean;
    safeForValidatorExecution: boolean;
    readyForCallerRequestedProjection: boolean;
    readyForCallerRequestedValidation: boolean;
    decisionCount: number;
    invalidDecisionCount: number;
    diagnostics: string[];
  };
};

const encoder = new TextEncoder();

function fingerprint(value: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of encoder.encode(value)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

function stableId(prefix: string, value: string): string {
  return `${prefix}-${fingerprint(value)}`;
}

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.normalize("NFKC").trim().slice(0, max) : "";
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function profileForEntity(entity: EvidenceBearingEntity, packet: McpContextPacket): "natural_language" | "case_sensitive_symbol" | "opaque_identifier" {
  const profiles = entity.mentionIds.flatMap((mentionId) => {
    const mention = packet.entityCandidates.find((candidate) => candidate.id === mentionId);
    return mention ? [mention.identityProfile] : [];
  });
  return profiles.includes("opaque_identifier") ? "opaque_identifier"
    : profiles.includes("case_sensitive_symbol") ? "case_sensitive_symbol"
      : "natural_language";
}

function isMergeOutcome(outcome: IdentityDecisionOutcome): boolean {
  return outcome.startsWith("accept_");
}

function emptyReceipt(identityLinks: IdentityLinkPackage, domainProfile: DomainProfileProposal): ReviewedKnowledgeReceipt {
  const body: Omit<ReviewedKnowledgeReceipt, "receiptFingerprint"> = {
    version: REVIEWED_KNOWLEDGE_VERSION,
    status: "not_submitted",
    review: {
      reviewId: null, projectScope: null, revision: null, reviewerRole: null,
      authorityKind: "none", authenticated: false, projectCanon: false,
    },
    bindings: {
      identityPackageFingerprint: identityLinks.packageFingerprint,
      identityBindingValid: false,
      domainProfileFingerprint: domainProfile.profileFingerprint,
      domainBindingValid: false,
    },
    identityLedger: {
      exactSourceFormsPreserved: true,
      acceptedDecisions: [], canonicalGroups: [], relatedCandidateIds: [], distinctCandidateIds: [], rejectedCandidateIds: [],
      unresolvedCandidateIds: identityLinks.candidateLinks.map((candidate) => candidate.id).sort(),
    },
    domainConfiguration: {
      requestedActivation: false, activated: false, approvedParameters: [], rejectedParameterIds: [],
      approvedValidators: [], rejectedValidatorIds: [], projectTruth: false,
    },
    invalidDecisions: [],
    qa: {
      safeForAutomatedIdentityApplication: false, safeForValidatorExecution: false,
      readyForCallerRequestedProjection: false, readyForCallerRequestedValidation: false,
      decisionCount: 0, invalidDecisionCount: 0,
      diagnostics: ["No reviewed decision envelope was submitted; all identity links and domain parameters remain proposals."],
    },
  };
  return { ...body, receiptFingerprint: `fnv64:${fingerprint(JSON.stringify(body))}` };
}

function canonicalGroups(
  decisions: AcceptedIdentityDecision[],
  entityPackage: ContinuityEntityPackage,
): ReviewedKnowledgeReceipt["identityLedger"]["canonicalGroups"] {
  const merges = decisions.filter((decision) => isMergeOutcome(decision.outcome));
  const parent = new Map<string, string>();
  const find = (value: string): string => {
    const current = parent.get(value) ?? value;
    if (current === value) return value;
    const root = find(current);
    parent.set(value, root);
    return root;
  };
  const join = (left: string, right: string) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot === rightRoot) return;
    if (leftRoot.localeCompare(rightRoot) <= 0) parent.set(rightRoot, leftRoot);
    else parent.set(leftRoot, rightRoot);
  };
  for (const decision of merges) join(decision.memberEntityIds[0], decision.memberEntityIds[1]);
  const components = new Map<string, string[]>();
  for (const id of unique(merges.flatMap((decision) => decision.memberEntityIds))) {
    const root = find(id);
    components.set(root, [...(components.get(root) ?? []), id].sort());
  }
  return [...components.values()].filter((members) => members.length > 1).map((members) => {
    const relevant = merges.filter((decision) => decision.memberEntityIds.some((id) => members.includes(id)));
    const selected = unique(relevant.flatMap((decision) => decision.canonicalEntityId ? [decision.canonicalEntityId] : []));
    const canonicalEntityId = selected[0] ?? members[0];
    const entity = entityPackage.entities.find((candidate) => candidate.id === canonicalEntityId);
    return {
      canonicalEntityId,
      memberEntityIds: members,
      canonicalName: entity?.canonicalName ?? canonicalEntityId,
      acceptedForms: unique(members.flatMap((id) => entityPackage.entities.find((candidate) => candidate.id === id)?.aliases ?? [])),
      decisionIds: relevant.map((decision) => decision.id).sort(),
      projectTruth: false as const,
    };
  }).sort((left, right) => left.canonicalEntityId.localeCompare(right.canonicalEntityId));
}

export function buildReviewedKnowledgeReceipt(
  packet: McpContextPacket,
  entityPackage: ContinuityEntityPackage,
  identityLinks: IdentityLinkPackage,
  domainProfile: DomainProfileProposal,
  input?: ReviewedKnowledgeInput | null,
): ReviewedKnowledgeReceipt {
  if (!input || typeof input !== "object") return emptyReceipt(identityLinks, domainProfile);

  const reviewId = clean(input.reviewId, 128);
  const projectScope = clean(input.projectScope, 240);
  const revision = clean(input.revision, 128);
  const role = ["director", "maintainer", "editor", "domain_owner"].includes(input.reviewerRole)
    ? input.reviewerRole : null;
  const identityBindingValid = input.identityPackageFingerprint === identityLinks.packageFingerprint;
  const domainBindingValid = input.domainProfileFingerprint === domainProfile.profileFingerprint;
  const invalid: InvalidDecision[] = [];
  if (!reviewId || !projectScope || !revision || !role) {
    invalid.push({ area: "review", referenceId: reviewId || "missing", code: "invalid_review_identity", message: "Review ID, project scope, revision, and reviewer role are required." });
  }
  if (!identityBindingValid) invalid.push({ area: "review", referenceId: reviewId || "missing", code: "identity_fingerprint_mismatch", message: "The identity decision envelope does not bind to this identity-link package." });
  if (!domainBindingValid) invalid.push({ area: "review", referenceId: reviewId || "missing", code: "domain_fingerprint_mismatch", message: "The domain decisions do not bind to this domain-profile proposal." });

  const accepted: AcceptedIdentityDecision[] = [];
  const related: string[] = [];
  const distinct: string[] = [];
  const rejected: string[] = [];
  const seenIdentity = new Set<string>();
  const identityInputs = Array.isArray(input.identityDecisions)
    ? input.identityDecisions.slice(0, REVIEWED_KNOWLEDGE_LIMITS.maxIdentityDecisions) : [];
  if ((input.identityDecisions?.length ?? 0) > identityInputs.length) {
    invalid.push({ area: "identity", referenceId: "limit", code: "identity_decision_limit", message: `At most ${REVIEWED_KNOWLEDGE_LIMITS.maxIdentityDecisions} identity decisions are accepted.` });
  }
  for (const decision of identityInputs) {
    const candidateId = clean(decision?.candidateLinkId, 128);
    const candidate = identityLinks.candidateLinks.find((link) => link.id === candidateId);
    if (!identityBindingValid || !candidate) {
      invalid.push({ area: "identity", referenceId: candidateId || "missing", code: "unknown_identity_candidate", message: "The decision does not reference a candidate in the bound identity-link package." });
      continue;
    }
    if (seenIdentity.has(candidateId)) {
      invalid.push({ area: "identity", referenceId: candidateId, code: "duplicate_identity_decision", message: "A candidate may receive only one decision per review." });
      continue;
    }
    seenIdentity.add(candidateId);
    const outcome = decision.outcome;
    const basis = decision.basis;
    const rationale = clean(decision.rationale, 1_000);
    if (!rationale || !["human_review", "explicit_source_statement", "parser_binding"].includes(basis)
      || !["accept_same_entity", "accept_alias", "accept_misspelling", "accept_former_name", "accept_title", "accept_translation", "mark_related", "keep_distinct", "reject_candidate"].includes(outcome)) {
      invalid.push({ area: "identity", referenceId: candidateId, code: "invalid_identity_decision", message: "The decision outcome, basis, and rationale must use the reviewed vocabulary." });
      continue;
    }
    if (outcome === "mark_related") { related.push(candidateId); continue; }
    if (outcome === "keep_distinct") { distinct.push(candidateId); continue; }
    if (outcome === "reject_candidate") { rejected.push(candidateId); continue; }

    const endpoints = [candidate.fromEntityId, candidate.toEntityId];
    const canonicalEntityId = clean(decision.canonicalEntityId, 128);
    if (!endpoints.includes(canonicalEntityId)) {
      invalid.push({ area: "identity", referenceId: candidateId, code: "invalid_canonical_entity", message: "An accepted identity decision must select one candidate endpoint as canonical." });
      continue;
    }
    if (candidate.relation === "surface_collision" || candidate.relation === "cross_source_id_reuse") {
      invalid.push({ area: "identity", referenceId: candidateId, code: "identifier_collision_cannot_merge", message: "Different explicit identifiers cannot be merged by a lexical review decision." });
      continue;
    }
    const endpointEntities = endpoints.map((id) => entityPackage.entities.find((entity) => entity.id === id)).filter(Boolean) as EvidenceBearingEntity[];
    const profiles = endpointEntities.map((entity) => profileForEntity(entity, packet));
    if (profiles.some((profile) => profile !== "natural_language") && basis !== "parser_binding") {
      invalid.push({ area: "identity", referenceId: candidateId, code: "symbol_binding_evidence_required", message: "Case-sensitive symbols and opaque identifiers require parser-binding evidence before identity can be joined." });
      continue;
    }
    const evidenceIds = unique(Array.isArray(decision.evidenceIds)
      ? decision.evidenceIds.filter((value): value is string => typeof value === "string" && value.length > 0).slice(0, 32)
      : candidate.evidenceMentionIds);
    const allowedEvidenceIds = new Set([
      ...candidate.evidenceMentionIds,
      ...packet.claims.map((claim) => claim.id),
      ...packet.relations.map((relation) => relation.id),
    ]);
    if (evidenceIds.some((id) => !allowedEvidenceIds.has(id))) {
      invalid.push({ area: "identity", referenceId: candidateId, code: "unknown_identity_evidence", message: "Identity decision evidence must reference an exact accepted mention, claim, or relation in this packet." });
      continue;
    }
    if (basis === "explicit_source_statement" && !evidenceIds.some((id) => packet.claims.some((claim) => claim.id === id))) {
      invalid.push({ area: "identity", referenceId: candidateId, code: "explicit_statement_evidence_required", message: "An explicit-source-statement decision must cite an accepted exact-span claim." });
      continue;
    }
    accepted.push({
      id: stableId("decision", `${reviewId}\u0000${candidateId}\u0000${outcome}\u0000${canonicalEntityId}`),
      candidateLinkId: candidateId, outcome, basis, canonicalEntityId,
      memberEntityIds: endpoints.sort(), sourceForms: unique([candidate.fromSurfaceForm, candidate.toSurfaceForm]),
      evidenceIds, rationale, status: "accepted",
    });
  }

  const groups = canonicalGroups(accepted, entityPackage);
  for (const group of groups) {
    const selections = unique(accepted.filter((decision) => decision.memberEntityIds.some((id) => group.memberEntityIds.includes(id)))
      .flatMap((decision) => decision.canonicalEntityId ? [decision.canonicalEntityId] : []));
    if (selections.length > 1) {
      invalid.push({ area: "identity", referenceId: group.decisionIds.join(","), code: "conflicting_canonical_selection", message: "Connected identity decisions selected more than one canonical entity." });
    }
  }
  const conflictingIds = new Set(invalid.filter((item) => item.code === "conflicting_canonical_selection").flatMap((item) => item.referenceId.split(",")));
  const validAccepted = accepted.filter((decision) => !conflictingIds.has(decision.id));
  const validGroups = canonicalGroups(validAccepted, entityPackage);

  const parameterInputs = Array.isArray(input.parameterDecisions)
    ? input.parameterDecisions.slice(0, REVIEWED_KNOWLEDGE_LIMITS.maxParameterDecisions) : [];
  const validatorInputs = Array.isArray(input.validatorDecisions)
    ? input.validatorDecisions.slice(0, REVIEWED_KNOWLEDGE_LIMITS.maxValidatorDecisions) : [];
  const approvedParameters: ReviewedKnowledgeReceipt["domainConfiguration"]["approvedParameters"] = [];
  const rejectedParameterIds: string[] = [];
  const approvedValidators: ReviewedKnowledgeReceipt["domainConfiguration"]["approvedValidators"] = [];
  const rejectedValidatorIds: string[] = [];
  const seenParameters = new Set<string>();
  const seenValidators = new Set<string>();
  if ((input.parameterDecisions?.length ?? 0) > parameterInputs.length) invalid.push({ area: "parameter", referenceId: "limit", code: "parameter_decision_limit", message: "The parameter decision limit was exceeded." });
  if ((input.validatorDecisions?.length ?? 0) > validatorInputs.length) invalid.push({ area: "validator", referenceId: "limit", code: "validator_decision_limit", message: "The validator decision limit was exceeded." });
  for (const decision of parameterInputs) {
    const id = clean(decision?.parameterId, 128);
    const candidate = domainProfile.candidateParameters.find((parameter) => parameter.id === id);
    if (!domainBindingValid || !candidate || seenParameters.has(id) || !clean(decision.rationale, 1_000)) {
      invalid.push({ area: "parameter", referenceId: id || "missing", code: seenParameters.has(id) ? "duplicate_parameter_decision" : "invalid_parameter_decision", message: "The parameter decision must uniquely reference the bound proposal and include a rationale." });
      continue;
    }
    seenParameters.add(id);
    if (decision.decision === "approve") approvedParameters.push({ ...candidate, status: "approved", activation: "active_in_caller_attested_profile" });
    else if (decision.decision === "reject") rejectedParameterIds.push(id);
    else invalid.push({ area: "parameter", referenceId: id, code: "invalid_parameter_outcome", message: "Parameter decisions must approve or reject." });
  }
  for (const decision of validatorInputs) {
    const id = clean(decision?.validatorId, 128);
    const candidate = domainProfile.validatorCandidates.find((validator) => validator.id === id);
    if (!domainBindingValid || !candidate || seenValidators.has(id) || !clean(decision.rationale, 1_000)) {
      invalid.push({ area: "validator", referenceId: id || "missing", code: seenValidators.has(id) ? "duplicate_validator_decision" : "invalid_validator_decision", message: "The validator decision must uniquely reference the bound proposal and include a rationale." });
      continue;
    }
    seenValidators.add(id);
    if (decision.decision === "approve") approvedValidators.push({ ...candidate, status: "approved" });
    else if (decision.decision === "reject") rejectedValidatorIds.push(id);
    else invalid.push({ area: "validator", referenceId: id, code: "invalid_validator_outcome", message: "Validator decisions must approve or reject." });
  }
  const requestedActivation = input.activateDomainProfile === true;
  const domainInvalid = invalid.some((item) => item.area === "review" || item.area === "parameter" || item.area === "validator");
  const activated = requestedActivation && domainBindingValid && !domainInvalid
    && approvedParameters.length > 0 && approvedValidators.length > 0;
  if (requestedActivation && !activated) invalid.push({ area: "review", referenceId: reviewId || "missing", code: "domain_activation_requirements_unmet", message: "Activation requires valid bindings, no invalid domain decisions, and at least one approved parameter and validator." });

  const handledCandidates = new Set([...seenIdentity]);
  const decisionCount = identityInputs.length + parameterInputs.length + validatorInputs.length;
  const hasAcceptedMaterial = validAccepted.length + related.length + distinct.length + rejected.length
    + approvedParameters.length + rejectedParameterIds.length + approvedValidators.length + rejectedValidatorIds.length > 0;
  const status: ReviewedKnowledgeReceipt["status"] = invalid.length === 0 ? "accepted"
    : hasAcceptedMaterial ? "partially_accepted" : "rejected";
  const body: Omit<ReviewedKnowledgeReceipt, "receiptFingerprint"> = {
    version: REVIEWED_KNOWLEDGE_VERSION,
    status,
    review: {
      reviewId: reviewId || null, projectScope: projectScope || null, revision: revision || null, reviewerRole: role,
      authorityKind: "caller_attested_review", authenticated: false, projectCanon: false,
    },
    bindings: {
      identityPackageFingerprint: identityLinks.packageFingerprint, identityBindingValid,
      domainProfileFingerprint: domainProfile.profileFingerprint, domainBindingValid,
    },
    identityLedger: {
      exactSourceFormsPreserved: true,
      acceptedDecisions: validAccepted.sort((left, right) => left.id.localeCompare(right.id)),
      canonicalGroups: validGroups,
      relatedCandidateIds: unique(related), distinctCandidateIds: unique(distinct), rejectedCandidateIds: unique(rejected),
      unresolvedCandidateIds: identityLinks.candidateLinks.map((candidate) => candidate.id).filter((id) => !handledCandidates.has(id)).sort(),
    },
    domainConfiguration: {
      requestedActivation, activated,
      approvedParameters: approvedParameters.sort((left, right) => left.id.localeCompare(right.id)),
      rejectedParameterIds: unique(rejectedParameterIds),
      approvedValidators: approvedValidators.sort((left, right) => left.id.localeCompare(right.id)),
      rejectedValidatorIds: unique(rejectedValidatorIds), projectTruth: false,
    },
    invalidDecisions: invalid,
    qa: {
      safeForAutomatedIdentityApplication: false,
      safeForValidatorExecution: false,
      readyForCallerRequestedProjection: identityBindingValid && validAccepted.length > 0 && !invalid.some((item) => item.area === "review" || item.area === "identity"),
      readyForCallerRequestedValidation: activated,
      decisionCount, invalidDecisionCount: invalid.length,
      diagnostics: [
        "Review authority is caller-attested, not authenticated by this keyless MCP.",
        "Accepted identity decisions create a reviewed projection; exact source mentions remain unchanged and projectTruth remains false.",
        "Persist this receipt in a governed repository if later agents should reuse it across sessions.",
      ],
    },
  };
  return { ...body, receiptFingerprint: `fnv64:${fingerprint(JSON.stringify(body))}` };
}

export const REVIEWED_KNOWLEDGE_JSON_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["version", "receiptFingerprint", "status", "review", "bindings", "identityLedger", "domainConfiguration", "invalidDecisions", "qa"],
  properties: {
    version: { type: "string", enum: [REVIEWED_KNOWLEDGE_VERSION] }, receiptFingerprint: { type: "string" },
    status: { type: "string", enum: ["not_submitted", "accepted", "partially_accepted", "rejected"] },
    review: { type: "object", additionalProperties: false, required: ["reviewId", "projectScope", "revision", "reviewerRole", "authorityKind", "authenticated", "projectCanon"], properties: {
      reviewId: { type: ["string", "null"] }, projectScope: { type: ["string", "null"] }, revision: { type: ["string", "null"] },
      reviewerRole: { type: ["string", "null"], enum: ["director", "maintainer", "editor", "domain_owner", null] },
      authorityKind: { type: "string", enum: ["none", "caller_attested_review"] }, authenticated: { type: "boolean", enum: [false] }, projectCanon: { type: "boolean", enum: [false] },
    } },
    bindings: { type: "object", additionalProperties: false, required: ["identityPackageFingerprint", "identityBindingValid", "domainProfileFingerprint", "domainBindingValid"], properties: {
      identityPackageFingerprint: { type: "string" }, identityBindingValid: { type: "boolean" }, domainProfileFingerprint: { type: "string" }, domainBindingValid: { type: "boolean" },
    } },
    identityLedger: { type: "object", additionalProperties: false, required: ["exactSourceFormsPreserved", "acceptedDecisions", "canonicalGroups", "relatedCandidateIds", "distinctCandidateIds", "rejectedCandidateIds", "unresolvedCandidateIds"], properties: {
      exactSourceFormsPreserved: { type: "boolean", enum: [true] },
      acceptedDecisions: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "candidateLinkId", "outcome", "basis", "canonicalEntityId", "memberEntityIds", "sourceForms", "evidenceIds", "rationale", "status"], properties: {
        id: { type: "string" }, candidateLinkId: { type: "string" },
        outcome: { type: "string", enum: ["accept_same_entity", "accept_alias", "accept_misspelling", "accept_former_name", "accept_title", "accept_translation", "mark_related", "keep_distinct", "reject_candidate"] },
        basis: { type: "string", enum: ["human_review", "explicit_source_statement", "parser_binding"] }, canonicalEntityId: { type: ["string", "null"] },
        memberEntityIds: { type: "array", items: { type: "string" } }, sourceForms: { type: "array", items: { type: "string" } }, evidenceIds: { type: "array", items: { type: "string" } },
        rationale: { type: "string" }, status: { type: "string", enum: ["accepted"] },
      } } },
      canonicalGroups: { type: "array", items: { type: "object", additionalProperties: false, required: ["canonicalEntityId", "memberEntityIds", "canonicalName", "acceptedForms", "decisionIds", "projectTruth"], properties: {
        canonicalEntityId: { type: "string" }, memberEntityIds: { type: "array", items: { type: "string" } }, canonicalName: { type: "string" },
        acceptedForms: { type: "array", items: { type: "string" } }, decisionIds: { type: "array", items: { type: "string" } }, projectTruth: { type: "boolean", enum: [false] },
      } } },
      relatedCandidateIds: { type: "array", items: { type: "string" } }, distinctCandidateIds: { type: "array", items: { type: "string" } }, rejectedCandidateIds: { type: "array", items: { type: "string" } }, unresolvedCandidateIds: { type: "array", items: { type: "string" } },
    } },
    domainConfiguration: { type: "object", additionalProperties: false, required: ["requestedActivation", "activated", "approvedParameters", "rejectedParameterIds", "approvedValidators", "rejectedValidatorIds", "projectTruth"], properties: {
      requestedActivation: { type: "boolean" }, activated: { type: "boolean" },
      approvedParameters: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "key", "label", "kind", "source", "status", "activation", "questionRelevance", "appliesToTypes", "surfaceForms", "evidenceIds", "reason"], properties: {
        id: { type: "string" }, key: { type: "string" }, label: { type: "string" }, kind: { type: "string", enum: ["identity", "state", "resource", "permission", "knowledge", "event", "temporal", "relationship"] },
        source: { type: "string", enum: ["entity_subtype", "claim_predicate", "temporal_axis", "relation_type"] }, status: { type: "string", enum: ["approved"] }, activation: { type: "string", enum: ["active_in_caller_attested_profile"] },
        questionRelevance: { type: "string", enum: ["direct", "structural"] }, appliesToTypes: { type: "array", items: { type: "string" } }, surfaceForms: { type: "array", items: { type: "string" } }, evidenceIds: { type: "array", items: { type: "string" } }, reason: { type: "string" },
      } } },
      rejectedParameterIds: { type: "array", items: { type: "string" } },
      approvedValidators: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "validator", "status", "evidenceIds", "reason"], properties: {
        id: { type: "string" }, validator: { type: "string", enum: ["identity_review", "temporal_ordering", "resource_conservation", "authorization", "knowledge_transition", "state_transition", "relation_grounding"] },
        status: { type: "string", enum: ["approved"] }, evidenceIds: { type: "array", items: { type: "string" } }, reason: { type: "string" },
      } } },
      rejectedValidatorIds: { type: "array", items: { type: "string" } }, projectTruth: { type: "boolean", enum: [false] },
    } },
    invalidDecisions: { type: "array", items: { type: "object", additionalProperties: false, required: ["area", "referenceId", "code", "message"], properties: {
      area: { type: "string", enum: ["review", "identity", "parameter", "validator"] }, referenceId: { type: "string" }, code: { type: "string" }, message: { type: "string" },
    } } },
    qa: { type: "object", additionalProperties: false, required: ["safeForAutomatedIdentityApplication", "safeForValidatorExecution", "readyForCallerRequestedProjection", "readyForCallerRequestedValidation", "decisionCount", "invalidDecisionCount", "diagnostics"], properties: {
      safeForAutomatedIdentityApplication: { type: "boolean", enum: [false] }, safeForValidatorExecution: { type: "boolean", enum: [false] },
      readyForCallerRequestedProjection: { type: "boolean" }, readyForCallerRequestedValidation: { type: "boolean" },
      decisionCount: { type: "integer", minimum: 0 }, invalidDecisionCount: { type: "integer", minimum: 0 }, diagnostics: { type: "array", items: { type: "string" } },
    } },
  },
} as const;

export const REVIEWED_KNOWLEDGE_INPUT_JSON_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["reviewId", "projectScope", "revision", "reviewerRole", "identityPackageFingerprint", "domainProfileFingerprint"],
  properties: {
    reviewId: { type: "string", minLength: 1, maxLength: 128 },
    projectScope: { type: "string", minLength: 1, maxLength: 240 },
    revision: { type: "string", minLength: 1, maxLength: 128 },
    reviewerRole: { type: "string", enum: ["director", "maintainer", "editor", "domain_owner"] },
    identityPackageFingerprint: { type: "string", minLength: 1, maxLength: 128 },
    domainProfileFingerprint: { type: "string", minLength: 1, maxLength: 128 },
    identityDecisions: { type: "array", maxItems: REVIEWED_KNOWLEDGE_LIMITS.maxIdentityDecisions, items: {
      type: "object", additionalProperties: false, required: ["candidateLinkId", "outcome", "basis", "rationale"], properties: {
        candidateLinkId: { type: "string", minLength: 1, maxLength: 128 },
        outcome: { type: "string", enum: ["accept_same_entity", "accept_alias", "accept_misspelling", "accept_former_name", "accept_title", "accept_translation", "mark_related", "keep_distinct", "reject_candidate"] },
        basis: { type: "string", enum: ["human_review", "explicit_source_statement", "parser_binding"] },
        canonicalEntityId: { type: "string", minLength: 1, maxLength: 128 },
        evidenceIds: { type: "array", maxItems: 32, uniqueItems: true, items: { type: "string", minLength: 1, maxLength: 128 } },
        rationale: { type: "string", minLength: 1, maxLength: 1_000 },
      },
    } },
    parameterDecisions: { type: "array", maxItems: REVIEWED_KNOWLEDGE_LIMITS.maxParameterDecisions, items: {
      type: "object", additionalProperties: false, required: ["parameterId", "decision", "rationale"], properties: {
        parameterId: { type: "string", minLength: 1, maxLength: 128 }, decision: { type: "string", enum: ["approve", "reject"] }, rationale: { type: "string", minLength: 1, maxLength: 1_000 },
      },
    } },
    validatorDecisions: { type: "array", maxItems: REVIEWED_KNOWLEDGE_LIMITS.maxValidatorDecisions, items: {
      type: "object", additionalProperties: false, required: ["validatorId", "decision", "rationale"], properties: {
        validatorId: { type: "string", minLength: 1, maxLength: 128 }, decision: { type: "string", enum: ["approve", "reject"] }, rationale: { type: "string", minLength: 1, maxLength: 1_000 },
      },
    } },
    activateDomainProfile: { type: "boolean" },
  },
} as const;
