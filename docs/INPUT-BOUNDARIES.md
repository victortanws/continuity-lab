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

## Stateless MCP envelope

The `/mcp` route accepts at most 32 KiB of JSON, including protocol and schema
overhead. Its reviewed-sample calls remain pinned to `vcs-demo-r2`; the v3.2
and v3.3 tool schemas remain compatible while the sample revision is explicit.

`continuity_compile_material` accepts at most eight named text documents and 64
total claim, entity-mention, and relation proposals. The advertised per-document
string limit is 20,000 characters, but the 32 KiB request ceiling is the
effective aggregate transport limit. Exact quotes are verified before claims
or entity candidates are admitted. An unlocatable or repeated quote without an
occurrence number is rejected; instruction-like material remains untrusted
data and cannot establish a claim. The packet closes only submitted-membership
and proposal-verification coverage, never whole-project truth.

Atomic claim frames are exact-span data rather than model paraphrases. Subject,
predicate, and each non-empty object must occur byte-for-byte in that order in
the accepted quote. The object may be exactly empty only with an explicit
`intransitive` frame whose copied predicate is one token at the end of the
quoted clause. Whitespace-only objects, punctuation placeholders, and discarded expressed
objects are rejected. Negative polarity requires direct
negation in the quote. A caller-proposed entity ID is admitted only if the same
identifier occurs literally in its entity quote; otherwise the compiler emits
a deterministic source-scoped candidate instead of inventing an identity.

An optional relation proposal refers only to original claim-array indices; it
cannot submit evidence IDs or canonical claim keys. The supporting claim must
be an accepted positive causal, normative, or historical span, the exact cue
must occur inside it, and both accepted endpoint spans must be nested inside
that same source span. Direction is fixed as prerequisite→dependent,
trigger→effect, or earlier→later. Negative relation statements, self-edges,
unanchored endpoints, repeated or invented cues, and compound `or`/`unless`
logic are rejected. Admitted relations remain source assertions and cannot
serve as a complete reachability certificate.

Optional temporal ordinals must include a unique exact marker such as `Day 8`
whose server-parsed axis and integer agree with the submitted values. Uploaded
dates, SemVer, ranges, and domain-specific orderings require a trusted adapter;
the compiler does not turn unverified numbers into temporal graph edges.

`continuity_inspect_public_repository` permits one canonical public GitHub
repository, optional ref, and optional `projectScope` ID or safe relative
subtree. The handler resolves a full commit, discovers independent project
roots and declared evidence domains, and returns no excerpts when a generic
question remains ambiguous. After scope selection it examines no
more than 1,000 tree entries, makes at most eight provider calls, reads at most
six safe text files and 384 KiB, returns at most 20 KiB of excerpts, and ends at
20 seconds without retry. It never accepts a GitHub token. A client must pass
returned excerpts to the text compiler for exact entity, contradiction, or
causal work.

The question graph is in-memory and question-scoped. Build ceilings are 512
input evidence records, 256 nodes, and 512 edges; traversal defaults to 72
nodes, 144 edges, and depth 3 and can never exceed depth 6. Short bounded
identity lookups bypass it. Trusted adapters may bind semantic links to exact
claim keys. The untrusted upload path instead uses exact evidence IDs for its
support span and both endpoints, so edge provenance cannot be confused with an
endpoint assertion.

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
