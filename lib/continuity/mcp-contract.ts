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
    description: "Answer a continuity question with typed verdicts, stable citations, and explicit coverage.",
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
    description: "Trace evidence-backed requirements, effects, blockers, and reachability for a goal or event.",
    inputSchema: {
      ...projectRevisionInput,
      required: [...projectRevisionInput.required, "targetRef"],
      properties: { ...projectRevisionInput.properties, targetRef: { type: "string", minLength: 1, maxLength: 8_000 }, timeScope: { type: ["string", "null"], maxLength: 240 } },
    },
  },
  continuity_analyze_change: {
    description: "Simulate a proposed change without promoting it to canon.",
    inputSchema: {
      ...projectRevisionInput,
      required: [...projectRevisionInput.required, "change"],
      properties: { ...projectRevisionInput.properties, change: { type: "string", minLength: 1, maxLength: 8_000 }, contextRefs: { type: "array", items: { type: "string", minLength: 1, maxLength: 240 }, maxItems: 20, uniqueItems: true } },
    },
  },
  continuity_compile_material: {
    description: "Use after the user uploads or pastes material. Verify ChatGPT-proposed exact spans and entity mentions, preserve ambiguity and source disagreement, and return a bounded question-scoped context receipt. The tool is stateless, keyless, and never promotes uploaded text to project canon.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["question", "documents"],
      properties: {
        question: { type: "string", minLength: 1, maxLength: 8_000 },
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
              claimKind: { type: "string", minLength: 1, maxLength: 64, pattern: "^[A-Za-z][A-Za-z0-9_-]{0,63}$" },
              subject: { type: "string", minLength: 1, maxLength: 512 },
              predicate: { type: "string", minLength: 1, maxLength: 512 },
              object: { type: "string", minLength: 1, maxLength: 512 },
              polarity: { type: "string", enum: ["positive", "negative"] },
              temporal: {
                type: ["object", "null"],
                additionalProperties: false,
                required: ["axis", "from"],
                properties: {
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
              explicitId: { type: "string", minLength: 1, maxLength: 512 },
            },
          },
        },
      },
    },
  },
  continuity_inspect_public_repository: {
    description: "Use when the user supplies a public GitHub repository and a canon question. Resolve one immutable commit and return a small safe set of question-relevant excerpts. For exact entity or causal verification, pass those excerpts to continuity_compile_material. Private repositories are not accessed.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["repository", "question"],
      properties: {
        repository: { type: "string", minLength: 3, maxLength: 240 },
        question: { type: "string", minLength: 1, maxLength: 4_096 },
        requestedRef: { type: "string", minLength: 1, maxLength: 200 },
      },
    },
  },
} as const;
