# Entity-resolution evaluation post-mortem

## Result

The independent evaluation of two resolutions of *The Man Who Was Thursday*
did not establish one universal winner. One weighting gave Continuity Lab a
small overall lead; another gave the comparison workbook a small lead. Both
assessments agreed on the actionable pattern:

- Continuity Lab was more cautious and accurate on identity and ambiguity;
- the comparison was easier to inspect as a finished data product; and
- neither output supplied a complete occurrence-level machine contract.

The sample is one public-domain novel, so its percentages are rubric-score
differences rather than statistically measured reductions in error. It is a
useful regression case, not proof of broad superiority.

## What the previous output did well

The previous resolver kept uncertain identities unresolved, preserved nuanced
status distinctions, avoided the tested false alias attribution, and serialized
its result as a simple CSV. Those choices reduce the most expensive failure for
an acting agent: contaminating one entity with another entity's facts.

## What the previous output did poorly

The exported CSV flattened information already available inside the exact-span
compiler:

1. an entity and an occurrence of its name were not separate records;
2. exact source offsets, quotes, and source fingerprints were not exposed per
   mention;
3. highly specific flat type labels lacked a portable parent ontology;
4. no machine-readable QA receipt proved identifiers, aliases, spans, and
   unresolved candidates were internally consistent; and
5. the output did not state whether another agent was permitted to merge or
   promote its results automatically.

Visual workbook formatting is not required for machine-to-machine use. Stable
schema, exact provenance, controlled values, uncertainty, and enforceable QA
are required.

## What v3.6 changes

Version 3.6 adds `continuity.entity-package.v1` to the upload compiler response.
It exposes evidence-bearing mentions, source-scoped entity candidates,
ambiguity sets, a controlled ontology, provenance, and deterministic QA while
retaining the existing compact entity view.

The pass also corrects one grouping edge case: repeated mentions carrying the
same exact identifier inside the same source no longer become ambiguous merely
because there is more than one occurrence. Unresolved repeated names, different
exact IDs, and apparent IDs owned by different sources remain separate.

## What v3.6 deliberately does not claim

- It does not improve corpus-wide recall by itself.
- It does not infer that contextual titles, pronouns, metonyms, or allusions are
  aliases without identity evidence.
- It does not make packet-relative uploaded statements project canon.
- It does not make an incomplete extraction complete.
- It does not replace a human-readable answer with raw JSON.

## Follow-up in v3.7

Version 3.7 addresses the next identity boundary without weakening v3.6.
Possible aliases, spelling mistakes, code-case variants, and lexical near
matches are emitted in a separate suggest-only identity-link package. Exact
source forms remain immutable, scores are explicitly uncalibrated, and no link
can apply itself. A second inactive domain-profile receipt proposes only the
parameters evidenced in the submitted packet. This keeps entity resolution,
schema discovery, and project approval as separate decisions.

## Follow-up in v3.8

Version 3.8 turns deterministic proposals into a fingerprint-bound review
receipt. It records accepted aliases, misspellings, distinct entities, approved
parameters, and approved validators while retaining the original occurrence
table unchanged. Different explicit IDs cannot be merged through lexical
review, code symbols require a parser-binding basis, and stale or fabricated
references are rejected.

The implementation pass also caught a genuine generalization defect in the
v3.7 parameter heuristic: `pay` matched the resource vocabulary while the
ordinary inflection `pays` did not. The fix covers common verb inflections at
the shared classifier and is tested through both VCS-shaped and unrelated
material. It was not patched as a one-sentence exception.

The new snapshot receipt improves machine handoff and incremental comparison,
but it does not change the evaluation standard. A future benchmark should
score reviewed resolution separately from raw proposal quality and should
penalize stale-review acceptance, explicit-ID merges, unauthenticated canon
promotion, and false deletion claims.

## Next sealed evaluation

Freeze the resolver, source packets, rubric, and run order before comparing the
flat export with the v3.6 package. Use the original novel only as a regression
case and add unseen material from a second narrative, a mixed game repository,
and a non-story operational corpus. Report false merges and false splits
separately, then score mention precision/recall, ambiguity calibration, exact
span reproduction, provenance completeness, schema validation, runtime, and
cost. Preserve every raw response and do not tune against the holdout failures
until the run has closed.
