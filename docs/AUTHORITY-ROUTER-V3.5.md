# Authority Router v3.5: resolve the project before its truth

Router v3.5 adds a project and evidence-domain boundary before retrieval. It
does not change the v3.4 proof contract, authority weights, exact-claim gate, or
reachability requirements.

## Problem

A repository can contain several applications, stories, packages, fixtures, or
worked examples. The same words—`canon`, `Grandma`, `contract`, `current build`,
or `source of truth`—can therefore refer to unrelated domains. Relevance
ranking cannot repair a scope mistake after evidence from those domains has
already been mixed.

## Boundary

The repository inspector now:

1. pins the repository commit and tree;
2. discovers root and nested project markers;
3. reads an optional bounded `continuity.config.json` for declared project or
   example domains;
4. resolves an explicitly named scope from the question or `projectScope`;
5. returns scope choices with no excerpts when the target remains ambiguous;
6. excludes out-of-scope files before question relevance scoring; and
7. retains open/partial semantic coverage and packet-relative authority.

Repository declarations cannot grant canon, close a corpus, or suppress
independently discovered roots. Same-root domains require their stable scope ID
when a path alone would match more than one domain.

## Compatibility

The MCP contract remains `continuity.mcp.v1` and the five public tool names are
unchanged. `continuity_inspect_public_repository` gains an optional
`projectScope` input and a structured scope receipt. The three deterministic
reviewed-example tools remain pinned to Vibe Code Simulator and now refuse to
guess what phrases such as “this folder” mean.

## External-validity checks

Regression tests cover:

- a single-root repository;
- a monorepository with two nested products;
- a product and worked example sharing one root;
- explicit selection by scope ID or subtree;
- malformed and traversal-bearing scope declarations;
- evidence exclusion across selected project boundaries; and
- generic MCP questions that must not silently default to VCS.
