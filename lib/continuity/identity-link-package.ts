import type { ContinuityEntityPackage, EvidenceBearingEntity } from "./entity-package";
import type { IdentityMatchingProfile, McpContextPacket } from "./mcp-context";

export const IDENTITY_LINK_PACKAGE_VERSION = "continuity.identity-links.v1" as const;
export const IDENTITY_LINK_LIMITS = Object.freeze({ maxCandidateLinks: 256 } as const);

export type IdentityLinkRelation =
  | "same_surface_unresolved"
  | "case_variant"
  | "format_variant"
  | "token_reordering"
  | "possible_typo"
  | "lexical_near_match"
  | "surface_collision"
  | "cross_source_id_reuse";

export type IdentityLinkCandidate = {
  id: string;
  fromEntityId: string;
  toEntityId: string;
  relation: IdentityLinkRelation;
  status: "proposed";
  confidenceBand: "high" | "moderate" | "low";
  heuristicScore: number;
  calibrated: false;
  safeToApplyAutomatically: false;
  fromSurfaceForm: string;
  toSurfaceForm: string;
  evidenceMentionIds: string[];
  reasons: string[];
  contraindications: string[];
};

export type IdentityLinkPackage = {
  version: typeof IDENTITY_LINK_PACKAGE_VERSION;
  packageFingerprint: string;
  policy: {
    mode: "suggest_only";
    exactSourceFormsPreserved: true;
    candidateLinksChangeIdentity: false;
    reviewRequired: true;
  };
  establishedAliasGroups: Array<{
    entityId: string;
    aliases: string[];
    explicitIds: string[];
    evidenceMentionIds: string[];
    basis: "same_exact_source_scoped_identifier";
  }>;
  candidateLinks: IdentityLinkCandidate[];
  profilesUsed: IdentityMatchingProfile[];
  coverage: {
    comparedEntities: number;
    possiblePairs: number;
    emittedCandidates: number;
    truncated: boolean;
    completeForProjectCorpus: false;
  };
  qa: {
    safeForAutomaticMerge: false;
    unreviewedCandidateIds: string[];
    collisionCandidateIds: string[];
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

function exact(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ");
}

function folded(value: string): string {
  return exact(value).toLocaleLowerCase("en-US");
}

function tokens(value: string): string[] {
  return exact(value)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .toLocaleLowerCase("en-US")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

function compact(value: string): string {
  return tokens(value).join("");
}

function editDistance(left: string, right: string): number {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[right.length];
}

function isSingleAdjacentTransposition(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  const differences: number[] = [];
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) differences.push(index);
    if (differences.length > 2) return false;
  }
  return differences.length === 2
    && differences[1] === differences[0] + 1
    && left[differences[0]] === right[differences[1]]
    && left[differences[1]] === right[differences[0]];
}

function tokenSimilarity(left: string[], right: string[]): number {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const union = new Set([...leftSet, ...rightSet]);
  if (!union.size) return 0;
  const intersection = [...leftSet].filter((item) => rightSet.has(item)).length;
  return intersection / union.size;
}

type Comparison = Pick<
  IdentityLinkCandidate,
  "relation" | "confidenceBand" | "heuristicScore" | "reasons" | "contraindications"
> & { left: string; right: string };

function confidence(score: number): IdentityLinkCandidate["confidenceBand"] {
  return score >= 85 ? "high" : score >= 65 ? "moderate" : "low";
}

function compareForms(left: string, right: string): Comparison | null {
  const leftExact = exact(left);
  const rightExact = exact(right);
  const leftFolded = folded(left);
  const rightFolded = folded(right);
  const leftTokens = tokens(left);
  const rightTokens = tokens(right);
  let relation: IdentityLinkRelation | null = null;
  let score = 0;
  const reasons: string[] = [];

  if (leftExact === rightExact) {
    relation = "same_surface_unresolved";
    score = 68;
    reasons.push("The exact source forms are identical, but no accepted identity evidence joins their referents.");
  } else if (leftFolded === rightFolded) {
    relation = "case_variant";
    score = 92;
    reasons.push("The forms differ only by letter case.");
  } else if (compact(left) === compact(right) && compact(left).length >= 3) {
    relation = "format_variant";
    score = 86;
    reasons.push("The forms match after removing punctuation, spacing, and identifier boundaries.");
  } else if (leftTokens.length > 1 && rightTokens.length > 1
    && [...leftTokens].sort().join("\u0000") === [...rightTokens].sort().join("\u0000")) {
    relation = "token_reordering";
    score = 82;
    reasons.push("The same lexical tokens occur in a different order.");
  } else {
    const leftCompact = compact(left);
    const rightCompact = compact(right);
    const maximumLength = Math.max(leftCompact.length, rightCompact.length);
    const distance = isSingleAdjacentTransposition(leftCompact, rightCompact)
      ? 1
      : editDistance(leftCompact, rightCompact);
    const typoThreshold = maximumLength >= 10 ? 2 : maximumLength >= 5 ? 1 : 0;
    if (typoThreshold > 0 && distance > 0 && distance <= typoThreshold) {
      relation = "possible_typo";
      score = distance === 1 ? 78 : 70;
      reasons.push(`The normalized forms are ${distance} edit${distance === 1 ? "" : "s"} apart.`);
    } else {
      const overlap = tokenSimilarity(leftTokens, rightTokens);
      const nearToken = leftTokens.some((leftToken) => rightTokens.some((rightToken) =>
        Math.max(leftToken.length, rightToken.length) >= 5 && editDistance(leftToken, rightToken) <= 2));
      if (overlap >= 0.5 || (overlap > 0 && nearToken)) {
        relation = "lexical_near_match";
        score = overlap >= 0.5 ? 62 : 54;
        reasons.push("The forms share significant identifier or name tokens.");
      }
    }
  }

  return relation ? {
    relation,
    confidenceBand: confidence(score),
    heuristicScore: score,
    reasons,
    contraindications: [],
    left: leftExact,
    right: rightExact,
  } : null;
}

function profileForEntity(
  entity: EvidenceBearingEntity,
  packet: McpContextPacket,
): IdentityMatchingProfile {
  const profiles = entity.mentionIds.flatMap((mentionId) => {
    const candidate = packet.entityCandidates.find((item) => item.id === mentionId);
    return candidate ? [candidate.identityProfile] : [];
  });
  return profiles.includes("opaque_identifier") ? "opaque_identifier"
    : profiles.includes("case_sensitive_symbol") ? "case_sensitive_symbol"
      : "natural_language";
}

function bestComparison(left: EvidenceBearingEntity, right: EvidenceBearingEntity): Comparison | null {
  const results = left.aliases.flatMap((leftAlias) => right.aliases.flatMap((rightAlias) => {
    const result = compareForms(leftAlias, rightAlias);
    return result ? [result] : [];
  }));
  return results.sort((a, b) => b.heuristicScore - a.heuristicScore
    || a.left.localeCompare(b.left) || a.right.localeCompare(b.right))[0] ?? null;
}

export function buildIdentityLinkPackage(
  packet: McpContextPacket,
  entityPackage: ContinuityEntityPackage,
): IdentityLinkPackage {
  const establishedAliasGroups = entityPackage.entities
    .filter((entity) => entity.resolution === "resolved" && entity.aliases.length > 1 && entity.explicitIds.length > 0)
    .map((entity) => ({
      entityId: entity.id,
      aliases: entity.aliases,
      explicitIds: entity.explicitIds,
      evidenceMentionIds: entity.mentionIds,
      basis: "same_exact_source_scoped_identifier" as const,
    }));

  const possiblePairs = (entityPackage.entities.length * (entityPackage.entities.length - 1)) / 2;
  const candidates: IdentityLinkCandidate[] = [];
  for (let leftIndex = 0; leftIndex < entityPackage.entities.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < entityPackage.entities.length; rightIndex += 1) {
      const left = entityPackage.entities[leftIndex];
      const right = entityPackage.entities[rightIndex];
      if (left.type !== right.type && left.type !== "other" && right.type !== "other") continue;
      const comparison = bestComparison(left, right);
      if (!comparison) continue;

      const leftProfile = profileForEntity(left, packet);
      const rightProfile = profileForEntity(right, packet);
      const constrainedSymbol = leftProfile !== "natural_language" || rightProfile !== "natural_language";
      const sharedExplicitId = left.explicitIds.some((id) => right.explicitIds.includes(id));
      const differentExplicitIds = left.explicitIds.length > 0 && right.explicitIds.length > 0 && !sharedExplicitId;
      if (sharedExplicitId) {
        comparison.relation = "cross_source_id_reuse";
        comparison.heuristicScore = 95;
        comparison.confidenceBand = "high";
        comparison.reasons = ["The same apparent explicit identifier occurs under different source owners."];
        comparison.contraindications.push("Source ownership prevents automatic cross-document identity merge.");
      } else if (differentExplicitIds && comparison.relation === "same_surface_unresolved") {
        comparison.relation = "surface_collision";
        comparison.heuristicScore = 96;
        comparison.confidenceBand = "high";
        comparison.reasons = ["The same surface form is attached to different exact identifiers."];
        comparison.contraindications.push("Different explicit identifiers are affirmative evidence against automatic merging.");
      } else if (differentExplicitIds && !constrainedSymbol) {
        continue;
      } else if (differentExplicitIds) {
        comparison.contraindications.push("The exact code or registry identifiers differ; a parser or reviewed rename record must establish any relationship.");
      }

      if (constrainedSymbol
        && ["case_variant", "format_variant", "token_reordering", "lexical_near_match"].includes(comparison.relation)) {
        comparison.contraindications.push("At least one referent is a case-sensitive or opaque symbol; lexical similarity does not establish symbol identity.");
      }
      const material = [left.id, right.id, comparison.relation, comparison.left, comparison.right].join("\u0000");
      candidates.push({
        id: stableId("idlink", material),
        fromEntityId: left.id,
        toEntityId: right.id,
        relation: comparison.relation,
        status: "proposed",
        confidenceBand: comparison.confidenceBand,
        heuristicScore: comparison.heuristicScore,
        calibrated: false,
        safeToApplyAutomatically: false,
        fromSurfaceForm: comparison.left,
        toSurfaceForm: comparison.right,
        evidenceMentionIds: [...new Set([...left.mentionIds, ...right.mentionIds])].sort(),
        reasons: comparison.reasons,
        contraindications: comparison.contraindications,
      });
    }
  }

  const sorted = candidates.sort((a, b) => b.heuristicScore - a.heuristicScore || a.id.localeCompare(b.id));
  const candidateLinks = sorted.slice(0, IDENTITY_LINK_LIMITS.maxCandidateLinks);
  const truncated = sorted.length > candidateLinks.length;
  const profilesUsed = [...new Set(entityPackage.entities.map((entity) => profileForEntity(entity, packet)))].sort();
  const unreviewedCandidateIds = candidateLinks.map((item) => item.id).sort();
  const collisionCandidateIds = candidateLinks
    .filter((item) => item.relation === "surface_collision" || item.relation === "cross_source_id_reuse")
    .map((item) => item.id).sort();
  const diagnostics = [
    "Candidate links are lexical review suggestions. They do not change entity identity or source text.",
    "Heuristic scores are deterministic rankings, not calibrated probabilities.",
    "Case-sensitive symbols require parser or language-service evidence before identity can be established.",
  ];
  if (truncated) diagnostics.push(`Candidate links were truncated at ${IDENTITY_LINK_LIMITS.maxCandidateLinks}.`);
  const fingerprintMaterial = JSON.stringify({ establishedAliasGroups, candidateLinks, profilesUsed, truncated });
  return {
    version: IDENTITY_LINK_PACKAGE_VERSION,
    packageFingerprint: `fnv64:${fingerprint(fingerprintMaterial)}`,
    policy: {
      mode: "suggest_only",
      exactSourceFormsPreserved: true,
      candidateLinksChangeIdentity: false,
      reviewRequired: true,
    },
    establishedAliasGroups,
    candidateLinks,
    profilesUsed,
    coverage: {
      comparedEntities: entityPackage.entities.length,
      possiblePairs,
      emittedCandidates: candidateLinks.length,
      truncated,
      completeForProjectCorpus: false,
    },
    qa: {
      safeForAutomaticMerge: false,
      unreviewedCandidateIds,
      collisionCandidateIds,
      diagnostics,
    },
  };
}

export const IDENTITY_LINK_PACKAGE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["version", "packageFingerprint", "policy", "establishedAliasGroups", "candidateLinks", "profilesUsed", "coverage", "qa"],
  properties: {
    version: { type: "string", enum: [IDENTITY_LINK_PACKAGE_VERSION] },
    packageFingerprint: { type: "string" },
    policy: {
      type: "object", additionalProperties: false,
      required: ["mode", "exactSourceFormsPreserved", "candidateLinksChangeIdentity", "reviewRequired"],
      properties: {
        mode: { type: "string", enum: ["suggest_only"] },
        exactSourceFormsPreserved: { type: "boolean", enum: [true] },
        candidateLinksChangeIdentity: { type: "boolean", enum: [false] },
        reviewRequired: { type: "boolean", enum: [true] },
      },
    },
    establishedAliasGroups: {
      type: "array", items: {
        type: "object", additionalProperties: false,
        required: ["entityId", "aliases", "explicitIds", "evidenceMentionIds", "basis"],
        properties: {
          entityId: { type: "string" }, aliases: { type: "array", items: { type: "string" } },
          explicitIds: { type: "array", items: { type: "string" } }, evidenceMentionIds: { type: "array", items: { type: "string" } },
          basis: { type: "string", enum: ["same_exact_source_scoped_identifier"] },
        },
      },
    },
    candidateLinks: {
      type: "array", items: {
        type: "object", additionalProperties: false,
        required: ["id", "fromEntityId", "toEntityId", "relation", "status", "confidenceBand", "heuristicScore", "calibrated", "safeToApplyAutomatically", "fromSurfaceForm", "toSurfaceForm", "evidenceMentionIds", "reasons", "contraindications"],
        properties: {
          id: { type: "string" }, fromEntityId: { type: "string" }, toEntityId: { type: "string" },
          relation: { type: "string", enum: ["same_surface_unresolved", "case_variant", "format_variant", "token_reordering", "possible_typo", "lexical_near_match", "surface_collision", "cross_source_id_reuse"] },
          status: { type: "string", enum: ["proposed"] }, confidenceBand: { type: "string", enum: ["high", "moderate", "low"] },
          heuristicScore: { type: "integer", minimum: 0, maximum: 100 }, calibrated: { type: "boolean", enum: [false] },
          safeToApplyAutomatically: { type: "boolean", enum: [false] }, fromSurfaceForm: { type: "string" }, toSurfaceForm: { type: "string" },
          evidenceMentionIds: { type: "array", items: { type: "string" } }, reasons: { type: "array", items: { type: "string" } },
          contraindications: { type: "array", items: { type: "string" } },
        },
      },
    },
    profilesUsed: { type: "array", items: { type: "string", enum: ["natural_language", "case_sensitive_symbol", "opaque_identifier"] } },
    coverage: {
      type: "object", additionalProperties: false,
      required: ["comparedEntities", "possiblePairs", "emittedCandidates", "truncated", "completeForProjectCorpus"],
      properties: {
        comparedEntities: { type: "integer", minimum: 0 }, possiblePairs: { type: "integer", minimum: 0 },
        emittedCandidates: { type: "integer", minimum: 0 }, truncated: { type: "boolean" }, completeForProjectCorpus: { type: "boolean", enum: [false] },
      },
    },
    qa: {
      type: "object", additionalProperties: false,
      required: ["safeForAutomaticMerge", "unreviewedCandidateIds", "collisionCandidateIds", "diagnostics"],
      properties: {
        safeForAutomaticMerge: { type: "boolean", enum: [false] },
        unreviewedCandidateIds: { type: "array", items: { type: "string" } }, collisionCandidateIds: { type: "array", items: { type: "string" } },
        diagnostics: { type: "array", items: { type: "string" } },
      },
    },
  },
} as const;
