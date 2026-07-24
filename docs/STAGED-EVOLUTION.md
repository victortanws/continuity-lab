# Continuity Lab staged evolution

**Status:** governing product direction  
**Active stage:** Stage 1 — dependable evidence-backed MVP

This document preserves the intended evolution of Continuity Lab outside any
single conversation, model, or agent run. Future implementations should treat
it as the product-direction baseline. It does not make a proposed feature real,
and it does not override evidence about what the current code or deployment can
actually do.

## Purpose

Continuity Lab is an evidence-backed planning and change-control layer for
long-running creative software projects. It should help people and agents
understand what a project establishes, what its implementation permits, what is
uncertain, what a proposed change would affect, and what must be validated
before that change is promoted.

The long-term aim is controlled creative autonomy: agents may propose and later
implement novel work, while evidence, identity, causality, approval, and project
history remain explicit and reviewable.

## Governing invariants

1. **Evidence precedes inference.** Preserve original material, revisions, and
   source-owned locators. Search results and generated prose are projections,
   not sources of truth.
2. **A proposal is not canon.** Generated possibilities remain provisional
   until an authorized human or project policy approves them.
3. **Project boundaries come before retrieval.** Never combine evidence from
   different products, stories, examples, or revisions merely because they
   share a repository or conversation.
4. **Memory must be explicit.** Long-running context should become versioned,
   source-linked project memory rather than hidden conversational memory.
5. **Action authority follows proof.** Read-only inspection comes before
   planning; planning comes before approval; approval comes before repository
   mutation.
6. **The core remains domain-neutral.** Project-specific adapters may define
   relevant entities, state, transitions, visual constraints, and validators,
   but one example must not become the universal ontology.
7. **Simple questions stay economical.** Focused lookups should use the minimum
   safe route. Causal, exhaustive, or expensive changes may invoke deeper
   bounded checks.
8. **Compatibility is an explicit boundary.** Existing public tools and stable
   contracts are not silently renamed or repurposed. Additive evolution must be
   covered by regression tests.
9. **Capability claims require evidence.** Tests establish specific behavior;
   they do not prove broad model superiority or exhaustive corpus understanding.
10. **Humans retain creative and promotion authority.** The goal is to reduce
    repetitive review, not to erase direction, taste, consent, or accountability.

## The staged path

### Stage 1 — Dependable evidence-backed MVP

Accept material supplied through ChatGPT or a bounded public repository
inspection; resolve the intended project; pin the relevant revision; distinguish
source roles; answer focused questions with citations, ambiguity, coverage, and
useful next steps; and verify that the final answer did not silently omit a
material premise.

**Exit gate:** the public demonstration and MCP workflow pass their compatibility,
security, build, rendered-interface, and continuity suites; representative VCS,
attachment, adversarial-claim, and multi-project repository workflows succeed;
the deployed capability list matches the documentation.

### Stage 2 — Explicit project memory

Maintain a versioned workspace of sources, revisions, entities, aliases,
authority decisions, claims, contradictions, proposals, reviews, and unresolved
questions. Every stored conclusion remains tied to provenance and approval.

**Exit gate:** a new session or agent can reconstruct the reviewed project state
without relying on an earlier conversation, and incremental updates cannot
silently rewrite old answers.

### Stage 3 — Trusted causal adapters

Let projects provide reviewed transition semantics. A game adapter may describe
event IDs, prerequisites, time, resources, actor knowledge, ordered writes,
repeat limits, downstream consumers, tests, UI, and asset requirements. A visual
narrative adapter may describe position, movement, force, injury, visibility,
setup, payoff, and asset approval state.

**Exit gate:** Continuity Lab can distinguish an outcome that is merely mentioned
or plausible from one that is executable through a complete trusted transition
slice, while abstaining when no such proof exists.

### Stage 4 — Reviewed creative proposals

Generate several novel, canon-compatible possibilities. Each proposal should
state its purpose, prerequisites, effects, implementation and asset work,
uncertainties, and review risk. Established conflicts are rejected; uncertainty
is not disguised as permission.

**Exit gate:** directors consistently receive a small set of materially different,
cited, feasible choices rather than one opaque generated answer.

### Stage 5 — Controlled implementation

After explicit approval, hand a bounded plan to coding or asset agents on a
reversible branch. Re-ingest the result, compare intention with implementation,
run the required validation, and require human promotion.

**Exit gate:** an approved feature can travel from proposal to verified branch
without giving an unreviewed model permission to change canon or the main branch.

### Stage 6 — Production-informed inspection economics

Use real attempt and failure history to decide which checks are mandatory,
which are redundant, and where deeper review prevents expensive reruns. Keep
the planner bounded and fail closed when calibration is missing or stale.

**Exit gate:** project-owned evidence shows that the routing policy reduces total
review and rework cost without materially increasing missed high-cost failures.

### Stage 7 — Team and enterprise operation

Add private-repository integrations, incremental sync, roles, source ownership,
approval policies, review queues, change history, notifications, audit exports,
and organization-specific adapters.

**Exit gate:** authority and project boundaries remain enforceable across teams,
models, agents, repositories, and long-running revisions.

## Active Stage 1 checkpoint

- The public Vibe Code Simulator worked example and five-tool read-only MCP are
  deployed.
- The public repository inspector is bounded and commit-pinned, and project
  scope must be selected before evidence from a multi-project repository is used.
- Exact-span material compilation, entity ambiguity, authority routing,
  coverage, conflict, and trusted-graph reachability checks are implemented.
- An additive sixth draft-validation tool and claim-closure receipt are
  implemented locally but are not yet deployed.
- The local application builds, all three rendered-interface tests pass, and
  all 363 continuity tests pass. Lint has zero errors and 11 pre-existing UI
  warnings.
- Live attachment, adversarial-claim, and multi-project repository workflows
  must be rechecked before Stage 1 is declared complete.

## Change protocol for future agents

Before extending Continuity Lab:

1. Read this document and the current capability boundary in
   `docs/ARCHITECTURE.md`.
2. State which active-stage exit criterion the proposed work advances.
3. Preserve existing public contracts unless a separately approved migration
   explicitly replaces them.
4. Add the smallest general mechanism that closes the observed failure; do not
   encode the benchmark answer or one project's names as universal logic.
5. Test at least one motivating case and one unrelated domain case.
6. Record regressions, limits, deployment status, and resume instructions in a
   durable checkpoint.
7. Do not advance the active stage merely because code was written. Advance it
   only when the stated exit gate has evidence.

## Deliberate non-claims

The current MVP is not an autonomous game builder, a perfect entity resolver, a
general natural-language theorem prover, an exhaustive repository reader, or a
replacement for a director. The staged path exists to approach useful autonomy
without pretending those unsolved boundaries have already disappeared.
