import { REPOSITORY_SCOPE_RECEIPT_JSON_SCHEMA } from "./repository-scope-receipt";
import { PREVIOUS_KNOWLEDGE_SNAPSHOT_INPUT_SCHEMA } from "./knowledge-snapshot";
import { REVIEWED_KNOWLEDGE_INPUT_JSON_SCHEMA } from "./reviewed-knowledge";

/**
 * Transport-neutral contract shared by the reviewed-sample MCP transport and
 * future authenticated workspace transports. Provider identifiers never
 * appear in these public resources or tool inputs.
 */
export const CONTINUITY_MCP_CONTRACT_VERSION = "continuity.mcp.v1" as const;

export const continuityResources = {
  revision: (projectId: string, revisionId: string) =>
    `continuity://projects/${encodeURIComponent(projectId)}/revisions/${encodeURIComponent(revisionId)}`,
  sourceVersion: (projectId: string, sourceId: string, versionId: string) =>
    `continuity://projects/${encodeURIComponent(projectId)}/sources/${encodeURIComponent(sourceId)}/versions/${encodeURIComponent(versionId)}`,
  evidence: (projectId: string, fragmentId: string) =>
    `continuity://projects/${encodeURIComponent(projectId)}/evidence/${encodeURIComponent(fragmentId)}`,
  entity: (projectId: string, entityId: string) =>
    `continuity://projects/${encodeURIComponent(projectId)}/entities/${encodeURIComponent(entityId)}`,
  analysis: (projectId: string, analysisId: string) =>
    `continuity://projects/${encodeURIComponent(projectId)}/analyses/${encodeURIComponent(analysisId)}`,
  repositorySnapshot: (projectId: string, snapshotId: string) =>
    `continuity://projects/${encodeURIComponent(projectId)}/repository-snapshots/${encodeURIComponent(snapshotId)}`,
} as const;
const projectRevisionInput = {
  type: "object",
  additionalProperties: false,
  maxProperties: 5,
  required: ["projectId", "projectRevision"],
  properties: {
    projectId: { type: "string", minLength: 1, maxLength: 128, pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$" },
    projectRevision: { type: "string", minLength: 1, maxLength: 128 },
  },
} as const;

export const continuityMcpTools = {
  search: {
    description: "Compatibility search over one pinned project revision. Results are evidence candidates, never truth claims.",
    inputSchema: {
      ...projectRevisionInput,
      required: [...projectRevisionInput.required, "query"],
      properties: { ...projectRevisionInput.properties, query: { type: "string", minLength: 1, maxLength: 8_000 }, limit: { type: "integer", minimum: 1, maximum: 50 } },
    },
  },
  fetch: {
    description: "Fetch one exact source excerpt from a pinned project revision using a source ID and optional locator.",
    inputSchema: {
      ...projectRevisionInput,
      required: [...projectRevisionInput.required, "sourceId"],
      properties: {
        ...projectRevisionInput.properties,
        sourceId: { type: "string", minLength: 1, maxLength: 128 },
        locator: { type: "string", minLength: 1, maxLength: 240 },
      },
    },
  },
  continuity_get_repository_snapshot: {
    description: "Inspect the active commit-pinned repository manifest, coverage, and omitted paths without fetching GitHub again.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["projectId"],
      properties: {
        projectId: { type: "string", minLength: 1, maxLength: 128, pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$" },
        snapshotId: { type: "string", minLength: 1, maxLength: 128 },
      },
    },
  },
  continuity_search_evidence: {
    description: "Find revision-pinned source fragments without interpreting them as truth.",
    inputSchema: {
      ...projectRevisionInput,
      required: [...projectRevisionInput.required, "query"],
      properties: { ...projectRevisionInput.properties, query: { type: "string", minLength: 1, maxLength: 8_000 }, limit: { type: "integer", minimum: 1, maximum: 50 } },
    },
  },
  continuity_answer_question: {
    description: "Answer a question about the immutable reviewed Vibe Code Simulator example only, with typed verdicts, stable citations, and explicit coverage. Do not use this tool for an arbitrary folder or repository; inspect that repository or compile the supplied material instead.",
    inputSchema: {
      ...projectRevisionInput,
      required: [...projectRevisionInput.required, "question"],
      properties: {
        ...projectRevisionInput.properties,
        question: { type: "string", minLength: 1, maxLength: 8_000 },
        timeScope: { type: ["string", "null"], maxLength: 240 },
        contextRefs: { type: "array", items: { type: "string", minLength: 1, maxLength: 240 }, maxItems: 20, uniqueItems: true },
      },
    },
  },
  continuity_trace_dependencies: {
    description: "Trace evidence-backed requirements, effects, blockers, and reachability inside the immutable reviewed Vibe Code Simulator example only.",
    inputSchema: {
      ...projectRevisionInput,
      required: [...projectRevisionInput.required, "targetRef"],
      properties: { ...projectRevisionInput.properties, targetRef: { type: "string", minLength: 1, maxLength: 8_000 }, timeScope: { type: ["string", "null"], maxLength: 240 } },
    },
  },
  continuity_analyze_change: {
    description: "Simulate a proposed change to the immutable reviewed Vibe Code Simulator example without promoting it to canon.",
    inputSchema: {
      ...projectRevisionInput,
      required: [...projectRevisionInput.required, "change"],
      properties: { ...projectRevisionInput.properties, change: { type: "string", minLength: 1, maxLength: 8_000 }, contextRefs: { type: "array", items: { type: "string", minLength: 1, maxLength: 240 }, maxItems: 20, uniqueItems: true } },
    },
  },
  continuity_compile_material: {
    description: "Use after the user uploads or pastes material, or after continuity_inspect_public_repository returns bounded excerpts and a scope receipt. Verify ChatGPT-proposed exact surface spans, entity mentions, and optional evidence-bound relations; preserve ambiguity and source disagreement; and return a bounded context receipt, evidence-bearing entities, suggest-only identity links, an inactive domain-profile proposal, a reviewed-knowledge receipt, and a reusable snapshot receipt. Claim subject, predicate, and any non-empty object must be copied byte-for-byte from the quote in that order; an empty object requires frameArity intransitive and one terminal predicate token. A relation requires an exact cue and two accepted endpoint spans inside one accepted supporting claim. The first call proposes deterministic candidate IDs. A later call may resubmit the unchanged material with knowledgeReview bound to the returned identity and domain fingerprints. Reviewed decisions never rewrite source mentions, different explicit IDs cannot be merged lexically, code symbols require parser-binding evidence, and caller-attested review is not authenticated project canon. previousSnapshot enables bounded change comparison; repository excerpts never imply removal from the full repository. Repository-wide questions require sourceContext kind public_github_excerpts and the unchanged receipt. The tool remains keyless and does not persist decisions itself.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["question", "documents"],
      properties: {
        question: { type: "string", minLength: 1, maxLength: 8_000 },
        sourceContext: {
          type: "object",
          additionalProperties: false,
          required: ["kind"],
          properties: {
            kind: { type: "string", enum: ["direct_upload", "public_github_excerpts"] },
            receipt: REPOSITORY_SCOPE_RECEIPT_JSON_SCHEMA,
          },
        },
        documents: {
          type: "array",
          minItems: 1,
          maxItems: 8,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["name", "text"],
            properties: {
              name: { type: "string", minLength: 1, maxLength: 240 },
              text: { type: "string", maxLength: 20_000 },
              authority: { type: "string", enum: ["reference", "proposal", "production_record"] },
            },
          },
        },
        claims: {
          type: "array",
          maxItems: 64,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["documentName", "quote", "claimKind", "subject", "predicate", "object", "polarity"],
            properties: {
              documentName: { type: "string", minLength: 1, maxLength: 240 },
              quote: { type: "string", minLength: 1, maxLength: 8_192 },
              occurrence: { type: "integer", minimum: 1 },
              claimKind: {
                type: "string", minLength: 1, maxLength: 64, pattern: "^[A-Za-z][A-Za-z0-9_-]{0,63}$",
                description: "A source-assertion category such as observed, normative, historical, or causal. It does not promote the claim to project truth.",
              },
              subject: {
                type: "string", minLength: 1, maxLength: 512,
                description: "Copy this byte-for-byte from the exact quote.",
              },
              predicate: {
                type: "string", minLength: 1, maxLength: 512,
                description: "Copy this byte-for-byte from the exact quote after the subject; do not normalize or paraphrase it.",
              },
              object: {
                type: "string", minLength: 0, maxLength: 512,
                description: "Copy a non-empty value byte-for-byte from the quote after the predicate. Use exactly the empty string only with frameArity intransitive when the predicate finishes the quoted clause.",
              },
              frameArity: {
                type: "string", enum: ["transitive", "intransitive"],
                description: "Optional for backward compatibility with non-empty transitive frames. Set to intransitive only with object \"\" and one copied terminal predicate token, for example subject 'Test T9', predicate 'passed' from 'Test T9 passed.' Never discard an expressed object.",
              },
              polarity: {
                type: "string", enum: ["positive", "negative"],
                description: "Use negative only when the exact quote directly negates this atomic claim; otherwise use positive.",
              },
              temporal: {
                type: ["object", "null"],
                additionalProperties: false,
                required: ["marker", "axis", "from"],
                description: "Optional verified simple ordinal. The exact marker must occur uniquely in the quote and normalize to the supplied axis and number. Omit this field for dates, SemVer, ranges, or domain orderings that require a trusted adapter.",
                properties: {
                  marker: { type: "string", minLength: 1, maxLength: 120 },
                  axis: { type: "string", minLength: 1, maxLength: 64, pattern: "^[A-Za-z][A-Za-z0-9_-]{0,63}$" },
                  from: { type: "integer", minimum: 0, maximum: 1_000_000_000 },
                  to: { type: "integer", minimum: 0, maximum: 1_000_000_000 },
                },
              },
            },
          },
        },
        entityMentions: {
          type: "array",
          maxItems: 64,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["documentName", "quote", "mention"],
            properties: {
              documentName: { type: "string", minLength: 1, maxLength: 240 },
              quote: { type: "string", minLength: 1, maxLength: 8_192 },
              quoteOccurrence: { type: "integer", minimum: 1 },
              mention: { type: "string", minLength: 1, maxLength: 512 },
              mentionOccurrence: { type: "integer", minimum: 1 },
              entityType: { type: "string", minLength: 1, maxLength: 512 },
              identityProfile: {
                type: "string", enum: ["natural_language", "case_sensitive_symbol", "opaque_identifier"],
                description: "Optional matching boundary. Use case_sensitive_symbol for code symbols and opaque_identifier for registry values. Omit for ordinary names. This affects candidate comparison but never authorizes an automatic merge.",
              },
              explicitId: {
                type: "string", minLength: 1, maxLength: 512,
                description: "Optional. Supply only when this exact identifier occurs byte-for-byte inside the entity quote; otherwise omit it.",
              },
            },
          },
        },
        relations: {
          type: "array",
          maxItems: 64,
          description: "Optional exact-evidence-bound causal or temporal links. Indices refer to the original claims array. These source-assertion edges support navigation, not deterministic reachability proof.",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["relation", "evidenceClaimIndex", "fromClaimIndex", "toClaimIndex", "cue"],
            properties: {
              relation: {
                type: "string", enum: ["precondition", "consequence", "temporal_before"],
                description: "Direction is fixed: prerequisite to dependent, trigger to effect, or earlier to later.",
              },
              evidenceClaimIndex: {
                type: "integer", minimum: 0,
                description: "Index of an accepted positive causal, normative, or historical claim whose exact span states the relation.",
              },
              fromClaimIndex: { type: "integer", minimum: 0, description: "Index of the accepted source endpoint claim." },
              toClaimIndex: { type: "integer", minimum: 0, description: "Index of the accepted destination endpoint claim." },
              cue: {
                type: "string", minLength: 1, maxLength: 512,
                description: "Copy the relationship cue byte-for-byte from the supporting claim quote, for example 'only after', 'causes', or 'before'.",
              },
              cueOccurrence: { type: "integer", minimum: 1 },
            },
          },
        },
        knowledgeReview: REVIEWED_KNOWLEDGE_INPUT_JSON_SCHEMA,
        previousSnapshot: PREVIOUS_KNOWLEDGE_SNAPSHOT_INPUT_SCHEMA,
        snapshotMode: {
          type: "string", enum: ["delta_packet", "complete_packet"],
          description: "Use complete_packet only when the submitted direct-upload documents are the complete managed packet. Public GitHub excerpts are always treated as a delta and never prove removals.",
        },
      },
    },
  },
  continuity_inspect_public_repository: {
    description: "Use for any question about a public GitHub repository. An explicit GitHub URL or owner/repository value is required; if the user says only 'this repository', ask them for the URL instead of using ambient ChatGPT or Codex files. Discover independent project roots and declared evidence domains before selecting excerpts. If there are multiple project scopes, return the named choices and ask the user to select one with projectScope. After scope resolution, pin one immutable commit and return a small safe set of question-relevant excerpts plus a scope receipt. For exact entity or causal verification, pass the excerpts and unchanged receipt to continuity_compile_material. Private repositories are not accessed.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["repository", "question"],
      properties: {
        repository: { type: "string", minLength: 3, maxLength: 240 },
        question: { type: "string", minLength: 1, maxLength: 4_096 },
        requestedRef: { type: "string", minLength: 1, maxLength: 200 },
        projectScope: { type: "string", minLength: 1, maxLength: 240 },
      },
    },
  },
} as const;
