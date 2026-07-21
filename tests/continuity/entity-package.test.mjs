import assert from "node:assert/strict";
import test from "node:test";

import { buildContinuityEntityPackage } from "../../lib/continuity/entity-package.ts";
import { buildMcpContextPacket } from "../../lib/continuity/mcp-context.ts";

test("entity package keeps occurrence evidence while separating same-name people", () => {
  const packet = buildMcpContextPacket({
    documents: [
      { name: "family-a.md", text: "Grandma (CHR-1) opened the bakery." },
      { name: "family-b.md", text: "Grandma (CHR-2) repaired the engine." },
    ],
    entityMentions: [
      {
        documentName: "family-a.md", quote: "Grandma (CHR-1) opened the bakery.",
        mention: "Grandma", explicitId: "CHR-1", entityType: "fictional_character",
      },
      {
        documentName: "family-b.md", quote: "Grandma (CHR-2) repaired the engine.",
        mention: "Grandma", explicitId: "CHR-2", entityType: "fictional_character",
      },
    ],
  });
  const result = buildContinuityEntityPackage(packet);

  assert.equal(result.version, "continuity.entity-package.v1");
  assert.equal(result.coordinateSystem.unit, "utf16_code_units");
  assert.equal(result.coordinateSystem.rangeConvention, "zero_based_half_open");
  assert.equal(result.entities.length, 2);
  assert.equal(result.mentions.length, 2);
  assert.equal(result.ambiguitySets.length, 1);
  assert.equal(result.ambiguitySets[0].candidateEntityIds.length, 2);
  assert.equal(result.mentions.every((mention) => mention.resolution === "ambiguous"), true);
  assert.equal(result.mentions.every((mention) => mention.evidenceQuote.includes(mention.surfaceForm)), true);
  assert.equal(result.mentions.every((mention) => mention.end - mention.start === mention.surfaceForm.length), true);
  assert.equal(result.qa.safeForAutomaticIdentityMerge, false);
  assert.equal(result.qa.safeForProjectCanonPromotion, false);
  assert.equal(result.qa.failed, 0);
  assert.match(result.packageFingerprint, /^fnv64:[0-9a-f]{16}$/);
});

test("repeated exact IDs inside one source form one evidence-bearing entity rather than false ambiguity", () => {
  const text = "Mara (CHR-7) entered. Later, Captain Mara (CHR-7) returned.";
  const packet = buildMcpContextPacket({
    documents: [{ name: "chapter.md", text }],
    entityMentions: [
      { documentName: "chapter.md", quote: "Mara (CHR-7) entered.", mention: "Mara", explicitId: "CHR-7", entityType: "character" },
      { documentName: "chapter.md", quote: "Captain Mara (CHR-7) returned.", mention: "Captain Mara", explicitId: "CHR-7", entityType: "character" },
    ],
  });
  const result = buildContinuityEntityPackage(packet);

  assert.equal(result.entities.length, 1);
  assert.deepEqual(result.entities[0].aliases, ["Captain Mara", "Mara"]);
  assert.deepEqual(result.entities[0].explicitIds, ["CHR-7"]);
  assert.equal(result.entities[0].resolution, "resolved");
  assert.equal(result.ambiguitySets.length, 0);
  assert.equal(result.mentions.every((mention) => mention.resolution === "resolved"), true);
  assert.equal(result.qa.safeForAutomaticIdentityMerge, true);
});

test("the same apparent ID in different source owners does not merge across documents", () => {
  const packet = buildMcpContextPacket({
    documents: [
      { name: "project-a.md", text: "Alex (CHR-1) enters." },
      { name: "project-b.md", text: "Alex (CHR-1) leaves." },
    ],
    entityMentions: [
      { documentName: "project-a.md", quote: "Alex (CHR-1) enters.", mention: "Alex", explicitId: "CHR-1", entityType: "person" },
      { documentName: "project-b.md", quote: "Alex (CHR-1) leaves.", mention: "Alex", explicitId: "CHR-1", entityType: "person" },
    ],
  });
  const result = buildContinuityEntityPackage(packet);

  assert.equal(result.entities.length, 2);
  assert.equal(result.ambiguitySets.length, 1);
  assert.equal(result.qa.safeForAutomaticIdentityMerge, false);
});

test("unresolved repeated names never merge globally and retain review warnings", () => {
  const packet = buildMcpContextPacket({
    documents: [{ name: "notes.md", text: "Alex entered. Alex called." }],
    entityMentions: [
      { documentName: "notes.md", quote: "Alex entered.", mention: "Alex", entityType: "person" },
      { documentName: "notes.md", quote: "Alex called.", mention: "Alex", entityType: "person" },
    ],
  });
  const result = buildContinuityEntityPackage(packet);

  assert.equal(result.entities.length, 2);
  assert.equal(result.ambiguitySets.length, 1);
  assert.equal(result.qa.unresolvedMentionIds.length, 0, "ambiguous mentions are tracked in their ambiguity set rather than duplicated as unresolved");
  assert.equal(result.qa.ambiguousSetIds.length, 1);
  assert.ok(result.qa.checks.some((check) => check.id === "ambiguity_review" && check.status === "warning"));
  assert.equal(result.qa.safeForAutomaticIdentityMerge, false);
});

test("the same package contract handles non-story software material", () => {
  const packet = buildMcpContextPacket({
    documents: [{ name: "release.md", text: "Release 3.6 (REL-36) requires migration M7." }],
    entityMentions: [
      {
        documentName: "release.md", quote: "Release 3.6 (REL-36) requires migration M7.",
        mention: "Release 3.6", explicitId: "REL-36", entityType: "software_release",
      },
      {
        documentName: "release.md", quote: "Release 3.6 (REL-36) requires migration M7.",
        mention: "migration M7", entityType: "migration",
      },
    ],
  });
  const result = buildContinuityEntityPackage(packet);

  assert.equal(result.entities.find((entity) => entity.explicitIds.includes("REL-36"))?.type, "object");
  assert.equal(result.mentions.find((mention) => mention.surfaceForm === "migration M7")?.type, "event");
  assert.equal(result.provenance.completeForProjectCorpus, false);
  assert.equal(result.ontology.topLevelTypes.includes("person"), true);
  assert.equal(result.ontology.topLevelTypes.includes("event"), true);
});

test("declared UTF-16 offsets reproduce mentions containing astral characters", () => {
  const text = "🧭 Captain Li (CHR-9) arrived.";
  const packet = buildMcpContextPacket({
    documents: [{ name: "unicode.md", text }],
    entityMentions: [{
      documentName: "unicode.md", quote: text, mention: "Captain Li", explicitId: "CHR-9", entityType: "person",
    }],
  });
  const result = buildContinuityEntityPackage(packet);
  const mention = result.mentions[0];

  assert.equal(text.slice(mention.start, mention.end), mention.surfaceForm);
  assert.equal(mention.start, 3, "the astral symbol occupies two UTF-16 code units plus the following space");
});

test("a package with no proposed entity cannot imply that automatic identity work is safe", () => {
  const result = buildContinuityEntityPackage(buildMcpContextPacket({
    documents: [{ name: "empty.md", text: "No named actor is supplied." }],
  }));

  assert.equal(result.entities.length, 0);
  assert.equal(result.qa.safeForAutomaticIdentityMerge, false);
  assert.equal(result.qa.safeForProjectCanonPromotion, false);
});

test("entity package is deterministic and records rejected proposals without echoing them as entities", () => {
  const input = {
    documents: [{ name: "source.md", text: "Iris opened the door." }],
    entityMentions: [
      { documentName: "source.md", quote: "Iris opened the door.", mention: "Iris", entityType: "person" },
      { documentName: "source.md", quote: "Iris opened the door.", mention: "Iris", explicitId: "ABSENT-ID", entityType: "person" },
    ],
  };
  const first = buildContinuityEntityPackage(buildMcpContextPacket(input));
  const second = buildContinuityEntityPackage(buildMcpContextPacket(structuredClone(input)));

  assert.deepEqual(first, second);
  assert.equal(first.mentions.length, 1);
  assert.equal(first.qa.rejectedProposalCount, 1);
  assert.ok(first.qa.checks.some((check) => check.id === "proposal_rejections" && check.status === "warning"));
});
