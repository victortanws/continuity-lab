import type {
  CanonAuthority,
  ClaimKind,
  EvidenceLifecycle,
  EvidenceRole,
} from "../contracts";
import { classifyRepositoryPath } from "../policy/default";
import {
  ConnectorExecutionBudget,
  connectorAbortError,
} from "../http/connector-execution";

export const REPOSITORY_POLICY_VERSION = "continuity.repository-policy.v3" as const;
export const REPOSITORY_PACKET_FRAME_VERSION = "continuity.repository-frame.v1" as const;

export type RepositoryPacketFrameMetadata = {
  version: typeof REPOSITORY_PACKET_FRAME_VERSION;
  path: string;
  role: EvidenceRole;
  lifecycle: EvidenceLifecycle;
  claimKinds: ClaimKind[];
  authority: CanonAuthority;
  closedWorld: boolean;
  startLine: number;
  endLine: number;
  blobSha: string;
  contentSha256: string;
  segment: number;
  segmentCount: number;
};

export type RepositoryLimits = {
  maxTreeEntries: number;
  maxFiles: number;
  maxFileBytes: number;
  maxTotalBytes: number;
};

export const DEFAULT_REPOSITORY_LIMITS: Readonly<RepositoryLimits> = Object.freeze({
  maxTreeEntries: 2_000,
  maxFiles: 200,
  maxFileBytes: 1024 * 1024,
  maxTotalBytes: 10 * 1024 * 1024,
});

export type RepositoryReference = {
  provider: "github";
  owner: string;
  name: string;
  fullName: string;
  webUrl: string;
};

export type ResolvedRepositoryRevision = {
  requestedRef: string;
  commitSha: string;
  treeSha: string;
  committedAt: string | null;
};

export type RepositoryTreeEntry = {
  path: string;
  type: "blob" | "tree" | "commit";
  mode: string;
  sha: string;
  size: number | null;
};

export type RepositoryTree = {
  entries: RepositoryTreeEntry[];
  truncated: boolean;
};

export type RepositoryBlob = {
  bytes: Uint8Array;
  providerHash: string;
  byteSize: number;
};

export type RepositorySkipReason =
  | "tree_limit"
  | "not_blob"
  | "symlink"
  | "submodule"
  | "unsafe_path"
  | "excluded_path"
  | "sensitive_path"
  | "unsupported_type"
  | "evaluation_excluded"
  | "missing_size"
  | "empty"
  | "file_too_large"
  | "file_limit"
  | "total_byte_limit";

export type RepositorySelection = {
  selected: RepositoryTreeEntry[];
  skipped: Array<{ path: string; reason: RepositorySkipReason }>;
  coverage: {
    policyVersion: typeof REPOSITORY_POLICY_VERSION;
    treeEntriesReported: number;
    treeEntriesExamined: number;
    selectedFiles: number;
    selectedBytes: number;
    skippedFiles: number;
    complete: boolean;
    partial: boolean;
    reasons: string[];
  };
};

export interface RepositoryProvider {
  readonly provider: RepositoryReference["provider"];
  resolveRevision(repository: RepositoryReference, requestedRef?: string): Promise<ResolvedRepositoryRevision>;
  listTree(repository: RepositoryReference, revision: ResolvedRepositoryRevision): Promise<RepositoryTree>;
  readBlob(repository: RepositoryReference, entry: RepositoryTreeEntry): Promise<RepositoryBlob>;
}

const GITHUB_API_ORIGIN = "https://api.github.com";
const FULL_SHA_PATTERN = /^[0-9a-f]{40}$/i;
const OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]{1,100}$/;
const REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
const ENCODED_PATH_TRICK_PATTERN = /%(?:2e|2f|5c)/i;

export const GITHUB_RESPONSE_LIMITS = Object.freeze({
  commitJsonBytes: 256 * 1024,
  treeJsonBytes: 8 * 1024 * 1024,
  errorJsonBytes: 64 * 1024,
  blobEnvelopeBytes: 32 * 1024,
});

const ALLOWED_EXTENSIONS = new Set([
  "c", "cc", "cpp", "cs", "css", "csv", "go", "h", "hpp", "htm", "html",
  "java", "js", "json", "jsonc", "jsx", "kt", "kts", "md", "markdown", "php",
  "py", "rb", "rs", "scss", "sh", "sql", "swift", "toml", "ts", "tsv", "tsx",
  "txt", "xml", "yaml", "yml",
]);
const ALLOWED_EXTENSIONLESS = new Set([
  "agents", "authors", "changelog", "codeowners", "contributing", "copying",
  "dockerfile", "license", "makefile", "notice", "readme",
]);
const EXCLUDED_SEGMENTS = new Set([
  ".cache", ".git", ".next", ".turbo", ".venv", ".wrangler", "__pycache__",
  "bower_components", "build", "coverage", "dist", "node_modules", "out", "target",
  "vendor", "venv",
]);
const SENSITIVE_BASENAMES = new Set([
  ".dockercfg", ".netrc", ".npmrc", ".pypirc", "credentials", "credentials.json",
  "credentials.yaml", "credentials.yml", "id_dsa", "id_ecdsa", "id_ed25519",
  "id_rsa", "service-account.json", "service_account.json", "secrets.json",
  "secrets.yaml", "secrets.yml", "token.json", "tokens.json",
]);
const SENSITIVE_SUFFIXES = [".key", ".kdbx", ".p12", ".pem", ".pfx"];

export type RepositoryProviderErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "rate_limited"
  | "redirect_rejected"
  | "invalid_response"
  | "network_error"
  | "response_too_large"
  | "provider_error";

export class RepositoryProviderError extends Error {
  constructor(
    message: string,
    readonly code: RepositoryProviderErrorCode,
    readonly status: number | null = null,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "RepositoryProviderError";
  }
}

export function parseGitHubRepository(input: string): RepositoryReference {
  const value = input.trim();
  let owner = "";
  let name = "";

  if (/^[^/:?#]+\/[^/:?#]+(?:\.git)?$/.test(value)) {
    [owner, name] = value.split("/", 2);
  } else {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new TypeError("Use owner/repository or a canonical https://github.com/owner/repository URL.");
    }
    if (
      !/^https:\/\/github\.com\//i.test(value) ||
      url.protocol !== "https:" ||
      url.hostname.toLowerCase() !== "github.com" ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      ENCODED_PATH_TRICK_PATTERN.test(url.pathname)
    ) {
      throw new TypeError("Only canonical HTTPS github.com repository URLs are accepted.");
    }
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length !== 2) {
      throw new TypeError("The GitHub URL must contain exactly an owner and repository.");
    }
    [owner, name] = parts;
  }

  name = name.replace(/\.git$/i, "");
  if (!OWNER_PATTERN.test(owner) || !REPOSITORY_PATTERN.test(name) || name === "." || name === "..") {
    throw new TypeError("The GitHub owner or repository name is invalid.");
  }

  return {
    provider: "github",
    owner,
    name,
    fullName: `${owner}/${name}`,
    webUrl: `https://github.com/${owner}/${name}`,
  };
}

function pathPolicy(path: string): { safe: boolean; reason?: RepositorySkipReason } {
  if (
    !path || path.length > 512 || path.startsWith("/") || path.includes("\\") ||
    path.includes("//") || CONTROL_CHARACTER_PATTERN.test(path) ||
    ENCODED_PATH_TRICK_PATTERN.test(path)
  ) return { safe: false, reason: "unsafe_path" };

  const segments = path.split("/");
  if (segments.length > 40 || segments.some((part) => !part || part === "." || part === "..")) {
    return { safe: false, reason: "unsafe_path" };
  }
  const lowerSegments = segments.map((part) => part.toLowerCase());
  if (lowerSegments.some((part) => EXCLUDED_SEGMENTS.has(part))) {
    return { safe: false, reason: "excluded_path" };
  }
  const basename = lowerSegments.at(-1) ?? "";
  if (
    basename === ".env" || basename.startsWith(".env.") ||
    basename.startsWith("secret.") || basename.startsWith("secrets.") ||
    SENSITIVE_BASENAMES.has(basename) || SENSITIVE_SUFFIXES.some((suffix) => basename.endsWith(suffix))
  ) return { safe: false, reason: "sensitive_path" };

  const dot = basename.lastIndexOf(".");
  const extension = dot >= 0 ? basename.slice(dot + 1) : "";
  const extensionless = basename.replace(/\.(?:md|txt)$/i, "");
  if (!ALLOWED_EXTENSIONS.has(extension) && !ALLOWED_EXTENSIONLESS.has(extensionless)) {
    return { safe: false, reason: "unsupported_type" };
  }
  return { safe: true };
}

export function isSafeRepositoryPath(path: string): boolean {
  return pathPolicy(path).safe;
}

const PACKET_ROLES = new Set<EvidenceRole>([
  "intent", "decision", "configuration", "implementation", "test", "observation",
  "asset", "proposal", "archive", "evaluation", "reference",
]);
const PACKET_LIFECYCLES = new Set<EvidenceLifecycle>(["active", "proposed", "historical", "superseded", "unknown"]);
const PACKET_AUTHORITIES = new Set<CanonAuthority>([
  "immutable", "retcon", "canon", "production", "proposal", "reference",
]);
const PACKET_CLAIM_KINDS = new Set<ClaimKind>([
  "identity", "normative", "configured", "implemented", "tested", "observed", "causal", "historical",
]);
const PACKET_METADATA_KEYS = new Set([
  "version", "path", "role", "lifecycle", "claimKinds", "authority", "closedWorld",
  "startLine", "endLine", "blobSha", "contentSha256", "segment", "segmentCount",
]);

/**
 * Encode one server-authored repository frame as a single delimiter-safe token.
 * Filenames are never interpolated into HTML comments: Git permits names such
 * as `x--><!-- CONTINUITY_FILE ...`, so quoting alone cannot preserve a frame
 * boundary. Base64url keeps the marker grammar unambiguous on every runtime.
 */
export function encodeRepositoryPacketMetadata(metadata: RepositoryPacketFrameMetadata): string {
  const json = JSON.stringify(metadata);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

/** Fail-closed decoder for metadata recovered from a retrieval packet. */
export function decodeRepositoryPacketMetadata(token: string): RepositoryPacketFrameMetadata | null {
  if (!/^[A-Za-z0-9_-]{1,8192}$/.test(token)) return null;
  try {
    const normalized = token.replaceAll("-", "+").replaceAll("_", "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
    if (!isPacketRecord(value)
      || Object.keys(value).some((key) => !PACKET_METADATA_KEYS.has(key))
      || Object.keys(value).length !== PACKET_METADATA_KEYS.size
      || value.version !== REPOSITORY_PACKET_FRAME_VERSION
      || typeof value.path !== "string"
      || !isSafeRepositoryPath(value.path)
      || typeof value.role !== "string"
      || !PACKET_ROLES.has(value.role as EvidenceRole)
      || typeof value.lifecycle !== "string"
      || !PACKET_LIFECYCLES.has(value.lifecycle as EvidenceLifecycle)
      || !Array.isArray(value.claimKinds)
      || value.claimKinds.length > PACKET_CLAIM_KINDS.size
      || !value.claimKinds.every((kind) => typeof kind === "string" && PACKET_CLAIM_KINDS.has(kind as ClaimKind))
      || typeof value.authority !== "string"
      || !PACKET_AUTHORITIES.has(value.authority as CanonAuthority)
      || typeof value.closedWorld !== "boolean"
      || !positiveSafeInteger(value.startLine)
      || !positiveSafeInteger(value.endLine)
      || value.endLine < value.startLine
      || typeof value.blobSha !== "string"
      || !FULL_SHA_PATTERN.test(value.blobSha)
      || typeof value.contentSha256 !== "string"
      || !/^[a-f\d]{64}$/i.test(value.contentSha256)
      || !positiveSafeInteger(value.segment)
      || !positiveSafeInteger(value.segmentCount)
      || value.segment > value.segmentCount) return null;
    return {
      version: REPOSITORY_PACKET_FRAME_VERSION,
      path: value.path,
      role: value.role as EvidenceRole,
      lifecycle: value.lifecycle as EvidenceLifecycle,
      claimKinds: [...new Set(value.claimKinds as ClaimKind[])],
      authority: value.authority as CanonAuthority,
      closedWorld: value.closedWorld,
      startLine: value.startLine,
      endLine: value.endLine,
      blobSha: value.blobSha.toLowerCase(),
      contentSha256: value.contentSha256.toLowerCase(),
      segment: value.segment,
      segmentCount: value.segmentCount,
    };
  } catch {
    return null;
  }
}

function isPacketRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function positiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

/**
 * Repository text is embedded inside a server-authored packet. Neutralize the
 * packet's reserved control syntax in untrusted file bodies so a repository
 * cannot mint its own authority, closed-world flag, path, or line locator.
 * Original bytes remain unchanged in R2; this only affects the retrieval copy.
 */
export function escapeRepositoryPacketControlSyntax(text: string): string {
  return text
    .replace(/CONTINUITY_FILE/gi, (token) => `${token.slice(0, 10)}\u2060${token.slice(10)}`)
    .replace(/^## FILE:/gm, "## SOURCE FILE:");
}

export type SecretScanResult = { detected: boolean; kinds: string[] };

/** High-confidence content scan applied before repository bytes are persisted
 * or sent to a retrieval provider. It intentionally favors false negatives
 * over silently exporting obvious live credentials; a production deployment
 * should layer a maintained detector on top of these deterministic guards. */
export function scanRepositoryTextForSecrets(text: string): SecretScanResult {
  const kinds = new Set<string>();
  const patterns: Array<[string, RegExp]> = [
    ["private_key", /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
    ["openai_key", /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}\b/],
    ["github_token", /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{40,})\b/],
    ["aws_access_key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
    ["npm_token", /\bnpm_[A-Za-z0-9]{30,}\b/],
    ["slack_token", /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/],
  ];
  for (const [kind, pattern] of patterns) if (pattern.test(text)) kinds.add(kind);

  const assignment = /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password|passwd)\b\s*[:=]\s*["']?([A-Za-z0-9_+\/=.-]{20,})["']?/gi;
  for (const match of text.matchAll(assignment)) {
    const value = match[1] ?? "";
    if (/^(?:example|sample|placeholder|changeme|your[-_]|xxx+|test[-_])/i.test(value)) continue;
    const classes = [/[a-z]/.test(value), /[A-Z]/.test(value), /\d/.test(value), /[_+\/=.-]/.test(value)]
      .filter(Boolean).length;
    if (classes >= 3 && new Set(value).size >= 12) kinds.add("credential_assignment");
  }
  return { detected: kinds.size > 0, kinds: [...kinds].sort() };
}

export function repositoryAllowedForCredential(
  fullName: string,
  token: string | undefined,
  allowlist: string | undefined,
): boolean {
  if (!token?.trim()) return true;
  const allowed = new Set((allowlist ?? "").split(",")
    .map((value) => value.trim().toLowerCase()).filter(Boolean));
  return allowed.has(fullName.trim().toLowerCase());
}

function balancedCandidateOrder(entries: RepositoryTreeEntry[]): RepositoryTreeEntry[] {
  const roleOrder: EvidenceRole[] = [
    "intent", "decision", "configuration", "implementation", "test", "observation",
    "asset", "proposal", "archive", "reference",
  ];
  const buckets = new Map(roleOrder.map((role) => [role, [] as RepositoryTreeEntry[]]));
  const policyFiles: RepositoryTreeEntry[] = [];
  for (const entry of [...entries].sort((a, b) => a.path.localeCompare(b.path))) {
    const lower = entry.path.toLowerCase();
    if (lower === "continuity.config.json" || lower === ".continuity/config.json") {
      policyFiles.push(entry);
      continue;
    }
    const role = classifyRepositoryPath(entry.path).role;
    (buckets.get(role) ?? buckets.get("reference")!).push(entry);
  }
  const ordered = [...policyFiles];
  let remaining = true;
  while (remaining) {
    remaining = false;
    for (const role of roleOrder) {
      const next = buckets.get(role)?.shift();
      if (!next) continue;
      ordered.push(next);
      remaining = true;
    }
  }
  return ordered;
}

function positiveInteger(value: number, fallback: number): number {
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

export function selectRepositoryEntries(
  entries: RepositoryTreeEntry[],
  overrides: Partial<RepositoryLimits> = {},
): RepositorySelection {
  const limits: RepositoryLimits = {
    maxTreeEntries: positiveInteger(overrides.maxTreeEntries ?? 0, DEFAULT_REPOSITORY_LIMITS.maxTreeEntries),
    maxFiles: positiveInteger(overrides.maxFiles ?? 0, DEFAULT_REPOSITORY_LIMITS.maxFiles),
    maxFileBytes: positiveInteger(overrides.maxFileBytes ?? 0, DEFAULT_REPOSITORY_LIMITS.maxFileBytes),
    maxTotalBytes: positiveInteger(overrides.maxTotalBytes ?? 0, DEFAULT_REPOSITORY_LIMITS.maxTotalBytes),
  };
  const examined = entries.slice(0, limits.maxTreeEntries);
  const skipped: RepositorySelection["skipped"] = entries.slice(limits.maxTreeEntries)
    .map((entry) => ({ path: entry.path, reason: "tree_limit" as const }));
  const candidates: RepositoryTreeEntry[] = [];

  for (const entry of examined) {
    if (entry.type === "commit" || entry.mode === "160000") {
      skipped.push({ path: entry.path, reason: "submodule" });
      continue;
    }
    if (entry.type !== "blob") {
      skipped.push({ path: entry.path, reason: "not_blob" });
      continue;
    }
    if (entry.mode === "120000") {
      skipped.push({ path: entry.path, reason: "symlink" });
      continue;
    }
    const policy = pathPolicy(entry.path);
    if (!policy.safe) {
      skipped.push({ path: entry.path, reason: policy.reason ?? "unsafe_path" });
      continue;
    }
    if (classifyRepositoryPath(entry.path).role === "evaluation") {
      skipped.push({ path: entry.path, reason: "evaluation_excluded" });
      continue;
    }
    if (entry.size === null || !Number.isSafeInteger(entry.size) || entry.size < 0) {
      skipped.push({ path: entry.path, reason: "missing_size" });
      continue;
    }
    if (entry.size === 0) {
      skipped.push({ path: entry.path, reason: "empty" });
      continue;
    }
    if (entry.size > limits.maxFileBytes) {
      skipped.push({ path: entry.path, reason: "file_too_large" });
      continue;
    }
    candidates.push(entry);
  }

  const orderedCandidates = balancedCandidateOrder(candidates);
  const selected: RepositoryTreeEntry[] = [];
  let selectedBytes = 0;
  for (const entry of orderedCandidates) {
    if (selected.length >= limits.maxFiles) {
      skipped.push({ path: entry.path, reason: "file_limit" });
      continue;
    }
    const size = entry.size ?? 0;
    if (selectedBytes + size > limits.maxTotalBytes) {
      skipped.push({ path: entry.path, reason: "total_byte_limit" });
      continue;
    }
    selected.push(entry);
    selectedBytes += size;
  }

  const reasons = [...new Set(skipped.map((item) => item.reason))];
  return {
    selected,
    skipped,
    coverage: {
      policyVersion: REPOSITORY_POLICY_VERSION,
      treeEntriesReported: entries.length,
      treeEntriesExamined: examined.length,
      selectedFiles: selected.length,
      selectedBytes,
      skippedFiles: skipped.length,
      complete: skipped.length === 0,
      partial: skipped.length > 0,
      reasons,
    },
  };
}

function normalizedRef(value = "HEAD"): string {
  const ref = value.trim() || "HEAD";
  if (!REF_PATTERN.test(ref) || ref.includes("..") || ref.includes("//")) {
    throw new TypeError("The Git reference is invalid.");
  }
  return ref;
}

function decodeBase64(value: string): Uint8Array {
  const normalized = value.replace(/\s+/g, "");
  let binary: string;
  try {
    binary = atob(normalized);
  } catch {
    throw new RepositoryProviderError("GitHub returned malformed blob content.", "invalid_response");
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export class GitHubRepositoryProvider implements RepositoryProvider {
  readonly provider = "github" as const;
  private readonly fetcher: typeof fetch;
  private readonly token?: string;
  private readonly timeoutMs: number;
  private readonly executionBudget: ConnectorExecutionBudget | null;

  constructor(options: {
    token?: string;
    fetch?: typeof fetch;
    timeoutMs?: number;
    executionBudget?: ConnectorExecutionBudget;
  } = {}) {
    this.token = options.token?.trim() || undefined;
    this.fetcher = options.fetch ?? fetch;
    this.timeoutMs = positiveInteger(options.timeoutMs ?? 0, 15_000);
    this.executionBudget = options.executionBudget ?? null;
  }

  async resolveRevision(
    repository: RepositoryReference,
    requestedRef = "HEAD",
  ): Promise<ResolvedRepositoryRevision> {
    const ref = normalizedRef(requestedRef);
    const payload = await this.request<{
      sha?: unknown;
      commit?: { tree?: { sha?: unknown }; committer?: { date?: unknown } };
    }>(repository, `/commits/${encodeURIComponent(ref)}`, GITHUB_RESPONSE_LIMITS.commitJsonBytes, "github_resolve_revision");
    const commitSha = typeof payload.sha === "string" ? payload.sha : "";
    const treeSha = typeof payload.commit?.tree?.sha === "string" ? payload.commit.tree.sha : commitSha;
    if (!FULL_SHA_PATTERN.test(commitSha) || !FULL_SHA_PATTERN.test(treeSha)) {
      throw new RepositoryProviderError("GitHub did not return an immutable commit and tree SHA.", "invalid_response");
    }
    const date = payload.commit?.committer?.date;
    return {
      requestedRef: ref,
      commitSha: commitSha.toLowerCase(),
      treeSha: treeSha.toLowerCase(),
      committedAt: typeof date === "string" && !Number.isNaN(Date.parse(date)) ? date : null,
    };
  }

  async listTree(
    repository: RepositoryReference,
    revision: ResolvedRepositoryRevision,
  ): Promise<RepositoryTree> {
    if (!FULL_SHA_PATTERN.test(revision.treeSha)) {
      throw new TypeError("A full immutable tree SHA is required.");
    }
    const payload = await this.request<{ tree?: unknown; truncated?: unknown }>(
      repository,
      `/git/trees/${revision.treeSha}?recursive=1`,
      GITHUB_RESPONSE_LIMITS.treeJsonBytes,
      "github_list_tree",
    );
    if (!Array.isArray(payload.tree)) {
      throw new RepositoryProviderError("GitHub returned a malformed repository tree.", "invalid_response");
    }
    const entries: RepositoryTreeEntry[] = [];
    for (const raw of payload.tree) {
      if (!raw || typeof raw !== "object") continue;
      const item = raw as Record<string, unknown>;
      if (
        typeof item.path !== "string" || typeof item.type !== "string" ||
        typeof item.mode !== "string" || typeof item.sha !== "string" ||
        !["blob", "tree", "commit"].includes(item.type) || !FULL_SHA_PATTERN.test(item.sha)
      ) continue;
      entries.push({
        path: item.path,
        type: item.type as RepositoryTreeEntry["type"],
        mode: item.mode,
        sha: item.sha.toLowerCase(),
        size: typeof item.size === "number" && Number.isSafeInteger(item.size) ? item.size : null,
      });
    }
    return { entries, truncated: payload.truncated === true };
  }

  async readBlob(repository: RepositoryReference, entry: RepositoryTreeEntry): Promise<RepositoryBlob> {
    if (entry.type !== "blob" || !FULL_SHA_PATTERN.test(entry.sha)) {
      throw new TypeError("A commit-tree blob with a full SHA is required.");
    }
    const payload = await this.request<{ content?: unknown; encoding?: unknown; size?: unknown; sha?: unknown }>(
      repository,
      `/git/blobs/${entry.sha}`,
      blobResponseLimit(entry.size),
      "github_read_blob",
    );
    if (payload.encoding !== "base64" || typeof payload.content !== "string") {
      throw new RepositoryProviderError("GitHub returned an unsupported blob encoding.", "invalid_response");
    }
    const bytes = decodeBase64(payload.content);
    const providerHash = typeof payload.sha === "string" ? payload.sha.toLowerCase() : "";
    const providerSize = typeof payload.size === "number" ? payload.size : -1;
    if (providerHash !== entry.sha.toLowerCase() || providerSize !== bytes.byteLength || entry.size !== bytes.byteLength) {
      throw new RepositoryProviderError("The retrieved blob did not match the commit tree.", "invalid_response");
    }
    return { bytes, providerHash, byteSize: bytes.byteLength };
  }

  private async request<T>(
    repository: RepositoryReference,
    path: string,
    maxResponseBytes: number,
    phase: string,
  ): Promise<T> {
    const url = `${GITHUB_API_ORIGIN}/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}${path}`;
    const headers = new Headers({
      Accept: "application/vnd.github+json",
      "User-Agent": "continuity-lab-repository-sync",
      "X-GitHub-Api-Version": "2022-11-28",
    });
    if (this.token) headers.set("Authorization", `Bearer ${this.token}`);
    let response: Response;
    try {
      const signal = this.executionBudget?.signalFor(phase, this.timeoutMs)
        ?? AbortSignal.timeout(this.timeoutMs);
      response = await this.fetcher(url, {
        method: "GET",
        headers,
        redirect: "error",
        signal,
      });
    } catch (error) {
      if (this.executionBudget) {
        const executionError = connectorAbortError(error, this.executionBudget, phase);
        if (executionError) throw executionError;
      }
      if (error instanceof RepositoryProviderError) throw error;
      throw new RepositoryProviderError("GitHub could not be reached for this snapshot.", "network_error", null, true);
    }
    let responseBytes: Uint8Array;
    try {
      responseBytes = await readGitHubResponseBytes(
        response,
        response.ok ? maxResponseBytes : GITHUB_RESPONSE_LIMITS.errorJsonBytes,
      );
    } catch (error) {
      if (error instanceof RepositoryProviderError) throw error;
      if (this.executionBudget) {
        const executionError = connectorAbortError(error, this.executionBudget, phase);
        if (executionError) throw executionError;
      }
      throw new RepositoryProviderError("GitHub response streaming failed.", "network_error", null, true);
    }
    if (response.status >= 300 && response.status < 400) {
      throw new RepositoryProviderError("GitHub returned a redirect that was not followed.", "redirect_rejected", response.status);
    }
    if (!response.ok) {
      const remaining = response.headers.get("x-ratelimit-remaining");
      if (response.status === 401) throw new RepositoryProviderError("GitHub authentication failed.", "unauthorized", 401);
      if (response.status === 403 && remaining === "0") {
        throw new RepositoryProviderError("GitHub rate limit reached.", "rate_limited", 403, true);
      }
      if (response.status === 403) throw new RepositoryProviderError("GitHub access was forbidden.", "forbidden", 403);
      if (response.status === 404) throw new RepositoryProviderError("The GitHub repository or revision was not found.", "not_found", 404);
      if (response.status === 429) throw new RepositoryProviderError("GitHub rate limit reached.", "rate_limited", 429, true);
      throw new RepositoryProviderError("GitHub rejected the repository request.", "provider_error", response.status, response.status >= 500);
    }
    try {
      return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(responseBytes)) as T;
    } catch {
      throw new RepositoryProviderError("GitHub returned malformed JSON.", "invalid_response", response.status);
    }
  }
}

function blobResponseLimit(byteSize: number | null): number {
  const boundedSize = typeof byteSize === "number" && Number.isSafeInteger(byteSize) && byteSize >= 0
    ? Math.min(byteSize, DEFAULT_REPOSITORY_LIMITS.maxFileBytes)
    : DEFAULT_REPOSITORY_LIMITS.maxFileBytes;
  return Math.ceil(boundedSize * 4 / 3) + GITHUB_RESPONSE_LIMITS.blobEnvelopeBytes;
}

async function readGitHubResponseBytes(response: Response, maxBytes: number): Promise<Uint8Array> {
  const declared = response.headers.get("content-length");
  if (declared !== null) {
    const parsed = Number(declared);
    if (!Number.isSafeInteger(parsed) || parsed < 0) {
      throw new RepositoryProviderError("GitHub returned an invalid Content-Length.", "invalid_response", response.status);
    }
    if (parsed > maxBytes) {
      throw new RepositoryProviderError(
        "GitHub returned a response larger than the connector safety limit.",
        "response_too_large",
        502,
      );
    }
  }
  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.byteLength) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        try { await reader.cancel(); } catch { /* best-effort cancellation */ }
        throw new RepositoryProviderError(
          "GitHub returned a response larger than the connector safety limit.",
          "response_too_large",
          502,
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
