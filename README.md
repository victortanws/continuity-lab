# Continuity Lab

Continuity Lab helps people ask practical questions about a story, game,
codebase, policy, archive, or other collection of material without losing track
of what the material actually says.

Add your files or a public GitHub repository. Ask what is true, what can happen
next, whether two sources disagree, or what else must change if you revise part
of the project. Continuity Lab gives a plain-language answer, shows the sources
behind it, and keeps suggestions separate from established facts.

The worked example uses **Vibe Code Simulator**. Its founder eventually needs
to pay $47,000 for his grandmother's operation. The current prototype covers
only Days 7–8, starts the player with $700, and cannot earn enough during that
slice. It also lacks the hospital-payment action and saved result that would
unlock the later recovery scene. Continuity Lab separates those two problems
and turns them into a concrete development plan.

## Quick start guide

### Try the worked example

1. Open the site. The Vibe Code Simulator example is already visible.
2. Choose one of the example questions, such as:

   - “Can the player earn and pay $47,000 in the current prototype?”
   - “Who does ‘Grandma’ mean in the Day 8 customer message?”
   - “If Grandma's operation cost changed to $60,000, what else would need to change?”

3. Read the direct answer first.
4. Open the supporting sections to see:

   - what must happen first;
   - which step is missing;
   - which people, events, rules, or items the question refers to;
   - which passages support the answer; and
   - what should be changed next.

The light/dark control in the top navigation remembers your preference on that
device.

### Ask about your own project

1. Choose **Upload files** to add text, Markdown, structured data, or a supported
   searchable document. You can also paste text directly.
2. Or choose **GitHub repository** and paste a public repository URL. Continuity
   Lab looks for likely sources of truth—such as `STORY-CANON.md`, a story
   bible, product contract, or decision record—and compares them with relevant
   code and tests. In Vibe Code Simulator, this is how it found
   `docs/STORY-CANON.md`. A filename or folder is a routing clue, not automatic
   proof that a file is approved canon. Leave the version field blank unless
   you need a particular branch, release, or commit.
3. Ask a focused question. For example:

   - “Do these two character descriptions refer to the same person?”
   - “What must happen before this scene can occur?”
   - “Do the design document and the code disagree about this price?”
   - “If I remove this quest, which later scenes or tests may be affected?”

4. Treat a missing answer honestly. If the source cannot be read, the relevant
   passage was not supplied, or two possible identities cannot be separated,
   Continuity Lab should say so rather than invent an answer.
5. After you analyze your own files or repository, choose **Download my
   results** to save the answer and its supporting receipt. The worked example
   does not show a download control because it is not your project data.

### Use it from ChatGPT

The hosted MCP address is public, read-only, and ready for ChatGPT to reach from
its own servers:

`https://continuity-lab-vcs.synthesys.chatgpt.site/mcp`

To connect it:

1. In ChatGPT, open **Settings → Security and login** and turn on
   **Developer mode**.
2. Open **Settings → Plugins**, press **+**, and create a developer-mode app.
3. Use the name **Continuity Lab** and paste the MCP address above.
4. Start a new chat, choose **+ → More → Continuity Lab**, then ask a question
   normally.

The MCP path lets ChatGPT provide the conversation while Continuity Lab checks
quotations, identities, disagreements, and stated relationships. It does not
ask the user to paste an OpenAI API key into Continuity Lab. These steps follow
the current [OpenAI Apps SDK connection guide](https://developers.openai.com/apps-sdk/deploy/connect-chatgpt).

## Useful terminology

- **Source:** a file, excerpt, repository file, record, or other piece of
  material that may support an answer.
- **Entity:** a person, character, place, event, rule, item, organization, or
  other thing mentioned in the material. In the public interface we usually
  call these “people and things.”
- **Entity resolution:** deciding whether two names refer to the same thing.
  Continuity Lab is allowed to say “possibly” or “ambiguous” instead of forcing
  a bad merge.
- **Dependency:** something that must happen before something else can happen,
  or something later that relies on the earlier result.
- **Canon or established truth:** what the accepted project material currently
  establishes. A draft, suggestion, or generated possibility does not become
  canon merely because an AI proposed it.
- **Authority:** how much a source is allowed to establish. A current approved
  specification should usually outweigh an old note or an unapproved idea.
- **Pinned version:** the exact repository version used for an answer. Saving
  that version prevents later code changes from silently changing what an old
  answer referred to.
- **Coverage:** how much of the relevant material was actually checked. “Not
  found in the retrieved passages” is weaker than “not present in a complete,
  reviewed list.”
- **Reachability:** whether the required steps can really produce an outcome,
  not merely whether the outcome is mentioned somewhere.

## Autonomous game development

Continuity Lab can already act as a read-only reviewer and planning layer for a
game-development agent. It can pin the version being changed, find relevant
story and implementation evidence, keep similarly named characters separate,
distinguish a design promise from working code, trace a trusted transition
graph, analyze a proposed change without calling it canon, and return cited
blockers and validation work. This is useful today because an agent can ask
before it writes: “Is this beat possible now?”, “What must be true first?”,
“What later material relies on this state?”, and “Which tests and assets must
change with it?”

It is not yet an autonomous game builder by itself. For an arbitrary project,
natural-language files do not automatically become a complete executable
simulation. The current public MCP also cannot edit a repository or approve
canon. Without a trusted transition adapter, it can identify stated
relationships and possible gaps, but it must keep full reachability unknown.

### A safe agent loop

1. Pin the current repository revision and its complete file manifest.
2. Ask Continuity Lab for the relevant characters, rules, state, triggers,
   implementation, tests, and unresolved facts.
3. Generate several candidate beats or scenarios in a proposal namespace.
4. Analyze each candidate for prerequisites, resource limits, identity and time
   conflicts, downstream scenes, tests, UI, and art.
5. Reject candidates with established conflicts. Keep uncertain candidates
   clearly labeled, and rank valid candidates for novelty, dramatic value,
   implementation cost, and review risk.
6. Give the director a small choice set with citations and the smallest required
   code, data, test, and asset changes.
7. After human approval and implementation, sync a new immutable revision and
   verify the resulting behavior before promotion.

That loop reduces review cost by moving routine consistency checks earlier and
showing the director only material choices and uncertainties. It does not try
to remove the director: novelty remains generated, while truth and approval
remain constrained and reviewable.

### Applying this to Vibe Code Simulator

The current reviewed adapter already separates several facts that a naive agent
could easily collapse: earning cash, having enough cash, paying $47,000, saving
the operation-funded state, and unlocking Grandma's recovery scene. That makes
it useful for diagnosing the existing prototype and drafting a development
plan.

To let an agent generate playable days and story beats reliably, VCS should add
a reviewed machine-readable transition registry for each important event:
stable event and character IDs, earliest/latest day, prerequisites, actor
knowledge, cash/energy/time costs, ordered state changes, repeat limits,
downstream consumers, tests, and asset requirements. The story document stays
the narrative authority; the transition registry supplies executable semantics;
the code and tests prove what is actually implemented. Continuity Lab can then
search the whole pinned repository, build only the proof slice needed for the
current question, and reject or repair a candidate that cannot reach the
promised ending.

Once that adapter exists, an agent could generate plausible intermediate days
that preserve canon while steering the economy toward the operation, propose
alternative investment outcomes, schedule character encounters, produce
implementation and test tasks, and prepare art briefs for approved beats. The
director would review the meaningful creative alternatives and unresolved
trade-offs instead of rechecking every fact by hand.

### A possible funded product path

A later repository integration could turn the existing **What to build next**
result into a controlled implementation action. Continuity Lab would first
offer several canon-compatible feature plans. Each plan would include its story
purpose, affected files and state, tests, art requirements, estimated review
risk, and unresolved assumptions. Only the creator-approved plan would be sent
to a coding or asset agent. The resulting branch would then be re-ingested and
audited before a person promotes it.

At team or enterprise scale, the same protocol can support roles, approvals,
private repositories, policy-owned source authority, change histories, review
queues, and audit receipts. The model and agent can vary by organization; the
stable layer is the evidence, entity, proof, proposal, approval, and revision
protocol. This is a roadmap, not a capability claimed by the current MVP.

## How we collaborated with Codex

This project was developed as a long-running collaboration between the product
owner and Codex rather than as a single generated application.

### Where Codex accelerated the work

- It inspected the evolving Slap the Heavens and Vibe Code Simulator projects
  and helped identify the reusable idea beneath them: preserve truth, identity,
  sequence, and consequences across many files and many development sessions.
- It converted repeated manual continuity checks into an evidence compiler,
  authority router, dependency reasoning layer, reviewed adapters, upload and
  GitHub boundaries, MCP tools, security checks, and regression tests.
- It compared naive model use with structured routing, recorded failures, and
  iterated on the architecture instead of treating a persuasive answer as proof
  that the system worked.
- It built and repeatedly revised the site, deployment path, documentation, and
  evaluation runner while keeping the reviewed architecture and sealed test
  candidate separate from presentation-only changes.

### Decisions made by the product owner

The product owner set the core direction and repeatedly corrected the system
when it became too narrow or too technical. Important decisions included:

- generalize beyond one manhua or one game;
- keep Vibe Code Simulator as a compelling worked example, not the definition
  of the product;
- accept incomplete and contradictory material without pretending it is clean;
- separate proposals from established truth;
- preserve evidence so every important conclusion can point back to a source;
- make file uploads, repositories, ChatGPT/MCP use, causality, and future visual
  audits part of one interoperable architecture;
- optimize expensive review work without spawning unlimited checks; and
- rewrite the interface in ordinary language when implementation terminology
  leaked into the public experience.

### How GPT-5.6 and Codex contributed

GPT-5.6 is used as the bounded reasoning and synthesis layer when the API-backed
route is configured. It receives question-relevant evidence and must return a
validated answer contract rather than an unrestricted essay. Codex contributed
the surrounding engineering: routing, evidence boundaries, deterministic
checks, adapters, security controls, tests, deployment work, and the iterative
product/design collaboration that made those capabilities usable.

The central design choice is that GPT-5.6 does not get to declare truth by
itself. The application preserves where information came from, what version it
belongs to, whether sources disagree, and whether the available evidence is
complete enough to support the requested conclusion.

## Try it out in the repo

### Run locally

Prerequisite: Node.js `>=22.13.0`.

```bash
npm install
npm run dev
npm run test:continuity
npm run build
```

The project uses the existing vinext/Sites build and does not use
`wrangler.jsonc`. Use `/mcp` as the public ChatGPT address. `/api/mcp` remains a
backwards-compatible hosted alias for clients that already saved it.

To connect a deployed build to ChatGPT, follow the current
[OpenAI Apps SDK connection guide](https://developers.openai.com/apps-sdk/deploy/connect-chatgpt).
`localhost` is useful for development, but a remote ChatGPT client needs a
reachable HTTPS endpoint.

## For the Technical-Minded

### General engine, current demonstration adapters

Continuity Lab is not limited to VCS, stories, or GitHub repositories. Its core
operations are domain-neutral: ingest bounded evidence, preserve source and
authority, resolve entity candidates without forcing a merge, identify exact
claims and disagreements, map directly stated dependencies, answer questions,
trace consequences, and evaluate hypothetical changes without promoting them
to truth. The same protocol can operate over game design documents, software
requirements and runtime records, production workflows, policy or contractual
materials, research notes, historical archives, and other evidence-bearing
corpora. In plain English: it helps people distinguish what their materials
actually establish, what remains uncertain, what depends on what, and what a
proposed change could disturb.

The hosted Build Week demonstration currently exposes those capabilities
through five read-only MCP tools. These are present adapters, not the limits of
the product:

- `continuity_answer_question`, `continuity_trace_dependencies`, and
  `continuity_analyze_change` are the question, dependency, and counterfactual
  surfaces. In this hosted demonstration they are deliberately bound to the
  immutable reviewed VCS sample, whose trusted transition registry allows a
  stronger reachability result. Another reviewed domain adapter could expose
  the same operations over its own sources, authority policy, and transition
  registry. A natural VCS tool call needs only the question, target, or
  proposed change; the adapter supplies its fixed sample ID and revision.
  Older clients may still send those two scope fields explicitly.
- `continuity_compile_material` verifies exact claims and entity mentions from
  arbitrary text ChatGPT passes from an attachment, paste, connector, or
  repository-aware host. This is the current general-purpose evidence boundary,
  not a story-specific function. Its claim frame is deliberately literal:
  subject, predicate, and any non-empty object are copied exactly from the cited
  quote in order. An intransitive statement such as “Test T9 passed” uses
  `frameArity: intransitive`, an empty object, and one copied predicate token at
  the end of the quoted clause. Expressed objects cannot be discarded. The
  source's packet-relative `reference`, `proposal`, or `production_record`
  label remains visible in the receipt and graph; it never becomes project
  canon. An explicit entity ID is accepted only when that exact ID is visible
  in the quote. Optional `relations` connect original claim indices only when
  one accepted positive causal, normative, or historical claim contains the
  exact cue and both endpoint spans. These edges are source assertions for
  navigation, not automatic proof that an event is reachable.
- `continuity_inspect_public_repository` is one current acquisition connector.
  It pins a public GitHub repository to one commit and returns a small safe set
  of question-relevant excerpts. Selection uses safe path and question clues to
  look first for likely intent sources—story bibles, canon files, contracts,
  decision records, and specifications—and then for relevant implementation
  and tests. ChatGPT can pass those excerpts into `continuity_compile_material`
  for exact entity, conflict, or causal inspection. These clues do not approve
  a repository file as project canon. Future authenticated repositories,
  document parsers, databases, ledgers, and media-description adapters can feed
  the same compiler boundary without changing the underlying truth model.

### Ask about uploaded files or a repository

In ChatGPT, attach one or more files and ask the question after selecting the
app. ChatGPT reads the attachment, selects bounded relevant text, proposes
exact quotations and entity mentions, and calls `continuity_compile_material`.
The MCP does not automatically inherit the original attachment, the current
Git checkout, or all files visible to a desktop app; the client must hand the
text or excerpts to the tool explicitly.

A repo-aware Codex or other compatible host can do the same thing with files it
is authorized to read from the working tree. For an ordinary ChatGPT chat, give
the app a public GitHub URL and a focused question. The current anonymous
repository inspector does not access private repositories, branches outside
the requested ref, or a developer's uncommitted local files.

The MCP itself accepts text packets, not raw binary attachments. TXT, Markdown,
JSON, YAML, XML, CSV/TSV, and extracted text from other formats work when the
client can read them. PDF, DOCX, PPTX, XLSX, screenshots, and scans require the
client or a future parser/vision adapter to extract relevant text first. If a
page is unreadable, a quote cannot be located, or two candidates cannot be
resolved confidently, the receipt says so; it does not invent an entity. The
HTTP MCP request is capped at 32 KiB, so large manuscripts should be narrowed
to question-relevant excerpts rather than copied wholesale.

### Keys, subscriptions, and current limits

The five MCP tools are currently stateless, read-only, and declared `noauth`.
They make no OpenAI API call. This means a user's ChatGPT subscription can
provide the conversational reasoning while the MCP performs deterministic
verification; this path does not require you or the user to put an OpenAI API
key into this application.

That does not turn a ChatGPT subscription into API credit. The website's live
GPT-5.6 button and the persisted arbitrary-workspace retrieval/query route still
need a server-side `OPENAI_API_KEY`. ChatGPT also does not forward a custom API
key to an MCP server, as explained in the [Apps SDK authentication
guide](https://developers.openai.com/apps-sdk/build/auth). A future direct API
or bring-your-own-key mode would therefore be a separate, encrypted credential
and billing design—not a text field in a tool call. Private GitHub access will
likewise require a scoped GitHub OAuth/App flow; it must not reuse an OpenAI
credential.

The public-repository tool is intentionally a preview: one immutable commit,
at most eight provider calls, six files read, 20 KiB of returned excerpts, a
20-second deadline, no automatic retry, a durable service-global daily
reservation before any GitHub call, and no corpus-wide absence claim. The
upload compiler accepts source assertions, not project truth. Its graph is
question-scoped and can traverse verified claims plus simple, exact-evidence-
bound precondition, consequence, and before edges. Negative relationship
claims and compound `or`/`unless` logic remain visible prose rather than being
flattened into misleading edges. This is not yet a durable whole-corpus
knowledge graph, alternative-path solver, or automatic natural-language
causality theorem prover.

### Router v3.4 compatibility

The public transport remains MCP `2025-06-18`, and its stable data contract is
`continuity.mcp.v1`. Authority-router version `3.4.0` is advertised separately
as namespaced tool metadata, so router changes do not rename tools or resource
identities. The three v3.2 reviewed-sample tools keep their existing names,
inputs, and output shape; v3.3 added the two context tools, while v3.4 adds a
server-authored proof contract and target-prioritized context capsule. Tests exercise
initialization, all five descriptors, the original VCS calls, exact upload
verification, anonymous commit pinning, and the $47,000 regression. Clients
should branch on advertised capabilities and `contractVersion`, not parse the
router version from prose.

### Runtime shape

- `app/api/continuity/query`: revision-pinned multi-lane retrieval,
  query-scoped exact-span claim/entity compilation, typed authority and
  citation-use validation, server-owned transition proof when a compiled graph
  exists, and sealed GPT-5.6 synthesis
- `app/api/continuity/sources`: immutable uploaded source versions with a
  server-validated narrative/reference/proposal document type
- `app/api/continuity/repositories`: commit-pinned GitHub snapshot sync and status
- `app/api/mcp` (Sites transport) and `app/mcp` (canonical public address):
  stateless read-only MCP transport for the immutable reviewed VCS
  sample, exact-span text packets, and bounded anonymous public-GitHub excerpts;
  it does not expose arbitrary persisted or private workspaces
- D1: project, source, snapshot, provider-binding, and analysis records
- R2: uploaded bytes, repository blobs, manifests, and retrieval packets
- OpenAI vector stores: replaceable retrieval projections, isolated per repository snapshot

The sample answer is a reviewed deterministic demonstration. Its icon-only live
control reruns the exact displayed question and frozen analysis scope through the
same server route with GPT-5.6 Sol; it never substitutes whatever text happens to
remain in the editor. Without `OPENAI_API_KEY`, the control reports setup as
incomplete rather than presenting the reviewed answer as a live result.

Ordinary questions do not automatically pay the cost or visual complexity of a
full causal audit. The server chooses a minimum safe route, applies fixed
evidence/model/graph budgets and provider deadlines, and the browser shows a
direct focused answer before offering the complete trace. Causal and change
questions still receive the deeper evidence surface. Each query permits one
compiler pass, one reasoner pass, and one bounded graph pass; provider phases
are not automatically retried.

For production work where a missed defect can force expensive rework, the
reusable inspection planner performs one exact, hard-capped feasible-subset
search within a static additive calibration model over residual expected loss
plus converted inspection effort. Mandatory
release gates and optional calibrated bundles are optimized together, so an
early cheap choice cannot strand later value. No pair of signal labels compounds
detection probability without an approved exact joint calibration. Calibration
must resolve through a current server-owned registry revision bound to the whole
canonical risk/check/policy catalog, with conservative incidence and detection
bounds; it is not model self-confidence. Numeric and structural work ceilings
fail before optimization, and exact term comparisons keep small calibrated
losses and hard-budget overages visible beside very large values. The planner is currently a core library rather than a
browser workflow; adaptive stopping, shared rerun effects, and false-positive
costs require richer future calibration or planning.

Routes report `closed`, `partial`, or `open` evidence coverage. A universal
negative inferred from retrieval silence under partial/open coverage is
insufficient evidence rather than a conflict unless an exact closed registry
establishes the absence. Where a
trusted adapter supplies server-owned dependency obligations, generated output
cannot omit them, and a required open or blocked obligation prevents support.
Arbitrary uploaded material does not acquire a complete causal graph
automatically. The MCP may build one bounded question-scoped graph from
verified atomic spans. A simple precondition, consequence, or before edge must
also survive the exact relation boundary; deterministic reachability still
requires a trusted complete transition registry or reviewed adapter.

### Current capability boundary

- **Upload and paste:** up to 12 files per browser selection, sent and stored
  sequentially; UTF-8 text and supported structured/document formats. PDF and
  Office are operator-only previews.
- **Entity resolution:** exact-span, question-scoped candidates with cited
  ambiguity, available through both the persisted query flow and the stateless
  text-packet MCP. There is no durable corpus-wide entity/alias graph yet.
- **Questions:** cited revision-pinned answers when retrieval is configured,
  with explicit conflict and coverage. General causal reachability remains
  unknown unless a trusted graph exists.
- **Changes:** canon-safe provisional proposals and typed consequences; no
  reviewed promotion UI or automatic canon mutation.
- **Production audit:** deterministic library over already-extracted
  observations; no raw image/OCR adapter and no browser/API route yet.
- **GitHub:** bounded commit-pinned snapshot sync; no webhook, incremental
  GitHub App flow, or live working-tree mount.
- **MCP:** an executable stateless `/mcp` address for five read-only tools,
  internally routed to the Sites-compatible `/api/mcp` transport:
  three over `vcs-demo-r2`, one exact-span text-packet compiler, and one bounded
  anonymous public-GitHub inspector. Authenticated persisted/private workspaces
  and resource handlers are not implemented.

### Hosted environment values

- `CONTINUITY_TRUSTED_INGRESS_ORIGINS`: comma- or newline-separated exact HTTPS
  origins whose ingress strips caller-supplied identity headers and injects a
  verified `oai-authenticated-user-email`. Hosted mutable workspaces and the
  paid sample fail closed when this value is absent or invalid. Do not set a
  wildcard, an HTTP origin, or an origin with a path. Localhost and the shared
  read-only VCS sample do not require it.
- `OPENAI_API_KEY` (secret): enables GPT-5.6 Sol and OpenAI retrieval. Without it,
  uploads and repository snapshots remain stored but are reported as not searchable.
- `GITHUB_TOKEN` (secret, strongly recommended for the demo): read-only Contents
  access for private repositories and reliable GitHub API capacity. Tiny public
  repositories can work without it, but unauthenticated GitHub limits are too
  small for a dependable full-project demonstration.
- `GITHUB_ALLOWED_REPOSITORIES`: required whenever `GITHUB_TOKEN` is set;
  comma-separated exact `owner/repository` names that credential may access.
  A multi-user production service should use per-installation GitHub App tokens
  instead of a shared token.
- `REPOSITORY_SYNC_ALLOWED_EMAILS`: comma-separated ChatGPT account emails allowed
  to create repository snapshots. Production synchronization fails closed when this
  value is absent; localhost remains available for development.
- `REPOSITORY_MAX_FILES` and `REPOSITORY_MAX_TOTAL_BYTES` (optional): conservative
  deployment-specific limits bounded by the connector's hard policy ceiling.
- `MCP_PUBLIC_REPOSITORY_DAILY_LIMIT` (optional): service-global daily cap for
  anonymous public-repository MCP inspections, clamped to `1..500` and defaulting
  to `50`. D1 reservation failure stops before GitHub is contacted.
- `BINARY_UPLOAD_ALLOWED_EMAILS` (optional): exact ChatGPT account emails
  permitted to use the PDF/DOC/DOCX/PPTX preview. Hosted binary uploads fail
  closed when this is absent because those formats are not yet content-secret-
  scanned. This is an operator preview boundary, not a claim that a binary
  document is credential-safe.

The Site's Git commit deploys the application. It is not a live runtime mount of
GitHub or a developer's local folder. See `docs/ARCHITECTURE.md` for the snapshot,
webhook, build-time bundle, and remote MCP/orchestrator patterns.

An analyzed repository may suggest source routes in `continuity.config.json`,
but it cannot promote itself to immutable authority or issue a completeness
boundary. Stronger
claim policy must be approved and stored outside the analyzed revision.
Intent and decision paths such as README files, story bibles, contracts, and
ADRs therefore default to `reference` authority for an arbitrary repository;
path role helps retrieval but is not approval.

For direct uploads, choose whether the file is story/source text, reference
material, or a draft/proposal. This lets opaque names such as `pg1342.txt` be
routed as narrative evidence while preserving their original filename and
checksum. It does not approve the upload as canon: the server fixes the allowed
role, lifecycle, authority, and `closedWorld=false` profile for each choice.
The Boolean is legacy metadata; proof of absence requires a server-issued,
revision-membership-digested typed boundary for the exact claim or material
answer scope plus a runtime trust-registry grant stored outside the analyzed
material. Uploads and repository/vector metadata cannot mint that grant.
Multipart names and classification fields are validated with UTF-8 byte limits
before storage; their encoded bytes count toward upload quotas. `validFrom`
accepts exact ISO dates or explicit story ordinals (for example `Day 8`), not
uninterpreted temporal prose.

The browser accepts UTF-8 TXT/MD/Markdown/HTML/JSON/YAML/XML/CSV/TSV. An
explicitly allowlisted operator may also preview searchable PDF, DOC/DOCX, and
PPTX ingestion. File signatures are verified; Office archives receive entry
and decompression limits; obvious text credentials are rejected before
storage. Binary-document contents are not yet credential-scanned, so ordinary
hosted users are refused. “Indexed” means the provider accepted the file, not
that every page or entity was readable. Image-only/scanned PDFs, screenshots,
standalone images, XLS/XLSX, EPUB, and RTF are rejected in this MVP. Paste or
upload a text description instead; OCR and region-grounded image ingestion are
future adapters.

See `docs/EVALUATION-POSTMORTEM.md` for the earlier output-contract confound,
response-economy finding, and the fresh v3.1/v3.2 reserve regressions. Neither
version beat its baseline. v3.3 therefore requires a newly sealed reserve;
broad superiority, lower provider cost, and faster answers are not claimed
until that evaluation is complete.

See `docs/EVIDENCE-COMPILER.md` for the exact-quote, server-owned provenance
boundary used by live workspaces and the remaining durable-entity/OCR limits.
See `docs/AUTHORITY-ROUTER-V3.md` for the current domain-neutral reasoning
procedure and `docs/SECURITY.md` for implemented controls and remaining release
gates.
`docs/INPUT-BOUNDARIES.md` records the runtime request/evidence ceilings and the
trusted-adapter boundary for ISO-date and semantic-version ordering.

See `docs/PRODUCTION-AUDIT-PROTOCOL.md` for the deterministic protocol that can
produce a panel/process review like the supplied manhua example once an
upstream reviewer or vision adapter has supplied cited observations.

### Workspace Auth Headers

OpenAI workspace sites can read the current user's email from
`oai-authenticated-user-email`.

The application does not trust that header merely because it is present. Its
request origin must also match `CONTINUITY_TRUSTED_INGRESS_ORIGINS`, configured
server-side for an ingress that removes caller-supplied copies before injecting
the verified value. A deployment without that guarantee must add its own signed
session boundary instead of enabling this setting.

SIWC-authenticated workspace sites may also receive
`oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty
`name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by
`oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

### Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs
optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send
  anonymous visitors through Sign in with ChatGPT.
- Use `chatGPTSignInPath(returnTo)` and `chatGPTSignOutPath(returnTo)` for
  browser links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in
  or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because
  they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the
OAuth cookies, and identity header injection. Do not implement app routes for
those reserved paths. Routes that do not import and call the helper remain
anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the
Sites hosting platform's access policy controls for workspace-wide restrictions,
or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write
actions tied to the current ChatGPT user. Leave public content anonymous.

### Useful Commands

- `npm run dev`: start local development
- `npm run build`: verify the vinext build output
- `npm test`: build the application and run the rendered and continuity suites
- `npm run db:generate`: generate Drizzle migrations after schema changes

### Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
