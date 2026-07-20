import type { QueryRequest, QueryResult } from "@/lib/continuity/contracts";
import {
  demoTargetClaimKeys,
  DemoReachabilityEvaluator,
  DemoReasoner,
  DemoRetriever,
  VCS_DEMO_COMPLETENESS_REGISTRY,
  VCS_DEMO_PROJECT_ID,
  VCS_DEMO_REVISION,
} from "@/lib/continuity/demo";
import { ContinuityEngine, ContinuityInputError } from "@/lib/continuity/engine";
import { guardRequestBody, readJsonBodyBounded, RequestBodyError } from "@/lib/continuity/http/security";
import { continuityMcpTools } from "@/lib/continuity/mcp-contract";

export const runtime = "edge";

const MCP_PROTOCOL_VERSION = "2025-06-18";
const MAX_BODY_BYTES = 32 * 1024;
const MAX_TEXT_LENGTH = 8_000;
const MAX_CONTEXT_REFS = 20;
const PROJECT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const EXPOSED_TOOL_NAMES = [
  "continuity_answer_question",
  "continuity_trace_dependencies",
  "continuity_analyze_change",
] as const;
type ExposedToolName = typeof EXPOSED_TOOL_NAMES[number];
type JsonRpcId = string | number | null;
type JsonObject = Record<string, unknown>;

const demoEngine = new ContinuityEngine(
  new DemoRetriever(),
  new DemoReasoner(),
  undefined,
  undefined,
  new DemoReachabilityEvaluator(),
  VCS_DEMO_COMPLETENESS_REGISTRY,
);

const REVIEWED_COVERAGE = Object.freeze({
  scope: "The complete reviewed VCS sample packet and configured transition registry at vcs-demo-r1.",
  complete: true,
  excludedSources: [] as string[],
});

const TOOL_ANNOTATIONS = Object.freeze({
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
});

const TOOL_TITLES: Record<ExposedToolName, string> = {
  continuity_answer_question: "Answer a continuity question",
  continuity_trace_dependencies: "Trace continuity dependencies",
  continuity_analyze_change: "Analyze a proposed change",
};

const TOOL_OUTPUT_SCHEMA = {
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
    if (suppliedHeader && suppliedHeader !== MCP_PROTOCOL_VERSION) {
      return rpcError(id, -32600, `Unsupported MCP-Protocol-Version ${suppliedHeader}; this transport supports ${MCP_PROTOCOL_VERSION}.`, 400);
    }
    const initializeError = validateInitializeParams(payload.params);
    if (initializeError) return rpcError(id, -32602, initializeError, 400);
    return rpcResult(id, {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "continuity-lab-reviewed-sample", version: "0.1.0" },
      instructions: "Immutable, read-only, stateless access to vcs-demo at vcs-demo-r1. Tool calls never synchronize a repository or invoke a paid model provider. Change analyses are proposals and never become canon.",
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
        inputSchema: continuityMcpTools[name].inputSchema,
        outputSchema: TOOL_OUTPUT_SCHEMA,
        annotations: TOOL_ANNOTATIONS,
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
    const inputError = validateToolArguments(name, argumentsValue);
    if (inputError) return rpcResult(id, toolError("invalid_arguments", inputError));

    const scopeError = reviewedScopeError(argumentsValue);
    if (scopeError) return rpcResult(id, scopeError);

    try {
      const result = await demoEngine.query(queryForTool(name, argumentsValue));
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

function queryForTool(name: ExposedToolName, input: JsonObject): QueryRequest {
  const common = {
    projectId: VCS_DEMO_PROJECT_ID,
    projectRevision: VCS_DEMO_REVISION,
    coverage: REVIEWED_COVERAGE,
  };
  if (name === "continuity_answer_question") {
    const question = (input.question as string).trim();
    return {
      ...common,
      question,
      analysisMode: "answer_question",
      timeScope: optionalTrimmedString(input.timeScope, 240),
      contextRefs: cleanContextRefs(input.contextRefs),
      targetClaimKeys: demoTargetClaimKeys(question),
    };
  }
  if (name === "continuity_trace_dependencies") {
    const targetRef = (input.targetRef as string).trim();
    const question = `Trace dependencies for ${targetRef}`;
    return {
      ...common,
      question,
      analysisMode: "trace_dependencies",
      timeScope: optionalTrimmedString(input.timeScope, 240)
        ?? "through the current VCS demonstration build",
      temporalAxis: "day",
      storyPosition: 8,
      targetPosition: 24,
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
    timeScope: "through the current VCS demonstration build",
    temporalAxis: "day",
    storyPosition: 8,
    targetPosition: 24,
    contextRefs: cleanContextRefs(input.contextRefs),
    targetClaimKeys: demoTargetClaimKeys(question, change),
  };
}

function validateToolArguments(name: ExposedToolName, input: JsonObject): string | null {
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
  return null;
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
  if (!version) return `MCP-Protocol-Version is required after initialize and must equal ${MCP_PROTOCOL_VERSION}.`;
  return version === MCP_PROTOCOL_VERSION
    ? null
    : `Unsupported MCP-Protocol-Version ${version}; this transport supports ${MCP_PROTOCOL_VERSION}.`;
}

function validateInitializeParams(value: unknown): string | null {
  if (!isRecord(value)) return "initialize params must be an object.";
  if (value.protocolVersion !== MCP_PROTOCOL_VERSION) {
    return `Unsupported initialize protocolVersion; this transport supports ${MCP_PROTOCOL_VERSION}.`;
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
