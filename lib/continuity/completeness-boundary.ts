import type {
  ClaimKind,
  CompletenessBoundary,
  EvidenceChunk,
  QueryRequest,
  TrustedCompletenessRegistry,
} from "./contracts";

export type VerifiedCompletenessBoundary = {
  boundary: CompletenessBoundary;
  /** True only when the boundary enumerates the same immutable membership as
   * the server-pinned request revision. Required for answer-level closure. */
  coversPinnedRevision: boolean;
};

/**
 * Verifies the self-contained integrity and revision binding of a completeness
 * attestation. This is deliberately synchronous so routing remains a bounded,
 * deterministic operation in Node and Edge runtimes.
 */
export function verifyCompletenessBoundary(
  chunk: EvidenceChunk,
  request: QueryRequest,
  registry?: TrustedCompletenessRegistry,
): VerifiedCompletenessBoundary | null {
  const boundary = chunk.completenessBoundary;
  if (!boundary || boundary.version !== "continuity.completeness-boundary.v1" || !registry) return null;
  if (registry.version !== "continuity.trusted-completeness-registry.v1"
    || registry.projectId !== request.projectId
    || registry.projectId !== chunk.projectId
    || registry.projectRevision !== request.projectRevision
    || registry.grants.length > 512) return null;
  const grants = registry.grants.filter((grant) =>
    grant.boundary.boundaryId === boundary.boundaryId
    && grant.evidenceBinding.evidenceId === chunk.id);
  if (grants.length !== 1) return null;
  const grant = grants[0];
  if (canonicalBoundary(grant.boundary) !== canonicalBoundary(boundary)
    || grant.evidenceBinding.sourceId !== chunk.sourceId
    || grant.evidenceBinding.sourceVersionId !== chunk.sourceVersionId
    || normalizeClaimKey(grant.evidenceBinding.claimKey ?? "") !== normalizeClaimKey(chunk.claimKey ?? "")
    || grant.evidenceBinding.polarity !== (chunk.polarity ?? null)) return null;
  if (!boundary.boundaryId.trim() || !request.projectRevision?.trim()) return null;
  if (boundary.revision.projectRevision !== request.projectRevision) return null;
  const members = canonicalMembers(boundary.revision.sourceVersionIds);
  if (!members.length || members.length !== boundary.revision.sourceVersionIds.length) return null;
  if (!members.includes(chunk.sourceVersionId)) return null;
  if (boundary.revision.membershipDigest !== revisionMembershipDigest(
    boundary.revision.projectRevision,
    members,
  )) return null;
  if (!validBoundaryScope(boundary.scope)) return null;

  const pinnedMembers = request.sourceVersionIds === undefined
    ? null
    : canonicalMembers(request.sourceVersionIds);
  const coversPinnedRevision = Boolean(
    pinnedMembers
    && pinnedMembers.length === request.sourceVersionIds!.length
    && equalStringArrays(members, pinnedMembers),
  );
  return { boundary, coversPinnedRevision };
}

function canonicalBoundary(boundary: CompletenessBoundary): string {
  const scope = boundary.scope.kind === "exact_claim_keys"
    ? { kind: boundary.scope.kind, claimKeys: boundary.scope.claimKeys.map(normalizeClaimKey).sort() }
    : boundary.scope.kind === "claim_namespace"
      ? { kind: boundary.scope.kind, namespace: normalizedNamespace(boundary.scope.namespace), claimKinds: [...boundary.scope.claimKinds].sort() }
      : { kind: boundary.scope.kind, claimKinds: [...boundary.scope.claimKinds].sort() };
  return JSON.stringify({
    version: boundary.version,
    boundaryId: boundary.boundaryId,
    scope,
    revision: {
      projectRevision: boundary.revision.projectRevision,
      sourceVersionIds: canonicalMembers(boundary.revision.sourceVersionIds),
      membershipDigest: boundary.revision.membershipDigest,
    },
  });
}

export function boundaryCoversExactClaimKey(
  verified: VerifiedCompletenessBoundary,
  claimKey: string,
): boolean {
  const normalized = normalizeClaimKey(claimKey);
  if (!normalized) return false;
  const scope = verified.boundary.scope;
  if (scope.kind === "exact_claim_keys") {
    return scope.claimKeys.some((key) => normalizeClaimKey(key) === normalized);
  }
  if (scope.kind === "claim_namespace") {
    const namespace = normalizedNamespace(scope.namespace);
    return Boolean(namespace && (normalized === namespace || normalized.startsWith(`${namespace}:`)));
  }
  return false;
}

/** Answer-level closure is intentionally narrower than exact-target absence.
 * It requires complete revision membership plus an explicit material-claim
 * scope; a complete subregistry or claim namespace cannot close the rest of an
 * answer. */
export function boundaryCoversMaterialClaimKind(
  verified: VerifiedCompletenessBoundary,
  claimKind: ClaimKind,
): boolean {
  return verified.coversPinnedRevision
    && verified.boundary.scope.kind === "material_claim_kinds"
    && verified.boundary.scope.claimKinds.includes(claimKind);
}

export function revisionMembershipDigest(
  projectRevision: string,
  sourceVersionIds: string[],
): `sha256:${string}` {
  const canonical = JSON.stringify([
    projectRevision,
    ...canonicalMembers(sourceVersionIds),
  ]);
  return `sha256:${sha256Hex(new TextEncoder().encode(canonical))}`;
}

function validBoundaryScope(scope: CompletenessBoundary["scope"]): boolean {
  if (scope.kind === "exact_claim_keys") {
    return scope.claimKeys.length > 0
      && scope.claimKeys.length <= 256
      && new Set(scope.claimKeys.map(normalizeClaimKey)).size === scope.claimKeys.length
      && scope.claimKeys.every((key) => Boolean(normalizeClaimKey(key)));
  }
  if (scope.kind === "claim_namespace") {
    return Boolean(normalizedNamespace(scope.namespace))
      && scope.claimKinds.length > 0
      && new Set(scope.claimKinds).size === scope.claimKinds.length;
  }
  return scope.claimKinds.length > 0
    && new Set(scope.claimKinds).size === scope.claimKinds.length;
}

function normalizeClaimKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizedNamespace(value: string): string {
  return normalizeClaimKey(value).replace(/[:.*]+$/g, "");
}

function canonicalMembers(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}

function equalStringArrays(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

// Small, dependency-free SHA-256 used only for short revision membership
// manifests. It avoids a Node-only crypto import in Edge routing code.
const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function sha256Hex(input: Uint8Array): string {
  const bitLength = input.length * 8;
  const paddedLength = Math.ceil((input.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(input);
  padded[input.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x1_0000_0000), false);
  view.setUint32(paddedLength - 4, bitLength >>> 0, false);
  const hash = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const words = new Uint32Array(64);
  const rotate = (value: number, count: number) => (value >>> count) | (value << (32 - count));

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + index * 4, false);
    for (let index = 16; index < 64; index += 1) {
      const a = words[index - 15];
      const b = words[index - 2];
      const s0 = rotate(a, 7) ^ rotate(a, 18) ^ (a >>> 3);
      const s1 = rotate(b, 17) ^ rotate(b, 19) ^ (b >>> 10);
      words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = hash;
    for (let index = 0; index < 64; index += 1) {
      const s1 = rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25);
      const choice = (e & f) ^ (~e & g);
      const t1 = (h + s1 + choice + SHA256_K[index] + words[index]) >>> 0;
      const s0 = rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (s0 + majority) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    hash[0] = (hash[0] + a) >>> 0; hash[1] = (hash[1] + b) >>> 0;
    hash[2] = (hash[2] + c) >>> 0; hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0; hash[5] = (hash[5] + f) >>> 0;
    hash[6] = (hash[6] + g) >>> 0; hash[7] = (hash[7] + h) >>> 0;
  }
  return [...hash].map((value) => value.toString(16).padStart(8, "0")).join("");
}
