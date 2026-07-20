import type { AnalysisMode, ClaimKind, ConversationTurn, QueryRequest, Verdict } from "@/lib/continuity/contracts";
import {
  demoTargetClaimKeys,
  DemoReachabilityEvaluator,
  DemoReasoner,
  DemoRetriever,
  VCS_DEMO_COMPLETENESS_REGISTRY,
  VCS_DEMO_REVISION,
} from "@/lib/continuity/demo";
import {
  CompositeRetriever,
  CONTINUITY_INPUT_LIMITS,
  ContinuityEngine,
  ContinuityInputError,
} from "@/lib/continuity/engine";
import {
  OpenAIReasoner,
  OpenAIRetriever,
  ProviderExecutionBudget,
  ProviderExecutionError,
} from "@/lib/continuity/providers/openai";
import { EvidenceCompilerError, OpenAIEvidenceCompiler } from "@/lib/continuity/providers/evidence-compiler";
import { inferFocusedClaimKinds, inferMinimumAnalysisMode } from "@/lib/continuity/routing/authority-router";
import { ContinuityRepository, type UsageReservationDecision } from "@/lib/continuity/storage/repository";
import {
  isLocalRequest,
  projectAuthenticationRequired,
  resolveProjectScope,
  resolveRequestIdentity,
  type IdentityTrustConfig,
} from "@/lib/continuity/auth/project-scope";
import {
  guardRequestBody,
  privateNoStoreHeaders,
  rateLimitResponse,
  readJsonBodyBounded,
  RequestBodyError,
  requestBodyErrorResponse,
  usageActorScopeKey,
} from "@/lib/continuity/http/security";

export const runtime = "edge";

const PROJECT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const VERDICTS = new Set<Verdict>([
  "SUPPORTED", "CONFLICT", "AMBIGUOUS", "UNREACHABLE", "INSUFFICIENT_EVIDENCE", "PROPOSAL",
]);
const ANALYSIS_MODES = new Set<AnalysisMode>(["answer_question", "evaluate_change", "trace_dependencies"]);
const CLAIM_KINDS = new Set<ClaimKind>([
  "identity", "normative", "configured", "implemented", "tested", "observed", "causal", "historical",
]);
const ENGINE_PREFERENCES = new Set(["auto", "demo", "live"] as const);
type EnginePreference = "auto" | "demo" | "live";
const REVIEWED_LIVE_DEMO = Object.freeze({
  question: "Can the founder pay for the $47,000 operation by Day 24—and what must be built if not?",
  timeScope: "through the current VCS demonstration build",
  temporalAxis: "day",
  storyPosition: 8,
  targetPosition: 24,
  analysisMode: "trace_dependencies" as const,
});
const REVIEWED_LIVE_DEMO_ALLOWED_FIELDS = new Set([
  "projectId", "question", "analysisMode", "proposedChange", "enginePreference",
  "timeScope", "temporalAxis", "storyPosition", "targetPosition",
]);
const REVIEWED_LIVE_DEMO_TIMEOUT_MS = 60_000;
const REVIEWED_LIVE_DEMO_WINDOW_SECONDS = 24 * 60 * 60;
const DEFAULT_REVIEWED_LIVE_ACTOR_DAILY_LIMIT = 5;
const DEFAULT_REVIEWED_LIVE_PROJECT_DAILY_LIMIT = 25;

export type ReviewedLiveDemoUsageLimits = {
  actorPerDay: number;
  projectPerDay: number;
};

export type ConcurrencyLease = {
  deadlineAt: number;
  release: () => void;
};

/**
 * D1 supplies the durable request quota; this smaller per-isolate gate limits
 * concurrent provider work inside one runtime instance. It also imposes a hard
 * request deadline and never queues or retries.
 */
export class BoundedInMemoryConcurrencyGate {
  private active = 0;

  constructor(
    readonly maxConcurrent: number,
    readonly timeoutMs: number,
  ) {
    if (!Number.isSafeInteger(maxConcurrent) || maxConcurrent < 1) throw new Error("maxConcurrent must be positive");
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new Error("timeoutMs must be positive");
  }

  acquire(now = Date.now()): ConcurrencyLease | null {
    if (this.active >= this.maxConcurrent) return null;
    this.active += 1;
    let released = false;
    return {
      deadlineAt: now + this.timeoutMs,
      release: () => {
        if (released) return;
        released = true;
        this.active = Math.max(0, this.active - 1);
      },
    };
  }

  snapshot(): { active: number; maxConcurrent: number; timeoutMs: number } {
    return { active: this.active, maxConcurrent: this.maxConcurrent, timeoutMs: this.timeoutMs };
  }
}

const reviewedLiveDemoGate = new BoundedInMemoryConcurrencyGate(2, REVIEWED_LIVE_DEMO_TIMEOUT_MS);

export function matchesReviewedLiveDemo(input: {
  question: string;
  analysisMode: AnalysisMode;
  proposedChange: string | null;
  timeScope: unknown;
  temporalAxis: unknown;
  storyPosition: unknown;
  targetPosition: unknown;
}): boolean {
  return input.question === REVIEWED_LIVE_DEMO.question
    && input.analysisMode === REVIEWED_LIVE_DEMO.analysisMode
    && !input.proposedChange
    && input.timeScope === REVIEWED_LIVE_DEMO.timeScope
    && input.temporalAxis === REVIEWED_LIVE_DEMO.temporalAxis
    && input.storyPosition === REVIEWED_LIVE_DEMO.storyPosition
    && input.targetPosition === REVIEWED_LIVE_DEMO.targetPosition;
}

export function reviewedLiveDemoExtraFields(payload: Record<string, unknown>): string[] {
  return Object.keys(payload).filter((key) => !REVIEWED_LIVE_DEMO_ALLOWED_FIELDS.has(key)).sort();
}

export function matchesReviewedLiveDemoPayload(payload: Record<string, unknown>): boolean {
  return reviewedLiveDemoExtraFields(payload).length === 0
    && Object.keys(payload).length === REVIEWED_LIVE_DEMO_ALLOWED_FIELDS.size
    && payload.projectId === "vcs-demo"
    && payload.question === REVIEWED_LIVE_DEMO.question
    && payload.analysisMode === REVIEWED_LIVE_DEMO.analysisMode
    && payload.proposedChange === null
    && payload.enginePreference === "live"
    && payload.timeScope === REVIEWED_LIVE_DEMO.timeScope
    && payload.temporalAxis === REVIEWED_LIVE_DEMO.temporalAxis
    && payload.storyPosition === REVIEWED_LIVE_DEMO.storyPosition
    && payload.targetPosition === REVIEWED_LIVE_DEMO.targetPosition;
}

/** Every contextual field is server-owned for the paid public sample. */
export function buildReviewedLiveDemoQuery(): QueryRequest {
  return {
    projectId: "vcs-demo",
    projectRevision: VCS_DEMO_REVISION,
    question: REVIEWED_LIVE_DEMO.question,
    analysisMode: REVIEWED_LIVE_DEMO.analysisMode,
    proposedChange: null,
    timeScope: REVIEWED_LIVE_DEMO.timeScope,
    temporalAxis: REVIEWED_LIVE_DEMO.temporalAxis,
    storyPosition: REVIEWED_LIVE_DEMO.storyPosition,
    targetPosition: REVIEWED_LIVE_DEMO.targetPosition,
    claimKinds: [],
    conversation: [],
    contextRefs: [],
    targetClaimKeys: demoTargetClaimKeys(REVIEWED_LIVE_DEMO.question, null),
    coverage: {
      scope: "The complete frozen VCS demonstration contract, economy, cast, dialogue, asset records, and trigger registry.",
      complete: true,
    },
  };
}

export async function runReviewedLiveDemo(
  apiKey: string,
  lease: Pick<ConcurrencyLease, "deadlineAt">,
  fetchImpl?: typeof fetch,
) {
  const executionBudget = new ProviderExecutionBudget({ deadlineAt: lease.deadlineAt, maxCalls: 1 });
  const analysis = new ContinuityEngine(
    new DemoRetriever(),
    new OpenAIReasoner({
      apiKey,
      ...(fetchImpl ? { fetch: fetchImpl } : {}),
      maxOutputTokens: 6_000,
      reasoningEffort: "medium",
      verbosity: "medium",
      timeoutMs: 55_000,
      executionBudget,
    }),
    undefined,
    undefined,
    new DemoReachabilityEvaluator(),
    VCS_DEMO_COMPLETENESS_REGISTRY,
  ).query(buildReviewedLiveDemoQuery());
  const remainingMs = lease.deadlineAt - Date.now();
  if (remainingMs <= 0) {
    throw new ProviderExecutionError(
      "The server-owned public-sample deadline was reached before analysis began.",
      "provider_deadline_exceeded",
      "reasoning",
      504,
    );
  }
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      analysis,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new ProviderExecutionError(
          "The server-owned public-sample deadline was reached.",
          "provider_deadline_exceeded",
          "reasoning",
          504,
        )), remainingMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export function willRunPaidProvider(enginePreference: EnginePreference, providerReady: boolean): boolean {
  return enginePreference !== "demo" && providerReady;
}

/**
 * Durable paid-call reservation shared by every isolate. The actor/project rule
 * runs first so one actor cannot exhaust the project-global pool after reaching
 * their own ceiling. Each rule is an atomic D1 conditional upsert; a later
 * denial or provider failure does not refund an earlier reservation.
 */
export async function reserveReviewedLiveDemoUsage(
  repository: Pick<ContinuityRepository, "reserveUsageBudget">,
  actorScope: string,
  limits: ReviewedLiveDemoUsageLimits = {
    actorPerDay: DEFAULT_REVIEWED_LIVE_ACTOR_DAILY_LIMIT,
    projectPerDay: DEFAULT_REVIEWED_LIVE_PROJECT_DAILY_LIMIT,
  },
  nowMs = Date.now(),
) {
  return repository.reserveUsageBudget([
    {
      id: "actor_project_daily",
      scopeKey: `${actorScope}:project-vcs-demo`,
      operation: "reviewed_live_demo",
      limit: limits.actorPerDay,
      windowSeconds: REVIEWED_LIVE_DEMO_WINDOW_SECONDS,
    },
    {
      id: "project_global_daily",
      scopeKey: "project-vcs-demo:global",
      operation: "reviewed_live_demo",
      limit: limits.projectPerDay,
      windowSeconds: REVIEWED_LIVE_DEMO_WINDOW_SECONDS,
    },
  ], nowMs);
}

export type ProviderExecutionProfile = {
  depth: "focused" | "broad" | "deep";
  overallTimeoutMs: number;
  maxRetrievalQueries: number;
  maxResultsPerQuery: number;
  retrievalTimeoutMs: number;
  compilerTimeoutMs: number;
  reasonerTimeoutMs: number;
  reasonerMaxOutputTokens: number;
  reasoningEffort: "low" | "medium";
};

/** Fixed server policy; client input cannot enlarge these limits. */
export function providerExecutionProfile(
  analysisMode: AnalysisMode,
  focused: boolean,
): ProviderExecutionProfile {
  if (focused && analysisMode === "answer_question") {
    return {
      depth: "focused",
      overallTimeoutMs: 55_000,
      maxRetrievalQueries: 6,
      maxResultsPerQuery: 8,
      retrievalTimeoutMs: 12_000,
      compilerTimeoutMs: 20_000,
      reasonerTimeoutMs: 30_000,
      reasonerMaxOutputTokens: 2_500,
      reasoningEffort: "low",
    };
  }
  if (analysisMode === "trace_dependencies" || analysisMode === "evaluate_change") {
    return {
      depth: "deep",
      overallTimeoutMs: 115_000,
      maxRetrievalQueries: 12,
      maxResultsPerQuery: 16,
      retrievalTimeoutMs: 24_000,
      compilerTimeoutMs: 38_000,
      reasonerTimeoutMs: 55_000,
      reasonerMaxOutputTokens: 6_000,
      reasoningEffort: "medium",
    };
  }
  return {
    depth: "broad",
    overallTimeoutMs: 85_000,
    maxRetrievalQueries: 10,
    maxResultsPerQuery: 12,
    retrievalTimeoutMs: 18_000,
    compilerTimeoutMs: 30_000,
    reasonerTimeoutMs: 45_000,
    reasonerMaxOutputTokens: 5_000,
    reasoningEffort: "medium",
  };
}

type RuntimeEnv = {
  DB?: D1Database;
  OPENAI_API_KEY?: string;
  OPENAI_VECTOR_STORE_ID?: string;
  CONTINUITY_TRUSTED_INGRESS_ORIGINS?: string;
  REVIEWED_LIVE_ACTOR_DAILY_LIMIT?: string;
  REVIEWED_LIVE_PROJECT_DAILY_LIMIT?: string;
};

async function runtimeEnv(): Promise<RuntimeEnv> {
  // Loaded only inside the API route so server-render validation can import
  // the site worker in plain Node without resolving a Cloudflare-only module.
  const { env } = await import("cloudflare:workers");
  return env as unknown as RuntimeEnv;
}

function identityTrust(bindings?: RuntimeEnv | null): IdentityTrustConfig {
  return { trustedIngressOrigins: bindings?.CONTINUITY_TRUSTED_INGRESS_ORIGINS };
}

function reviewedLiveDemoUsageLimits(bindings: RuntimeEnv): ReviewedLiveDemoUsageLimits {
  return {
    actorPerDay: boundedEnvironmentInteger(
      bindings.REVIEWED_LIVE_ACTOR_DAILY_LIMIT,
      DEFAULT_REVIEWED_LIVE_ACTOR_DAILY_LIMIT,
      1,
      50,
    ),
    projectPerDay: boundedEnvironmentInteger(
      bindings.REVIEWED_LIVE_PROJECT_DAILY_LIMIT,
      DEFAULT_REVIEWED_LIVE_PROJECT_DAILY_LIMIT,
      1,
      500,
    ),
  };
}

function boundedEnvironmentInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (!value?.trim() || !/^\d+$/.test(value.trim())) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? Math.max(minimum, Math.min(maximum, parsed)) : fallback;
}

function cleanConversation(value: unknown): ConversationTurn[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-6).flatMap((turn): ConversationTurn[] => {
    if (!turn || typeof turn !== "object") return [];
    const candidate = turn as Partial<ConversationTurn>;
    if (
      typeof candidate.question !== "string"
      || typeof candidate.answer !== "string"
      || !candidate.verdict
      || !VERDICTS.has(candidate.verdict)
    ) return [];
    return [{
      question: candidate.question.slice(0, 2_000),
      answer: candidate.answer.slice(0, 4_000),
      verdict: candidate.verdict,
    }];
  });
}

function cleanStringArray(value: unknown, limit = 20): string[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, limit).flatMap((item) => typeof item === "string" && item.trim() ? [item.trim().slice(0, 240)] : []);
}

function cleanClaimKinds(value: unknown): ClaimKind[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.flatMap((item): ClaimKind[] =>
    typeof item === "string" && CLAIM_KINDS.has(item as ClaimKind) ? [item as ClaimKind] : []))].slice(0, CLAIM_KINDS.size);
}

/**
 * Reject malformed or oversized optional fields before authentication,
 * storage, retrieval, or provider work. Silently truncating these fields would
 * make the answered question differ from the submitted question.
 */
export function validatePublicQueryPayload(payload: Record<string, unknown>): void {
  boundedPayloadString(payload.projectId, "projectId", CONTINUITY_INPUT_LIMITS.projectIdBytes, false, false);
  boundedPayloadString(payload.question, "question", CONTINUITY_INPUT_LIMITS.questionBytes, false, false);
  boundedPayloadString(payload.proposedChange, "proposedChange", CONTINUITY_INPUT_LIMITS.proposedChangeBytes, true, true);
  boundedPayloadString(payload.timeScope, "timeScope", 240, true, true);
  boundedPayloadString(payload.temporalAxis, "temporalAxis", 80, true, true);
  boundedPayloadNumber(payload.storyPosition, "storyPosition");
  boundedPayloadNumber(payload.targetPosition, "targetPosition");
  boundedPayloadStringArray(payload.contextRefs, "contextRefs", CONTINUITY_INPUT_LIMITS.contextRefs, CONTINUITY_INPUT_LIMITS.requestArrayItemBytes);
  boundedPayloadStringArray(payload.claimKinds, "claimKinds", CLAIM_KINDS.size, 32, CLAIM_KINDS);

  if (payload.conversation !== undefined) {
    if (!Array.isArray(payload.conversation) || payload.conversation.length > CONTINUITY_INPUT_LIMITS.conversationTurns) {
      throw new ContinuityInputError(
        `conversation must contain at most ${CONTINUITY_INPUT_LIMITS.conversationTurns} turns.`,
        "request_limit_exceeded",
      );
    }
    payload.conversation.forEach((turn, index) => {
      if (!turn || typeof turn !== "object" || Array.isArray(turn)) {
        throw new ContinuityInputError(`conversation[${index}] must be an object.`);
      }
      const candidate = turn as Record<string, unknown>;
      boundedPayloadString(candidate.question, `conversation[${index}].question`, 2_000, false, false);
      boundedPayloadString(candidate.answer, `conversation[${index}].answer`, 4_000, false, false);
      if (typeof candidate.verdict !== "string" || !VERDICTS.has(candidate.verdict as Verdict)) {
        throw new ContinuityInputError(`conversation[${index}].verdict is unsupported.`);
      }
    });
  }
}

function boundedPayloadString(
  value: unknown,
  label: string,
  maxBytes: number,
  nullable: boolean,
  optional: boolean,
): void {
  if (value === undefined) {
    if (optional) return;
    throw new ContinuityInputError(`${label} is required.`);
  }
  if (nullable && value === null) return;
  if (typeof value !== "string" || (!nullable && !value.trim())) {
    throw new ContinuityInputError(`${label} must be ${nullable ? "a string or null" : "a non-empty string"}.`);
  }
  if (value.length > maxBytes || new TextEncoder().encode(value).byteLength > maxBytes) {
    throw new ContinuityInputError(`${label} exceeds the ${maxBytes}-byte limit.`, "request_limit_exceeded");
  }
}

function boundedPayloadNumber(value: unknown, label: string): void {
  if (value === undefined) return;
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > CONTINUITY_INPUT_LIMITS.numericMagnitude) {
    throw new ContinuityInputError(`${label} must be a finite number within the supported range.`, "request_limit_exceeded");
  }
}

function boundedPayloadStringArray(
  value: unknown,
  label: string,
  maxItems: number,
  maxItemBytes: number,
  allowed?: ReadonlySet<string>,
): void {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new ContinuityInputError(`${label} must contain at most ${maxItems} items.`, "request_limit_exceeded");
  }
  value.forEach((item, index) => {
    boundedPayloadString(item, `${label}[${index}]`, maxItemBytes, false, false);
    if (allowed && !allowed.has(item as string)) throw new ContinuityInputError(`${label}[${index}] is unsupported.`);
  });
}

function errorMessage(error: unknown): string {
  return error instanceof ContinuityInputError
    ? error.message
    : "Continuity analysis could not complete. Check the configured providers and retry.";
}

function providerFailureResponse(error: ProviderExecutionError | EvidenceCompilerError): Response {
  const code = error.code;
  const phase = error instanceof ProviderExecutionError ? error.phase : "evidence_compilation";
  const status = error.httpStatus;
  const message = code === "provider_deadline_exceeded"
    ? `Analysis stopped at its server-owned time limit during ${phase}. No provider call was retried.`
    : code === "provider_call_limit_exceeded"
      ? `Analysis stopped at its server-owned call limit during ${phase}. No provider call was retried.`
      : code === "retrieval_query_limit_exceeded"
        ? error.message
        : code === "provider_request_failed"
          ? `The ${phase} provider request failed. It was not retried automatically.`
          : `The ${phase} provider returned an unusable response. It was not retried automatically.`;
  return Response.json({
    error: message,
    code,
    phase,
    bounded: true,
    retryable: false,
  }, { status, headers: privateNoStoreHeaders() });
}

function privateNoStoreRetryHeaders(seconds: number): Headers {
  const headers = new Headers(privateNoStoreHeaders());
  headers.set("Retry-After", String(seconds));
  return headers;
}

export async function POST(request: Request) {
  const requestGuard = guardRequestBody(request, { kind: "json", maxBytes: 32 * 1024 });
  if (requestGuard) return requestGuard;
  let payload: Record<string, unknown>;
  try {
    payload = await readJsonBodyBounded(request, 32 * 1024) as Record<string, unknown>;
  } catch (error) {
    return error instanceof RequestBodyError
      ? requestBodyErrorResponse(error)
      : Response.json({ error: "The request body must be valid JSON." }, { status: 400 });
  }

  // The exact paid receipt has a stricter allowlist below. Let that boundary
  // return its stable 403 receipt codes even when an allowed field is mistyped;
  // no client field from that path reaches an engine or provider.
  const reviewedLiveAttempt = payload.projectId === "vcs-demo" && payload.enginePreference === "live";
  if (!reviewedLiveAttempt) {
    try {
      validatePublicQueryPayload(payload);
    } catch (error) {
      if (error instanceof ContinuityInputError) {
        return Response.json({ error: error.message, code: error.code }, { status: 400, headers: privateNoStoreHeaders() });
      }
      return Response.json({ error: "The request fields are invalid." }, { status: 400, headers: privateNoStoreHeaders() });
    }
  }

  const requestedProjectId = typeof payload.projectId === "string" ? payload.projectId.trim() : "";
  const question = typeof payload.question === "string" ? payload.question.trim() : "";
  const proposedChange = typeof payload.proposedChange === "string"
    ? payload.proposedChange.trim() || null
    : null;
  const clientAnalysisMode = typeof payload.analysisMode === "string" && ANALYSIS_MODES.has(payload.analysisMode as AnalysisMode)
    ? payload.analysisMode as AnalysisMode
    : proposedChange ? "evaluate_change" : "answer_question";
  const requestedAnalysisMode = inferMinimumAnalysisMode(question, proposedChange, clientAnalysisMode);
  let enginePreference = typeof payload.enginePreference === "string" && ENGINE_PREFERENCES.has(payload.enginePreference as "auto" | "demo" | "live")
    ? payload.enginePreference as "auto" | "demo" | "live"
    : "auto";
  if (!PROJECT_ID_PATTERN.test(requestedProjectId)) {
    return Response.json({ error: "A valid projectId is required." }, { status: 400 });
  }
  if (!question || question.length > 8_000) {
    return Response.json({ error: "A question between 1 and 8,000 characters is required." }, { status: 400 });
  }
  let preloadedBindings: RuntimeEnv | null = null;
  let requestIdentityTrust: IdentityTrustConfig = {};
  let scope = await resolveProjectScope(request, requestedProjectId);
  if (!scope) {
    try {
      preloadedBindings = await runtimeEnv();
      requestIdentityTrust = identityTrust(preloadedBindings);
      scope = await resolveProjectScope(request, requestedProjectId, requestIdentityTrust);
    } catch {
      // A hosted mutable workspace remains closed if its server-owned trust
      // configuration cannot be loaded.
    }
  }
  if (!scope) return projectAuthenticationRequired();
  const projectId = scope.projectId;
  if (projectId === "vcs-demo" && enginePreference === "auto") enginePreference = "demo";
  if (projectId === "vcs-demo" && enginePreference === "live") {
    if (!isLocalRequest(request)) {
      if (!preloadedBindings) {
        try {
          preloadedBindings = await runtimeEnv();
          requestIdentityTrust = identityTrust(preloadedBindings);
        } catch {
          // The response below deliberately does not trust the incoming header
          // when the ingress configuration is unavailable.
        }
      }
      if (resolveRequestIdentity(request, requestIdentityTrust).kind !== "trusted-ingress") {
        return Response.json({
          error: "A trusted authenticated ingress is required to run the paid live demonstration.",
          code: "trusted_ingress_required",
        }, { status: 401, headers: privateNoStoreHeaders() });
      }
    }
    const extraFields = reviewedLiveDemoExtraFields(payload);
    if (extraFields.length) {
      return Response.json({
        error: "The reviewed live receipt does not accept client-supplied conversation, retrieval context, or additional fields.",
        code: "live_demo_extra_context",
        fields: extraFields,
      }, { status: 403, headers: privateNoStoreHeaders() });
    }
    if (!matchesReviewedLiveDemoPayload(payload)) {
      return Response.json({
        error: "The public live control may rerun only the reviewed question and its frozen analysis scope.",
        code: "live_demo_scope_mismatch",
      }, { status: 403, headers: privateNoStoreHeaders() });
    }

    let bindings: RuntimeEnv;
    try {
      bindings = preloadedBindings ?? await runtimeEnv();
    } catch {
      return Response.json({
        error: "Live OpenAI analysis is not configured for this deployment.",
        code: "live_reasoning_not_configured",
        capability: "stored_only",
      }, { status: 409, headers: privateNoStoreHeaders() });
    }
    const apiKey = bindings.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      return Response.json({
        error: "Live OpenAI analysis is not configured for this deployment.",
        code: "live_reasoning_not_configured",
        capability: "stored_only",
      }, { status: 409, headers: privateNoStoreHeaders() });
    }
    if (!bindings.DB) {
      return Response.json({
        error: "The durable live-analysis budget is not configured for this deployment.",
        code: "live_budget_not_configured",
        capability: "stored_only",
      }, { status: 409, headers: privateNoStoreHeaders() });
    }
    const lease = reviewedLiveDemoGate.acquire();
    if (!lease) {
      return Response.json({
        error: "The bounded public live sample is already at its per-isolate concurrency ceiling. Try again after an in-flight run completes.",
        code: "live_demo_concurrency_limit",
        bounded: true,
        retryable: true,
      }, {
        status: 429,
        headers: privateNoStoreRetryHeaders(60),
      });
    }
    try {
      let usageReservation: UsageReservationDecision;
      try {
        const actorScope = await usageActorScopeKey(request, requestIdentityTrust);
        usageReservation = await reserveReviewedLiveDemoUsage(
          new ContinuityRepository(bindings.DB),
          actorScope,
          reviewedLiveDemoUsageLimits(bindings),
        );
      } catch {
        return Response.json({
          error: "The durable live-analysis budget could not be reserved, so no provider call was started.",
          code: "live_budget_unavailable",
          capability: "stored_only",
        }, { status: 503, headers: privateNoStoreRetryHeaders(60) });
      }
      if (!usageReservation.allowed) {
        return rateLimitResponse(usageReservation.retryAfterSeconds);
      }
      const result = await runReviewedLiveDemo(apiKey, lease);
      return Response.json({
        ...result,
        analysisId: null,
        persistenceWarning: null,
        capability: "gpt-5.6-sol",
      }, { headers: privateNoStoreHeaders() });
    } catch (error) {
      if (error instanceof ProviderExecutionError) return providerFailureResponse(error);
      if (error instanceof ContinuityInputError) {
        return Response.json({ error: error.message }, { status: 400, headers: privateNoStoreHeaders() });
      }
      return Response.json({ error: errorMessage(error) }, { status: 502, headers: privateNoStoreHeaders() });
    } finally {
      lease.release();
    }
  }

  // The reviewed sample is an immutable, deterministic receipt. Keep it on a
  // stateless path so a storage outage or an unapplied database migration
  // cannot turn the reliable demonstration into a setup error. This path
  // performs no provider call, repository access, or persistence write.
  if (projectId === "vcs-demo" && enginePreference === "demo") {
    const requestedClaimKinds = cleanClaimKinds(payload.claimKinds);
    const inferredFocusedClaimKinds = requestedAnalysisMode === "answer_question"
      ? inferFocusedClaimKinds(question)
      : null;
    const safeClaimKinds = inferredFocusedClaimKinds
      ? [...new Set([...inferredFocusedClaimKinds, ...requestedClaimKinds])]
      : [];
    const query: QueryRequest = {
      projectId,
      projectRevision: VCS_DEMO_REVISION,
      timeScope: typeof payload.timeScope === "string" ? payload.timeScope.trim().slice(0, 240) || null : null,
      temporalAxis: typeof payload.temporalAxis === "string" ? payload.temporalAxis.trim().toLowerCase().slice(0, 80) || null : null,
      storyPosition: typeof payload.storyPosition === "number" && Number.isFinite(payload.storyPosition) ? payload.storyPosition : undefined,
      targetPosition: typeof payload.targetPosition === "number" && Number.isFinite(payload.targetPosition) ? payload.targetPosition : undefined,
      question,
      analysisMode: requestedAnalysisMode,
      claimKinds: safeClaimKinds,
      conversation: cleanConversation(payload.conversation),
      proposedChange,
      contextRefs: cleanStringArray(payload.contextRefs),
      targetClaimKeys: demoTargetClaimKeys(question, proposedChange),
      coverage: {
        scope: "The complete frozen VCS demonstration contract, economy, cast, dialogue, asset records, and trigger registry.",
        complete: true,
      },
    };
    try {
      const result = await new ContinuityEngine(
        new DemoRetriever(),
        new DemoReasoner(),
        undefined,
        undefined,
        new DemoReachabilityEvaluator(),
        VCS_DEMO_COMPLETENESS_REGISTRY,
      ).query(query);
      return Response.json({
        ...result,
        analysisId: null,
        persistenceWarning: null,
        capability: "validated_demonstration",
      }, { headers: privateNoStoreHeaders() });
    } catch (error) {
      if (error instanceof ContinuityInputError) {
        return Response.json({ error: error.message }, { status: 400, headers: privateNoStoreHeaders() });
      }
      return Response.json({ error: errorMessage(error) }, { status: 502, headers: privateNoStoreHeaders() });
    }
  }

  try {
    const bindings = preloadedBindings ?? await runtimeEnv();
    if (!bindings.DB) throw new Error("Continuity storage is not configured.");
    const repository = new ContinuityRepository(bindings.DB);
    let project = await repository.getProject(projectId);
    if (!project && projectId === "vcs-demo") {
      project = await repository.ensureProject(projectId, "VibeCode Simulator demonstration");
    }
    if (!project) {
      return Response.json({ error: "Project not found." }, { status: 404 });
    }
    const revisionSourceVersionIds = projectId === "vcs-demo"
      ? undefined
      : await repository.listRevisionSourceVersionIds(projectId, project.activeRevision);

    const activeRepositorySnapshot = await repository.getActiveRepositorySnapshot(projectId);
    const repositoryIsQueryable = activeRepositorySnapshot?.indexStatus === "indexed";
    const repositoryScope = activeRepositorySnapshot
      ? repositoryIsQueryable
        ? ` Repository snapshot ${activeRepositorySnapshot.commitSha} contributes ${activeRepositorySnapshot.selectedFileCount} selected files; complete coverage: ${Boolean(activeRepositorySnapshot.coverageComplete)}.`
        : ` Repository snapshot ${activeRepositorySnapshot.commitSha} is stored but excluded from this answer because its index status is ${activeRepositorySnapshot.indexStatus}.`
      : "";
    const requestedClaimKinds = cleanClaimKinds(payload.claimKinds);
    const inferredFocusedClaimKinds = requestedAnalysisMode === "answer_question"
      ? inferFocusedClaimKinds(question)
      : null;
    // Claim-kind input is a request to broaden inspection, never authority to
    // narrow an ambiguous or causal question below the server's safe minimum.
    const safeClaimKinds = inferredFocusedClaimKinds
      ? [...new Set([...inferredFocusedClaimKinds, ...requestedClaimKinds])]
      : [];
    const query: QueryRequest = {
      projectId,
      projectRevision: projectId === "vcs-demo" && !activeRepositorySnapshot
        ? VCS_DEMO_REVISION
        : project.activeRevision,
      timeScope: typeof payload.timeScope === "string" ? payload.timeScope.trim().slice(0, 240) || null : null,
      temporalAxis: typeof payload.temporalAxis === "string" ? payload.temporalAxis.trim().toLowerCase().slice(0, 80) || null : null,
      storyPosition: typeof payload.storyPosition === "number" && Number.isFinite(payload.storyPosition) ? payload.storyPosition : undefined,
      targetPosition: typeof payload.targetPosition === "number" && Number.isFinite(payload.targetPosition) ? payload.targetPosition : undefined,
      question,
      analysisMode: requestedAnalysisMode,
      claimKinds: safeClaimKinds,
      conversation: cleanConversation(payload.conversation),
      proposedChange,
      contextRefs: cleanStringArray(payload.contextRefs),
      sourceVersionIds: revisionSourceVersionIds,
      targetClaimKeys: projectId === "vcs-demo" ? demoTargetClaimKeys(question, proposedChange) : [],
      coverage: projectId === "vcs-demo"
        ? {
            scope: `The complete current VCS trigger registry plus the demo contract, economy, cast, dialogue, and asset records.${repositoryScope}`,
            complete: activeRepositorySnapshot ? Boolean(activeRepositorySnapshot.coverageComplete) : true,
          }
        : {
            scope: `Indexed source fragments with question-scoped causal extraction; exhaustive runtime coverage is not established.${repositoryScope}`,
            complete: false,
          },
    };
    const apiKey = bindings.OPENAI_API_KEY?.trim();
    const vectorBinding = await repository.getProviderBinding(projectId, projectId, "vector_store");
    const vectorStoreId = vectorBinding?.externalId || bindings.OPENAI_VECTOR_STORE_ID?.trim();
    const repositoryVectorStoreId = activeRepositorySnapshot && repositoryIsQueryable
      ? (await repository.getProviderBinding(
          projectId,
          activeRepositorySnapshot.id,
          "repository_vector_store",
        ))?.externalId
      : undefined;

    const providerReady = Boolean(apiKey && (vectorStoreId || repositoryVectorStoreId || projectId === "vcs-demo"));
    const liveWillRun = willRunPaidProvider(enginePreference, providerReady);
    const actorScope = await usageActorScopeKey(request, requestIdentityTrust);
    const actorUsage = await repository.consumeUsage(
      actorScope,
      liveWillRun ? "query_live" : "query_demo",
      liveWillRun ? 10 : 120,
      60 * 60,
    );
    if (!actorUsage.allowed) return rateLimitResponse(actorUsage.retryAfterSeconds);
    if (liveWillRun) {
      const globalUsage = await repository.consumeUsage("global:openai", "query_live", 200, 24 * 60 * 60);
      if (!globalUsage.allowed) return rateLimitResponse(globalUsage.retryAfterSeconds);
    }

    if (enginePreference === "live" && apiKey && activeRepositorySnapshot && !repositoryIsQueryable && !vectorStoreId) {
      return Response.json({
        error: `The pinned repository snapshot is ${activeRepositorySnapshot.indexStatus}; live questions begin only after it is indexed.`,
        code: "snapshot_index_not_ready",
        capability: "stored_only",
      }, { status: 409 });
    }

    let engine: ContinuityEngine;
    if (enginePreference === "demo") {
      if (projectId !== "vcs-demo") {
        return Response.json({ error: "Reviewed demonstration mode is available only for the sample project." }, { status: 400 });
      }
      engine = new ContinuityEngine(
        new DemoRetriever(),
        new DemoReasoner(),
        undefined,
        undefined,
        new DemoReachabilityEvaluator(),
        VCS_DEMO_COMPLETENESS_REGISTRY,
      );
    } else if (apiKey && (vectorStoreId || repositoryVectorStoreId || projectId === "vcs-demo")) {
      const focused = requestedAnalysisMode === "answer_question"
        && safeClaimKinds.length > 0
        && safeClaimKinds.length <= 2
        && safeClaimKinds.every((kind) => ["identity", "configured", "implemented", "tested", "observed"].includes(kind));
      const profile = providerExecutionProfile(requestedAnalysisMode, focused);
      const storeIds = [...new Set([vectorStoreId, repositoryVectorStoreId].filter((id): id is string => Boolean(id)))];
      const queryAllocations = storeIds.map((_id, index) =>
        Math.floor(profile.maxRetrievalQueries / storeIds.length)
          + (index < profile.maxRetrievalQueries % storeIds.length ? 1 : 0));
      const executionBudget = new ProviderExecutionBudget({
        deadlineAt: Date.now() + profile.overallTimeoutMs,
        // One compiler call and one reasoner call are reserved. There are no
        // retries: an expired or failed call leaves the request as a typed,
        // bounded failure.
        maxCalls: queryAllocations.reduce((sum, count) => sum + count, 0) + 2,
      });
      const retrievers = [
        ...(projectId === "vcs-demo" ? [new DemoRetriever()] : []),
        ...storeIds.map((storeId, index) => new OpenAIRetriever({
          apiKey,
          vectorStoreId: storeId,
          maxQueries: Math.max(1, queryAllocations[index] ?? 1),
          maxResults: profile.maxResultsPerQuery,
          timeoutMs: profile.retrievalTimeoutMs,
          executionBudget,
        })),
      ];
      engine = new ContinuityEngine(
        retrievers.length === 1 ? retrievers[0] : new CompositeRetriever(retrievers),
        new OpenAIReasoner({
          apiKey,
          maxOutputTokens: profile.reasonerMaxOutputTokens,
          reasoningEffort: profile.reasoningEffort,
          verbosity: focused ? "low" : "medium",
          timeoutMs: profile.reasonerTimeoutMs,
          executionBudget,
        }),
        undefined,
        projectId === "vcs-demo" ? undefined : new OpenAIEvidenceCompiler({
          apiKey,
          maxFragments: focused ? 10 : 24,
          maxCharactersPerFragment: focused ? 6_000 : 8_000,
          maxOutputTokens: focused ? 3_500 : 8_000,
          timeoutMs: profile.compilerTimeoutMs,
          executionBudget,
        }),
        projectId === "vcs-demo" ? new DemoReachabilityEvaluator() : undefined,
        projectId === "vcs-demo" ? VCS_DEMO_COMPLETENESS_REGISTRY : undefined,
      );
    } else if (enginePreference === "live") {
      return Response.json({
        error: "Live OpenAI analysis is not configured for this project.",
        code: "live_reasoning_not_configured",
        capability: "stored_only",
      }, { status: 409 });
    } else if (projectId === "vcs-demo") {
      engine = new ContinuityEngine(
        new DemoRetriever(),
        new DemoReasoner(),
        undefined,
        undefined,
        new DemoReachabilityEvaluator(),
        VCS_DEMO_COMPLETENESS_REGISTRY,
      );
    } else {
      return Response.json({
        error: "This project's sources are stored, but GPT-5.6 retrieval is not configured yet.",
        code: "retrieval_not_configured",
        capability: "stored_only",
      }, { status: 409 });
    }

    const result = await engine.query(query);
    let analysisId: string | null = null;
    let persistenceWarning: string | null = null;
    try {
      analysisId = scope.ownerScope === "shared-sample" ? null : await repository.saveAnalysis(projectId, result);
    } catch (error) {
      persistenceWarning = `The answer was produced but its audit record could not be saved: ${errorMessage(error)}`;
    }

    return Response.json({
      ...result,
      analysisId,
      persistenceWarning,
      capability: result.mode === "gpt-5.6-sol" ? "gpt-5.6-sol" : "validated_demonstration",
    }, { headers: privateNoStoreHeaders() });
  } catch (error) {
    if (error instanceof ContinuityInputError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof ProviderExecutionError || error instanceof EvidenceCompilerError) {
      return providerFailureResponse(error);
    }
    return Response.json({ error: errorMessage(error) }, { status: 502 });
  }
}
