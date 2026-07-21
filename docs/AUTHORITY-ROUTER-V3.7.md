# Authority Router v3.7: reviewed identity and schema proposals

Router v3.7 preserves the v3.6 repository boundary, exact-span compiler,
evidence-bearing entity package, question graph, trusted reachability proof,
bounded execution, and five MCP tool names. It adds two versioned, additive
receipts to `continuity_compile_material`.

## Why identity precedes schema

Dataset-specific traits are unsafe when they attach to the wrong referent.
This pass therefore handles near identity before proposing parameters. Neither
stage changes project truth:

1. accepted exact mentions become source-scoped entity candidates as before;
2. deterministic comparison produces review-only identity links;
3. accepted claims and entities produce an inactive domain-profile proposal;
4. a later reviewed adapter may accept links and activate selected parameters.

## Identity-link boundary

`continuity.identity-links.v1` contains established alias groups, proposed
links, comparison profiles, coverage, and QA.

Established aliases require the same exact source-scoped identifier. Proposed
links may report:

- identical unresolved surface forms;
- case, punctuation, spacing, or identifier-boundary variants;
- reordered tokens;
- bounded edit-distance typo candidates;
- lexical near matches;
- one surface bound to different explicit IDs; or
- an apparent explicit ID reused under different source owners.

Every proposal contains both entity IDs, both source forms, evidence mention
IDs, reasons, contraindications, and an uncalibrated deterministic score. The
score ranks inspection order; it is not a probability. All proposals use
`safeToApplyAutomatically: false`.

Ordinary names default to `natural_language`. Entity mentions may opt into
`case_sensitive_symbol` or `opaque_identifier`. Common code-symbol types infer
the case-sensitive profile when the caller omits it. Consequently,
`createCharacter`, `CreateCharacter`, and `CharacterCreator` can be compared
without being collapsed. A language parser, symbol table, references, or a
reviewed rename record is still required to establish code identity.

## Domain-profile boundary

`continuity.domain-profile.v1` proposes parameters observed in the submitted
packet:

- source-specific entity subtypes;
- exact accepted claim predicates;
- verified temporal axes; and
- admitted exact-span relationship types.

Candidates map to identity, state, resource, permission, knowledge, event,
temporal, or relationship dimensions. Suggested validators follow from those
dimensions, but every candidate is `proposed`, every activation is
`requires_review`, and the profile itself is `activated: false`.

The profile does not claim to discover every useful parameter in a project.
It covers accepted proposals in one submitted packet. A parameter should be
approved only when it changes identity, admissible answers, causality,
reachability, conflict detection, authority, or downstream validation.

## Compatibility

- The MCP transport remains `continuity.mcp.v1`.
- All five tool names and existing required inputs remain unchanged.
- `continuity.entity-package.v1` remains unchanged.
- `identityProfile` is an optional entity-mention input.
- `identityLinks` and `domainProfile` are additive compiler output fields.
- Router metadata advances to `3.7.0`.
- Reviewed VCS question, dependency, and change tools retain their existing
  behavior and immutable sample boundary.

## External-validity tests

The regression suite exercises:

- a story-character misspelling;
- same-surface characters with different exact IDs;
- stable-ID aliases;
- case-sensitive and lexically related software symbols;
- VCS money and time parameters;
- manhua panel/action observations; and
- an unrelated museum custody record.

The tests assert that no candidate link merges identity, no inferred parameter
activates itself, exact source evidence remains reproducible, existing tools
stay callable, and generation is deterministic and bounded.

## Known limits

This is not a language-server integration, a durable reviewed alias ledger, a
calibrated probabilistic resolver, an exhaustive corpus schema inducer, or a
raw-image spatial extractor. Those are future adapters built on the proposal
contracts introduced here.
