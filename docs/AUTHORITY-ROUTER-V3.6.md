# Authority Router v3.6: evidence-bearing entity handoff

Router v3.6 preserves the v3.5 project boundary, authority lanes, exact-span
compiler, causal proof rules, and bounded inspection planner. It adds a portable
machine contract for the entity evidence that the compiler already verifies.

It also closes the connector handoff that v3.5 left open. Public repository
inspection now emits `continuity.repository-scope-receipt.v1`, binding the
repository, pinned commit, selected project scope, and exact returned excerpts.
Repository-wide compilation requires that receipt and rejects altered,
missing, additional, or cross-scope documents. Direct uploads remain
receipt-free. The receipt is deliberately marked `integrity_check_only` and
`grantsAuthority: false`: it prevents accidental evidence blending but is not
an authentication credential or a canon decision.

## Why this pass exists

An entity list can be semantically careful but still be unsafe for another
agent to act on. A downstream system needs to distinguish an entity from each
textual occurrence of that entity, reproduce the exact source evidence, retain
unresolved candidate sets, validate the ontology, and know whether automatic
merging is permitted.

The Gutenberg entity-resolution evaluation found this precise gap. Continuity
Lab avoided the tested false attribution and calibrated ambiguity well, but its
flat CSV did not expose enough row-level provenance or structural QA. Router
v3.6 addresses the recurring machine-handoff finding without tuning the
resolver to that novel or changing what counts as identity evidence.

## Additive contract

`continuity_compile_material` keeps its original compact `entities` array and
adds `entityPackage` with version `continuity.entity-package.v1`:

1. `entities` contains source-scoped resolved records and unresolved
   candidates;
2. `mentions` contains exact occurrences, locators, quotes, evidence
   fingerprints, and declared offsets;
3. `ambiguitySets` prevents same-surface candidates from being silently merged;
4. `relations` preserves admitted exact-span claim relations as source
   assertions;
5. `ontology` supplies controlled top-level types and extensible subtypes;
6. `provenance` binds the result to source fingerprints and router/context
   versions; and
7. `qa` records deterministic checks and action-safety flags.

Offsets are zero-based, half-open JavaScript string indices measured in UTF-16
code units. This convention is stated in both the package and each mention.

## Identity boundary

Unresolved mentions never merge merely because their normalized spelling is
the same. Each remains a separate entity candidate. Repeated mentions may
consolidate only when the same exact explicit identifier is present and the
existing compiler has bound that identifier to the same source-scoped
referent. Different sources remain different owners even if they reuse the
same apparent identifier.

Aliases are therefore not model decorations. Every alias in the package must
be copied from a linked accepted mention. Contextual titles, allusions, and
metonyms require additional identity evidence before they can join an entity.

## Ontology boundary

The portable top-level vocabulary is deliberately small:

`person`, `organization`, `place`, `object`, `work`, `event`, `rule`, `state`,
`goal`, `asset`, and `other`.

Source- or project-specific categories remain in `subtype` and future typed
attributes. This prevents a new incompatible top-level type from being minted
for every combination such as “fictional allegorical person.”

## QA boundary

The deterministic receipt checks identifier uniqueness, exact mention anchors,
explicit-ID anchoring, evidence membership, alias evidence, controlled ontology,
unresolved identities, ambiguity, rejected proposals, and source disagreement.

`safeForAutomaticIdentityMerge` is true only when every check passes and every
entity is explicitly resolved. `safeForProjectCanonPromotion` is always false
for this packet-relative upload path. A structurally valid package may therefore
remain unsafe for autonomous action, which is intentional.

## Compatibility

- MCP tool names remain unchanged.
- `continuity.mcp.v1` remains the transport data contract.
- Existing compact claims, entities, relations, conflicts, graph, rejection,
  and diagnostic fields remain present.
- Router version metadata advances to `3.6.0`.
- The new entity package is generated deterministically and makes no provider
  call.

## Validation and external validity

The regression suite includes:

- two same-named characters with different exact IDs;
- two surface forms with the same exact source-scoped ID;
- repeated unresolved names that must not merge;
- rejected unanchored identifiers;
- deterministic package reproduction; and
- an unrelated software-release and migration example using the same contract.

The original Gutenberg comparison remains a regression benchmark, not a
development answer key. A later sealed evaluation should add a second novel, a
mixed game repository, and a non-story operational corpus and score false
merges, false splits, mention precision/recall, ambiguity calibration, span
validity, provenance completeness, schema validity, runtime, and cost.

## Known limit

The package can faithfully serialize only the mentions and claims supplied to
the exact-span compiler. It does not establish that the complete manuscript or
repository was exhaustively searched. Corpus coverage therefore remains open
unless a separate trusted completeness boundary proves otherwise.
