import type { CanonAuthority } from "@/lib/continuity/contracts";
import {
  ContinuityRepository,
  type SourceIndexStatus,
  type StoredSource,
} from "@/lib/continuity/storage/repository";

export const runtime = "edge";

const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const PROJECT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const ALLOWED_EXTENSIONS = new Set([
  "txt", "md", "markdown", "pdf", "doc", "docx", "rtf", "html", "htm",
  "json", "yaml", "yml", "csv", "tsv", "epub",
]);
const AUTHORITIES = new Set<CanonAuthority>([
  "immutable", "canon", "retcon", "production", "proposal", "reference",
]);

type RuntimeEnv = {
  DB?: D1Database;
  SOURCES?: R2Bucket;
  OPENAI_API_KEY?: string;
  OPENAI_VECTOR_STORE_ID?: string;
};

type OpenAIObject = {
  id: string;
  status?: "in_progress" | "completed" | "failed" | "cancelled";
};

async function runtimeEnv(): Promise<RuntimeEnv> {
  // Keep the Cloudflare-only module out of the Node HTML-rendering path used
  // by validation. The route chunk resolves it when an API request runs.
  const { env } = await import("cloudflare:workers");
  return env as unknown as RuntimeEnv;
}

function publicSource(source: StoredSource) {
  return {
    id: source.id,
    projectId: source.projectId,
    versionId: source.versionId,
    logicalName: source.logicalName,
    filename: source.filename,
    contentType: source.contentType,
    byteSize: source.byteSize,
    sha256: source.sha256,
    authority: source.authority,
    validFrom: source.validFrom,
    supersedesSourceId: source.supersedesSourceId,
    indexStatus: source.indexStatus,
    indexError: source.indexError,
    createdAt: source.createdAt,
  };
}

function safeFilename(filename: string): string {
  const normalized = filename.normalize("NFKC").replace(/[^A-Za-z0-9._-]+/g, "-");
  return normalized.replace(/^-+|-+$/g, "").slice(0, 160) || "source.txt";
}

function extension(filename: string): string {
  return filename.toLowerCase().split(".").pop() ?? "";
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
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${apiKey}`);
  if (idempotencyKey) headers.set("Idempotency-Key", idempotencyKey);
  const response = await fetch(`https://api.openai.com/v1${path}`, { ...init, headers });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 800);
    throw new Error(`OpenAI indexing request failed (${response.status}): ${detail || response.statusText}`);
  }
  return response.json() as Promise<T>;
}

async function ensureVectorStore(
  repository: ContinuityRepository,
  projectId: string,
  projectTitle: string,
  apiKey: string,
  configuredVectorStoreId?: string,
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
): Promise<{
  capability: "stored_only" | "indexing" | "indexed" | "stored_with_index_error";
  vectorStoreId?: string;
}> {
  const apiKey = bindings.OPENAI_API_KEY?.trim();
  if (!apiKey) return { capability: "stored_only" };

  try {
    const vectorStoreId = await ensureVectorStore(
      repository,
      source.projectId,
      projectTitle,
      apiKey,
      bindings.OPENAI_VECTOR_STORE_ID?.trim(),
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
      upload.set("file", originalFile, source.filename);
      const uploaded = await openAIRequest<OpenAIObject>(
        apiKey,
        "/files",
        { method: "POST", body: upload },
        `continuity-source-${source.versionId}`,
      );
      fileId = uploaded.id;
      await repository.setProviderBinding({
        projectId: source.projectId,
        internalId: source.versionId,
        kind: "source_file",
        externalId: fileId,
        metadata: { sha256: source.sha256, filename: source.filename },
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
            authority: source.authority,
            ...(source.validFrom ? { valid_from: source.validFrom } : {}),
            ...(source.supersedesSourceId ? { supersedes_source_id: source.supersedesSourceId } : {}),
          },
        }),
      },
      `continuity-attach-${source.versionId}`,
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
    return { capability: "stored_with_index_error" };
  }
}

async function refreshIndexingStatuses(
  repository: ContinuityRepository,
  sources: StoredSource[],
  bindings: RuntimeEnv,
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
  const message = error instanceof Error ? error.message : "Unexpected storage error";
  return Response.json({ error: message }, { status: 500 });
}

export async function GET(request: Request) {
  const projectId = new URL(request.url).searchParams.get("projectId")?.trim() ?? "";
  if (!PROJECT_ID_PATTERN.test(projectId)) {
    return Response.json({ error: "A valid projectId is required." }, { status: 400 });
  }

  try {
    const bindings = await runtimeEnv();
    if (!bindings.DB) throw new Error("Continuity storage is not configured.");
    const repository = new ContinuityRepository(bindings.DB);
    const storedSources = await repository.listSources(projectId);
    const sources = storedSources.some((source) => source.indexStatus === "indexing")
      ? await refreshIndexingStatuses(repository, storedSources, bindings)
      : storedSources;
    return Response.json({ projectId, sources: sources.map(publicSource) });
  } catch (error) {
    return databaseUnavailable(error);
  }
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const projectId = String(form.get("projectId") ?? "").trim();
    const projectTitle = String(form.get("projectTitle") ?? "Continuity Lab project").trim().slice(0, 160);
    const uploaded = form.get("file");
    const authorityValue = String(form.get("authority") ?? "reference") as CanonAuthority;
    const validFrom = String(form.get("validFrom") ?? "").trim() || null;
    const supersedesSourceId = String(form.get("supersedesSourceId") ?? "").trim() || null;

    if (!PROJECT_ID_PATTERN.test(projectId)) {
      return Response.json({ error: "A valid projectId is required." }, { status: 400 });
    }
    if (!(uploaded instanceof File)) {
      return Response.json({ error: "A source file is required." }, { status: 400 });
    }
    if (!uploaded.size || uploaded.size > MAX_SOURCE_BYTES) {
      return Response.json({ error: "Source files must be between 1 byte and 20 MB." }, { status: 413 });
    }
    if (!ALLOWED_EXTENSIONS.has(extension(uploaded.name))) {
      return Response.json({ error: "This file type is not supported yet." }, { status: 415 });
    }
    if (!AUTHORITIES.has(authorityValue)) {
      return Response.json({ error: "The source authority value is invalid." }, { status: 400 });
    }

    const bindings = await runtimeEnv();
    if (!bindings.DB || !bindings.SOURCES) {
      throw new Error("Continuity source storage is not configured.");
    }
    const repository = new ContinuityRepository(bindings.DB);
    const project = await repository.ensureProject(projectId, projectTitle || "Continuity Lab project");
    if (supersedesSourceId && !(await repository.getSource(projectId, supersedesSourceId))) {
      return Response.json({
        error: "supersedesSourceId must identify an existing source in this project.",
      }, { status: 400 });
    }
    const bytes = await uploaded.arrayBuffer();
    const sha256 = await sha256Hex(bytes);
    const existing = await repository.findSourceByChecksum(projectId, sha256);
    if (existing) {
      const indexing = existing.indexStatus === "indexed" || existing.indexStatus === "indexing"
        ? { capability: existing.indexStatus as "indexed" | "indexing" }
        : await indexSource(repository, existing, uploaded, project.title, bindings);
      const refreshed = await repository.findSourceByChecksum(projectId, sha256) ?? existing;
      return Response.json({
        source: publicSource(refreshed),
        deduplicated: true,
        ...indexing,
      });
    }

    const sourceId = `source_${crypto.randomUUID()}`;
    const versionId = `source-version_${crypto.randomUUID()}`;
    const filename = safeFilename(uploaded.name);
    const r2Key = `projects/${encodeURIComponent(projectId)}/source-versions/${versionId}/${filename}`;
    await bindings.SOURCES.put(r2Key, bytes, {
      httpMetadata: { contentType: uploaded.type || "application/octet-stream" },
      customMetadata: { projectId, sourceId, versionId, sha256 },
    });

    let source: StoredSource;
    try {
      source = await repository.createSource({
        id: sourceId,
        projectId,
        versionId,
        logicalName: String(form.get("logicalName") ?? uploaded.name).trim().slice(0, 200) || uploaded.name,
        filename,
        contentType: uploaded.type || "application/octet-stream",
        byteSize: uploaded.size,
        sha256,
        r2Key,
        authority: authorityValue,
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
      ? await repository.bumpProjectRevision(projectId)
      : project.activeRevision;

    const indexing = await indexSource(repository, source, uploaded, project.title, bindings);
    const refreshed = await repository.findSourceByChecksum(projectId, sha256) ?? source;
    return Response.json({
      source: publicSource(refreshed),
      projectRevision,
      deduplicated: source.id !== sourceId,
      ...indexing,
    }, { status: 201 });
  } catch (error) {
    return databaseUnavailable(error);
  }
}
