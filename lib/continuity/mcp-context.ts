import {
  escapeRepositoryPacketControlSyntax,
  isSafeRepositoryPath,
  parseGitHubRepository,
  scanRepositoryTextForSecrets,
  type RepositoryProvider,
  type RepositoryReference,
  type RepositoryTreeEntry,
} from "./repositories/github";
import {
  discoverRepositoryProjectScopes,
  findRepositoryScopeConfigEntry,
  parseDeclaredRepositoryProjectScopes,
  repositoryEntryBelongsToScope,
  resolveRepositoryProjectScope,
  type RepositoryProjectScope,
  type RepositoryProjectScopeResolution,
} from "./repositories/project-boundary";
import {
  exactClaimFrameAppearsInOrder,
  exactClaimFramePolarityMatches,
  exactClaimFrameSpan,
  exactTemporalMarkerSharesClause,
  type ExactFrameArity,
} from "./exact-frame";
import {
  exactRelationCueDirection,
  exactRelationEndpointsMatch,
  exactRelationClaimKindIsAdmissible,
  exactRelationHasUnsupportedLogic,
} from "./exact-relation";
import { detectEvidenceFlags } from "./evidence-flags";

/**
 * A keyless, stateless boundary for turning caller-supplied text into a small
 * evidence packet. This module deliberately does not call a model, write to a
 * database, or promote an uploaded source to project truth.
 */
export const MCP_CONTEXT_VERSION = "continuity.mcp-context.v1" as const;

export const MCP_CONTEXT_LIMITS = Object.freeze({
  maxDocuments: 8,
  maxDocumentBytes: 128 * 1024,
  maxTotalDocumentBytes: 512 * 1024,
  maxProposals: 64,
  maxQuoteBytes: 8 * 1024,
  maxDocumentNameBytes: 240,
  maxFrameFieldBytes: 512,
});

export const MCP_REPOSITORY_LIMITS = Object.freeze({
  maxTreeEntries: 1_000,
  maxFiles: 8,
  maxProviderCalls: 10,
  maxFileBytes: 128 * 1024,
  maxTotalFileBytes: 512 * 1024,
  maxExcerptBytesPerFile: 12 * 1024,
  maxTotalExcerptBytes: 64 * 1024,
  maxQuestionBytes: 4 * 1024,
});

const HARD_REPOSITORY_LIMITS = Object.freeze({
  maxTreeEntries: 2_000,
  maxFiles: 16,
  maxProviderCalls: 18,
  maxFileBytes: 256 * 1024,
  maxTotalFileBytes: 1024 * 1024,
  maxExcerptBytesPerFile: 24 * 1024,
  maxTotalExcerptBytes: 128 * 1024,
  maxQuestionBytes: 8 * 1024,
});

export type PacketRelativeAuthority = "reference" | "proposal" | "production_record";
export type ClaimPolarity = "positive" | "negative";
export type IdentityMatchingProfile = "natural_language" | "case_sensitive_symbol" | "opaque_identifier";

export type UploadedTextDocument = {
  name: string;
  text: string;
  authority?: PacketRelativeAuthority;
};

export type ProposedExactSpanClaim = {
  documentName: string;
  quote: string;
  /** One-based occurrence when the exact quote repeats in the document. */
  occurrence?: number;
  claimKind: string;
  subject: string;
  predicate: string;
  object: string;
  /** Existing non-empty frames default to transitive. An empty object requires
   * an explicit intransitive marker and one terminal predicate token. */
  frameArity?: ExactFrameArity;
  polarity: ClaimPolarity;
  /** Optional source-scoped ordinal frame. The marker must be an exact,
   * uniquely located simple ordinal such as Day 8 and must normalize to the
   * supplied axis and number. */
  temporal?: { marker: string; axis: string; from: number; to?: number } | null;
};

export type ProposedEntityMention = {
  documentName: string;
  quote: string;
  /** One-based occurrence when the exact quote repeats in the document. */
  quoteOccurrence?: number;
  mention: string;
  /** One-based occurrence when the mention repeats inside the quote. */
  mentionOccurrence?: number;
  entityType?: string;
  /**
   * Matching is conservative by default. Code symbols and opaque registry IDs
   * may opt into exact case-sensitive identity without changing how ordinary
   * story names are handled by older clients.
   */
  identityProfile?: IdentityMatchingProfile;
  /** Must itself occur inside the exact quote; remains source scoped. */
  explicitId?: string;
};

export type ProposedExactRelation = {
  /** Direction is fixed: prerequisite→dependent, trigger→effect, or earlier→later. */
  relation: "precondition" | "consequence" | "temporal_before";
  /** Indices refer to the original claims array, before any rejection. */
  evidenceClaimIndex: number;
  fromClaimIndex: number;
  toClaimIndex: number;
  /** Exact relationship cue inside the supporting claim quote. */
  cue: string;
  cueOccurrence?: number;
};

export type McpContextInput = {
  documents: UploadedTextDocument[];
  claims?: ProposedExactSpanClaim[];
  entityMentions?: ProposedEntityMention[];
  relations?: ProposedExactRelation[];
};

type PacketAuthority = {
  scope: "packet_relative";
  level: PacketRelativeAuthority;
  establishes: "source_assertion";
  projectTruth: false;
  suppliedBy: "caller";
};

export type McpContextClaim = {
  id: string;
  documentId: string;
  assertionOwnerId: string;
  quote: string;
  locator: string;
  start: number;
  end: number;
  claimKind: string;
  claimKey: string;
  subject: string;
  predicate: string;
  object: string;
  polarity: ClaimPolarity;
  temporal: { axis: string; from: number; to: number } | null;
  authority: PacketAuthority;
  truthStatus: "source_assertion";
  trust: "untrusted_data";
};

export type McpEntityCandidate = {
  id: string;
  groupId: string;
  documentId: string;
  assertionOwnerId: string;
  mention: string;
  entityType: string;
  identityProfile: IdentityMatchingProfile;
  explicitId: string | null;
  referentKey: string;
  quote: string;
  locator: string;
  start: number;
  end: number;
  resolution: "source_scoped_explicit" | "unresolved";
  authority: PacketAuthority;
  trust: "untrusted_data";
};

export type McpContextRelation = {
  id: string;
  relation: ProposedExactRelation["relation"];
  evidenceClaimId: string;
  fromClaimId: string;
  toClaimId: string;
  cue: string;
  cueStart: number;
  cueEnd: number;
  truthStatus: "source_assertion";
  materialized: true;
};

export type McpContextPacket = {
  version: typeof MCP_CONTEXT_VERSION;
  stateless: true;
  providerCalls: 0;
  documents: Array<{
    id: string;
    name: string;
    byteSize: number;
    lineCount: number;
    contentFingerprint: string;
    authority: PacketAuthority;
    trust: "untrusted_data";
    flags: string[];
  }>;
  claims: McpContextClaim[];
  entityCandidates: McpEntityCandidate[];
  relations: McpContextRelation[];
  entityCandidateGroups: Array<{
    id: string;
    normalizedMention: string;
    candidateIds: string[];
    resolution: "ambiguous" | "single_unresolved" | "source_scoped_explicit";
  }>;
  conflicts: Array<{
    id: string;
    claimKey: string;
    positiveClaimIds: string[];
    negativeClaimIds: string[];
    status: "source_disagreement";
    projectTruthResolved: false;
  }>;
  membershipCoverage: {
    scope: "submitted_packet_membership";
    closure: "closed";
    submittedDocuments: number;
    acceptedDocuments: number;
    completeForSubmittedPacket: true;
    completeForProjectCorpus: false;
  };
  proposalCoverage: {
    submitted: number;
    accepted: number;
    rejected: number;
    closure: "closed" | "partial";
  };
  rejectedProposals: Array<{
    proposalType: "claim" | "entity" | "relation";
    proposalIndex: number;
    code: string;
  }>;
  diagnostics: string[];
};

export type McpContextErrorCode =
  | "invalid_input"
  | "document_limit"
  | "document_too_large"
  | "total_bytes_limit"
  | "proposal_limit"
  | "repository_limit"
  | "repository_invalid_response"
  | "repository_scope_receipt_required"
  | "repository_scope_mismatch";

export class McpContextError extends Error {
  constructor(message: string, readonly code: McpContextErrorCode) {
    super(message);
    this.name = "McpContextError";
  }
}

const encoder = new TextEncoder();
const SOURCE_INSTRUCTION_PATTERNS = [
  /ignore\s+(?:all\s+)?(?:previous|prior|system|developer)\s+instructions?/i,
  /(?:system|developer|assistant)\s+(?:message|instruction|directive)/i,
  /\b(?:output|return|reveal|print)\b[^\n]{0,100}\b(?:token|secret|password|exact phrase)\b/i,
  /\bdo not\s+(?:cite|report|mention|surface)\b/i,
  /\b(?:call|invoke|use)\s+(?:an?\s+)?(?:tool|api|model)\b/i,
];

function byteLength(value: string): number {
  return encoder.encode(value).byteLength;
}

function sourceInstructionRisk(value: string): boolean {
  return SOURCE_INSTRUCTION_PATTERNS.some((pattern) => pattern.test(value))
    || detectEvidenceFlags(value).includes("possible_prompt_injection");
}

function normalized(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

function inferredIdentityProfile(
  entityType: string | undefined,
  requested: IdentityMatchingProfile | undefined,
): IdentityMatchingProfile {
  if (requested) return requested;
  const type = normalized(entityType ?? "unknown").replace(/[^a-z0-9]+/g, "_");
  return /(?:^|_)(?:function|method|class|interface|variable|constant|symbol|module|namespace|property|field|enum|type_alias)(?:_|$)/.test(type)
    ? "case_sensitive_symbol"
    : "natural_language";
}

function identityKey(value: string, profile: IdentityMatchingProfile): string {
  const exact = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  return profile === "natural_language" ? exact.toLocaleLowerCase("en-US") : exact;
}

/** A deterministic, non-secret fingerprint used for stable local IDs. */
function fingerprint(value: string): string {
  const bytes = encoder.encode(value);
  let left = 0x811c9dc5;
  let right = 0x9e3779b9;
  for (const byte of bytes) {
    left = Math.imul(left ^ byte, 0x01000193) >>> 0;
    right = Math.imul(right ^ (byte + 0x7f), 0x85ebca6b) >>> 0;
    right ^= right >>> 13;
  }
  return `${left.toString(16).padStart(8, "0")}${right.toString(16).padStart(8, "0")}`;
}

function stableId(prefix: string, material: string): string {
  return `${prefix}_${fingerprint(material)}`;
}

function assertDocumentName(name: unknown): asserts name is string {
  if (
    typeof name !== "string" || !name.trim() || name !== name.trim()
    || byteLength(name) > MCP_CONTEXT_LIMITS.maxDocumentNameBytes
    || /[\u0000-\u001f\u007f]/.test(name)
    || name.startsWith("/") || name.includes("\\")
    || name.split("/").some((part) => !part || part === "." || part === "..")
  ) throw new McpContextError("Document names must be unique, safe relative names.", "invalid_input");
}

function authorityFor(level: PacketRelativeAuthority | undefined): PacketAuthority {
  const safeLevel = level ?? "reference";
  if (!["reference", "proposal", "production_record"].includes(safeLevel)) {
    throw new McpContextError("Document authority is invalid.", "invalid_input");
  }
  return {
    scope: "packet_relative",
    level: safeLevel,
    establishes: "source_assertion",
    projectTruth: false,
    suppliedBy: "caller",
  };
}

function occurrences(text: string, exact: string): number[] {
  if (!exact) return [];
  const result: number[] = [];
  let cursor = 0;
  while (cursor <= text.length - exact.length) {
    const found = text.indexOf(exact, cursor);
    if (found < 0) break;
    result.push(found);
    cursor = found + Math.max(1, exact.length);
  }
  return result;
}

function containsExactIdentifier(text: string, identifier: string): boolean {
  const identifierCharacter = /[\p{L}\p{N}_-]/u;
  return occurrences(text, identifier).some((start) => {
    const before = start > 0 ? text[start - 1] : "";
    const after = start + identifier.length < text.length ? text[start + identifier.length] : "";
    return (!before || !identifierCharacter.test(before))
      && (!after || !identifierCharacter.test(after));
  });
}

function exactOccurrence(
  text: string,
  exact: string,
  requestedOccurrence: number | undefined,
): { start: number; end: number } | null {
  const found = occurrences(text, exact);
  if (!found.length) return null;
  if (requestedOccurrence === undefined) {
    if (found.length !== 1) return null;
    return { start: found[0], end: found[0] + exact.length };
  }
  if (!Number.isSafeInteger(requestedOccurrence) || requestedOccurrence < 1 || requestedOccurrence > found.length) {
    return null;
  }
  const start = found[requestedOccurrence - 1];
  return { start, end: start + exact.length };
}

function lineAt(text: string, offset: number): number {
  let line = 1;
  for (let index = 0; index < offset; index += 1) if (text.charCodeAt(index) === 10) line += 1;
  return line;
}

function locator(name: string, text: string, start: number, end: number): string {
  const startLine = lineAt(text, start);
  const finalCharacter = Math.max(start, end - 1);
  const endLine = lineAt(text, finalCharacter);
  return `${name}#L${startLine}-L${endLine};chars=${start}-${end}`;
}

function validField(value: unknown): value is string {
  return typeof value === "string" && Boolean(value.trim())
    && byteLength(value) <= MCP_CONTEXT_LIMITS.maxFrameFieldBytes;
}

function validObjectField(value: unknown): value is string {
  return value === "" || validField(value);
}

function validTemporalFrame(
  value: ProposedExactSpanClaim["temporal"],
  quote: string,
  frame: ProposedExactSpanClaim,
): value is NonNullable<ProposedExactSpanClaim["temporal"]> {
  if (!value || typeof value !== "object") return false;
  if (typeof value.axis !== "string" || !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(value.axis)) return false;
  const markerSpan = validField(value.marker) && byteLength(value.marker) <= 120
    ? exactOccurrence(quote, value.marker, undefined)
    : null;
  const frameSpan = exactClaimFrameSpan(frame);
  if (!markerSpan || !frameSpan || !exactTemporalMarkerSharesClause(quote, markerSpan, frameSpan)) return false;
  if (!Number.isSafeInteger(value.from) || value.from < 0 || value.from > 1_000_000_000) return false;
  const to = value.to ?? value.from;
  if (!Number.isSafeInteger(to) || to !== value.from) return false;
  const match = value.marker.trim().toLocaleLowerCase("en-US")
    .match(/^(day|chapter|ch|beat|scene|turn|episode|ep|step|version|v)[\s_:#-]*(\d+)$/);
  if (!match) return false;
  const aliases: Record<string, string> = { ch: "chapter", ep: "episode", v: "version" };
  const markerAxis = aliases[match[1]] ?? match[1];
  return normalized(value.axis) === markerAxis && Number(match[2]) === value.from;
}

function proposalQuoteValid(quote: unknown): quote is string {
  return typeof quote === "string" && Boolean(quote)
    && byteLength(quote) <= MCP_CONTEXT_LIMITS.maxQuoteBytes;
}

export function buildMcpContextPacket(input: McpContextInput): McpContextPacket {
  if (!input || typeof input !== "object" || !Array.isArray(input.documents)) {
    throw new McpContextError("documents must be an array.", "invalid_input");
  }
  if (input.documents.length < 1 || input.documents.length > MCP_CONTEXT_LIMITS.maxDocuments) {
    throw new McpContextError(`At most ${MCP_CONTEXT_LIMITS.maxDocuments} documents are accepted.`, "document_limit");
  }
  const claims = input.claims ?? [];
  const entityMentions = input.entityMentions ?? [];
  const relations = input.relations ?? [];
  if (!Array.isArray(claims) || !Array.isArray(entityMentions) || !Array.isArray(relations)) {
    throw new McpContextError("claims, entityMentions, and relations must be arrays.", "invalid_input");
  }
  if (claims.length + entityMentions.length + relations.length > MCP_CONTEXT_LIMITS.maxProposals) {
    throw new McpContextError(`At most ${MCP_CONTEXT_LIMITS.maxProposals} proposals are accepted.`, "proposal_limit");
  }

  const sourceByName = new Map<string, {
    id: string;
    name: string;
    text: string;
    authority: PacketAuthority;
    bytes: number;
  }>();
  let totalBytes = 0;
  for (const document of input.documents) {
    if (!document || typeof document !== "object") {
      throw new McpContextError("Each document must be an object.", "invalid_input");
    }
    assertDocumentName(document.name);
    if (sourceByName.has(document.name)) {
      throw new McpContextError(`Duplicate document name: ${document.name}`, "invalid_input");
    }
    if (typeof document.text !== "string") {
      throw new McpContextError("Document text must be a string.", "invalid_input");
    }
    const bytes = byteLength(document.text);
    if (bytes > MCP_CONTEXT_LIMITS.maxDocumentBytes) {
      throw new McpContextError(`Document exceeds ${MCP_CONTEXT_LIMITS.maxDocumentBytes} bytes.`, "document_too_large");
    }
    totalBytes += bytes;
    if (totalBytes > MCP_CONTEXT_LIMITS.maxTotalDocumentBytes) {
      throw new McpContextError(`Documents exceed ${MCP_CONTEXT_LIMITS.maxTotalDocumentBytes} total bytes.`, "total_bytes_limit");
    }
    const authority = authorityFor(document.authority);
    const id = stableId("doc", `${document.name}\u0000${document.text}`);
    sourceByName.set(document.name, { id, name: document.name, text: document.text, authority, bytes });
  }

  const rejectedProposals: McpContextPacket["rejectedProposals"] = [];
  const acceptedClaims = new Map<string, McpContextClaim>();
  const acceptedClaimByProposalIndex = new Map<number, McpContextClaim>();
  claims.forEach((proposal, proposalIndex) => {
    const source = proposal && typeof proposal === "object" ? sourceByName.get(proposal.documentName) : undefined;
    if (!source) {
      rejectedProposals.push({ proposalType: "claim", proposalIndex, code: "unknown_document" });
      return;
    }
    if (!proposalQuoteValid(proposal.quote)) {
      rejectedProposals.push({ proposalType: "claim", proposalIndex, code: "invalid_quote" });
      return;
    }
    const span = exactOccurrence(source.text, proposal.quote, proposal.occurrence);
    if (!span) {
      rejectedProposals.push({ proposalType: "claim", proposalIndex, code: "quote_not_unique_or_exact" });
      return;
    }
    if (sourceInstructionRisk(proposal.quote)) {
      rejectedProposals.push({ proposalType: "claim", proposalIndex, code: "source_instruction_quarantined" });
      return;
    }
    if (
      !validField(proposal.claimKind) || !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(proposal.claimKind)
      || !validField(proposal.subject) || !validField(proposal.predicate) || !validObjectField(proposal.object)
      || (proposal.frameArity !== undefined && !["transitive", "intransitive"].includes(proposal.frameArity))
      || !["positive", "negative"].includes(proposal.polarity)
      || !exactClaimFrameAppearsInOrder({
        quote: proposal.quote,
        subject: proposal.subject,
        predicate: proposal.predicate,
        object: proposal.object,
        frameArity: proposal.frameArity,
      })
      || !exactClaimFramePolarityMatches({
        quote: proposal.quote,
        subject: proposal.subject,
        predicate: proposal.predicate,
        object: proposal.object,
        frameArity: proposal.frameArity,
      }, proposal.polarity)
      || (proposal.temporal !== undefined && proposal.temporal !== null && !validTemporalFrame(proposal.temporal, proposal.quote, proposal))
    ) {
      rejectedProposals.push({ proposalType: "claim", proposalIndex, code: "invalid_semantic_frame" });
      return;
    }
    const claimKey = [proposal.claimKind, proposal.subject, proposal.predicate, proposal.object]
      .map(normalized).join(":");
    const temporal = proposal.temporal && validTemporalFrame(proposal.temporal, proposal.quote, proposal)
      ? { axis: normalized(proposal.temporal.axis), from: proposal.temporal.from, to: proposal.temporal.to ?? proposal.temporal.from }
      : null;
    const id = stableId("clm", `${source.id}\u0000${span.start}\u0000${span.end}\u0000${claimKey}\u0000${proposal.polarity}\u0000${JSON.stringify(temporal)}`);
    const acceptedClaim: McpContextClaim = {
      id,
      documentId: source.id,
      assertionOwnerId: source.id,
      quote: proposal.quote,
      locator: locator(source.name, source.text, span.start, span.end),
      start: span.start,
      end: span.end,
      claimKind: normalized(proposal.claimKind),
      claimKey,
      subject: proposal.subject,
      predicate: proposal.predicate,
      object: proposal.object,
      polarity: proposal.polarity,
      temporal,
      authority: source.authority,
      truthStatus: "source_assertion",
      trust: "untrusted_data",
    };
    acceptedClaims.set(id, acceptedClaim);
    acceptedClaimByProposalIndex.set(proposalIndex, acceptedClaim);
  });

  const acceptedRelations = new Map<string, McpContextRelation>();
  relations.forEach((proposal, proposalIndex) => {
    if (!proposal || typeof proposal !== "object"
      || !["precondition", "consequence", "temporal_before"].includes(proposal.relation)
      || !Number.isSafeInteger(proposal.evidenceClaimIndex)
      || !Number.isSafeInteger(proposal.fromClaimIndex)
      || !Number.isSafeInteger(proposal.toClaimIndex)) {
      rejectedProposals.push({ proposalType: "relation", proposalIndex, code: "invalid_relation" });
      return;
    }
    const evidenceClaim = acceptedClaimByProposalIndex.get(proposal.evidenceClaimIndex);
    const fromClaim = acceptedClaimByProposalIndex.get(proposal.fromClaimIndex);
    const toClaim = acceptedClaimByProposalIndex.get(proposal.toClaimIndex);
    if (!evidenceClaim) {
      rejectedProposals.push({ proposalType: "relation", proposalIndex, code: "relation_claim_rejected" });
      return;
    }
    if (!fromClaim || !toClaim) {
      rejectedProposals.push({ proposalType: "relation", proposalIndex, code: "relation_endpoint_rejected" });
      return;
    }
    if (fromClaim.id === toClaim.id) {
      rejectedProposals.push({ proposalType: "relation", proposalIndex, code: "relation_self_edge" });
      return;
    }
    if (evidenceClaim.polarity !== "positive") {
      rejectedProposals.push({ proposalType: "relation", proposalIndex, code: "negative_relation_not_materialized" });
      return;
    }
    if (!exactRelationClaimKindIsAdmissible(evidenceClaim.claimKind)) {
      rejectedProposals.push({ proposalType: "relation", proposalIndex, code: "relation_claim_kind_not_admissible" });
      return;
    }
    if (exactRelationHasUnsupportedLogic(evidenceClaim.quote)) {
      rejectedProposals.push({ proposalType: "relation", proposalIndex, code: "unsupported_relation_logic" });
      return;
    }
    const localCueSpan = validField(proposal.cue)
      ? exactOccurrence(evidenceClaim.quote, proposal.cue, proposal.cueOccurrence)
      : null;
    if (!localCueSpan) {
      rejectedProposals.push({ proposalType: "relation", proposalIndex, code: "relation_cue_not_unique_or_exact" });
      return;
    }
    const endpointsAnchored = fromClaim.documentId === evidenceClaim.documentId
      && toClaim.documentId === evidenceClaim.documentId
      && fromClaim.start >= evidenceClaim.start && fromClaim.end <= evidenceClaim.end
      && toClaim.start >= evidenceClaim.start && toClaim.end <= evidenceClaim.end;
    if (!endpointsAnchored) {
      rejectedProposals.push({ proposalType: "relation", proposalIndex, code: "relation_endpoint_not_anchored" });
      return;
    }
    const cueSpan = {
      start: evidenceClaim.start + localCueSpan.start,
      end: evidenceClaim.start + localCueSpan.end,
    };
    const cueDirection = exactRelationCueDirection(proposal.cue, proposal.relation);
    if (!cueDirection) {
      rejectedProposals.push({ proposalType: "relation", proposalIndex, code: "relation_cue_not_admissible" });
      return;
    }
    if (!exactRelationEndpointsMatch(cueDirection, cueSpan, fromClaim, toClaim, {
      start: evidenceClaim.start,
      text: evidenceClaim.quote,
    }, [...acceptedClaimByProposalIndex.values()]
      .filter((claim) => claim.documentId === evidenceClaim.documentId
        && claim.id !== evidenceClaim.id && claim.id !== fromClaim.id && claim.id !== toClaim.id)
      .map((claim) => ({ start: claim.start, end: claim.end })))) {
      rejectedProposals.push({ proposalType: "relation", proposalIndex, code: "relation_direction_not_anchored" });
      return;
    }
    const id = stableId("rel", [
      evidenceClaim.id, fromClaim.id, toClaim.id, proposal.relation, proposal.cue, cueSpan.start,
    ].join("\u0000"));
    acceptedRelations.set(id, {
      id,
      relation: proposal.relation,
      evidenceClaimId: evidenceClaim.id,
      fromClaimId: fromClaim.id,
      toClaimId: toClaim.id,
      cue: proposal.cue,
      cueStart: cueSpan.start,
      cueEnd: cueSpan.end,
      truthStatus: "source_assertion",
      materialized: true,
    });
  });

  const acceptedEntities = new Map<string, McpEntityCandidate>();
  entityMentions.forEach((proposal, proposalIndex) => {
    const source = proposal && typeof proposal === "object" ? sourceByName.get(proposal.documentName) : undefined;
    if (!source) {
      rejectedProposals.push({ proposalType: "entity", proposalIndex, code: "unknown_document" });
      return;
    }
    if (!proposalQuoteValid(proposal.quote) || !validField(proposal.mention)) {
      rejectedProposals.push({ proposalType: "entity", proposalIndex, code: "invalid_quote_or_mention" });
      return;
    }
    const quoteSpan = exactOccurrence(source.text, proposal.quote, proposal.quoteOccurrence);
    if (!quoteSpan) {
      rejectedProposals.push({ proposalType: "entity", proposalIndex, code: "quote_not_unique_or_exact" });
      return;
    }
    if (sourceInstructionRisk(proposal.quote)) {
      rejectedProposals.push({ proposalType: "entity", proposalIndex, code: "source_instruction_quarantined" });
      return;
    }
    const mentionSpan = exactOccurrence(proposal.quote, proposal.mention, proposal.mentionOccurrence);
    if (!mentionSpan) {
      rejectedProposals.push({ proposalType: "entity", proposalIndex, code: "mention_not_unique_or_exact" });
      return;
    }
    if (proposal.entityType !== undefined && !validField(proposal.entityType)) {
      rejectedProposals.push({ proposalType: "entity", proposalIndex, code: "invalid_entity_type" });
      return;
    }
    if (proposal.identityProfile !== undefined
      && !["natural_language", "case_sensitive_symbol", "opaque_identifier"].includes(proposal.identityProfile)) {
      rejectedProposals.push({ proposalType: "entity", proposalIndex, code: "invalid_identity_profile" });
      return;
    }
    if (proposal.explicitId !== undefined && (!validField(proposal.explicitId) || !containsExactIdentifier(proposal.quote, proposal.explicitId))) {
      rejectedProposals.push({ proposalType: "entity", proposalIndex, code: "unanchored_explicit_id" });
      return;
    }
    const start = quoteSpan.start + mentionSpan.start;
    const end = quoteSpan.start + mentionSpan.end;
    const groupId = stableId("entgrp", normalized(proposal.mention));
    const explicitId = proposal.explicitId ?? null;
    const identityProfile = inferredIdentityProfile(proposal.entityType, proposal.identityProfile);
    const referentKey = explicitId
      ? `source:${source.id}:explicit:${identityProfile}:${identityKey(explicitId, identityProfile)}`
      : `mention:${normalized(proposal.mention)}`;
    const id = stableId("ent", `${source.id}\u0000${start}\u0000${end}\u0000${referentKey}`);
    acceptedEntities.set(id, {
      id,
      groupId,
      documentId: source.id,
      assertionOwnerId: source.id,
      mention: proposal.mention,
      entityType: normalized(proposal.entityType ?? "unknown"),
      identityProfile,
      explicitId,
      referentKey,
      quote: proposal.quote,
      locator: locator(source.name, source.text, start, end),
      start,
      end,
      resolution: explicitId ? "source_scoped_explicit" : "unresolved",
      authority: source.authority,
      trust: "untrusted_data",
    });
  });

  const compiledClaims = [...acceptedClaims.values()].sort((a, b) => a.id.localeCompare(b.id));
  const compiledEntities = [...acceptedEntities.values()].sort((a, b) => a.id.localeCompare(b.id));
  const compiledRelations = [...acceptedRelations.values()].sort((a, b) => a.id.localeCompare(b.id));

  const conflicts: McpContextPacket["conflicts"] = [];
  const byKey = new Map<string, McpContextClaim[]>();
  for (const claim of compiledClaims) {
    const temporalFrame = claim.temporal
      ? `${claim.temporal.axis}:${claim.temporal.from}:${claim.temporal.to}`
      : "unframed";
    const frameKey = `${claim.claimKey}\u0000${temporalFrame}`;
    byKey.set(frameKey, [...(byKey.get(frameKey) ?? []), claim]);
  }
  for (const [frameKey, grouped] of [...byKey.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const claimKey = frameKey.split("\u0000", 1)[0];
    const positiveClaimIds = grouped.filter((claim) => claim.polarity === "positive").map((claim) => claim.id).sort();
    const negativeClaimIds = grouped.filter((claim) => claim.polarity === "negative").map((claim) => claim.id).sort();
    if (!positiveClaimIds.length || !negativeClaimIds.length) continue;
    conflicts.push({
      id: stableId("conf", frameKey),
      claimKey,
      positiveClaimIds,
      negativeClaimIds,
      status: "source_disagreement",
      projectTruthResolved: false,
    });
  }

  const groupMap = new Map<string, McpEntityCandidate[]>();
  for (const candidate of compiledEntities) {
    groupMap.set(candidate.groupId, [...(groupMap.get(candidate.groupId) ?? []), candidate]);
  }
  const entityCandidateGroups = [...groupMap.entries()].map(([id, candidates]) => {
    const explicit = candidates.every((candidate) => candidate.resolution === "source_scoped_explicit");
    const distinctReferents = new Set(candidates.map((candidate) => candidate.referentKey)).size;
    return {
      id,
      normalizedMention: normalized(candidates[0].mention),
      candidateIds: candidates.map((candidate) => candidate.id).sort(),
      resolution: (
        explicit && distinctReferents === 1 ? "source_scoped_explicit"
          : candidates.length > 1 ? "ambiguous"
            : explicit ? "source_scoped_explicit"
            : "single_unresolved"
      ) as "ambiguous" | "single_unresolved" | "source_scoped_explicit",
    };
  }).sort((a, b) => a.id.localeCompare(b.id));

  const submittedProposalCount = claims.length + entityMentions.length + relations.length;
  const acceptedProposalCount = submittedProposalCount - rejectedProposals.length;
  const documents = [...sourceByName.values()].map((source) => ({
    id: source.id,
    name: source.name,
    byteSize: source.bytes,
    lineCount: source.text.length ? source.text.split("\n").length : 0,
    contentFingerprint: `fnv64:${fingerprint(source.text)}`,
    authority: source.authority,
    trust: "untrusted_data" as const,
    flags: sourceInstructionRisk(source.text) ? ["possible_source_instruction"] : [],
  })).sort((a, b) => a.name.localeCompare(b.name));

  const diagnostics = [
    "Uploaded text is untrusted data; packet-relative authority establishes source assertions only.",
    "Closed membership covers only the submitted packet and does not establish complete project or corpus coverage.",
  ];
  if (rejectedProposals.length) diagnostics.push(`${rejectedProposals.length} proposal(s) were rejected by exact-span or safety validation.`);
  if (conflicts.length) diagnostics.push(`${conflicts.length} same-key opposite-polarity source disagreement(s) were preserved without resolving project truth.`);
  if (compiledRelations.length) diagnostics.push(`${compiledRelations.length} exact-span relation(s) were admitted as source assertions, not reachability proofs.`);

  return {
    version: MCP_CONTEXT_VERSION,
    stateless: true,
    providerCalls: 0,
    documents,
    claims: compiledClaims,
    entityCandidates: compiledEntities,
    relations: compiledRelations,
    entityCandidateGroups,
    conflicts,
    membershipCoverage: {
      scope: "submitted_packet_membership",
      closure: "closed",
      submittedDocuments: input.documents.length,
      acceptedDocuments: documents.length,
      completeForSubmittedPacket: true,
      completeForProjectCorpus: false,
    },
    proposalCoverage: {
      submitted: submittedProposalCount,
      accepted: acceptedProposalCount,
      rejected: rejectedProposals.length,
      closure: rejectedProposals.length ? "partial" : "closed",
    },
    rejectedProposals: rejectedProposals.sort((a, b) =>
      a.proposalType.localeCompare(b.proposalType) || a.proposalIndex - b.proposalIndex),
    diagnostics,
  };
}

export type PublicGitHubInspectionLimits = {
  maxTreeEntries: number;
  maxFiles: number;
  maxProviderCalls: number;
  maxFileBytes: number;
  maxTotalFileBytes: number;
  maxExcerptBytesPerFile: number;
  maxTotalExcerptBytes: number;
  maxQuestionBytes: number;
};

export type PublicGitHubInspection = {
  version: typeof MCP_CONTEXT_VERSION;
  stateless: true;
  access: "public_only";
  repository: RepositoryReference;
  requestedRef: string;
  pinnedCommit: string;
  pinnedTree: string;
  question: string;
  scope: RepositoryProjectScopeResolution;
  excerpts: Array<{
    id: string;
    path: string;
    locator: string;
    startLine: number;
    endLine: number;
    text: string;
    byteSize: number;
    relevanceScore: number;
    blobSha: string;
    authority: {
      scope: "packet_relative";
      establishes: "repository_source_assertion";
      projectTruth: false;
    };
    trust: "untrusted_data";
    flags: string[];
  }>;
  omitted: Array<{ path: string; reason: string }>;
  authority: {
    scope: "packet_relative";
    establishes: "repository_source_assertion";
    projectTruth: false;
  };
  membershipCoverage: {
    pinned: true;
    treeComplete: boolean;
    entriesReported: number;
    entriesExamined: number;
    selectedFiles: number;
    omittedFiles: number;
  };
  semanticCoverage: {
    closure: "partial" | "open";
    scope: "question_relevant_public_excerpts";
    completeForProjectTruth: false;
    reasons: string[];
  };
  usage: {
    providerCalls: number;
    filesRead: number;
    bytesRead: number;
    excerptBytes: number;
  };
};

type RepositoryLimitOverrides = Partial<{
  maxTreeEntries: number;
  maxFiles: number;
  maxProviderCalls: number;
  maxFileBytes: number;
  maxTotalFileBytes: number;
  maxExcerptBytesPerFile: number;
  maxTotalExcerptBytes: number;
  maxQuestionBytes: number;
}>;

export type InspectPublicGitHubInput = {
  repository: string | RepositoryReference;
  question: string;
  requestedRef?: string;
  projectScope?: string;
  limits?: RepositoryLimitOverrides;
};

function repositoryLimits(overrides: RepositoryLimitOverrides | undefined): PublicGitHubInspectionLimits {
  const result: PublicGitHubInspectionLimits = { ...MCP_REPOSITORY_LIMITS };
  for (const key of Object.keys(result) as Array<keyof typeof result>) {
    const proposed = overrides?.[key];
    if (proposed === undefined) continue;
    if (!Number.isSafeInteger(proposed) || proposed < 1 || proposed > HARD_REPOSITORY_LIMITS[key]) {
      throw new McpContextError(`Invalid or unsafe repository limit: ${key}.`, "repository_limit");
    }
    result[key] = proposed;
  }
  if (result.maxProviderCalls < 2) {
    throw new McpContextError("At least two provider calls are required to pin and list a repository.", "repository_limit");
  }
  if (result.maxExcerptBytesPerFile > result.maxTotalExcerptBytes) {
    throw new McpContextError("Per-file excerpt bytes cannot exceed total excerpt bytes.", "repository_limit");
  }
  if (result.maxFileBytes > result.maxTotalFileBytes) {
    throw new McpContextError("Per-file bytes cannot exceed total file bytes.", "repository_limit");
  }
  return result;
}

const STOP_WORDS = new Set([
  "about", "after", "before", "could", "does", "from", "have", "into", "that",
  "their", "there", "these", "this", "what", "when", "where", "which", "with", "would",
]);

function questionTerms(question: string): string[] {
  return [...new Set((question.toLocaleLowerCase("en-US").match(/[\p{L}\p{N}_-]{3,}/gu) ?? [])
    .filter((term) => !STOP_WORDS.has(term)))].sort();
}

function pathRelevance(path: string, terms: string[]): number {
  const lower = path.toLocaleLowerCase("en-US");
  const basename = lower.split("/").at(-1) ?? lower;
  let score = terms.reduce((total, term) => total + (lower.includes(term) ? 20 : 0), 0);
  if (/^(?:readme|agents|contributing)(?:\.|$)/.test(basename)) score += 5;
  if (/(?:canon|spec|decision|requirement|contract|policy|test|event|ledger|manifest)/.test(lower)) score += 4;
  if (/\.(?:md|txt|json|ya?ml|csv|ts|tsx|js|jsx)$/i.test(path)) score += 1;
  return score;
}

function sourcePathControlRisk(path: string): boolean {
  return sourceInstructionRisk(path)
    || /CONTINUITY_FILE|^##\s*FILE:/iu.test(path);
}

function reportedRepositoryPath(path: string): string {
  return sourcePathControlRisk(path)
    ? `[quarantined-source-path:${fingerprint(path)}]`
    : path;
}

function validCommitHash(value: string): boolean {
  return /^[a-f0-9]{40}$/i.test(value);
}

function candidateEntries(
  entries: RepositoryTreeEntry[],
  terms: string[],
  limits: PublicGitHubInspectionLimits,
): {
  candidates: RepositoryTreeEntry[];
  omitted: Array<{ path: string; reason: string }>;
  omittedCount: number;
  examined: number;
  openReasons: string[];
} {
  const examinedEntries = entries.slice(0, limits.maxTreeEntries);
  const beyondTreeLimit = Math.max(0, entries.length - limits.maxTreeEntries);
  const omitted = entries.slice(limits.maxTreeEntries, limits.maxTreeEntries + 256)
    .map((entry) => ({ path: reportedRepositoryPath(entry.path), reason: "tree_entry_limit" }));
  let omittedCount = beyondTreeLimit;
  const openReasons = entries.length > limits.maxTreeEntries ? ["tree_entry_limit"] : [];
  const candidates: Array<{ entry: RepositoryTreeEntry; score: number }> = [];
  for (const entry of examinedEntries) {
    if (sourcePathControlRisk(entry.path)) {
      omitted.push({ path: reportedRepositoryPath(entry.path), reason: "source_instruction_path_quarantined" });
      omittedCount += 1;
      continue;
    }
    if (entry.type !== "blob" || entry.mode === "120000" || entry.mode === "160000") {
      omitted.push({ path: reportedRepositoryPath(entry.path), reason: "not_regular_blob" });
      omittedCount += 1;
      continue;
    }
    if (!isSafeRepositoryPath(entry.path)) {
      omitted.push({ path: reportedRepositoryPath(entry.path), reason: "unsafe_or_unsupported_path" });
      omittedCount += 1;
      continue;
    }
    if (entry.size === null || !Number.isSafeInteger(entry.size) || entry.size < 0) {
      omitted.push({ path: entry.path, reason: "unknown_size" });
      omittedCount += 1;
      openReasons.push("unknown_file_size");
      continue;
    }
    if (entry.size === 0) {
      omitted.push({ path: entry.path, reason: "empty" });
      omittedCount += 1;
      continue;
    }
    if (entry.size > limits.maxFileBytes) {
      omitted.push({ path: entry.path, reason: "file_byte_limit" });
      omittedCount += 1;
      continue;
    }
    candidates.push({ entry, score: pathRelevance(entry.path, terms) });
  }
  candidates.sort((a, b) => b.score - a.score || a.entry.path.localeCompare(b.entry.path));

  const selected: RepositoryTreeEntry[] = [];
  let plannedBytes = 0;
  const readableCallLimit = Math.max(0, limits.maxProviderCalls - 2);
  for (const { entry } of candidates) {
    if (selected.length >= limits.maxFiles || selected.length >= readableCallLimit) {
      omitted.push({ path: entry.path, reason: selected.length >= readableCallLimit ? "provider_call_limit" : "file_count_limit" });
      omittedCount += 1;
      continue;
    }
    const size = entry.size ?? 0;
    if (plannedBytes + size > limits.maxTotalFileBytes) {
      omitted.push({ path: entry.path, reason: "total_file_byte_limit" });
      omittedCount += 1;
      continue;
    }
    selected.push(entry);
    plannedBytes += size;
  }
  return { candidates: selected, omitted, omittedCount, examined: examinedEntries.length, openReasons };
}

function decodeRepositoryText(bytes: Uint8Array): string | null {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return text.includes("\u0000") ? null : text;
  } catch {
    return null;
  }
}

function relevantExcerpt(text: string, terms: string[], byteBudget: number): {
  text: string;
  startLine: number;
  endLine: number;
  score: number;
} | null {
  if (byteBudget < 1) return null;
  const lines = text.split(/\r?\n/);
  if (!lines.length) return null;
  let bestIndex = 0;
  let bestScore = -1;
  for (let index = 0; index < lines.length; index += 1) {
    const lower = lines[index].toLocaleLowerCase("en-US");
    const score = terms.reduce((total, term) => total + (lower.includes(term) ? 1 : 0), 0);
    if (score > bestScore) {
      bestIndex = index;
      bestScore = score;
    }
  }
  let start = Math.max(0, bestIndex - 3);
  let end = Math.min(lines.length - 1, bestIndex + 3);
  let selected = lines.slice(start, end + 1).join("\n");
  while (byteLength(selected) > byteBudget && end > start) {
    if (end - bestIndex >= bestIndex - start) end -= 1;
    else start += 1;
    selected = lines.slice(start, end + 1).join("\n");
  }
  if (byteLength(selected) > byteBudget) {
    const bytes = encoder.encode(selected).slice(0, byteBudget);
    selected = new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/\uFFFD$/u, "");
  }
  const escaped = escapeRepositoryPacketControlSyntax(selected);
  if (!escaped) return null;
  return { text: escaped, startLine: start + 1, endLine: end + 1, score: Math.max(0, bestScore) };
}

/**
 * Inspect a public GitHub repository through an injected, separately bounded
 * provider. The helper resolves the mutable ref once, then reads only entries
 * from that immutable tree. It accepts no credential and persists nothing.
 */
export async function inspectPublicGitHubRepository(
  provider: RepositoryProvider,
  input: InspectPublicGitHubInput,
): Promise<PublicGitHubInspection> {
  if (!input || typeof input !== "object") {
    throw new McpContextError("A repository inspection input is required.", "invalid_input");
  }
  if (!provider || provider.provider !== "github") {
    throw new McpContextError("A GitHub RepositoryProvider is required.", "invalid_input");
  }
  const limits = repositoryLimits(input.limits);
  if (typeof input.question !== "string" || !input.question.trim() || byteLength(input.question) > limits.maxQuestionBytes) {
    throw new McpContextError("A bounded non-empty question is required.", "invalid_input");
  }
  const repository = typeof input.repository === "string"
    ? parseGitHubRepository(input.repository)
    : parseGitHubRepository(input.repository?.fullName ?? "");
  const requestedRef = input.requestedRef?.trim() || "HEAD";
  if (
    requestedRef.length > 200 || !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(requestedRef)
    || requestedRef.includes("..") || requestedRef.includes("//")
  ) throw new McpContextError("The Git reference is invalid.", "invalid_input");
  let providerCalls = 0;
  providerCalls += 1;
  const revision = await provider.resolveRevision(repository, requestedRef);
  if (!validCommitHash(revision.commitSha) || !validCommitHash(revision.treeSha)) {
    throw new McpContextError("Provider did not pin a full immutable commit and tree SHA.", "repository_invalid_response");
  }
  providerCalls += 1;
  const tree = await provider.listTree(repository, revision);
  if (!tree || !Array.isArray(tree.entries) || typeof tree.truncated !== "boolean") {
    throw new McpContextError("Provider returned an invalid tree.", "repository_invalid_response");
  }

  let filesRead = 0;
  let bytesRead = 0;
  let declaredScopes: RepositoryProjectScope[] = [];
  const scopeConfigEntry = findRepositoryScopeConfigEntry(tree.entries);
  if (
    scopeConfigEntry
    && providerCalls < limits.maxProviderCalls
    && scopeConfigEntry.mode !== "120000"
    && scopeConfigEntry.size !== null
    && Number.isSafeInteger(scopeConfigEntry.size)
    && scopeConfigEntry.size > 0
    && scopeConfigEntry.size <= Math.min(limits.maxFileBytes, 128 * 1024)
  ) {
    providerCalls += 1;
    try {
      const blob = await provider.readBlob(repository, scopeConfigEntry);
      if (
        blob.bytes instanceof Uint8Array
        && blob.byteSize === blob.bytes.byteLength
        && blob.byteSize === scopeConfigEntry.size
        && blob.providerHash.toLocaleLowerCase("en-US") === scopeConfigEntry.sha.toLocaleLowerCase("en-US")
      ) {
        const text = decodeRepositoryText(blob.bytes);
        if (text !== null && !scanRepositoryTextForSecrets(text).detected) {
          declaredScopes = parseDeclaredRepositoryProjectScopes(text);
          filesRead += 1;
          bytesRead += blob.byteSize;
        }
      }
    } catch {
      // Scope hints are optional and repository-declared. Discovery from the
      // immutable tree remains available when their bounded read fails.
    }
  }
  const scopeCandidates = discoverRepositoryProjectScopes(tree.entries, declaredScopes, repository.fullName);
  const scope = resolveRepositoryProjectScope(tree.entries, scopeCandidates, input.question, input.projectScope);

  const scopeSummary = (candidate: (typeof scopeCandidates)[number]) => ({
    id: candidate.id,
    label: candidate.label,
    rootPath: candidate.rootPath,
    kind: candidate.kind,
    origin: candidate.origin,
    signals: candidate.signals,
    include: candidate.include,
    exclude: candidate.exclude,
  });
  if (scope.status !== "resolved" || !scope.selected) {
    const reason = scope.status === "ambiguous" ? "project_scope_ambiguous" : "project_scope_not_found";
    return {
      version: MCP_CONTEXT_VERSION,
      stateless: true,
      access: "public_only",
      repository,
      requestedRef,
      pinnedCommit: revision.commitSha.toLocaleLowerCase("en-US"),
      pinnedTree: revision.treeSha.toLocaleLowerCase("en-US"),
      question: input.question.trim(),
      scope: {
        ...scope,
        candidates: scope.candidates.map(scopeSummary),
        selected: null,
      },
      excerpts: [],
      omitted: [],
      authority: {
        scope: "packet_relative",
        establishes: "repository_source_assertion",
        projectTruth: false,
      },
      membershipCoverage: {
        pinned: true,
        treeComplete: !tree.truncated && tree.entries.length <= limits.maxTreeEntries,
        entriesReported: tree.entries.length,
        entriesExamined: Math.min(tree.entries.length, limits.maxTreeEntries),
        selectedFiles: 0,
        omittedFiles: 0,
      },
      semanticCoverage: {
        closure: "open",
        scope: "question_relevant_public_excerpts",
        completeForProjectTruth: false,
        reasons: [reason],
      },
      usage: { providerCalls, filesRead, bytesRead, excerptBytes: 0 },
    };
  }

  const scopedEntries = tree.entries.filter((entry) => repositoryEntryBelongsToScope(entry, scope.selected!));
  const outsideScope = tree.entries.length - scopedEntries.length;
  const terms = questionTerms(input.question);
  const selectionLimits = {
    ...limits,
    maxProviderCalls: Math.max(2, 2 + limits.maxProviderCalls - providerCalls),
  };
  const selection = candidateEntries(scopedEntries, terms, selectionLimits);
  const omitted = [...selection.omitted];
  let omittedCount = selection.omittedCount + outsideScope;
  const openReasons = [...selection.openReasons];
  if (tree.truncated) openReasons.push("provider_tree_truncated");
  const excerpts: PublicGitHubInspection["excerpts"] = [];
  let excerptBytes = 0;

  for (const entry of selection.candidates) {
    if (providerCalls >= limits.maxProviderCalls) {
      omitted.push({ path: entry.path, reason: "provider_call_limit" });
      omittedCount += 1;
      continue;
    }
    providerCalls += 1;
    let blob;
    try {
      blob = await provider.readBlob(repository, entry);
    } catch {
      omitted.push({ path: entry.path, reason: "read_failure" });
      omittedCount += 1;
      openReasons.push("provider_read_failure");
      continue;
    }
    filesRead += 1;
    if (
      !(blob.bytes instanceof Uint8Array)
      || blob.byteSize !== blob.bytes.byteLength
      || blob.byteSize !== entry.size
      || blob.providerHash.toLocaleLowerCase("en-US") !== entry.sha.toLocaleLowerCase("en-US")
      || blob.byteSize > limits.maxFileBytes
      || bytesRead + blob.byteSize > limits.maxTotalFileBytes
    ) {
      omitted.push({ path: entry.path, reason: "blob_identity_or_byte_mismatch" });
      omittedCount += 1;
      openReasons.push("blob_identity_or_byte_mismatch");
      continue;
    }
    bytesRead += blob.byteSize;
    const text = decodeRepositoryText(blob.bytes);
    if (text === null) {
      omitted.push({ path: entry.path, reason: "non_text_content" });
      omittedCount += 1;
      continue;
    }
    const secrets = scanRepositoryTextForSecrets(text);
    if (secrets.detected) {
      omitted.push({ path: entry.path, reason: `secret_detected:${secrets.kinds.join(",")}` });
      omittedCount += 1;
      continue;
    }
    const remaining = Math.min(
      limits.maxExcerptBytesPerFile,
      limits.maxTotalExcerptBytes - excerptBytes,
    );
    const excerpt = relevantExcerpt(text, terms, remaining);
    if (!excerpt) {
      omitted.push({ path: entry.path, reason: "excerpt_byte_limit" });
      omittedCount += 1;
      continue;
    }
    if (sourceInstructionRisk(excerpt.text)) {
      omitted.push({ path: entry.path, reason: "source_instruction_quarantined" });
      omittedCount += 1;
      continue;
    }
    const size = byteLength(excerpt.text);
    excerptBytes += size;
    excerpts.push({
      id: stableId("repoev", `${revision.commitSha}\u0000${entry.path}\u0000${excerpt.startLine}\u0000${excerpt.endLine}\u0000${excerpt.text}`),
      path: entry.path,
      locator: `${entry.path}@${revision.commitSha}#L${excerpt.startLine}-L${excerpt.endLine}`,
      startLine: excerpt.startLine,
      endLine: excerpt.endLine,
      text: excerpt.text,
      byteSize: size,
      relevanceScore: excerpt.score,
      blobSha: entry.sha.toLocaleLowerCase("en-US"),
      authority: {
        scope: "packet_relative",
        establishes: "repository_source_assertion",
        projectTruth: false,
      },
      trust: "untrusted_data",
      flags: sourceInstructionRisk(excerpt.text) ? ["possible_source_instruction"] : [],
    });
  }

  excerpts.sort((a, b) => b.relevanceScore - a.relevanceScore || a.path.localeCompare(b.path));
  const treeComplete = !tree.truncated && tree.entries.length <= limits.maxTreeEntries;
  const reasons = new Set<string>(["question_relevant_excerpt_selection"]);
  for (const item of omitted) reasons.add(item.reason.split(":", 1)[0]);
  for (const reason of openReasons) reasons.add(reason);
  const closure: "partial" | "open" = treeComplete && openReasons.length === 0 ? "partial" : "open";
  return {
    version: MCP_CONTEXT_VERSION,
    stateless: true,
    access: "public_only",
    repository,
    requestedRef,
    pinnedCommit: revision.commitSha.toLocaleLowerCase("en-US"),
    pinnedTree: revision.treeSha.toLocaleLowerCase("en-US"),
    question: input.question.trim(),
    scope: {
      ...scope,
      selected: scopeSummary(scope.selected),
      candidates: scope.candidates.map(scopeSummary),
    },
    excerpts,
    omitted: omitted.slice(0, 256).sort((a, b) => a.path.localeCompare(b.path) || a.reason.localeCompare(b.reason)),
    authority: {
      scope: "packet_relative",
      establishes: "repository_source_assertion",
      projectTruth: false,
    },
    membershipCoverage: {
      pinned: true,
      treeComplete,
      entriesReported: tree.entries.length,
      entriesExamined: selection.examined,
      selectedFiles: selection.candidates.length,
      omittedFiles: omittedCount,
    },
    semanticCoverage: {
      closure,
      scope: "question_relevant_public_excerpts",
      completeForProjectTruth: false,
      reasons: [...reasons].sort(),
    },
    usage: { providerCalls, filesRead, bytesRead, excerptBytes },
  };
}
