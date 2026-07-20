/**
 * Transport-neutral contract for a future Continuity Lab MCP server.
 * Provider identifiers never appear in these public resources or tool inputs.
 */
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
  required: ["projectId", "projectRevision"],
  properties: {
    projectId: { type: "string", minLength: 1 },
    projectRevision: { type: "string", minLength: 1 },
  },
} as const;

export const continuityMcpTools = {
  search: {
    description: "Compatibility search over one pinned project revision. Results are evidence candidates, never truth claims.",
    inputSchema: {
      ...projectRevisionInput,
      required: [...projectRevisionInput.required, "query"],
      properties: { ...projectRevisionInput.properties, query: { type: "string", minLength: 1 }, limit: { type: "integer", minimum: 1, maximum: 50 } },
    },
  },
  fetch: {
    description: "Fetch one exact source excerpt from a pinned project revision using a source ID and optional locator.",
    inputSchema: {
      ...projectRevisionInput,
      required: [...projectRevisionInput.required, "sourceId"],
      properties: {
        ...projectRevisionInput.properties,
        sourceId: { type: "string", minLength: 1 },
        locator: { type: "string", minLength: 1 },
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
        projectId: { type: "string", minLength: 1 },
        snapshotId: { type: "string", minLength: 1 },
      },
    },
  },
  continuity_search_evidence: {
    description: "Find revision-pinned source fragments without interpreting them as truth.",
    inputSchema: {
      ...projectRevisionInput,
      required: [...projectRevisionInput.required, "query"],
      properties: { ...projectRevisionInput.properties, query: { type: "string", minLength: 1 }, limit: { type: "integer", minimum: 1, maximum: 50 } },
    },
  },
  continuity_answer_question: {
    description: "Answer a continuity question with typed verdicts, stable citations, and explicit coverage.",
    inputSchema: {
      ...projectRevisionInput,
      required: [...projectRevisionInput.required, "question"],
      properties: {
        ...projectRevisionInput.properties,
        question: { type: "string", minLength: 1 },
        timeScope: { type: ["string", "null"] },
        contextRefs: { type: "array", items: { type: "string" }, maxItems: 20 },
      },
    },
  },
  continuity_trace_dependencies: {
    description: "Trace evidence-backed requirements, effects, blockers, and reachability for a goal or event.",
    inputSchema: {
      ...projectRevisionInput,
      required: [...projectRevisionInput.required, "targetRef"],
      properties: { ...projectRevisionInput.properties, targetRef: { type: "string", minLength: 1 }, timeScope: { type: ["string", "null"] } },
    },
  },
  continuity_analyze_change: {
    description: "Simulate a proposed change without promoting it to canon.",
    inputSchema: {
      ...projectRevisionInput,
      required: [...projectRevisionInput.required, "change"],
      properties: { ...projectRevisionInput.properties, change: { type: "string", minLength: 1 }, contextRefs: { type: "array", items: { type: "string" } } },
    },
  },
} as const;
