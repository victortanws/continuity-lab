import {
  CLAIM_KINDS,
  CONTINUITY_ANSWER_SCHEMA,
  CONTINUITY_ANSWER_VERSION,
  FOCUSED_CONTINUITY_ANSWER_SCHEMA,
  type AnalysisRoute,
  type CanonAuthority,
  type ClaimKind,
  type ContinuityAnswer,
  type ContinuityReasoner,
  type EvidenceChunk,
  type EvidenceLifecycle,
  type EvidenceRetriever,
  type EvidenceRole,
  type QueryRequest,
  type RetrievalLane,
  type RetrievalLaneId,
  type RetrievalPlan,
  type TrustedReachability,
} from "../contracts";
import { assertionBoundaryFor } from "../assertion-boundary";
import { classifyEvidence } from "../policy/default";
import {
  buildContinuityInput,
  buildContinuityInstructions,
  buildFocusedContinuityInput,
  buildFocusedContinuityInstructions,
} from "../prompt";
import { decodeRepositoryPacketMetadata, isSafeRepositoryPath } from "../repositories/github";

const OPENAI_API_BASE = "https://api.openai.com/v1";
export const CONTINUITY_MODEL = "gpt-5.6-sol";

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type OpenAIRetrieverOptions = {
  apiKey: string;
  vectorStoreId: string;
  fetch?: FetchLike;
  maxResults?: number;
  maxQueries?: number;
  timeoutMs?: number;
  executionBudget?: ProviderExecutionBudget;
};

export type OpenAIReasonerOptions = {
  apiKey: string;
  fetch?: FetchLike;
  maxOutputTokens?: number;
  timeoutMs?: number;
  reasoningEffort?: "low" | "medium" | "high";
  verbosity?: "low" | "medium" | "high";
  executionBudget?: ProviderExecutionBudget;
};

export type ProviderExecutionFailureCode =
  | "provider_deadline_exceeded"
  | "provider_call_limit_exceeded"
  | "retrieval_query_limit_exceeded"
  | "provider_request_failed"
  | "provider_response_error";

/**
 * A request-scoped, server-owned budget shared by retrieval, compilation, and
 * reasoning. Acquiring a signal is synchronous, so concurrent retrieval lanes
 * cannot race past the call cap. There is deliberately no retry method.
 */
export class ProviderExecutionBudget {
  readonly deadlineAt: number;
  readonly maxCalls: number;
  private callsStarted = 0;

  constructor(options: { deadlineAt: number; maxCalls: number }) {
    if (!Number.isFinite(options.deadlineAt)) throw new Error("A finite provider deadline is required");
    this.deadlineAt = Math.floor(options.deadlineAt);
    this.maxCalls = boundedInteger(options.maxCalls, 1, 1, 100);
  }

  signalFor(phase: string, perCallTimeoutMs: number): AbortSignal {
    const remainingMs = this.deadlineAt - Date.now();
    if (remainingMs <= 0) {
      throw new ProviderExecutionError(
        "The server-owned provider deadline was reached before the next call could begin.",
        "provider_deadline_exceeded",
        phase,
        504,
      );
    }
    if (this.callsStarted >= this.maxCalls) {
      throw new ProviderExecutionError(
        "The server-owned provider call limit was reached.",
        "provider_call_limit_exceeded",
        phase,
        503,
      );
    }
    this.callsStarted += 1;
    return AbortSignal.timeout(Math.max(1, Math.min(perCallTimeoutMs, remainingMs)));
  }

  snapshot(): { callsStarted: number; maxCalls: number; remainingMs: number } {
    return {
      callsStarted: this.callsStarted,
      maxCalls: this.maxCalls,
      remainingMs: Math.max(0, this.deadlineAt - Date.now()),
    };
  }
}

export class ProviderExecutionError extends Error {
  constructor(
    message: string,
    readonly code: ProviderExecutionFailureCode,
    readonly phase: string,
    readonly httpStatus: number,
    readonly providerStatus: number | null = null,
  ) {
    super(message);
    this.name = "ProviderExecutionError";
  }
}

export class OpenAIRetriever implements EvidenceRetriever {
  private readonly options: OpenAIRetrieverOptions;
  private readonly fetchImpl: FetchLike;
  private readonly maxResults: number;
  private readonly maxQueries: number;
  private readonly timeoutMs: number;
  private readonly executionBudget: ProviderExecutionBudget | null;

  constructor(options: OpenAIRetrieverOptions);
  constructor(apiKey: string, vectorStoreId: string, fetchImpl?: FetchLike);
  constructor(optionsOrApiKey: OpenAIRetrieverOptions | string, vectorStoreId?: string, fetchImpl?: FetchLike) {
    const options = typeof optionsOrApiKey === "string"
      ? { apiKey: optionsOrApiKey, vectorStoreId: vectorStoreId ?? "", fetch: fetchImpl }
      : optionsOrApiKey;
    requireConfiguration(options.apiKey, "OpenAI API key");
    requireConfiguration(options.vectorStoreId, "OpenAI vector store ID");
    this.options = options;
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.maxResults = Math.max(1, Math.min(50, Math.floor(options.maxResults ?? 16)));
    this.maxQueries = boundedInteger(options.maxQueries, 6, 1, 12);
    this.timeoutMs = boundedInteger(options.timeoutMs, 30_000, 1_000, 60_000);
    this.executionBudget = options.executionBudget ?? null;
  }

  async retrieve(request: QueryRequest, plan?: RetrievalPlan): Promise<EvidenceChunk[]> {
    const baseQuery = request.proposedChange?.trim()
      ? `${request.question}\nProposed change: ${request.proposedChange.trim()}`
      : request.question;
    const contextRefs = (request.contextRefs ?? []).slice(0, 8);
    if (contextRefs.length > this.maxQueries) {
      throw new OpenAIProviderError(
        `This request names ${contextRefs.length} exact context references, exceeding the bounded retrieval-query limit of ${this.maxQueries}.`,
        null,
        "retrieval_query_limit_exceeded",
        "retrieval",
        400,
      );
    }
    const candidates: Array<{
      id: RetrievalLaneId | null;
      lane: RetrievalLane | null;
      query: string;
      maxResults: number;
      contextRef: string | null;
    }> = [
      ...contextRefs.map((contextRef) => ({
        id: null,
        lane: null,
        query: `Exact source reference: ${contextRef}`,
        maxResults: Math.min(this.maxResults, 10),
        contextRef,
      })),
      ...(plan?.lanes.length
      ? plan.lanes.map((lane) => ({
        id: lane.id,
        lane,
        query: lane.query,
        maxResults: Math.min(this.maxResults, lane.maxResults),
        contextRef: null,
      }))
      : [{ id: null, lane: null, query: baseQuery, maxResults: this.maxResults, contextRef: null }]),
    ];
    const searches = candidates.slice(0, this.maxQueries);
    const batches = await Promise.all(searches.map(async (search) => {
      let payload: unknown;
      try {
        const response = await this.fetchImpl(
          `${OPENAI_API_BASE}/vector_stores/${encodeURIComponent(this.options.vectorStoreId)}/search`,
          {
            method: "POST",
            headers: openAIHeaders(this.options.apiKey),
            signal: providerSignal(this.executionBudget, "retrieval", this.timeoutMs),
            body: JSON.stringify({
              query: search.query,
              max_num_results: search.maxResults,
              filters: { type: "eq", key: "project_id", value: request.projectId },
            }),
          },
        );
        if (!response.ok) {
          throw await providerError(`Vector store ${search.id ?? "default"} search failed`, response, "retrieval");
        }
        payload = await response.json() as unknown;
      } catch (error) {
        throw normalizeProviderFailure(error, "retrieval");
      }
      const results = isRecord(payload) && Array.isArray(payload.data) ? payload.data : [];
      let chunks = results.flatMap((result) => mapSearchResult(result, request.projectId));
      if (request.sourceVersionIds) {
        const admittedVersions = new Set(request.sourceVersionIds);
        chunks = chunks.filter((chunk) => admittedVersions.has(chunk.sourceVersionId));
      }
      if (search.contextRef) {
        chunks = chunks.filter((chunk) => matchesContextReference(chunk, search.contextRef!));
        if (!chunks.length) {
          throw new OpenAIProviderError(`Requested context reference was not found in the pinned project revision: ${search.contextRef}`);
        }
      }
      if (!search.id || !search.lane) return chunks;
      // Search similarity is only a candidate generator. Discard cross-lane
      // hits here so a downstream fallback cannot relabel an authority record
      // as execution or verification merely because its prose was similar.
      return chunks.filter((chunk) => evidenceMatchesLane(chunk, search.lane!)).map((chunk) => ({
        ...chunk,
        retrievalLaneIds: [search.id!],
      }));
    }));
    return mergeRetrievedEvidence(batches.flat());
  }
}

function matchesContextReference(chunk: EvidenceChunk, contextRef: string): boolean {
  const expected = contextRef.trim().toLowerCase();
  if (!expected) return false;
  const candidates = [chunk.id, chunk.sourceId, chunk.sourceVersionId, chunk.title, chunk.locator]
    .map((value) => value.trim().toLowerCase());
  return candidates.some((value) => value === expected || value.endsWith(`/${expected}`));
}

export class OpenAIReasoner implements ContinuityReasoner {
  readonly mode = "gpt-5.6-sol" as const;
  readonly model = CONTINUITY_MODEL;
  private readonly options: OpenAIReasonerOptions;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;

  constructor(options: OpenAIReasonerOptions);
  constructor(apiKey: string, fetchImpl?: FetchLike);
  constructor(optionsOrApiKey: OpenAIReasonerOptions | string, fetchImpl?: FetchLike) {
    const options = typeof optionsOrApiKey === "string" ? { apiKey: optionsOrApiKey, fetch: fetchImpl } : optionsOrApiKey;
    requireConfiguration(options.apiKey, "OpenAI API key");
    this.options = options;
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.timeoutMs = boundedInteger(options.timeoutMs, 45_000, 1_000, 90_000);
  }

  async answer(
    request: QueryRequest,
    evidence: EvidenceChunk[],
    route?: AnalysisRoute,
    trustedReachability?: TrustedReachability | null,
  ): Promise<ContinuityAnswer> {
    const evidenceSnapshot = await snapshotId(evidence);
    const focusedTier = usesFocusedReasoningTier(request, route, trustedReachability);
    const instructions = focusedTier
      ? buildFocusedContinuityInstructions()
      : buildContinuityInstructions();
    const input = focusedTier && route
      ? buildFocusedContinuityInput(request, evidence, route)
      : buildContinuityInput(request, evidence, route, trustedReachability);
    let response: Response;
    let payload: unknown;
    try {
      response = await this.fetchImpl(`${OPENAI_API_BASE}/responses`, {
        method: "POST",
        headers: openAIHeaders(this.options.apiKey),
        signal: providerSignal(this.options.executionBudget ?? null, "reasoning", this.timeoutMs),
        body: JSON.stringify({
          model: CONTINUITY_MODEL,
          reasoning: { effort: this.options.reasoningEffort ?? "medium" },
          instructions,
          input: `${input}\n<evidence_snapshot>${evidenceSnapshot}</evidence_snapshot>`,
          text: {
            verbosity: this.options.verbosity ?? (focusedTier ? "low" : "medium"),
            format: {
              type: "json_schema",
              name: focusedTier ? "continuity_focused_answer" : "continuity_answer",
              strict: true,
              schema: focusedTier ? FOCUSED_CONTINUITY_ANSWER_SCHEMA : CONTINUITY_ANSWER_SCHEMA,
            },
          },
          max_output_tokens: focusedTier
            ? boundedInteger(this.options.maxOutputTokens, 1_800, 800, 3_000)
            : boundedInteger(this.options.maxOutputTokens, 6_000, 2_500, 6_000),
          store: false,
        }),
      });
      if (!response.ok) throw await providerError("Continuity reasoning failed", response, "reasoning");
      payload = await response.json() as unknown;
    } catch (error) {
      throw normalizeProviderFailure(error, "reasoning");
    }
    const outputText = extractOutputText(payload);
    if (!outputText) {
      throw new OpenAIProviderError(
        "Continuity reasoning returned no structured output",
        response.status,
        "provider_response_error",
        "reasoning",
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(outputText);
    } catch {
      throw new OpenAIProviderError(
        "Continuity reasoning returned invalid JSON",
        response.status,
        "provider_response_error",
        "reasoning",
      );
    }
    const answer = focusedTier
      ? expandFocusedAnswer(parsed, request, evidenceSnapshot)
      : requireContinuityAnswer(parsed);

    // Pin the response to this request even if a model copied a question from
    // conversation context. The engine will independently validate citations.
    return {
      ...answer,
      version: CONTINUITY_ANSWER_VERSION,
      projectRevision: request.projectRevision?.trim() || evidenceSnapshot,
      question: request.question,
      caveats: [...answer.caveats, `Evidence projection: ${evidenceSnapshot}`],
    };
  }
}

/** The compact path is intentionally narrow: simple identity lookups only. */
export function usesFocusedReasoningTier(
  request: QueryRequest,
  route?: AnalysisRoute,
  trustedReachability?: TrustedReachability | null,
): boolean {
  return Boolean(
    route
    && route.presentationDepth === "focused"
    && route.mode === "answer_question"
    && route.claimKinds.length === 1
    && route.claimKinds[0] === "identity"
    && route.budget.maxReachabilityPasses === 0
    && !request.proposedChange?.trim()
    && !(request.targetClaimKeys?.length)
    && !trustedReachability,
  );
}

function boundedInteger(value: number | undefined, fallback: number, minimum: number, maximum: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.floor(value)));
}

export class OpenAIProviderError extends ProviderExecutionError {
  readonly status: number | null;

  constructor(
    message: string,
    status: number | null = null,
    code: ProviderExecutionFailureCode = "provider_response_error",
    phase = "openai",
    httpStatus = status === 429 ? 503 : 502,
  ) {
    super(message, code, phase, httpStatus, status);
    this.name = "OpenAIProviderError";
    this.status = status;
  }
}

function providerSignal(
  budget: ProviderExecutionBudget | null,
  phase: string,
  timeoutMs: number,
): AbortSignal {
  return budget?.signalFor(phase, timeoutMs) ?? AbortSignal.timeout(timeoutMs);
}

function normalizeProviderFailure(error: unknown, phase: string): ProviderExecutionError {
  if (error instanceof ProviderExecutionError) return error;
  if (isTimeoutFailure(error)) {
    return new OpenAIProviderError(
      `The ${phase} provider call reached its bounded time limit.`,
      null,
      "provider_deadline_exceeded",
      phase,
      504,
    );
  }
  return new OpenAIProviderError(
    `The ${phase} provider request failed before a response was received.`,
    null,
    "provider_request_failed",
    phase,
  );
}

function isTimeoutFailure(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}

function mapSearchResult(value: unknown, requestedProjectId: string): EvidenceChunk[] {
  if (!isRecord(value)) return [];
  const attributes = isRecord(value.attributes) ? value.attributes : {};
  const projectId = stringAttribute(attributes, "project_id");
  const sourceId = stringAttribute(attributes, "source_id");
  const sourceVersionId = stringAttribute(attributes, "source_version_id");

  // Retrieval isolation is fail-closed. OpenAI file IDs and vector-store IDs
  // are provider bindings; they are intentionally never used as domain IDs.
  if (projectId !== requestedProjectId || !sourceId || !sourceVersionId) return [];

  const content = Array.isArray(value.content)
    ? value.content.filter(isRecord).map((part) => typeof part.text === "string" ? part.text.trim() : "").filter(Boolean)
    : [];
  const score = typeof value.score === "number" && Number.isFinite(value.score) ? value.score : 0;
  const baseLocator = stringAttribute(attributes, "locator")
    || (typeof value.filename === "string" ? value.filename : "")
    || `source:${sourceId}`;
  const explicitFragmentId = stringAttribute(attributes, "fragment_id") || stringAttribute(attributes, "evidence_id");
  const title = stringAttribute(attributes, "title")
    || (typeof value.filename === "string" ? value.filename : "")
    || sourceId;
  const authority = parseAuthority(stringAttribute(attributes, "authority"));
  const role = parseRole(stringAttribute(attributes, "role"));
  const lifecycle = parseLifecycle(stringAttribute(attributes, "lifecycle"));
  const claimKinds = parseStringListAttribute(attributes, "claim_kinds").flatMap(parseClaimKinds);
  const validFrom = nullableStringAttribute(attributes, "valid_from");
  const validTo = nullableStringAttribute(attributes, "valid_to");
  const temporalAxis = nullableStringAttribute(attributes, "temporal_axis");
  const validFromOrder = nullableNumberAttribute(attributes, "valid_from_order");
  const validToOrder = nullableNumberAttribute(attributes, "valid_to_order");
  const epistemicOwner = nullableStringAttribute(attributes, "epistemic_owner");
  const world = nullableStringAttribute(attributes, "world");
  const supersedesSourceId = nullableStringAttribute(attributes, "supersedes_source_id");
  const supersedesEvidenceIds = parseStringListAttribute(attributes, "supersedes_evidence_ids");
  const supersessionScopeValue = nullableStringAttribute(attributes, "supersession_scope");
  const supersessionScope = supersessionScopeValue === "evidence" || supersessionScopeValue === "source"
    ? supersessionScopeValue
    : null;
  const authorityRank = nullableNumberAttribute(attributes, "authority_rank");
  const closedWorld = booleanAttribute(attributes, "closed_world");
  const claimKey = nullableStringAttribute(attributes, "claim_key");
  const polarityValue = nullableStringAttribute(attributes, "polarity");
  const polarity = polarityValue === "positive" || polarityValue === "negative" ? polarityValue : null;
  const referentKeys = parseStringListAttribute(attributes, "referent_keys");

  const repositoryPacket = /^github:[a-f\d]{40}$/i.test(baseLocator);
  const fragments = content.flatMap((text, contentIndex) => repositoryPacket
    ? repositoryFragmentsFromChunk(text).map((fragment) => ({ ...fragment, contentIndex }))
    : [{ text, repositoryMetadata: null, flags: [] as string[], contentIndex }]);

  return fragments.map((fragment, index) => {
    const { text, repositoryMetadata } = fragment;
    const repositoryPath = repositoryMetadata?.path ?? null;
    const lineSuffix = repositoryMetadata ? `#L${repositoryMetadata.startLine}-L${repositoryMetadata.endLine}` : "";
    const locator = repositoryPath
      ? `${baseLocator}/${repositoryPath}${lineSuffix}`
      : fragments.length === 1 ? baseLocator : `${baseLocator} / match ${fragment.contentIndex + 1}.${index + 1}`;
    // The locator participates in identity. Two files can legitimately contain
    // identical prose; they must not collapse merely because their text does.
    const textHash = stableHash(`${sourceVersionId}\u0000${locator}\u0000${text}`);
    const id = explicitFragmentId
      ? fragments.length === 1 ? explicitFragmentId : `${explicitFragmentId}:${textHash}`
      : `EV-${sourceVersionId}-${textHash}`;
    const trustedMetadata = {
      role: repositoryMetadata?.role ?? role,
      lifecycle: repositoryMetadata?.lifecycle ?? lifecycle,
      claimKinds: repositoryMetadata?.claimKinds?.length ? repositoryMetadata.claimKinds : claimKinds,
    };
    const profile = classifyEvidence({
      title: repositoryPath || title,
      locator,
      role: trustedMetadata.role ?? undefined,
      lifecycle: trustedMetadata.lifecycle ?? undefined,
      claimKinds: trustedMetadata.claimKinds,
    });
    return {
      id,
      projectId,
      sourceId,
      sourceVersionId,
      title: repositoryPath || title,
      locator,
      text,
      score,
      authority: repositoryMetadata?.authority ?? authority,
      role: profile.role,
      lifecycle: profile.lifecycle,
      claimKinds: profile.claimKinds,
      authorityRank,
      epistemicOwner,
      world,
      validFrom,
      validTo,
      temporalAxis,
      validFromOrder,
      validToOrder,
      supersedesSourceId,
      supersedesEvidenceIds,
      supersessionScope,
      closedWorld: repositoryMetadata?.closedWorld ?? closedWorld,
      claimKey,
      polarity,
      referentKeys,
      flags: fragment.flags.length ? fragment.flags : undefined,
    };
  });
}

function evidenceMatchesLane(chunk: EvidenceChunk, lane: RetrievalLane): boolean {
  if (!chunk.role || !lane.roles.includes(chunk.role)) return false;
  const claimKinds = chunk.claimKinds ?? [];
  return claimKinds.some((claimKind) => lane.claimKinds.includes(claimKind));
}

function mergeRetrievedEvidence(chunks: EvidenceChunk[]): EvidenceChunk[] {
  const merged = new Map<string, EvidenceChunk>();
  for (const chunk of chunks) {
    const existing = merged.get(chunk.id);
    if (!existing) {
      merged.set(chunk.id, chunk);
      continue;
    }
    const samePayload = retrievedPayloadSignature(existing) === retrievedPayloadSignature(chunk);
    const winner = chunk.score > existing.score ? chunk : existing;
    const retrievalLaneIds = samePayload
      ? [...new Set<RetrievalLaneId>([
          ...(existing.retrievalLaneIds ?? []),
          ...(chunk.retrievalLaneIds ?? []),
        ])]
      : winner.retrievalLaneIds ?? [];
    merged.set(chunk.id, {
      ...winner,
      retrievalLaneIds,
      score: Math.max(existing.score, chunk.score),
      flags: [...new Set([
        ...(winner.flags ?? []),
        ...(samePayload ? [] : ["evidence_id_collision"]),
      ])],
    });
  }
  return [...merged.values()].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

function retrievedPayloadSignature(chunk: EvidenceChunk): string {
  return JSON.stringify({
    title: chunk.title,
    sourceId: chunk.sourceId,
    sourceVersionId: chunk.sourceVersionId,
    locator: chunk.locator,
    text: chunk.text,
    authority: chunk.authority,
    authorityRank: chunk.authorityRank ?? null,
    role: chunk.role,
    lifecycle: chunk.lifecycle,
    claimKinds: chunk.claimKinds,
    claimKind: chunk.claimKind ?? null,
    claimKey: chunk.claimKey,
    polarity: chunk.polarity ?? null,
    referentKeys: [...(chunk.referentKeys ?? [])].sort(),
    entityCandidates: [...(chunk.entityCandidates ?? [])].sort((left, right) => left.id.localeCompare(right.id)),
    parentEvidenceId: chunk.parentEvidenceId ?? null,
    quoteStart: chunk.quoteStart ?? null,
    quoteEnd: chunk.quoteEnd ?? null,
    world: chunk.world,
    epistemicOwner: chunk.epistemicOwner,
    validFrom: chunk.validFrom ?? null,
    validTo: chunk.validTo ?? null,
    temporalAxis: chunk.temporalAxis ?? null,
    validFromOrder: chunk.validFromOrder ?? null,
    validToOrder: chunk.validToOrder ?? null,
    closedWorld: Boolean(chunk.closedWorld),
    supersedesSourceId: chunk.supersedesSourceId ?? null,
    supersedesEvidenceIds: [...(chunk.supersedesEvidenceIds ?? [])].sort(),
    supersessionScope: chunk.supersessionScope ?? null,
    flags: [...(chunk.flags ?? [])].sort(),
  });
}

type RepositoryChunkMetadata = {
  path: string;
  authority: CanonAuthority;
  closedWorld: boolean;
  startLine: number;
  endLine: number;
  role: EvidenceRole | null;
  lifecycle: EvidenceLifecycle | null;
  claimKinds: ClaimKind[];
};

type RepositoryFragment = {
  text: string;
  repositoryMetadata: RepositoryChunkMetadata | null;
  flags: string[];
};

const REPOSITORY_FRAME_START = /<!--\s*CONTINUITY_FILE\s+([^>]+?)\s*-->/gi;
const REPOSITORY_FRAME_END = /<!--\s*\/CONTINUITY_FILE(?:\s+([^>]*?))?\s*-->/gi;
const REPOSITORY_FRAME_CONTROL = /<!--\s*\/?CONTINUITY_FILE\b[^>]*?-->/gi;

/**
 * Vector search can return a window crossing packet boundaries. Split that
 * window into server-authored file frames before assigning metadata, so a tail
 * from file A cannot inherit a start marker belonging to file B.
 *
 * A valid start marker is sufficient because a search window can end before
 * its close marker. Unframed text remains available as low-authority packet
 * evidence (or is classified from a server-authored FILE heading), but never
 * receives metadata from an adjacent frame.
 */
function repositoryFragmentsFromChunk(text: string): RepositoryFragment[] {
  const starts = [...text.matchAll(REPOSITORY_FRAME_START)];
  if (!starts.length) {
    const fragment = unframedRepositoryFragment(text);
    return fragment.text ? [fragment] : [];
  }

  const fragments: RepositoryFragment[] = [];
  let cursor = 0;
  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index];
    const startIndex = start.index ?? 0;
    const markerEnd = startIndex + start[0].length;
    const nextStartIndex = starts[index + 1]?.index ?? text.length;

    if (startIndex > cursor) {
      const prefix = unframedRepositoryFragment(text.slice(cursor, startIndex));
      if (prefix.text) fragments.push(prefix);
    }

    const region = text.slice(markerEnd, nextStartIndex);
    const closing = [...region.matchAll(REPOSITORY_FRAME_END)][0];
    const bodyEnd = closing?.index ?? region.length;
    const metadata = repositoryMetadataFromMarker(start[1] ?? "");
    const closingPath = closing ? pathFromRepositoryMarker(closing[1] ?? "") : null;
    const closingMatches = !closing || (metadata !== null && closingPath === metadata.path);
    const body = cleanRepositoryFragmentText(region.slice(0, bodyEnd));

    if (body) {
      fragments.push({
        text: body,
        // A mismatched close makes the boundary ambiguous. Keep the prose, but
        // do not grant it the start marker's stronger authority.
        repositoryMetadata: closingMatches ? metadata : repositoryMetadataFromHeading(body),
        flags: [
          ...(!closing ? ["repository_frame_truncated"] : []),
          ...(!closingMatches ? ["repository_frame_mismatch"] : []),
          ...(!metadata ? ["repository_frame_invalid"] : []),
        ],
      });
    }

    cursor = closing
      ? markerEnd + (closing.index ?? 0) + closing[0].length
      : nextStartIndex;
  }

  if (cursor < text.length) {
    const suffix = unframedRepositoryFragment(text.slice(cursor));
    if (suffix.text) fragments.push(suffix);
  }
  return fragments;
}

function unframedRepositoryFragment(text: string): RepositoryFragment {
  const cleanText = cleanRepositoryFragmentText(text);
  return {
    text: cleanText,
    repositoryMetadata: repositoryMetadataFromHeading(cleanText),
    flags: cleanText ? ["repository_frame_unframed"] : [],
  };
}

function cleanRepositoryFragmentText(text: string): string {
  return text.replace(REPOSITORY_FRAME_CONTROL, "").trim();
}

function repositoryMetadataFromMarker(marker: string): RepositoryChunkMetadata | null {
  const token = marker.trim().match(/^metadata=([A-Za-z0-9_-]{1,8192})$/)?.[1];
  if (!token) return null;
  const metadata = decodeRepositoryPacketMetadata(token);
  if (!metadata) return null;
  return {
    path: metadata.path,
    authority: metadata.authority,
    closedWorld: metadata.closedWorld,
    startLine: metadata.startLine,
    endLine: metadata.endLine,
    role: metadata.role,
    lifecycle: metadata.lifecycle,
    claimKinds: metadata.claimKinds,
  };
}

function pathFromRepositoryMarker(marker: string): string | null {
  const token = marker.trim().match(/^metadata=([A-Za-z0-9_-]{1,8192})$/)?.[1];
  return token ? decodeRepositoryPacketMetadata(token)?.path ?? null : null;
}

function repositoryMetadataFromHeading(text: string): RepositoryChunkMetadata | null {
  const heading = text.match(/^## FILE:\s+([^\n·]+?)\s+·\s+lines\s+(\d+)-(\d+)/m);
  let path = "";
  try {
    path = decodeURIComponent(heading?.[1]?.trim().slice(0, 1_536) ?? "");
  } catch {
    return null;
  }
  const startLine = Number(heading?.[2]);
  const endLine = Number(heading?.[3]);
  return path && isSafeRepositoryPath(path) && Number.isSafeInteger(startLine) && Number.isSafeInteger(endLine)
    ? { path, authority: "reference", closedWorld: false, startLine, endLine, role: null, lifecycle: null, claimKinds: [] }
    : null;
}

function extractOutputText(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  if (typeof payload.output_text === "string" && payload.output_text.trim()) return payload.output_text;
  if (!Array.isArray(payload.output)) return null;

  const textParts: string[] = [];
  for (const item of payload.output) {
    if (!isRecord(item) || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (!isRecord(content)) continue;
      if ((content.type === "output_text" || content.type === "text") && typeof content.text === "string") {
        textParts.push(content.text);
      }
    }
  }
  return textParts.length ? textParts.join("") : null;
}

type FocusedContinuityAnswer = Pick<
  ContinuityAnswer,
  | "verdict"
  | "truthStatus"
  | "answer"
  | "confidence"
  | "evidence"
  | "conclusions"
  | "analysisChecks"
  | "entities"
  | "conflicts"
  | "caveats"
>;

function requireContinuityAnswer(value: unknown): ContinuityAnswer {
  assertContinuityAnswer(value);
  return value;
}

function expandFocusedAnswer(
  value: unknown,
  request: QueryRequest,
  evidenceSnapshot: string,
): ContinuityAnswer {
  assertFocusedContinuityAnswer(value);
  return {
    version: CONTINUITY_ANSWER_VERSION,
    projectRevision: request.projectRevision?.trim() || evidenceSnapshot,
    timeScope: request.timeScope ?? null,
    question: request.question,
    ...value,
    reachability: {
      status: "not_evaluated",
      completenessScope: "Tier-1 identity lookup; causal reachability was not evaluated.",
      targetClaimKeys: [],
      blockers: [],
      assumptions: [],
      path: [],
    },
    dependencies: [],
    proposal: null,
    followUpQuestions: [],
  };
}

function assertFocusedContinuityAnswer(value: unknown): asserts value is FocusedContinuityAnswer {
  if (!isRecord(value)
    || !["SUPPORTED", "CONFLICT", "AMBIGUOUS", "INSUFFICIENT_EVIDENCE"].includes(String(value.verdict))
    || !isTruthStatus(value.truthStatus)
    || typeof value.answer !== "string"
    || !["low", "medium", "high"].includes(String(value.confidence))
    || !isArrayOf(value.evidence, isEvidenceReference)
    || !isArrayOf(value.conclusions, isConclusionClaim)
    || !isArrayOf(value.analysisChecks, isAnalysisCheckFinding)
    || !isArrayOf(value.entities, isEntityReference)
    || !isArrayOf(value.conflicts, isConflict)
    || !isStringArray(value.caveats)) {
    throw new OpenAIProviderError("Focused continuity reasoning returned an answer outside the required contract");
  }
}

function assertContinuityAnswer(value: unknown): asserts value is ContinuityAnswer {
  if (!isRecord(value)
    || value.version !== CONTINUITY_ANSWER_VERSION
    || typeof value.projectRevision !== "string"
    || !(typeof value.timeScope === "string" || value.timeScope === null)
    || typeof value.question !== "string"
    || !isVerdict(value.verdict)
    || !isTruthStatus(value.truthStatus)
    || !isRecord(value.reachability)
    || !isReachabilityStatus(value.reachability.status)
    || typeof value.reachability.completenessScope !== "string"
    || !isStringArray(value.reachability.targetClaimKeys)
    || !isStringArray(value.reachability.blockers)
    || !isStringArray(value.reachability.assumptions)
    || !isStringArray(value.reachability.path)
    || typeof value.answer !== "string"
    || !["low", "medium", "high"].includes(String(value.confidence))
    || !isArrayOf(value.evidence, isEvidenceReference)
    || !isArrayOf(value.conclusions, isConclusionClaim)
    || !isArrayOf(value.analysisChecks, isAnalysisCheckFinding)
    || !isArrayOf(value.entities, isEntityReference)
    || !isArrayOf(value.conflicts, isConflict)
    || !isArrayOf(value.dependencies, isDependency)
    || !(value.proposal === null || isChangeProposal(value.proposal))
    || !isStringArray(value.followUpQuestions)
    || !isStringArray(value.caveats)) {
    throw new OpenAIProviderError("Continuity reasoning returned an answer outside the required contract");
  }
}

function openAIHeaders(apiKey: string): Record<string, string> {
  return { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
}

async function providerError(prefix: string, response: Response, phase: string): Promise<OpenAIProviderError> {
  let detail = "";
  try {
    const payload = await response.json() as unknown;
    if (isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === "string") detail = payload.error.message;
  } catch {
    // Avoid echoing arbitrary response bodies. Provider error messages are the
    // only safe detail exposed to callers.
  }
  return new OpenAIProviderError(
    detail ? `${prefix}: ${detail}` : prefix,
    response.status,
    "provider_response_error",
    phase,
  );
}

async function snapshotId(evidence: EvidenceChunk[]): Promise<string> {
  const manifest = evidence.map((chunk) => {
    const assertionBoundary = assertionBoundaryFor(chunk);
    return ({
    id: chunk.id,
    projectId: chunk.projectId,
    sourceId: chunk.sourceId,
    sourceVersionId: chunk.sourceVersionId,
    title: chunk.title,
    locator: chunk.locator,
    text: chunk.text,
    score: chunk.score,
    authority: chunk.authority,
    authorityRank: chunk.authorityRank ?? null,
    role: chunk.role ?? null,
    lifecycle: chunk.lifecycle ?? null,
    claimKinds: [...(chunk.claimKinds ?? [])].sort(),
    claimKind: chunk.claimKind ?? null,
    claimKey: chunk.claimKey ?? null,
    polarity: chunk.polarity ?? null,
    referentKeys: [...(chunk.referentKeys ?? [])].sort(),
    entityCandidates: [...(chunk.entityCandidates ?? [])].sort((left, right) => left.id.localeCompare(right.id)),
    parentEvidenceId: chunk.parentEvidenceId ?? null,
    quoteStart: chunk.quoteStart ?? null,
    quoteEnd: chunk.quoteEnd ?? null,
    world: chunk.world ?? null,
    epistemicOwner: chunk.epistemicOwner ?? null,
    assertionScope: assertionBoundary.scope,
    assertionOwnerId: assertionBoundary.ownerId,
    validFrom: chunk.validFrom ?? null,
    validTo: chunk.validTo ?? null,
    temporalAxis: chunk.temporalAxis ?? null,
    validFromOrder: chunk.validFromOrder ?? null,
    validToOrder: chunk.validToOrder ?? null,
    supersedesSourceId: chunk.supersedesSourceId ?? null,
    supersedesEvidenceIds: [...(chunk.supersedesEvidenceIds ?? [])].sort(),
    supersessionScope: chunk.supersessionScope ?? null,
    closedWorld: Boolean(chunk.closedWorld),
    retrievalLaneIds: [...(chunk.retrievalLaneIds ?? [])].sort(),
    flags: [...(chunk.flags ?? [])].sort(),
    });
  }).sort((left, right) =>
    left.id.localeCompare(right.id)
    || left.sourceId.localeCompare(right.sourceId)
    || left.locator.localeCompare(right.locator));
  const bytes = new TextEncoder().encode(JSON.stringify(manifest));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `evidence-snapshot-sha256-${hex}`;
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function parseAuthority(value: string): CanonAuthority {
  return ["immutable", "canon", "retcon", "production", "proposal", "reference"].includes(value)
    ? value as CanonAuthority
    : "reference";
}

function parseRole(value: string): EvidenceRole | null {
  const roles: EvidenceRole[] = [
    "intent", "decision", "configuration", "implementation", "test", "observation",
    "proposal", "archive", "asset", "reference", "evaluation",
  ];
  return roles.includes(value as EvidenceRole) ? value as EvidenceRole : null;
}

function parseLifecycle(value: string): EvidenceLifecycle | null {
  const lifecycles: EvidenceLifecycle[] = ["active", "proposed", "superseded", "historical", "unknown"];
  return lifecycles.includes(value as EvidenceLifecycle) ? value as EvidenceLifecycle : null;
}

function parseClaimKinds(value: string): ClaimKind[] {
  const allowed = new Set<ClaimKind>([
    "identity", "normative", "configured", "implemented", "tested", "observed", "causal", "historical",
  ]);
  return value.split(",").map((item) => item.trim()).filter((item): item is ClaimKind => allowed.has(item as ClaimKind));
}

function requireConfiguration(value: string, label: string): void {
  if (!value.trim()) throw new OpenAIProviderError(`${label} is required`);
}

function stringAttribute(attributes: Record<string, unknown>, key: string): string {
  const value = attributes[key];
  return typeof value === "string" ? value.trim() : "";
}

function nullableStringAttribute(attributes: Record<string, unknown>, key: string): string | null {
  return stringAttribute(attributes, key) || null;
}

function nullableNumberAttribute(attributes: Record<string, unknown>, key: string): number | null {
  const value = attributes[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function parseStringListAttribute(attributes: Record<string, unknown>, key: string): string[] {
  const value = attributes[key];
  if (Array.isArray(value)) {
    return [...new Set(value.filter((item): item is string => typeof item === "string")
      .map((item) => item.trim()).filter(Boolean))];
  }
  if (typeof value !== "string" || !value.trim()) return [];
  const trimmed = value.trim();
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) {
        return [...new Set(parsed.filter((item): item is string => typeof item === "string")
          .map((item) => item.trim()).filter(Boolean))];
      }
    } catch {
      // Fall back to the comma-delimited representation used by file attributes.
    }
  }
  return [...new Set(trimmed.split(",").map((item) => item.trim()).filter(Boolean))];
}

function booleanAttribute(attributes: Record<string, unknown>, key: string): boolean {
  const value = attributes[key];
  return value === true || value === "true" || value === 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isArrayOf(value: unknown, predicate: (item: unknown) => boolean): boolean {
  return Array.isArray(value) && value.every(predicate);
}

function isEvidenceReference(value: unknown): boolean {
  return isRecord(value)
    && typeof value.evidenceId === "string"
    && typeof value.sourceId === "string"
    && typeof value.locator === "string"
    && ["supports", "opposes", "context"].includes(String(value.stance))
    && ["identity", "normative", "configured", "implemented", "tested", "observed", "causal", "historical"].includes(String(value.claimKind))
    && ["establish", "corroborate", "challenge", "contextualize", "propose"].includes(String(value.use))
    && typeof value.supports === "string";
}

function isConclusionClaim(value: unknown): boolean {
  return isRecord(value)
    && typeof value.claimKey === "string"
    && CLAIM_KINDS.includes(value.claimKind as ClaimKind)
    && ["positive", "negative"].includes(String(value.polarity))
    && ["explicit_evidence", "closed_world_absence"].includes(String(value.basis))
    && typeof value.statement === "string"
    && isStringArray(value.evidenceIds);
}

function isAnalysisCheckFinding(value: unknown): boolean {
  return isRecord(value)
    && [
      "identity_scope", "authority_and_lifecycle", "temporal_scope", "claim_boundary",
      "preconditions_and_reachability", "actor_knowledge_and_authorization", "resource_conservation",
      "transition_ordering", "repeatability_and_idempotency", "state_and_asset_compatibility",
      "downstream_consumers", "verification_and_unknowns",
    ].includes(String(value.check))
    && ["supported", "conflicted", "unknown", "not_applicable"].includes(String(value.status))
    && typeof value.finding === "string"
    && isStringArray(value.evidenceIds);
}

function isEntityReference(value: unknown): boolean {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.name === "string"
    && typeof value.type === "string"
    && isStringArray(value.aliases)
    && ["resolved", "candidate", "ambiguous"].includes(String(value.resolution))
    && isStringArray(value.evidenceIds);
}

function isConflict(value: unknown): boolean {
  return isRecord(value)
    && typeof value.type === "string"
    && ["claim_contradiction", "source_disagreement", "constraint_violation", "referent_ambiguity", "proposal_divergence"].includes(String(value.basis))
    && typeof value.frameKey === "string"
    && CLAIM_KINDS.includes(value.claimKind as ClaimKind)
    && isStringArray(value.premiseClaimKeys)
    && isStringArray(value.candidateEntityIds)
    && typeof value.statement === "string"
    && ["low", "medium", "high"].includes(String(value.severity))
    && isStringArray(value.evidenceIds);
}

function isDependency(value: unknown): boolean {
  return isRecord(value)
    && typeof value.from === "string"
    && typeof value.to === "string"
    && typeof value.claimKey === "string"
    && CLAIM_KINDS.includes(value.claimKind as ClaimKind)
    && ["requires", "causes", "prevents", "supersedes", "reveals"].includes(String(value.relation))
    && ["established", "missing", "proposed", "blocked", "open"].includes(String(value.status))
    && isStringArray(value.evidenceIds);
}

function isChangeProposal(value: unknown): boolean {
  return isRecord(value)
    && typeof value.summary === "string"
    && isStringArray(value.assumptions)
    && isStringArray(value.requiredChanges)
    && isStringArray(value.downstreamRisks);
}

function isVerdict(value: unknown): boolean {
  return ["SUPPORTED", "CONFLICT", "AMBIGUOUS", "UNREACHABLE", "INSUFFICIENT_EVIDENCE", "PROPOSAL"].includes(String(value));
}

function isTruthStatus(value: unknown): boolean {
  return ["supported", "source_assertion", "proposed", "contradicted", "ambiguous", "conflicted", "unknown", "superseded"].includes(String(value));
}

function isReachabilityStatus(value: unknown): boolean {
  return ["reachable", "conditionally_reachable", "unreachable_within_scope", "unknown", "not_evaluated"].includes(String(value));
}
