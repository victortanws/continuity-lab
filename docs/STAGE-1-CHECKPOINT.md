# Stage 1 checkpoint

**Recorded:** 2026-07-22  
**Stage:** dependable evidence-backed MVP  
**Local base commit:** `9675f88` on `agent/continuity-lab-demo-polish`  
**Release status:** local candidate validated; additive changes not yet committed
or deployed

This checkpoint records what was actually verified while following
`docs/STAGED-EVOLUTION.md`. It separates local capability from the currently
published service so a later model or agent does not infer deployment from the
presence of code.

## Current published service

The published endpoint is:

`https://continuity-lab-vcs.synthesys.chatgpt.site/api/mcp`

A live MCP discovery call on 2026-07-22 reported:

- contract `continuity.mcp.v1`;
- authority router `3.8.0`;
- five read-only tools;
- no authentication requirement; and
- no deployed `continuity_validate_draft` tool.

The five published tools remain:

1. `continuity_answer_question`;
2. `continuity_trace_dependencies`;
3. `continuity_analyze_change`;
4. `continuity_compile_material`; and
5. `continuity_inspect_public_repository`.

## Local Stage 1 candidate

The local candidate preserves those five names and their required arguments and
adds one read-only tool at the end of MCP discovery:

- `continuity_validate_draft` checks the exact final draft, optional original
  request, and unchanged submitted packet for omitted disputed amounts,
  unsupported file/line locators, and unknown or merely proposed identifiers.

The local pass also:

- records the staged product direction in `docs/STAGED-EVOLUTION.md`;
- widens retrieval for independently checkable multi-claim requests without
  deepening simple identity lookups;
- preserves the current `continuity.mcp.v1` and `continuity.answer.v7` wire
  versions;
- keeps the sixth-tool receipt separately versioned as
  `continuity.claim-closure.v1`; and
- changes repository path ranking so a project name repeated in a shared
  directory cannot crowd an explicitly requested architecture or canon file out
  of the bounded read set.

## Local validation evidence

The following checks passed after the documentation and repository-ranking
corrections:

- `npm test`;
- production worker build;
- 3 of 3 rendered-interface tests;
- 363 of 363 continuity tests;
- existing five-tool prefix and legacy MCP protocol compatibility;
- claim-closure story, citation, identifier, and unrelated software-symbol
  cases;
- common-directory versus explicit-architecture-file retrieval regression;
- `npm run lint` with zero errors and 11 pre-existing warnings in
  `app/page.tsx`; and
- `git diff --check` with no whitespace errors.

## Live workflow evidence

The published five-tool service was exercised through the same JSON-RPC tool
calls used by a remote MCP client:

1. **Vibe Code Simulator question.** “Can the player actually save Grandma by
   Day 24 in the current version of the game?” returned `UNREACHABLE`, separated
   the missing money path from the missing payment/persistence path, cited the
   reviewed sources, and proposed a bounded repair.
2. **Uploaded-text boundary.** Two documents using “Grandma” with explicit IDs
   `CHR-1` and `CHR-2` produced two entities, one ambiguity set, and
   `safeForAutomaticIdentityMerge: false` under incomplete corpus coverage.
3. **Multi-project repository boundary.** A generic canon question over
   `victortanws/continuity-lab` returned two named choices—Continuity Lab product
   and Vibe Code Simulator reviewed example—with zero excerpts and no scope
   receipt until a project was selected.
4. **Selected repository scope.** Selecting `continuity-lab` pinned commit
   `67a92895621172e293167f635ef4489adb1838a5`, returned five in-scope excerpts
   and a scope receipt, and retained `completeForProjectTruth: false`.

The selected-scope run exposed a relevance weakness: a question explicitly
asking about the product architecture returned related implementation files but
not `docs/ARCHITECTURE.md`. The local ranking correction and an unrelated
regression test now address the general cause. The published service will retain
the old ranking until a later deployment.

## Release decision

The sixth draft-validation tool is appropriate for Stage 1 because it closes an
observed final-answer verification gap and does not grant mutation or canon
authority. Its implementation is additive and locally compatible. The
recommendation is to publish it with the repository-ranking correction after a
clean commit, then refresh the ChatGPT developer connector and repeat the live
workflow checks.

Until that happens, public documentation must continue to describe five
deployed tools. Presence of the sixth tool in the local source tree is not
evidence that ChatGPT can call it.

## Remaining Stage 1 release actions

1. Review and intentionally commit the current local candidate and Build Week
   documentation/media changes.
2. Deploy that exact commit through Sites.
3. Refresh or recreate the ChatGPT developer connector so it discovers the
   additive sixth tool.
4. Call `continuity_validate_draft` through ChatGPT with the adversarial numeric,
   citation, and identifier packet.
5. Repeat the selected Continuity Lab repository question and verify that the
   architecture document is included when explicitly requested.
6. Update the README and this checkpoint from five to six deployed tools only
   after live discovery confirms the new deployment.

Stage 2 persistent project memory has not begun. The current public transport
remains project-stateless and read-only.
