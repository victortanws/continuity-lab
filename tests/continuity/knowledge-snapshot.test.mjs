import assert from "node:assert/strict";
import test from "node:test";

import { buildDomainProfileProposal } from "../../lib/continuity/domain-profile.ts";
import { buildContinuityEntityPackage } from "../../lib/continuity/entity-package.ts";
import { buildIdentityLinkPackage } from "../../lib/continuity/identity-link-package.ts";
import { buildKnowledgeSnapshot } from "../../lib/continuity/knowledge-snapshot.ts";
import { buildMcpContextPacket } from "../../lib/continuity/mcp-context.ts";
import { buildReviewedKnowledgeReceipt } from "../../lib/continuity/reviewed-knowledge.ts";

function snapshot(input, options = {}) {
  const packet = buildMcpContextPacket(input);
  const entityPackage = buildContinuityEntityPackage(packet);
  const identityLinks = buildIdentityLinkPackage(packet, entityPackage);
  const domainProfile = buildDomainProfileProposal(packet, entityPackage, options.question ?? "What changed?");
  const reviewedKnowledge = buildReviewedKnowledgeReceipt(packet, entityPackage, identityLinks, domainProfile);
  return buildKnowledgeSnapshot({
    packet, entityPackage, identityLinks, domainProfile, reviewedKnowledge,
    sourceBinding: options.sourceBinding ?? { kind: "direct_upload", repository: null, pinnedCommit: null, scope: null },
    previousSnapshot: options.previousSnapshot,
    requestedMode: options.requestedMode,
  });
}

function previousShape(value) {
  return {
    version: value.version,
    snapshotFingerprint: value.snapshotFingerprint,
    sourceBinding: value.sourceBinding,
    documents: value.documents,
    componentFingerprints: value.componentFingerprints,
  };
}

test("snapshot receipts are deterministic and do not claim project-wide coverage", () => {
  const input = { documents: [{ name: "one.md", text: "Mara arrived." }] };
  const first = snapshot(input);
  const second = snapshot(structuredClone(input));
  assert.equal(first.snapshotFingerprint, second.snapshotFingerprint);
  assert.equal(first.coverage.completeForProjectCorpus, false);
  assert.equal(first.comparison.status, "no_previous_snapshot");
  assert.equal(first.policy.persistenceExternalToKeylessMcp, true);
});

test("a complete direct-upload packet reports new, changed, unchanged, and removed documents", () => {
  const first = snapshot({ documents: [
    { name: "same.md", text: "Unchanged." },
    { name: "change.md", text: "Old." },
    { name: "remove.md", text: "Remove me." },
  ] }, { requestedMode: "complete_packet" });
  const second = snapshot({ documents: [
    { name: "same.md", text: "Unchanged." },
    { name: "change.md", text: "New." },
    { name: "add.md", text: "Added." },
  ] }, { requestedMode: "complete_packet", previousSnapshot: previousShape(first) });
  assert.equal(second.comparison.status, "validated_previous_snapshot");
  assert.deepEqual(second.comparison.newDocuments, ["add.md"]);
  assert.deepEqual(second.comparison.changedDocuments, ["change.md"]);
  assert.deepEqual(second.comparison.unchangedDocuments, ["same.md"]);
  assert.deepEqual(second.comparison.removedDocuments, ["remove.md"]);
  assert.equal(second.comparison.reusableUnchangedDocuments, 1);
});

test("question-scoped GitHub excerpts never infer repository removals", () => {
  const binding = { kind: "public_github_excerpts", repository: "owner/repo", pinnedCommit: "abc", scope: { id: "game", label: "Game", rootPath: "." } };
  const first = snapshot({ documents: [{ name: "canon.md", text: "Canon." }, { name: "code.ts", text: "Code." }] }, { sourceBinding: binding });
  const second = snapshot({ documents: [{ name: "canon.md", text: "Canon." }] }, {
    sourceBinding: { ...binding, pinnedCommit: "def" }, previousSnapshot: previousShape(first), requestedMode: "complete_packet",
  });
  assert.equal(second.mode, "delta_packet");
  assert.deepEqual(second.comparison.removedDocuments, []);
  assert.equal(second.comparison.removalSemantics, "not_evaluated");
  assert.match(second.diagnostics.join(" "), /question-scoped/i);
});

test("a tampered or cross-project previous snapshot is rejected", () => {
  const first = snapshot({ documents: [{ name: "one.md", text: "One." }] });
  const tampered = previousShape(first);
  tampered.documents[0].contentFingerprint = "fnv64:tampered";
  const second = snapshot({ documents: [{ name: "one.md", text: "One." }] }, { previousSnapshot: tampered });
  assert.equal(second.comparison.status, "previous_snapshot_rejected");
  assert.equal(second.comparison.reusableUnchangedDocuments, 0);
});
