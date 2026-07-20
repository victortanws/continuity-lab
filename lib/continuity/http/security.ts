import {
  resolveRequestIdentity,
  trustedAuthenticatedUserEmail,
  type IdentityTrustConfig,
} from "@/lib/continuity/auth/project-scope";

export type RequestBodyKind = "json" | "multipart";

export class RequestBodyError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 413,
    readonly code: "invalid_body" | "request_body_too_large",
  ) {
    super(message);
    this.name = "RequestBodyError";
  }
}

export function guardRequestBody(
  request: Request,
  options: {
    kind: RequestBodyKind;
    maxBytes: number;
    requireIdentityBeforeParsing?: boolean;
    identityTrust?: IdentityTrustConfig;
  },
): Response | null {
  const url = new URL(request.url);
  if (options.requireIdentityBeforeParsing
    && resolveRequestIdentity(request, options.identityTrust).kind === "untrusted") {
    return Response.json({
      error: "A trusted authenticated ingress is required before sending project data.",
      code: "trusted_ingress_required",
    }, { status: 401 });
  }

  const expected = options.kind === "json" ? "application/json" : "multipart/form-data";
  const contentType = parseContentType(request.headers.get("content-type") ?? "");
  const validContentType = contentType?.mediaType === expected
    && (options.kind !== "multipart" || validMultipartBoundary(contentType.parameters.get("boundary")));
  if (!validContentType) {
    return Response.json({ error: `Content-Type must be ${expected}.` }, { status: 415 });
  }
  const declaredLength = request.headers.get("content-length");
  if (declaredLength) {
    const parsed = Number(declaredLength);
    if (!Number.isSafeInteger(parsed) || parsed < 0) {
      return Response.json({ error: "Content-Length is invalid." }, { status: 400 });
    }
    if (parsed > options.maxBytes) {
      return Response.json({ error: "The request body exceeds the permitted size." }, { status: 413 });
    }
  }

  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    return Response.json({ error: "Cross-site requests are not permitted." }, { status: 403 });
  }
  if (origin) {
    let parsedOrigin: string;
    try { parsedOrigin = new URL(origin).origin; } catch {
      return Response.json({ error: "Request Origin is invalid." }, { status: 403 });
    }
    if (parsedOrigin !== url.origin) {
      return Response.json({ error: "Cross-origin requests are not permitted." }, { status: 403 });
    }
  }
  return null;
}

type ParsedContentType = {
  mediaType: string;
  parameters: Map<string, string>;
};

const HTTP_TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

function splitContentTypeSections(value: string): string[] | null {
  const sections: string[] = [];
  let start = 0;
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quoted && character === "\\") {
      escaped = true;
      continue;
    }
    if (character === '"') {
      quoted = !quoted;
      continue;
    }
    if (!quoted && character === ";") {
      sections.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  if (quoted || escaped) return null;
  sections.push(value.slice(start).trim());
  return sections.some((section) => !section) ? null : sections;
}

function parseParameterValue(value: string): string | null {
  if (HTTP_TOKEN.test(value)) return value;
  if (value.length < 2 || !value.startsWith('"') || !value.endsWith('"')) return null;
  let parsed = "";
  for (let index = 1; index < value.length - 1; index += 1) {
    const character = value[index];
    if (character === "\\") {
      index += 1;
      if (index >= value.length - 1) return null;
      parsed += value[index];
      continue;
    }
    if (character === '"' || /[\u0000-\u001f\u007f]/.test(character)) return null;
    parsed += character;
  }
  return parsed;
}

function parseContentType(value: string): ParsedContentType | null {
  const sections = splitContentTypeSections(value.trim());
  if (!sections?.length) return null;
  const [rawMediaType, ...rawParameters] = sections;
  const mediaParts = rawMediaType.split("/");
  if (mediaParts.length !== 2 || !mediaParts.every((part) => HTTP_TOKEN.test(part))) return null;

  const parameters = new Map<string, string>();
  for (const section of rawParameters) {
    const equalsAt = section.indexOf("=");
    if (equalsAt <= 0) return null;
    const name = section.slice(0, equalsAt).trim().toLowerCase();
    const valuePart = section.slice(equalsAt + 1).trim();
    const parsedValue = parseParameterValue(valuePart);
    if (!HTTP_TOKEN.test(name) || parsedValue === null || parameters.has(name)) return null;
    parameters.set(name, parsedValue);
  }
  return { mediaType: rawMediaType.toLowerCase(), parameters };
}

function validMultipartBoundary(boundary: string | undefined): boolean {
  return Boolean(
    boundary
    && boundary.length <= 70
    && !boundary.endsWith(" ")
    && /^[0-9A-Za-z'()+_,\-./:=? ]+$/.test(boundary),
  );
}

export function privateNoStoreHeaders(): HeadersInit {
  return { "Cache-Control": "private, no-store, max-age=0" };
}

/**
 * Read a request incrementally and stop as soon as the actual bytes exceed the
 * server limit. Content-Length remains a useful early rejection signal, but is
 * never trusted as the enforcement boundary because it can be absent or false.
 */
export async function readBoundedRequestBytes(request: Request, maxBytes: number): Promise<Uint8Array> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new TypeError("maxBytes must be a positive integer.");
  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.byteLength) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        throw new RequestBodyError(
          "The request body exceeds the permitted size.",
          413,
          "request_body_too_large",
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

export async function readJsonBodyBounded(request: Request, maxBytes: number): Promise<unknown> {
  const bytes = await readBoundedRequestBytes(request, maxBytes);
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (error instanceof RequestBodyError) throw error;
    throw new RequestBodyError("The request body must be valid UTF-8 JSON.", 400, "invalid_body");
  }
}

export async function readFormDataBodyBounded(request: Request, maxBytes: number): Promise<FormData> {
  const contentType = request.headers.get("content-type") ?? "";
  const bytes = await readBoundedRequestBytes(request, maxBytes);
  try {
    const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const parsed = new Request("https://continuity.invalid/upload", {
      method: "POST",
      headers: { "content-type": contentType },
      body,
    });
    return await parsed.formData();
  } catch (error) {
    if (error instanceof RequestBodyError) throw error;
    throw new RequestBodyError("The multipart request body is malformed.", 400, "invalid_body");
  }
}

export function requestBodyErrorResponse(error: RequestBodyError): Response {
  return Response.json({ error: error.message, code: error.code }, {
    status: error.status,
    headers: privateNoStoreHeaders(),
  });
}

async function actorDigest(request: Request, identityTrust: IdentityTrustConfig = {}): Promise<string> {
  const trustedEmail = trustedAuthenticatedUserEmail(request, identityTrust);
  const identity = trustedEmail
    ?? `${resolveRequestIdentity(request, identityTrust).kind}:${new URL(request.url).hostname.toLowerCase()}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(identity));
  return [...new Uint8Array(digest)].slice(0, 16)
    .map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function usageActorScopeKey(
  request: Request,
  identityTrust: IdentityTrustConfig = {},
): Promise<string> {
  return `actor-${await actorDigest(request, identityTrust)}`;
}

export async function usageScopeKey(
  request: Request,
  projectId: string,
  identityTrust: IdentityTrustConfig = {},
): Promise<string> {
  const suffix = await actorDigest(request, identityTrust);
  return `${projectId.slice(0, 128)}:actor-${suffix}`;
}

export function rateLimitResponse(retryAfterSeconds: number): Response {
  return Response.json({
    error: "This operation has reached its safety limit. Try again after the window resets.",
    code: "rate_limit_exceeded",
  }, {
    status: 429,
    headers: { ...privateNoStoreHeaders(), "Retry-After": String(retryAfterSeconds) },
  });
}
