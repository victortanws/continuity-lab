# Authority Router v2

**Status:** implemented routing and validation contract; exhaustive claim and
transition compilation remains future work.

The router answers a narrower question than “which file wins?” Authority is
claim-specific. A contract may govern intended behavior, code may establish
what currently executes, a test may establish what is asserted to pass, an
observation may establish what happened, and an archive may establish only
historical intent. When those disagree, the answer preserves both views.

## Trusted policy boundary

Original source bytes remain untrusted evidence. A project-approved policy
classifies fragments by:

- role: intent, decision, configuration, implementation, test, observation,
  proposal, archive, asset, reference, or evaluation;
- lifecycle: active, proposed, superseded, historical, or unknown;
- claim kind: identity, normative, configured, implemented, tested, observed,
  causal, or historical;
- authority, temporal scope, provenance, and any exact supersession target.

Repository configuration may suggest classifications after path safety has
already run. It cannot expose filtered files, weaken secret policy, execute
source code, or turn evaluation answers into domain truth. Evaluation and
answer-key material is excluded from question-time evidence.

## Query plan

Every query is routed as `answer_question`, `trace_dependencies`, or
`evaluate_change`. The router retrieves separately from every available role
needed by the operation, keeps supporting and opposing claims together, and
reports missing lanes. Relevance chooses candidates within a lane; it is never
truth confidence.

Before synthesis, the analyst performs semantic closure over the material
parts of the question:

1. Resolve stable identities, aliases, scopes, and explicit non-identity.
2. Separate active, proposed, superseded, and historical evidence.
3. State independently what is intended or allowed, configured, implemented,
   tested, observed, and still unknown.
4. Retrieve definitions, exclusions, limiting conditions, and downstream
   consumers for every asserted state, event, quantity, and outcome.
5. For a change, trace prerequisites → actor knowledge and authorization →
   event or transaction → ordered state and resource mutations → persistent
   effects → downstream consumers and verification.
6. Distinguish eligibility from authorization, a configured number from a
   reachable state, an aid from its hoped-for outcome, and a transition from
   successful completion.
7. Reconcile gross inputs, consumption or debits, settlement timing, ownership,
   and net state whenever a resource changes.
8. Check retry behavior, once-only identity, content and asset compatibility,
   affected stakeholders, and the tests needed to preserve the decision.
9. Mark an irrelevant dimension as not applicable; mark a missing fact as
   unknown. Never fill a checklist with invented detail.

## Deterministic guarantees

The current v2 implementation deterministically:

- removes cross-project and duplicate evidence;
- applies temporal bounds;
- prevents lower-authority or broad source-level supersession from erasing
  protected evidence;
- excludes evaluation material;
- balances selected evidence across available roles;
- retains opposing polarities for the same claim;
- validates evidence IDs, source IDs, and server-owned locators;
- exposes active equal-authority contradictions;
- rejects proof by retrieval silence;
- permits `UNREACHABLE` only with trusted complete scope, selected closed-world
  evidence, and a concrete blocker;
- validates dependency and conflict evidence references;
- keeps every repair provisional until separately approved.

The language model synthesizes ambiguity, explanation, and repair options. It
does not own revision identity, policy approval, citation existence, source
membership, or negative-coverage proof.

## Honest boundary

V2 does not yet compile an exhaustive repository-wide fact graph. It does not
prove that every material natural-language conclusion is entailed by its cited
span, and uploaded-source revision membership still needs a durable
`ProjectRevision` membership table. Reachability over arbitrary repositories
remains unknown unless validated transitions and claim-specific closed-world
coverage exist.

These limitations are surfaced rather than replaced by model confidence.
