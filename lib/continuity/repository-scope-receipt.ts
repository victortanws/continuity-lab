const encoder = new TextEncoder();

export const REPOSITORY_SCOPE_RECEIPT_VERSION = "continuity.repository-scope-receipt.v1" as const;

export type RepositoryScopeReceipt = {
  version: typeof REPOSITORY_SCOPE_RECEIPT_VERSION;
  repository: string;
  pinnedCommit: string;
  scope: {
    id: string;
    label: string;
    rootPath: string;
  };
  excerpts: Array<{
    id: string;
    path: string;
    contentFingerprint: string;
  }>;
  integrity: string;
  trust: "integrity_check_only";
  grantsAuthority: false;
};

export type RepositoryReceiptDocument = { name: string; text: string };

export const REPOSITORY_SCOPE_RECEIPT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["version", "repository", "pinnedCommit", "scope", "excerpts", "integrity", "trust", "grantsAuthority"],
  properties: {
    version: { type: "string", enum: [REPOSITORY_SCOPE_RECEIPT_VERSION] },
    repository: { type: "string", minLength: 3, maxLength: 200 },
    pinnedCommit: { type: "string", pattern: "^[0-9a-fA-F]{40}$" },
    scope: {
      type: "object",
      additionalProperties: false,
      required: ["id", "label", "rootPath"],
      properties: {
        id: { type: "string", minLength: 1, maxLength: 240 },
        label: { type: "string", minLength: 1, maxLength: 240 },
        rootPath: { type: "string", minLength: 1, maxLength: 240 },
      },
    },
    excerpts: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "path", "contentFingerprint"],
        properties: {
          id: { type: "string", minLength: 1, maxLength: 160 },
          path: { type: "string", minLength: 1, maxLength: 400 },
          contentFingerprint: { type: "string", pattern: "^fnv64:[0-9a-f]{16}$" },
        },
      },
    },
    integrity: { type: "string", pattern: "^fnv64:[0-9a-f]{16}$" },
    trust: { type: "string", enum: ["integrity_check_only"] },
    grantsAuthority: { type: "boolean", enum: [false] },
  },
} as const;

/** Deterministic and non-secret: useful for binding fields, not authentication. */
export function repositoryContentFingerprint(value: string): string {
  const bytes = encoder.encode(value);
  let left = 0x811c9dc5;
  let right = 0x9e3779b9;
  for (const byte of bytes) {
    left = Math.imul(left ^ byte, 0x01000193) >>> 0;
    right = Math.imul(right ^ (byte + 0x7f), 0x85ebca6b) >>> 0;
    right = (right ^ (right >>> 13)) >>> 0;
  }
  return `fnv64:${left.toString(16).padStart(8, "0")}${right.toString(16).padStart(8, "0")}`;
}

function receiptMaterial(receipt: Omit<RepositoryScopeReceipt, "integrity">): string {
  return JSON.stringify({
    version: receipt.version,
    repository: receipt.repository,
    pinnedCommit: receipt.pinnedCommit,
    scope: receipt.scope,
    excerpts: receipt.excerpts,
    trust: receipt.trust,
    grantsAuthority: receipt.grantsAuthority,
  });
}

export function buildRepositoryScopeReceipt(input: {
  repository: string;
  pinnedCommit: string;
  scope: RepositoryScopeReceipt["scope"];
  excerpts: Array<{ id: string; path: string; text: string }>;
}): RepositoryScopeReceipt {
  const unsigned = {
    version: REPOSITORY_SCOPE_RECEIPT_VERSION,
    repository: input.repository,
    pinnedCommit: input.pinnedCommit.toLowerCase(),
    scope: input.scope,
    excerpts: input.excerpts.map((excerpt) => ({
      id: excerpt.id,
      path: excerpt.path,
      contentFingerprint: repositoryContentFingerprint(excerpt.text),
    })),
    trust: "integrity_check_only" as const,
    grantsAuthority: false as const,
  };
  return { ...unsigned, integrity: repositoryContentFingerprint(receiptMaterial(unsigned)) };
}

export function questionRequiresRepositoryScope(question: string): boolean {
  return /https?:\/\/(?:www\.)?github\.com\//i.test(question)
    || /\b(?:this|the|current|my|our)\s+(?:github\s+)?(?:repository|repo|codebase|folder)\b/i.test(question)
    || /\b(?:repository|repo|codebase)\s+(?:canon|truth|source of truth)\b/i.test(question);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeRelativePath(value: string): boolean {
  return value.length > 0 && value.length <= 400 && !value.startsWith("/") && !value.includes("\\")
    && !value.split("/").some((part) => part === ".." || part === "");
}

function belongsToScope(path: string, rootPath: string): boolean {
  return rootPath === "." || path === rootPath || path.startsWith(`${rootPath}/`);
}

export function validateRepositoryScopeReceipt(
  value: unknown,
  documents: RepositoryReceiptDocument[],
): { ok: true; receipt: RepositoryScopeReceipt } | { ok: false; message: string } {
  if (!isRecord(value)) return { ok: false, message: "sourceContext.receipt must be the receipt returned by continuity_inspect_public_repository." };
  const scope = value.scope;
  const excerpts = value.excerpts;
  if (value.version !== REPOSITORY_SCOPE_RECEIPT_VERSION
    || typeof value.repository !== "string" || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value.repository)
    || typeof value.pinnedCommit !== "string" || !/^[0-9a-f]{40}$/.test(value.pinnedCommit)
    || !isRecord(scope)
    || typeof scope.id !== "string" || !scope.id || scope.id.length > 240
    || typeof scope.label !== "string" || !scope.label || scope.label.length > 240
    || typeof scope.rootPath !== "string" || !(scope.rootPath === "." || safeRelativePath(scope.rootPath))
    || !Array.isArray(excerpts) || excerpts.length > 8
    || value.trust !== "integrity_check_only" || value.grantsAuthority !== false
    || typeof value.integrity !== "string") {
    return { ok: false, message: "The repository scope receipt is malformed or uses an unsupported version." };
  }
  const parsedExcerpts: RepositoryScopeReceipt["excerpts"] = [];
  const seenPaths = new Set<string>();
  for (const excerpt of excerpts) {
    if (!isRecord(excerpt)
      || typeof excerpt.id !== "string" || !excerpt.id || excerpt.id.length > 160
      || typeof excerpt.path !== "string" || !safeRelativePath(excerpt.path)
      || !belongsToScope(excerpt.path, scope.rootPath)
      || seenPaths.has(excerpt.path)
      || typeof excerpt.contentFingerprint !== "string" || !/^fnv64:[0-9a-f]{16}$/.test(excerpt.contentFingerprint)) {
      return { ok: false, message: "The repository scope receipt contains an invalid, duplicate, or cross-scope excerpt." };
    }
    seenPaths.add(excerpt.path);
    parsedExcerpts.push({ id: excerpt.id, path: excerpt.path, contentFingerprint: excerpt.contentFingerprint });
  }
  const receipt: RepositoryScopeReceipt = {
    version: REPOSITORY_SCOPE_RECEIPT_VERSION,
    repository: value.repository,
    pinnedCommit: value.pinnedCommit,
    scope: { id: scope.id, label: scope.label, rootPath: scope.rootPath },
    excerpts: parsedExcerpts,
    integrity: value.integrity,
    trust: "integrity_check_only",
    grantsAuthority: false,
  };
  const expectedIntegrity = repositoryContentFingerprint(receiptMaterial({
    version: receipt.version,
    repository: receipt.repository,
    pinnedCommit: receipt.pinnedCommit,
    scope: receipt.scope,
    excerpts: receipt.excerpts,
    trust: receipt.trust,
    grantsAuthority: receipt.grantsAuthority,
  }));
  if (receipt.integrity !== expectedIntegrity) {
    return { ok: false, message: "The repository scope receipt no longer matches the repository, commit, scope, or excerpt list returned by inspection." };
  }
  if (documents.length !== receipt.excerpts.length) {
    return { ok: false, message: "Repository compilation must pass exactly the inspected excerpts; files cannot be added, dropped, or blended across scopes." };
  }
  const byPath = new Map(receipt.excerpts.map((excerpt) => [excerpt.path, excerpt]));
  for (const document of documents) {
    const excerpt = byPath.get(document.name);
    if (!excerpt || repositoryContentFingerprint(document.text) !== excerpt.contentFingerprint) {
      return { ok: false, message: `Repository excerpt ${document.name} is outside the selected scope or no longer matches its inspected text.` };
    }
  }
  return { ok: true, receipt };
}
