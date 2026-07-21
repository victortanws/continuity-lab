import assert from "node:assert/strict";
import test from "node:test";

import { buildContinuityEntityPackage } from "../../lib/continuity/entity-package.ts";
import { buildIdentityLinkPackage } from "../../lib/continuity/identity-link-package.ts";
import { buildMcpContextPacket } from "../../lib/continuity/mcp-context.ts";

function compile(input) {
  const packet = buildMcpContextPacket(input);
  const entities = buildContinuityEntityPackage(packet);
  return { packet, entities, links: buildIdentityLinkPackage(packet, entities) };
}

test("a plausible story-name typo is suggested without changing either identity", () => {
  const { entities, links } = compile({
    documents: [{ name: "chapter.md", text: "Asteria entered. Later, Asterai spoke." }],
    entityMentions: [
      { documentName: "chapter.md", quote: "Asteria entered.", mention: "Asteria", entityType: "character" },
      { documentName: "chapter.md", quote: "Later, Asterai spoke.", mention: "Asterai", entityType: "character" },
    ],
  });

  assert.equal(entities.entities.length, 2);
  assert.equal(links.candidateLinks.length, 1);
  assert.equal(links.candidateLinks[0].relation, "possible_typo");
  assert.equal(links.candidateLinks[0].safeToApplyAutomatically, false);
  assert.equal(links.candidateLinks[0].calibrated, false);
  assert.equal(links.policy.candidateLinksChangeIdentity, false);
  assert.equal(links.qa.safeForAutomaticMerge, false);
});

test("case-sensitive code symbols remain distinct even when their names differ only by case", () => {
  const { packet, entities, links } = compile({
    documents: [{ name: "symbols.ts", text: "createCharacter (fn:createCharacter) calls CreateCharacter (fn:CreateCharacter)." }],
    entityMentions: [
      {
        documentName: "symbols.ts", quote: "createCharacter (fn:createCharacter) calls CreateCharacter (fn:CreateCharacter).",
        mention: "createCharacter", mentionOccurrence: 1, explicitId: "fn:createCharacter", entityType: "function", identityProfile: "case_sensitive_symbol",
      },
      {
        documentName: "symbols.ts", quote: "createCharacter (fn:createCharacter) calls CreateCharacter (fn:CreateCharacter).",
        mention: "CreateCharacter", mentionOccurrence: 1, explicitId: "fn:CreateCharacter", entityType: "function", identityProfile: "case_sensitive_symbol",
      },
    ],
  });

  assert.equal(packet.entityCandidates.every((candidate) => candidate.identityProfile === "case_sensitive_symbol"), true);
  assert.equal(entities.entities.length, 2);
  assert.equal(links.candidateLinks.length, 1);
  assert.equal(links.candidateLinks[0].relation, "case_variant");
  assert.match(links.candidateLinks[0].contraindications.join(" "), /case-sensitive/i);
  assert.equal(links.candidateLinks[0].safeToApplyAutomatically, false);
});

test("lexically related code names are review candidates rather than semantic aliases", () => {
  const { links } = compile({
    documents: [{ name: "api.ts", text: "createCharacter calls CharacterCreator." }],
    entityMentions: [
      { documentName: "api.ts", quote: "createCharacter calls CharacterCreator.", mention: "createCharacter", entityType: "function" },
      { documentName: "api.ts", quote: "createCharacter calls CharacterCreator.", mention: "CharacterCreator", entityType: "class" },
    ],
  });

  assert.equal(links.candidateLinks.length, 1);
  assert.equal(links.candidateLinks[0].relation, "lexical_near_match");
  assert.equal(links.candidateLinks[0].confidenceBand, "low");
  assert.match(links.candidateLinks[0].contraindications.join(" "), /lexical similarity does not establish symbol identity/i);
});

test("same surface forms with different IDs are reported as a collision, never an alias", () => {
  const { links } = compile({
    documents: [{ name: "cast.md", text: "Grandma (CHR-1) waved. Grandma (CHR-2) called." }],
    entityMentions: [
      { documentName: "cast.md", quote: "Grandma (CHR-1) waved.", mention: "Grandma", explicitId: "CHR-1", entityType: "character" },
      { documentName: "cast.md", quote: "Grandma (CHR-2) called.", mention: "Grandma", explicitId: "CHR-2", entityType: "character" },
    ],
  });

  assert.equal(links.candidateLinks.length, 1);
  assert.equal(links.candidateLinks[0].relation, "surface_collision");
  assert.match(links.candidateLinks[0].contraindications.join(" "), /different explicit identifiers/i);
});

test("approved aliases still require the same exact source-scoped identifier", () => {
  const { entities, links } = compile({
    documents: [{ name: "cast.md", text: "Mara (CHR-7) arrived. Captain Mara (CHR-7) replied." }],
    entityMentions: [
      { documentName: "cast.md", quote: "Mara (CHR-7) arrived.", mention: "Mara", explicitId: "CHR-7", entityType: "character" },
      { documentName: "cast.md", quote: "Captain Mara (CHR-7) replied.", mention: "Captain Mara", explicitId: "CHR-7", entityType: "character" },
    ],
  });

  assert.equal(entities.entities.length, 1);
  assert.equal(links.establishedAliasGroups.length, 1);
  assert.equal(links.establishedAliasGroups[0].basis, "same_exact_source_scoped_identifier");
  assert.equal(links.candidateLinks.length, 0);
});

test("identity-link output is deterministic and bounded", () => {
  const input = {
    documents: [{ name: "notes.md", text: "Alpha arrived. Alphi departed." }],
    entityMentions: [
      { documentName: "notes.md", quote: "Alpha arrived.", mention: "Alpha", entityType: "person" },
      { documentName: "notes.md", quote: "Alphi departed.", mention: "Alphi", entityType: "person" },
    ],
  };
  assert.deepEqual(compile(input).links, compile(structuredClone(input)).links);
  assert.match(compile(input).links.packageFingerprint, /^fnv64:[0-9a-f]{16}$/);
});

test("candidate-pair expansion stops at the public review ceiling", () => {
  const lines = Array.from({ length: 24 }, (_, index) => `Alex arrived at station ${index}.`);
  const { links } = compile({
    documents: [{ name: "crowd.md", text: lines.join("\n") }],
    entityMentions: lines.map((quote) => ({ documentName: "crowd.md", quote, mention: "Alex", entityType: "person" })),
  });

  assert.equal(links.coverage.possiblePairs, 276);
  assert.equal(links.candidateLinks.length, 256);
  assert.equal(links.coverage.truncated, true);
  assert.match(links.qa.diagnostics.join(" "), /truncated/i);
});

test("an invalid matching profile is rejected rather than weakening the identity boundary", () => {
  const packet = buildMcpContextPacket({
    documents: [{ name: "source.md", text: "Mara appears." }],
    entityMentions: [{
      documentName: "source.md", quote: "Mara appears.", mention: "Mara", entityType: "person", identityProfile: "guess_everything",
    }],
  });

  assert.equal(packet.entityCandidates.length, 0);
  assert.equal(packet.rejectedProposals[0].code, "invalid_identity_profile");
});
