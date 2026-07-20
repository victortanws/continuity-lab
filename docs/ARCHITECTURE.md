# Continuity Lab architecture

Continuity Lab is an evidence-first consequence engine. It can answer questions about a story, game, codebase, policy record, or long-form text without treating a language model or a search index as the source of truth.

## The invariant

Original bytes are immutable evidence. Every answer is pinned to a project revision and cites source-owned locators. Search results, dependency slices, model output, and repair ideas are derived projections. The MVP never promotes a proposal to canon; a durable approval ledger is a later product boundary.

## Implementation status

The current candidate implements immutable uploads, commit-pinned GitHub
snapshots, revision-to-source-version membership, D1/R2 persistence,
snapshot-specific OpenAI retrieval, GPT-5.6 Sol exact-span claim/entity
compilation, five-lane query planning, authority/lifecycle routing,
role/authority/assertion-scope citation-use validation, atomic claim keys, scoped
contradiction and supersession handling, and saved analysis records. A
server-owned transition evaluator models facts, resources, permissions,
knowledge, time, branches, idempotency, and events. An adjacent-snapshot pass
can distinguish an explained change from a proposed bridge, a scoped causal
gap, or unknown coverage. Generated prose is sealed behind validated records.
A cost-sensitive inspection planner can choose bounded, correlation-aware
checks for lookup, standard, promotion, or high-rework work from approved risk
calibrations. One finite global subset search jointly enforces mandatory gates
and minimizes residual expected loss plus converted inspection effort, so
calibrated bundles and mandatory/optional trade-offs are considered together.
It uses canonical execution order and exact summation of already-rounded
IEEE-754 decision terms; compensated sums are retained only for numeric report
fields. This keeps hard gates and choices stable across input permutations and
mixed cost scales. It remains a static
additive model: false-positive costs, shared reruns, conditional outcomes, and
adaptive early stopping must be represented conservatively in calibration or
handled by a later planner.
The server must resolve its revisioned calibration registry and evaluation time;
the approval is bound to the exact canonical risk/check/joint/policy catalog.
Unknown, altered, or expired inputs fail closed and conservative uncertainty
factors raise incidence/lower detection bounds. Different channel labels never
prove independence; only an approved exact joint calibration can combine their
detection lower bounds. The pass is hard-capped at 14 checks,
16 risks, 192 direct detection edges, 64 joint calibrations, and bounded
identifier/label/numeric lengths plus a deterministic work-unit ceiling. It is
not yet wired into the browser production-audit flow.

It does **not** yet persist a corpus-wide entity or transition graph,
deterministically compile arbitrary code or images into transitions, expose
private workspaces through authenticated MCP, receive GitHub webhooks, or offer
a reviewed promotion UI. A stateless `/mcp` transport is implemented for the
immutable reviewed VCS sample only.
Transition evaluation is real only after a trusted compiler or curated adapter
has produced the graph. Screenshot/image understanding and OCR are not wired
into the MVP; text descriptions can be compiled upstream into cited snapshots.

The query entry point is progressive. A Tier-1 path is eligible only for a
server-routed focused identity question with no proposed change, target claim,
trusted reachability proof, or graph pass. It uses a compact prompt and response
schema, restores omitted invariant fields, and runs the ordinary validator.
It is an economy path, not a weaker trust path. Change, causality, conflict, and
reachability questions retain the full bounded route.

Routing depth is enforced on the server. Client-supplied claim-kind hints may
broaden a route but may not narrow the server's minimum evidence boundary. A
query has one bounded retrieval fan-out, no more than one compilation call, no
more than one reasoning call, and no more than one deterministic graph search;
provider calls carry deadlines and are not automatically retried inside the
query. A timeout or phase failure ends that run as a typed bounded failure. The
full audit receipt remains available to the application, while focused
questions present a direct answer first and reveal the larger trace only on
demand.

Coverage is also explicit. `closed` means affirmative claim-compatible typed
completeness boundaries with no known omissions; `partial` means useful evidence
with a known truncation, failure, exclusion, or deferred source; `open` means no
complete boundary was established. A universal negative inferred from
retrieval silence under partial or open coverage is insufficient evidence, not
a factual conflict, unless a cited positive counterexample independently
contradicts it.

Trusted project adapters may also supply server-owned dependency obligations.
Validation inserts obligations omitted by generated output, replaces conflicting
generated edges, and prevents `SUPPORTED` while a required obligation remains
open or blocked. Arbitrary uploads do not receive those obligations
automatically; without a trusted transition compiler or curated graph, general
reachability stays unknown.

## Capability boundary

| Surface | Current candidate | Not yet implemented |
|---|---|---|
| Upload | Paste text; up to 12 sequential uploads per browser selection; UTF-8 text/structured formats; operator-only PDF/Office preview | XLS/XLSX, standalone images, OCR-only/scanned documents, reliable arbitrary binary extraction |
| Entity work | Question-scoped exact-span candidates, separate same-name candidates, cited ambiguity | Durable corpus-wide Entity/Alias/SameAs graph and reviewed merge UI |
| Questions | Revision-pinned cited answers when OpenAI indexing is configured; explicit conflict/coverage; reviewed VCS demo without live retrieval | Offline arbitrary-workspace Q&A without a provider; exhaustive corpus understanding |
| Change ideas | Provisional assumptions, typed dependencies, risks, and validation; never automatic canon promotion | Reviewed approval/promotion workflow and automatic arbitrary-project simulation |
| Causality | Deterministic evaluator and server obligations for a curated or trusted compiled graph; generic adjacent-snapshot gap core | General automatic source-to-transition compilation |
| Visual production | Reusable audit core over already-extracted observations | Raw image understanding, OCR/region evidence adapter, and production-audit API/UI |
| Inspection economics | Exact bounded subset optimizer over residual loss plus effort; correlation-aware mandatory gates; server-registry calibration provenance and hard structural/cost/time ceilings | Calibrated project failure histories, browser controls, and automatic attempt-log feedback |
| GitHub | Bounded allowlisted commit-pinned snapshot synchronization | GitHub App installations, webhooks, incremental sync, or a live working-tree mount |
| MCP | Stateless read-only `/mcp` transport for three tools over the pinned VCS sample | Authenticated private-workspace transport, arbitrary project resources, and connector mutation tools |
| Hosting | Sites configuration exists in the repository | Repository state alone does not prove that this candidate is the currently deployed Site version |

## Three operations

### INGEST

1. Store the uploaded bytes, original filename, and checksum under an immutable source version.
2. Verify extension and file signature, apply decompression limits to Office
   archives, scan searchable text for obvious credentials, and record media
   type, bounded document type, authority, temporal scope, and parsing coverage.
3. Create a replaceable retrieval projection with server-authored path and line markers.
4. Classify source role and lifecycle from conservative path policy. Keep
   arbitrary repository intent and decisions at `reference` authority unless a
   matching policy approved outside the analyzed revision explicitly elevates
   them.
5. Quarantine instruction-like source text before compilation. Defer semantic
   extraction to the question scope and do not promise an exhaustive graph.

### ASK

1. Pin the project revision and requested story-time scope.
2. Resolve ambiguous entities without silently merging them.
3. Retrieve independent authority, declared-state, execution, verification, and
   change-history lanes as required, including supporting and opposing evidence.
4. Ask for a question-scoped entity and dependency slice with provenance.
5. Run deterministic authority, lifecycle, claim-use, time, coverage, schema,
   citation, polarity, and required-check validation.
6. Ask GPT-5.6 Sol for a strict structured synthesis.
7. If a server-owned transition graph covers the target, evaluate it
   deterministically; otherwise keep reachability unknown.
8. When a trusted reachability adapter supplied them, reconcile server-owned
   dependency obligations with the generated dependency slice.
9. Validate the result, replace generated prose with a server-composed summary
   of admitted records, save the analysis, and render truth and reachability
   separately.

### CHANGE

1. Keep the requested edit in a proposal namespace.
2. Retrieve evidence across assertions, events, rules, dependencies, tests, UI, writing, and art consumers.
3. Explain breakage and possible repairs with assumptions.
4. Keep the result provisional. Durable approval and revision mutation are future operations.

### AUDIT PRODUCTION

1. Pin the intended sequence, extracted artifact observations, attempts, gates,
   and approval records to one revision.
2. Compare intended outcomes with each observed state and require one legal
   transition path for the complete adjacent delta.
3. Surface premature reveals, unresolved or sequence-resolved ambiguities,
   rejected attempts, localized rerolls, and efficiency.
4. Keep “approved” and “promoted” separate and return only the next permissible
   action. This core is implemented; raw pixels/OCR and an API/UI adapter are not.

## Runtime boundaries

```text
Browser / future MCP client
           │
     thin API transport
           │
  provider-neutral continuity core
    ├─ authority + temporal policy
    ├─ exact-span claim + question-scoped identity compilation
    ├─ multi-lane evidence routing + coverage checks
    ├─ deterministic state-transition and causal-gap proof
    ├─ typed citation-use, semantic-check, and schema validation
    └─ proposal / approval separation
           │
    replaceable adapters
    ├─ D1: projects, sources, snapshots, bindings, analyses
    ├─ R2: immutable uploaded bytes
    └─ OpenAI: retrieval index + GPT-5.6 Sol reasoning
```

OpenAI file, vector-store, response, and conversation IDs live only in provider-binding records. They are never domain foreign keys or public citations. This lets the retrieval provider change without breaking a project, citation, or future MCP URI.

## Git repository delivery patterns

A Site deployment is built from a Git commit, but the deployed worker does not receive a live mount of GitHub or of a developer's local folder. Those are two different relationships with Git: Git can deliver the application, while repository evidence must be packaged or synchronized deliberately. In particular, a worker cannot open a path such as `/Users/...`, invoke a local Codex session, or discover later GitHub commits without an explicit runtime integration.

The presence of `.openai/hosting.json` or a local successful build does not show
that the working-tree candidate has been saved or deployed. Deployment status
must be checked separately against the hosting service and recorded with the
exact source commit/version.

Continuity Lab supports four patterns. They share the same provider-neutral project, source, revision, analysis, and citation records.

### 1. Build-time bundle

Select and fingerprint a bounded corpus during the application build, then ship that immutable snapshot with the Site. This is the lowest-latency demonstration path and is easy to reproduce because application code and evidence share a release commit. It needs no GitHub credential at runtime.

The tradeoff is staleness: new repository commits require a rebuild and redeploy. A build must never copy `.env` files, credentials, private keys, generated vendor trees, or an entire private repository into public client assets. This pattern is appropriate for a curated Build Week fixture, not ongoing repository collaboration.

### 2. Commit-pinned snapshot sync

An authorized user supplies a supported repository reference. The server resolves a branch or tag once to an immutable commit SHA, applies path and size policy, retrieves selected text blobs, records the manifest and hashes in D1, stores original bytes in R2, and optionally indexes stable fragments. Only after the snapshot is complete can it become the project's active revision. Questions read the active snapshot; they never fetch GitHub during the question request.

This is the recommended MVP and product default. It makes answers fast, replayable, and resilient to GitHub outages, and it cleanly supports uploads and non-GitHub texts through the same `SourceVersion` abstraction. A later sync creates another snapshot; it does not mutate the old one.

### 3. Webhook-driven incremental sync

A GitHub App or equivalent repository integration validates signed webhook deliveries and schedules a sync for the advertised commit. The synchronizer fetches changed paths, represents deletions explicitly, recomputes affected fragments and graph slices, and atomically promotes the new snapshot only after storage and validation succeed. Duplicate delivery IDs must be idempotent; force-pushes, renamed files, deleted branches, partial failures, and out-of-order deliveries require explicit handling.

This is the most efficient steady-state option for active teams because unchanged files retain their prior hashes and derived projections. It adds operational work: installation authorization, webhook signature verification, job durability, retry policy, rate-limit handling, and an audit trail. Webhooks signal that a commit exists; they do not replace commit-pinned retrieval.

### 4. Remote MCP or orchestration service

The Site remains the visual client and calls an authenticated HTTPS service that exposes the same continuity operations through MCP or a small API. That service may have a controlled checkout, richer parsers, repository credentials, or agent execution capabilities that are inappropriate for a Site worker. It returns cited evidence and structured results, not an unbounded terminal transcript.

This is the right boundary when a query must inspect a live working tree, execute project-specific tools, or coordinate coding agents. It has the highest latency and operational burden, so ordinary questions should still use a stored snapshot and escalate to live orchestration only when freshness or execution is material. The remote service must be explicitly allowlisted; Continuity Lab must not turn a submitted URL into an arbitrary server-side fetch.

The efficient end-to-end path is therefore:

```text
GitHub or uploaded files
  -> resolve immutable version
  -> select and fingerprint safe sources
  -> R2 originals + D1 snapshot manifest
  -> retrieval index + question-scoped derived dependency slice
  -> /api/continuity/query
  -> deterministic validation + GPT synthesis
  -> cited answer pinned to the snapshot
```

Repository routing files such as `AGENTS.md`, authority manifests, and source-priority tables can inform selection and precedence after they have been classified by the product. They are evidence/configuration, not executable instructions from an untrusted repository. Source text remains inside the untrusted evidence envelope used by the reasoner.

### Project-declared authority routing

The MVP recognizes an optional root `continuity.config.json` (or
`.continuity/config.json`) after the hard safety filter has selected files. Its
bounded `sourceRoutes` are treated as repository-declared hints: they may
preserve or lower the conservative path classification, but may not promote a
file to a stronger source role or authority and may not establish a typed
completeness boundary. A `closedWorld` Boolean is retained only as legacy
metadata and cannot close coverage.
This prevents an analyzed branch or pull request from minting its own truth
policy. Patterns may use `*` within one path segment and `**` across segments.
See `docs/continuity.config.example.json`.

A separately stored, project-approved policy may use the same schema to assign
stronger authority or declare a genuinely complete registry. That approval is
an out-of-band product action; the current repository-sync UI does not expose
it, so ordinary repository snapshots remain conservative.

In particular, intent and decision paths—including `README.md`, story bibles,
requirements, contracts, and ADR/decision records—default to `reference`
authority in an arbitrary repository. Path classification still helps retrieve
the right material, but retrieval role is not approval. Only a matching route
on the separate `project_approved` path can elevate it.

Direct uploads have a bounded document-type control because filenames such as
`pg1342.txt`, `book.pdf`, or `manuscript-123.txt` do not reliably describe the
contents. A user may identify an upload as **story/source text**, **reference
material**, or **draft/proposal**. The server—not the form—maps those choices to
fixed evidence profiles: narrative source text is active `intent` at
`reference` authority, reference material is active `reference`, and a draft is
`proposal` with a `proposed` lifecycle. The original filename, bytes, checksum,
and chosen profile are retained as provenance, and the same profile is attached
to the retrieval projection. Source contents cannot override it.

That selector is classification, not approval. Direct uploads are still
admitted only as `reference` or `proposal` authority; no choice can mint
`immutable`, `canon`, `production`, `implementation`, `test`, or `observation`
evidence, supersede another source implicitly, or set `closedWorld=true`. The
current UI has no reviewed promotion workflow and no control for
declaring an atomic registry complete. Consequently an ordinary uploaded or
repository workspace will abstain from `UNREACHABLE` rather than infer a
negative; the reviewed VCS sample is the only current surface with an approved,
claim-keyed, revision-membership-digested completeness fixture. That exact
target fixture can support the reviewed target result without pretending the
whole VCS answer or repository is closed.

The fixture's boundary is not trusted because it appears on an evidence chunk.
The runtime injects a separate `continuity.trusted-completeness-registry.v1`
grant that binds the exact boundary to the evidence ID, source and immutable
source version, claim key, polarity, and project revision. Arbitrary retrievers,
uploads, repositories, and vector attributes receive no such registry grant;
source-carried boundary lookalikes are ignored.

Reference-authority evidence is placed in a server-derived
`source_assertion` world owned by its immutable source-version ID. An exact
sentence such as “The storm causes the evacuation” may establish that the
pinned manuscript states that relationship; it does not establish the event as
approved canon or observed runtime truth. Such a supported answer carries
`truthStatus=source_assertion`, and citations/conclusions repeat the scope and
owner. Separate documents remain separate assertion worlds. Canon, retcon, and
production evidence use `project_truth`; draft evidence uses `proposal`.
Opposite same-frame statements from separate reference owners produce a
`source_disagreement` record while remaining separate assertions; they are not
collapsed into a project-truth contradiction. Explicit IDs in reference or
proposal uploads are likewise source-version scoped. Only approved
project-truth registry identity may be project-global. Same-name ambiguity may
be grounded within one manuscript when two distinct server-verified exact
spans each anchor a candidate; fabricated model IDs and duplicate spans do not
satisfy that gate.

Neither a repository hint nor an approved policy can expand the file allowlist,
reveal a filtered secret, increase resource limits, execute a command, or
trigger a network request. When
the file is absent or malformed, safe path defaults identify contracts,
decisions, archives, evaluation material, implementation, and tests conservatively;
unclassified prose remains reference evidence. Every packet fragment
repeats its file path, authority, closed-world flag, and exact line span so
retrieval does not flatten an archived proposal and active production code into
the same kind of truth.

## Repository ingestion security and resource limits

The repository boundary fails closed:

- Accept a structured provider/repository identifier or a canonical `https://github.com/{owner}/{repo}` URL. Reject userinfo, ports, query strings, fragments, encoded path tricks, non-GitHub hosts, lookalike subdomains, arbitrary API/raw URLs, and redirects to another host. This prevents the connector from becoming an SSRF primitive.
- Keep GitHub and OpenAI credentials in server-side runtime bindings. Never return them to the browser, write them to D1/R2, include them in provider metadata, or accept a long-lived token from ordinary query content.
- Resolve mutable refs to a full commit SHA before listing files. Persist that SHA on every snapshot and derive citations from internal source/version IDs plus content hashes. A query cannot silently advance from one branch head to another.
- Default-deny sensitive paths and file classes, including `.env*`, private keys, credential directories, Git metadata, package caches, dependencies, build output, binary media, and generated vendor trees. An authority manifest cannot override the secret boundary.
- Enforce independent limits on tree entries, selected files, per-file bytes, aggregate bytes, fetch duration, nesting, and decompression. Truncation or omission is recorded as partial coverage; it never supports a corpus-wide negative claim.
- Share one request-wide connector deadline/call budget across ref resolution, tree listing, parallel blob reads, and optional OpenAI indexing. Keep per-call timeouts, perform no automatic retry, and byte-bound GitHub JSON/error bodies before parsing.
- Fetch only blobs named by the commit tree and verify the received size/hash where the provider supplies them. Never execute repository code, install its dependencies, render active HTML, expand archives, follow symlinks, or honor source-contained network instructions during ingestion.
- Authorize project access before sync and preserve tenant/project isolation in storage and retrieval filters. Public repository readability does not imply permission to attach its contents to another user's private project.
- Build a candidate snapshot under a unique ID, then promote it atomically. On authentication failure, rate limiting, timeout, oversized input, malformed provider data, or partial persistence, keep the previous active snapshot and return a typed failure rather than a synthetic success.

Initial hosted limits are intentionally conservative and visible in the sync result: 2,000 tree entries examined, 60 selected files, 1 MiB per file, and 6 MiB total source bytes per snapshot. These are product guardrails, not claims about GitHub's maximums; larger repositories should use a future scoped selector, incremental sync, or the remote orchestrator.

This traversal still runs synchronously under a 120-second connector deadline;
it is not a durable or resumable background job. A timed-out candidate remains
failed and the prior active snapshot stays in place.

The Build Week surface exposes a curated read-only sample. Mutable projects are
namespaced by the authenticated ChatGPT user; a caller-chosen `projectId` is not
authorization. Paid queries, uploads, and syncs have actor and global usage
windows, source-count/byte quotas, same-origin checks, and pre-parse declared
body limits. A server GitHub credential is bound to an exact repository
allowlist; production should replace it with short-lived per-installation
GitHub App tokens. The public live-demo button is also frozen server-side to one
reviewed receipt and does not persist into the shared project. These controls
make the connector a bounded authenticated prototype, not yet a complete
multi-tenant service: deletion/retention workflows, organizational roles,
durable jobs, and calibrated token-based billing limits remain required.

## Record model

Currently persisted:

- Project with immutable revision-to-source-version membership
- Source and SourceVersion metadata with checksum
- RepositoryConnection, immutable RepositorySnapshot, and per-file manifest entries
- ProviderBinding for replaceable external identifiers
- AnalysisRun with the validated structured answer

Planned persisted graph schema:

- Project and immutable ProjectRevision
- Source and SourceVersion with checksum and stable fragments
- Assertion with polarity, authority, epistemic owner, world/timeline, and temporal validity
- Entity, Alias, SameAs, and NotSameAs
- Event, Rule, Goal, Artifact, and provenance-bearing DependencyEdge
- ChangeSet and AnalysisRun

The resolved “canon” is a versioned projection over source assertions. It is not a mutable paragraph generated by the model.

## Progressive graph materialization

Long prose such as a Gutenberg text can be labeled as narrative source text and
indexed without claiming that every entity or causal dependency was understood
at upload time. Today a question retrieves an evidence neighborhood, resolves
question-scoped entities, and returns a validated dependency slice with source
locators. Corpus-wide entity resolution, persisted graph slices, background
densification, and explicit entity-pass states are later phases.

## Model and deterministic responsibilities

GPT-5.6 Sol proposes exact-span claims, entity candidates, dependency
descriptions, and provisional repairs. Deterministic code owns hashes, revision
membership, project isolation, routing, role × authority × lifecycle ×
assertion-scope permissions, assertion owners, exact locators, evidence budgets,
ordered frame copying,
conservative negation/modality checks, closed-world boundaries, transition
search, resource conservation, idempotency, required checks, schema validation,
and displayed answer sealing. The deterministic language gate prevents common
polarity reversal; it is not a complete natural-language theorem prover.
Arbitrary source-to-transition compilation and durable approved identity links
remain future work. Retrieval score is relevance, never truth confidence.

Conversation state can improve latency, but prior assistant prose is never evidence. Every answer remains replayable from its revision, question, prompt version, and evidence references. Follow-ups should carry explicit entity or analysis references.

## Future MCP surface

The MCP server is a thin transport over the same core. Compatibility tools
`search` and `fetch` provide URL-backed discovery and exact-source retrieval;
domain tools are `continuity_answer_question`, `continuity_trace_dependencies`,
and `continuity_analyze_change`. Stable resources use
`continuity://projects/{project}/...` URIs. GitHub synchronization, source
mutation, and canon approval are separate authenticated and consented tools.

The reviewed-sample transport implements initialization, tool discovery, and
three read-only calls at `/mcp`. It is pinned to `vcs-demo-r1`, invokes only the
deterministic demonstration engine, and refuses arbitrary projects or revisions;
it does not fetch GitHub, invoke a paid provider, or write project state. A
production private-workspace integration still needs connector authentication
and authorization, stable resource handlers, consented mutation tools, quotas,
and deployment monitoring.

## External-validity gate

The benchmark must run the same tasks against Vibe Coder Simulator, Slap the Heavens, and an unrelated long-form text. It measures citation precision and completeness, ambiguity and contradiction recall, identity resolution, reachability accuracy conditional on coverage, canon/proposal leakage, cross-project isolation, snapshot reproducibility, and correct abstention. The comparison baseline is a naive single prompt with the same files.

Security or truth-separation failures are release blockers: cross-project leakage, following instructions inside sources, fabricated citations, promoting proposals to canon, confident answers where the right status is ambiguous/conflicted/unknown, or declaring reachability through nonexistent actions.
