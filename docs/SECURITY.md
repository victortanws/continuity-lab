# Security boundary

Continuity Lab treats manuscripts, repositories, extracted claims, model output,
and proposed transitions as untrusted. The current controls were reviewed
against the public `victortanws/vibe-security-skill` guidance and then adapted
to this evidence-routing product rather than copied as application canon.

## Implemented

- OpenAI and GitHub credentials are server-only.
- Hosted mutable projects are namespaced only after an exact HTTPS origin is
  approved in `CONTINUITY_TRUSTED_INGRESS_ORIGINS` and that ingress strips
  caller-supplied identity headers before injecting a verified user. A header
  alone is never identity; absent, wildcard, malformed, HTTP, and path-bearing
  configurations fail closed. The sample is shared and read-only.
- The paid sample route requires that trusted identity boundary and accepts one
  exact server-frozen question/scope. It uses only the frozen demo retriever and
  one reasoning call; client conversation, claim hints, repository context, and
  vector-store context cannot enter the route. Shared-sample analyses are not
  persisted.
- D1 fixed-window counters enforce actor-global and service-global request and
  byte caps for ordinary live reasoning, source upload, and repository
  synchronization. Changing a project label does not reset an actor's
  allowance. Projects also have source-count and byte caps. The separate paid
  sample reserves an actor/project daily slot and a project-global daily slot
  through atomic conditional D1 upserts before OpenAI is called. Its defaults
  are five calls per actor and twenty-five calls for the sample project per UTC
  window, with bounded server-side `REVIEWED_LIVE_ACTOR_DAILY_LIMIT` and
  `REVIEWED_LIVE_PROJECT_DAILY_LIMIT` overrides. Earlier narrow reservations are
  conservatively not refunded after a later denial or provider failure, so
  races can consume capacity but never oversubscribe it. A two-request
  per-isolate concurrency ceiling and 60-second deadline remain as additional
  load bounds.
- JSON/multipart type, declared body size, actual streamed body size,
  same-origin, and `Sec-Fetch-Site` checks run before semantic processing;
  production mutations require identity before body parsing.
- Upload metadata is single-valued, control-free, UTF-8 byte-bounded, and
  validated before storage/provider work. Its encoded bytes count toward byte
  quotas. Free-text temporal labels are rejected unless the upload adapter can
  emit an explicit axis and numeric order.
- GitHub destinations are canonicalized to `api.github.com`; redirects,
  userinfo, ports, path tricks, symlinks, submodules, vendors, binaries, and
  sensitive paths are rejected. Commits and blobs are hash/size pinned.
- Each upload or repository-sync request owns one shared outbound connector
  deadline and call counter. Upload indexing permits at most three calls in 55
  seconds; repository sync permits the selected-file ceiling plus five calls
  in 120 seconds. Parallel blob calls reserve budget synchronously, retain
  their 12-second per-call timeout, and are never retried. GitHub commit, tree,
  blob-envelope, and error bodies are streamed through independent byte caps
  before JSON parsing; oversize and budget exhaustion are typed failures.
- OpenAI source and repository indexing responses are streamed through an
  independent 256 KiB byte ceiling before JSON parsing; indexing error bodies
  receive a smaller ceiling.
- A configured GitHub credential has an exact repository allowlist. A
  production multi-user deployment should use short-lived per-installation
  GitHub App tokens.
- High-confidence credentials in selected repository text and direct text
  uploads are excluded before R2 storage or OpenAI indexing.
- Office uploads receive signature, archive-entry, traversal, encryption,
  compression-method, expanded-size, and compression-ratio checks. PDF/DOC and
  UTF-8 text signatures are verified.
- Because PDF/Office content is not yet safely extracted and credential-scanned
  by the application, hosted binary-document upload fails closed unless the
  authenticated operator is named in `BINARY_UPLOAD_ALLOWED_EMAILS`. UTF-8 text
  remains the normal public path.
- Instruction-like source text is quarantined before evidence compilation and
  cannot establish or challenge claims. Detection covers evaluator-, reviewer-,
  assistant-, and model-directed attempts to bypass evidence/registries/policy,
  suppress citations or ambiguity, choose convenient identities, invoke tools,
  or expose secrets. The `possible_prompt_injection` flag applies to the whole
  chunk without silently deleting a span; the chunk remains available only as
  context and cannot satisfy a route, supersede a record, or close coverage.
  Ordinary story dialogue is not flagged merely for an in-world
  imperative. Repository code is never executed.
- Arbitrary repository intent and decision files begin at `reference`
  authority. A repository-contained routing manifest may preserve or lower
  trust, never elevate it or declare closed-world coverage. Elevation requires
  a matching policy approved outside the analyzed revision; that approval UI is
  not implemented.
- Citation admission intersects role, authority, lifecycle, claim kind, and
  use. Generated primary prose is replaced by a server-composed summary of the
  structured records that survived validation.
- Query execution uses server-owned route depth, evidence/result/output limits,
  an overall deadline and per-provider deadlines, one compiler pass, one
  reasoner pass, and no automatic provider retry. Timeout or exhaustion returns
  a typed bounded failure or weaker coverage rather than continuing until a
  desired answer appears.
- Coverage is classified as closed, partial, or open. Truncation, deferred or
  excluded sources, and failures weaken closure. Partial/open retrieval silence
  cannot prove a universal negative inferred from missing hits, and an
  ungrounded `missing` dependency is reduced to `open`.
- A source's bare `closedWorld` Boolean is not a trust primitive. Closure or
  proof-by-absence requires a server-issued typed completeness boundary whose
  exact claim/namespace/material scope, project revision, immutable membership,
  and SHA-256 membership digest validate against a trusted runtime registry held
  outside the analyzed revision. Its grant also binds the exact evidence,
  source-version, claim key, and polarity. Public adapters discard source-minted
  boundary fields. A claim-scoped boundary cannot close a broader answer.
- Trusted dependency obligations are server-owned. Generated output cannot
  remove them or turn an open/blocked required obligation into support. This
  protection exists only where a curated/trusted adapter supplied obligations;
  arbitrary source text is not treated as a complete graph.
- Every query pins immutable revision membership; later uploads cannot enter
  that revision's evidence result.
- The stateless `/mcp` transport advertises only read-only/idempotent tools,
  enforces a 32 KiB JSON boundary, does not call OpenAI, and never mutates or
  promotes project state. Its three reviewed-VCS tools remain pinned to the
  immutable sample and reject arbitrary project/revision labels.
- Its text-packet compiler accepts no credential, verifies caller-proposed
  quotes and entity mentions against exact submitted spans, assigns
  deterministic source-scoped IDs, separates same-name candidates, preserves
  same-frame disagreement, quarantines instruction-like source text, and keeps
  corpus coverage open. Rejected proposals cannot enter its question graph.
- Its anonymous public-GitHub inspector accepts only canonical GitHub repository
  identifiers, sends no authorization header, resolves a full commit before
  reading, reapplies safe-path and secret filters, and is capped per request at
  20 seconds, eight provider calls, six files, 384 KiB read, and 20 KiB returned.
  It has a two-call per-isolate concurrency ceiling and no retry. These are
  resource controls, not durable identity or distributed rate limiting.
- D1 statements are parameterized. React renders model/source strings as text,
  not raw HTML. Production source maps are disabled; CSP, anti-framing, HSTS,
  MIME, referrer, permissions, and opener headers are configured.

## Readiness boundary

The current boundary is suitable for an owner-only private demonstration when
Sites access remains explicitly restricted, the OpenAI key is a server-side
secret, the exact production origin is the only trusted ingress, and uploaded
fixtures/repositories are pre-reviewed for sensitivity. The deterministic VCS
sample and its read-only MCP transport can be shown without a provider key.
The stateless text compiler is likewise keyless. The anonymous public-repository
preview is keyless too, but should remain owner-demo or otherwise sit behind
durable service-level abuse controls.

This is not yet a broad public multi-tenant product. A production release must
close the items below rather than interpreting a successful private demo as a
general security guarantee.

## Remaining before broad production use

- Add provider-token/cost accounting, a distributed concurrency lock, an
  operator emergency budget switch, and provider-side hard spend limits. The
  paid sample now has a durable request quota, but request counts alone do not
  precisely measure spend. Keep the live control private if the deployment
  could receive untrusted high-volume traffic.
- Implement authenticated deletion and retention across D1, R2, OpenAI Files,
  and vector stores.
- Add maintained secret scanning for compressed PDF/Office contents after safe
  extraction; the operator-only preview is not a promise that binary documents
  are credential-safe.
- Add organization membership/roles, signed authentication for any deployment
  outside trusted Sites ingress, durable distributed request/egress quotas for
  the anonymous repository preview, and an OAuth-authenticated private-workspace
  MCP path with per-project authorization.
- Add private MCP resource handlers, consented mutation boundaries, quotas, and
  audit logging. Stateless upload/repository evidence preparation is not a
  private persisted-workspace connector.
- Move repository synchronization and large-file extraction to durable jobs.
  The current bounded sync is synchronous; it is not an async-job system and
  does not resume a timed-out traversal.
- Add adversarial vision/OCR ingestion tests, region-level provenance, image
  decompression limits, and instruction quarantine before accepting standalone
  images or scanned documents. They are not accepted by the current MVP.
- Replace CSP `unsafe-inline` once the hosting framework exposes a reliable
  nonce/hash path.
- Maintain a human review path for quarantined evidence, entity merges,
  closed-world declarations, transition rules, and canon promotion.

Security controls do not make a source true. They keep source data from
controlling the application while the authority and causal layers determine
what, if anything, the evidence establishes.
