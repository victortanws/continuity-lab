import {
  CONTINUITY_ANSWER_SCHEMA,
  CONTINUITY_ANSWER_VERSION,
  type CanonAuthority,
  type ContinuityAnswer,
  type ContinuityReasoner,
  type EvidenceChunk,
  type EvidenceRetriever,
  type QueryRequest,
} from "../contracts";
import { buildContinuityInput, buildContinuityInstructions } from "../prompt";

const OPENAI_API_BASE = "https://api.openai.com/v1";
export const CONTINUITY_MODEL = "gpt-5.6-sol";

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type OpenAIRetrieverOptions = {
  apiKey: string;
  vectorStoreId: string;
  fetch?: FetchLike;
  maxResults?: number;
};

export type OpenAIReasonerOptions = {
  apiKey: string;
  fetch?: FetchLike;
};

export class OpenAIRetriever implements EvidenceRetriever {
  private readonly options: OpenAIRetrieverOptions;
  private readonly fetchImpl: FetchLike;
  private readonly maxResults: number;

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
  }

  async retrieve(request: QueryRequest): Promise<EvidenceChunk[]> {
    const query = request.proposedChange?.trim()
      ? `${request.question}\nProposed change: ${request.proposedChange.trim()}`
      : request.question;
    const response = await this.fetchImpl(
      `${OPENAI_API_BASE}/vector_stores/${encodeURIComponent(this.options.vectorStoreId)}/search`,
      {
        method: "POST",
        headers: openAIHeaders(this.options.apiKey),
        body: JSON.stringify({
          query,
          max_num_results: this.maxResults,
          filters: { type: "eq", key: "project_id", value: request.projectId },
        }),
      },
    );
    if (!response.ok) throw await providerError("Vector store search failed", response);

    const payload = await response.json() as unknown;
    const results = isRecord(payload) && Array.isArray(payload.data) ? payload.data : [];
    return results.flatMap((result) => mapSearchResult(result, request.projectId));
  }
}

export class OpenAIReasoner implements ContinuityReasoner {
  readonly mode = "gpt-5.6-sol" as const;
  readonly model = CONTINUITY_MODEL;
  private readonly options: OpenAIReasonerOptions;
  private readonly fetchImpl: FetchLike;

  constructor(options: OpenAIReasonerOptions);
  constructor(apiKey: string, fetchImpl?: FetchLike);
  constructor(optionsOrApiKey: OpenAIReasonerOptions | string, fetchImpl?: FetchLike) {
    const options = typeof optionsOrApiKey === "string" ? { apiKey: optionsOrApiKey, fetch: fetchImpl } : optionsOrApiKey;
    requireConfiguration(options.apiKey, "OpenAI API key");
    this.options = options;
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async answer(request: QueryRequest, evidence: EvidenceChunk[]): Promise<ContinuityAnswer> {
    const evidenceSnapshot = snapshotId(evidence);
    const response = await this.fetchImpl(`${OPENAI_API_BASE}/responses`, {
      method: "POST",
      headers: openAIHeaders(this.options.apiKey),
      body: JSON.stringify({
        model: CONTINUITY_MODEL,
        reasoning: { effort: "medium" },
        instructions: buildContinuityInstructions(),
        input: `${buildContinuityInput(request, evidence)}\n<evidence_snapshot>${evidenceSnapshot}</evidence_snapshot>`,
        text: {
          verbosity: "medium",
          format: {
            type: "json_schema",
            name: "continuity_answer",
            strict: true,
            schema: CONTINUITY_ANSWER_SCHEMA,
          },
        },
        max_output_tokens: 6000,
        store: false,
      }),
    });
    if (!response.ok) throw await providerError("Continuity reasoning failed", response);

    const payload = await response.json() as unknown;
    const outputText = extractOutputText(payload);
    if (!outputText) throw new OpenAIProviderError("Continuity reasoning returned no structured output", response.status);

    let parsed: unknown;
    try {
      parsed = JSON.parse(outputText);
    } catch {
      throw new OpenAIProviderError("Continuity reasoning returned invalid JSON", response.status);
    }
    assertContinuityAnswer(parsed);

    // Pin the response to this request even if a model copied a question from
    // conversation context. The engine will independently validate citations.
    return {
      ...parsed,
      version: CONTINUITY_ANSWER_VERSION,
      projectRevision: request.projectRevision?.trim() || evidenceSnapshot,
      question: request.question,
      caveats: [...parsed.caveats, `Evidence projection: ${evidenceSnapshot}`],
    };
  }
}

export class OpenAIProviderError extends Error {
  constructor(message: string, readonly status: number | null = null) {
    super(message);
    this.name = "OpenAIProviderError";
  }
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
  const validFrom = nullableStringAttribute(attributes, "valid_from");
  const validTo = nullableStringAttribute(attributes, "valid_to");
  const supersedesSourceId = nullableStringAttribute(attributes, "supersedes_source_id");
  const closedWorld = booleanAttribute(attributes, "closed_world");
  const claimKey = nullableStringAttribute(attributes, "claim_key");
  const polarityValue = nullableStringAttribute(attributes, "polarity");
  const polarity = polarityValue === "positive" || polarityValue === "negative" ? polarityValue : null;

  return content.map((text, index) => {
    const textHash = stableHash(`${sourceVersionId}\u0000${baseLocator}\u0000${text}`);
    const id = explicitFragmentId
      ? content.length === 1 ? explicitFragmentId : `${explicitFragmentId}:${textHash}`
      : `EV-${sourceVersionId}-${textHash}`;
    return {
      id,
      projectId,
      sourceId,
      sourceVersionId,
      title,
      locator: content.length === 1 ? baseLocator : `${baseLocator} / match ${index + 1}`,
      text,
      score,
      authority,
      validFrom,
      validTo,
      supersedesSourceId,
      closedWorld,
      claimKey,
      polarity,
    };
  });
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
    || !isStringArray(value.reachability.blockers)
    || !isStringArray(value.reachability.assumptions)
    || !isStringArray(value.reachability.path)
    || typeof value.answer !== "string"
    || !["low", "medium", "high"].includes(String(value.confidence))
    || !isArrayOf(value.evidence, isEvidenceReference)
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

async function providerError(prefix: string, response: Response): Promise<OpenAIProviderError> {
  let detail = "";
  try {
    const payload = await response.json() as unknown;
    if (isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === "string") detail = payload.error.message;
  } catch {
    // Avoid echoing arbitrary response bodies. Provider error messages are the
    // only safe detail exposed to callers.
  }
  return new OpenAIProviderError(detail ? `${prefix}: ${detail}` : prefix, response.status);
}

function snapshotId(evidence: EvidenceChunk[]): string {
  const versions = [...new Set(evidence.map((chunk) => chunk.sourceVersionId))].sort().join("|");
  return `evidence-snapshot-${stableHash(versions || "empty")}`;
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
    && typeof value.supports === "string";
}

function isEntityReference(value: unknown): boolean {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.name === "string"
    && typeof value.type === "string"
    && isStringArray(value.aliases);
}

function isConflict(value: unknown): boolean {
  return isRecord(value)
    && typeof value.type === "string"
    && typeof value.statement === "string"
    && ["low", "medium", "high"].includes(String(value.severity))
    && isStringArray(value.evidenceIds);
}

function isDependency(value: unknown): boolean {
  return isRecord(value)
    && typeof value.from === "string"
    && typeof value.to === "string"
    && ["requires", "causes", "prevents", "supersedes", "reveals"].includes(String(value.relation))
    && ["established", "missing", "proposed", "blocked"].includes(String(value.status))
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
  return ["supported", "contradicted", "ambiguous", "conflicted", "unknown", "superseded"].includes(String(value));
}

function isReachabilityStatus(value: unknown): boolean {
  return ["reachable", "conditionally_reachable", "unreachable_within_scope", "unknown", "not_evaluated"].includes(String(value));
}
