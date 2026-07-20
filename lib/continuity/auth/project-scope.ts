const SHARED_READ_ONLY_PROJECTS = new Set(["vcs-demo"]);
const AUTHENTICATED_USER_HEADER = "oai-authenticated-user-email";

/**
 * A deployment may trust the authenticated-user header only on origins whose
 * ingress strips caller-supplied copies and injects the verified identity.
 * Leaving this unset is deliberately fail-closed for hosted mutable projects.
 */
export type IdentityTrustConfig = {
  trustedIngressOrigins?: string | null;
};

export type RequestIdentityDecision =
  | { kind: "localhost"; email: null }
  | { kind: "trusted-ingress"; email: string }
  | { kind: "untrusted"; email: null };

export type ProjectScope = {
  requestedProjectId: string;
  projectId: string;
  ownerScope: "shared-sample" | "authenticated-user" | "localhost";
};

export function isLocalRequest(request: Request): boolean {
  const hostname = new URL(request.url).hostname.toLowerCase();
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function parseTrustedIngressOrigins(value: string | null | undefined): Set<string> | null {
  const entries = (value ?? "").split(/[\n,]/).map((entry) => entry.trim()).filter(Boolean);
  if (!entries.length) return null;

  const origins = new Set<string>();
  for (const entry of entries) {
    try {
      const parsed = new URL(entry);
      const normalizedEntry = entry.endsWith("/") ? entry.slice(0, -1) : entry;
      if (
        parsed.protocol !== "https:"
        || parsed.username
        || parsed.password
        || parsed.pathname !== "/"
        || parsed.search
        || parsed.hash
        || parsed.origin !== normalizedEntry
      ) return null;
      origins.add(parsed.origin);
    } catch {
      return null;
    }
  }
  return origins;
}

function normalizedAuthenticatedEmail(request: Request): string | null {
  const email = request.headers.get(AUTHENTICATED_USER_HEADER)?.trim().toLowerCase() ?? "";
  if (!email || email.length > 320 || /[\u0000-\u0020\u007f]/.test(email)) return null;
  return email;
}

/**
 * This is the single hosted-identity decision used by project scoping, body
 * guards, operator allowlists, and usage accounting. A header by itself never
 * establishes identity.
 */
export function resolveRequestIdentity(
  request: Request,
  trust: IdentityTrustConfig = {},
): RequestIdentityDecision {
  if (isLocalRequest(request)) return { kind: "localhost", email: null };

  const trustedOrigins = parseTrustedIngressOrigins(trust.trustedIngressOrigins);
  const requestOrigin = new URL(request.url).origin;
  if (!trustedOrigins?.has(requestOrigin)) return { kind: "untrusted", email: null };

  const email = normalizedAuthenticatedEmail(request);
  return email
    ? { kind: "trusted-ingress", email }
    : { kind: "untrusted", email: null };
}

export function trustedAuthenticatedUserEmail(
  request: Request,
  trust: IdentityTrustConfig = {},
): string | null {
  const identity = resolveRequestIdentity(request, trust);
  return identity.kind === "trusted-ingress" ? identity.email : null;
}

/**
 * Browser-visible project labels are not storage tenant IDs. Hosted mutable
 * workspaces are deterministically namespaced by a verified ingress identity
 * without persisting or exposing the email address itself.
 */
export async function resolveProjectScope(
  request: Request,
  requestedProjectId: string,
  trust: IdentityTrustConfig = {},
): Promise<ProjectScope | null> {
  if (SHARED_READ_ONLY_PROJECTS.has(requestedProjectId)) {
    return { requestedProjectId, projectId: requestedProjectId, ownerScope: "shared-sample" };
  }

  const identity = resolveRequestIdentity(request, trust);
  if (identity.kind === "trusted-ingress") {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(identity.email));
    const suffix = [...new Uint8Array(digest)]
      .slice(0, 12)
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    return {
      requestedProjectId,
      projectId: `${requestedProjectId.slice(0, 96)}:user-${suffix}`,
      ownerScope: "authenticated-user",
    };
  }

  if (identity.kind === "localhost") {
    return {
      requestedProjectId,
      projectId: `${requestedProjectId.slice(0, 112)}:local`,
      ownerScope: "localhost",
    };
  }

  return null;
}

export function projectAuthenticationRequired(): Response {
  return Response.json({
    error: "A trusted authenticated ingress is required to use a mutable Continuity Lab workspace.",
    code: "trusted_ingress_required",
  }, { status: 401 });
}

export function projectMutationForbidden(scope: ProjectScope): Response | null {
  if (scope.ownerScope !== "shared-sample") return null;
  return Response.json({
    error: "The reviewed sample is read-only. Use your signed-in workspace for uploads or repository connections.",
    code: "shared_sample_read_only",
  }, { status: 403 });
}
