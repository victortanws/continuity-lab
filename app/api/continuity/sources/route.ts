import {
  classifyDirectUpload,
  inferSafeDirectUploadType,
  type DirectUploadEvidenceProfile,
} from "@/lib/continuity/repositories/authority";
import { scanRepositoryTextForSecrets } from "@/lib/continuity/repositories/github";
import {
  ContinuityRepository,
  type SourceIndexStatus,
  type StoredSource,
} from "@/lib/continuity/storage/repository";
import {
  isLocalRequest,
  projectAuthenticationRequired,
  projectMutationForbidden,
  resolveProjectScope,
  trustedAuthenticatedUserEmail,
  type IdentityTrustConfig,
} from "@/lib/continuity/auth/project-scope";
import {
  guardRequestBody,
  privateNoStoreHeaders,
  rateLimitResponse,
  readFormDataBodyBounded,
  RequestBodyError,
  requestBodyErrorResponse,
  usageActorScopeKey,
} from "@/lib/continuity/http/security";
import { inspectUploadBytes } from "@/lib/continuity/uploads/file-policy";
import {
  ConnectorExecutionBudget,
  ConnectorExecutionError,
  connectorAbortError,
  readConnectorResponseJsonBounded,
  readConnectorResponseTextBounded,
} from "@/lib/continuity/http/connector-execution";

export const runtime = "edge";

const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const PROJECT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const PROVIDER_NATIVE_EXTENSIONS = new Set([
  "txt", "md", "pdf", "doc", "docx", "html", "json", "pptx",
]);
const NORMALIZED_TEXT_EXTENSIONS = new Set(["markdown", "htm", "yaml", "yml", "xml", "csv", "tsv"]);
const ALLOWED_EXTENSIONS = new Set([...PROVIDER_NATIVE_EXTENSIONS, ...NORMALIZED_TEXT_EXTENSIONS]);
const BINARY_DOCUMENT_EXTENSIONS = new Set(["pdf", "doc", "docx", "pptx"]);
const SOURCE_CONNECTOR_DEADLINE_MS = 55_000;
const SOURCE_CONNECTOR_MAX_CALLS = 3;
const OPENAI_INDEX_TIMEOUT_MS = 30_000;
const OPENAI_INDEX_RESPONSE_MAX_BYTES = 256 * 1024;
const OPENAI_INDEX_ERROR_MAX_BYTES = 32 * 1024;
const SOURCE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const METADATA_CONTROL_PATTERN = /[\u0000-\u001f\u007f]/;
const MAX_DIRECT_UPLOAD_STORY_ORDINAL = 1_000_000_000;
const SOURCE_UPLOAD_FORM_KEYS = new Set([
  "projectId", "projectTitle", "logicalName", "documentType", "authority",
  "validFrom", "supersedesSourceId", "file",
]);

export type SourceUploadMetadata = {
  projectId: string;
  projectTitle: string;
  logicalName: string;
  originalFilename: string;
  documentType: string;
  authority: string | null;
  validFrom: string | null;
  validFromOrder: number | null;
  temporalAxis: string | null;
  supersedesSourceId: string | null;
  encodedBytes: number;
  contentType: string;
};

export class SourceUploadMetadataError extends Error {
  constructor(
    message: string,
    readonly code: "invalid_upload_metadata" | "unsupported_temporal_marker",
  ) {
    super(message);
    this.name = "SourceUploadMetadataError";
  }
}

export function sourceUploadQuotaBytes(fileBytes: number, encodedMetadataBytes: number): number {
  if (!Number.isSafeInteger(fileBytes) || fileBytes < 0
    || !Number.isSafeInteger(encodedMetadataBytes) || encodedMetadataBytes < 0) {
    throw new TypeError("Upload quota byte counts must be non-negative safe integers.");
  }
  const total = fileBytes + encodedMetadataBytes;
  if (!Number.isSafeInteger(total)) throw new TypeError("Upload quota byte count overflowed.");
  return total;
}

type RuntimeEnv = {
  DB?: D1Database;
  SOURCES?: R2Bucket;
  OPENAI_API_KEY?: string;
  OPENAI_VECTOR_STORE_ID?: string;
  BINARY_UPLOAD_ALLOWED_EMAILS?: string;
  CONTINUITY_TRUSTED_INGRESS_ORIGINS?: string;
};

type OpenAIObject = {
  id: string;
  status?: "in_progress" | "completed" | "failed" | "cancelled";
};

type SourceProfileRecord = {
  profile: DirectUploadEvidenceProfile;
  originalFilename: string;
  origin: "stored" | "legacy_filename";
};

async function runtimeEnv(): Promise<RuntimeEnv> {
  // Keep the Cloudflare-only module out of the Node HTML-rendering path used
  // by validation. The route chunk resolves it when an API request runs.
  const { env } = await import("cloudflare:workers");
  return env as unknown as RuntimeEnv;
}

function identityTrust(bindings?: RuntimeEnv | null): IdentityTrustConfig {
  return { trustedIngressOrigins: bindings?.CONTINUITY_TRUSTED_INGRESS_ORIGINS };
}

async function hostedPreflightBindings(request: Request): Promise<RuntimeEnv | null> {
  if (isLocalRequest(request)) return null;
  try {
    return await runtimeEnv();
  } catch {
    // Authentication remains disabled if the server-owned environment cannot
    // be read. Never fall back to trusting the incoming identity header.
    return null;
  }
}

function publicSource(source: StoredSource, provenance: SourceProfileRecord) {
  return {
    id: source.id,
    projectId: source.projectId,
    versionId: source.versionId,
    logicalName: source.logicalName,
    filename: source.filename,
    contentType: source.contentType,
    originalFilename: provenance.originalFilename,
    documentType: provenance.profile.documentType,
    role: provenance.profile.role,
    lifecycle: provenance.profile.lifecycle,
    claimKinds: provenance.profile.claimKinds,
    closedWorld: provenance.profile.closedWorld,
    byteSize: source.byteSize,
    sha256: source.sha256,
    authority: source.authority,
    validFrom: source.validFrom,
    supersedesSourceId: source.supersedesSourceId,
    indexStatus: source.indexStatus,
    indexError: source.indexError,
    extractionStatus: source.indexStatus === "indexed"
      ? "provider_indexed_unverified"
      : source.indexStatus === "failed" ? "unreadable_or_index_failed" : "not_yet_verified",
    createdAt: source.createdAt,
  };
}

function boundedOriginalFilename(value: string): string {
  return value.normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 300) || "source";
}

function boundedMetadataField(
  form: FormData,
  key: string,
  options: { fallback?: string; maxBytes: number; required?: boolean },
): string {
  const values = form.getAll(key);
  if (values.length > 1 || values.some((value) => typeof value !== "string")) {
    throw new SourceUploadMetadataError(`${key} must be supplied at most once as text.`, "invalid_upload_metadata");
  }
  const raw = (typeof values[0] === "string" ? values[0] : options.fallback ?? "").normalize("NFKC").trim();
  if ((options.required && !raw) || METADATA_CONTROL_PATTERN.test(raw)) {
    throw new SourceUploadMetadataError(`${key} is missing or contains unsupported control characters.`, "invalid_upload_metadata");
  }
  if (new TextEncoder().encode(raw).byteLength > options.maxBytes) {
    throw new SourceUploadMetadataError(`${key} exceeds its ${options.maxBytes}-byte limit.`, "invalid_upload_metadata");
  }
  return raw;
}

function boundedFileMetadata(value: string, label: string, maxBytes: number): string {
  const normalized = value.normalize("NFKC").trim();
  if (!normalized || METADATA_CONTROL_PATTERN.test(normalized)) {
    throw new SourceUploadMetadataError(`${label} is missing or contains unsupported control characters.`, "invalid_upload_metadata");
  }
  if (new TextEncoder().encode(normalized).byteLength > maxBytes) {
    throw new SourceUploadMetadataError(`${label} exceeds its ${maxBytes}-byte limit.`, "invalid_upload_metadata");
  }
  return normalized;
}

function directUploadTemporalMarker(value: string): {
  value: string;
  order: number;
  axis: string;
} | null {
  if (!value) return null;
  const narrative = value.match(/^(day|chapter|ch|beat|scene|turn|episode|ep|step)[ _:#-]*(\d+)$/i);
  if (narrative) {
    const aliases: Record<string, string> = { ch: "chapter", ep: "episode" };
    const rawAxis = narrative[1].toLowerCase();
    const order = Number(narrative[2]);
    if (!Number.isSafeInteger(order) || order < 0 || order > MAX_DIRECT_UPLOAD_STORY_ORDINAL) {
      throw new SourceUploadMetadataError(
        `Narrative validFrom ordinals must be whole numbers from 0 through ${MAX_DIRECT_UPLOAD_STORY_ORDINAL}.`,
        "unsupported_temporal_marker",
      );
    }
    return { value, order, axis: aliases[rawAxis] ?? rawAxis };
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const timestamp = Date.parse(`${value}T00:00:00.000Z`);
    if (Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value) {
      return { value, order: Math.floor(timestamp / 86_400_000), axis: "date" };
    }
  }
  throw new SourceUploadMetadataError(
    "validFrom must be an exact ISO date (YYYY-MM-DD) or a bounded narrative marker such as Day 8 or Chapter 12.",
    "unsupported_temporal_marker",
  );
}

/** Validate every multipart metadata value before storage or a provider call. */
export function validateSourceUploadMetadata(form: FormData, uploaded: File): SourceUploadMetadata {
  for (const key of form.keys()) {
    if (!SOURCE_UPLOAD_FORM_KEYS.has(key)) {
      throw new SourceUploadMetadataError("The upload contains an unsupported multipart field.", "invalid_upload_metadata");
    }
  }
  if (form.getAll("file").length !== 1) {
    throw new SourceUploadMetadataError("Exactly one source file is required per upload request.", "invalid_upload_metadata");
  }
  const originalFilename = boundedFileMetadata(uploaded.name, "original filename", 300);
  const projectId = boundedMetadataField(form, "projectId", { maxBytes: 128, required: true });
  const projectTitle = boundedMetadataField(form, "projectTitle", {
    fallback: "Continuity Lab project",
    maxBytes: 160,
  }) || "Continuity Lab project";
  const logicalName = boundedMetadataField(form, "logicalName", {
    fallback: originalFilename,
    maxBytes: 200,
  }) || originalFilename;
  const documentType = boundedMetadataField(form, "documentType", {
    fallback: "reference",
    maxBytes: 24,
  }) || "reference";
  const authority = boundedMetadataField(form, "authority", { maxBytes: 24 }) || null;
  const rawValidFrom = boundedMetadataField(form, "validFrom", { maxBytes: 64 });
  const temporal = directUploadTemporalMarker(rawValidFrom);
  const supersedesSourceId = boundedMetadataField(form, "supersedesSourceId", { maxBytes: 160 }) || null;
  if (supersedesSourceId && !SOURCE_ID_PATTERN.test(supersedesSourceId)) {
    throw new SourceUploadMetadataError("supersedesSourceId has an invalid identifier format.", "invalid_upload_metadata");
  }
  const rawContentType = uploaded.type.trim();
  const contentType = rawContentType && rawContentType.length <= 127 && /^[\x21-\x7e]+$/.test(rawContentType)
    ? rawContentType
    : "application/octet-stream";
  const quotaEnvelope = {
    projectId,
    projectTitle,
    logicalName,
    originalFilename,
    documentType,
    authority,
    validFrom: temporal?.value ?? null,
    validFromOrder: temporal?.order ?? null,
    temporalAxis: temporal?.axis ?? null,
    supersedesSourceId,
    contentType,
  };
  return {
    ...quotaEnvelope,
    encodedBytes: new TextEncoder().encode(JSON.stringify(quotaEnvelope)).byteLength,
  };
}

async function readSourceProfile(
  repository: ContinuityRepository,
  source: StoredSource,
): Promise<SourceProfileRecord> {
  const binding = await repository.getProviderBinding(
    source.projectId,
    source.versionId,
    "source_profile",
    "continuity",
  );
  if (binding) {
    try {
      const metadata = JSON.parse(binding.metadataJson) as Record<string, unknown>;
      const profile = classifyDirectUpload(metadata.documentType);
      if (profile) {
        return {
          profile,
          originalFilename: boundedOriginalFilename(
            typeof metadata.originalFilename === "string" ? metadata.originalFilename : source.logicalName,
          ),
          origin: "stored",
        };
      }
    } catch {
      // A malformed legacy metadata record falls through to the conservative
      // filename classifier; it can never grant a stronger role.
    }
  }

  const fallbackType = inferSafeDirectUploadType(source.filename);
  const fallback = classifyDirectUpload(fallbackType);
  if (!fallback) throw new Error("The safe upload profile could not be resolved.");
  return {
    profile: fallback,
    originalFilename: boundedOriginalFilename(source.logicalName || source.filename),
    origin: "legacy_filename",
  };
}

async function persistSourceProfile(
  repository: ContinuityRepository,
  source: StoredSource,
  profile: DirectUploadEvidenceProfile,
  originalFilename: string,
): Promise<SourceProfileRecord> {
  const boundedName = boundedOriginalFilename(originalFilename);
  await repository.setProviderBinding({
    projectId: source.projectId,
    internalId: source.versionId,
    provider: "continuity",
    kind: "source_profile",
    externalId: `source-profile:${source.versionId}`,
    metadata: {
      documentType: profile.documentType,
      originalFilename: boundedName,
      storedFilename: source.filename,
      sha256: source.sha256,
    },
  });
  return { profile, originalFilename: boundedName, origin: "stored" };
}

async function resolveSourceProfile(
  repository: ContinuityRepository,
  source: StoredSource,
  requested: DirectUploadEvidenceProfile,
  uploadedFilename: string,
  isNewSource: boolean,
): Promise<SourceProfileRecord | { error: string; current: SourceProfileRecord }> {
  const current = await readSourceProfile(repository, source);
  if (current.origin === "stored") {
    if (current.profile.documentType !== requested.documentType) {
      return {
        error: `These bytes are already stored as ${current.profile.documentType} evidence. Source-version classification is immutable; upload a revised file to create a different evidence version.`,
        current,
      };
    }
    return current;
  }

  // Once provider indexing has started, changing the server-authored profile
  // would make durable source metadata disagree with vector-store attributes.
  const indexLocked = source.indexStatus === "indexing" || source.indexStatus === "indexed";
  const selected = indexLocked ? current.profile : requested;
  if (indexLocked && selected.documentType !== requested.documentType) {
    const persisted = await persistSourceProfile(
      repository,
      source,
      selected,
      current.originalFilename,
    );
    return {
      error: `This legacy source is already indexed as ${selected.documentType} evidence. Reclassification requires a new source version so prior analyses remain reproducible.`,
      current: persisted,
    };
  }
  return persistSourceProfile(
    repository,
    source,
    selected,
    isNewSource ? uploadedFilename : current.originalFilename,
  );
}

function safeFilename(filename: string): string {
  const normalized = filename.normalize("NFKC").replace(/[^A-Za-z0-9._-]+/g, "-");
  return normalized.replace(/^-+|-+$/g, "").slice(0, 160) || "source.txt";
}

function extension(filename: string): string {
  return filename.toLowerCase().split(".").pop() ?? "";
}

function decodeIndexableText(file: File): Promise<string> {
  return file.arrayBuffer().then((bytes) => {
    const view = new Uint8Array(bytes);
    const encoding = view[0] === 0xff && view[1] === 0xfe
      ? "utf-16le"
      : view[0] === 0xfe && view[1] === 0xff ? "utf-16be" : "utf-8";
    return new TextDecoder(encoding, { fatal: true }).decode(view);
  });
}

async function providerIndexFile(originalFile: File, storedFilename: string): Promise<File> {
  const ext = extension(originalFile.name);
  if (!NORMALIZED_TEXT_EXTENSIONS.has(ext)) return originalFile;
  const text = await decodeIndexableText(originalFile);
  const normalizedName = `${storedFilename.replace(/\.[^.]+$/, "") || "source"}.txt`;
  return new File([text], normalizedName, { type: "text/plain" });
}

function isD1ConstraintError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /unique constraint|constraint failed/i.test(message);
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function openAIRequest<T>(
  apiKey: string,
  path: string,
  init: RequestInit,
  idempotencyKey?: string,
  executionBudget?: ConnectorExecutionBudget,
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${apiKey}`);
  if (idempotencyKey) headers.set("Idempotency-Key", idempotencyKey);
  const phase = "openai_source_index";
  let response: Response;
  try {
    response = await fetch(`https://api.openai.com/v1${path}`, {
      ...init,
      headers,
      redirect: "error",
      signal: executionBudget?.signalFor(phase, OPENAI_INDEX_TIMEOUT_MS)
        ?? AbortSignal.timeout(OPENAI_INDEX_TIMEOUT_MS),
    });
  } catch (error) {
    if (executionBudget) {
      const executionError = connectorAbortError(error, executionBudget, phase);
      if (executionError) throw executionError;
    }
    if (error instanceof ConnectorExecutionError) throw error;
    throw new Error("OpenAI source indexing could not be reached.");
  }
  if (!response.ok) {
    const detail = (await readConnectorResponseTextBounded(
      response,
      OPENAI_INDEX_ERROR_MAX_BYTES,
      phase,
    )).slice(0, 800);
    throw new Error(`OpenAI indexing request failed (${response.status}): ${detail || response.statusText}`);
  }
  return readConnectorResponseJsonBounded<T>(response, OPENAI_INDEX_RESPONSE_MAX_BYTES, phase);
}

async function ensureVectorStore(
  repository: ContinuityRepository,
  projectId: string,
  projectTitle: string,
  apiKey: string,
  configuredVectorStoreId?: string,
  executionBudget?: ConnectorExecutionBudget,
): Promise<string> {
  const existing = await repository.getProviderBinding(projectId, projectId, "vector_store");
  if (existing) return existing.externalId;

  if (configuredVectorStoreId) {
    await repository.setProviderBinding({
      projectId,
      internalId: projectId,
      kind: "vector_store",
      externalId: configuredVectorStoreId,
      metadata: { source: "environment" },
    });
    return configuredVectorStoreId;
  }

  const vectorStore = await openAIRequest<OpenAIObject>(
    apiKey,
    "/vector_stores",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: `Continuity Lab · ${projectTitle}`.slice(0, 120) }),
    },
    `continuity-project-${projectId}`,
    executionBudget,
  );
  await repository.setProviderBinding({
    projectId,
    internalId: projectId,
    kind: "vector_store",
    externalId: vectorStore.id,
    metadata: { source: "provisioned", createdFor: projectId },
  });
  return vectorStore.id;
}

async function indexSource(
  repository: ContinuityRepository,
  source: StoredSource,
  originalFile: File,
  projectTitle: string,
  bindings: RuntimeEnv,
  provenance: SourceProfileRecord,
  executionBudget: ConnectorExecutionBudget,
): Promise<{
  capability: "stored_only" | "indexing" | "indexed" | "stored_with_index_error";
  vectorStoreId?: string;
  error?: string;
  errorCode?: string;
}> {
  const apiKey = bindings.OPENAI_API_KEY?.trim();
  if (!apiKey) return { capability: "stored_only" };

  try {
    // The profile is selected from a bounded server-owned map before content
    // is read. Uploaded text cannot forge authority or routing metadata.
    const sourceProfile = provenance.profile;
    const indexFile = await providerIndexFile(originalFile, source.filename);
    const vectorStoreId = await ensureVectorStore(
      repository,
      source.projectId,
      projectTitle,
      apiKey,
      bindings.OPENAI_VECTOR_STORE_ID?.trim(),
      executionBudget,
    );
    await repository.updateSourceIndexStatus(source.id, "indexing");

    let fileId = (await repository.getProviderBinding(
      source.projectId,
      source.versionId,
      "source_file",
    ))?.externalId;

    if (!fileId) {
      const upload = new FormData();
      upload.set("purpose", "assistants");
      upload.set("file", indexFile, indexFile.name);
      const uploaded = await openAIRequest<OpenAIObject>(
        apiKey,
        "/files",
        { method: "POST", body: upload },
        `continuity-source-${source.versionId}`,
        executionBudget,
      );
      fileId = uploaded.id;
      await repository.setProviderBinding({
        projectId: source.projectId,
        internalId: source.versionId,
        kind: "source_file",
        externalId: fileId,
        metadata: {
          sha256: source.sha256,
          filename: source.filename,
          indexedFilename: indexFile.name,
          originalFilename: provenance.originalFilename,
          documentType: sourceProfile.documentType,
        },
      });
    }

    const attached = await openAIRequest<OpenAIObject>(
      apiKey,
      `/vector_stores/${encodeURIComponent(vectorStoreId)}/files`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_id: fileId,
          attributes: {
            project_id: source.projectId,
            source_id: source.id,
            source_version_id: source.versionId,
            logical_name: source.logicalName.slice(0, 256),
            original_filename: provenance.originalFilename.slice(0, 256),
            document_type: sourceProfile.documentType,
            authority: source.authority,
            role: sourceProfile.role,
            lifecycle: sourceProfile.lifecycle,
            claim_kinds: sourceProfile.claimKinds.join(","),
            closed_world: false,
            ...(source.validFrom ? { valid_from: source.validFrom } : {}),
            ...(source.validFrom ? (() => {
              const temporal = directUploadTemporalMarker(source.validFrom);
              return temporal ? {
                valid_from_order: temporal.order,
                temporal_axis: temporal.axis,
              } : {};
            })() : {}),
            ...(source.supersedesSourceId ? { supersedes_source_id: source.supersedesSourceId } : {}),
          },
        }),
      },
      `continuity-attach-${source.versionId}`,
      executionBudget,
    );
    await repository.setProviderBinding({
      projectId: source.projectId,
      internalId: source.versionId,
      kind: "vector_membership",
      externalId: attached.id || fileId,
      metadata: { vectorStoreId, status: attached.status ?? "in_progress" },
    });

    const status: SourceIndexStatus = attached.status === "completed" ? "indexed" : "indexing";
    await repository.updateSourceIndexStatus(source.id, status);
    return {
      capability: status === "indexed" ? "indexed" : "indexing",
      vectorStoreId,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown indexing failure";
    await repository.updateSourceIndexStatus(source.id, "failed", message.slice(0, 1000));
    return {
      capability: "stored_with_index_error",
      error: message.slice(0, 1000),
      errorCode: error instanceof ConnectorExecutionError ? error.code : "source_index_failed",
    };
  }
}

async function refreshIndexingStatuses(
  repository: ContinuityRepository,
  sources: StoredSource[],
  bindings: RuntimeEnv,
  executionBudget: ConnectorExecutionBudget,
): Promise<StoredSource[]> {
  const apiKey = bindings.OPENAI_API_KEY?.trim();
  if (!apiKey) return sources;

  const byProject = new Map<string, string>();
  for (const source of sources.filter((item) => item.indexStatus === "indexing").slice(0, 12)) {
    try {
      let vectorStoreId = byProject.get(source.projectId);
      if (!vectorStoreId) {
        vectorStoreId = (await repository.getProviderBinding(
          source.projectId,
          source.projectId,
          "vector_store",
        ))?.externalId;
        if (!vectorStoreId) continue;
        byProject.set(source.projectId, vectorStoreId);
      }
      const fileId = (await repository.getProviderBinding(
        source.projectId,
        source.versionId,
        "source_file",
      ))?.externalId;
      if (!fileId) continue;

      const providerFile = await openAIRequest<OpenAIObject>(
        apiKey,
        `/vector_stores/${encodeURIComponent(vectorStoreId)}/files/${encodeURIComponent(fileId)}`,
        { method: "GET" },
        undefined,
        executionBudget,
      );
      if (providerFile.status === "completed") {
        await repository.updateSourceIndexStatus(source.id, "indexed");
      } else if (providerFile.status === "failed" || providerFile.status === "cancelled") {
        await repository.updateSourceIndexStatus(
          source.id,
          "failed",
          `Provider indexing ended with status: ${providerFile.status}`,
        );
      }
    } catch {
      // A status check is advisory. Preserve the last known state instead of
      // turning a temporary provider/network error into a false indexing failure.
    }
  }
  return repository.listSources(sources[0]?.projectId ?? "");
}

function databaseUnavailable(error: unknown): Response {
  void error;
  return Response.json({
    error: "Continuity source storage could not complete the request.",
    code: "source_storage_error",
  }, { status: 500 });
}

export async function GET(request: Request) {
  const requestedProjectId = new URL(request.url).searchParams.get("projectId")?.trim() ?? "";
  if (!PROJECT_ID_PATTERN.test(requestedProjectId)) {
    return Response.json({ error: "A valid projectId is required." }, { status: 400 });
  }
  try {
    const bindings = await runtimeEnv();
    const scope = await resolveProjectScope(request, requestedProjectId, identityTrust(bindings));
    if (!scope) return projectAuthenticationRequired();
    const projectId = scope.projectId;
    if (!bindings.DB) throw new Error("Continuity storage is not configured.");
    const repository = new ContinuityRepository(bindings.DB);
    const storedSources = await repository.listSources(projectId);
    const executionBudget = new ConnectorExecutionBudget({
      deadlineAt: Date.now() + 30_000,
      maxCalls: 12,
    });
    const sources = storedSources.some((source) => source.indexStatus === "indexing")
      ? await refreshIndexingStatuses(repository, storedSources, bindings, executionBudget)
      : storedSources;
    const publicSources = await Promise.all(sources.map(async (source) => (
      publicSource(source, await readSourceProfile(repository, source))
    )));
    return Response.json({ projectId, sources: publicSources }, { headers: privateNoStoreHeaders() });
  } catch (error) {
    return databaseUnavailable(error);
  }
}

export async function POST(request: Request) {
  const preflightBindings = await hostedPreflightBindings(request);
  const requestIdentityTrust = identityTrust(preflightBindings);
  const requestGuard = guardRequestBody(request, {
    kind: "multipart",
    maxBytes: MAX_SOURCE_BYTES + 1024 * 1024,
    requireIdentityBeforeParsing: true,
    identityTrust: requestIdentityTrust,
  });
  if (requestGuard) return requestGuard;
  try {
    const form = await readFormDataBodyBounded(request, MAX_SOURCE_BYTES + 1024 * 1024);
    const uploaded = form.get("file");
    if (!(uploaded instanceof File)) {
      return Response.json({ error: "A source file is required." }, { status: 400 });
    }
    const metadata = validateSourceUploadMetadata(form, uploaded);
    const requestedProjectId = metadata.projectId;
    const requestedProfile = classifyDirectUpload(metadata.documentType);
    const validFrom = metadata.validFrom;
    const supersedesSourceId = metadata.supersedesSourceId;
    if (!PROJECT_ID_PATTERN.test(requestedProjectId)) {
      return Response.json({ error: "A valid projectId is required." }, { status: 400 });
    }
    if (!requestedProfile) {
      return Response.json({
        error: "documentType must be narrative, reference, or proposal.",
      }, { status: 400 });
    }
    if (metadata.authority !== null && metadata.authority !== requestedProfile.authority) {
      return Response.json({
        error: `The ${requestedProfile.documentType} document type is admitted only at ${requestedProfile.authority} authority. Direct uploads cannot choose stronger authority.`,
      }, { status: 400 });
    }
    if (!uploaded.size || uploaded.size > MAX_SOURCE_BYTES) {
      return Response.json({ error: "Source files must be between 1 byte and 20 MB." }, { status: 413 });
    }
    if (!ALLOWED_EXTENSIONS.has(extension(uploaded.name))) {
      return Response.json({ error: "This file type is not supported yet." }, { status: 415 });
    }
    const scope = await resolveProjectScope(request, requestedProjectId, requestIdentityTrust);
    if (!scope) return projectAuthenticationRequired();
    const mutationForbidden = projectMutationForbidden(scope);
    if (mutationForbidden) return mutationForbidden;
    const projectId = scope.projectId;
    const executionBudget = new ConnectorExecutionBudget({
      deadlineAt: Date.now() + SOURCE_CONNECTOR_DEADLINE_MS,
      maxCalls: SOURCE_CONNECTOR_MAX_CALLS,
    });
    const bindings = preflightBindings ?? await runtimeEnv();
    if (!bindings.DB || !bindings.SOURCES) {
      throw new Error("Continuity source storage is not configured.");
    }
    const binaryAuthorization = authorizeBinaryUpload(
      request,
      uploaded.name,
      bindings.BINARY_UPLOAD_ALLOWED_EMAILS,
      requestIdentityTrust,
    );
    if (binaryAuthorization) return binaryAuthorization;
    const repository = new ContinuityRepository(bindings.DB);
    const actorScope = await usageActorScopeKey(request, requestIdentityTrust);
    const usage = await repository.consumeUsage(actorScope, "source_upload", 20, 60 * 60);
    if (!usage.allowed) return rateLimitResponse(usage.retryAfterSeconds);
    const quotaBytes = sourceUploadQuotaBytes(uploaded.size, metadata.encodedBytes);
    const byteUnits = Math.max(1, Math.ceil(quotaBytes / (1024 * 1024)));
    const actorBytes = await repository.consumeUsage(actorScope, "source_upload_mib", 500, 24 * 60 * 60, Date.now(), byteUnits);
    if (!actorBytes.allowed) return rateLimitResponse(actorBytes.retryAfterSeconds);
    const globalUploads = await repository.consumeUsage("global:upload", "source_upload", 1_000, 24 * 60 * 60);
    if (!globalUploads.allowed) return rateLimitResponse(globalUploads.retryAfterSeconds);
    const globalBytes = await repository.consumeUsage(
      "global:upload",
      "source_upload_mib",
      5_120,
      24 * 60 * 60,
      Date.now(),
      byteUnits,
    );
    if (!globalBytes.allowed) return rateLimitResponse(globalBytes.retryAfterSeconds);
    const sourceUsage = await repository.getProjectSourceUsage(projectId);
    if (sourceUsage.sourceCount >= 100 || sourceUsage.totalBytes + quotaBytes > 200 * 1024 * 1024) {
      return Response.json({
        error: "This workspace has reached its source-count or stored-byte safety quota.",
        code: "project_source_quota_exceeded",
      }, { status: 413 });
    }
    if (supersedesSourceId && !(await repository.getSource(projectId, supersedesSourceId))) {
      return Response.json({
        error: "supersedesSourceId must identify an existing source in this project.",
      }, { status: 400 });
    }
    const bytes = await uploaded.arrayBuffer();
    const inspection = inspectUploadBytes(uploaded.name, new Uint8Array(bytes));
    if (!inspection.ok) {
      return Response.json({ error: inspection.reason, code: "file_content_rejected" }, { status: 415 });
    }
    if (["txt", "md", "markdown", "html", "htm", "json", "yaml", "yml", "xml", "csv", "tsv"].includes(extension(uploaded.name))) {
      const secretScan = scanRepositoryTextForSecrets(new TextDecoder("utf-8").decode(bytes));
      if (secretScan.detected) {
        return Response.json({
          error: "The text appears to contain a live credential. Remove or redact it before upload.",
          code: "secret_detected",
          kinds: secretScan.kinds,
        }, { status: 422 });
      }
    }
    const project = await repository.ensureProject(projectId, metadata.projectTitle);
    const sha256 = await sha256Hex(bytes);
    const existing = await repository.findSourceByChecksum(projectId, sha256);
    if (existing) {
      const provenance = await resolveSourceProfile(
        repository,
        existing,
        requestedProfile,
        uploaded.name,
        false,
      );
      if ("error" in provenance) {
        return Response.json({
          error: provenance.error,
          source: publicSource(existing, provenance.current),
          deduplicated: true,
        }, { status: 409 });
      }
      const indexing = existing.indexStatus === "indexed" || existing.indexStatus === "indexing"
        ? { capability: existing.indexStatus as "indexed" | "indexing" }
        : await indexSource(repository, existing, uploaded, project.title, bindings, provenance, executionBudget);
      const refreshed = await repository.findSourceByChecksum(projectId, sha256) ?? existing;
      return Response.json({
        source: publicSource(refreshed, provenance),
        deduplicated: true,
        ...indexing,
      });
    }

    const sourceId = `source_${crypto.randomUUID()}`;
    const versionId = `source-version_${crypto.randomUUID()}`;
    const filename = safeFilename(uploaded.name);
    const r2Key = `projects/${encodeURIComponent(projectId)}/source-versions/${versionId}/${filename}`;
    await bindings.SOURCES.put(r2Key, bytes, {
      httpMetadata: { contentType: metadata.contentType },
      customMetadata: {
        projectId,
        sourceId,
        versionId,
        sha256,
        documentType: requestedProfile.documentType,
        originalFilename: metadata.originalFilename,
      },
    });

    let source: StoredSource;
    try {
      source = await repository.createSource({
        id: sourceId,
        projectId,
        versionId,
        logicalName: metadata.logicalName,
        filename,
        contentType: metadata.contentType,
        byteSize: uploaded.size,
        sha256,
        r2Key,
        authority: requestedProfile.authority,
        validFrom,
        supersedesSourceId,
      });
    } catch (error) {
      if (!isD1ConstraintError(error)) throw error;
      const concurrent = await repository.findSourceByChecksum(projectId, sha256);
      if (!concurrent) throw error;
      await bindings.SOURCES.delete(r2Key);
      source = concurrent;
    }

    const projectRevision = source.id === sourceId
      ? await repository.bumpProjectRevision(projectId, source.versionId)
      : project.activeRevision;

    const provenance = await resolveSourceProfile(
      repository,
      source,
      requestedProfile,
      uploaded.name,
      source.id === sourceId,
    );
    if ("error" in provenance) {
      return Response.json({
        error: provenance.error,
        source: publicSource(source, provenance.current),
        deduplicated: true,
      }, { status: 409 });
    }

    const indexing = await indexSource(repository, source, uploaded, project.title, bindings, provenance, executionBudget);
    const refreshed = await repository.findSourceByChecksum(projectId, sha256) ?? source;
    return Response.json({
      source: publicSource(refreshed, provenance),
      projectRevision,
      deduplicated: source.id !== sourceId,
      ...indexing,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof RequestBodyError) return requestBodyErrorResponse(error);
    if (error instanceof SourceUploadMetadataError) {
      return Response.json({ error: error.message, code: error.code }, {
        status: 400,
        headers: privateNoStoreHeaders(),
      });
    }
    return databaseUnavailable(error);
  }
}

export function authorizeBinaryUpload(
  request: Request,
  filename: string,
  allowedEmailsValue?: string,
  identityTrustConfig: IdentityTrustConfig = {},
): Response | null {
  if (!BINARY_DOCUMENT_EXTENSIONS.has(extension(filename))) return null;
  if (isLocalRequest(request)) return null;
  const allowed = (allowedEmailsValue ?? "").split(",")
    .map((value) => value.trim().toLowerCase()).filter(Boolean);
  const email = trustedAuthenticatedUserEmail(request, identityTrustConfig) ?? "";
  if (allowed.length && email && allowed.includes(email)) return null;
  return Response.json({
    error: "PDF and Office uploads are disabled for this account because their contents cannot yet be credential-scanned safely. Use redacted UTF-8 text or ask the Site operator to enable this private-document preview.",
    code: "binary_document_upload_not_authorized",
  }, { status: allowed.length ? 403 : 503, headers: privateNoStoreHeaders() });
}
