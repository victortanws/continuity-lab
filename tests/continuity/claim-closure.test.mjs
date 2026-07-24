import assert from "node:assert/strict";
import test from "node:test";

import {
  auditClaimClosure,
  auditRequestCoverage,
  claimFocusText,
  profileClaimSurface,
} from "../../lib/continuity/claim-closure.ts";

const storyCanon = [
  "# Story canon",
  "The room may donate $0, $20, $40 or $60 during Community demo night.",
  "Marc leads the Seed Round after evidence and accounting gates are met.",
  "The Allocation Dinner introduces Jin Hwan and the physical hardware layer.",
  "The Payment writes `grandma-surgery-funded`.",
].join("\n");

test("profiles a multi-claim request as broad without using story-specific names", () => {
  const profile = profileClaimSurface([
    "Community-demo donations are $75.",
    "Greg leads the Seed Round.",
    "The Payment uses `grandma-hinge-complete`.",
    "The ending is selected from a menu.",
  ].join("\n"));

  assert.equal(profile.profile.materialStatements, 4);
  assert.equal(profile.profile.numericClaims, 1);
  assert.ok(profile.profile.identifiers >= 1);
  assert.equal(profile.profile.requiresBroadRetrieval, true);
  assert.match(claimFocusText(profile.statements.map((statement) => statement.text).join("\n")), /exact checks/i);
});

test("surfaces a conflicting currency value instead of treating omission as verification", () => {
  const receipt = auditClaimClosure(
    "Community-demo donations are $75.",
    [{ name: "docs/STORY-CANON.md", text: storyCanon }],
  );

  assert.equal(receipt.numbers[0].surface, "$75");
  assert.equal(receipt.numbers[0].status, "conflicted");
  assert.match(receipt.numbers[0].evidence[0].excerpt, /\$0, \$20, \$40 or \$60/);
  assert.equal(receipt.safeForFinalAnswer, false);
});

test("a final answer must address a disputed request value rather than silently omit it", () => {
  const documents = [{ name: "docs/STORY-CANON.md", text: storyCanon }];
  const omitted = auditRequestCoverage(
    "Community-demo donations are $75.",
    "Marc leads the Seed Round.",
    documents,
  );
  assert.equal(omitted.findings[0].status, "omitted");
  assert.equal(omitted.safeForFinalAnswer, false);

  const corrected = auditRequestCoverage(
    "Community-demo donations are $75.",
    "Community-demo donations are not $75; they are $0, $20, $40, or $60.",
    documents,
  );
  assert.equal(corrected.findings[0].status, "addressed");
  assert.equal(corrected.safeForFinalAnswer, true);
});

test("rejects a real locator whose passage does not support the attached claim", () => {
  const receipt = auditClaimClosure(
    "Greg leads the Seed Round. [STORY-CANON.md (line 4)](docs/STORY-CANON.md:4)",
    [{ name: "docs/STORY-CANON.md", text: storyCanon }],
  );

  assert.equal(receipt.citations.length, 1);
  assert.equal(receipt.citations[0].status, "mismatch");
  assert.match(receipt.citations[0].evidence[0].excerpt, /Allocation Dinner/);
});

test("accepts a locator only when the located passage shares the claim anchors", () => {
  const receipt = auditClaimClosure(
    "Marc leads the Seed Round. [STORY-CANON.md](docs/STORY-CANON.md:3)",
    [{ name: "docs/STORY-CANON.md", text: storyCanon }],
  );

  assert.equal(receipt.citations[0].status, "verified");
});

test("distinguishes existing, explicitly proposed, and unknown identifiers", () => {
  const existing = auditClaimClosure(
    "The Payment writes `grandma-surgery-funded`.",
    [{ name: "docs/STORY-CANON.md", text: storyCanon }],
  );
  assert.equal(existing.identifiers.find((item) => item.surface === "grandma-surgery-funded")?.status, "existing");

  const proposed = auditClaimClosure(
    "Add and register a new flag `grandma-hinge-complete`.",
    [{ name: "docs/STORY-CANON.md", text: storyCanon }],
  );
  assert.equal(proposed.identifiers.find((item) => item.surface === "grandma-hinge-complete")?.status, "proposed_new");

  const unknown = auditClaimClosure(
    "The existing prerequisite is `grandma-hinge-complete`.",
    [{ name: "docs/STORY-CANON.md", text: storyCanon }],
  );
  assert.equal(unknown.identifiers.find((item) => item.surface === "grandma-hinge-complete")?.status, "unknown");
  assert.equal(unknown.safeForFinalAnswer, false);
});

test("the same validator handles software symbols without case-folding them", () => {
  const documents = [{ name: "src/characters.ts", text: "export function createCharacter() { return {}; }" }];
  const receipt = auditClaimClosure(
    "The implementation calls `CreateCharacter()` and then CharacterCreator().",
    documents,
  );

  assert.equal(receipt.identifiers.find((item) => item.surface === "CreateCharacter()")?.status, "unknown");
  assert.equal(receipt.identifiers.find((item) => item.surface === "CharacterCreator()")?.status, "unknown");
  assert.equal(receipt.safeForFinalAnswer, false);
});

test("an excerpt locator preserves absolute line coordinates", () => {
  const receipt = auditClaimClosure(
    "Release T9 passed. [release.log](release.log#L42)",
    [{ name: "release.log", locator: "release.log#L40-L44", text: "start\nwait\nRelease T9 passed.\nend\ndone" }],
  );
  assert.equal(receipt.citations[0].status, "verified");
  assert.equal(receipt.citations[0].evidence[0].locator, "release.log#L42");
});
