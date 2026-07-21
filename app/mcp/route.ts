import {
  AUTHORITY_ROUTER_VERSION,
  type ClaimKind,
  type EvidenceChunk,
  type QueryRequest,
  type QueryResult,
} from "@/lib/continuity/contracts";
import {
  demoTargetClaimKeys,
  DemoReachabilityEvaluator,
  DemoReasoner,
  DemoRetriever,
  VCS_DEMO_COMPLETENESS_REGISTRY,
  VCS_DEMO_PROJECT_ID,
  VCS_DEMO_REVISION,
} from "@/lib/continuity/demo";
import { VCS_DEMO_TIME_SCOPE } from "@/lib/continuity/demo-questions";
import { ContinuityEngine, ContinuityInputError } from "@/lib/continuity/engine";
import {
  buildContinuityEntityPackage,
  ENTITY_PACKAGE_JSON_SCHEMA,
  ENTITY_PACKAGE_VERSION,
} from "@/lib/continuity/entity-package";
import {
  buildIdentityLinkPackage,
  IDENTITY_LINK_PACKAGE_JSON_SCHEMA,
  IDENTITY_LINK_PACKAGE_VERSION,
} from "@/lib/continuity/identity-link-package";
import {
  buildDomainProfileProposal,
  DOMAIN_PROFILE_JSON_SCHEMA,
  DOMAIN_PROFILE_VERSION,
} from "@/lib/continuity/domain-profile";
import { ConnectorExecutionBudget } from "@/lib/continuity/http/connector-execution";
import { guardRequestBody, readJsonBodyBounded, RequestBodyError } from "@/lib/continuity/http/security";
import {
  buildMcpContextPacket,
  inspectPublicGitHubRepository,
  McpContextError,
  type McpContextInput,
} from "@/lib/continuity/mcp-context";
import { CONTINUITY_MCP_CONTRACT_VERSION, continuityMcpTools } from "@/lib/continuity/mcp-contract";
import {
  buildQuestionGraph,
  planQuestionGraphUse,
  queryQuestionGraph,
  type QuestionGraphQueryResult,
} from "@/lib/continuity/question-graph";
import { GitHubRepositoryProvider, RepositoryProviderError } from "@/lib/continuity/repositories/github";
import {
  buildRepositoryScopeReceipt,
  questionRequiresRepositoryScope,
  REPOSITORY_SCOPE_RECEIPT_JSON_SCHEMA,
  validateRepositoryScopeReceipt,
  type RepositoryScopeReceipt,
} from "@/lib/continuity/repository-scope-receipt";
import { ContinuityRepository } from "@/lib/continuity/storage/repository";

export const runtime = "edge";

// Keep the transport compatible with current and older MCP clients. The
// protocol requires version negotiation during initialize; pinning this route
// to one client version makes discovery fail as soon as ChatGPT or Inspector
// advances to a newer supported release.
const LATEST_MCP_PROTOCOL_VERSION = "2025-11-25";
const SUPPORTED_MCP_PROTOCOL_VERSIONS = Object.freeze([
  LATEST_MCP_PROTOCOL_VERSION,
  "2025-06-18",
  "2025-03-26",
  "2024-11-05",
  "2024-10-07",
]);
const MAX_BODY_BYTES = 32 * 1024;
const MAX_TEXT_LENGTH = 8_000;
const MAX_CONTEXT_REFS = 20;
const PUBLIC_REPOSITORY_DEADLINE_MS = 20_000;
const PUBLIC_REPOSITORY_MAX_CALLS = 8;
const PUBLIC_REPOSITORY_MAX_CONCURRENT_PER_ISOLATE = 2;
const PUBLIC_REPOSITORY_USAGE_WINDOW_SECONDS = 24 * 60 * 60;
const DEFAULT_PUBLIC_REPOSITORY_DAILY_LIMIT = 50;
let publicRepositoryCallsInFlight = 0;
const PROJECT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const EXPOSED_TOOL_NAMES = [
  "continuity_answer_question",
  "continuity_trace_dependencies",
  "continuity_analyze_change",
  "continuity_compile_material",
  "continuity_inspect_public_repository",
] as const;
type ExposedToolName = typeof EXPOSED_TOOL_NAMES[number];
type ReviewedToolName = Extract<ExposedToolName,
  "continuity_answer_question" | "continuity_trace_dependencies" | "continuity_analyze_change">;
type ContextToolName = Exclude<ExposedToolName, ReviewedToolName>;
type JsonRpcId = string | number | null;
type JsonObject = Record<string, unknown>;
type McpRuntimeEnv = {
  DB?: D1Database;
  MCP_PUBLIC_REPOSITORY_DAILY_LIMIT?: string;
};

const demoEngine = new ContinuityEngine(
  new DemoRetriever(),
  new DemoReasoner(),
  undefined,
  undefined,
  new DemoReachabilityEvaluator(),
  VCS_DEMO_COMPLETENESS_REGISTRY,
);

const REVIEWED_COVERAGE = Object.freeze({
  scope: `The complete reviewed Vibe Code Simulator example and configured transition registry at ${VCS_DEMO_REVISION}.`,
  complete: true,
  excludedSources: [] as string[],
});

const TOOL_ANNOTATIONS = Object.freeze({
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
});
const NOAUTH_SECURITY_SCHEMES = Object.freeze([{ type: "noauth" as const }]);

const TOOL_TITLES: Record<ExposedToolName, string> = {
  continuity_answer_question: "Ask about the Vibe Code Simulator example",
  continuity_trace_dependencies: "Trace Vibe Code Simulator dependencies",
  continuity_analyze_change: "Analyze a Vibe Code Simulator change",
  continuity_compile_material: "Verify uploaded or pasted material",
  continuity_inspect_public_repository: "Ask about a public GitHub repository",
};

const REVIEWED_TOOL_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "projectId", "projectRevision", "mode", "verdict", "truthStatus", "answer",
    "confidence", "coverage", "citations", "entities", "dependencies", "reachability", "proposal",
  ],
  properties: {
    projectId: { type: "string" },
    projectRevision: { type: "string" },
    mode: { type: "string", enum: ["demonstration"] },
    verdict: { type: "string", enum: ["SUPPORTED", "CONFLICT", "AMBIGUOUS", "UNREACHABLE", "INSUFFICIENT_EVIDENCE", "PROPOSAL"] },
    truthStatus: { type: "string", enum: ["supported", "source_assertion", "proposed", "contradicted", "ambiguous", "conflicted", "unknown", "superseded"] },
    answer: { type: "string" },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    coverage: {
      type: "object",
      additionalProperties: false,
      required: ["closure", "scope"],
      properties: {
        closure: { type: "string", enum: ["closed", "partial", "open"] },
        scope: { type: "string" },
      },
    },
    citations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["sourceId", "locator", "stance", "supports"],
        properties: {
          sourceId: { type: "string" },
          locator: { type: "string" },
          stance: { type: "string", enum: ["supports", "opposes", "context"] },
          supports: { type: "string" },
        },
      },
    },
    entities: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "name", "type", "resolution"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          type: { type: "string" },
          resolution: { type: "string", enum: ["resolved", "candidate", "ambiguous"] },
        },
      },
    },
    dependencies: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["from", "to", "relation", "status", "claimKey"],
        properties: {
          from: { type: "string" },
          to: { type: "string" },
          relation: { type: "string" },
          status: { type: "string" },
          claimKey: { type: "string" },
        },
      },
    },
    reachability: {
      type: ["object", "null"],
      additionalProperties: false,
      required: ["status", "blockers", "path", "assumptions"],
      properties: {
        status: { type: "string", enum: ["reachable", "conditionally_reachable", "unreachable_within_scope", "unknown", "not_evaluated"] },
        blockers: { type: "array", items: { type: "string" } },
        path: { type: "array", items: { type: "string" } },
        assumptions: { type: "array", items: { type: "string" } },
      },
    },
    proposal: {
      type: ["object", "null"],
      additionalProperties: false,
      required: ["summary", "assumptions", "requiredChanges", "downstreamRisks"],
      properties: {
        summary: { type: "string" },
        assumptions: { type: "array", items: { type: "string" } },
        requiredChanges: { type: "array", items: { type: "string" } },
        downstreamRisks: { type: "array", items: { type: "string" } },
      },
    },
  },
} as const;

const CONTEXT_TOOL_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "contractVersion", "routerVersion", "sourceKind", "sourceContext", "question", "route",
    "coverage", "claims", "entities", "entityPackage", "identityLinks", "domainProfile", "relations", "conflicts", "graph", "rejected", "diagnostics",
  ],
  properties: {
    contractVersion: { type: "string", enum: [CONTINUITY_MCP_CONTRACT_VERSION] },
    routerVersion: { type: "string", enum: [AUTHORITY_ROUTER_VERSION] },
    sourceKind: { type: "string", enum: ["uploaded_text", "public_github_excerpts"] },
    sourceContext: {
      type: "object",
      additionalProperties: false,
      required: ["kind", "repository", "pinnedCommit", "scope"],
      properties: {
        kind: { type: "string", enum: ["direct_upload", "public_github_excerpts"] },
        repository: { type: ["string", "null"] },
        pinnedCommit: { type: ["string", "null"] },
        scope: {
          type: ["object", "null"],
          additionalProperties: false,
          required: ["id", "label", "rootPath"],
          properties: { id: { type: "string" }, label: { type: "string" }, rootPath: { type: "string" } },
        },
      },
    },
    question: { type: "string" },
    route: {
      type: "object",
      additionalProperties: false,
      required: ["path", "graphUsed", "validators", "reason"],
      properties: {
        path: { type: "string", enum: ["direct_lookup", "question_graph"] },
        graphUsed: { type: "boolean" },
        validators: { type: "array", items: { type: "string" } },
        reason: { type: "string" },
      },
    },
    coverage: {
      type: "object",
      additionalProperties: false,
      required: ["packetMembership", "proposalVerification", "completeForProjectCorpus"],
      properties: {
        packetMembership: { type: "string", enum: ["closed"] },
        proposalVerification: { type: "string", enum: ["closed", "partial"] },
        completeForProjectCorpus: { type: "boolean", enum: [false] },
      },
    },
    claims: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "documentId", "quote", "locator", "claimKind", "claimKey", "polarity", "temporal", "authority", "truthStatus"],
        properties: {
          id: { type: "string" }, documentId: { type: "string" }, quote: { type: "string" }, locator: { type: "string" },
          claimKind: { type: "string" }, claimKey: { type: "string" }, polarity: { type: "string", enum: ["positive", "negative"] },
          temporal: { type: ["object", "null"] },
          authority: { type: "string", enum: ["reference", "proposal", "production_record"] },
          truthStatus: { type: "string", enum: ["source_assertion"] },
        },
      },
    },
    entities: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "mention", "type", "resolution", "locator", "authority"],
        properties: {
          id: { type: "string" }, mention: { type: "string" }, type: { type: "string" },
          resolution: { type: "string", enum: ["resolved", "candidate", "ambiguous"] }, locator: { type: "string" },
          authority: { type: "string", enum: ["reference", "proposal", "production_record"] },
        },
      },
    },
    entityPackage: ENTITY_PACKAGE_JSON_SCHEMA,
    identityLinks: IDENTITY_LINK_PACKAGE_JSON_SCHEMA,
    domainProfile: DOMAIN_PROFILE_JSON_SCHEMA,
    relations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "relation", "evidenceClaimId", "fromClaimId", "toClaimId", "cue", "cueStart", "cueEnd", "truthStatus", "materialized"],
        properties: {
          id: { type: "string" },
          relation: { type: "string", enum: ["precondition", "consequence", "temporal_before"] },
          evidenceClaimId: { type: "string" }, fromClaimId: { type: "string" }, toClaimId: { type: "string" }, cue: { type: "string" },
          cueStart: { type: "integer" }, cueEnd: { type: "integer" },
          truthStatus: { type: "string", enum: ["source_assertion"] }, materialized: { type: "boolean", enum: [true] },
        },
      },
    },
    conflicts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "claimKey", "status", "positiveClaimIds", "negativeClaimIds"],
        properties: {
          id: { type: "string" }, claimKey: { type: "string" }, status: { type: "string", enum: ["source_disagreement"] },
          positiveClaimIds: { type: "array", items: { type: "string" } }, negativeClaimIds: { type: "array", items: { type: "string" } },
        },
      },
    },
    graph: {
      type: ["object", "null"],
      additionalProperties: false,
      required: ["version", "nodes", "edges", "receipt"],
      properties: {
        version: { type: "string", enum: ["continuity.question-graph.v1"] },
        nodes: { type: "array", items: { type: "object" } },
        edges: { type: "array", items: { type: "object" } },
        receipt: { type: "object" },
      },
    },
    rejected: { type: "array", items: { type: "object" } },
    diagnostics: { type: "array", items: { type: "string" } },
  },
} as const;

const REPOSITORY_TOOL_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "contractVersion", "routerVersion", "sourceKind", "question", "repository",
    "requestedRef", "pinnedCommit", "scope", "scopeReceipt", "coverage", "excerpts", "omitted", "usage", "diagnostics",
  ],
  properties: {
    contractVersion: { type: "string", enum: [CONTINUITY_MCP_CONTRACT_VERSION] },
    routerVersion: { type: "string", enum: [AUTHORITY_ROUTER_VERSION] },
    sourceKind: { type: "string", enum: ["public_github"] },
    question: { type: "string" }, repository: { type: "string" }, requestedRef: { type: "string" }, pinnedCommit: { type: "string" },
    scope: {
      type: "object",
      additionalProperties: false,
      required: ["status", "selected", "candidates", "requestedScope", "reason"],
      properties: {
        status: { type: "string", enum: ["resolved", "ambiguous", "not_found"] },
        selected: {
          type: ["object", "null"],
          additionalProperties: false,
          required: ["id", "label", "rootPath", "kind", "origin", "signals"],
          properties: {
            id: { type: "string" }, label: { type: "string" }, rootPath: { type: "string" },
            kind: { type: "string", enum: ["product", "story", "example", "fixture", "subtree"] },
            origin: { type: "string", enum: ["repository_declared", "discovered", "explicit_subtree"] },
            signals: { type: "array", items: { type: "string" } },
          },
        },
        candidates: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "label", "rootPath", "kind", "origin", "signals"],
            properties: {
              id: { type: "string" }, label: { type: "string" }, rootPath: { type: "string" },
              kind: { type: "string", enum: ["product", "story", "example", "fixture", "subtree"] },
              origin: { type: "string", enum: ["repository_declared", "discovered", "explicit_subtree"] },
              signals: { type: "array", items: { type: "string" } },
            },
          },
        },
        requestedScope: { type: ["string", "null"] },
        reason: { type: "string" },
      },
    },
    scopeReceipt: { ...REPOSITORY_SCOPE_RECEIPT_JSON_SCHEMA, type: ["object", "null"] },
    coverage: {
      type: "object",
      additionalProperties: false,
      required: ["membershipPinned", "treeComplete", "semanticClosure", "completeForProjectTruth", "reasons"],
      properties: {
        membershipPinned: { type: "boolean", enum: [true] }, treeComplete: { type: "boolean" },
        semanticClosure: { type: "string", enum: ["partial", "open"] }, completeForProjectTruth: { type: "boolean", enum: [false] },
        reasons: { type: "array", items: { type: "string" } },
      },
    },
    excerpts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "path", "locator", "text", "relevanceScore"],
        properties: {
          id: { type: "string" }, path: { type: "string" }, locator: { type: "string" }, text: { type: "string" }, relevanceScore: { type: "number" },
        },
      },
    },
    omitted: { type: "array", items: { type: "object" } },
    usage: {
      type: "object", additionalProperties: false, required: ["providerCalls", "filesRead", "bytesRead", "excerptBytes"],
      properties: {
        providerCalls: { type: "integer" }, filesRead: { type: "integer" }, bytesRead: { type: "integer" }, excerptBytes: { type: "integer" },
      },
    },
    diagnostics: { type: "array", items: { type: "string" } },
  },
} as const;

function outputSchemaFor(name: ExposedToolName) {
  if (name === "continuity_compile_material") return CONTEXT_TOOL_OUTPUT_SCHEMA;
  if (name === "continuity_inspect_public_repository") return REPOSITORY_TOOL_OUTPUT_SCHEMA;
  return REVIEWED_TOOL_OUTPUT_SCHEMA;
}

function isContextTool(name: ExposedToolName): name is ContextToolName {
  return name === "continuity_compile_material" || name === "continuity_inspect_public_repository";
}

function annotationsFor(name: ExposedToolName) {
  return name === "continuity_inspect_public_repository"
    ? { ...TOOL_ANNOTATIONS, idempotentHint: false, openWorldHint: true }
    : TOOL_ANNOTATIONS;
}

export async function POST(request: Request): Promise<Response> {
  const guard = guardRequestBody(request, { kind: "json", maxBytes: MAX_BODY_BYTES });
  if (guard) return withNoStore(guard);

  let payload: unknown;
  try {
    payload = await readJsonBodyBounded(request, MAX_BODY_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return rpcError(
        null,
        error.status === 413 ? -32600 : -32700,
        error.message,
        error.status,
        { code: error.code },
      );
    }
    return rpcError(null, -32700, "The request body must be valid JSON.", 400);
  }

  if (!isRecord(payload)
    || payload.jsonrpc !== "2.0"
    || typeof payload.method !== "string"
    || ("id" in payload && !isJsonRpcId(payload.id))) {
    return rpcError(null, -32600, "Invalid JSON-RPC 2.0 request.", 400);
  }

  const hasId = Object.prototype.hasOwnProperty.call(payload, "id");
  const id = hasId ? payload.id as JsonRpcId : null;

  if (payload.method === "initialize") {
    if (!hasId) return rpcError(null, -32600, "initialize must be a JSON-RPC request with an id.", 400);
    const suppliedHeader = request.headers.get("MCP-Protocol-Version")?.trim();
    if (suppliedHeader && !isSupportedProtocolVersion(suppliedHeader)) {
      return rpcError(id, -32600, unsupportedProtocolMessage(suppliedHeader), 400);
    }
    const initializeError = validateInitializeParams(payload.params);
    if (initializeError) return rpcError(id, -32602, initializeError, 400);
    const protocolVersion = negotiateProtocolVersion(payload.params);
    return rpcResult(id, {
      protocolVersion,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "continuity-lab", version: "0.3.0" },
      instructions: "Read-only, stateless continuity tools. The three reviewed-example tools apply only to the immutable Vibe Code Simulator example; they never synchronize a repository and must never answer what is true in an arbitrary folder, repository, or project. Never treat ambient ChatGPT attachments, Codex working-directory files, or the phrase 'this repository' as a repository selected through Continuity Lab. If a repository question lacks an explicit public GitHub URL or owner/repository value, ask the user for it. For any public GitHub repository question, call continuity_inspect_public_repository first. If it returns multiple project scopes, ask the user which named scope they mean and call it again with projectScope; never blend scopes. After resolution, pass the returned excerpts unchanged to continuity_compile_material with sourceContext kind public_github_excerpts and the returned scopeReceipt. For uploaded or pasted material, use sourceContext kind direct_upload, read only question-relevant text, propose exact quotes and entity mentions to continuity_compile_material, then answer from the verified receipt; rejected or absent claims remain unknown. In each claim, copy subject, predicate, and any non-empty object byte-for-byte from the quote in that order. Use frameArity intransitive with object \"\" only for a single copied predicate token that finishes the quoted clause; never discard an expressed object. Mark polarity negative only when the quote directly negates the claim. Omit explicitId unless that exact ID occurs in the entity quote. Use identityProfile case_sensitive_symbol for code symbols and opaque_identifier only for exact registry values. claimKind classifies a source assertion and never grants authority. For causal structure, optionally propose relations by original claim index: the supporting positive causal, normative, or historical claim must contain the exact cue and both accepted endpoint spans. Direction is prerequisite to dependent, trigger to effect, or earlier to later. Do not materialize negative, or/unless, or alternative-path logic as a simple edge; admitted edges aid navigation and are not reachability proofs. For downstream machine use, prefer entityPackage and obey its ambiguity sets and QA action-safety flags. identityLinks are suggest-only lexical candidates with uncalibrated scores; never apply them automatically. domainProfile is an inactive schema-on-read proposal; never treat its parameters or validators as governing until reviewed. A scope receipt is an integrity binding, not authentication or canon authority. Neither path promotes source assertions to project canon. Change analyses are proposals and never become canon.",
    });
  }

  const protocolError = validateProtocolHeader(request);
  if (protocolError) return rpcError(id, -32600, protocolError, 400);

  if (payload.method === "notifications/initialized") {
    if (hasId || !validEmptyParams(payload.params)) {
      return rpcError(id, -32602, "notifications/initialized must be an id-less notification with no parameters.", 400);
    }
    return notificationAccepted();
  }
  if (!hasId) return notificationAccepted();

  if (payload.method === "ping") {
    if (!validEmptyParams(payload.params)) return rpcError(id, -32602, "ping accepts no parameters.", 400);
    return rpcResult(id, {});
  }

  if (payload.method === "tools/list") {
    if (!validToolsListParams(payload.params)) {
      return rpcError(id, -32602, "tools/list accepts no cursor for this single-page tool catalog.", 400);
    }
    return rpcResult(id, {
      tools: EXPOSED_TOOL_NAMES.map((name) => ({
        name,
        title: TOOL_TITLES[name],
        description: continuityMcpTools[name].description,
        inputSchema: exposedInputSchema(name),
        outputSchema: outputSchemaFor(name),
        annotations: annotationsFor(name),
        securitySchemes: NOAUTH_SECURITY_SCHEMES,
        _meta: {
          securitySchemes: NOAUTH_SECURITY_SCHEMES,
          "continuity/contractVersion": CONTINUITY_MCP_CONTRACT_VERSION,
          "continuity/routerVersion": AUTHORITY_ROUTER_VERSION,
          ...(name === "continuity_compile_material"
            ? {
                "continuity/entityPackageVersion": ENTITY_PACKAGE_VERSION,
                "continuity/identityLinkPackageVersion": IDENTITY_LINK_PACKAGE_VERSION,
                "continuity/domainProfileVersion": DOMAIN_PROFILE_VERSION,
              }
            : {}),
        },
      })),
    });
  }

  if (payload.method === "tools/call") {
    if (!isRecord(payload.params)
      || typeof payload.params.name !== "string"
      || !EXPOSED_TOOL_NAMES.includes(payload.params.name as ExposedToolName)
      || !isRecord(payload.params.arguments)) {
      return rpcError(id, -32602, "tools/call requires one advertised tool name and an arguments object.", 400);
    }
    const name = payload.params.name as ExposedToolName;
    const argumentsValue = payload.params.arguments;
    if (isContextTool(name)) {
      const inputError = validateContextToolArguments(name, argumentsValue);
      if (inputError) return rpcResult(id, toolError("invalid_arguments", inputError));
      if (name === "continuity_inspect_public_repository") {
        const budgetError = await publicRepositoryBudgetError(request);
        if (budgetError) return rpcResult(id, budgetError);
      }
      try {
        const result = name === "continuity_compile_material"
          ? compileMaterialTool(argumentsValue)
          : await inspectRepositoryTool(argumentsValue);
        return rpcResult(id, result);
      } catch (error) {
        const code = error instanceof McpContextError
          ? error.code
          : error instanceof RepositoryProviderError
            ? `repository_${error.code}`
            : "context_preparation_failed";
        const message = publicContextError(error);
        return rpcResult(id, toolError(code, message));
      }
    }

    const reviewedArguments = withReviewedSampleDefaults(argumentsValue);
    const inputError = validateToolArguments(name, reviewedArguments);
    if (inputError) return rpcResult(id, toolError("invalid_arguments", inputError));

    const scopeError = reviewedScopeError(reviewedArguments);
    if (scopeError) return rpcResult(id, scopeError);

    try {
      const result = await demoEngine.query(queryForTool(name, reviewedArguments));
      return rpcResult(id, toolSuccess(result));
    } catch (error) {
      const message = error instanceof ContinuityInputError
        ? error.message
        : "The deterministic reviewed-sample analysis could not complete.";
      return rpcResult(id, toolError("analysis_failed", message));
    }
  }

  return rpcError(id, -32601, `Method ${payload.method} is not supported by this stateless MCP transport.`, 404);
}

function exposedInputSchema(name: ExposedToolName) {
  if (isContextTool(name)) return continuityMcpTools[name].inputSchema;
  const schema = continuityMcpTools[name].inputSchema;

  // These three tools are deliberately pinned to one immutable reviewed
  // sample. Keep accepting the explicit v1 scope fields, but make a natural
  // tool call reliable by supplying the only values this transport permits.
  return {
    ...schema,
    required: schema.required.filter((key) => key !== "projectId" && key !== "projectRevision"),
    properties: {
      ...schema.properties,
      projectId: {
        ...schema.properties.projectId,
        const: VCS_DEMO_PROJECT_ID,
        default: VCS_DEMO_PROJECT_ID,
      },
      projectRevision: {
        ...schema.properties.projectRevision,
        const: VCS_DEMO_REVISION,
        default: VCS_DEMO_REVISION,
      },
    },
  };
}

function withReviewedSampleDefaults(input: JsonObject): JsonObject {
  return {
    ...input,
    ...(!Object.hasOwn(input, "projectId") ? { projectId: VCS_DEMO_PROJECT_ID } : {}),
    ...(!Object.hasOwn(input, "projectRevision") ? { projectRevision: VCS_DEMO_REVISION } : {}),
  };
}

function queryForTool(name: ReviewedToolName, input: JsonObject): QueryRequest {
  const common = {
    projectId: VCS_DEMO_PROJECT_ID,
    projectRevision: VCS_DEMO_REVISION,
    coverage: REVIEWED_COVERAGE,
  };
  if (name === "continuity_answer_question") {
    const question = (input.question as string).trim();
    const targetClaimKeys = demoTargetClaimKeys(question);
    return {
      ...common,
      question,
      analysisMode: targetClaimKeys.length ? "trace_dependencies" : "answer_question",
      timeScope: optionalTrimmedString(input.timeScope, 240)
        ?? (targetClaimKeys.length ? VCS_DEMO_TIME_SCOPE : null),
      ...(targetClaimKeys.length ? {
        temporalAxis: "day",
        storyPosition: 8,
        targetPosition: 8,
      } : {}),
      contextRefs: cleanContextRefs(input.contextRefs),
      targetClaimKeys,
    };
  }
  if (name === "continuity_trace_dependencies") {
    const targetRef = (input.targetRef as string).trim();
    const question = `Trace dependencies for ${targetRef}`;
    const explicitDay = targetRef.match(/\bday[\s_:#-]*(\d+(?:\.\d+)?)\b/i)?.[1];
    const targetPosition = explicitDay ? Number(explicitDay) : 8;
    return {
      ...common,
      question,
      analysisMode: "trace_dependencies",
      timeScope: optionalTrimmedString(input.timeScope, 240)
        ?? VCS_DEMO_TIME_SCOPE,
      temporalAxis: "day",
      storyPosition: 8,
      targetPosition,
      targetClaimKeys: demoTargetClaimKeys(question),
    };
  }
  const change = (input.change as string).trim();
  const question = `Analyze proposed change: ${change}`;
  return {
    ...common,
    question,
    proposedChange: change,
    analysisMode: "evaluate_change",
    timeScope: VCS_DEMO_TIME_SCOPE,
    temporalAxis: "day",
    storyPosition: 8,
    targetPosition: 8,
    contextRefs: cleanContextRefs(input.contextRefs),
    targetClaimKeys: demoTargetClaimKeys(question, change),
  };
}

function validateContextToolArguments(name: ContextToolName, input: JsonObject): string | null {
  const allowed = name === "continuity_compile_material"
    ? new Set(["question", "sourceContext", "documents", "claims", "entityMentions", "relations"])
    : new Set(["repository", "question", "requestedRef", "projectScope"]);
  const unexpected = Object.keys(input).filter((key) => !allowed.has(key));
  if (unexpected.length) return `Unexpected argument${unexpected.length === 1 ? "" : "s"}: ${unexpected.join(", ")}.`;
  if (typeof input.question !== "string" || !input.question.trim()) return "question is required.";
  const questionLimit = name === "continuity_compile_material" ? MAX_TEXT_LENGTH : 4_096;
  if (new TextEncoder().encode(input.question).byteLength > questionLimit) {
    return `question exceeds ${questionLimit} UTF-8 bytes.`;
  }
  if (name === "continuity_compile_material") {
    if (!Array.isArray(input.documents) || input.documents.length < 1) return "documents must be a non-empty array.";
    if (input.sourceContext !== undefined) {
      if (!isRecord(input.sourceContext)) return "sourceContext must be an object.";
      const contextKeys = Object.keys(input.sourceContext);
      const unexpectedContextKeys = contextKeys.filter((key) => key !== "kind" && key !== "receipt");
      if (unexpectedContextKeys.length) return `Unexpected sourceContext argument${unexpectedContextKeys.length === 1 ? "" : "s"}: ${unexpectedContextKeys.join(", ")}.`;
      if (input.sourceContext.kind !== "direct_upload" && input.sourceContext.kind !== "public_github_excerpts") {
        return "sourceContext.kind must be direct_upload or public_github_excerpts.";
      }
      if (input.sourceContext.kind === "direct_upload" && input.sourceContext.receipt !== undefined) {
        return "Direct uploads must not include a repository scope receipt.";
      }
      if (input.sourceContext.kind === "public_github_excerpts" && input.sourceContext.receipt === undefined) {
        return "Public GitHub excerpts require the scope receipt returned by continuity_inspect_public_repository.";
      }
    }
    return null;
  }
  if (typeof input.repository !== "string" || !input.repository.trim() || input.repository.length > 240) {
    return "repository must be a bounded owner/repository value or canonical GitHub URL.";
  }
  if (input.requestedRef !== undefined
    && (typeof input.requestedRef !== "string" || !input.requestedRef.trim() || input.requestedRef.length > 200)) {
    return "requestedRef must be a non-empty string no longer than 200 characters.";
  }
  if (input.projectScope !== undefined
    && (typeof input.projectScope !== "string" || !input.projectScope.trim() || input.projectScope.length > 240)) {
    return "projectScope must be a non-empty scope ID or repository-relative path no longer than 240 characters.";
  }
  return null;
}

function compileMaterialTool(input: JsonObject) {
  const question = (input.question as string).trim();
  const suppliedContext = isRecord(input.sourceContext) ? input.sourceContext : undefined;
  const sourceMode = suppliedContext?.kind === "public_github_excerpts"
    ? "public_github_excerpts" as const
    : "direct_upload" as const;
  if (questionRequiresRepositoryScope(question) && sourceMode !== "public_github_excerpts") {
    throw new McpContextError(
      "A repository-wide question requires an explicit public GitHub repository and selected project scope. Call continuity_inspect_public_repository first; do not infer ‘this repository’ from ambient ChatGPT or Codex context.",
      "repository_scope_receipt_required",
    );
  }
  let repositoryReceipt: RepositoryScopeReceipt | null = null;
  if (sourceMode === "public_github_excerpts") {
    const documents = (input.documents as unknown[]).map((document) => isRecord(document)
      ? { name: typeof document.name === "string" ? document.name : "", text: typeof document.text === "string" ? document.text : "" }
      : { name: "", text: "" });
    const validation = validateRepositoryScopeReceipt(suppliedContext?.receipt, documents);
    if (!validation.ok) {
      throw new McpContextError(validation.message, "repository_scope_mismatch");
    }
    repositoryReceipt = validation.receipt;
  }
  const packet = buildMcpContextPacket({
    documents: input.documents,
    claims: input.claims,
    entityMentions: input.entityMentions,
    relations: input.relations,
  } as McpContextInput);
  const route = planQuestionGraphUse(question);
  const evidence = packetEvidence(packet);
  let graph: QuestionGraphQueryResult | null = null;
  if (route.useGraph && evidence.length) {
    const compiledGraph = buildQuestionGraph({
      projectId: "mcp-upload-packet",
      projectRevision: packet.documents.map((document) => document.contentFingerprint).join(":"),
      evidence,
      semanticEdges: packet.relations.map((relation) => ({
        evidenceId: relation.evidenceClaimId,
        fromEvidenceId: relation.fromClaimId,
        toEvidenceId: relation.toClaimId,
        cue: relation.cue,
        cueStart: relation.cueStart,
        cueEnd: relation.cueEnd,
        relation: relation.relation,
      })),
      coverage: {
        scope: "verified claims in the submitted packet",
        closure: "open",
        trustedComplete: false,
        truncated: packet.proposalCoverage.closure === "partial",
        failures: [],
        deferredEvidenceIds: [],
        deferredSources: [],
        excludedSources: [],
      },
    });
    graph = queryQuestionGraph(compiledGraph, { question });
  }
  const groupResolution = new Map(packet.entityCandidateGroups.flatMap((group) =>
    group.candidateIds.map((candidateId) => [candidateId, group.resolution] as const)));
  const entityPackage = buildContinuityEntityPackage(packet);
  const identityLinks = buildIdentityLinkPackage(packet, entityPackage);
  const domainProfile = buildDomainProfileProposal(packet, entityPackage, question);
  const structuredContent = {
    contractVersion: CONTINUITY_MCP_CONTRACT_VERSION,
    routerVersion: AUTHORITY_ROUTER_VERSION,
    sourceKind: sourceMode === "public_github_excerpts" ? "public_github_excerpts" as const : "uploaded_text" as const,
    sourceContext: repositoryReceipt
      ? {
          kind: sourceMode,
          repository: repositoryReceipt.repository,
          pinnedCommit: repositoryReceipt.pinnedCommit,
          scope: repositoryReceipt.scope,
        }
      : { kind: sourceMode, repository: null, pinnedCommit: null, scope: null },
    question,
    route: {
      path: route.path,
      graphUsed: graph !== null,
      validators: [
        "input_and_instruction_boundary",
        "exact_span_and_entity_boundary",
        "authority_and_coverage_boundary",
        ...(graph ? ["bounded_question_graph"] : []),
      ],
      reason: route.reason,
    },
    coverage: {
      packetMembership: packet.membershipCoverage.closure,
      proposalVerification: packet.proposalCoverage.closure,
      completeForProjectCorpus: false as const,
    },
    claims: packet.claims.map((claim) => ({
      id: claim.id,
      documentId: claim.documentId,
      quote: claim.quote,
      locator: claim.locator,
      claimKind: claim.claimKind,
      claimKey: claim.claimKey,
      polarity: claim.polarity,
      temporal: claim.temporal,
      authority: claim.authority.level,
      truthStatus: claim.truthStatus,
    })),
    entities: packet.entityCandidates.map((candidate) => ({
      id: candidate.id,
      mention: candidate.mention,
      type: candidate.entityType,
      resolution: entityResolution(groupResolution.get(candidate.id)),
      locator: candidate.locator,
      authority: candidate.authority.level,
    })),
    entityPackage,
    identityLinks,
    domainProfile,
    relations: packet.relations,
    conflicts: packet.conflicts.map((conflict) => ({
      id: conflict.id,
      claimKey: conflict.claimKey,
      status: conflict.status,
      positiveClaimIds: conflict.positiveClaimIds,
      negativeClaimIds: conflict.negativeClaimIds,
    })),
    graph,
    rejected: packet.rejectedProposals,
    diagnostics: [
      ...packet.diagnostics,
      ...(packet.claims.length ? [] : ["No exact-span claim was verified; answer only from the visible source text or ask for a narrower extraction."]),
      ...(route.useGraph && !graph ? ["The question called for graph reasoning, but no verified atomic claim was available to admit into the graph."] : []),
    ],
  };
  return {
    content: [{
      type: "text",
      text: `Prepared ${structuredContent.claims.length} verified claim(s), ${structuredContent.entities.length} entity candidate(s), and ${structuredContent.relations.length} exact-span relation(s). Entity package ${entityPackage.version} contains ${entityPackage.mentions.length} evidence-bearing mention(s), ${entityPackage.ambiguitySets.length} ambiguity set(s), and ${entityPackage.qa.warnings} QA warning(s). Identity review found ${identityLinks.candidateLinks.length} suggest-only link candidate(s); domain profile ${domainProfile.version} proposed ${domainProfile.candidateParameters.length} inactive parameter(s). Project-corpus coverage remains open.`,
    }],
    structuredContent,
    isError: false,
  };
}

async function inspectRepositoryTool(input: JsonObject) {
  if (publicRepositoryCallsInFlight >= PUBLIC_REPOSITORY_MAX_CONCURRENT_PER_ISOLATE) {
    throw new McpContextError("The public repository inspector is at its bounded concurrency limit; try again after an in-flight call completes.", "repository_limit");
  }
  publicRepositoryCallsInFlight += 1;
  let inspection;
  try {
    const executionBudget = new ConnectorExecutionBudget({
      deadlineAt: Date.now() + PUBLIC_REPOSITORY_DEADLINE_MS,
      maxCalls: PUBLIC_REPOSITORY_MAX_CALLS,
    });
    const provider = new GitHubRepositoryProvider({
      timeoutMs: 8_000,
      executionBudget,
    });
    inspection = await inspectPublicGitHubRepository(provider, {
      repository: input.repository as string,
      question: (input.question as string).trim(),
      requestedRef: typeof input.requestedRef === "string" ? input.requestedRef.trim() : undefined,
      projectScope: typeof input.projectScope === "string" ? input.projectScope.trim() : undefined,
      limits: {
        maxTreeEntries: 1_000,
        maxFiles: 6,
        maxProviderCalls: PUBLIC_REPOSITORY_MAX_CALLS,
        maxFileBytes: 96 * 1024,
        maxTotalFileBytes: 384 * 1024,
        maxExcerptBytesPerFile: 4 * 1024,
        maxTotalExcerptBytes: 20 * 1024,
        maxQuestionBytes: 4 * 1024,
      },
    });
  } finally {
    publicRepositoryCallsInFlight = Math.max(0, publicRepositoryCallsInFlight - 1);
  }
  const scopeReceipt = inspection.scope.selected
    ? buildRepositoryScopeReceipt({
        repository: inspection.repository.fullName,
        pinnedCommit: inspection.pinnedCommit,
        scope: {
          id: inspection.scope.selected.id,
          label: inspection.scope.selected.label,
          rootPath: inspection.scope.selected.rootPath,
        },
        excerpts: inspection.excerpts,
      })
    : null;
  const structuredContent = {
    contractVersion: CONTINUITY_MCP_CONTRACT_VERSION,
    routerVersion: AUTHORITY_ROUTER_VERSION,
    sourceKind: "public_github" as const,
    question: inspection.question,
    repository: inspection.repository.fullName,
    requestedRef: inspection.requestedRef,
    pinnedCommit: inspection.pinnedCommit,
    scope: {
      status: inspection.scope.status,
      selected: inspection.scope.selected ? publicScope(inspection.scope.selected) : null,
      candidates: inspection.scope.candidates.map(publicScope),
      requestedScope: inspection.scope.requestedScope,
      reason: inspection.scope.reason,
    },
    scopeReceipt,
    coverage: {
      membershipPinned: inspection.membershipCoverage.pinned,
      treeComplete: inspection.membershipCoverage.treeComplete,
      semanticClosure: inspection.semanticCoverage.closure,
      completeForProjectTruth: inspection.semanticCoverage.completeForProjectTruth,
      reasons: inspection.semanticCoverage.reasons,
    },
    excerpts: inspection.excerpts.map((excerpt) => ({
      id: excerpt.id,
      path: excerpt.path,
      locator: excerpt.locator,
      text: excerpt.text,
      relevanceScore: excerpt.relevanceScore,
    })),
    omitted: inspection.omitted,
    usage: inspection.usage,
    diagnostics: [
      "This was an anonymous read of a public repository; no GitHub or OpenAI credential was accepted or used.",
      "The commit is pinned, but the excerpt set is question-scoped and cannot prove a universal absence in the repository.",
      "For exact entity resolution or causal verification, call continuity_compile_material with the returned excerpts unchanged, sourceContext kind public_github_excerpts, and the returned scopeReceipt.",
      "The scope receipt binds repository, pinned commit, selected project scope, and exact excerpt text. It detects mixing or mutation but is not authentication and grants no canon authority.",
      ...(inspection.scope.candidates.some((candidate) => candidate.origin === "repository_declared")
        ? ["Repository-declared project scopes guide selection only; they do not grant canon authority or complete coverage."]
        : []),
    ],
  };
  const scopeChoice = structuredContent.scope.status === "ambiguous"
    ? `This repository contains multiple possible project scopes: ${structuredContent.scope.candidates.map((candidate) => `${candidate.label} (${candidate.id})`).join(", ")}. Ask the user which one they mean, then call this tool again with projectScope.`
    : structuredContent.scope.status === "not_found"
      ? `The requested project scope was not found. Available scopes: ${structuredContent.scope.candidates.map((candidate) => `${candidate.label} (${candidate.id})`).join(", ") || "none"}.`
      : `Scoped to ${structuredContent.scope.selected?.label ?? "the selected project"}.`;
  return {
    content: [{
      type: "text",
      text: `${scopeChoice} Pinned ${structuredContent.repository} at ${structuredContent.pinnedCommit} and returned ${structuredContent.excerpts.length} bounded excerpt(s); semantic coverage is ${structuredContent.coverage.semanticClosure}.`,
    }],
    structuredContent,
    isError: false,
  };
}

export async function reservePublicRepositoryInspection(
  repository: Pick<ContinuityRepository, "consumeUsage">,
  dailyLimit = DEFAULT_PUBLIC_REPOSITORY_DAILY_LIMIT,
) {
  if (!Number.isSafeInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 500) {
    throw new TypeError("The public repository daily limit must be an integer from 1 through 500.");
  }
  return repository.consumeUsage(
    "global:mcp:public-github",
    "inspect_public_repository",
    dailyLimit,
    PUBLIC_REPOSITORY_USAGE_WINDOW_SECONDS,
  );
}

async function publicRepositoryBudgetError(request: Request) {
  if (isLocalOrTestMcpRequest(request)) return null;
  let bindings: McpRuntimeEnv;
  try {
    const { env } = await import("cloudflare:workers");
    bindings = env as unknown as McpRuntimeEnv;
  } catch {
    return toolError(
      "service_budget_unavailable",
      "The durable public-repository budget is unavailable, so no GitHub request was started.",
    );
  }
  if (!bindings.DB) {
    return toolError(
      "service_budget_unavailable",
      "The durable public-repository budget is not configured, so no GitHub request was started.",
    );
  }
  try {
    const decision = await reservePublicRepositoryInspection(
      new ContinuityRepository(bindings.DB),
      boundedPublicRepositoryDailyLimit(bindings.MCP_PUBLIC_REPOSITORY_DAILY_LIMIT),
    );
    return decision.allowed
      ? null
      : toolError(
          "service_budget_exhausted",
          `The public-repository inspection budget is exhausted; retry after approximately ${decision.retryAfterSeconds} seconds.`,
        );
  } catch {
    return toolError(
      "service_budget_unavailable",
      "The durable public-repository budget could not be reserved, so no GitHub request was started.",
    );
  }
}

function boundedPublicRepositoryDailyLimit(value: string | undefined): number {
  if (!value?.trim() || !/^\d+$/.test(value.trim())) return DEFAULT_PUBLIC_REPOSITORY_DAILY_LIMIT;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed)
    ? Math.max(1, Math.min(500, parsed))
    : DEFAULT_PUBLIC_REPOSITORY_DAILY_LIMIT;
}

function isLocalOrTestMcpRequest(request: Request): boolean {
  const hostname = new URL(request.url).hostname.toLowerCase();
  return hostname === "localhost"
    || hostname === "127.0.0.1"
    || hostname === "[::1]"
    || hostname.endsWith(".example");
}

function packetEvidence(packet: ReturnType<typeof buildMcpContextPacket>): EvidenceChunk[] {
  const documents = new Map(packet.documents.map((document) => [document.id, document]));
  const groupResolution = new Map(packet.entityCandidateGroups.flatMap((group) =>
    group.candidateIds.map((candidateId) => [candidateId, group.resolution] as const)));
  return packet.claims.map((claim): EvidenceChunk => {
    const candidates = packet.entityCandidates.filter((candidate) =>
      candidate.documentId === claim.documentId
      && candidate.start >= claim.start
      && candidate.end <= claim.end);
    const sourceSemantics = packetAuthoritySemantics(claim.authority.level);
    return {
      id: claim.id,
      projectId: "mcp-upload-packet",
      sourceId: claim.documentId,
      sourceVersionId: claim.assertionOwnerId,
      title: documents.get(claim.documentId)?.name ?? claim.documentId,
      locator: claim.locator,
      text: claim.quote,
      score: 1,
      authority: sourceSemantics.authority,
      role: sourceSemantics.role,
      lifecycle: sourceSemantics.lifecycle,
      claimKinds: [claimKindForGraph(claim.claimKind)],
      claimKind: claimKindForGraph(claim.claimKind),
      claimKey: claim.claimKey,
      polarity: claim.polarity,
      assertionScope: "source_assertion",
      assertionOwnerId: claim.assertionOwnerId,
      temporalAxis: claim.temporal?.axis ?? null,
      validFromOrder: claim.temporal?.from ?? null,
      validToOrder: claim.temporal?.to ?? null,
      flags: ["compiled_atomic_span"],
      parentEvidenceId: claim.documentId,
      quoteStart: claim.start,
      quoteEnd: claim.end,
      referentKeys: candidates.map((candidate) => candidate.referentKey),
      entityCandidates: candidates.map((candidate) => ({
        id: candidate.id,
        name: candidate.mention,
        type: candidate.entityType,
        aliases: [],
        mention: candidate.mention,
        referentKey: candidate.referentKey,
        resolution: entityResolution(groupResolution.get(candidate.id)),
      })),
    };
  });
}

function packetAuthoritySemantics(level: "reference" | "proposal" | "production_record"): Pick<EvidenceChunk, "authority" | "role" | "lifecycle"> {
  if (level === "proposal") return { authority: "proposal", role: "proposal", lifecycle: "proposed" };
  if (level === "production_record") return { authority: "production", role: "observation", lifecycle: "active" };
  return { authority: "reference", role: "reference", lifecycle: "active" };
}

function claimKindForGraph(value: string): ClaimKind {
  const normalized = value.trim().toLowerCase();
  if (["identity", "normative", "configured", "implemented", "tested", "observed", "causal", "historical"].includes(normalized)) {
    return normalized as ClaimKind;
  }
  if (/identity|same-as|alias|relationship/.test(normalized)) return "identity";
  if (/cause|depend|require|precondition|consequence|transition/.test(normalized)) return "causal";
  if (/event|history|timeline/.test(normalized)) return "historical";
  return "observed";
}

function entityResolution(value: "ambiguous" | "single_unresolved" | "source_scoped_explicit" | undefined) {
  if (value === "ambiguous") return "ambiguous" as const;
  if (value === "source_scoped_explicit") return "resolved" as const;
  return "candidate" as const;
}

function publicContextError(error: unknown): string {
  if (error instanceof McpContextError || error instanceof RepositoryProviderError || error instanceof TypeError) {
    return error.message;
  }
  return "The bounded context preparation could not complete.";
}

function validateToolArguments(name: ReviewedToolName, input: JsonObject): string | null {
  const allowed = name === "continuity_answer_question"
    ? new Set(["projectId", "projectRevision", "question", "timeScope", "contextRefs"])
    : name === "continuity_trace_dependencies"
      ? new Set(["projectId", "projectRevision", "targetRef", "timeScope"])
      : new Set(["projectId", "projectRevision", "change", "contextRefs"]);
  const unexpected = Object.keys(input).filter((key) => !allowed.has(key));
  if (unexpected.length) return `Unexpected argument${unexpected.length === 1 ? "" : "s"}: ${unexpected.join(", ")}.`;
  if (typeof input.projectId !== "string" || !PROJECT_ID_PATTERN.test(input.projectId.trim())) {
    return "projectId must match the bounded project identifier format.";
  }
  if (typeof input.projectRevision !== "string" || !input.projectRevision.trim() || input.projectRevision.length > 128) {
    return "projectRevision is required and cannot exceed 128 characters.";
  }
  const textKey = name === "continuity_answer_question" ? "question"
    : name === "continuity_trace_dependencies" ? "targetRef" : "change";
  if (typeof input[textKey] !== "string" || !input[textKey].trim()) return `${textKey} is required.`;
  if ((input[textKey] as string).trim().length > MAX_TEXT_LENGTH) return `${textKey} exceeds ${MAX_TEXT_LENGTH} characters.`;
  if ("timeScope" in input
    && input.timeScope !== null
    && (typeof input.timeScope !== "string" || input.timeScope.length > 240)) {
    return "timeScope must be null or a string no longer than 240 characters.";
  }
  if ("contextRefs" in input && !validContextRefs(input.contextRefs)) {
    return `contextRefs must contain at most ${MAX_CONTEXT_REFS} non-empty strings of at most 240 characters.`;
  }
  return null;
}

function reviewedScopeError(input: JsonObject): ReturnType<typeof toolError> | null {
  if (input.projectId !== VCS_DEMO_PROJECT_ID) {
    return toolError(
      "workspace_auth_not_implemented",
      "This stateless MCP transport can read only the reviewed VCS sample. Authenticated connectors for private or arbitrary workspaces are not implemented, and no repository synchronization was attempted.",
    );
  }
  if (input.projectRevision !== VCS_DEMO_REVISION) {
    return toolError(
      "revision_not_available",
      `This transport is pinned to ${VCS_DEMO_REVISION}; it will not silently substitute or synchronize another revision.`,
    );
  }
  const question = typeof input.question === "string" ? input.question
    : typeof input.targetRef === "string" ? input.targetRef
      : typeof input.change === "string" ? input.change : "";
  if (requiresExternalScope(question)) {
    return toolError(
      "project_scope_required",
      "The reviewed-example tools cannot infer what ‘this folder’, ‘this repository’, or ‘this project’ means. They contain only the Vibe Code Simulator example. Supply the public GitHub repository to continuity_inspect_public_repository, or pass relevant attachment text to continuity_compile_material.",
    );
  }
  return null;
}

function requiresExternalScope(value: string): boolean {
  if (/\b(?:vibe\s+code|vibe\s+coder|vcs)\b/i.test(value)) return false;
  return /\b(?:this|current)\s+(?:folder|repository|repo|project|codebase)\b/i.test(value)
    || /\b(?:folder|repository|repo|project|codebase)\s+(?:here|i(?:'m| am)\s+in)\b/i.test(value);
}

function publicScope(scope: { id: string; label: string; rootPath: string; kind: string; origin: string; signals: string[] }) {
  return {
    id: scope.id,
    label: scope.label,
    rootPath: scope.rootPath,
    kind: scope.kind,
    origin: scope.origin,
    signals: scope.signals,
  };
}

function toolSuccess(result: QueryResult) {
  const answer = result.answer;
  const reachability = answer.reachability.status === "not_evaluated"
    ? null
    : {
        status: answer.reachability.status,
        blockers: answer.reachability.blockers,
        path: answer.reachability.path,
        assumptions: answer.reachability.assumptions,
      };
  return {
    content: [{ type: "text", text: `${answer.verdict}: ${answer.answer}` }],
    structuredContent: {
      projectId: VCS_DEMO_PROJECT_ID,
      projectRevision: VCS_DEMO_REVISION,
      mode: result.mode,
      verdict: answer.verdict,
      truthStatus: answer.truthStatus,
      answer: answer.answer,
      confidence: answer.confidence,
      coverage: {
        closure: result.routing.coverage.closure,
        scope: result.routing.coverage.scope,
      },
      citations: answer.evidence.map(({ sourceId, locator, stance, supports }) => ({ sourceId, locator, stance, supports })),
      entities: answer.entities.map(({ id, name, type, resolution }) => ({ id, name, type, resolution })),
      dependencies: answer.dependencies.map(({ from, to, relation, status, claimKey }) => ({ from, to, relation, status, claimKey })),
      reachability,
      proposal: answer.proposal,
    },
    isError: false,
  };
}

function toolError(code: string, message: string) {
  return {
    // outputSchema governs successful structuredContent. Error results omit it
    // rather than returning an incompatible `{code}` object that a strict MCP
    // client would reject before it could display the diagnostic.
    content: [{ type: "text", text: `[${code}] ${message}` }],
    isError: true,
  };
}

function rpcResult(id: JsonRpcId, result: unknown): Response {
  return Response.json({ jsonrpc: "2.0", id, result }, { headers: noStoreHeaders() });
}

function rpcError(
  id: JsonRpcId,
  code: number,
  message: string,
  status: number,
  data?: JsonObject,
): Response {
  return Response.json({
    jsonrpc: "2.0",
    id,
    error: { code, message, ...(data ? { data } : {}) },
  }, { status, headers: noStoreHeaders() });
}

function notificationAccepted(): Response {
  return new Response(null, { status: 202, headers: noStoreHeaders() });
}

function noStoreHeaders(): HeadersInit {
  return {
    "Content-Type": "application/json",
    "Cache-Control": "private, no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
  };
}

function withNoStore(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Content-Type", "application/json");
  headers.set("Cache-Control", "private, no-store, max-age=0");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function isRecord(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isJsonRpcId(value: unknown): value is JsonRpcId {
  return value === null
    || typeof value === "string"
    || (typeof value === "number" && Number.isFinite(value));
}

function validToolsListParams(value: unknown): boolean {
  return validEmptyParams(value);
}

function validEmptyParams(value: unknown): boolean {
  return value === undefined || (isRecord(value) && Object.keys(value).length === 0);
}

function validateProtocolHeader(request: Request): string | null {
  const version = request.headers.get("MCP-Protocol-Version")?.trim() ?? "";
  if (!version) return "MCP-Protocol-Version is required after initialize.";
  return isSupportedProtocolVersion(version) ? null : unsupportedProtocolMessage(version);
}

function validateInitializeParams(value: unknown): string | null {
  if (!isRecord(value)) return "initialize params must be an object.";
  if (typeof value.protocolVersion !== "string" || !value.protocolVersion.trim() || value.protocolVersion.length > 64) {
    return "initialize protocolVersion must be a non-empty string no longer than 64 characters.";
  }
  if (!isRecord(value.capabilities)) return "initialize capabilities must be an object.";
  if (!isRecord(value.clientInfo)
    || typeof value.clientInfo.name !== "string"
    || !value.clientInfo.name.trim()
    || value.clientInfo.name.length > 128
    || typeof value.clientInfo.version !== "string"
    || !value.clientInfo.version.trim()
    || value.clientInfo.version.length > 128) {
    return "initialize clientInfo requires non-empty name and version strings no longer than 128 characters.";
  }
  return null;
}

function negotiateProtocolVersion(value: unknown): string {
  if (!isRecord(value) || typeof value.protocolVersion !== "string") {
    return LATEST_MCP_PROTOCOL_VERSION;
  }
  return isSupportedProtocolVersion(value.protocolVersion)
    ? value.protocolVersion
    : LATEST_MCP_PROTOCOL_VERSION;
}

function isSupportedProtocolVersion(version: string): boolean {
  return SUPPORTED_MCP_PROTOCOL_VERSIONS.includes(version as typeof SUPPORTED_MCP_PROTOCOL_VERSIONS[number]);
}

function unsupportedProtocolMessage(version: string): string {
  return `Unsupported MCP-Protocol-Version ${version}; supported versions are ${SUPPORTED_MCP_PROTOCOL_VERSIONS.join(", ")}.`;
}

function optionalTrimmedString(value: unknown, maxLength: number): string | null {
  return typeof value === "string" ? value.trim().slice(0, maxLength) || null : null;
}

function cleanContextRefs(value: unknown): string[] {
  return Array.isArray(value)
    ? value.slice(0, MAX_CONTEXT_REFS).map((item) => (item as string).trim().slice(0, 240))
    : [];
}

function validContextRefs(value: unknown): boolean {
  if (!Array.isArray(value) || value.length > MAX_CONTEXT_REFS) return false;
  const normalized = value.flatMap((item) => typeof item === "string" ? [item.trim()] : []);
  return normalized.length === value.length
    && normalized.every((item) => Boolean(item) && item.length <= 240)
    && new Set(normalized).size === normalized.length;
}
