export type ConnectorExecutionFailureCode =
  | "connector_deadline_exceeded"
  | "connector_call_limit_exceeded"
  | "connector_response_too_large"
  | "connector_response_invalid";

/**
 * One server-owned budget shared by every outbound connector call made for a
 * single HTTP request. `signalFor` reserves a call synchronously, so parallel
 * blob fetches cannot race past the cap. There is intentionally no retry API.
 */
export class ConnectorExecutionBudget {
  readonly deadlineAt: number;
  readonly maxCalls: number;
  private callsStarted = 0;

  constructor(options: { deadlineAt: number; maxCalls: number }) {
    if (!Number.isFinite(options.deadlineAt)) {
      throw new TypeError("A finite connector deadline is required.");
    }
    if (!Number.isSafeInteger(options.maxCalls) || options.maxCalls < 1 || options.maxCalls > 512) {
      throw new TypeError("Connector maxCalls must be an integer between 1 and 512.");
    }
    this.deadlineAt = Math.floor(options.deadlineAt);
    this.maxCalls = options.maxCalls;
  }

  signalFor(phase: string, perCallTimeoutMs: number): AbortSignal {
    const remainingMs = this.deadlineAt - Date.now();
    if (remainingMs <= 0) {
      throw new ConnectorExecutionError(
        "The connector execution deadline was reached before the next call could begin.",
        "connector_deadline_exceeded",
        phase,
        504,
      );
    }
    if (this.callsStarted >= this.maxCalls) {
      throw new ConnectorExecutionError(
        "The connector call budget was exhausted.",
        "connector_call_limit_exceeded",
        phase,
        503,
      );
    }
    if (!Number.isSafeInteger(perCallTimeoutMs) || perCallTimeoutMs < 1) {
      throw new TypeError("A positive per-call connector timeout is required.");
    }
    this.callsStarted += 1;
    return AbortSignal.timeout(Math.max(1, Math.min(perCallTimeoutMs, remainingMs)));
  }

  deadlineExceeded(): boolean {
    return Date.now() >= this.deadlineAt;
  }

  snapshot(): { callsStarted: number; maxCalls: number; remainingMs: number } {
    return {
      callsStarted: this.callsStarted,
      maxCalls: this.maxCalls,
      remainingMs: Math.max(0, this.deadlineAt - Date.now()),
    };
  }
}

export class ConnectorExecutionError extends Error {
  constructor(
    message: string,
    readonly code: ConnectorExecutionFailureCode,
    readonly phase: string,
    readonly httpStatus: 502 | 503 | 504,
  ) {
    super(message);
    this.name = "ConnectorExecutionError";
  }
}

export function connectorAbortError(
  error: unknown,
  budget: ConnectorExecutionBudget,
  phase: string,
): ConnectorExecutionError | null {
  if (error instanceof ConnectorExecutionError) return error;
  if (!budget.deadlineExceeded()) return null;
  return new ConnectorExecutionError(
    "The connector execution deadline expired during an outbound call.",
    "connector_deadline_exceeded",
    phase,
    504,
  );
}

/** Read a connector response without trusting Content-Length and cancel the
 * stream immediately when the real byte count exceeds the server-owned cap. */
export async function readConnectorResponseBytesBounded(
  response: Response,
  maxBytes: number,
  phase: string,
): Promise<Uint8Array> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new TypeError("Connector response maxBytes must be a positive integer.");
  }
  const declared = response.headers.get("content-length");
  if (declared !== null) {
    const parsed = Number(declared);
    if (!Number.isSafeInteger(parsed) || parsed < 0) {
      throw new ConnectorExecutionError(
        "The connector returned an invalid Content-Length.",
        "connector_response_invalid",
        phase,
        502,
      );
    }
    if (parsed > maxBytes) throw connectorResponseTooLarge(phase);
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
        throw connectorResponseTooLarge(phase);
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

export async function readConnectorResponseTextBounded(
  response: Response,
  maxBytes: number,
  phase: string,
): Promise<string> {
  const bytes = await readConnectorResponseBytesBounded(response, maxBytes, phase);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new ConnectorExecutionError(
      "The connector returned invalid UTF-8.",
      "connector_response_invalid",
      phase,
      502,
    );
  }
}

export async function readConnectorResponseJsonBounded<T>(
  response: Response,
  maxBytes: number,
  phase: string,
): Promise<T> {
  const text = await readConnectorResponseTextBounded(response, maxBytes, phase);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ConnectorExecutionError(
      "The connector returned malformed JSON.",
      "connector_response_invalid",
      phase,
      502,
    );
  }
}

function connectorResponseTooLarge(phase: string): ConnectorExecutionError {
  return new ConnectorExecutionError(
    "The connector response exceeded its server-owned byte limit.",
    "connector_response_too_large",
    phase,
    502,
  );
}
