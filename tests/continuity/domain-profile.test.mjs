import assert from "node:assert/strict";
import test from "node:test";

import { buildDomainProfileProposal } from "../../lib/continuity/domain-profile.ts";
import { buildContinuityEntityPackage } from "../../lib/continuity/entity-package.ts";
import { buildMcpContextPacket } from "../../lib/continuity/mcp-context.ts";

function profile(input, question) {
  const packet = buildMcpContextPacket(input);
  return buildDomainProfileProposal(packet, buildContinuityEntityPackage(packet), question);
}

test("VCS material proposes resource and temporal parameters without activating them", () => {
  const result = profile({
    documents: [{ name: "story.md", text: "On Day 24, the Founder pays $47,000 for Grandma's operation." }],
    claims: [{
      documentName: "story.md", quote: "On Day 24, the Founder pays $47,000 for Grandma's operation.",
      claimKind: "normative", subject: "the Founder", predicate: "pays", object: "$47,000 for Grandma's operation", polarity: "positive",
      temporal: { marker: "Day 24", axis: "day", from: 24 },
    }],
    entityMentions: [
      { documentName: "story.md", quote: "On Day 24, the Founder pays $47,000 for Grandma's operation.", mention: "the Founder", entityType: "protagonist" },
      { documentName: "story.md", quote: "On Day 24, the Founder pays $47,000 for Grandma's operation.", mention: "Grandma", entityType: "character" },
    ],
  }, "Can the Founder pay for Grandma by Day 24?");

  assert.equal(result.activated, false);
  assert.equal(result.policy.safeForAutomaticActivation, false);
  assert.ok(result.candidateParameters.some((parameter) => parameter.kind === "temporal"));
  assert.ok(result.validatorCandidates.some((candidate) => candidate.validator === "temporal_ordering"));
  assert.equal(result.coverage.completeForProjectCorpus, false);
});

test("manhua observations retain project-specific character and asset dimensions", () => {
  const result = profile({
    documents: [{ name: "panels.md", text: "Panel P66 shows Han's palm touching the Crownbeast throat core. Panel P67 shows the Crownbeast collapsed." }],
    claims: [
      { documentName: "panels.md", quote: "Panel P66 shows Han's palm touching the Crownbeast throat core.", claimKind: "observed", subject: "Han's palm", predicate: "touching", object: "the Crownbeast throat core", polarity: "positive" },
      { documentName: "panels.md", quote: "Panel P67 shows the Crownbeast collapsed.", claimKind: "observed", subject: "the Crownbeast", predicate: "collapsed", object: "", frameArity: "intransitive", polarity: "positive" },
    ],
    entityMentions: [
      { documentName: "panels.md", quote: "Panel P66 shows Han's palm touching the Crownbeast throat core.", mention: "Han", entityType: "character" },
      { documentName: "panels.md", quote: "Panel P66 shows Han's palm touching the Crownbeast throat core.", mention: "Panel P66", entityType: "panel_asset" },
      { documentName: "panels.md", quote: "Panel P67 shows the Crownbeast collapsed.", mention: "Panel P67", entityType: "panel_asset" },
    ],
  }, "Does the physical action make sense from P66 to P67?");

  assert.ok(result.observedSubtypes.includes("character"));
  assert.ok(result.observedSubtypes.includes("panel_asset"));
  assert.ok(result.candidateParameters.some((parameter) => parameter.label === "touching"));
  assert.ok(result.candidateParameters.some((parameter) => parameter.label === "collapsed"));
  assert.ok(result.validatorCandidates.some((candidate) => candidate.validator === "state_transition"));
});

test("the same profile protocol handles a non-story museum custody record", () => {
  const result = profile({
    documents: [{ name: "custody.log", text: "Curator Lin transferred the bronze seal to Vault B." }],
    claims: [{
      documentName: "custody.log", quote: "Curator Lin transferred the bronze seal to Vault B.",
      claimKind: "observed", subject: "Curator Lin", predicate: "transferred", object: "the bronze seal to Vault B", polarity: "positive",
    }],
    entityMentions: [
      { documentName: "custody.log", quote: "Curator Lin transferred the bronze seal to Vault B.", mention: "Curator Lin", entityType: "person" },
      { documentName: "custody.log", quote: "Curator Lin transferred the bronze seal to Vault B.", mention: "the bronze seal", entityType: "artifact" },
      { documentName: "custody.log", quote: "Curator Lin transferred the bronze seal to Vault B.", mention: "Vault B", entityType: "location" },
    ],
  }, "Who has custody of the bronze seal?");

  assert.deepEqual(result.observedEntityTypes, ["object", "person", "place"]);
  assert.ok(result.candidateParameters.some((parameter) => parameter.label === "transferred"));
  assert.equal(result.status, "proposed");
  assert.equal(result.policy.truthOnlyOnApproval, true);
});

test("domain-profile generation is deterministic and does not manufacture parameters without evidence", () => {
  const input = { documents: [{ name: "blank.md", text: "No extraction was proposed." }] };
  const first = profile(input, "What matters here?");
  const second = profile(structuredClone(input), "What matters here?");
  assert.deepEqual(first, second);
  assert.equal(first.candidateParameters.length, 0);
  assert.equal(first.validatorCandidates.length, 0);
  assert.equal(first.activated, false);
});
