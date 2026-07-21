# Continuity Lab

Continuity Lab is a tool for long-form AI-assisted game or narrative development. It helps people ask practical questions about a story, game,
codebase, policy, archive, or other collection of material without losing track
of what the material actually says.

Add your files or a public GitHub repository, ask what is true, what can happen
next, whether two sources disagree, or what else must change if you revise part
of the project. Continuity Lab gives a plain-language answer, shows the sources
behind it, and keeps suggestions separate from established facts.

The [worked example](https://continuity-lab-vcs.synthesys.chatgpt.site/) uses **Vibe Code Simulator**. Its founder eventually needs
to pay $47,000 for his grandmother's operation. The current prototype covers
only Days 7–8, starts the player with $700, and cannot earn enough during that
slice. It also lacks the hospital-payment action and saved result that would
unlock the later recovery scene. Continuity Lab separates those two problems
and turns them into a concrete development plan.

## Quick Start Guide: Installation, Supported Platforms, and Testing Guidelines

No installation is required for the hosted example. Open it in a modern web browser and begin with the supplied questions. When testing an answer, compare it with the cited evidence and note anything marked uncertain, missing, or proposed.

### Try the worked example

1. Open the [Continuity Lab worked example](https://continuity-lab-vcs.synthesys.chatgpt.site/). The Vibe Code Simulator example will already be visible.

2. Choose an example question:

   - “Can the player earn and pay $47,000 in the current prototype?”
   - “Who does ‘Grandma’ mean in the Day 8 customer message?”
   - “If Grandma’s operation cost changed to $60,000, what else would need to change?”

3. Read the direct answer.

4. Review the supporting sections to see:

   - What must happen first.
   - Which step is missing.
   - Which people, events, rules, or items the question refers to.
   - Which passages support the answer.
   - What should be changed next.
     
The light/dark control in the top navigation remembers your preference on that
device.

### Use it from ChatGPT

The hosted MCP address is public, read-only, and ready for ChatGPT to reach from
its own servers:

`https://continuity-lab-vcs.synthesys.chatgpt.site/api/mcp`

To connect it:

1. In ChatGPT, open **Settings → Security and login** and turn on
   **Developer mode**.
2. Open **Settings → Plugins**, press **+**, and create a developer-mode app.
3. Use the name **Continuity Lab** and paste the MCP address above.
4. Start a new chat, choose **+ → More → Continuity Lab**, then ask a question
   normally.
5. Give Continuity Lab something to examine in one of three ways:
   - **Paste text directly:** paste a relevant passage, script, specification,
     table, or set of notes into the conversation.
   - **Attach files:** add one or more files to ChatGPT and ask a focused
     question about them. TXT, Markdown, JSON, YAML, XML, CSV, and TSV are the
     most direct formats. PDF, DOCX, PPTX, XLSX, screenshots, and scans work
     only when ChatGPT can first read or extract the relevant text.
   - **Provide a public GitHub URL:** include the complete repository URL and
     ask a focused question. Continuity Lab pins the repository to one commit
     and searches a bounded set of relevant files.
6. When using a repository, name the project you mean. Do not ask only
   “What is canon in this repository?” because ChatGPT may have several
   repositories or projects in view. Instead, ask:

   > In `https://github.com/owner/repository`, what is considered canon?

   If the repository contains several products, stories, or examples,
   Continuity Lab will return the possible project scopes and ask you to choose
   one before continuing.
7. Ask questions about facts, identity, consistency, dependencies, or proposed
   changes. For example:
   - “Who does Grandma refer to in this passage?”
   - “Do these two files disagree about the operation cost?”
   - “Can this event happen in the current implementation?”
   - “What must happen before this ending becomes reachable?”
   - “What would be affected if I removed this quest?”
   - “Is this function name established, proposed, or possibly misspelled?”
   - “Does the cited file and line actually support this claim?”
8. For a long audit or proposed rewrite, ask ChatGPT:

   > Before answering, use Continuity Lab to verify the important factual claims
   > against the supplied material. Show the evidence for each correction and
   > clearly label anything that remains uncertain or merely proposed.

   This helps catch incorrect amounts, unsupported citations, unknown IDs, and
   disputed claims that a fluent answer may otherwise skip.
9. Read uncertainty literally. If a file cannot be read, a passage was not
   supplied, two identities remain ambiguous, or the inspected repository
   excerpts are incomplete, Continuity Lab should say so. It will not invent
   missing evidence.
10. Remember the current boundaries:
    - The MCP accepts text and extracted excerpts—not raw binary documents.
    - It does not automatically inherit every attachment or local file visible
      to ChatGPT; ChatGPT must pass the relevant text to it.
    - Repository access currently supports public GitHub repositories, not
      private repositories, uncommitted local files, or arbitrary website URLs.
    - Large files and repositories are narrowed to question-relevant excerpts.
      The result should not be treated as proof that every file in the project
      was inspected.
    - All five deployed tools are read-only. Continuity Lab cannot edit files, push
      commits, approve canon, or change the connected repository.
    - This ChatGPT path does not require the user to provide an OpenAI API key.

For a repository question, include the public GitHub URL in the message. Do not
ask only “What is canon in this repository?” ChatGPT can have other files or a
different working folder in view, and selecting the app does not tell
Continuity Lab which one you mean. A safe first question looks like:

> In `https://github.com/owner/repository`, what is considered canon?

If that repository contains several products, stories, or examples, Continuity
Lab will return their names and ask you to choose one before it reads evidence.

The MCP path lets ChatGPT provide the conversation while Continuity Lab checks
quotations, identities, disagreements, and stated relationships. It does not
ask the user to paste an OpenAI API key into Continuity Lab. These steps follow
the current [OpenAI Apps SDK connection guide](https://developers.openai.com/apps-sdk/deploy/connect-chatgpt).

## Useful terminology

- **Source:** a file, excerpt, repository file, record, or other piece of
  material that may support an answer.
- **Project scope:** the particular application, story, package, or reviewed
  example that a question is about. A repository can contain several scopes.
  Choosing one prevents an answer about one project from borrowing evidence
  from another.
- **Entity:** a person, character, place, event, rule, item, organization, or
  other thing mentioned in the material. In the public interface we usually
  call these “people and things.”
- **Mention:** one exact occurrence of a name or description in a source. A
  mention is not automatically an entity: two occurrences of “Grandma” may
  refer to different people, while “Mara” and “Captain Mara” may refer to the
  same person when an exact ID or identity statement proves it.
- **Entity resolution:** deciding whether two names refer to the same thing.
  Continuity Lab is allowed to say “possibly” or “ambiguous” instead of forcing
  a bad merge.
- **Identity-link candidate:** a review suggestion that two names may be
  connected—for example, an alias, capitalization variant, or possible typo.
  A candidate does not merge entities or rewrite the source. Its score ranks
  lexical similarity and is not a probability.
- **Domain profile:** a proposed list of the entity types, traits,
  relationships, state dimensions, and validators that appear useful for one
  kind of material. A profile inferred from uploaded text stays inactive until
  it is reviewed and versioned for that project.
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
- **Scope receipt:** a small machine-readable record binding a public repository,
  pinned commit, selected project, and returned excerpts. It prevents the next
  tool call from accidentally adding, dropping, changing, or mixing files. It
  is an integrity check, not proof that a file is authoritative canon.
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

A later repository integration could turn insights from Continuity Lab into a precursor for 
autonomous game development, although this requires further testing and study. Continuity Lab would first
offer several canon-compatible feature plans. Each plan would include its story
purpose, affected files and state, tests, art requirements, estimated review
risk, and unresolved assumptions. Only the creator-approved plan would be sent
to a coding or asset agent. The resulting branch would then be re-ingested and
audited before a person promotes it.

At team or enterprise scale, the same protocol can support roles, approvals,
private repositories, policy-owned source authority, change histories, review
queues, and audit receipts. The model and agent can vary by organization; the
stable layer is the evidence, entity, proof, proposal, approval, and revision
protocol. 

This is a roadmap, not a capability claimed by the current MVP.

## How I collaborated with Codex

This project was developed as a long-running collaboration between the product
owner and Codex rather than as a single generated application.

As noted in the Readme for Vibe Code Simulator, Codex was crucial in accelerating the workflow for developing my projects, and without it, many things would not even have been possible. indeed, without Codex's GPT Image-2, the assets for this project would not have been possible, but neither would the process for generating assets manifests, because I would not have known about IDs or otherwise had I not asked about what constituted a good structure to create game assets and to iterate on that process through rapid iteration on a timed schedule and multiple overnight passes, which in turn were processes that I proposed and tested in collaboration with Codex. It is true that Codex articulated a large number of things, including architectures, structures, and also domain knowledge, which I proceeded to integrate with my personal sensitivities and awareness of the problems, but much of this would not have been possible if not for the interplay of thinking, receiving rapid feedback, and iteration that Codex and GPT-6 made possible.

### Specific contributions by GPT-5.6 Sol

- It abstracted lessons and patterns learned from a prior project (Slap The Heavens manhwa generator - discussed in introduction video) into a new and generalizable architecture, and was able to articulate these patterns in a way that I could work with them in implementing
the project architecture.
- It converted repeated manual continuity checks into an evidence compiler, authority router, dependency reasoning layer, reviewed adapters, upload and
  GitHub boundaries, MCP tools, security checks, and regression tests.
- It conducted experiments and extensive red teaming, was subjected to a wide variety of challenges under a mixture of conditions, and wrote reports and drafted visualizations about how it had been tor... Tested! 
- It compared naive model use with structured routing, recorded failures, and iterated on the architecture instead of treating a persuasive answer as proof
  that the system worked.
- It built and repeatedly revised the site, deployment path, documentation, and
  evaluation runner while keeping the reviewed architecture and sealed test
  candidate separate from presentation-only changes.
- It built MCP server architecture, created the logo for it, and eventually also assisted with the coordination of the implementation of this project as an MCP server. 

### Decisions made by the product owner

The product owner set the core direction and repeatedly corrected the system
when it became too narrow or too technical. Important decisions included:

- Testing naive ChatGPT versus Continuity Lab to ascertain to what extent gains were made through architecture as opposed to the general multimodal intellectual capacity of GPT 5.6 Sol, and 
to what extent it would be possible to make improvements over GPT 5.6's performance. 
- Keeping Vibe Code Simulator as a compelling worked example;
- Scoping Continuity Lab for future generalizability in the direction of autonomous game or narrative development, by proposing architectural decisions like file uploads, repositories, ChatGPT/MCP use, causality, and future visual
  audits part of one interoperable architecture;
- Decisions to test the security of ChatGPT, to observe drift, and to take action in order to codify the development of Continuity Lab as a human in the loop.


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
  When a question is about a repository as a whole, the compiler accepts the
  excerpts only with `sourceContext.kind=public_github_excerpts` and the
  unchanged scope receipt returned by the repository inspector. A direct
  upload remains the lightweight default and needs no repository receipt.
  The response also contains `identityLinks`, which reports possible aliases,
  spelling variants, case variants, surface-name collisions, and cross-source
  identifier reuse without applying a merge. Code symbols can be marked
  `case_sensitive_symbol`, so `createCharacter` and `CreateCharacter` remain
  distinct unless parser or reviewed rename evidence connects them.
  `domainProfile` is a separate schema-on-read proposal. It derives
  evidence-bearing candidate parameters and validators from the submitted
  packet, but every item remains inactive and requires review.
  A second call may submit `knowledgeReview` with the exact returned
  fingerprints and deterministic candidate IDs. The resulting
  `reviewedKnowledge` receipt records accepted aliases, misspellings, distinct
  entities, approved parameters, and approved validators without changing the
  original mentions. `knowledgeSnapshot` binds the documents and all four
  machine-readable packages so a later run can identify new, changed, and
  unchanged inputs. The keyless MCP does not authenticate the claimed reviewer
  or persist these receipts; a team must commit them to a governed repository
  or store them through an authenticated workspace.
- `continuity_inspect_public_repository` is one current acquisition connector.
  It pins a public GitHub repository to one commit, discovers independent
  project roots and declared evidence domains, and then returns a small safe
  set of question-relevant excerpts from one selected scope. If a generic
  question could refer to several projects, it returns the choices and asks
  ChatGPT to call it again with `projectScope`. Selection then uses safe path
  and question clues to look first for likely intent sources—story bibles,
  canon files, contracts, decision records, and specifications—and then for
  relevant implementation and tests. ChatGPT can pass those excerpts into
  `continuity_compile_material`, together with the returned scope receipt, for
  exact entity, conflict, or causal inspection. The compiler rejects changed
  excerpts and files from another scope. Scope declarations and filenames are
  routing clues; they do not
  approve a repository file as project canon. Future authenticated
  repositories, document parsers, databases, ledgers, and media-description
  adapters can feed the same compiler boundary without changing the underlying
  truth model.

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

The phrase “this repository” is deliberately insufficient at the connector
boundary. The MCP cannot reliably know whether it means the repository hosting
Continuity Lab, a nested Vibe Code Simulator example, the surrounding Slap the
Heavens working tree, or another repository visible to ChatGPT. Supply the
public URL. Repository inspection returns a selected-scope receipt, and exact
compilation must carry that receipt forward unchanged. The receipt is
deterministic and unsigned: it catches accidental mixing and mutation, but it
does not authenticate a caller or grant canon authority.

The MCP itself accepts text packets, not raw binary attachments. TXT, Markdown,
JSON, YAML, XML, CSV/TSV, and extracted text from other formats work when the
client can read them. PDF, DOCX, PPTX, XLSX, screenshots, and scans require the
client or a future parser/vision adapter to extract relevant text first. If a
page is unreadable, a quote cannot be located, or two candidates cannot be
resolved confidently, the receipt says so; it does not invent an entity. The
HTTP MCP request is capped at 32 KiB, so large manuscripts should be narrowed
to question-relevant excerpts rather than copied wholesale.

### Keys, subscriptions, and current limits

The five MCP tools are currently project-stateless, read-only, and declared
`noauth`. They do not persist submitted project material, reviewed canon
decisions, or conversational memory, although the public repository inspector
does retain service-level rate-limit accounting. They make no OpenAI API call.
This means a user's ChatGPT subscription can
provide the conversational reasoning while the MCP performs deterministic
verification; this path does not require you or the user to put an OpenAI API
key into this application.

That does not turn a ChatGPT subscription into API credit. The persisted
arbitrary-workspace retrieval/query route and presenter-owned API script still
need a server-side `OPENAI_API_KEY`. The current public page does not expose a
paid live-model control. ChatGPT also does not forward a custom API key to an
MCP server, as explained in the [Apps SDK authentication
guide](https://developers.openai.com/apps-sdk/build/auth). A future direct API
or bring-your-own-key mode would therefore be a separate, encrypted credential
and billing design—not a text field in a tool call. Private GitHub access will
likewise require a scoped GitHub OAuth/App flow; it must not reuse an OpenAI
credential.

This is not yet a durable whole-corpus knowledge graph, alternative-path solver, or automatic natural-language
causality theorem prover that exposes an API interoperable with modern game development. The v3.8 snapshot is a portable integrity receipt and
incremental comparison boundary, not hidden server memory. Public GitHub
excerpts remain question-scoped, so a missing excerpt is never reported as a
deleted repository fact.

Future versions of Continuity Lab could evolve from a question-answering tool into a durable protocol for agentic development across long-running narrative projects.
Instead of treating every request as an isolated interaction, Continuity Lab could maintain a versioned project workspace containing its sources, entities, relationships, rules, decisions, unresolved questions, and causal dependencies. 
New files and repository commits could update this workspace incrementally rather than requiring the entire project to be reconstructed for every question.
This would extend the current project-stateless public MCP into explicit, auditable project memory—not hidden conversational memory. Every stored conclusion would remain tied to its source, revision, confidence, authority, and approval status. 
The system could distinguish established canon from implementation state, proposals, abandoned ideas, historical versions, and unresolved contradictions.

### Router v3.8 compatibility

The public transport negotiates current and supported legacy MCP protocol
versions, and its stable data contract remains `continuity.mcp.v1`.
Authority-router version `3.8.0` is advertised separately
as namespaced tool metadata, so router changes do not rename tools or alter
stable output contracts. The three v3.2 reviewed-sample tools keep their existing names,
inputs, and output shape; v3.3 added the two context tools, v3.4 added a
server-authored proof contract and target-prioritized context capsule, and v3.5
added project-boundary resolution before repository retrieval. Version 3.6
adds an evidence-bearing `entityPackage` to the upload compiler result while
retaining the compact `entities` array used by older consumers. The package
separates canonical candidates from their exact source occurrences and includes
the controlled ontology, ambiguity sets, provenance, and deterministic QA
receipt needed for machine handoff. It never promotes an upload to project
canon. Version 3.7 adds separate `identityLinks` and `domainProfile` receipts.
Both are additive and proposal-only: identity candidates cannot merge entities,
and inferred parameters cannot become governing project schema. Ordinary names
retain the v3.6 matching behavior; callers may opt exact code symbols or opaque
registry values into stricter identity profiles. The public
repository tool has an optional `projectScope` input and now returns the scope
receipt that the compiler requires for repository-wide questions;
version 3.8 adds `reviewedKnowledge` and `knowledgeSnapshot`. Reviews are
fingerprint-bound second-pass inputs. They cannot rewrite source evidence,
merge different explicit IDs, or treat code spelling as binding evidence.
Snapshots compare immutable document and package fingerprints while preserving
an open project-corpus boundary. Both fields are additive; callers that omit
review and snapshot inputs retain the v3.7 behavior. The five tool names and v1
contract remain stable. Tests exercise
initialization, all five descriptors, the original VCS calls, exact upload
verification, anonymous commit pinning, and the $47,000 regression. Clients
should branch on advertised capabilities and `contractVersion`, not parse the
router version from prose.

### Machine-readable entity handoff

`continuity_compile_material` returns two entity views. `entities` is the
compact compatibility view. `entityPackage` uses
`continuity.entity-package.v1`, the evidence-bearing v3.6 view for an agent or
data pipeline. It contains:

- `entities`: source-scoped resolved entities and unresolved candidates;
- `mentions`: every accepted surface occurrence with document ID, exact quote,
  locator, evidence fingerprint, and zero-based half-open UTF-16 offsets;
- `ambiguitySets`: same-surface candidates that must not be merged silently;
- `relations`: admitted exact-span source assertions between claims;
- `ontology`: a small controlled top-level vocabulary with project-specific
  meaning retained in subtypes;
- `provenance`: source fingerprints, router/context versions, and coverage;
  and
- `qa`: structural and semantic invariants, unresolved identities, rejected
  proposals, and explicit automatic-action limits.

The QA receipt distinguishes “validly serialized” from “safe to merge.” Even a
package with no structural failures remains unsafe for automatic identity
merging when ambiguity, unresolved mentions, source disagreement, or rejected
proposals remain. Every upload remains unsafe for automatic project-canon
promotion because packet-relative assertions are not approval.

### Alias, typo, and parameter proposals

`identityLinks` uses `continuity.identity-links.v1`. It compares only accepted,
exact-span entity occurrences and may report same-surface ambiguity, case or
format variants, token reordering, possible typos, lexical near matches,
surface collisions, or cross-source identifier reuse. Every candidate retains
the evidence mentions on both sides, a deterministic heuristic ranking,
reasons, contraindications, and `safeToApplyAutomatically: false`. The source
spelling is never corrected silently. Established alias groups appear only
when the same exact source-scoped identifier already bound their occurrences.

`domainProfile` uses `continuity.domain-profile.v1`. It proposes candidate
entity subtypes, exact source predicates, temporal axes, relationship types,
and corresponding validators. It keeps the small universal continuity kernel
fixed while allowing story, game, code, production, or operational material to
suggest the dimensions that matter locally. The proposal covers only the
submitted packet and question. It is never proof of an exhaustive corpus
ontology and always returns `activated: false` and
`safeForAutomaticActivation: false`.

### Review decisions and long-running snapshots

The first compile call is discovery. It returns stable identity-link,
parameter, and validator IDs. After a person reviews them, the client can repeat
the same compile call with a `knowledgeReview` envelope bound to the exact
`identityLinks.packageFingerprint` and `domainProfile.profileFingerprint`.
The review vocabulary distinguishes same entity, alias, misspelling, former
name, title, translation, related concept, distinct entities, and rejected
candidate. Different visible IDs cannot be joined through this lexical path.
Case-sensitive symbols and opaque identifiers require a `parser_binding`
basis. Fabricated evidence references and stale fingerprints fail closed.

The receipt remains caller-attested because the public MCP uses no
authentication. Consequently it is useful as a transparent reviewed
projection but reports `projectCanon: false` and remains unsafe for unattended
canon mutation. A repository maintainer can make it durable by storing the
review envelope and returned receipt in an approved project path. The current
public MCP does not automatically discover or apply that record later; a client
must explicitly load and resubmit it. A future
authenticated workspace can attach actual reviewer identity and approval
policy without changing the evidence or decision formats.

`knowledgeSnapshot` uses `continuity.knowledge-snapshot.v1`. It records the
source boundary, document fingerprints, entity package, identity links, domain
profile, and reviewed-knowledge fingerprint. Supplying the previous receipt
identifies reusable unchanged documents plus new and changed inputs. A caller
may request removal comparison only for a direct-upload packet it declares
complete. Repository excerpts always remain a delta, even between pinned
commits, because question-focused retrieval is not a complete tree index.

### Runtime shape

- `/api/continuity/query` (`app/api/continuity/query/route.ts`): revision-pinned multi-lane retrieval,
  query-scoped exact-span claim/entity compilation, typed authority and
  citation-use validation, server-owned transition proof when a compiled graph
  exists, and sealed GPT-5.6 synthesis
- `/api/continuity/sources` (`app/api/continuity/sources/route.ts`): immutable uploaded source versions with a
  server-validated narrative/reference/proposal document type
- `/api/continuity/repositories` (`app/api/continuity/repositories/route.ts`): commit-pinned GitHub snapshot sync and status
- `/api/mcp` (hosted transport) and `/mcp` (direct-worker compatibility):
  project-stateless read-only MCP transport for the immutable reviewed VCS
  sample, exact-span text packets, and bounded anonymous public-GitHub excerpts;
  it does not expose arbitrary persisted or private workspaces; service-level
  quota accounting is persisted separately
- D1: project, source, snapshot, provider-binding, and analysis records
- R2: uploaded bytes, repository blobs, manifests, and retrieval packets
- OpenAI vector stores: replaceable retrieval projections, isolated per repository snapshot

The sample answer is a reviewed deterministic demonstration. The underlying
query route can run the same bounded evidence scope through GPT-5.6 Sol when
server credentials and trusted ingress are configured, but that paid live-run
control is not currently exposed on the public page.

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

- **Upload and paste:** the public demonstration receives files through ChatGPT,
  which passes bounded relevant text to the MCP. Separately, the authenticated
  persisted-source backend can accept up to 12 files per browser selection, but
  that upload form is not currently exposed on the public Build Week site. PDF
  and Office are operator-only previews.
- **Entity resolution:** exact-span, question-scoped candidates with cited
  ambiguity, available through both the persisted query flow and the project-stateless
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
- **MCP:** an executable project-stateless `/api/mcp` hosted transport for five read-only
  tools, with `/mcp` retained for compatible direct-worker and local hosts:
  three over `vcs-demo-r2`, one exact-span text-packet compiler, and one bounded
  anonymous public-GitHub inspector with pre-retrieval project-scope discovery.
  It retains service-level quota accounting but not submitted project material.
  Authenticated persisted/private workspaces and resource handlers are not
  implemented.

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

An analyzed repository may suggest project scopes and source routes in
`continuity.config.json`, but it cannot promote itself to immutable authority,
hide independently discovered project roots, or issue a completeness boundary.
A generic question over several possible scopes stops for selection instead of
merging them. Stronger
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

The persisted upload backend accepts UTF-8 TXT/MD/Markdown/HTML/JSON/YAML/XML/CSV/TSV. An
explicitly allowlisted operator may also preview PDF, DOC/DOCX, and
PPTX ingestion. File signatures are verified; Office archives receive entry
and decompression limits; obvious text credentials are rejected before
storage. Binary-document contents are not yet credential-scanned, so ordinary
hosted users are refused. “Indexed” means the provider accepted the file, not
that every page or entity was readable. The application does not independently
determine whether a PDF is searchable or image-only. Scanned and image-only PDFs
are therefore unsupported for reliable evidence extraction and may yield no
usable evidence. Screenshots, standalone images, XLS/XLSX, EPUB, and RTF are
rejected by the current persisted-upload policy. Paste or upload a text
description instead; OCR and region-grounded image ingestion are future adapters.

Historical evaluations found that architectural additions did not automatically
improve answer quality. v3.3 scored below the historical baseline. v3.4 improved
the retrospective benchmark but did not pass the original five-percentage-point
superiority gate. v3.8 remained broadly comparable with the baseline across its
retrospective and direct-API evaluations. These results support specific
improvements in evidence structure, project scoping, entity handoff, and claim
verification, but they do not establish broad model-quality superiority, lower
provider cost, faster answers, or external validity across arbitrary projects.
A genuinely new blind multi-domain holdout is still required before making those
claims. See the versioned evaluation post-mortems for scores, limitations, and
failure analysis.

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

