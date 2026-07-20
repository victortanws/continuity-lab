# Authority Router v2.0 → v3.3 evaluation postmortem

**Status:** neither v3.1 nor v3.2 passed its preregistered external-superiority
gate. The v3.2 fresh reserve scored baseline 266.5/400 and router
222.277778/400. A structurally new four-domain v3.3 reserve was authored and
hash-frozen before the v3.3 procedure was installed; it has not yet been
consumed. No improvement claim is valid until that reserve and the saturated
VCS regression both pass their stated gates.

## Executive conclusion

The work has improved the architecture more clearly than it has improved model
answer scores. The strongest new evidence is deliberately adverse: v3.1 did
not beat the baseline on the preregistered external reserve.

- The original v2.0 comparison found no paired lift: both router and control
  arms scored 90/100 on a two-domain battery, and both made the same
  partial-log error.
- The frozen VCS v3 response scored 99/100 from each of two graders. That shows
  strong in-domain usefulness, but the earlier v2 response scored 100/100 and
  the task was already saturated.
- The frozen three-domain non-story scorer returned 70/300 for v3 and 36/300
  for baseline. That official difference is dominated by an output schema the
  answer-time agents were not permitted to inspect.
- A disclosed post-unseal format-only sensitivity analysis scored v3 at
  287.25/300 and baseline at 277.25/300. Both arms got all 18 closure classes
  and dependency inventories right; v3 corrected one of the baseline's two
  outcome errors. This diagnostic cannot replace the frozen score.
- The v3 responses were 28.9% longer by word count and 32.0% larger by bytes.
  Provider usage and clean timing were not captured. The holdout therefore
  provides no evidence for lower cost, faster answers, or better response
  economy.
- The fresh four-domain v3.1 reserve used an exact visible schema and passed
  both schema and source-instruction gates. Baseline scored 359.67/400; router
  scored 344.67/400. Router gained slightly on rollout and visual-sequence
  cases but lost materially on laboratory identity and closure calibration.

The justified product claim is narrower: the generic distinctions transfer to
unfamiliar repositories, and the candidate implements them as bounded
server-owned controls. Comparative advantage remains unproven.

## What v3.2 revealed

The exact VCS regression remained strong but fell below the prior v3 result.
Two graders scored the same response 96/100 and 92/100. Both found the central
identity, reachability, causality, content, art, and implementation analysis
strong. One deducted three points because the answer failed to preserve the
explicit medical limitation that ClearRead is temporary assistance rather than
a cure. The second also deducted four points for unsupported operational claims
about Git state, a file absence, and a named decision authority. This was not
mere grader noise: it exposed a real response-compilation fault. Required
limiting conditions could disappear, while peripheral assertions escaped the
citation boundary.

The new four-domain reserve then scored baseline 266.5/400 versus router
222.277778/400, a router delta of -44.222222. The router improved proposition
status calibration but lost more on coverage closure, exact dependency IDs,
and response economy:

1. It treated packet-relative controlling records as unable to close their own
   declared packet boundary unless a separate global authority grant existed.
   That confused “what this complete packet establishes” with “what is true in
   the outside world.”
2. It returned explanatory dependency prose instead of the server-owned IDs
   required by the visible contract.
3. Whole-chunk prompt-injection quarantine discarded nearby useful evidence
   even where a smaller offending span could have been isolated safely.
4. It sometimes produced invalid line locators and volunteered unsupported
   operational details.
5. It spent roughly twice the input tokens and materially more wall time than
   the baseline, including on direct lookups that did not need a global audit.

The v3.3 response is therefore architectural rather than benchmark-specific:

- name the truth target (`packet_assertion`, `project_truth`, or
  `observed_world`) before deciding authority;
- keep proposition status, source authority, and evidence coverage as separate
  axes;
- compile caller-visible answer obligations before drafting, then lint every
  visible factual clause after drafting;
- preserve server-owned dependency IDs and accept only typed reachability
  certificates;
- quarantine the smallest safely isolated instruction span;
- use a shallow lookup route by default and invoke bounded graph work only for
  causal, contradiction, impact, and change questions; and
- validate exact source locators on the server.

These changes are intentionally framed in terms of packets, claims, evidence,
and transitions. They contain no VCS, manhua, or reserve-answer nouns. The new
reserve covers archival rights, aviation release, construction occupancy, and
satellite commands so that the next score cannot be selected on the projects
that motivated the fixes.

## What each experiment actually tested

| Experiment | What ran | Result | Interpretation |
|---|---|---:|---|
| VCS v2 regression | repository-guided prose answer | 100/100 from two graders | saturated in-domain reference point |
| VCS v3 regression | frozen v3 procedure over VCS repository | 99/100 from two graders | strong answer; one irrelevant weakly cited checkout observation |
| v2 external pair | procedure versus strong authority-aware control | 90/100 versus 90/100 | no measured lift; shared open-world error |
| v3 external frozen scorer | six immutable responses, three non-story domains | 70/300 versus 36/300 | official but dominated by unavailable field names |
| v3 format-only sensitivity | declared aliases applied after unsealing | 287.25/300 versus 277.25/300 | diagnostic: one substantive outcome correction |
| v3.1 implementation suite | actual deterministic routing/validation code | passing | validates invariants, not model-quality lift |
| v3.1 fresh reserve | four unrelated domains, three depths, eight paired strict responses | 344.67 router versus 359.67 baseline | failed superiority gate; v3.2 required |
| VCS v3.2 regression | exact frozen VCS question, one response, two graders | 96/100 and 92/100 | strong but below v3; limiting-condition omission and unsupported peripheral claims |
| v3.2 fresh reserve | four unrelated domains, three depths, eight paired strict responses | 222.28 router versus 266.50 baseline | failed superiority; authority/closure conflation and response cost dominated status gains |
| v3.3 fresh reserve | four new unrelated domains, frozen before procedure installation | pending | only valid external selection gate for v3.3 |

The repository-agent A/B runs tested whether a procedure changed model
behavior. They did not execute the deployed API, D1/R2 persistence, OpenAI
retriever, evidence compiler, or browser projection. Conversely, passing unit
and integration tests proves implementation behavior but does not prove that
the treatment improves answers on a population of future projects. These two
evidence classes must remain separate.

## The recurring substantive error

The most important reasoning failure was treating silence in a partial source
as proof of absence:

```text
no completion appears in the retrieved/available subset
→ completion did not occur
→ the requested state is false or contradictory
```

The valid inference is:

```text
the last established state is incomplete
→ completion remains an open dependency
→ the answer is unknown unless a closed registry or positive counterexample
  establishes more
```

The error reappeared once in the v3 external cases for a partial survey. It is
therefore addressed at three general boundaries in v3.1:

1. every route carries `closed`, `partial`, or `open` coverage;
2. universal-negative language inferred from retrieval silence under
   non-closed coverage is reclassified as insufficient evidence rather than
   conflict; and
3. an open or blocked required server-owned dependency prevents `SUPPORTED`.

These checks apply to logs, surveys, attendance pages, manuscript ranges, image
sequences, software deployments, custody records, and story events. They do not
contain VCS- or Slap-specific nouns.

## Benchmark defects and confounds

1. The early “ordinary” controls were already authority-aware, so they were not
   naive ChatGPT baselines.
2. The external v3 prompts required an “external response schema” without
   exposing it; the runbook simultaneously prohibited reading the control
   directory that contained the schema.
3. The frozen scorer depended on exact names such as `outcome`, while every arm
   independently used `classification`. It also expected specific array and
   Boolean shapes that were not validated by its nominal format gate.
4. The three external domains contained six cloned reasoning patterns. The
   effective independent sample is closer to three domain clusters than 18
   projects.
5. There was one response per arm/domain, one v3 infrastructure retry, and no
   provider-token or latency receipt.
6. The VCS task was developed alongside the architecture and already near the
   rubric ceiling. It is a regression test, not an external-validity test.
7. The v3 procedure encouraged visibly complete audit responses even for
   direct questions. The longer outputs and VCS deduction exposed an economy
   failure that aggregate correctness alone would hide.

The official frozen files and score must not be rewritten. The sensitivity
analysis is labeled diagnostic because its aliases were declared only after
the raw responses were visible.

## What the fresh v3.1 reserve disproved

The v3.1 reserve was consumed only after all eight strict responses were
hash-locked. Its paired result was baseline 359.666667/400 versus router
344.666667/400. By domain, router-minus-baseline was +0.83 for distributed
rollout, -15.00 for laboratory provenance, -2.50 for the public commitment
ledger, and +1.67 for the visual sequence. The largest loss was at scoped
resolution depth.

The failure was principally calibration:

1. two plausible referents were labeled as contradictory facts instead of
   remaining ambiguous or insufficiently resolved;
2. one complete edge registry was allowed to close an answer whose upstream
   material provenance was still outside that registry;
3. both arms often gave a substantively correct “no” while using `SUPPORTED`
   for a proposition incompatible with established present state; and
4. both arms used `PARTIAL` where the decisive visual bridge lacked any
   trustworthy outer completeness boundary and therefore remained `OPEN`.

The answer-level rule for v3.2 is consequently stricter: closure is the
intersection of every material dependency boundary, not the maximum closure
of one source. Multiple identity candidates are ambiguity, not contradiction.
`PARTIAL` is reserved for a bounded authoritative omission; a material unknown
without such a boundary is `OPEN`.

This reserve is now a regression set, not a v3.2 selection set. A structurally
new sealed holdout is required for external validation.

## What v3.1 changes

v3.1 converts the postmortem into project-neutral invariants:

| Finding | v3.1 invariant |
|---|---|
| Simple queries paid for a full audit | Server selects a focused, broad, dependency, or change route; focused UI reveals the larger trace only on request |
| A client could suggest a shallow claim set | Client hints may broaden but cannot reduce the server's minimum route |
| Work could continue until confidence felt adequate | Fixed retrieval/evidence/model/graph budgets, one compiler pass, one reasoner pass, deadlines, and no automatic provider retry |
| Cheap checks and expensive reruns used one threshold | Approved risk/cost calibration, mandatory release gates, overlap-aware marginal avoided-loss selection, and hard inspection ceilings |
| Coverage was an imprecise Boolean | Explicit closed/partial/open closure with failures, exclusions, deferrals, and truncation recorded |
| Partial silence became a global negative | Universal negative inferred from missing hits under non-closed coverage is insufficient evidence unless exact closed-world evidence establishes it |
| Model output could omit a prerequisite | Trusted server-owned dependency obligations are inserted/replaced; required open or blocked obligations prevent support |
| Repository story bibles could self-promote by path | Arbitrary intent and decision files default to reference authority; only out-of-band project-approved policy can elevate |
| Prompt injection was recognized narrowly | Evaluator/model-directed authority bypass, citation suppression, convenient identity selection, tools, and secrets are quarantined; ordinary story dialogue is not flagged solely for in-world imperatives |
| Generated explanation could outlive rejected support | User-visible live prose is sealed from validated server records |
| Adjacency was used as causation | A whole observed delta requires one compatible transition path; otherwise the bridge is proposed or unknown |

The full internal receipt remains available for audit, but response completeness
no longer means displaying every internal detail. Operational trivia appears
only when it changes the verdict or coverage.

## Current implementation truth

The current candidate implements:

- immutable supported uploads and paste, with conservative document-type
  profiles;
- bounded commit-pinned GitHub snapshot ingestion;
- question-scoped exact-span claim/entity candidates and cited questions when
  OpenAI retrieval is configured;
- stateless MCP text-packet verification and bounded anonymous public-GitHub
  excerpts without a server-side OpenAI call;
- multi-lane authority/lifecycle/claim-use routing;
- explicit coverage closure, contradiction handling, universal-negative repair,
  and server-owned dependency obligations;
- a bounded in-memory question graph over verified atomic records, with shallow
  lookup bypass and explicit traversal/corpus coverage receipts;
- deterministic transition/reachability and production-audit cores when a
  trusted or curated graph/observation set is supplied; and
- canon-safe proposals that remain provisional.

It does not yet implement raw image/OCR ingestion, XLS/XLSX, a durable
corpus-wide entity graph, general automatic source-to-transition compilation, a
production-audit API/UI route, authenticated private MCP transport, reviewed
canon promotion, GitHub webhooks/incremental sync, or evidence that this local
candidate is the currently deployed Site version. General uploaded workspaces
must return unknown for reachability when no trusted graph has been compiled.

## What is justified now

- Strong VCS face validity and substantively strong answers in three non-story
  domains.
- Correct transfer of closure and dependency distinctions in the disclosed
  format-only analysis.
- A real implementation of bounded routing and validation rather than only a
  prompt document.
- A demonstrated need for server-enforced structured output, explicit coverage,
  and response-economy measurement.

It is not justified to claim a 34-point reasoning lift, a 94% improvement,
statistical superiority, population-wide external validity, lower development
cost, lower provider cost, faster answers, complete manuscript understanding,
or general autonomous causality.

## Next validation gate

The v3.3 reserve was authored and cryptographically frozen before the v3.3
implementation was inspected against its hidden prompts or gold. It uses
archival rights, aviation release, construction occupancy, and satellite
command records rather than another story-shaped selection set. The prior v3.2
reserve is now regression evidence only, and the exact VCS question is a
saturated regression rather than a selection target.

After the candidate, procedure, and deterministic tests are frozen, run each
v3.3 arm once with the same evidence, model, sampling policy, visible schema,
word/citation ceilings, and no retry. Preserve raw responses, per-dimension
grader rationales, receipts, and failure artifacts. v3.3 passes only if it
improves the paired external score without losing VCS correctness, schema
conformance, source-instruction resistance, or response economy. Until those
results exist, this document makes no superiority claim.
