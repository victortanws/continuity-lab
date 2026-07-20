# Authority Router v2.3

**Status:** retained as the v2.3 evaluation record. The current candidate adds
authority-intersection, exact-span compilation, immutable revision membership,
and server-owned transition proof. See `AUTHORITY-ROUTER-V3.md`.

The router answers a narrower question than “which file wins?” Authority is
claim-specific and use-specific. A contract may govern intended behavior, code may establish
what currently executes, a test may establish what is asserted to pass, an
observation may establish what happened, and an archive may establish only
historical intent. When those disagree, the answer preserves both views.

Each citation declares both a claim kind and a use: establish, corroborate,
challenge, contextualize, or propose. The server validates that combination
against source role, authority, and lifecycle. For example, configuration can establish
a configured value but cannot establish that the value executes; a proposal can
propose a repair but cannot establish current truth; a historical source can
establish history but only contextualize current state.

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
`evaluate_change`. Before ranking, the router issues bounded searches across up
to five independent retrieval lanes: authority, declared state, execution,
verification, and change history. It then preserves required source roles and
opposing claims in the final evidence packet and reports missing lanes. This
prevents a single high-scoring semantic search from crowding out a less similar
but causally necessary implementation, test, or observation. Relevance chooses
candidates within a lane; it is never truth confidence.

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
   unknown. Absence from a partial log is an open dependency, not evidence that
   the event did not occur. Never fill a checklist with invented detail.

The structured answer contains exactly one finding for every routed check. A
finding is `supported`, `conflicted`, `unknown`, or `not_applicable`; supported
and conflicted findings must cite evidence already admitted under the typed
citation rules. Missing findings are inserted as unknowns, and confidence is
capped rather than allowing an omitted check to disappear from the answer.

## Deterministic guarantees

The current v2.3 implementation deterministically:

- removes cross-project and duplicate evidence;
- applies temporal bounds;
- prevents lower-authority or broad source-level supersession from erasing
  protected evidence;
- excludes evaluation material;
- retrieves independent authority, state, execution, verification, and history
  lanes, then balances selected evidence across required roles;
- retains opposing polarities for the same claim;
- keeps normative, configured, implemented, tested, observed, world, temporal,
  and epistemic scopes separate when detecting contradictions;
- validates evidence IDs, source IDs, server-owned locators, claim kinds, and
  permitted citation uses;
- exposes active equal-authority contradictions;
- rejects proof by retrieval silence;
- permits `UNREACHABLE` only with trusted complete scope, selected closed-world
  evidence carrying the exact requested target claim key, and a concrete
  blocker;
- validates dependency and conflict evidence references;
- requires every non-proposal dependency edge to name the same atomic claim key
  and claim kind as its relation-compatible evidence, so an intended dependency
  cannot masquerade as an implemented or observed one;
- converts an asserted missing dependency in an open corpus to `open`, and
  removes dependencies or conflicts that have no admitted evidence;
- permits supersession only from an active approved source into a compatible
  claim/world/owner scope;
- treats repository-declared authority routes as untrusted hints unless the
  policy is approved out of band, so a branch cannot self-declare immutable or
  closed-world truth;
- inserts every missing routed semantic check as an explicit unknown and caps
  unjustified high confidence;
- keeps every repair provisional until separately approved.

The language model synthesizes ambiguity, explanation, and repair options. It
does not own revision identity, policy approval, citation existence, source
membership, or negative-coverage proof.

## Honest boundary

V2.3 did not compile an exhaustive repository-wide fact graph or prove
arbitrary natural-language entailment. The current candidate adds durable
revision membership, a conservative polarity gate, and deterministic
reachability for explicitly compiled transition graphs. Arbitrary
source-to-transition compilation and durable corpus-wide entity resolution
remain outside the current MVP.

These limitations are surfaced rather than replaced by model confidence.
