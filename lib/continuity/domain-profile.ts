import type { ContinuityEntityPackage, EntityTopLevelType } from "./entity-package";
import type { McpContextClaim, McpContextPacket } from "./mcp-context";

export const DOMAIN_PROFILE_VERSION = "continuity.domain-profile.v1" as const;

export type DomainParameterKind =
  | "identity"
  | "state"
  | "resource"
  | "permission"
  | "knowledge"
  | "event"
  | "temporal"
  | "relationship";

export type DomainParameterCandidate = {
  id: string;
  key: string;
  label: string;
  kind: DomainParameterKind;
  source: "entity_subtype" | "claim_predicate" | "temporal_axis" | "relation_type";
  status: "proposed";
  activation: "requires_review";
  questionRelevance: "direct" | "structural";
  appliesToTypes: EntityTopLevelType[];
  surfaceForms: string[];
  evidenceIds: string[];
  reason: string;
};

export type DomainProfileProposal = {
  version: typeof DOMAIN_PROFILE_VERSION;
  profileFingerprint: string;
  scope: "submitted_packet";
  status: "proposed";
  activated: false;
  coreDimensions: Array<"identity" | "authority" | "time" | "provenance" | "ambiguity" | "coverage" | "causality">;
  observedEntityTypes: EntityTopLevelType[];
  observedSubtypes: string[];
  candidateParameters: DomainParameterCandidate[];
  validatorCandidates: Array<{
    id: string;
    validator: "identity_review" | "temporal_ordering" | "resource_conservation" | "authorization" | "knowledge_transition" | "state_transition" | "relation_grounding";
    status: "proposed";
    evidenceIds: string[];
    reason: string;
  }>;
  policy: {
    schemaOnRead: true;
    truthOnlyOnApproval: true;
    sourceTraitsRemainProposals: true;
    safeForAutomaticActivation: false;
  };
  coverage: {
    inspectedClaims: number;
    inspectedEntities: number;
    completeForSubmittedPacketProposals: boolean;
    completeForProjectCorpus: false;
  };
  diagnostics: string[];
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

function words(value: string): string[] {
  return value.normalize("NFKC").toLocaleLowerCase("en-US").split(/[^\p{L}\p{N}]+/u).filter((item) => item.length > 1);
}

function key(value: string): string {
  return words(value).join("_") || "unknown";
}

function directRelevance(question: string, values: string[]): boolean {
  const questionWords = new Set(words(question));
  return values.some((value) => words(value).some((word) => questionWords.has(word)));
}

function claimParameterKind(claim: McpContextClaim): DomainParameterKind {
  const material = `${claim.subject} ${claim.predicate} ${claim.object}`.toLocaleLowerCase("en-US");
  if (/\b(?:cash|money|cost|price|pay(?:s|ed|ing)?|payment|balance|budget|credit|debit|transfer(?:s|red|ring)?|fund(?:s|ed|ing)?|resource|energy|inventory)\b/.test(material)) return "resource";
  if (/\b(?:allow|allowed|authorize|authorized|permission|permit|may|can|eligible|access|forbid|prohibit)\b/.test(material)) return "permission";
  if (/\b(?:know|knows|knew|learn|learns|discover|discovers|reveal|reveals|remember|forget|aware|believe)\b/.test(material)) return "knowledge";
  if (/\b(?:mother|father|grandmother|grandfather|sibling|friend|ally|enemy|rival|member|owns|belongs|related|relationship)\b/.test(material)) return "relationship";
  if (claim.temporal) return "temporal";
  if (["observed", "historical", "tested", "implemented"].includes(claim.claimKind)) return "event";
  return "state";
}

function associatedTypes(claim: McpContextClaim, entityPackage: ContinuityEntityPackage): EntityTopLevelType[] {
  const claimStart = claim.start;
  const claimEnd = claim.end;
  const types = entityPackage.mentions.filter((mention) => mention.documentId === claim.documentId
    && mention.start >= claimStart && mention.end <= claimEnd).map((mention) => mention.type);
  return [...new Set(types)].sort();
}

function mergeCandidates(candidates: DomainParameterCandidate[]): DomainParameterCandidate[] {
  const merged = new Map<string, DomainParameterCandidate>();
  for (const candidate of candidates) {
    const mergeKey = `${candidate.source}\u0000${candidate.kind}\u0000${candidate.key}`;
    const existing = merged.get(mergeKey);
    if (!existing) {
      merged.set(mergeKey, structuredClone(candidate));
      continue;
    }
    existing.questionRelevance = existing.questionRelevance === "direct" || candidate.questionRelevance === "direct" ? "direct" : "structural";
    existing.appliesToTypes = [...new Set([...existing.appliesToTypes, ...candidate.appliesToTypes])].sort();
    existing.surfaceForms = [...new Set([...existing.surfaceForms, ...candidate.surfaceForms])].sort();
    existing.evidenceIds = [...new Set([...existing.evidenceIds, ...candidate.evidenceIds])].sort();
  }
  return [...merged.values()].sort((left, right) =>
    (left.questionRelevance === right.questionRelevance ? 0 : left.questionRelevance === "direct" ? -1 : 1)
    || left.kind.localeCompare(right.kind) || left.key.localeCompare(right.key));
}

export function buildDomainProfileProposal(
  packet: McpContextPacket,
  entityPackage: ContinuityEntityPackage,
  question: string,
): DomainProfileProposal {
  const candidates: DomainParameterCandidate[] = [];
  for (const entity of entityPackage.entities) {
    for (const subtype of entity.subtypes) {
      candidates.push({
        id: stableId("param", `entity_subtype\u0000${subtype}`),
        key: subtype,
        label: subtype.replaceAll("_", " "),
        kind: "identity",
        source: "entity_subtype",
        status: "proposed",
        activation: "requires_review",
        questionRelevance: directRelevance(question, [subtype, ...entity.aliases]) ? "direct" : "structural",
        appliesToTypes: [entity.type],
        surfaceForms: entity.aliases,
        evidenceIds: entity.mentionIds,
        reason: "This source-specific entity category occurred in accepted exact-span mentions.",
      });
    }
  }
  for (const claim of packet.claims) {
    const kindValue = claimParameterKind(claim);
    const claimLabel = claim.predicate;
    candidates.push({
      id: stableId("param", `claim_predicate\u0000${kindValue}\u0000${key(claimLabel)}`),
      key: key(claimLabel),
      label: claimLabel,
      kind: kindValue,
      source: "claim_predicate",
      status: "proposed",
      activation: "requires_review",
      questionRelevance: directRelevance(question, [claim.subject, claim.predicate, claim.object]) ? "direct" : "structural",
      appliesToTypes: associatedTypes(claim, entityPackage),
      surfaceForms: [claim.predicate],
      evidenceIds: [claim.id],
      reason: "This exact source predicate may represent a reusable project trait or transition dimension.",
    });
    if (claim.temporal) {
      candidates.push({
        id: stableId("param", `temporal_axis\u0000${claim.temporal.axis}`),
        key: claim.temporal.axis,
        label: claim.temporal.axis,
        kind: "temporal",
        source: "temporal_axis",
        status: "proposed",
        activation: "requires_review",
        questionRelevance: directRelevance(question, [claim.temporal.axis]) ? "direct" : "structural",
        appliesToTypes: [],
        surfaceForms: [claim.temporal.axis],
        evidenceIds: [claim.id],
        reason: "A verified ordinal establishes a candidate ordering axis for this material.",
      });
    }
  }
  for (const relation of packet.relations) {
    candidates.push({
      id: stableId("param", `relation_type\u0000${relation.relation}`),
      key: relation.relation,
      label: relation.relation.replaceAll("_", " "),
      kind: relation.relation === "temporal_before" ? "temporal" : "relationship",
      source: "relation_type",
      status: "proposed",
      activation: "requires_review",
      questionRelevance: "structural",
      appliesToTypes: [],
      surfaceForms: [relation.cue],
      evidenceIds: [relation.evidenceClaimId, relation.fromClaimId, relation.toClaimId].sort(),
      reason: "An admitted exact-span relation suggests a reusable dependency or ordering dimension.",
    });
  }

  const candidateParameters = mergeCandidates(candidates);
  const evidenceByValidator = new Map<string, string[]>();
  const validatorForKind: Record<DomainParameterKind, DomainProfileProposal["validatorCandidates"][number]["validator"]> = {
    identity: "identity_review",
    state: "state_transition",
    resource: "resource_conservation",
    permission: "authorization",
    knowledge: "knowledge_transition",
    event: "state_transition",
    temporal: "temporal_ordering",
    relationship: "relation_grounding",
  };
  for (const parameter of candidateParameters) {
    const validator = validatorForKind[parameter.kind];
    evidenceByValidator.set(validator, [...new Set([...(evidenceByValidator.get(validator) ?? []), ...parameter.evidenceIds])].sort());
  }
  const validatorCandidates = [...evidenceByValidator.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([validator, evidenceIds]) => ({
    id: stableId("validator", validator),
    validator: validator as DomainProfileProposal["validatorCandidates"][number]["validator"],
    status: "proposed" as const,
    evidenceIds,
    reason: "This validator corresponds to one or more evidence-bearing candidate parameters and remains inactive pending profile review.",
  }));
  const observedEntityTypes = [...new Set(entityPackage.entities.map((entity) => entity.type))].sort();
  const observedSubtypes = [...new Set(entityPackage.entities.flatMap((entity) => entity.subtypes))].sort();
  const material = JSON.stringify({ question, observedEntityTypes, observedSubtypes, candidateParameters, validatorCandidates });
  return {
    version: DOMAIN_PROFILE_VERSION,
    profileFingerprint: `fnv64:${fingerprint(material)}`,
    scope: "submitted_packet",
    status: "proposed",
    activated: false,
    coreDimensions: ["identity", "authority", "time", "provenance", "ambiguity", "coverage", "causality"],
    observedEntityTypes,
    observedSubtypes,
    candidateParameters,
    validatorCandidates,
    policy: {
      schemaOnRead: true,
      truthOnlyOnApproval: true,
      sourceTraitsRemainProposals: true,
      safeForAutomaticActivation: false,
    },
    coverage: {
      inspectedClaims: packet.claims.length,
      inspectedEntities: entityPackage.entities.length,
      completeForSubmittedPacketProposals: packet.proposalCoverage.closure === "closed",
      completeForProjectCorpus: false,
    },
    diagnostics: [
      "Candidate parameters describe the submitted packet and question; they are not a complete project ontology.",
      "Only parameters that affect identity, state, causality, authority, or downstream validation should be approved.",
      "A reviewed, versioned adapter must activate parameters and validators for deterministic project use.",
    ],
  };
}

export const DOMAIN_PROFILE_JSON_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["version", "profileFingerprint", "scope", "status", "activated", "coreDimensions", "observedEntityTypes", "observedSubtypes", "candidateParameters", "validatorCandidates", "policy", "coverage", "diagnostics"],
  properties: {
    version: { type: "string", enum: [DOMAIN_PROFILE_VERSION] }, profileFingerprint: { type: "string" },
    scope: { type: "string", enum: ["submitted_packet"] }, status: { type: "string", enum: ["proposed"] }, activated: { type: "boolean", enum: [false] },
    coreDimensions: { type: "array", items: { type: "string", enum: ["identity", "authority", "time", "provenance", "ambiguity", "coverage", "causality"] } },
    observedEntityTypes: { type: "array", items: { type: "string", enum: ["person", "organization", "place", "object", "work", "event", "rule", "state", "goal", "asset", "other"] } },
    observedSubtypes: { type: "array", items: { type: "string" } },
    candidateParameters: { type: "array", items: {
      type: "object", additionalProperties: false,
      required: ["id", "key", "label", "kind", "source", "status", "activation", "questionRelevance", "appliesToTypes", "surfaceForms", "evidenceIds", "reason"],
      properties: {
        id: { type: "string" }, key: { type: "string" }, label: { type: "string" },
        kind: { type: "string", enum: ["identity", "state", "resource", "permission", "knowledge", "event", "temporal", "relationship"] },
        source: { type: "string", enum: ["entity_subtype", "claim_predicate", "temporal_axis", "relation_type"] },
        status: { type: "string", enum: ["proposed"] }, activation: { type: "string", enum: ["requires_review"] },
        questionRelevance: { type: "string", enum: ["direct", "structural"] },
        appliesToTypes: { type: "array", items: { type: "string", enum: ["person", "organization", "place", "object", "work", "event", "rule", "state", "goal", "asset", "other"] } },
        surfaceForms: { type: "array", items: { type: "string" } }, evidenceIds: { type: "array", items: { type: "string" } }, reason: { type: "string" },
      },
    } },
    validatorCandidates: { type: "array", items: {
      type: "object", additionalProperties: false, required: ["id", "validator", "status", "evidenceIds", "reason"],
      properties: {
        id: { type: "string" }, validator: { type: "string", enum: ["identity_review", "temporal_ordering", "resource_conservation", "authorization", "knowledge_transition", "state_transition", "relation_grounding"] },
        status: { type: "string", enum: ["proposed"] }, evidenceIds: { type: "array", items: { type: "string" } }, reason: { type: "string" },
      },
    } },
    policy: { type: "object", additionalProperties: false, required: ["schemaOnRead", "truthOnlyOnApproval", "sourceTraitsRemainProposals", "safeForAutomaticActivation"], properties: {
      schemaOnRead: { type: "boolean", enum: [true] }, truthOnlyOnApproval: { type: "boolean", enum: [true] },
      sourceTraitsRemainProposals: { type: "boolean", enum: [true] }, safeForAutomaticActivation: { type: "boolean", enum: [false] },
    } },
    coverage: { type: "object", additionalProperties: false, required: ["inspectedClaims", "inspectedEntities", "completeForSubmittedPacketProposals", "completeForProjectCorpus"], properties: {
      inspectedClaims: { type: "integer", minimum: 0 }, inspectedEntities: { type: "integer", minimum: 0 },
      completeForSubmittedPacketProposals: { type: "boolean" }, completeForProjectCorpus: { type: "boolean", enum: [false] },
    } },
    diagnostics: { type: "array", items: { type: "string" } },
  },
} as const;
