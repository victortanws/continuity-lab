import type { DomainProfileProposal } from "./domain-profile";
import type { ContinuityEntityPackage } from "./entity-package";
import type { IdentityLinkPackage } from "./identity-link-package";
import type { McpContextPacket } from "./mcp-context";
import type { ReviewedKnowledgeReceipt } from "./reviewed-knowledge";

export const KNOWLEDGE_SNAPSHOT_VERSION = "continuity.knowledge-snapshot.v1" as const;
export const KNOWLEDGE_SNAPSHOT_LIMITS = Object.freeze({ maxPreviousDocuments: 256 } as const);

export type KnowledgeSnapshotSourceBinding = {
  kind: "direct_upload" | "public_github_excerpts";
  repository: string | null;
  pinnedCommit: string | null;
  scope: { id: string; label: string; rootPath: string } | null;
};

export type PreviousKnowledgeSnapshot = {
  version: typeof KNOWLEDGE_SNAPSHOT_VERSION;
  snapshotFingerprint: string;
  sourceBinding: KnowledgeSnapshotSourceBinding;
  documents: Array<{ name: string; contentFingerprint: string }>;
  componentFingerprints: {
    entityPackage: string;
    identityLinks: string;
    domainProfile: string;
    reviewedKnowledge: string;
  };
};

export type KnowledgeSnapshot = PreviousKnowledgeSnapshot & {
  mode: "delta_packet" | "complete_packet";
  comparison: {
    status: "no_previous_snapshot" | "validated_previous_snapshot" | "previous_snapshot_rejected";
    previousSnapshotFingerprint: string | null;
    newDocuments: string[];
    changedDocuments: string[];
    unchangedDocuments: string[];
    removedDocuments: string[];
    removalSemantics: "not_evaluated" | "complete_packet_only";
    reusableUnchangedDocuments: number;
  };
  coverage: {
    completeForSubmittedPacket: true;
    completeForProjectCorpus: false;
    questionScopedRepositoryExcerpts: boolean;
  };
  policy: {
    immutableSourceFingerprints: true;
    incrementalComparisonOnly: true;
    persistenceExternalToKeylessMcp: true;
    safeToInferRemovedRepositoryFacts: false;
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

function normalizedDocuments(documents: PreviousKnowledgeSnapshot["documents"]): PreviousKnowledgeSnapshot["documents"] {
  return documents.map((document) => ({ name: document.name, contentFingerprint: document.contentFingerprint }))
    .sort((left, right) => left.name.localeCompare(right.name) || left.contentFingerprint.localeCompare(right.contentFingerprint));
}

function snapshotFingerprint(value: Omit<PreviousKnowledgeSnapshot, "snapshotFingerprint" | "version">): string {
  return `fnv64:${fingerprint(JSON.stringify({
    sourceBinding: value.sourceBinding,
    documents: normalizedDocuments(value.documents),
    componentFingerprints: value.componentFingerprints,
  }))}`;
}

function boundaryMatches(left: KnowledgeSnapshotSourceBinding, right: KnowledgeSnapshotSourceBinding): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "direct_upload") return true;
  return left.repository === right.repository
    && left.scope?.id === right.scope?.id
    && left.scope?.rootPath === right.scope?.rootPath;
}

function validPrevious(previous: PreviousKnowledgeSnapshot | null | undefined): previous is PreviousKnowledgeSnapshot {
  if (!previous || previous.version !== KNOWLEDGE_SNAPSHOT_VERSION || typeof previous.snapshotFingerprint !== "string") return false;
  if (!Array.isArray(previous.documents) || previous.documents.length > KNOWLEDGE_SNAPSHOT_LIMITS.maxPreviousDocuments) return false;
  if (!previous.sourceBinding || !previous.componentFingerprints) return false;
  return previous.snapshotFingerprint === snapshotFingerprint({
    sourceBinding: previous.sourceBinding,
    documents: previous.documents,
    componentFingerprints: previous.componentFingerprints,
  });
}

export function buildKnowledgeSnapshot(input: {
  packet: McpContextPacket;
  entityPackage: ContinuityEntityPackage;
  identityLinks: IdentityLinkPackage;
  domainProfile: DomainProfileProposal;
  reviewedKnowledge: ReviewedKnowledgeReceipt;
  sourceBinding: KnowledgeSnapshotSourceBinding;
  previousSnapshot?: PreviousKnowledgeSnapshot | null;
  requestedMode?: "delta_packet" | "complete_packet" | null;
}): KnowledgeSnapshot {
  const requestedComplete = input.requestedMode === "complete_packet";
  const mode = requestedComplete && input.sourceBinding.kind === "direct_upload" ? "complete_packet" : "delta_packet";
  const documents = normalizedDocuments(input.packet.documents.map((document) => ({
    name: document.name,
    contentFingerprint: document.contentFingerprint,
  })));
  const componentFingerprints = {
    entityPackage: input.entityPackage.packageFingerprint,
    identityLinks: input.identityLinks.packageFingerprint,
    domainProfile: input.domainProfile.profileFingerprint,
    reviewedKnowledge: input.reviewedKnowledge.receiptFingerprint,
  };
  const base = { sourceBinding: input.sourceBinding, documents, componentFingerprints };
  const currentFingerprint = snapshotFingerprint(base);
  const validatedPrevious = validPrevious(input.previousSnapshot)
    && boundaryMatches(input.previousSnapshot.sourceBinding, input.sourceBinding)
    ? input.previousSnapshot : null;
  const previousIsValid = validatedPrevious !== null;
  const previousByName = new Map(validatedPrevious
    ? validatedPrevious.documents.map((document) => [document.name, document.contentFingerprint] as const)
    : []);
  const currentByName = new Map(documents.map((document) => [document.name, document.contentFingerprint] as const));
  const newDocuments = documents.filter((document) => !previousByName.has(document.name)).map((document) => document.name);
  const changedDocuments = documents.filter((document) => previousByName.has(document.name)
    && previousByName.get(document.name) !== document.contentFingerprint).map((document) => document.name);
  const unchangedDocuments = documents.filter((document) => previousByName.get(document.name) === document.contentFingerprint).map((document) => document.name);
  const removedDocuments = validatedPrevious && mode === "complete_packet"
    ? validatedPrevious.documents.filter((document) => !currentByName.has(document.name)).map((document) => document.name).sort()
    : [];
  const status = !input.previousSnapshot ? "no_previous_snapshot"
    : previousIsValid ? "validated_previous_snapshot" : "previous_snapshot_rejected";
  const diagnostics = [
    "The snapshot compares immutable source fingerprints and reviewed receipts; it does not persist data inside this keyless MCP.",
    "Commit the snapshot receipt to a governed repository or store it in an authenticated workspace before later agents reuse it.",
  ];
  if (requestedComplete && input.sourceBinding.kind === "public_github_excerpts") {
    diagnostics.push("Complete-packet removal semantics were disabled because repository excerpts are question-scoped, not a complete repository corpus.");
  }
  if (input.previousSnapshot && !previousIsValid) diagnostics.push("The previous snapshot was rejected because its fingerprint or project boundary did not validate.");
  return {
    version: KNOWLEDGE_SNAPSHOT_VERSION,
    snapshotFingerprint: currentFingerprint,
    sourceBinding: input.sourceBinding,
    documents,
    componentFingerprints,
    mode,
    comparison: {
      status,
      previousSnapshotFingerprint: validatedPrevious?.snapshotFingerprint ?? null,
      newDocuments: previousIsValid ? newDocuments : documents.map((document) => document.name),
      changedDocuments: previousIsValid ? changedDocuments : [],
      unchangedDocuments: previousIsValid ? unchangedDocuments : [],
      removedDocuments,
      removalSemantics: mode === "complete_packet" ? "complete_packet_only" : "not_evaluated",
      reusableUnchangedDocuments: previousIsValid ? unchangedDocuments.length : 0,
    },
    coverage: {
      completeForSubmittedPacket: true,
      completeForProjectCorpus: false,
      questionScopedRepositoryExcerpts: input.sourceBinding.kind === "public_github_excerpts",
    },
    policy: {
      immutableSourceFingerprints: true,
      incrementalComparisonOnly: true,
      persistenceExternalToKeylessMcp: true,
      safeToInferRemovedRepositoryFacts: false,
    },
    diagnostics,
  };
}

const SOURCE_BINDING_SCHEMA = {
  type: "object", additionalProperties: false, required: ["kind", "repository", "pinnedCommit", "scope"], properties: {
    kind: { type: "string", enum: ["direct_upload", "public_github_excerpts"] }, repository: { type: ["string", "null"] }, pinnedCommit: { type: ["string", "null"] },
    scope: { type: ["object", "null"], additionalProperties: false, required: ["id", "label", "rootPath"], properties: { id: { type: "string" }, label: { type: "string" }, rootPath: { type: "string" } } },
  },
} as const;

const DOCUMENT_SCHEMA = { type: "object", additionalProperties: false, required: ["name", "contentFingerprint"], properties: { name: { type: "string" }, contentFingerprint: { type: "string" } } } as const;
const COMPONENT_SCHEMA = { type: "object", additionalProperties: false, required: ["entityPackage", "identityLinks", "domainProfile", "reviewedKnowledge"], properties: {
  entityPackage: { type: "string" }, identityLinks: { type: "string" }, domainProfile: { type: "string" }, reviewedKnowledge: { type: "string" },
} } as const;

export const PREVIOUS_KNOWLEDGE_SNAPSHOT_INPUT_SCHEMA = {
  type: "object", additionalProperties: false, required: ["version", "snapshotFingerprint", "sourceBinding", "documents", "componentFingerprints"], properties: {
    version: { type: "string", enum: [KNOWLEDGE_SNAPSHOT_VERSION] }, snapshotFingerprint: { type: "string" }, sourceBinding: SOURCE_BINDING_SCHEMA,
    documents: { type: "array", maxItems: KNOWLEDGE_SNAPSHOT_LIMITS.maxPreviousDocuments, items: DOCUMENT_SCHEMA }, componentFingerprints: COMPONENT_SCHEMA,
  },
} as const;

export const KNOWLEDGE_SNAPSHOT_JSON_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["version", "snapshotFingerprint", "sourceBinding", "documents", "componentFingerprints", "mode", "comparison", "coverage", "policy", "diagnostics"],
  properties: {
    ...PREVIOUS_KNOWLEDGE_SNAPSHOT_INPUT_SCHEMA.properties,
    mode: { type: "string", enum: ["delta_packet", "complete_packet"] },
    comparison: { type: "object", additionalProperties: false, required: ["status", "previousSnapshotFingerprint", "newDocuments", "changedDocuments", "unchangedDocuments", "removedDocuments", "removalSemantics", "reusableUnchangedDocuments"], properties: {
      status: { type: "string", enum: ["no_previous_snapshot", "validated_previous_snapshot", "previous_snapshot_rejected"] }, previousSnapshotFingerprint: { type: ["string", "null"] },
      newDocuments: { type: "array", items: { type: "string" } }, changedDocuments: { type: "array", items: { type: "string" } }, unchangedDocuments: { type: "array", items: { type: "string" } }, removedDocuments: { type: "array", items: { type: "string" } },
      removalSemantics: { type: "string", enum: ["not_evaluated", "complete_packet_only"] }, reusableUnchangedDocuments: { type: "integer", minimum: 0 },
    } },
    coverage: { type: "object", additionalProperties: false, required: ["completeForSubmittedPacket", "completeForProjectCorpus", "questionScopedRepositoryExcerpts"], properties: {
      completeForSubmittedPacket: { type: "boolean", enum: [true] }, completeForProjectCorpus: { type: "boolean", enum: [false] }, questionScopedRepositoryExcerpts: { type: "boolean" },
    } },
    policy: { type: "object", additionalProperties: false, required: ["immutableSourceFingerprints", "incrementalComparisonOnly", "persistenceExternalToKeylessMcp", "safeToInferRemovedRepositoryFacts"], properties: {
      immutableSourceFingerprints: { type: "boolean", enum: [true] }, incrementalComparisonOnly: { type: "boolean", enum: [true] }, persistenceExternalToKeylessMcp: { type: "boolean", enum: [true] }, safeToInferRemovedRepositoryFacts: { type: "boolean", enum: [false] },
    } },
    diagnostics: { type: "array", items: { type: "string" } },
  },
} as const;
