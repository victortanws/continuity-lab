# Query-scoped evidence compiler

The live workspace path does not send broad retrieved prose directly to the
continuity reasoner. `OpenAIEvidenceCompiler` first asks GPT-5.6 Sol for atomic
claims and entity mentions that are relevant to the current question.

The model proposes a parent evidence ID, an exact quote, a claim frame, and
entity mentions. The server then:

- quarantines instruction-like source text before the compiler provider is
  called, so it can remain visible as context but cannot establish truth;
- rejects every quote that is not one contiguous substring of its parent;
- requires copied frame parts to occur in source order and conservatively
  rejects polarity reversal and explicitly hypothetical language;
- limits the claim kind to the kinds already allowed for that source role;
- derives claim, evidence, and entity-candidate IDs itself;
- copies project, source, version, authority, lifecycle, locator, world, owner,
  and supersession metadata from the parent rather than model output;
- derives assertion scope from server-owned metadata: reference evidence stays
  a source assertion, proposals stay proposed, and approved/production evidence
  belongs to project truth;
- preserves same-name mentions as separate candidates unless an explicit
  source identifier proves identity inside the applicable assertion owner;
- inherits trusted temporal metadata and parses only common temporal markers
  that occur inside the accepted quote; and
- keeps a parent fragment as context-only when no atomic result survives.

Compiler diagnostics are included in the authority route. They explicitly say
when no claim or entity could be confidently resolved. Context-only fragments
cannot establish a conclusion.

An accepted span proves what its pinned source states, not that the statement
has been approved. For example, “The storm causes the evacuation” can support a
`causal` conclusion in `source_assertion` scope. The answer then reports
`truthStatus=source_assertion`; it cannot relabel that sentence as canon,
implementation, observation, or a server-proved reachable transition. Opposite
claims are compared inside the same assertion owner rather than flattening
separate documents into one truth world. Opposite same-frame claims from two
source-version owners are still surfaced as `source_disagreement`; that is a
corpus-level warning, not a `claim_contradiction` or promotion of either claim.

An explicit ID printed in a reference upload or proposal is namespaced to that
immutable source-version owner. Thus two uploads that both contain `CHR-007`
do not silently become one person. Only approved `project_truth` evidence can
make an explicit registry ID project-global. Conversely, two independently
verified exact spans in one manuscript can establish that a shared label has
two candidate referents; independent spans, not different `sourceId` strings,
are the anti-fabrication requirement.

## Current boundary

This is a query-scoped compiler, not yet a durable corpus-wide entity registry.
Candidate IDs are stable for the same source version and span, but aliases and
cross-document identity links are rebuilt for each retrieved projection. Exact
quote and deterministic polarity checks prove provenance and reject a bounded
class of semantic reversal; they do not solve arbitrary natural-language
entailment. The authority router and final validator still constrain every use,
and live explanatory prose is composed from records that survived validation
rather than displayed directly from the model.

The compiler receives text after upload extraction and indexing. It does not
perform DOCX/PDF parsing or OCR itself, cannot recover unreadable or image-only
documents, and cannot infer facts from retrieval silence. It currently compiles
atomic claims and entity candidates only. A separate server-owned transition
graph can prove reachability after a curated adapter or later compiler has
created rules; arbitrary upload-to-rule compilation is not yet implemented.

The production query route enables this compiler for live, user-scoped OpenAI
workspaces. The reviewed VCS demonstration remains deterministic and does not
depend on an extraction call.
