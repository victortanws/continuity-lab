# Continuity Lab

An evidence-first consequence engine for stories, games, codebases, and long-form
text. The Build Week demonstration uses Vibe Coder Simulator, while the core
keeps project records, provider IDs, retrieval, and transport concerns separate.

The application is designed to accept file uploads or synchronize a read-only
GitHub snapshot when deployed with its storage and provider bindings. Repository
sync resolves an exact commit, excludes sensitive and unsupported paths, stores
immutable originals and a manifest, and optionally indexes a path-marked packet
for GPT-5.6 Sol. Repository code is never executed. This repository's local
state does not by itself prove that the same candidate is currently live.

## Prerequisites

- Node.js `>=22.13.0`

## Quick Start

```bash
npm install
npm run dev
npm run build
```

This starter does not use `wrangler.jsonc`.

## Runtime shape

- `app/api/continuity/query`: revision-pinned multi-lane retrieval,
  query-scoped exact-span claim/entity compilation, typed authority and
  citation-use validation, server-owned transition proof when a compiled graph
  exists, and sealed GPT-5.6 synthesis
- `app/api/continuity/sources`: immutable uploaded source versions with a
  server-validated narrative/reference/proposal document type
- `app/api/continuity/repositories`: commit-pinned GitHub snapshot sync and status
- `app/mcp`: stateless read-only MCP transport for the immutable reviewed VCS
  sample; it does not expose arbitrary or private workspaces
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
Arbitrary uploaded material does not acquire such a graph automatically.

## Current capability boundary

- **Upload and paste:** up to 12 files per browser selection, sent and stored
  sequentially; UTF-8 text and supported structured/document formats. PDF and
  Office are operator-only previews.
- **Entity resolution:** exact-span, question-scoped candidates with cited
  ambiguity. There is no durable corpus-wide entity/alias graph yet.
- **Questions:** cited revision-pinned answers when retrieval is configured,
  with explicit conflict and coverage. General causal reachability remains
  unknown unless a trusted graph exists.
- **Changes:** canon-safe provisional proposals and typed consequences; no
  reviewed promotion UI or automatic canon mutation.
- **Production audit:** deterministic library over already-extracted
  observations; no raw image/OCR adapter and no browser/API route yet.
- **GitHub:** bounded commit-pinned snapshot sync; no webhook, incremental
  GitHub App flow, or live working-tree mount.
- **MCP:** an executable stateless `/mcp` transport for three read-only analysis
  tools over `vcs-demo-r1`. Authenticated arbitrary/private workspaces and
  resource handlers are not implemented.

## Hosted environment values

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
response-economy finding, and the fresh v3.1 reserve regression. v3.1 did not
beat its baseline; v3.2 requires a new sealed reserve. Broad superiority, lower
provider cost, and faster answers are not claimed.

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

## Workspace Auth Headers

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

## Optional Dispatch-Owned ChatGPT Sign-In

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

## Useful Commands

- `npm run dev`: start local development
- `npm run build`: verify the vinext build output
- `npm test`: build the starter and verify its rendered loading skeleton
- `npm run db:generate`: generate Drizzle migrations after schema changes

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
