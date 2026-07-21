import assert from "node:assert/strict";
import test from "node:test";

import { buildDomainProfileProposal } from "../../lib/continuity/domain-profile.ts";
import { buildContinuityEntityPackage } from "../../lib/continuity/entity-package.ts";
import { buildIdentityLinkPackage } from "../../lib/continuity/identity-link-package.ts";
import { buildMcpContextPacket } from "../../lib/continuity/mcp-context.ts";
import { buildReviewedKnowledgeReceipt } from "../../lib/continuity/reviewed-knowledge.ts";

function compile(input, question = "What is true?") {
  const packet = buildMcpContextPacket(input);
  const entities = buildContinuityEntityPackage(packet);
  const links = buildIdentityLinkPackage(packet, entities);
  const profile = buildDomainProfileProposal(packet, entities, question);
  return { packet, entities, links, profile };
}

function reviewBase(compiled) {
  return {
    reviewId: "review-1",
    projectScope: "example-project",
    revision: "rev-1",
    reviewerRole: "director",
    identityPackageFingerprint: compiled.links.packageFingerprint,
    domainProfileFingerprint: compiled.profile.profileFingerprint,
  };
}

test("no review preserves every proposal and activates nothing", () => {
  const compiled = compile({
    documents: [{ name: "chapter.md", text: "Asteria entered. Asterai spoke." }],
    entityMentions: [
      { documentName: "chapter.md", quote: "Asteria entered.", mention: "Asteria", entityType: "character" },
      { documentName: "chapter.md", quote: "Asterai spoke.", mention: "Asterai", entityType: "character" },
    ],
  });
  const receipt = buildReviewedKnowledgeReceipt(compiled.packet, compiled.entities, compiled.links, compiled.profile);
  assert.equal(receipt.status, "not_submitted");
  assert.equal(receipt.identityLedger.acceptedDecisions.length, 0);
  assert.deepEqual(receipt.identityLedger.unresolvedCandidateIds, [compiled.links.candidateLinks[0].id]);
  assert.equal(receipt.domainConfiguration.activated, false);
  assert.equal(receipt.review.projectCanon, false);
});

test("a director can accept a natural-language misspelling without rewriting source evidence", () => {
  const compiled = compile({
    documents: [{ name: "chapter.md", text: "Asteria entered. Asterai spoke." }],
    entityMentions: [
      { documentName: "chapter.md", quote: "Asteria entered.", mention: "Asteria", entityType: "character" },
      { documentName: "chapter.md", quote: "Asterai spoke.", mention: "Asterai", entityType: "character" },
    ],
  });
  const link = compiled.links.candidateLinks[0];
  const canonical = compiled.entities.entities.find((entity) => entity.aliases.includes("Asteria")).id;
  const receipt = buildReviewedKnowledgeReceipt(compiled.packet, compiled.entities, compiled.links, compiled.profile, {
    ...reviewBase(compiled),
    identityDecisions: [{
      candidateLinkId: link.id, outcome: "accept_misspelling", basis: "human_review",
      canonicalEntityId: canonical, rationale: "The director confirms that Asterai is a spelling error.",
    }],
  });
  assert.equal(receipt.status, "accepted");
  assert.equal(receipt.identityLedger.acceptedDecisions.length, 1);
  assert.deepEqual(receipt.identityLedger.canonicalGroups[0].acceptedForms, ["Asterai", "Asteria"]);
  assert.equal(receipt.identityLedger.exactSourceFormsPreserved, true);
  assert.equal(compiled.entities.entities.length, 2);
  assert.equal(receipt.qa.safeForAutomatedIdentityApplication, false);
  assert.equal(receipt.qa.readyForCallerRequestedProjection, true);
  assert.equal(receipt.review.authenticated, false);
});

test("different explicit IDs cannot be merged by a review decision", () => {
  const compiled = compile({
    documents: [{ name: "cast.md", text: "Grandma (CHR-1) waved. Grandma (CHR-2) called." }],
    entityMentions: [
      { documentName: "cast.md", quote: "Grandma (CHR-1) waved.", mention: "Grandma", explicitId: "CHR-1", entityType: "character" },
      { documentName: "cast.md", quote: "Grandma (CHR-2) called.", mention: "Grandma", explicitId: "CHR-2", entityType: "character" },
    ],
  });
  const link = compiled.links.candidateLinks[0];
  const receipt = buildReviewedKnowledgeReceipt(compiled.packet, compiled.entities, compiled.links, compiled.profile, {
    ...reviewBase(compiled),
    identityDecisions: [{ candidateLinkId: link.id, outcome: "accept_same_entity", basis: "human_review", canonicalEntityId: link.fromEntityId, rationale: "Attempted merge." }],
  });
  assert.equal(receipt.identityLedger.acceptedDecisions.length, 0);
  assert.ok(receipt.invalidDecisions.some((decision) => decision.code === "identifier_collision_cannot_merge"));
  assert.equal(receipt.qa.safeForAutomatedIdentityApplication, false);
});

test("case-sensitive symbols require parser binding rather than spelling review", () => {
  const compiled = compile({
    documents: [{ name: "symbols.ts", text: "createCharacter runs. CreateCharacter runs." }],
    entityMentions: [
      { documentName: "symbols.ts", quote: "createCharacter runs.", mention: "createCharacter", entityType: "function", identityProfile: "case_sensitive_symbol" },
      { documentName: "symbols.ts", quote: "CreateCharacter runs.", mention: "CreateCharacter", entityType: "function", identityProfile: "case_sensitive_symbol" },
    ],
  });
  const link = compiled.links.candidateLinks[0];
  const human = buildReviewedKnowledgeReceipt(compiled.packet, compiled.entities, compiled.links, compiled.profile, {
    ...reviewBase(compiled),
    identityDecisions: [{ candidateLinkId: link.id, outcome: "accept_alias", basis: "human_review", canonicalEntityId: link.fromEntityId, rationale: "They look alike." }],
  });
  assert.ok(human.invalidDecisions.some((decision) => decision.code === "symbol_binding_evidence_required"));

  const parser = buildReviewedKnowledgeReceipt(compiled.packet, compiled.entities, compiled.links, compiled.profile, {
    ...reviewBase(compiled),
    identityDecisions: [{ candidateLinkId: link.id, outcome: "accept_alias", basis: "parser_binding", canonicalEntityId: link.fromEntityId, rationale: "A language-service adapter reports the same binding." }],
  });
  assert.equal(parser.identityLedger.acceptedDecisions.length, 1);
  assert.equal(parser.identityLedger.acceptedDecisions[0].basis, "parser_binding");
});

test("a bound review can activate only explicitly approved parameters and validators", () => {
  const compiled = compile({
    documents: [{ name: "story.md", text: "The Founder pays $47,000. Day 24 begins." }],
    claims: [
      {
        documentName: "story.md", quote: "The Founder pays $47,000.", claimKind: "normative",
        subject: "The Founder", predicate: "pays", object: "$47,000", polarity: "positive",
      },
      {
        documentName: "story.md", quote: "Day 24 begins.", claimKind: "normative",
        subject: "Day 24", predicate: "begins", object: "", frameArity: "intransitive", polarity: "positive",
        temporal: { marker: "Day 24", axis: "day", from: 24 },
      },
    ],
  }, "Can the Founder pay by Day 24?");
  const resource = compiled.profile.candidateParameters.find((parameter) => parameter.kind === "resource");
  const validator = compiled.profile.validatorCandidates.find((candidate) => candidate.validator === "resource_conservation");
  const receipt = buildReviewedKnowledgeReceipt(compiled.packet, compiled.entities, compiled.links, compiled.profile, {
    ...reviewBase(compiled), activateDomainProfile: true,
    parameterDecisions: [{ parameterId: resource.id, decision: "approve", rationale: "Money is an enforced game resource." }],
    validatorDecisions: [{ validatorId: validator.id, decision: "approve", rationale: "Every payment must conserve the cash ledger." }],
  });
  assert.equal(receipt.domainConfiguration.activated, true);
  assert.deepEqual(receipt.domainConfiguration.approvedParameters.map((parameter) => parameter.id), [resource.id]);
  assert.deepEqual(receipt.domainConfiguration.approvedValidators.map((candidate) => candidate.id), [validator.id]);
  assert.equal(receipt.qa.safeForValidatorExecution, false);
  assert.equal(receipt.qa.readyForCallerRequestedValidation, true);
});

test("tampered fingerprints reject the review instead of applying it to new evidence", () => {
  const compiled = compile({ documents: [{ name: "notes.md", text: "Mara arrived." }] });
  const receipt = buildReviewedKnowledgeReceipt(compiled.packet, compiled.entities, compiled.links, compiled.profile, {
    ...reviewBase(compiled), identityPackageFingerprint: "fnv64:tampered", domainProfileFingerprint: "fnv64:tampered",
  });
  assert.equal(receipt.status, "rejected");
  assert.equal(receipt.bindings.identityBindingValid, false);
  assert.equal(receipt.bindings.domainBindingValid, false);
  assert.equal(receipt.qa.safeForValidatorExecution, false);
});

test("review decisions cannot cite fabricated evidence IDs", () => {
  const compiled = compile({
    documents: [{ name: "chapter.md", text: "Asteria entered. Asterai spoke." }],
    entityMentions: [
      { documentName: "chapter.md", quote: "Asteria entered.", mention: "Asteria", entityType: "character" },
      { documentName: "chapter.md", quote: "Asterai spoke.", mention: "Asterai", entityType: "character" },
    ],
  });
  const link = compiled.links.candidateLinks[0];
  const receipt = buildReviewedKnowledgeReceipt(compiled.packet, compiled.entities, compiled.links, compiled.profile, {
    ...reviewBase(compiled),
    identityDecisions: [{
      candidateLinkId: link.id, outcome: "accept_misspelling", basis: "human_review", canonicalEntityId: link.fromEntityId,
      evidenceIds: ["invented-proof"], rationale: "Attempted unsupported decision.",
    }],
  });
  assert.equal(receipt.identityLedger.acceptedDecisions.length, 0);
  assert.ok(receipt.invalidDecisions.some((decision) => decision.code === "unknown_identity_evidence"));
});
