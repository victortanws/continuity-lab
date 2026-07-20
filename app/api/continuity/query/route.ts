import type { ConversationTurn, QueryRequest, Verdict } from "@/lib/continuity/contracts";
import { DemoReasoner, DemoRetriever, VCS_DEMO_REVISION } from "@/lib/continuity/demo";
import { CompositeRetriever, ContinuityEngine, ContinuityInputError } from "@/lib/continuity/engine";
import { OpenAIReasoner, OpenAIRetriever } from "@/lib/continuity/providers/openai";
import { ContinuityRepository } from "@/lib/continuity/storage/repository";

export const runtime = "edge";

const PROJECT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const VERDICTS = new Set<Verdict>([
  "SUPPORTED", "CONFLICT", "AMBIGUOUS", "UNREACHABLE", "INSUFFICIENT_EVIDENCE", "PROPOSAL",
]);

type RuntimeEnv = {
  DB?: D1Database;
  OPENAI_API_KEY?: string;
  OPENAI_VECTOR_STORE_ID?: string;
};

async function runtimeEnv(): Promise<RuntimeEnv> {
  // Loaded only inside the API route so server-render validation can import
  // the site worker in plain Node without resolving a Cloudflare-only module.
  const { env } = await import("cloudflare:workers");
  return env as unknown as RuntimeEnv;
}

function cleanConversation(value: unknown): ConversationTurn[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-6).flatMap((turn): ConversationTurn[] => {
    if (!turn || typeof turn !== "object") return [];
    const candidate = turn as Partial<ConversationTurn>;
    if (
      typeof candidate.question !== "string"
      || typeof candidate.answer !== "string"
      || !candidate.verdict
      || !VERDICTS.has(candidate.verdict)
    ) return [];
    return [{
      question: candidate.question.slice(0, 2_000),
      answer: candidate.answer.slice(0, 4_000),
      verdict: candidate.verdict,
    }];
  });
}

function cleanStringArray(value: unknown, limit = 20): string[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, limit).flatMap((item) => typeof item === "string" && item.trim() ? [item.trim().slice(0, 240)] : []);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unexpected continuity analysis error";
}

export async function POST(request: Request) {
  let payload: Record<string, unknown>;
  try {
    payload = await request.json() as Record<string, unknown>;
  } catch {
    return Response.json({ error: "The request body must be valid JSON." }, { status: 400 });
  }

  const projectId = typeof payload.projectId === "string" ? payload.projectId.trim() : "";
  const question = typeof payload.question === "string" ? payload.question.trim() : "";
  const proposedChange = typeof payload.proposedChange === "string"
    ? payload.proposedChange.trim().slice(0, 8_000) || null
    : null;
  if (!PROJECT_ID_PATTERN.test(projectId)) {
    return Response.json({ error: "A valid projectId is required." }, { status: 400 });
  }
  if (!question || question.length > 8_000) {
    return Response.json({ error: "A question between 1 and 8,000 characters is required." }, { status: 400 });
  }

  try {
    const bindings = await runtimeEnv();
    if (!bindings.DB) throw new Error("Continuity storage is not configured.");
    const repository = new ContinuityRepository(bindings.DB);
    let project = await repository.getProject(projectId);
    if (!project && projectId === "vcs-demo") {
      project = await repository.ensureProject(projectId, "VibeCode Simulator demonstration");
    }
    if (!project) {
      return Response.json({ error: "Project not found." }, { status: 404 });
    }

    const query: QueryRequest = {
      projectId,
      projectRevision: projectId === "vcs-demo" ? VCS_DEMO_REVISION : project.activeRevision,
      timeScope: typeof payload.timeScope === "string" ? payload.timeScope.trim().slice(0, 240) || null : null,
      storyPosition: typeof payload.storyPosition === "number" && Number.isFinite(payload.storyPosition) ? payload.storyPosition : undefined,
      question,
      conversation: cleanConversation(payload.conversation),
      proposedChange,
      contextRefs: cleanStringArray(payload.contextRefs),
      coverage: projectId === "vcs-demo"
        ? {
            scope: "The complete current VCS trigger registry plus the demo contract, economy, cast, dialogue, and asset records.",
            complete: true,
          }
        : {
            scope: "Indexed source fragments with question-scoped causal extraction; exhaustive runtime coverage is not established.",
            complete: false,
          },
    };
    const apiKey = bindings.OPENAI_API_KEY?.trim();
    const vectorBinding = await repository.getProviderBinding(projectId, projectId, "vector_store");
    const vectorStoreId = vectorBinding?.externalId || bindings.OPENAI_VECTOR_STORE_ID?.trim();

    let engine: ContinuityEngine;
    if (apiKey && vectorStoreId) {
      const openAIRetriever = new OpenAIRetriever(apiKey, vectorStoreId);
      engine = new ContinuityEngine(
        projectId === "vcs-demo"
          ? new CompositeRetriever([new DemoRetriever(), openAIRetriever])
          : openAIRetriever,
        new OpenAIReasoner(apiKey),
      );
    } else if (projectId === "vcs-demo") {
      engine = new ContinuityEngine(new DemoRetriever(), new DemoReasoner());
    } else {
      return Response.json({
        error: "This project's sources are stored, but GPT-5.6 retrieval is not configured yet.",
        code: "retrieval_not_configured",
        capability: "stored_only",
      }, { status: 409 });
    }

    const result = await engine.query(query);
    let analysisId: string | null = null;
    let persistenceWarning: string | null = null;
    try {
      analysisId = await repository.saveAnalysis(projectId, result);
    } catch (error) {
      persistenceWarning = `The answer was produced but its audit record could not be saved: ${errorMessage(error)}`;
    }

    return Response.json({
      ...result,
      analysisId,
      persistenceWarning,
      capability: result.mode === "gpt-5.6-sol" ? "gpt-5.6-sol" : "validated_demonstration",
    });
  } catch (error) {
    if (error instanceof ContinuityInputError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return Response.json({ error: errorMessage(error) }, { status: 502 });
  }
}
