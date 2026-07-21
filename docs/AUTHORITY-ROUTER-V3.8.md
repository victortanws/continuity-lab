# Authority Router v3.8: reviewed project knowledge

Router v3.8 preserves the five public MCP tools, the `continuity.mcp.v1`
transport, every existing required input, exact-span evidence, project-scope
receipts, v3.6 entity package, and v3.7 proposal receipts. It adds two optional
outputs and three optional compiler inputs.

## Two-call review protocol

The first `continuity_compile_material` call behaves as before. It returns
deterministic `identityLinks` and `domainProfile` fingerprints plus stable
candidate IDs.

After review, a client may repeat the unchanged call with `knowledgeReview`:

1. identify the project scope, revision, and reviewer role;
2. bind the envelope to both proposal fingerprints;
3. decide selected identity candidates;
4. approve or reject selected parameters and validators; and
5. request profile activation only when at least one parameter and validator
   have been explicitly approved.

The compiler rejects stale fingerprints, unknown candidate or evidence IDs,
duplicate decisions, incompatible canonical selections, lexical attempts to
merge different explicit IDs, and code-symbol merges without a parser-binding
basis.

Accepted decisions create `continuity.reviewed-knowledge.v1`. They never mutate
the source entity package. The receipt preserves every spelling and locator,
builds a separate canonical projection, retains unresolved candidates, and
reports rejected or invalid decisions.

## Authority boundary

The public MCP is keyless. It can verify that the decision envelope is
internally consistent with the submitted packet, but it cannot prove who
submitted it. Therefore:

- review authority is `caller_attested_review`;
- `authenticated` is false;
- `projectCanon` is false;
- automatic identity application is false; and
- automatic validator execution is false.

The receipt separately reports whether it is ready for a caller-requested
projection or validation. Durable authority requires committing the envelope
and receipt through an approved repository workflow or an authenticated
workspace adapter.

## Portable snapshots

Every compile call returns `continuity.knowledge-snapshot.v1`. It binds:

- upload or repository scope;
- immutable document content fingerprints;
- entity-package fingerprint;
- identity-link fingerprint;
- domain-profile fingerprint; and
- reviewed-knowledge fingerprint.

Supplying `previousSnapshot` compares new, changed, and unchanged documents.
`complete_packet` may additionally report removed documents for a direct upload
whose caller declares that packet complete. Public repository excerpts are
always forced to `delta_packet`: a question-scoped excerpt set cannot prove
that an omitted repository file or fact was deleted.

The snapshot is a portable checkpoint, not server persistence. Teams can store
it in source control today and later move the same contract into an
authenticated database or enterprise review system.

## Generalization and evaluation

The regression suite covers narrative misspellings, two same-name characters
with different IDs, case-sensitive software symbols, VCS money and time,
manhua panel transitions, museum custody records, software-release causality,
tampered reviews, cross-project snapshots, and question-scoped GitHub deltas.

The release does not claim calibrated typo probability, complete repository
indexing, authenticated approval, or built-in AST parsing. Those remain adapter
and evaluation work rather than hidden assumptions.
