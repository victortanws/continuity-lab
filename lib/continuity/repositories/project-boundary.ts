import type { RepositoryTreeEntry } from "./github";

export type RepositoryProjectKind = "product" | "story" | "example" | "fixture" | "subtree";
export type RepositoryProjectScopeOrigin = "repository_declared" | "discovered" | "explicit_subtree";

export type RepositoryProjectScope = {
  id: string;
  label: string;
  rootPath: string;
  kind: RepositoryProjectKind;
  origin: RepositoryProjectScopeOrigin;
  signals: string[];
  include: string[];
  exclude: string[];
};

export type RepositoryProjectScopeResolution = {
  status: "resolved" | "ambiguous" | "not_found";
  selected: RepositoryProjectScope | null;
  candidates: RepositoryProjectScope[];
  requestedScope: string | null;
  reason: string;
};

const PROJECT_MANIFESTS = new Set([
  "package.json", "pyproject.toml", "cargo.toml", "go.mod", "pom.xml",
  "build.gradle", "build.gradle.kts", "composer.json", "gemfile",
]);
const PROJECT_GUIDES = new Set(["readme.md", "agents.md", "claude.md"]);
const SCOPE_CONFIG_PATHS = new Set(["continuity.config.json", ".continuity/config.json"]);
const EXAMPLE_SEGMENTS = new Set(["example", "examples", "demo", "demos", "sample", "samples"]);
const FIXTURE_SEGMENTS = new Set(["fixture", "fixtures", "testdata", "test-data"]);
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const GENERIC_SCOPE_TOKENS = new Set([
  "canon", "codebase", "current", "demo", "example", "folder", "product",
  "project", "repo", "repository", "reviewed", "sample", "story", "truth",
]);

type DeclaredScopeValue = {
  id?: unknown;
  label?: unknown;
  root?: unknown;
  kind?: unknown;
  include?: unknown;
  exclude?: unknown;
};

function normalizePath(value: string): string {
  const normalized = value.trim().replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/+$/, "");
  return normalized || ".";
}

function safeRelativePath(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim() || value.length > 240) return null;
  const normalized = normalizePath(value);
  if (
    normalized.startsWith("/") || normalized.includes("\\")
    || normalized.split("/").some((part) => !part || part === "..")
    || /[\u0000-\u001f\u007f]/.test(normalized)
  ) return null;
  return normalized;
}

function safePattern(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 240
    && !value.startsWith("/") && !value.includes("\\") && !value.includes("..")
    && !/[\u0000-\u001f\u007f]/.test(value);
}

function stringPatterns(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(safePattern).slice(0, 64))];
}

function scopeKind(value: unknown, rootPath: string): RepositoryProjectKind {
  if (["product", "story", "example", "fixture", "subtree"].includes(String(value))) {
    return value as RepositoryProjectKind;
  }
  return inferredKind(rootPath);
}

function inferredKind(rootPath: string): RepositoryProjectKind {
  const segments = rootPath.toLocaleLowerCase("en-US").split("/");
  if (segments.some((segment) => FIXTURE_SEGMENTS.has(segment))) return "fixture";
  if (segments.some((segment) => EXAMPLE_SEGMENTS.has(segment))) return "example";
  return "product";
}

function defaultLabel(rootPath: string, repositoryLabel: string): string {
  if (rootPath === ".") return repositoryLabel;
  return rootPath.split("/").at(-1)?.replace(/[-_]+/g, " ") || rootPath;
}

function stableDiscoveredId(rootPath: string): string {
  if (rootPath === ".") return "repository-root";
  const slug = rootPath.toLocaleLowerCase("en-US").replace(/[^a-z0-9._:-]+/g, "-").replace(/^-+|-+$/g, "");
  return `project-${slug}`.slice(0, 128);
}

export function findRepositoryScopeConfigEntry(entries: RepositoryTreeEntry[]): RepositoryTreeEntry | null {
  return entries.find((entry) => entry.type === "blob" && SCOPE_CONFIG_PATHS.has(entry.path.toLocaleLowerCase("en-US"))) ?? null;
}

/**
 * Scope declarations identify evidence domains; they do not grant authority,
 * completeness, or trust. Malformed declarations are ignored independently.
 */
export function parseDeclaredRepositoryProjectScopes(text: string): RepositoryProjectScope[] {
  try {
    const parsed = JSON.parse(text) as { projectScopes?: unknown };
    if (!Array.isArray(parsed?.projectScopes)) return [];
    const seen = new Set<string>();
    return parsed.projectScopes.slice(0, 24).flatMap((raw): RepositoryProjectScope[] => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
      const value = raw as DeclaredScopeValue;
      if (typeof value.id !== "string" || !SAFE_ID.test(value.id) || seen.has(value.id)) return [];
      const rootPath = safeRelativePath(value.root ?? ".");
      if (!rootPath) return [];
      const label = typeof value.label === "string" && value.label.trim() && value.label.length <= 120
        ? value.label.trim()
        : value.id;
      seen.add(value.id);
      return [{
        id: value.id,
        label,
        rootPath,
        kind: scopeKind(value.kind, rootPath),
        origin: "repository_declared",
        signals: ["continuity.config.json"],
        include: stringPatterns(value.include),
        exclude: stringPatterns(value.exclude),
      }];
    });
  } catch {
    return [];
  }
}

export function discoverRepositoryProjectScopes(
  entries: RepositoryTreeEntry[],
  declared: RepositoryProjectScope[] = [],
  repositoryLabel = "Repository root",
): RepositoryProjectScope[] {
  const signalsByRoot = new Map<string, Set<string>>();
  const addSignal = (root: string, signal: string) => {
    const current = signalsByRoot.get(root) ?? new Set<string>();
    current.add(signal);
    signalsByRoot.set(root, current);
  };

  addSignal(".", "repository_root");
  for (const entry of entries) {
    if (entry.type !== "blob") continue;
    const parts = entry.path.split("/");
    const basename = parts.at(-1)?.toLocaleLowerCase("en-US") ?? "";
    const rootPath = parts.length > 1 ? parts.slice(0, -1).join("/") : ".";
    if (PROJECT_MANIFESTS.has(basename)) addSignal(rootPath, basename);
    if (PROJECT_GUIDES.has(basename)) addSignal(rootPath, basename);
    if (SCOPE_CONFIG_PATHS.has(entry.path.toLocaleLowerCase("en-US"))) addSignal(rootPath, entry.path);
  }

  const declaredProjectRoots = new Set(declared.filter((scope) => scope.kind !== "example" && scope.kind !== "fixture")
    .map((scope) => scope.rootPath));
  const discovered = [...signalsByRoot.entries()].flatMap(([rootPath, signals]): RepositoryProjectScope[] => {
    const strong = [...signals].some((signal) => PROJECT_MANIFESTS.has(signal) || signal.includes("continuity.config"));
    if (rootPath !== "." && !strong) return [];
    if (declaredProjectRoots.has(rootPath)) return [];
    return [{
      id: stableDiscoveredId(rootPath),
      label: defaultLabel(rootPath, repositoryLabel),
      rootPath,
      kind: inferredKind(rootPath),
      origin: "discovered",
      signals: [...signals].sort(),
      include: [],
      exclude: [],
    }];
  });

  return [...declared, ...discovered].sort((a, b) => {
    if (a.rootPath === "." && b.rootPath !== ".") return -1;
    if (b.rootPath === "." && a.rootPath !== ".") return 1;
    return a.label.localeCompare(b.label) || a.id.localeCompare(b.id);
  });
}

function questionTokens(value: string): Set<string> {
  return new Set((value.toLocaleLowerCase("en-US").match(/[\p{L}\p{N}][\p{L}\p{N}._-]{1,}/gu) ?? [])
    .filter((token) => !GENERIC_SCOPE_TOKENS.has(token)));
}

function candidateMatchScore(scope: RepositoryProjectScope, question: string): number {
  const tokens = questionTokens(question);
  const identifying = questionTokens(`${scope.id} ${scope.label} ${scope.rootPath === "." ? "" : scope.rootPath}`);
  let score = 0;
  for (const token of identifying) if (tokens.has(token)) score += token.length >= 4 ? 2 : 1;
  const lower = question.toLocaleLowerCase("en-US");
  if (lower.includes(scope.id.toLocaleLowerCase("en-US"))) score += 4;
  if (scope.label.length >= 4 && lower.includes(scope.label.toLocaleLowerCase("en-US"))) score += 6;
  return score;
}

function explicitSubtree(entries: RepositoryTreeEntry[], requestedScope: string): RepositoryProjectScope | null {
  const rootPath = safeRelativePath(requestedScope);
  if (!rootPath) return null;
  const prefix = rootPath === "." ? "" : `${rootPath}/`;
  if (!entries.some((entry) => rootPath === "." || entry.path === rootPath || entry.path.startsWith(prefix))) return null;
  return {
    id: stableDiscoveredId(rootPath),
    label: defaultLabel(rootPath, "Repository root"),
    rootPath,
    kind: "subtree",
    origin: "explicit_subtree",
    signals: ["caller_selected_subtree"],
    include: [],
    exclude: [],
  };
}

export function resolveRepositoryProjectScope(
  entries: RepositoryTreeEntry[],
  candidates: RepositoryProjectScope[],
  question: string,
  requestedScope?: string | null,
): RepositoryProjectScopeResolution {
  const requested = requestedScope?.trim() || null;
  if (requested) {
    const idMatch = candidates.find((scope) => scope.id === requested);
    const rootMatches = candidates.filter((scope) => scope.rootPath === normalizePath(requested));
    if (!idMatch && rootMatches.length > 1) {
      return {
        status: "ambiguous",
        selected: null,
        candidates: rootMatches,
        requestedScope: requested,
        reason: "requested_path_matches_multiple_domains",
      };
    }
    const selected = idMatch ?? rootMatches[0] ?? explicitSubtree(entries, requested);
    return selected
      ? { status: "resolved", selected, candidates, requestedScope: requested, reason: "caller_selected_scope" }
      : { status: "not_found", selected: null, candidates, requestedScope: requested, reason: "requested_scope_not_found" };
  }

  if (!candidates.length) {
    return { status: "not_found", selected: null, candidates: [], requestedScope: null, reason: "no_project_scope_found" };
  }
  if (candidates.length === 1) {
    return { status: "resolved", selected: candidates[0], candidates, requestedScope: null, reason: "single_scope" };
  }

  const scored = candidates.map((scope) => ({ scope, score: candidateMatchScore(scope, question) }))
    .sort((a, b) => b.score - a.score || a.scope.label.localeCompare(b.scope.label));
  if (scored[0].score > 0 && scored[0].score > scored[1].score) {
    return { status: "resolved", selected: scored[0].scope, candidates, requestedScope: null, reason: "question_named_scope" };
  }
  return {
    status: "ambiguous",
    selected: null,
    candidates,
    requestedScope: null,
    reason: "multiple_project_scopes",
  };
}

function globMatches(path: string, pattern: string): boolean {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const expression = escaped.replaceAll("**", "\u0000").replaceAll("*", "[^/]*").replaceAll("\u0000", ".*");
  return new RegExp(`^${expression}$`, "i").test(path);
}

export function repositoryEntryBelongsToScope(entry: RepositoryTreeEntry, scope: RepositoryProjectScope): boolean {
  const withinRoot = scope.rootPath === "." || entry.path === scope.rootPath || entry.path.startsWith(`${scope.rootPath}/`);
  if (!withinRoot) return false;
  if (scope.include.length && !scope.include.some((pattern) => globMatches(entry.path, pattern))) return false;
  if (scope.exclude.some((pattern) => globMatches(entry.path, pattern))) return false;
  return true;
}
