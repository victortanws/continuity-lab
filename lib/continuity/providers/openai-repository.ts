import {
  ContinuityRepository,
  type SourceIndexStatus,
  type StoredRepositorySnapshot,
  type StoredSource,
} from "../storage/repository";
import {
  ConnectorExecutionBudget,
  ConnectorExecutionError,
  connectorAbortError,
  readConnectorResponseJsonBounded,
} from "../http/connector-execution";

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type OpenAIObject = {
  id: string;
  status?: "in_progress" | "completed" | "failed" | "cancelled";
};

export type RepositoryIndexResult = {
  status: SourceIndexStatus;
  capability: "stored_snapshot" | "indexing" | "indexed" | "stored_with_index_error";
  vectorStoreId?: string;
  error?: string;
  errorCode?: string;
};

const OPENAI_REPOSITORY_TIMEOUT_MS = 30_000;
const OPENAI_REPOSITORY_RESPONSE_MAX_BYTES = 256 * 1024;

/**
 * A repository snapshot receives its own vector store. Query routing selects
 * only the active snapshot's binding, so an older commit can never leak into a
 * current answer merely because both commits belong to the same project.
 */
export async function indexRepositoryPacket(input: {
  repository: ContinuityRepository;
  snapshot: StoredRepositorySnapshot;
  source: StoredSource;
  packet: File;
  projectTitle: string;
  apiKey?: string;
  fetch?: FetchLike;
  executionBudget?: ConnectorExecutionBudget;
}): Promise<RepositoryIndexResult> {
  const apiKey = input.apiKey?.trim();
  if (!apiKey) return { status: "stored", capability: "stored_snapshot" };
  const fetcher = input.fetch ?? globalThis.fetch.bind(globalThis);

  try {
    await input.repository.updateRepositorySnapshotIndexStatus(input.snapshot.id, "indexing");
    let vectorStoreId = (await input.repository.getProviderBinding(
      input.source.projectId,
      input.snapshot.id,
      "repository_vector_store",
    ))?.externalId;
    if (!vectorStoreId) {
      const vectorStore = await openAIRequest<OpenAIObject>(
        fetcher,
        apiKey,
        "/vector_stores",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: `Continuity Lab · ${input.projectTitle} · ${input.snapshot.commitSha.slice(0, 10)}`.slice(0, 120),
          }),
        },
        `continuity-repository-vector-${input.snapshot.id}`,
        input.executionBudget,
      );
      vectorStoreId = vectorStore.id;
      await input.repository.setProviderBinding({
        projectId: input.source.projectId,
        internalId: input.snapshot.id,
        kind: "repository_vector_store",
        externalId: vectorStoreId,
        metadata: { commitSha: input.snapshot.commitSha, sourceId: input.source.id },
      });
    }

    let fileId = (await input.repository.getProviderBinding(
      input.source.projectId,
      input.source.versionId,
      "repository_source_file",
    ))?.externalId;
    if (!fileId) {
      const form = new FormData();
      form.set("purpose", "assistants");
      form.set("file", input.packet, input.source.filename);
      const uploaded = await openAIRequest<OpenAIObject>(
        fetcher,
        apiKey,
        "/files",
        { method: "POST", body: form },
        `continuity-repository-file-${input.source.versionId}`,
        input.executionBudget,
      );
      fileId = uploaded.id;
      await input.repository.setProviderBinding({
        projectId: input.source.projectId,
        internalId: input.source.versionId,
        kind: "repository_source_file",
        externalId: fileId,
        metadata: { sha256: input.source.sha256, commitSha: input.snapshot.commitSha },
      });
    }

    const attached = await openAIRequest<OpenAIObject>(
      fetcher,
      apiKey,
      `/vector_stores/${encodeURIComponent(vectorStoreId)}/files`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_id: fileId,
          attributes: {
            project_id: input.source.projectId,
            source_id: input.source.id,
            source_version_id: input.source.versionId,
            authority: input.source.authority,
            snapshot_id: input.snapshot.id,
            commit_sha: input.snapshot.commitSha,
            locator: `github:${input.snapshot.commitSha}`,
            title: input.source.logicalName.slice(0, 256),
          },
        }),
      },
      `continuity-repository-attach-${input.snapshot.id}`,
      input.executionBudget,
    );
    await input.repository.setProviderBinding({
      projectId: input.source.projectId,
      internalId: input.snapshot.id,
      kind: "repository_vector_membership",
      externalId: attached.id || fileId,
      metadata: { vectorStoreId, fileId, status: attached.status ?? "in_progress" },
    });

    const status: SourceIndexStatus = attached.status === "completed" ? "indexed" : "indexing";
    await input.repository.updateRepositorySnapshotIndexStatus(input.snapshot.id, status);
    await input.repository.updateSourceIndexStatus(input.source.id, status);
    return {
      status,
      capability: status === "indexed" ? "indexed" : "indexing",
      vectorStoreId,
    };
  } catch (error) {
    const message = safeError(error);
    await input.repository.updateRepositorySnapshotIndexStatus(input.snapshot.id, "failed", message);
    await input.repository.updateSourceIndexStatus(input.source.id, "failed", message);
    return {
      status: "failed",
      capability: "stored_with_index_error",
      error: message,
      errorCode: error instanceof ConnectorExecutionError ? error.code : "repository_index_failed",
    };
  }
}

export async function refreshRepositoryPacketIndex(input: {
  repository: ContinuityRepository;
  snapshot: StoredRepositorySnapshot;
  apiKey?: string;
  fetch?: FetchLike;
  executionBudget?: ConnectorExecutionBudget;
}): Promise<StoredRepositorySnapshot> {
  const apiKey = input.apiKey?.trim();
  if (!apiKey || input.snapshot.indexStatus !== "indexing" || !input.snapshot.packetSourceId) {
    return input.snapshot;
  }
  try {
    const vectorStoreId = (await input.repository.getProviderBinding(
      input.snapshot.projectId,
      input.snapshot.id,
      "repository_vector_store",
    ))?.externalId;
    const source = await input.repository.getSource(input.snapshot.projectId, input.snapshot.packetSourceId);
    const fileId = source
      ? (await input.repository.getProviderBinding(
          input.snapshot.projectId,
          source.versionId,
          "repository_source_file",
        ))?.externalId
      : undefined;
    if (!vectorStoreId || !fileId) return input.snapshot;
    const providerFile = await openAIRequest<OpenAIObject>(
      input.fetch ?? globalThis.fetch.bind(globalThis),
      apiKey,
      `/vector_stores/${encodeURIComponent(vectorStoreId)}/files/${encodeURIComponent(fileId)}`,
      { method: "GET" },
      `continuity-repository-status-${input.snapshot.id}`,
      input.executionBudget,
    );
    if (providerFile.status === "completed") {
      await input.repository.updateRepositorySnapshotIndexStatus(input.snapshot.id, "indexed");
      await input.repository.updateSourceIndexStatus(source!.id, "indexed");
    } else if (providerFile.status === "failed" || providerFile.status === "cancelled") {
      const message = `OpenAI repository indexing ended with status ${providerFile.status}.`;
      await input.repository.updateRepositorySnapshotIndexStatus(input.snapshot.id, "failed", message);
      await input.repository.updateSourceIndexStatus(source!.id, "failed", message);
    }
    return await input.repository.getRepositorySnapshot(input.snapshot.id) ?? input.snapshot;
  } catch {
    // A provider status poll is advisory. Preserve the last durable state when
    // the provider is temporarily unavailable.
    return input.snapshot;
  }
}

async function openAIRequest<T>(
  fetcher: FetchLike,
  apiKey: string,
  path: string,
  init: RequestInit,
  idempotencyKey: string,
  executionBudget?: ConnectorExecutionBudget,
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${apiKey}`);
  headers.set("Idempotency-Key", idempotencyKey);
  const phase = "openai_repository_index";
  let response: Response;
  try {
    response = await fetcher(`https://api.openai.com/v1${path}`, {
      ...init,
      headers,
      redirect: "error",
      signal: executionBudget?.signalFor(phase, OPENAI_REPOSITORY_TIMEOUT_MS)
        ?? AbortSignal.timeout(OPENAI_REPOSITORY_TIMEOUT_MS),
    });
  } catch (error) {
    if (executionBudget) {
      const executionError = connectorAbortError(error, executionBudget, phase);
      if (executionError) throw executionError;
    }
    if (error instanceof ConnectorExecutionError) throw error;
    throw new Error("OpenAI repository indexing could not be reached.");
  }
  if (!response.ok) {
    throw new Error(`OpenAI repository indexing failed with status ${response.status}.`);
  }
  const payload = await readConnectorResponseJsonBounded<T>(
    response,
    OPENAI_REPOSITORY_RESPONSE_MAX_BYTES,
    phase,
  );
  if (!payload || typeof payload !== "object" || typeof (payload as unknown as OpenAIObject).id !== "string") {
    throw new Error("OpenAI repository indexing returned an invalid response.");
  }
  return payload;
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Repository indexing failed.";
  return message.slice(0, 500);
}
