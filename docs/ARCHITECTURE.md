# Continuity Lab architecture

Continuity Lab is an evidence-first consequence engine. It can answer questions about a story, game, codebase, policy record, or long-form text without treating a language model or a search index as the source of truth.

## The invariant

Original bytes are immutable evidence. Every answer is pinned to a project revision and cites source-owned locators. Search results, dependency slices, model output, and repair ideas are derived projections. The MVP never promotes a proposal to canon; a durable approval ledger is a later product boundary.

## Implementation status

The current MVP implements immutable uploads, commit-pinned GitHub snapshots, D1/R2 persistence, snapshot-specific OpenAI retrieval, GPT-5.6 Sol structured synthesis, authority/lifecycle routing, exact citation validation, negative-coverage safeguards, and saved analysis records. It returns question-scoped entities, dependencies, conflicts, blockers, and repair proposals.

It does **not** yet persist a repository-wide causal graph, deterministically compile arbitrary code into transitions, run counterfactual graph diffs, expose an MCP transport, receive GitHub webhooks, or query historical revisions by caller-selected ID. Those are designed extension points, not Build Week claims.

## Three operations

### INGEST

1. Store the uploaded bytes under an immutable source version and checksum.
2. Record media type, authority, temporal scope, rights metadata, and parsing coverage.
3. Create a replaceable retrieval projection with server-authored path and line markers.
4. Classify source role, lifecycle, and authority from bounded project configuration and conservative path policy.
5. Defer semantic extraction to the question scope. Do not promise an exhaustive causal graph.

### ASK

1. Pin the project revision and requested story-time scope.
2. Resolve ambiguous entities without silently merging them.
3. Retrieve both supporting and opposing evidence.
4. Ask for a question-scoped entity and dependency slice with provenance.
5. Run deterministic authority, time, coverage, schema, and citation checks.
6. Ask GPT-5.6 Sol for a strict structured synthesis.
7. Validate the result, save the analysis, and render truth and reachability separately.

### CHANGE

1. Keep the requested edit in a proposal namespace.
2. Retrieve evidence across assertions, events, rules, dependencies, tests, UI, writing, and art consumers.
3. Explain breakage and possible repairs with assumptions.
4. Keep the result provisional. Durable approval and revision mutation are future operations.

## Runtime boundaries

```text
Browser / future MCP client
           │
     thin API transport
           │
  provider-neutral continuity core
    ├─ authority + temporal policy
    ├─ question-scoped identity resolution
    ├─ evidence routing + coverage checks
    ├─ citation and schema validation
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
bounded `sourceRoutes` can classify a path as `immutable`, `canon`, `retcon`,
`production`, `proposal`, or `reference`, and can mark a deliberately complete
registry as `closedWorld`. Patterns may use `*` within one path segment and
`**` across segments. See `docs/continuity.config.example.json`.

The configuration cannot expand the file allowlist, reveal a filtered secret,
increase resource limits, execute a command, or trigger a network request. When
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
- Fetch only blobs named by the commit tree and verify the received size/hash where the provider supplies them. Never execute repository code, install its dependencies, render active HTML, expand archives, follow symlinks, or honor source-contained network instructions during ingestion.
- Authorize project access before sync and preserve tenant/project isolation in storage and retrieval filters. Public repository readability does not imply permission to attach its contents to another user's private project.
- Build a candidate snapshot under a unique ID, then promote it atomically. On authentication failure, rate limiting, timeout, oversized input, malformed provider data, or partial persistence, keep the previous active snapshot and return a typed failure rather than a synthetic success.

Initial hosted limits are intentionally conservative and visible in the sync result: 2,000 tree entries examined, 60 selected files, 1 MiB per file, and 6 MiB total source bytes per snapshot. These are product guardrails, not claims about GitHub's maximums; larger repositories should use a future scoped selector, incremental sync, or the remote orchestrator.

The anonymous Build Week surface may expose a curated, read-only demonstration project. Connecting or querying user-supplied repositories is a separate trust boundary: before enabling it broadly, API routes must bind each project to an authenticated ChatGPT user or organization, enforce ownership on every sync/source/query operation, and add request and storage quotas. A caller-chosen `projectId` is not authorization. Until those controls are active, repository sync is a bounded prototype capability, not a multi-tenant production claim.

## Record model

Currently persisted:

- Project with an active revision identifier
- Source and SourceVersion metadata with checksum
- RepositoryConnection, immutable RepositorySnapshot, and per-file manifest entries
- ProviderBinding for replaceable external identifiers
- AnalysisRun with the validated structured answer

Planned graph schema:

- Project and immutable ProjectRevision
- Source and SourceVersion with checksum and stable fragments
- Assertion with polarity, authority, epistemic owner, world/timeline, and temporal validity
- Entity, Alias, SameAs, and NotSameAs
- Event, Rule, Goal, Artifact, and provenance-bearing DependencyEdge
- ChangeSet and AnalysisRun

The resolved “canon” is a versioned projection over source assertions. It is not a mutable paragraph generated by the model.

## Progressive graph materialization

Long prose such as a Gutenberg text can be indexed without claiming that every causal dependency was understood at upload time. Today a question retrieves an evidence neighborhood and returns a validated, question-scoped dependency slice. Persisted graph slices, background densification, and explicit entity-pass states are later phases.

## Model and deterministic responsibilities

GPT-5.6 Sol handles ambiguous extraction, dependency synthesis, hypothesis generation, repair proposals, and clear explanations. Deterministic code currently owns hashes, revision pins, project isolation, source-role routing, exact locator reconstruction, evidence budgets, negative-coverage rules, schema validation, and citation existence. Deterministic graph traversal, counterfactual diffs, and approved identity links require the planned compiled graph. Retrieval score is relevance, never truth confidence.

Conversation state can improve latency, but prior assistant prose is never evidence. Every answer remains replayable from its revision, question, prompt version, and evidence references. Follow-ups should carry explicit entity or analysis references.

## Future MCP surface

The MCP server is a thin transport over the same core. Compatibility tools
`search` and `fetch` provide URL-backed discovery and exact-source retrieval;
domain tools are `continuity_answer_question`, `continuity_trace_dependencies`,
and `continuity_analyze_change`. Stable resources use
`continuity://projects/{project}/...` URIs. GitHub synchronization, source
mutation, and canon approval are separate authenticated and consented tools.

## External-validity gate

The benchmark must run the same tasks against Vibe Coder Simulator, Slap the Heavens, and an unrelated long-form text. It measures citation precision and completeness, ambiguity and contradiction recall, identity resolution, reachability accuracy conditional on coverage, canon/proposal leakage, cross-project isolation, snapshot reproducibility, and correct abstention. The comparison baseline is a naive single prompt with the same files.

Security or truth-separation failures are release blockers: cross-project leakage, following instructions inside sources, fabricated citations, promoting proposals to canon, confident answers where the right status is ambiguous/conflicted/unknown, or declaring reachability through nonexistent actions.
