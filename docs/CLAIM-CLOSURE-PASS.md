# Claim-closure pass checkpoint

**Status:** implemented and locally validated; not published.

## Goal

Add five domain-neutral safeguards discovered by the Grandma epilogue adversarial test:

1. inventory every material statement in a complex request;
2. compare numeric claims exactly and surface relevant conflicting values;
3. verify caller-supplied file/line locators against the claim attached to them;
4. classify exact identifiers as existing, explicitly proposed, or unknown;
5. validate answer prose at the final boundary rather than assuming an MCP receipt
   also governs prose later composed by a host.

## Compatibility boundary

- Do not rename, remove, or repurpose an existing MCP tool.
- Do not change the existing MCP URL, authentication posture, reviewed VCS sample,
  repository-scope protection, or upload compiler semantics.
- Keep `continuity.mcp.v1` and `continuity.answer.v7` readable.
- New receipts must be additive. Existing calls with existing arguments must
  continue to return their existing required fields.
- Do not publish until the existing continuity and MCP compatibility suites pass.

## Completed

- Added `lib/continuity/claim-closure.ts` with an initial deterministic,
  domain-neutral surface profiler and evidence audit for statements, amounts,
  locators, and identifiers.
- Multi-claim requests now widen their retrieval focus without changing
  low-risk lookup routes.
- The ordinary engine returns an additive internal `claimClosure` validation
  receipt while retaining `continuity.answer.v7`.
- Added the read-only, additive `continuity_validate_draft` MCP tool. The prior
  five tools retain their names, arguments, output fields, scope, and behavior.
- The completed-answer tool may receive the original request as well as the
  exact final draft. This detects a disputed amount, locator, or identifier
  that a fluent answer silently skipped. A clearly rejected value is not
  treated as though the answer asserted it.
- Added passing story, citation, identifier, excerpt-coordinate, and unrelated
  software-symbol tests.

## Validation result

- `npm test`: passed. This builds the production worker, renders the public
  page, exercises the built `/api/mcp` alias, and passes 363 continuity tests.
- `npm run lint`: zero errors. Eleven pre-existing warnings remain in
  `app/page.tsx`; none were introduced by the claim-closure implementation.
- MCP discovery exposes the original five tools in the same order with the
  same required arguments, followed by the additive sixth tool.
- Current answer and MCP wire versions remain `continuity.answer.v7` and
  `continuity.mcp.v1`. The additive receipt has its own version,
  `continuity.claim-closure.v1`.
- No provider call, network publication, deployment, authentication change, or
  mutation-capable MCP tool was introduced.

## Post-mortem

### What the earlier implementation did well

- Typed authority, lifecycle, scope, identity, and causality checks prevented
  most planted canon violations.
- Explicit negative invariants made identity swaps and forbidden behaviors
  unusually easy to detect.
- Repository scope receipts prevented one project in a multi-project
  repository from silently governing another.

### What it missed

- It validated selected evidence and generated records, not every material
  statement in a long request and the prose finally shown to the user.
- Semantic similarity was too permissive for exact amounts, line locators, and
  code or state identifiers.
- A model could avoid repeating a bad premise without explicitly correcting
  it. That is why response B omitted the `$75` error instead of resolving it.

### Regressions found during this pass

1. The first routing change classified `Day 8` as a configurable number. That
   widened a simple Grandma identity question and displaced relevant identity
   evidence. Narrative/time locators—days, chapters, scenes, pages, versions,
   builds, and releases—are now excluded from decision-number routing unless
   the question contains an actual amount, percentage, or decision value.
2. The built-worker test still expected five MCP tools. It now asserts six and
   separately freezes the original five-tool prefix and required arguments.

### External-validity evidence

- Story test: an asserted `$75` conflicts with an admitted `$0/$20/$40/$60`
  table; a correction is accepted; silence is reported as an omission.
- Citation test: a real file and real line fail if that passage supports a
  different event.
- Software test: `CreateCharacter()` and `CharacterCreator()` do not alias the
  case-sensitive `createCharacter()` merely because they look similar.
- Excerpt test: a repository excerpt beginning at line 40 correctly verifies
  an absolute line-42 locator.
- Existing causal, temporal, image-sequence, museum-custody, repository-scope,
  upload, and public-demo tests remain green.

## Known limits

- The closure checker is deliberately conservative lexical verification, not
  a theorem prover or a replacement for the typed authority and causal engine.
- A pass means the surfaced answer closed against the exact submitted packet;
  it does not prove that packet is the complete project corpus.
- Unknown identifiers remain unknown unless found exactly or explicitly
  proposed as new. Suggested aliases still require the existing review path.
- The original request is optional for backward-compatible draft checks. When
  omitted, silent-premise coverage cannot be evaluated and the receipt says it
  was not checked.
- The new tool is local only until a later, explicit deployment. The currently
  published endpoint has not been changed by this pass.

## Resume commands

```bash
cd /Users/victortan/slap-the-heavens/canon-consequence-lab
git status --short
node --import tsx --test tests/continuity/claim-closure.test.mjs
npm test
npm run lint
```

## Evidence from the motivating test

- Response B did not repeat the false `$75` donation amount, but it also did not
  flag or correct it. That is non-propagation with incomplete audit recall.
- `docs/STORY-CANON.md` establishes `$0/$20/$40/$60`.
- The fabricated line 412 points to the Allocation Dinner rather than the Seed
  Round assertion it was used to support.
- Neither `grandma-hinge-complete` nor `grandma-hinge-resolved` exists in the VCS
  repository. Either may be proposed, but neither may be presented as an
  already-registered prerequisite.
