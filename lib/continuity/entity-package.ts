import { AUTHORITY_ROUTER_VERSION } from "./contracts";
import type {
  McpContextPacket,
  McpEntityCandidate,
  PacketRelativeAuthority,
} from "./mcp-context";

export const ENTITY_PACKAGE_VERSION = "continuity.entity-package.v1" as const;
export const ENTITY_ONTOLOGY_VERSION = "continuity.entity-ontology.v1" as const;

export const ENTITY_TOP_LEVEL_TYPES = [
  "person",
  "organization",
  "place",
  "object",
  "work",
  "event",
  "rule",
  "state",
  "goal",
  "asset",
  "other",
] as const;

export type EntityTopLevelType = typeof ENTITY_TOP_LEVEL_TYPES[number];
export type EntityPackageCheckStatus = "pass" | "warning" | "fail";

export type EvidenceBearingMention = {
  id: string;
  documentId: string;
  entityId: string;
  ambiguitySetId: string | null;
  surfaceForm: string;
  locator: string;
  start: number;
  end: number;
  coordinateSystem: "utf16_code_units";
  rangeConvention: "zero_based_half_open";
  evidenceQuote: string;
  evidenceFingerprint: string;
  explicitId: string | null;
  type: EntityTopLevelType;
  subtype: string;
  resolution: "resolved" | "unresolved" | "ambiguous";
  resolutionBasis: "exact_explicit_id" | "unresolved_surface_form" | "ambiguous_surface_form";
  authority: PacketRelativeAuthority;
  projectTruth: false;
};

export type EvidenceBearingEntity = {
  id: string;
  canonicalName: string;
  type: EntityTopLevelType;
  subtypes: string[];
  attributes: { sourceScoped: true; projectTruth: false };
  aliases: string[];
  explicitIds: string[];
  mentionIds: string[];
  resolution: "resolved" | "candidate";
};

export type EntityPackageQaCheck = {
  id: string;
  status: EntityPackageCheckStatus;
  checked: number;
  message: string;
};

export type ContinuityEntityPackage = {
  version: typeof ENTITY_PACKAGE_VERSION;
  packageFingerprint: string;
  coordinateSystem: {
    unit: "utf16_code_units";
    rangeConvention: "zero_based_half_open";
    note: string;
  };
  documents: Array<{
    id: string;
    name: string;
    contentFingerprint: string;
    lineCount: number;
  }>;
  entities: EvidenceBearingEntity[];
  mentions: EvidenceBearingMention[];
  ambiguitySets: Array<{
    id: string;
    normalizedSurfaceForm: string;
    mentionIds: string[];
    candidateEntityIds: string[];
    status: "ambiguous";
  }>;
  relations: Array<{
    id: string;
    relation: "precondition" | "consequence" | "temporal_before";
    evidenceClaimId: string;
    fromClaimId: string;
    toClaimId: string;
    cue: string;
    cueStart: number;
    cueEnd: number;
    assertionScope: "source_assertion";
  }>;
  ontology: {
    version: typeof ENTITY_ONTOLOGY_VERSION;
    topLevelTypes: EntityTopLevelType[];
    extensionRule: string;
    identityRule: string;
  };
  provenance: {
    routerVersion: typeof AUTHORITY_ROUTER_VERSION;
    contextVersion: McpContextPacket["version"];
    stateless: true;
    providerCalls: 0;
    sourceFingerprints: string[];
    proposalCoverage: McpContextPacket["proposalCoverage"];
    completeForProjectCorpus: false;
  };
  qa: {
    checks: EntityPackageQaCheck[];
    passed: number;
    warnings: number;
    failed: number;
    safeForAutomaticIdentityMerge: boolean;
    safeForProjectCanonPromotion: false;
    unresolvedMentionIds: string[];
    ambiguousSetIds: string[];
    rejectedProposalCount: number;
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

function normalized(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
}

function normalizeSubtype(value: string): string {
  return normalized(value).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "unknown";
}

function topLevelType(value: string): EntityTopLevelType {
  const type = normalizeSubtype(value);
  if (/person|character|actor|protagonist|antagonist|customer|founder|human|figure/.test(type)) return "person";
  if (/organization|organisation|company|team|group|faction|agency|institution|council|government/.test(type)) return "organization";
  if (/place|location|region|country|city|road|street|building|room|world|realm|geography/.test(type)) return "place";
  if (/work|book|novel|poem|song|document|publication|pamphlet|article|script|chapter/.test(type)) return "work";
  if (/event|incident|battle|meeting|launch|deployment|migration|test_suite|test_run/.test(type)) return "event";
  if (/rule|policy|requirement|constraint|law|protocol/.test(type)) return "rule";
  if (/state|status|flag|condition|result/.test(type)) return "state";
  if (/goal|objective|outcome|quest|mission/.test(type)) return "goal";
  if (/asset|image|panel|sprite|audio|video|ui/.test(type)) return "asset";
  if (/object|item|artifact|prop|weapon|vehicle|device|software_release|release/.test(type)) return "object";
  return "other";
}

function entityKey(candidate: McpEntityCandidate): string {
  // Unresolved surface forms never merge merely because their spelling matches.
  // An exact source-scoped identifier may join repeated mentions inside the
  // same source because referentKey includes that source identity.
  return candidate.explicitId ? candidate.referentKey : `unresolved:${candidate.id}`;
}

function qaCheck(
  id: string,
  status: EntityPackageCheckStatus,
  checked: number,
  message: string,
): EntityPackageQaCheck {
  return { id, status, checked, message };
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

export function buildContinuityEntityPackage(packet: McpContextPacket): ContinuityEntityPackage {
  const entityIdByCandidateId = new Map<string, string>();
  const candidatesByEntityKey = new Map<string, McpEntityCandidate[]>();
  for (const candidate of packet.entityCandidates) {
    const key = entityKey(candidate);
    candidatesByEntityKey.set(key, [...(candidatesByEntityKey.get(key) ?? []), candidate]);
  }

  const entities = [...candidatesByEntityKey.entries()].map(([key, candidates]): EvidenceBearingEntity => {
    const id = stableId("pkgent", key);
    for (const candidate of candidates) entityIdByCandidateId.set(candidate.id, id);
    const aliases = unique(candidates.map((candidate) => candidate.mention));
    const subtypes = unique(candidates.map((candidate) => normalizeSubtype(candidate.entityType)));
    const topTypes = unique(candidates.map((candidate) => topLevelType(candidate.entityType)));
    return {
      id,
      canonicalName: aliases[0] ?? "unknown",
      type: topTypes.length === 1 ? topTypes[0] as EntityTopLevelType : "other",
      subtypes,
      attributes: { sourceScoped: true, projectTruth: false },
      aliases,
      explicitIds: unique(candidates.flatMap((candidate) => candidate.explicitId ? [candidate.explicitId] : [])),
      mentionIds: candidates.map((candidate) => candidate.id).sort((a, b) => a.localeCompare(b)),
      resolution: candidates.every((candidate) => candidate.explicitId) ? "resolved" : "candidate",
    };
  }).sort((a, b) => a.id.localeCompare(b.id));

  const ambiguitySetByCandidateId = new Map<string, string>();
  const ambiguitySets = packet.entityCandidateGroups.flatMap((group) => {
    const candidateEntityIds = unique(group.candidateIds.flatMap((candidateId) => {
      const entityId = entityIdByCandidateId.get(candidateId);
      return entityId ? [entityId] : [];
    }));
    if (candidateEntityIds.length < 2) return [];
    const id = stableId("amb", `${group.normalizedMention}\u0000${candidateEntityIds.join("\u0000")}`);
    for (const candidateId of group.candidateIds) ambiguitySetByCandidateId.set(candidateId, id);
    return [{
      id,
      normalizedSurfaceForm: group.normalizedMention,
      mentionIds: [...group.candidateIds].sort((a, b) => a.localeCompare(b)),
      candidateEntityIds,
      status: "ambiguous" as const,
    }];
  }).sort((a, b) => a.id.localeCompare(b.id));

  const mentions = packet.entityCandidates.map((candidate): EvidenceBearingMention => {
    const ambiguitySetId = ambiguitySetByCandidateId.get(candidate.id) ?? null;
    const resolution = ambiguitySetId ? "ambiguous" : candidate.explicitId ? "resolved" : "unresolved";
    return {
      id: candidate.id,
      documentId: candidate.documentId,
      entityId: entityIdByCandidateId.get(candidate.id)!,
      ambiguitySetId,
      surfaceForm: candidate.mention,
      locator: candidate.locator,
      start: candidate.start,
      end: candidate.end,
      coordinateSystem: "utf16_code_units",
      rangeConvention: "zero_based_half_open",
      evidenceQuote: candidate.quote,
      evidenceFingerprint: `fnv64:${fingerprint(candidate.quote)}`,
      explicitId: candidate.explicitId,
      type: topLevelType(candidate.entityType),
      subtype: normalizeSubtype(candidate.entityType),
      resolution,
      resolutionBasis: ambiguitySetId
        ? "ambiguous_surface_form"
        : candidate.explicitId ? "exact_explicit_id" : "unresolved_surface_form",
      authority: candidate.authority.level,
      projectTruth: false,
    };
  }).sort((a, b) => a.id.localeCompare(b.id));

  const mentionIds = mentions.map((mention) => mention.id);
  const entityIds = entities.map((entity) => entity.id);
  const exactAnchors = packet.entityCandidates.filter((candidate) =>
    candidate.end - candidate.start === candidate.mention.length
    && candidate.quote.includes(candidate.mention)).length;
  const anchoredExplicitIds = packet.entityCandidates.filter((candidate) =>
    !candidate.explicitId || candidate.quote.includes(candidate.explicitId)).length;
  const supportedEntities = entities.filter((entity) => entity.mentionIds.length > 0).length;
  const validOntology = mentions.filter((mention) => ENTITY_TOP_LEVEL_TYPES.includes(mention.type)).length;
  const aliasesWithEvidence = entities.filter((entity) => entity.aliases.every((alias) =>
    entity.mentionIds.some((mentionId) => mentions.find((mention) => mention.id === mentionId)?.surfaceForm === alias))).length;
  const unresolvedMentionIds = mentions.filter((mention) => mention.resolution === "unresolved").map((mention) => mention.id);

  const checks: EntityPackageQaCheck[] = [
    qaCheck(
      "unique_identifiers",
      new Set([...mentionIds, ...entityIds]).size === mentionIds.length + entityIds.length ? "pass" : "fail",
      mentionIds.length + entityIds.length,
      "Mention and entity identifiers must be unique within the package.",
    ),
    qaCheck(
      "exact_mention_anchors",
      exactAnchors === mentions.length ? "pass" : "fail",
      mentions.length,
      "Every mention must preserve its compiler-verified exact source span.",
    ),
    qaCheck(
      "anchored_explicit_identifiers",
      anchoredExplicitIds === mentions.length ? "pass" : "fail",
      mentions.length,
      "An explicit identifier is accepted only when it occurs in the supporting quote.",
    ),
    qaCheck(
      "entity_evidence_membership",
      supportedEntities === entities.length ? "pass" : "fail",
      entities.length,
      "Every entity record must link to at least one evidence-bearing mention.",
    ),
    qaCheck(
      "alias_evidence_membership",
      aliasesWithEvidence === entities.length ? "pass" : "fail",
      entities.length,
      "Every alias must be copied from a linked mention rather than inferred globally.",
    ),
    qaCheck(
      "controlled_top_level_ontology",
      validOntology === mentions.length ? "pass" : "fail",
      mentions.length,
      "Every mention must use a controlled top-level type while preserving its source subtype.",
    ),
    qaCheck(
      "unresolved_identity_review",
      unresolvedMentionIds.length ? "warning" : "pass",
      unresolvedMentionIds.length,
      unresolvedMentionIds.length
        ? "Unresolved surface forms remain candidates and require evidence before automatic merging."
        : "No unresolved surface-form identity remains.",
    ),
    qaCheck(
      "ambiguity_review",
      ambiguitySets.length ? "warning" : "pass",
      ambiguitySets.length,
      ambiguitySets.length
        ? "Same-surface candidates remain separated in explicit ambiguity sets."
        : "No multi-candidate surface ambiguity remains.",
    ),
    qaCheck(
      "proposal_rejections",
      packet.rejectedProposals.length ? "warning" : "pass",
      packet.rejectedProposals.length,
      packet.rejectedProposals.length
        ? "Rejected proposals are preserved in the parent receipt and must not be treated as resolved."
        : "All submitted proposals passed exact-span and safety validation.",
    ),
    qaCheck(
      "source_disagreement_review",
      packet.conflicts.length ? "warning" : "pass",
      packet.conflicts.length,
      packet.conflicts.length
        ? "Opposed source assertions remain unresolved and cannot be promoted to project truth."
        : "No same-frame source disagreement was detected in the accepted claims.",
    ),
  ];

  const packageWithoutFingerprint = {
    version: ENTITY_PACKAGE_VERSION,
    coordinateSystem: {
      unit: "utf16_code_units" as const,
      rangeConvention: "zero_based_half_open" as const,
      note: "Offsets are JavaScript string indices into the submitted document: zero-based UTF-16 code units with an exclusive end.",
    },
    documents: packet.documents.map((document) => ({
      id: document.id,
      name: document.name,
      contentFingerprint: document.contentFingerprint,
      lineCount: document.lineCount,
    })),
    entities,
    mentions,
    ambiguitySets,
    relations: packet.relations.map((relation) => ({
      id: relation.id,
      relation: relation.relation,
      evidenceClaimId: relation.evidenceClaimId,
      fromClaimId: relation.fromClaimId,
      toClaimId: relation.toClaimId,
      cue: relation.cue,
      cueStart: relation.cueStart,
      cueEnd: relation.cueEnd,
      assertionScope: "source_assertion" as const,
    })),
    ontology: {
      version: ENTITY_ONTOLOGY_VERSION,
      topLevelTypes: [...ENTITY_TOP_LEVEL_TYPES],
      extensionRule: "Use subtype and attributes for project-specific meaning; do not mint new top-level types.",
      identityRule: "A shared name, title, pronoun, adjacency, or inferred resemblance never proves that two mentions are the same entity.",
    },
    provenance: {
      routerVersion: AUTHORITY_ROUTER_VERSION,
      contextVersion: packet.version,
      stateless: true as const,
      providerCalls: 0 as const,
      sourceFingerprints: packet.documents.map((document) => document.contentFingerprint).sort((a, b) => a.localeCompare(b)),
      proposalCoverage: packet.proposalCoverage,
      completeForProjectCorpus: false as const,
    },
    qa: {
      checks,
      passed: checks.filter((check) => check.status === "pass").length,
      warnings: checks.filter((check) => check.status === "warning").length,
      failed: checks.filter((check) => check.status === "fail").length,
      safeForAutomaticIdentityMerge: entities.length > 0
        && checks.every((check) => check.status === "pass")
        && entities.every((entity) => entity.resolution === "resolved"),
      safeForProjectCanonPromotion: false as const,
      unresolvedMentionIds,
      ambiguousSetIds: ambiguitySets.map((set) => set.id),
      rejectedProposalCount: packet.rejectedProposals.length,
    },
  };

  return {
    ...packageWithoutFingerprint,
    packageFingerprint: `fnv64:${fingerprint(JSON.stringify(packageWithoutFingerprint))}`,
  };
}

export const ENTITY_PACKAGE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "version", "packageFingerprint", "coordinateSystem", "documents", "entities", "mentions",
    "ambiguitySets", "relations", "ontology", "provenance", "qa",
  ],
  properties: {
    version: { type: "string", enum: [ENTITY_PACKAGE_VERSION] },
    packageFingerprint: { type: "string" },
    coordinateSystem: {
      type: "object",
      additionalProperties: false,
      required: ["unit", "rangeConvention", "note"],
      properties: {
        unit: { type: "string", enum: ["utf16_code_units"] },
        rangeConvention: { type: "string", enum: ["zero_based_half_open"] },
        note: { type: "string" },
      },
    },
    documents: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "name", "contentFingerprint", "lineCount"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          contentFingerprint: { type: "string" },
          lineCount: { type: "integer", minimum: 0 },
        },
      },
    },
    entities: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id", "canonicalName", "type", "subtypes", "attributes", "aliases",
          "explicitIds", "mentionIds", "resolution",
        ],
        properties: {
          id: { type: "string" },
          canonicalName: { type: "string" },
          type: { type: "string", enum: ENTITY_TOP_LEVEL_TYPES },
          subtypes: { type: "array", items: { type: "string" }, uniqueItems: true },
          attributes: {
            type: "object",
            additionalProperties: false,
            required: ["sourceScoped", "projectTruth"],
            properties: {
              sourceScoped: { type: "boolean", enum: [true] },
              projectTruth: { type: "boolean", enum: [false] },
            },
          },
          aliases: { type: "array", items: { type: "string" }, uniqueItems: true },
          explicitIds: { type: "array", items: { type: "string" }, uniqueItems: true },
          mentionIds: { type: "array", items: { type: "string" }, minItems: 1, uniqueItems: true },
          resolution: { type: "string", enum: ["resolved", "candidate"] },
        },
      },
    },
    mentions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id", "documentId", "entityId", "ambiguitySetId", "surfaceForm", "locator",
          "start", "end", "coordinateSystem", "rangeConvention", "evidenceQuote",
          "evidenceFingerprint", "explicitId", "type", "subtype", "resolution",
          "resolutionBasis", "authority", "projectTruth",
        ],
        properties: {
          id: { type: "string" },
          documentId: { type: "string" },
          entityId: { type: "string" },
          ambiguitySetId: { type: ["string", "null"] },
          surfaceForm: { type: "string" },
          locator: { type: "string" },
          start: { type: "integer", minimum: 0 },
          end: { type: "integer", minimum: 0 },
          coordinateSystem: { type: "string", enum: ["utf16_code_units"] },
          rangeConvention: { type: "string", enum: ["zero_based_half_open"] },
          evidenceQuote: { type: "string" },
          evidenceFingerprint: { type: "string" },
          explicitId: { type: ["string", "null"] },
          type: { type: "string", enum: ENTITY_TOP_LEVEL_TYPES },
          subtype: { type: "string" },
          resolution: { type: "string", enum: ["resolved", "unresolved", "ambiguous"] },
          resolutionBasis: {
            type: "string",
            enum: ["exact_explicit_id", "unresolved_surface_form", "ambiguous_surface_form"],
          },
          authority: { type: "string", enum: ["reference", "proposal", "production_record"] },
          projectTruth: { type: "boolean", enum: [false] },
        },
      },
    },
    ambiguitySets: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "normalizedSurfaceForm", "mentionIds", "candidateEntityIds", "status"],
        properties: {
          id: { type: "string" },
          normalizedSurfaceForm: { type: "string" },
          mentionIds: { type: "array", items: { type: "string" }, minItems: 2, uniqueItems: true },
          candidateEntityIds: { type: "array", items: { type: "string" }, minItems: 2, uniqueItems: true },
          status: { type: "string", enum: ["ambiguous"] },
        },
      },
    },
    relations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id", "relation", "evidenceClaimId", "fromClaimId", "toClaimId",
          "cue", "cueStart", "cueEnd", "assertionScope",
        ],
        properties: {
          id: { type: "string" },
          relation: { type: "string", enum: ["precondition", "consequence", "temporal_before"] },
          evidenceClaimId: { type: "string" },
          fromClaimId: { type: "string" },
          toClaimId: { type: "string" },
          cue: { type: "string" },
          cueStart: { type: "integer", minimum: 0 },
          cueEnd: { type: "integer", minimum: 0 },
          assertionScope: { type: "string", enum: ["source_assertion"] },
        },
      },
    },
    ontology: {
      type: "object",
      additionalProperties: false,
      required: ["version", "topLevelTypes", "extensionRule", "identityRule"],
      properties: {
        version: { type: "string", enum: [ENTITY_ONTOLOGY_VERSION] },
        topLevelTypes: {
          type: "array", items: { type: "string", enum: ENTITY_TOP_LEVEL_TYPES },
          minItems: ENTITY_TOP_LEVEL_TYPES.length, maxItems: ENTITY_TOP_LEVEL_TYPES.length, uniqueItems: true,
        },
        extensionRule: { type: "string" },
        identityRule: { type: "string" },
      },
    },
    provenance: {
      type: "object",
      additionalProperties: false,
      required: [
        "routerVersion", "contextVersion", "stateless", "providerCalls", "sourceFingerprints",
        "proposalCoverage", "completeForProjectCorpus",
      ],
      properties: {
        routerVersion: { type: "string", enum: [AUTHORITY_ROUTER_VERSION] },
        contextVersion: { type: "string", enum: ["continuity.mcp-context.v1"] },
        stateless: { type: "boolean", enum: [true] },
        providerCalls: { type: "integer", enum: [0] },
        sourceFingerprints: { type: "array", items: { type: "string" }, uniqueItems: true },
        proposalCoverage: {
          type: "object",
          additionalProperties: false,
          required: ["submitted", "accepted", "rejected", "closure"],
          properties: {
            submitted: { type: "integer", minimum: 0 },
            accepted: { type: "integer", minimum: 0 },
            rejected: { type: "integer", minimum: 0 },
            closure: { type: "string", enum: ["closed", "partial"] },
          },
        },
        completeForProjectCorpus: { type: "boolean", enum: [false] },
      },
    },
    qa: {
      type: "object",
      additionalProperties: false,
      required: [
        "checks", "passed", "warnings", "failed", "safeForAutomaticIdentityMerge",
        "safeForProjectCanonPromotion", "unresolvedMentionIds", "ambiguousSetIds", "rejectedProposalCount",
      ],
      properties: {
        checks: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "status", "checked", "message"],
            properties: {
              id: { type: "string" },
              status: { type: "string", enum: ["pass", "warning", "fail"] },
              checked: { type: "integer", minimum: 0 },
              message: { type: "string" },
            },
          },
        },
        passed: { type: "integer", minimum: 0 },
        warnings: { type: "integer", minimum: 0 },
        failed: { type: "integer", minimum: 0 },
        safeForAutomaticIdentityMerge: { type: "boolean" },
        safeForProjectCanonPromotion: { type: "boolean", enum: [false] },
        unresolvedMentionIds: { type: "array", items: { type: "string" }, uniqueItems: true },
        ambiguousSetIds: { type: "array", items: { type: "string" }, uniqueItems: true },
        rejectedProposalCount: { type: "integer", minimum: 0 },
      },
    },
  },
} as const;
