# Next causal-proof pass

## Objective

Prove that Continuity Lab can determine whether a proposed creative outcome is
currently possible, distinguish intention from execution, identify the complete
set of material prerequisites, and recommend the smallest canon-compatible
repair with less human review than ordinary repository retrieval.

This is a proof-of-value pass, not a feature-expansion pass.

## Baseline and branch boundary

The v3.4 router, its tests, its retrospective evaluation, and its documentation
must be frozen before this work begins. The current working tree contains the
uncommitted v3.4 implementation, so no v3.5 code should be mixed into it.

Start only after:

1. reviewing the complete v3.4 diff;
2. running `npm test` and `npm run lint`;
3. recording the passing revision and evaluation hashes;
4. committing or otherwise checkpointing v3.4 as one recoverable unit; and
5. creating a separate v3.5 branch or worktree from that checkpoint.

The v3.4 procedure and consumed benchmark remain immutable. They are comparison
artifacts, not tuning data for another v3.4 rerun.

## Dependency policy

No new runtime or npm dependency is required for this pass. Reuse:

- the TypeScript contracts and JSON schemas;
- the v3.4 proof-contract router;
- the existing transition graph and reachability evaluator;
- server-owned dependency obligations;
- authority, lifecycle, assertion-scope, completeness, citation, and entity
  validators;
- the current MCP and HTTP response envelopes; and
- Node's test runner and existing evaluation scripts.

Do not add a graph database, vector database, agent framework, queue, or another
model provider merely to complete this pass. A future storage or orchestration
decision must be justified by measured scale, not architectural preference.

Pin the current lockfile during the pass. If a security or build repair forces a
package update, isolate it in a separate change, regenerate the lockfile once,
and rerun the entire product suite before merging it with causal work.

## Contract strategy

The current public `truthStatus` field is used by the provider, engine, demo,
MCP route, UI, and tests. Changing its meaning in place would create a broad
compatibility conflict. v3.5 therefore adds internal types and preserves the
existing public envelope.

### Query proposition

Compile one explicit proposition before retrieval:

```text
proposition ID
normalized statement
polarity being tested
claim plane
entity and claim-key boundary
time and revision boundary
quantifier or completeness demand
```

### Proposition assessment

Keep these axes separate:

```text
answer polarity: yes | no | uncertain
proposition status: established | contradicted | not_established | conflicted | unknown
proof boundary: explicit | bounded_closed_world | trusted_transition | open
answer confidence: low | medium | high
```

The model may propose these values, but a deterministic compiler owns the final
combination. A well-supported answer of “no” must not establish the positive
proposition.

### Compatibility projection

Add the new assessment to internal `QueryResult.validation` or another optional
server-owned receipt first. Do not make it a required model-output field in the
first implementation. Project it into the existing `verdict`, `truthStatus`,
and `reachability` fields using a documented total mapping. Old v3.2/v3.3/v3.4
clients continue to receive the existing response shape.

Only introduce a new public answer version after the mapping has passed old
client fixtures and the site/MCP consumers are ready to negotiate it.

## Dependency-obligation strategy

Use the existing `TrustedReachability.obligations` mechanism as the authoritative
inventory. Extend its compiler, not the model output, with domain-neutral
categories:

1. identity;
2. initial state;
3. required state;
4. resource;
5. authorization;
6. knowledge;
7. time or ordering;
8. trigger or producer;
9. state mutation;
10. persistence;
11. repeatability or idempotency;
12. downstream consumer;
13. verification; and
14. asset or presentation compatibility when material.

Every obligation needs a stable ID, target claim key, status, evidence boundary,
and provenance. Inferred source relations remain navigational assertions unless
a trusted adapter promotes them into a reviewed transition graph.

The final answer may compress explanations but cannot drop an unresolved or
server-required obligation. The validator must insert omitted obligations and
reject invented ones, as it already does for trusted causal edges.

## Implementation order

### Phase 0 — freeze and reproduce

- Checkpoint v3.4.
- Reproduce all 306 continuity tests, rendered HTML tests, build, and lint.
- Save the exact Node version, lockfile hash, router version, test command, and
  retrospective evaluation hashes.
- Confirm that no public response schema changes are present before v3.5 work.

Gate: the same revision passes twice from a clean checkout or worktree.

### Phase 1 — fixtures before implementation

Create adversarial table tests for proposition/answer separation:

- positive proposition with explicit positive evidence;
- positive proposition with explicit negative evidence;
- positive proposition merely not found in open coverage;
- positive proposition absent from a complete registry;
- negative proposition with a positive counterexample;
- high-confidence “no” with `not_established` proposition status;
- a story requirement that is true while runtime reachability is unknown;
- a runtime transition that is implemented but not authorized;
- same-name entities where only one participates in the target outcome; and
- a proposed repair that must remain provisional.

Create dependency-recall fixtures with one required item in each obligation
category. Include distractor relations so that adding more edges is penalized.

Gate: fixtures fail against v3.4 for the intended reasons and do not alter the
consumed evaluation set.

### Phase 2 — proposition compiler

Add a small, deterministic module that compiles a query proposition from the
existing question intent, truth target, target claim keys, time scope, and
resolved entities. It must not contain VCS names or benchmark phrases.

Add a status compiler that accepts admitted conclusions, coverage, trusted
reachability, and conflicts. It returns the internal proposition assessment and
rejects impossible combinations.

Example invariant:

```text
answer polarity = no
positive proposition = not_established
trusted proof = absent
```

must never project to `truthStatus: supported`.

Gate: the new table tests pass, old lookup behavior is byte-equivalent where
possible, and no public schema has changed.

### Phase 3 — obligation compiler

Extend reviewed transition adapters so they can emit the full domain-neutral
obligation inventory. Keep automatic extraction provisional: a model can
suggest an obligation, but only exact evidence or a reviewed adapter can make it
server-owned.

Update the validator to report:

- required and satisfied;
- required and blocked;
- required and unresolved;
- suggested but untrusted; and
- irrelevant or rejected.

Gate: dependency recall reaches the target on synthetic and unrelated-domain
fixtures without increasing false dependencies beyond the set threshold.

### Phase 4 — bounded long-repository context

Create a versioned context capsule containing:

- proposition;
- resolved and unresolved entities;
- governing sources;
- admitted claims;
- transition and obligation slice;
- conflicts and unknowns;
- revision and time boundary; and
- a frontier receipt listing deferred files, failures, and exclusions.

Use content hashes to reuse unchanged derived material. A changed source
invalidates only capsules and transition projections that cite it. Do not claim
repository-wide absence when the frontier remains open.

Gate: a target hidden among more material than one context window is retained,
irrelevant files remain deferred, and a changed governing source invalidates the
answer while an unrelated change does not.

### Phase 5 — VCS reviewed adapter

Model the operation path as reviewed project configuration, not hard-coded
website prose:

```text
earn sufficient personal funds
→ meet payment preconditions
→ authorize hospital payment
→ deduct $47,000 exactly once
→ persist operation-funded state
→ unlock recovery scene
→ satisfy later UI, test, dialogue, and asset consumers
```

The adapter must cite the current story source, economy rules, event registry,
tests, and downstream consumers at a pinned revision. Company money and personal
money, and similarly named grandmothers, remain separate unless evidence
resolves them.

Gate: one live question produces the current-build verdict, all missing
dependencies, citations, and a minimal repair without relying on canned answer
selection.

### Phase 6 — repair and creative candidates

Generate three materially different proposals only after the causal diagnosis
is sealed. Evaluate each on separate axes:

- canon and implementation validity;
- dependency closure;
- novelty and dramatic value;
- player agency;
- engineering, writing, art, and test cost;
- affected downstream consumers; and
- remaining director decisions.

Never average creative value into truth status. A novel proposal may be
excellent and still unapproved.

Gate: human reviewers can identify distinct trade-offs, every candidate remains
provisional, and at least 80% of minimal repairs are judged useful.

### Phase 7 — product surface

Expose one complete public loop:

1. choose the worked example or bring material;
2. ask whether an outcome can happen;
3. see a plain-language answer;
4. see the decisive sources;
5. see what is missing and why;
6. see the smallest repair; and
7. optionally compare director-ready alternatives.

Hide internal graph terminology, router versions, closure jargon, evaluation
controls, and downloads unless the user opens a technical detail or analyzes
their own material. The UI must never display a follow-up question that the
active route cannot answer.

Gate: all visible example questions have complete reviewed outputs and the live
route passes the same fixtures used by the rendered example.

### Phase 8 — blind evaluation

Create a fresh reserve before examining model responses. Use at least five
unfamiliar evidence packs:

- resource-dependent game quest;
- identity-ambiguous screenplay;
- specification/implementation software disagreement;
- source-authority archive or policy case; and
- image-sequence causal gap.

Include positive, explicit-negative, open-world absence, closed-world absence,
conflict, proposal, and change-impact questions. Freeze packet hashes, prompts,
run order, model, schemas, graders, and score computation. Run naive retrieval
and v3.5 once per case; preserve raw responses.

Do not tune on the reserve. Failures become the next development set only after
the sealed score is recorded.

## Acceptance metrics

| Metric | Release gate |
|---|---:|
| Source-authority accuracy | at least 90% |
| Entity-resolution precision | at least 90% |
| Causal dependency recall | at least 85% |
| False-supported causal propositions | at most 5% |
| Story-intent versus executable-state distinction | at least 90% |
| Citation locator validity | 100% |
| Human approval of minimal repairs | at least 80% |
| Median review-time reduction | at least 30% |
| Simple lookup score regression | no more than 2 points |
| Simple lookup latency overhead | no more than 20% |

Report confidence intervals and sample counts. Do not claim general superiority
from the VCS result or the consumed retrospective benchmark.

## Merge and conflict controls

- One owner changes public contracts and schemas at a time.
- Contract changes land before provider, validator, MCP, UI, and documentation
  projections that depend on them.
- Test fixtures land with or before their implementation.
- Evaluation packets never share a commit with router changes after sealing.
- VCS adapter facts remain separate from domain-neutral engine code.
- Site copy never becomes a source of truth for causal results.
- Generated indexes are replaceable; stable IDs, source versions, and approval
  records are durable.
- Every migration is additive until old client fixtures pass.
- No merge occurs with a dirty lockfile, skipped test, unreviewed schema diff,
  or unexplained score regression.

## Verification commands

Run at every phase boundary:

```bash
npm run test:continuity
npm run build
npm run lint
```

Run the complete release gate before a checkpoint:

```bash
npm test
```

Add targeted commands for proposition, obligations, reachability, routing, MCP,
and rendered UI fixtures so a local failure can be diagnosed without repeatedly
paying for a full provider run.

## Rollback plan

Keep v3.4 as a selectable router version until the blind reserve passes. If
v3.5 harms lookup, latency, MCP compatibility, or dependency precision, retain
the new fixtures and proposition receipts but route production traffic through
v3.4. No data migration should be irreversible in this pass.

## Explicit non-goals

Do not build autonomous repository writes, automatic canon promotion, team
permissions, private-repository OAuth, generic graph visualization, automatic
art generation, or the proposed cross-industry autonomous-development protocol
in this pass. The architecture should remain compatible with those futures, but
the release must prove causal diagnosis and useful repair first.

## Definition of done

The pass is complete only when:

1. a live VCS repository question produces a non-canned, cited causal answer;
2. the positive proposition and answer polarity cannot be confused;
3. all trusted dependencies survive generation and validation;
4. a minimal repair and distinct provisional creative alternatives are useful
   to human reviewers;
5. long-repository context remains revision-pinned and honest about omissions;
6. old MCP and site clients continue to work;
7. the full local suite, build, lint, and security boundaries pass; and
8. a fresh sealed evaluation meets the release gates without post-hoc tuning.
