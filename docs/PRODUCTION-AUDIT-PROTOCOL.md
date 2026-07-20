# Production audit protocol

`auditProductionProcess` turns a curated sequence of production observations
into a deterministic, evidence-backed audit. It is domain-neutral: an artifact
may be a comic panel description, deployment event, laboratory record, design
review note, or any other step that can be represented as typed state.

## Input boundary

The caller supplies:

- a revision-pinned evidence set with authority, role, lifecycle, and locator;
- ordered intent steps and their expected state or event outcomes;
- optional observations produced upstream from images, text, or event records;
- attempts and explicit rejection reasons;
- a curated transition graph and its coverage declaration; and
- workflow gates plus separate approval and promotion evidence.

An `image_description` means that another trusted component or reviewer has
already extracted the observation. This module does not inspect image bytes,
perform OCR, resolve entities, retrieve files, or call OpenAI.

Interpret the graph's coverage declaration using the same explicit boundary:
`closed` requires affirmative claim-compatible completeness with no excluded,
failed, truncated, or deferred source; `partial` records a known omission or
hard limit; `open` means no complete observation boundary was established. The
current report derives conservative causal status from the graph fields rather
than emitting a separate top-level closure enum. A statement such as “no panel
ever shows the reward UI” cannot be established from a partial image sequence.
A directly observed premature reward UI may still contradict the intended
order.

## Deterministic route

1. Reject foreign, duplicate, inactive, and evaluation evidence references.
2. Check whether intent and observation citations may establish their claimed
   role under the authority policy.
3. Compare every expected outcome with the explicit observed state. Absence is
   `unknown` unless the extractor supplies an exact negative assertion or marks
   that state dimension complete. Never interpret an omitted object in an open
   image description as deleted or an omitted permission as revoked.
4. Pass adjacent observations to the causal-gap evaluator. A change is
   `explained` only when one compatible transition path accounts for the whole
   observed delta. Proposed bridges and incomplete graph coverage stay
   provisional or unknown.
   Additions and explicit removals are compared symmetrically: false facts,
   revoked permissions, forgotten knowledge, and retracted events all require
   a registered transition on the same compatible path. A disappeared balance
   becomes an equality-to-zero target only when the resource dimension is
   complete or that account/resource/unit tuple is explicitly absent; otherwise
   it remains unknown.
5. Keep graph preconditions, rule admission, and coverage as server-owned
   inputs. Generated prose cannot redefine or omit them; an unexplained delta
   remains a causal gap or unknown in the deterministic report.
6. Resolve declared ambiguities only when the named later step is actually
   observed; detect explicitly configured `notBeforePosition` violations.
7. Retain rejected attempts in the report and link qualified localized or full
   retries to the attempt they replace.
8. Compute attempts, qualification rate, retry scope, and recovery counts.
9. Audit—not mutate—the lifecycle. Required gates, quality findings, approval,
   and promotion are separate. A declared approval or promotion is downgraded
   in the report when its evidence or gates do not support it.
10. Return one conservative next action: correct evidence, rerun a step, resolve
   ambiguity, complete causal evidence, satisfy a gate, request approval,
   promote, produce the next planned step, or stop.

The normal entry route should remain proportional. “Which asset is currently
promoted?” is a focused authority/identity lookup and does not need a full
sequence audit. “Did these panels causally deliver the intended beat?” opens the
production route and its state, attempt, gate, approval, and promotion lanes.
Both routes stop at fixed evidence/graph/time budgets; the query system does not
retry until it gets a desired audit result.

The deterministic entry point rejects requests beyond its hard envelopes before
sorting or graph expansion: 1,024 evidence records, 256 steps, bounded outcomes,
attempts, ambiguities, gates, references, and 4 MiB aggregate evidence text.
The reachability core separately bounds rules, conditions, effects, initial
state dimensions, target leaves, horizon span, identifiers, and explored states.

## Cost-sensitive inspection planning

The separate `planInspections` core addresses the asymmetric economics of
review. A missed defect in a lookup may be cheap to correct; a missed identity,
causality, lettering, or terminal-state defect in a promoted page may require a
rerender, relayout, and another approval cycle. One universal confidence
threshold is therefore inappropriate.

For each server- or operator-calibrated risk, the planner records defect
probability, escape cost, early-rerun cost, and whether the risk blocks release.
Each available check records bounded cost/time units and its calibrated
detection probability for named risks. For audit reporting it derives each
check's marginal contribution in deterministic execution order:

```text
marginal avoided loss
  = calibrated defect probability
    × marginal detection probability after prior checks
    × (cost if missed − cost if caught now)
```

The optimizer minimizes one cost-sensitive objective over the whole candidate
set:

```text
planning loss
  = max(residual expected loss, policy tolerance)
    + converted inspection effort
```

This is stronger than selecting one locally attractive check at a time. A pair
whose individual members do not repay their effort can still be selected when
an approved joint calibration makes the complete bundle worthwhile. Different
evidence-family or signal-channel labels never establish statistical
independence: their detection rates do not multiply. Only a separately approved,
revisioned exact joint calibration can credit a combination beyond its strongest
member.

Mandatory checks and release-blocking risks are hard constraints inside the
same bounded global optimization. The planner enumerates each subset of at most
14 candidates once, rejects subsets outside the check/cost/time ceilings, and
chooses the feasible set with the lowest planning loss. Consequently, a cheap
mandatory prefix cannot strand a more valuable optional bundle. Lookup,
standard, promotion, and high-rework presets use progressively deeper hard
ceilings and lower residual-loss tolerances; `expensive_rerender` remains a
compatibility alias for older stored policies.

The full pass is exact within its declared static additive calibrated model and
candidate set, not a greedy heuristic. The implementation compares the exact
sum of the calibrated IEEE-754 terms for objective deltas, threshold gates, and
cost/time ceilings, so a large common loss cannot erase a smaller economically
useful check and no numeric tolerance can admit a true budget or release-gate
overage. Canonical ordering makes the result invariant to caller array order.
It is protected by hard limits of 14
checks, 16 risks, 192 direct detection edges, 64 joint calibrations,
96-character IDs, 160-character labels, bounded numeric magnitudes, and a
deterministic work-unit ceiling. It never reselects a check and never retries
recursively. If a mandatory
risk remains uncovered when the check, cost, or time ceiling is reached, the result is
`mandatory_uncovered`; promotion must stop or go to human review. Human-found
misses should update measured failure classes and regression fixtures rather
than add project names or answer facts to the router.

This is a one-pass static planner. False-positive costs, shared rerun costs,
conditional check outcomes, and adaptive early stopping are not separate model
dimensions today; an approved calibration must fold their expected consequence
into risk, rerun, and inspection-cost terms. Therefore “exact” means exact only
for this declared additive model—not globally optimal real-world review.

Calibration authority is not accepted merely because a request labels itself
“measured.” Trusted server code supplies a revisioned approval registry and a
pinned evaluation timestamp. The planner requires an exact authority/revision
match, rejects unknown, duplicate, not-yet-valid, and expired approvals, and
records the applied registry provenance in its result. Registry factors apply a
conservative upper bound to defect incidence and a lower bound to detection
performance. The primary approval contains the exact canonical
risk/check/joint/policy catalog; any changed probability, consequence,
correlation label, joint bundle, or budget is rejected. The registry and catalog
must be resolved on the server and must never be copied from an HTTP request body.

## Typical manhua routing

An upstream review adapter can describe each panel as a `GraphState`, retaining
panel/region evidence IDs and unresolved visual ambiguities. The chapter or
panel manifest supplies intent outcomes; continuity and production rules supply
the observed transition graph; generation calls become attempts; the QA and
director records become gates and approval evidence. The resulting report can
then reproduce the useful shape of a human review: per-panel intent and causal
assessment, sequence-resolved ambiguities, premature reveals, rejected rerolls,
efficiency, approval state, and the next permissible action.

The audit never promotes a panel, edits canon, or infers a visual fact from raw
pixels. Those remain separate authenticated ingestion, entity-resolution, and
approval integrations.

## Integration status

The deterministic `auditProductionProcess` and causal-gap libraries exist and
are reusable across domains. They are not currently exposed through the MVP's
upload/query API or browser. A caller must already provide extracted,
revision-pinned observations, evidence IDs, intent, attempts, gates, and a
curated transition graph. The reviewed VCS query route does not automatically
turn an arbitrary uploaded manuscript into this production structure.

A future manhua adapter can add raw image ingestion, vision/OCR with panel and
region locators, character/asset entity resolution, attempt-log import,
manifest and approval-ledger connectors, and a formatter matching the visual
review report. The resulting observations must still pass the same authority,
prompt-injection, ambiguity, coverage, and causal checks. XLS/XLSX and
standalone screenshots are not current ingestion promises; an exporter may
convert them to validated text/records until dedicated adapters exist.
