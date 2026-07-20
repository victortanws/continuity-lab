# Input and adapter boundaries

Continuity Lab accepts data from HTTP callers, retrieval providers, evidence
compilers, repository connectors, and future MCP adapters. Each adapter is a
trust boundary. TypeScript types do not validate values received at runtime.

## Engine envelope

`ContinuityEngine` rejects an input before the next expensive stage when it
exceeds a server-owned bound:

- request question and proposed change: 8,000 UTF-8 bytes each;
- conversation: 6 turns; context references: 20; target claim keys: 128;
- pinned source-version membership: 2,000 IDs, enough for the repository
  connector's current 2,000-entry tree ceiling;
- raw retrieval: 256 fragments; compiled evidence: 512 fragments;
- evidence text: 64 KiB per fragment and 2 MiB per phase in aggregate;
- evidence IDs: 256 bytes; titles: 512 bytes; locators: 2 KiB;
- nested evidence lists and entity candidates have independent count and item
  size limits; compiler diagnostics are also bounded.

These are admission ceilings, not targets. The authority router still selects
at most 24 records for a deep reasoning pass. A limit failure is a typed
`ContinuityInputError`; the engine does not truncate the asserted question,
silently drop context, retry, or continue with changed semantics.

The HTTP query route applies the same policy before authentication, storage,
retrieval, or model work. The reviewed paid demonstration is narrower still:
it accepts only its exact server-owned receipt and rejects every extra field.

## Upload envelope

The source route parses at most one file and one value for each multipart
metadata field before any D1, R2, GitHub, or OpenAI operation. UTF-8 limits are
128 bytes for the project ID, 160 for project title, 200 for logical name, 300
for the original filename, 24 each for document type and authority, 64 for
`validFrom`, and 160 for `supersedesSourceId`. Control characters, duplicate
fields, non-text metadata parts, and malformed IDs fail closed. The encoded,
normalized metadata envelope is added to the file size for actor/global MiB
usage charging and the current-project admission check; it is not free quota.

Direct-upload `validFrom` accepts only exact ISO calendar dates (`YYYY-MM-DD`)
or explicit whole-number story markers such as `Day 8` and `Chapter 12`, from
zero through a fixed ceiling of 1,000,000,000. The adapter
emits a matching numeric order and temporal axis for provider indexing.
Arbitrary phrases are rejected rather than stored as apparently timeless
evidence.

## Temporal normalization boundary

The core natively parses ordinal story axes such as `Day 8`, `Chapter 12`,
`Scene 4`, and `Episode 3`. Other ordered domains remain supported through the
explicit numeric fields, but must be normalized by a trusted adapter:

- an ISO date adapter can use `temporalAxis: "date"` and UTC epoch-day numbers
  in `validFromOrder`, `validToOrder`, `storyPosition`, and `targetPosition`;
- a semantic-version adapter can use `temporalAxis: "semver"` and a comparator-
  derived monotonic ordinal that preserves the project's declared SemVer and
  prerelease policy.

The engine deliberately does not guess dates from free text or turn `1.10.0`
into a decimal. Date timezone rules and semantic-version prerelease ordering
are domain policy, and a partial generic parser could silently reverse an
interval. Adapters must emit one matching axis and finite normalized orders;
mixed axes fail closed during routing. The original source marker remains in
`validFrom` or `validTo` for citation and audit.

## Operational response

If a source legitimately exceeds an envelope, split it at a source-owned
boundary, retain immutable source/version IDs and locators, and declare any
deferred material in coverage metadata. Raising a server limit requires a
capacity review; it is never a client option.
