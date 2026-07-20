export const CONTINUITY_ANSWER_VERSION = "continuity.answer.v1" as const;

export type CanonAuthority =
  | "immutable"
  | "canon"
  | "retcon"
  | "production"
  | "proposal"
  | "reference";

export type Verdict =
  | "SUPPORTED"
  | "CONFLICT"
  | "AMBIGUOUS"
  | "UNREACHABLE"
  | "INSUFFICIENT_EVIDENCE"
  | "PROPOSAL";

export type EvidenceChunk = {
  id: string;
  projectId: string;
  sourceId: string;
  sourceVersionId: string;
  title: string;
  locator: string;
  text: string;
  score: number;
  authority: CanonAuthority;
  validFrom?: string | null;
  validTo?: string | null;
  validFromOrder?: number | null;
  validToOrder?: number | null;
  supersedesSourceId?: string | null;
  closedWorld?: boolean;
  claimKey?: string | null;
  polarity?: "positive" | "negative" | null;
  flags?: string[];
};

export type ConversationTurn = {
  question: string;
  answer: string;
  verdict: Verdict;
};

export type QueryRequest = {
  projectId: string;
  projectRevision?: string;
  timeScope?: string | null;
  storyPosition?: number;
  question: string;
  conversation?: ConversationTurn[];
  proposedChange?: string | null;
  contextRefs?: string[];
  coverage?: {
    scope: string;
    complete: boolean;
    excludedSources?: string[];
  };
};

export type EvidenceReference = {
  evidenceId: string;
  sourceId: string;
  locator: string;
  stance: "supports" | "opposes" | "context";
  supports: string;
};

export type EntityReference = {
  id: string;
  name: string;
  type: string;
  aliases: string[];
};

export type Conflict = {
  type: string;
  statement: string;
  severity: "low" | "medium" | "high";
  evidenceIds: string[];
};

export type DependencyEdge = {
  from: string;
  to: string;
  relation: "requires" | "causes" | "prevents" | "supersedes" | "reveals";
  status: "established" | "missing" | "proposed" | "blocked";
  evidenceIds: string[];
};

export type ChangeProposal = {
  summary: string;
  assumptions: string[];
  requiredChanges: string[];
  downstreamRisks: string[];
};

export type ContinuityAnswer = {
  version: typeof CONTINUITY_ANSWER_VERSION;
  projectRevision: string;
  timeScope: string | null;
  question: string;
  verdict: Verdict;
  truthStatus: "supported" | "contradicted" | "ambiguous" | "conflicted" | "unknown" | "superseded";
  reachability: {
    status: "reachable" | "conditionally_reachable" | "unreachable_within_scope" | "unknown" | "not_evaluated";
    completenessScope: string;
    blockers: string[];
    assumptions: string[];
    path: string[];
  };
  answer: string;
  confidence: "low" | "medium" | "high";
  evidence: EvidenceReference[];
  entities: EntityReference[];
  conflicts: Conflict[];
  dependencies: DependencyEdge[];
  proposal: ChangeProposal | null;
  followUpQuestions: string[];
  caveats: string[];
};

export type QueryResult = {
  mode: "gpt-5.6-sol" | "demonstration";
  model: string | null;
  answer: ContinuityAnswer;
  retrievedEvidence: EvidenceChunk[];
  validation: {
    repaired: boolean;
    issues: string[];
  };
};

export interface EvidenceRetriever {
  retrieve(request: QueryRequest): Promise<EvidenceChunk[]>;
}

export interface ContinuityReasoner {
  readonly mode: QueryResult["mode"];
  readonly model: string | null;
  answer(request: QueryRequest, evidence: EvidenceChunk[]): Promise<ContinuityAnswer>;
}

export const CONTINUITY_ANSWER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "version", "projectRevision", "timeScope", "question", "verdict", "truthStatus", "reachability", "answer", "confidence", "evidence",
    "entities", "conflicts", "dependencies", "proposal", "followUpQuestions", "caveats",
  ],
  properties: {
    version: { type: "string", enum: [CONTINUITY_ANSWER_VERSION] },
    projectRevision: { type: "string" },
    timeScope: { anyOf: [{ type: "string" }, { type: "null" }] },
    question: { type: "string" },
    verdict: { type: "string", enum: ["SUPPORTED", "CONFLICT", "AMBIGUOUS", "UNREACHABLE", "INSUFFICIENT_EVIDENCE", "PROPOSAL"] },
    truthStatus: { type: "string", enum: ["supported", "contradicted", "ambiguous", "conflicted", "unknown", "superseded"] },
    reachability: {
      type: "object", additionalProperties: false,
      required: ["status", "completenessScope", "blockers", "assumptions", "path"],
      properties: {
        status: { type: "string", enum: ["reachable", "conditionally_reachable", "unreachable_within_scope", "unknown", "not_evaluated"] },
        completenessScope: { type: "string" },
        blockers: { type: "array", items: { type: "string" } },
        assumptions: { type: "array", items: { type: "string" } },
        path: { type: "array", items: { type: "string" } },
      },
    },
    answer: { type: "string" },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    evidence: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["evidenceId", "sourceId", "locator", "stance", "supports"],
        properties: {
          evidenceId: { type: "string" }, sourceId: { type: "string" },
          locator: { type: "string" }, stance: { type: "string", enum: ["supports", "opposes", "context"] }, supports: { type: "string" },
        },
      },
    },
    entities: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["id", "name", "type", "aliases"],
        properties: { id: { type: "string" }, name: { type: "string" }, type: { type: "string" }, aliases: { type: "array", items: { type: "string" } } },
      },
    },
    conflicts: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["type", "statement", "severity", "evidenceIds"],
        properties: {
          type: { type: "string" }, statement: { type: "string" },
          severity: { type: "string", enum: ["low", "medium", "high"] },
          evidenceIds: { type: "array", items: { type: "string" } },
        },
      },
    },
    dependencies: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["from", "to", "relation", "status", "evidenceIds"],
        properties: {
          from: { type: "string" }, to: { type: "string" },
          relation: { type: "string", enum: ["requires", "causes", "prevents", "supersedes", "reveals"] },
          status: { type: "string", enum: ["established", "missing", "proposed", "blocked"] },
          evidenceIds: { type: "array", items: { type: "string" } },
        },
      },
    },
    proposal: {
      anyOf: [
        { type: "null" },
        {
          type: "object", additionalProperties: false,
          required: ["summary", "assumptions", "requiredChanges", "downstreamRisks"],
          properties: {
            summary: { type: "string" }, assumptions: { type: "array", items: { type: "string" } },
            requiredChanges: { type: "array", items: { type: "string" } },
            downstreamRisks: { type: "array", items: { type: "string" } },
          },
        },
      ],
    },
    followUpQuestions: { type: "array", items: { type: "string" } },
    caveats: { type: "array", items: { type: "string" } },
  },
} as const;
