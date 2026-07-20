import type { AssertionScope, EvidenceChunk } from "./contracts";

export type AssertionBoundary = {
  scope: AssertionScope;
  ownerId: string;
};

/**
 * Resolve the truth plane from server-owned evidence metadata. Source text is
 * allowed to prove what that source asserts without silently becoming approved
 * project truth. The caller cannot override this boundary with prose or an
 * indexed attribute: authority, lifecycle, and role remain the deciding data.
 */
export function assertionBoundaryFor(
  chunk: Pick<EvidenceChunk, "authority" | "lifecycle" | "role" | "projectId" | "sourceVersionId">,
): AssertionBoundary {
  if (
    chunk.authority === "proposal"
    || chunk.lifecycle === "proposed"
    || chunk.role === "proposal"
  ) {
    return { scope: "proposal", ownerId: chunk.sourceVersionId };
  }
  if (chunk.authority === "reference") {
    return { scope: "source_assertion", ownerId: chunk.sourceVersionId };
  }
  return { scope: "project_truth", ownerId: chunk.projectId };
}

/** Always overwrite caller/model-supplied scope fields with the derived pair. */
export function applyAssertionBoundary(chunk: EvidenceChunk): EvidenceChunk {
  const boundary = assertionBoundaryFor(chunk);
  return {
    ...chunk,
    assertionScope: boundary.scope,
    assertionOwnerId: boundary.ownerId,
  };
}
