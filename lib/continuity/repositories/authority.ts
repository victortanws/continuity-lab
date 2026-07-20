import type {
  CanonAuthority,
  ClaimKind,
  EvidenceLifecycle,
  EvidenceRole,
} from "../contracts";
import { classifyRepositoryPath } from "../policy/default";

export type RepositoryAuthorityRoute = {
  pattern: string;
  authority: CanonAuthority;
  closedWorld: boolean;
  role?: EvidenceRole;
  lifecycle?: EvidenceLifecycle;
  claimKinds?: ClaimKind[];
};

export type RepositoryAuthorityMap = {
  origin: "continuity.config.json" | "safe path defaults";
  routes: RepositoryAuthorityRoute[];
};

/**
 * Repository configuration can classify already-selected evidence. It cannot
 * expand the connector's allowlist, reveal filtered files, execute code, or
 * weaken any secret/path/resource policy.
 */
export function parseRepositoryAuthorityRoutes(
  files: Array<{ path: string; text: string }>,
): RepositoryAuthorityMap {
  const config = files.find((item) => {
    const path = item.path.toLowerCase();
    return path === "continuity.config.json" || path === ".continuity/config.json";
  });
  if (!config) return { origin: "safe path defaults", routes: [] };

  try {
    const parsed = JSON.parse(config.text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid config");
    const candidates = (parsed as { sourceRoutes?: unknown }).sourceRoutes;
    if (!Array.isArray(candidates)) throw new Error("invalid routes");
    const routes = candidates.slice(0, 100).flatMap((value): RepositoryAuthorityRoute[] => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return [];
      const route = value as Record<string, unknown>;
      const pattern = typeof route.pattern === "string" ? route.pattern.trim() : "";
      const authority = typeof route.authority === "string" ? route.authority : "";
      if (!pattern || pattern.length > 240 || !isCanonAuthority(authority) || !safeRoutePattern(pattern)) return [];
      const role = isEvidenceRole(route.role) ? route.role : undefined;
      const lifecycle = isEvidenceLifecycle(route.lifecycle) ? route.lifecycle : undefined;
      const claimKinds = Array.isArray(route.claimKinds)
        ? route.claimKinds.filter(isClaimKind).slice(0, 8)
        : undefined;
      return [{ pattern, authority, closedWorld: route.closedWorld === true, role, lifecycle, claimKinds }];
    });
    return { origin: "continuity.config.json", routes };
  } catch {
    return { origin: "safe path defaults", routes: [] };
  }
}

export function classifyRepositoryFile(
  path: string,
  routes: RepositoryAuthorityRoute[],
): Required<Pick<RepositoryAuthorityRoute, "authority" | "closedWorld" | "role" | "lifecycle" | "claimKinds">> {
  const profile = classifyRepositoryPath(path);
  const declared = routes.find((route) => globMatches(path, route.pattern));
  if (declared) {
    return {
      authority: declared.authority,
      closedWorld: declared.closedWorld,
      role: declared.role ?? profile.role,
      lifecycle: declared.lifecycle ?? profile.lifecycle,
      claimKinds: declared.claimKinds?.length ? declared.claimKinds : profile.claimKinds,
    };
  }

  return {
    authority: defaultAuthority(profile.role),
    closedWorld: false,
    role: profile.role,
    lifecycle: profile.lifecycle,
    claimKinds: profile.claimKinds,
  };
}

function isCanonAuthority(value: string): value is CanonAuthority {
  return ["immutable", "canon", "retcon", "production", "proposal", "reference"].includes(value);
}

function isEvidenceRole(value: unknown): value is EvidenceRole {
  return typeof value === "string" && [
    "intent", "decision", "configuration", "implementation", "test", "observation",
    "proposal", "archive", "asset", "reference", "evaluation",
  ].includes(value);
}

function isEvidenceLifecycle(value: unknown): value is EvidenceLifecycle {
  return typeof value === "string" && ["active", "proposed", "superseded", "historical", "unknown"].includes(value);
}

function isClaimKind(value: unknown): value is ClaimKind {
  return typeof value === "string" && [
    "identity", "normative", "configured", "implemented", "tested", "observed", "causal", "historical",
  ].includes(value);
}

function defaultAuthority(role: EvidenceRole): CanonAuthority {
  if (role === "intent" || role === "decision") return "canon";
  if (["configuration", "implementation", "test", "observation", "asset"].includes(role)) return "production";
  if (role === "proposal" || role === "archive") return "proposal";
  return "reference";
}

function safeRoutePattern(pattern: string): boolean {
  return !pattern.startsWith("/") && !pattern.includes("\\") && !pattern.includes("..") && !/[\u0000-\u001f\u007f]/.test(pattern);
}

function globMatches(path: string, pattern: string): boolean {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const expression = escaped.replaceAll("**", "\u0000").replaceAll("*", "[^/]*").replaceAll("\u0000", ".*");
  return new RegExp(`^${expression}$`).test(path);
}
