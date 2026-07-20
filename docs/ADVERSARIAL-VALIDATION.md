# Adversarial validation

This document is the release gate for Continuity Lab. The engine must prefer a bounded, honest answer over a fluent invention. Prose can vary across model versions; verdicts, revision pins, and supporting evidence should remain stable.

## Automated MVP cases

| Case | Expected behavior | Release blocker |
|---|---|---|
| Evidence from another project is returned by search | Remove it before reasoning and reveal none of its text | Yes |
| Model invents or mismatches an evidence ID | Remove the citation; downgrade any unsupported verdict | Yes |
| Equal-authority active sources assert opposite polarities | Return `CONFLICT`, preserve both source IDs | Yes |
| An explicit retcon supersedes an older source | Exclude the superseded source from the effective projection | No |
| Answer proves a negative from ordinary retrieval silence | Return `INSUFFICIENT_EVIDENCE` | Yes |
| A complete trigger registry proves that no producer exists | Permit `UNREACHABLE` only with scope and blocker | No |
| Source says “ignore previous instructions” | Flag it and keep it inside the untrusted evidence envelope | Yes |
| Proposed repair has no assumptions | Add a provisional assumption; never present it as canon | Yes |
| Dependency rules need an unavailable producer | Report the missing prerequisite | No |
| Dependency rules form a cycle with no seed | Terminate and report the cycle | No |
| “Grandma” resolves to the Founder’s Grandma and USER_0047’s grandmother | Return two entities; do not merge | Yes |
| Customer message uses CAST-27 art while referring to USER_0047’s grandmother | Report a text-to-asset identity conflict | Yes |
| OpenAI search returns provider IDs without internal provenance metadata | Fail closed; do not create a citation from the provider ID | Yes |
| GPT output is malformed or outside the schema | Return a typed provider error; display no synthetic success | Yes |

## Required pre-publication cases

These require larger fixtures or integration infrastructure and are recorded now so the MVP does not overclaim them.

### Authority and time

- Active $47,000 contract versus archived $35,000 draft: answer from the active revision.
- Two active equal-priority files disagree: expose conflict rather than inventing a tie-break.
- Relationship before and after a betrayal: return different results pinned to story time.
- Character belief versus narrator/world state: preserve both epistemic owners.
- Source changes between questions: the first answer remains replayable against R1; a follow-up explicitly selects R1 or R2.
- Nonlinear narration: distinguish discourse order from event chronology.

### Reachability and pacing

- No causal producer, but parser coverage is partial: reachability is `unknown`, not impossible.
- Producer/consumer prerequisite cycle: identify the cycle members and lack of seed.
- $47,000 is reachable only after 400 days: report “reachable but pacing constraint violated.”
- A generated event produces money without an approved ledger action: reject the path.
- An allegedly complete graph omitted a failed source parse: invalidate its completeness claim.

### Change impact

- Change $47,000 to $60,000 where one authoritative value feeds prose, UI, runtime, and tests: identify the write-home and each derived consumer.
- Remove the Day 8 setup: identify the semantic weakening of the later payoff even without a literal file reference.
- Reuse an unapproved post-operation image: return `review_or_promote`, never approved canon.
- Revive a dead character in a later event: report temporal conflict and keep spirit/flashback/alternate-timeline routes as proposals.

### Long and hostile input

- Two novel characters share a surname or title: return candidates and request disambiguation.
- OCR/PDF loses pages: mark ingestion partial and prevent corpus-wide negative claims.
- UTF-16 text: normalize with stable offsets or reject clearly.
- Malicious filename, misleading MIME, or polyglot: sanitize, inspect, and quarantine unsupported input.
- Copyrighted private upload: preserve tenant isolation and minimize displayed excerpts.

### Provider robustness

- Re-embed or swap retrieval providers: internal source, entity, evidence, and analysis URIs remain unchanged.
- Repeat a strict query across model versions: status and evidence set remain stable within tolerance, though prose can change.
- Timeout, refusal, or rate limit: typed error and bounded retry; no fabricated fallback.
- Stale conversation ID: reconstruct the answer from revision, question, prompt version, and evidence refs.

## Metrics

- citation precision and completeness;
- contradiction and ambiguity recall;
- entity-resolution precision/recall;
- reachability accuracy conditional on declared coverage;
- canon/proposal leakage rate;
- cross-project isolation;
- snapshot reproducibility;
- abstention accuracy;
- blast-radius recall by writing, design, engineering, test, and art surface.

Run the same evaluation harness against Vibe Coder Simulator, Slap the Heavens, and an unrelated long-form text. Compare it with a naive single-prompt/file-upload baseline using the same source set. A Build Week claim of external validity should be based on that cross-domain result, not the beauty of the VCS fixture alone.
