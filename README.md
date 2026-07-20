# Continuity Lab

An evidence-first consequence engine for stories, games, codebases, and long-form
text. The Build Week demonstration uses Vibe Coder Simulator, while the core
keeps project records, provider IDs, retrieval, and future MCP transport separate.

The hosted Site can accept file uploads or synchronize a read-only GitHub
snapshot. Repository sync resolves an exact commit, excludes sensitive and
unsupported paths, stores immutable originals and a manifest, and optionally
indexes a path-marked packet for GPT-5.6 Sol. Repository code is never executed.

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

- `app/api/continuity/query`: evidence retrieval, validation, and GPT-5.6 synthesis
- `app/api/continuity/sources`: immutable uploaded source versions
- `app/api/continuity/repositories`: commit-pinned GitHub snapshot sync and status
- D1: project, source, snapshot, provider-binding, and analysis records
- R2: uploaded bytes, repository blobs, manifests, and retrieval packets
- OpenAI vector stores: replaceable retrieval projections, isolated per repository snapshot

## Hosted environment values

- `OPENAI_API_KEY` (secret): enables GPT-5.6 Sol and OpenAI retrieval. Without it,
  uploads and repository snapshots remain stored but are reported as not searchable.
- `GITHUB_TOKEN` (secret, strongly recommended for the demo): read-only Contents
  access for private repositories and reliable GitHub API capacity. Tiny public
  repositories can work without it, but unauthenticated GitHub limits are too
  small for a dependable full-project demonstration.
- `REPOSITORY_SYNC_ALLOWED_EMAILS`: comma-separated ChatGPT account emails allowed
  to create repository snapshots. Production synchronization fails closed when this
  value is absent; localhost remains available for development.
- `REPOSITORY_MAX_FILES` and `REPOSITORY_MAX_TOTAL_BYTES` (optional): conservative
  deployment-specific limits bounded by the connector's hard policy ceiling.

The Site's Git commit deploys the application. It is not a live runtime mount of
GitHub or a developer's local folder. See `docs/ARCHITECTURE.md` for the snapshot,
webhook, build-time bundle, and remote MCP/orchestrator patterns.

## Workspace Auth Headers

OpenAI workspace sites can read the current user's email from
`oai-authenticated-user-email`.

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
