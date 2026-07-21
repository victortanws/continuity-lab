import {
  CONTINUITY_ANSWER_VERSION,
  type AnalysisCheck,
  type AnalysisRoute,
  type ClaimKind,
  type ContinuityAnswer,
  type ContinuityReasoner,
  type EvidenceChunk,
  type EvidenceReference,
  type EvidenceRetriever,
  type QueryRequest,
  type ReachabilityEvaluator,
  type TrustedCompletenessRegistry,
  type TrustedReachability,
} from "./contracts";
import { revisionMembershipDigest } from "./completeness-boundary";
import { VCS_DEMO_FOLLOW_UPS } from "./demo-questions";
import { inferContinuityQuestionIntent, normalizedQuestionText } from "./question-intent";
import { evaluateTransitionGraph, type TransitionGraph } from "./reachability";

export const VCS_DEMO_PROJECT_ID = "vcs-demo";
export const VCS_DEMO_REVISION = "vcs-demo-r2";
const VCS_DEMO_SOURCE_VERSION_IDS = [
  "SRC-VCS-CAST-v1",
  "SRC-VCS-CONTRACT-v5",
  "SRC-VCS-DIALOGUE-v2",
  "SRC-VCS-ECONOMY-v6",
  "SRC-VCS-ENDING-v3",
  "SRC-VCS-FUTURE-STORY-v1",
  "SRC-VCS-ASSETS-v2",
  "SRC-VCS-STORY-v3",
  "SRC-VCS-TESTS-v4",
  "SRC-VCS-TRIGGERS-v8",
  "SRC-VCS-UI-BINDINGS-v3",
  "SRC-VCS-UI-CONTRACT-v1",
].sort();
const VCS_TRIGGER_COMPLETENESS_BOUNDARY = {
  version: "continuity.completeness-boundary.v1" as const,
  boundaryId: "BOUNDARY-VCS-TRIGGER-PRODUCERS-R2",
  scope: {
    kind: "exact_claim_keys" as const,
    claimKeys: ["producer:grandma-surgery-funded"],
  },
  revision: {
    projectRevision: VCS_DEMO_REVISION,
    sourceVersionIds: VCS_DEMO_SOURCE_VERSION_IDS,
    membershipDigest: revisionMembershipDigest(VCS_DEMO_REVISION, VCS_DEMO_SOURCE_VERSION_IDS),
  },
};
const VCS_PERSONAL_FUNDS_COMPLETENESS_BOUNDARY = {
  version: "continuity.completeness-boundary.v1" as const,
  boundaryId: "BOUNDARY-VCS-PERSONAL-FUNDS-R2",
  scope: {
    kind: "exact_claim_keys" as const,
    claimKeys: ["producer:founder-personal-funds-47000"],
  },
  revision: {
    projectRevision: VCS_DEMO_REVISION,
    sourceVersionIds: VCS_DEMO_SOURCE_VERSION_IDS,
    membershipDigest: revisionMembershipDigest(VCS_DEMO_REVISION, VCS_DEMO_SOURCE_VERSION_IDS),
  },
};

export const VCS_DEMO_COMPLETENESS_REGISTRY: TrustedCompletenessRegistry = {
  version: "continuity.trusted-completeness-registry.v1",
  projectId: VCS_DEMO_PROJECT_ID,
  projectRevision: VCS_DEMO_REVISION,
  grants: [{
    boundary: VCS_TRIGGER_COMPLETENESS_BOUNDARY,
    evidenceBinding: {
      evidenceId: "EV-VCS-TRIGGER-REGISTRY",
      sourceId: "SRC-VCS-TRIGGERS",
      sourceVersionId: "SRC-VCS-TRIGGERS-v8",
      claimKey: "producer:grandma-surgery-funded",
      polarity: "negative",
    },
  }, {
    boundary: VCS_PERSONAL_FUNDS_COMPLETENESS_BOUNDARY,
    evidenceBinding: {
      evidenceId: "EV-VCS-ECONOMY",
      sourceId: "SRC-VCS-ECONOMY",
      sourceVersionId: "SRC-VCS-ECONOMY-v6",
      claimKey: "producer:founder-personal-funds-47000",
      polarity: "negative",
    },
  }],
};

/**
 * A small, explicit evidence packet for the public VCS demonstration. These are
 * source fragments, not hidden answer keys: DemoReasoner must still cite a
 * fragment that survived retrieval and validation for every factual answer.
 */
export const VCS_DEMO_EVIDENCE: EvidenceChunk[] = [
  {
    id: "EV-VCS-CAST-27",
    projectId: VCS_DEMO_PROJECT_ID,
    sourceId: "SRC-VCS-CAST",
    sourceVersionId: "SRC-VCS-CAST-v1",
    title: "Cast record",
    locator: "CAST-27",
    text: "CAST-27 is the Founder protagonist's grandmother. In the main story she is called Grandma, and her deteriorating eyesight is the medical stake attached to the $47,000 operation. CAST-27 is not USER_0047's grandmother.",
    score: 0.94,
    authority: "canon",
    role: "reference",
    lifecycle: "active",
    claimKinds: ["identity", "historical"],
    claimKind: "identity",
    claimKey: "relationship:CAST-27:FOUNDER",
    polarity: "positive",
    referentKeys: ["referent:grandma", "referent:she"],
    entityCandidates: [
      { id: "CAST-27", name: "Grandma", type: "person", aliases: ["CAST-27"], mention: "Grandma", referentKey: "referent:grandma", resolution: "resolved" },
      { id: "FOUNDER", name: "Founder", type: "person", aliases: ["Founder protagonist"], mention: "Founder", referentKey: "referent:founder", resolution: "resolved" },
    ],
  },
  {
    id: "EV-VCS-DAY-8",
    projectId: VCS_DEMO_PROJECT_ID,
    sourceId: "SRC-VCS-STORY",
    sourceVersionId: "SRC-VCS-STORY-v3",
    title: "Day 8 success dialogue",
    locator: "Day 8 / USER_0047 customer message",
    text: "USER_0047 is an adult customer, not the Founder protagonist. In the Day 8 success dialogue, USER_0047 refers to their own unnamed grandmother. The dialogue does not identify that grandmother as CAST-27.",
    score: 0.96,
    authority: "production",
    role: "reference",
    lifecycle: "active",
    claimKinds: ["identity", "historical"],
    claimKind: "identity",
    validFrom: "day-8",
    temporalAxis: "day",
    claimKey: "relationship:USER_0047:unnamed-grandmother",
    polarity: "positive",
    entityCandidates: [
      { id: "USER_0047", name: "USER_0047", type: "person", aliases: ["adult customer"], mention: "USER_0047", referentKey: "referent:user-0047", resolution: "resolved" },
    ],
  },
  {
    id: "EV-VCS-SECOND-GRANDMA",
    projectId: VCS_DEMO_PROJECT_ID,
    sourceId: "SRC-VCS-DIALOGUE",
    sourceVersionId: "SRC-VCS-DIALOGUE-v2",
    title: "Dialogue entity index",
    locator: "Day 8 success dialogue / USER_0047 grandmother mention",
    text: "MENTION-USER0047-GRANDMA is the unnamed grandmother referenced by adult customer USER_0047 in the shipped Day 8 success dialogue. She is a separate entity from CAST-27, the Founder protagonist's grandmother.",
    score: 0.71,
    authority: "production",
    role: "reference",
    lifecycle: "active",
    claimKinds: ["identity", "historical"],
    claimKind: "identity",
    claimKey: "identity:MENTION-USER0047-GRANDMA",
    polarity: "positive",
    referentKeys: ["referent:grandma", "referent:she"],
    entityCandidates: [
      { id: "MENTION-USER0047-GRANDMA", name: "unnamed grandmother", type: "person", aliases: ["MENTION-USER0047-GRANDMA"], mention: "unnamed grandmother", referentKey: "referent:grandma", resolution: "resolved" },
      { id: "USER_0047", name: "USER_0047", type: "person", aliases: ["adult customer"], mention: "USER_0047", referentKey: "referent:user-0047", resolution: "resolved" },
      { id: "CAST-27", name: "CAST-27", type: "person", aliases: ["Founder protagonist's grandmother"], mention: "CAST-27", referentKey: "referent:cast-27", resolution: "resolved" },
    ],
  },
  {
    id: "EV-VCS-NARRATIVE-CONTRACT",
    projectId: VCS_DEMO_PROJECT_ID,
    sourceId: "SRC-VCS-CONTRACT",
    sourceVersionId: "SRC-VCS-CONTRACT-v5",
    title: "Narrative contract",
    locator: "Story canon / Grandma operation obligation",
    text: "The full story must eventually allow the Founder protagonist to earn and personally pay $47,000 for CAST-27's operation. The current playable prototype covers Days 7 and 8 only, so the operation is a later-story payoff and is not expected to be reachable inside that two-day slice. USER_0047 is a customer and is not the actor responsible for this goal.",
    score: 0.99,
    authority: "canon",
    role: "intent",
    lifecycle: "active",
    claimKinds: ["normative", "identity", "causal"],
    claimKey: "required-payoff:grandma-operation",
    polarity: "positive",
  },
  {
    id: "EV-VCS-ECONOMY",
    projectId: VCS_DEMO_PROJECT_ID,
    sourceId: "SRC-VCS-ECONOMY",
    sourceVersionId: "SRC-VCS-ECONOMY-v6",
    title: "Current prototype contract",
    locator: "Days 7–8 / opening economy",
    text: "The current playable prototype starts the Founder with $700 and ends after Day 8. The jobs, revenue, and costs available in that slice cannot raise the Founder's personal cash to $47,000. Company financing is a different account from the Founder's personal money and cannot be spent directly on Grandma's hospital bill.",
    score: 0.91,
    authority: "production",
    role: "configuration",
    lifecycle: "active",
    claimKinds: ["configured", "causal"],
    completenessBoundary: VCS_PERSONAL_FUNDS_COMPLETENESS_BOUNDARY,
    closedWorld: true,
    claimKey: "producer:founder-personal-funds-47000",
    polarity: "negative",
  },
  {
    id: "EV-VCS-TRIGGER-REGISTRY",
    projectId: VCS_DEMO_PROJECT_ID,
    sourceId: "SRC-VCS-TRIGGERS",
    sourceVersionId: "SRC-VCS-TRIGGERS-v8",
    title: "Story trigger registry",
    locator: "Complete current registry / operation payoff",
    text: "The complete current trigger registry contains no producer for grandma-surgery-funded. It can advance Days 7 and 8 and generate their configured events, but it contains no later progression that earns $47,000 in personal funds, no one-time hospital payment action, and no registered transition that persists the operation-funded result.",
    score: 0.98,
    authority: "production",
    role: "configuration",
    lifecycle: "active",
    claimKinds: ["configured", "causal"],
    completenessBoundary: VCS_TRIGGER_COMPLETENESS_BOUNDARY,
    closedWorld: true,
    claimKey: "producer:grandma-surgery-funded",
    polarity: "negative",
  },
  {
    id: "EV-VCS-ENDING-CONTRACT",
    projectId: VCS_DEMO_PROJECT_ID,
    sourceId: "SRC-VCS-ENDING",
    sourceVersionId: "SRC-VCS-ENDING-v3",
    title: "Ending contract",
    locator: "Grandma payoff gate",
    text: "The planned post-operation reading scene requires one persisted grandma-surgery-funded result. The hospital payment must be charged once, later loads must preserve that result without charging again, and pre-operation dialogue must retire after funding succeeds.",
    score: 0.92,
    authority: "canon",
    role: "intent",
    lifecycle: "active",
    claimKinds: ["normative", "causal"],
    claimKey: "consumer:grandma-surgery-funded",
    polarity: "positive",
  },
  {
    id: "EV-VCS-TRIGGER-TEST",
    projectId: VCS_DEMO_PROJECT_ID,
    sourceId: "SRC-VCS-TESTS",
    sourceVersionId: "SRC-VCS-TESTS-v4",
    title: "Operation acceptance-test contract",
    locator: "Future operation sequence / required regression cases",
    text: "The operation sequence needs tests for insufficient personal funds, successful payment at $47,000 or more, a $47,000 personal-balance deduction, one persisted grandma-surgery-funded result, recovery-scene unlock, pre-operation-dialogue retirement, and replay or reload without a second charge. The current prototype has no end-to-end test for that unimplemented later-story sequence.",
    score: 0.86,
    authority: "production",
    role: "test",
    lifecycle: "active",
    claimKinds: ["tested", "causal"],
    claimKey: "tested-operation-threshold",
    polarity: "positive",
  },
  {
    id: "EV-VCS-SEED-ROUND",
    projectId: VCS_DEMO_PROJECT_ID,
    sourceId: "SRC-VCS-FUTURE-STORY",
    sourceVersionId: "SRC-VCS-FUTURE-STORY-v1",
    title: "Future-story financing plan",
    locator: "Marc's Seed Round / The Payment",
    text: "Marc's planned Seed Round gives the company investment capital; it does not give the Founder personal cash for Grandma's operation. Before the Founder can pay the hospital, a later approved event must create legitimate personal liquidity, such as salary, a disclosed secondary share sale, or a dividend. The Seed Round itself also needs its own story prerequisites before its offer appears.",
    score: 0.95,
    authority: "canon",
    role: "intent",
    lifecycle: "active",
    claimKinds: ["normative", "causal"],
    claimKey: "constraint:seed-round-company-vs-personal-funds",
    polarity: "positive",
  },
  {
    id: "EV-VCS-ASSET-27",
    projectId: VCS_DEMO_PROJECT_ID,
    sourceId: "SRC-VCS-ASSETS",
    sourceVersionId: "SRC-VCS-ASSETS-v2",
    title: "Grandma asset record",
    locator: "ART-27 / identity states",
    text: "ART-27 depicts CAST-27 in pre-operation and proposed post-operation states. The record links the asset to CAST-27; visual resemblance alone is not treated as proof of identity.",
    score: 0.74,
    authority: "production",
    role: "asset",
    lifecycle: "active",
    claimKinds: ["implemented", "identity"],
    claimKey: "asset-identity:ART-27:CAST-27",
    polarity: "positive",
  },
  {
    id: "EV-VCS-CUSTOMER-MESSAGE-BINDING",
    projectId: VCS_DEMO_PROJECT_ID,
    sourceId: "SRC-VCS-UI-BINDINGS",
    sourceVersionId: "SRC-VCS-UI-BINDINGS-v3",
    title: "Customer-message visual binding",
    locator: "customer-message / adjacent portrait",
    text: "The shipped Day 8 USER_0047 customer-message presentation binds its adjacent portrait slot to ART-27, which is CAST-27. The message text refers to USER_0047's separate unnamed grandmother, so the visual and textual referents do not match. The canonical USER_0047 portrait is the proposed replacement for this framing slot.",
    score: 0.88,
    authority: "production",
    role: "implementation",
    lifecycle: "active",
    claimKinds: ["implemented", "causal", "identity"],
    claimKey: "ui-binding:customer-message-referent",
    polarity: "negative",
  },
  {
    id: "EV-VCS-PORTRAIT-CONSTRAINT",
    projectId: VCS_DEMO_PROJECT_ID,
    sourceId: "SRC-VCS-UI-CONTRACT",
    sourceVersionId: "SRC-VCS-UI-CONTRACT-v1",
    title: "Customer-message portrait contract",
    locator: "Portrait identity invariant",
    text: "A customer-message portrait must identify the speaker or player viewpoint selected by the presentation contract. It must not depict an unrelated person mentioned in the message body in a way that merges their identity with the speaker or subject.",
    score: 0.93,
    authority: "canon",
    role: "intent",
    lifecycle: "active",
    claimKinds: ["normative", "identity"],
    claimKey: "constraint:customer-message-portrait-role",
    polarity: "positive",
  },
];

export class DemoRetriever implements EvidenceRetriever {
  async retrieve(request: QueryRequest): Promise<EvidenceChunk[]> {
    if (request.projectId !== VCS_DEMO_PROJECT_ID) return [];

    const queryTokens = tokenize(`${request.question} ${request.proposedChange ?? ""}`);
    return VCS_DEMO_EVIDENCE.map((chunk) => {
      const documentTokens = tokenize(`${chunk.title} ${chunk.locator} ${chunk.text}`);
      const overlap = [...queryTokens].filter((token) => documentTokens.has(token)).length;
      const relevance = queryTokens.size ? overlap / queryTokens.size : 0;
      return { ...chunk, score: Math.min(1, chunk.score * 0.72 + relevance * 0.28) };
    }).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  }
}

/**
 * The reviewed sample has one explicitly compiled causal target. This helper
 * selects that target for the sample only; generalized workspaces must resolve
 * target keys from their own server-owned transition graph.
 */
export function demoTargetClaimKeys(question: string, proposedChange?: string | null): string[] {
  return classifyQuestion(`${question} ${proposedChange ?? ""}`) === "reachability"
    ? ["producer:founder-personal-funds-47000", "producer:grandma-surgery-funded"]
    : [];
}

export class DemoReachabilityEvaluator implements ReachabilityEvaluator {
  async evaluate(
    request: QueryRequest,
    _evidence: EvidenceChunk[],
    route: AnalysisRoute,
  ): Promise<TrustedReachability | null> {
    if (request.projectId !== VCS_DEMO_PROJECT_ID
      || !request.targetClaimKeys?.includes("producer:grandma-surgery-funded")) return null;
    const targetClaimKeys = [
      ...(request.targetClaimKeys.includes("producer:founder-personal-funds-47000")
        ? ["producer:founder-personal-funds-47000"]
        : []),
      "producer:grandma-surgery-funded",
    ];

    const graph: TransitionGraph = {
      version: "continuity.transition-graph.v1",
      projectId: VCS_DEMO_PROJECT_ID,
      projectRevision: request.projectRevision ?? VCS_DEMO_REVISION,
      plane: "configured",
      temporalAxis: request.temporalAxis ?? "day",
      initialState: {
        position: { axis: request.temporalAxis ?? "day", order: request.storyPosition ?? 8 },
        trueAtoms: [],
        falseAtoms: ["grandma-surgery-funded"],
        balances: [{ accountKey: "FOUNDER", resourceKey: "cash", unit: "usd-cent", amountMinor: "70000" }],
        permissions: [],
        knowledge: [],
        eventHistory: [],
        applications: [],
      },
      // The absence is intentional: the complete configured registry contains
      // no payment transition. The graph evaluator treats a covered target with
      // no producer as a concrete causal blocker rather than a language-model guess.
      rules: [],
      coverage: {
        completeTargetKeys: ["fact:grandma-surgery-funded=true"],
        completeInitialDimensions: ["facts", "resources"],
        evidenceIds: ["EV-VCS-ECONOMY", "EV-VCS-TRIGGER-REGISTRY"],
        excludedSources: [],
        parseFailures: [],
      },
    };
    const proof = evaluateTransitionGraph(
      graph,
      { kind: "fact", atomKey: "grandma-surgery-funded", value: true },
      request.targetPosition ?? 8,
    );
    return {
      source: "server_transition_graph",
      status: proof.status,
      graphRevision: proof.graphRevision,
      plane: proof.plane,
      completenessScope: route.coverage.scope,
      targetClaimKeys,
      blockers: [
        "The Days 7–8 prototype starts with $700 and contains no available income path to $47,000 in personal funds.",
        ...proof.blockers.map((blocker) => blocker.explanation),
      ],
      assumptions: proof.assumptions,
      path: proof.rulePath.map((step) => `${step.ruleId} @ ${graph.temporalAxis} ${step.at}`),
      evidenceIds: [...new Set([
        "EV-VCS-ECONOMY",
        "EV-VCS-TRIGGER-REGISTRY",
        ...proof.rulePath.flatMap((step) => step.evidenceIds),
        ...proof.blockers.flatMap((blocker) => blocker.evidenceIds),
      ])],
      obligations: [
        ...(targetClaimKeys.includes("producer:founder-personal-funds-47000") ? [{
          id: "OBL-VCS-PERSONAL-FUNDS",
          kind: "resource" as const,
          from: "current Days 7–8 economy",
          to: "$47,000 in Founder personal funds",
          claimKey: "producer:founder-personal-funds-47000",
          claimKind: "configured" as const,
          relation: "causes" as const,
          required: true as const,
          status: "blocked" as const,
          evidenceIds: ["EV-VCS-ECONOMY"],
        }] : []),
        {
          id: "OBL-VCS-PAYMENT-PRODUCER",
          kind: "producer",
          from: "sufficient personal funds",
          to: "operation payment resolver",
          claimKey: "producer:grandma-surgery-funded",
          claimKind: "configured",
          relation: "causes",
          required: true,
          status: "blocked",
          evidenceIds: ["EV-VCS-TRIGGER-REGISTRY"],
        },
      ],
      diagnostics: proof.diagnostics,
      search: proof.search,
      certificate: {
        kind: "exhaustive_graph",
        summary: "The server checked the complete Days 7–8 economy and the complete configured producer registry for this prototype.",
        evidenceIds: ["EV-VCS-ECONOMY", "EV-VCS-TRIGGER-REGISTRY"],
      },
    };
  }
}

export class DemoReasoner implements ContinuityReasoner {
  readonly mode = "demonstration" as const;
  readonly model = null;

  async answer(request: QueryRequest, evidence: EvidenceChunk[], route?: AnalysisRoute): Promise<ContinuityAnswer> {
    const kind = classifyQuestion(`${request.question} ${request.proposedChange ?? ""}`);
    const byId = new Map(evidence.map((chunk) => [chunk.id, chunk]));
    const answer = kind === "visual-binding" ? visualBindingAnswer(request, byId)
      : kind === "identity" ? identityAnswer(request, byId)
      : kind === "relation" ? relationshipAnswer(request, byId)
      : kind === "repair" ? repairAnswer(request, byId)
      : kind === "verification" ? verificationAnswer(request, byId)
      : kind === "investment" ? investmentAnswer(request, byId)
      : kind === "source" ? sourceAnswer(request, byId)
      : kind === "reachability" ? reachabilityAnswer(request, byId)
      : kind === "blast-radius" ? blastRadiusAnswer(request, byId)
      : insufficientAnswer(request);
    return { ...answer, analysisChecks: demoAnalysisChecks(answer, route) };
  }
}

type DemoQuestionKind =
  | "identity"
  | "relation"
  | "visual-binding"
  | "reachability"
  | "blast-radius"
  | "repair"
  | "verification"
  | "investment"
  | "source"
  | "general";

function classifyQuestion(value: string): DemoQuestionKind {
  const question = normalizedQuestionText(value);
  if (/\b(?:seed round|marc|company (?:cash|money|capital)|personal liquidity|investment offer|investment route)\b/.test(question)) {
    return "investment";
  }
  if (/\b(?:tell me about grandma|how many grandmothers|multiple grandmothers|multiple grandmas|which grandma|same grandma|same grandmother)\b/.test(question)) {
    return "identity";
  }
  const intent = inferContinuityQuestionIntent(value);
  if (intent === "verification_plan") return "verification";
  if (intent === "repair_plan") return "repair";
  if (intent === "change_analysis") return "blast-radius";
  if (intent === "visual_binding") return "visual-binding";
  if (intent === "identity") return "identity";
  if (intent === "relationship") return "relation";
  if (intent === "source_authority") return "source";
  if (intent === "reachability") return "reachability";
  return "general";
}

function visualBindingAnswer(request: QueryRequest, byId: Map<string, EvidenceChunk>): ContinuityAnswer {
  return baseAnswer(request, {
    verdict: "CONFLICT",
    truthStatus: "conflicted",
    answer: "No—the CAST-27 portrait is not a valid identity image for that message. The worked Day 8 snapshot sends two different identity signals: its adjacent portrait is ART-27, the asset for CAST-27 (the Founder protagonist's grandmother), while the text refers to USER_0047's different, unnamed grandmother. The picture therefore shows CAST-27, but it does not identify the grandmother discussed by the customer. Rebinding the slot to USER_0047—the actual speaker—removes the false association without merging the two grandmothers.",
    confidence: "high",
    evidence: compactReferences([
      reference(byId, "EV-VCS-PORTRAIT-CONSTRAINT", "supports", "Establishes the identity rule for a customer-message portrait.", "normative"),
      reference(byId, "EV-VCS-CUSTOMER-MESSAGE-BINDING", "supports", "Records the mismatched UI binding and the proposed Founder replacement.", "identity"),
      reference(byId, "EV-VCS-ASSET-27", "supports", "Identifies ART-27 as CAST-27's visual record.", "identity"),
      reference(byId, "EV-VCS-SECOND-GRANDMA", "opposes", "Identifies the grandmother in the message text as USER_0047's separate unnamed grandmother.", "identity"),
      reference(byId, "EV-VCS-CAST-27", "supports", "Establishes that CAST-27 belongs to the Founder protagonist's family, not USER_0047's."),
    ]),
    entities: [
      { id: "CAST-27", name: "Grandma", type: "character", aliases: ["the Founder's grandmother", "ART-27"], resolution: "resolved", evidenceIds: ["EV-VCS-CAST-27", "EV-VCS-ASSET-27"] },
      { id: "MENTION-USER0047-GRANDMA", name: "USER_0047's grandmother", type: "mentioned character", aliases: ["their grandma"], resolution: "resolved", evidenceIds: ["EV-VCS-SECOND-GRANDMA"] },
      { id: "FOUNDER", name: "The Founder", type: "protagonist", aliases: ["protagonist"], resolution: "resolved", evidenceIds: ["EV-VCS-CAST-27"] },
      { id: "USER_0047", name: "USER_0047", type: "adult customer", aliases: ["Day 8 customer"], resolution: "resolved", evidenceIds: ["EV-VCS-DAY-8"] },
    ],
    conflicts: [{
      type: "visual_text_identity_mismatch",
      basis: "constraint_violation",
      frameKey: "constraint:customer-message-portrait-role",
      claimKind: "normative",
      premiseClaimKeys: ["ui-binding:customer-message-referent", "asset-identity:ART-27:CAST-27"],
      candidateEntityIds: [],
      statement: "The bound portrait resolves to the Founder protagonist's grandmother, CAST-27, while the adjacent customer message resolves to USER_0047's different grandmother.",
      severity: "high",
      evidenceIds: ["EV-VCS-PORTRAIT-CONSTRAINT", "EV-VCS-CUSTOMER-MESSAGE-BINDING", "EV-VCS-ASSET-27", "EV-VCS-SECOND-GRANDMA"],
    }],
    dependencies: [{
      from: "customer-message portrait binding",
      to: "viewer interpretation of the message referent",
      claimKey: "ui-binding:customer-message-referent",
      claimKind: "implemented",
      relation: "causes",
      status: "blocked",
      evidenceIds: ["EV-VCS-CUSTOMER-MESSAGE-BINDING"],
    }],
    proposal: {
      summary: "Use the canonical USER_0047 portrait for the customer-message framing slot while keeping ART-27 reserved for scenes explicitly about CAST-27.",
      assumptions: ["The framing portrait identifies the speaker, not a newly asserted identity for the customer's grandmother."],
      requiredChanges: ["Replace the customer-message portrait binding.", "Retain stable IDs for CAST-27 and the unnamed customer grandmother.", "Add a UI assertion that message text and portrait roles cannot silently merge entities."],
      downstreamRisks: ["Other customer messages may reuse the same incorrect binding.", "A purely visual regression test may miss semantic identity drift."],
    },
    followUpQuestions: [...VCS_DEMO_FOLLOW_UPS.visualBinding],
    caveats: ["The USER_0047 replacement is a presentation fix; it does not change either grandmother's canonical identity."],
  });
}

function identityAnswer(request: QueryRequest, byId: Map<string, EvidenceChunk>): ContinuityAnswer {
  return baseAnswer(request, {
    verdict: "AMBIGUOUS",
    truthStatus: "ambiguous",
    answer: "“Grandma” is not a unique identifier in this project. There are two grandmother referents: CAST-27, the Founder protagonist's grandmother and the person attached to the $47,000 operation; and MENTION-USER0047-GRANDMA, the unnamed grandmother referenced by adult customer USER_0047 in the Day 8 success dialogue. They must not be merged. In the operation obligation, “Grandma” means CAST-27; in USER_0047's customer message, it means the other grandmother.",
    confidence: "high",
    evidence: compactReferences([
      reference(byId, "EV-VCS-CAST-27", "supports", "Identifies CAST-27 as the Founder protagonist's grandmother."),
      reference(byId, "EV-VCS-SECOND-GRANDMA", "supports", "Establishes USER_0047's grandmother as a second, distinct referent."),
      reference(byId, "EV-VCS-DAY-8", "context", "Places the second grandmother in USER_0047's Day 8 success dialogue."),
    ]),
    entities: [
      { id: "CAST-27", name: "Grandma", type: "character", aliases: ["the Founder's grandmother", "the operation patient"], resolution: "resolved", evidenceIds: ["EV-VCS-CAST-27"] },
      { id: "MENTION-USER0047-GRANDMA", name: "USER_0047's grandmother", type: "mentioned character", aliases: ["their grandma"], resolution: "resolved", evidenceIds: ["EV-VCS-SECOND-GRANDMA"] },
      { id: "FOUNDER", name: "The Founder", type: "protagonist", aliases: ["protagonist"], resolution: "resolved", evidenceIds: ["EV-VCS-CAST-27"] },
      { id: "USER_0047", name: "USER_0047", type: "adult customer", aliases: ["Day 8 customer"], resolution: "resolved", evidenceIds: ["EV-VCS-DAY-8"] },
    ],
    conflicts: [{
      type: "referent_ambiguity",
      basis: "referent_ambiguity",
      frameKey: "referent:grandma",
      claimKind: "identity",
      premiseClaimKeys: ["relationship:CAST-27:FOUNDER", "identity:MENTION-USER0047-GRANDMA"],
      candidateEntityIds: ["CAST-27", "MENTION-USER0047-GRANDMA"],
      statement: "The label “Grandma” can resolve either to the Founder's CAST-27 or to USER_0047's unnamed grandmother without additional context.",
      severity: "medium",
      evidenceIds: ["EV-VCS-CAST-27", "EV-VCS-SECOND-GRANDMA"],
    }],
    followUpQuestions: [...VCS_DEMO_FOLLOW_UPS.identity],
    caveats: ["A screenshot can support asset matching, but visual resemblance alone should not establish identity."],
  });
}

function relationshipAnswer(request: QueryRequest, byId: Map<string, EvidenceChunk>): ContinuityAnswer {
  const asksAboutCustomer = /user_0047/i.test(request.question);
  return baseAnswer(request, {
    verdict: asksAboutCustomer ? "AMBIGUOUS" : "SUPPORTED",
    truthStatus: asksAboutCustomer ? "ambiguous" : "supported",
    answer: asksAboutCustomer
      ? "The pronoun needs an entity ID. If “she” means MENTION-USER0047-GRANDMA from the Day 8 customer message, then yes: she is USER_0047's unnamed grandmother. If “she” means CAST-27, then no: CAST-27 is the Founder protagonist's grandmother. USER_0047 is a distinct adult customer, not the Founder."
      : "CAST-27 is the Founder protagonist's grandmother and the patient attached to the $47,000 operation. The other grandmother in the Day 8 success dialogue is related to customer USER_0047, not to the protagonist on the available evidence.",
    confidence: "high",
    evidence: compactReferences([
      reference(byId, "EV-VCS-CAST-27", "supports", "States CAST-27's relationship to the Founder directly and excludes USER_0047."),
      reference(byId, "EV-VCS-DAY-8", "supports", "Identifies USER_0047 as an adult customer and ties their separate grandmother to the Day 8 message."),
      reference(byId, "EV-VCS-SECOND-GRANDMA", "supports", "Assigns a separate entity ID to USER_0047's grandmother."),
      reference(byId, "EV-VCS-ASSET-27", "context", "Links the approved visual record to CAST-27 without relying on appearance alone."),
    ]),
    conclusions: [{
      claimKey: "relationship:CAST-27:FOUNDER",
      claimKind: "identity",
      polarity: "positive",
      basis: "explicit_evidence",
      statement: "CAST-27 is the Founder protagonist's grandmother.",
      evidenceIds: ["EV-VCS-CAST-27"],
    }],
    entities: [
      { id: "CAST-27", name: "Grandma", type: "character", aliases: ["the Founder's grandmother"], resolution: "resolved", evidenceIds: ["EV-VCS-CAST-27"] },
      { id: "FOUNDER", name: "The Founder", type: "protagonist", aliases: ["protagonist"], resolution: "resolved", evidenceIds: ["EV-VCS-CAST-27"] },
      { id: "USER_0047", name: "USER_0047", type: "adult customer", aliases: ["Day 8 customer"], resolution: "resolved", evidenceIds: ["EV-VCS-DAY-8"] },
      { id: "MENTION-USER0047-GRANDMA", name: "USER_0047's grandmother", type: "mentioned character", aliases: ["their grandma"], resolution: "resolved", evidenceIds: ["EV-VCS-SECOND-GRANDMA"] },
    ],
    dependencies: [{
      from: "CAST-27",
      to: "FOUNDER",
      claimKey: "relationship:CAST-27:FOUNDER",
      claimKind: "identity",
      relation: "reveals",
      status: "established",
      evidenceIds: ["EV-VCS-CAST-27"],
    }],
    conflicts: asksAboutCustomer ? [{
      type: "pronoun_referent_ambiguity",
      basis: "referent_ambiguity",
      frameKey: "referent:she",
      claimKind: "identity",
      premiseClaimKeys: ["relationship:CAST-27:FOUNDER", "identity:MENTION-USER0047-GRANDMA"],
      candidateEntityIds: ["CAST-27", "MENTION-USER0047-GRANDMA"],
      statement: "“She” can refer to CAST-27 or USER_0047's separate unnamed grandmother; the relationship answer changes with that choice.",
      severity: "high",
      evidenceIds: ["EV-VCS-CAST-27", "EV-VCS-SECOND-GRANDMA"],
    }] : [],
    followUpQuestions: [...VCS_DEMO_FOLLOW_UPS.relationship],
  });
}

function repairAnswer(request: QueryRequest, byId: Map<string, EvidenceChunk>): ContinuityAnswer {
  return baseAnswer(request, {
    verdict: "PROPOSAL",
    truthStatus: "supported",
    answer: "There is no honest one-line fix because the current prototype has two separate gaps. First, the Days 7–8 economy cannot give the Founder $47,000 in personal money. Second, the game has no hospital-payment action or saved operation result. The smallest complete repair is to add a later personal-income path, then one payment action that deducts $47,000 once, saves grandma-surgery-funded, and unlocks Grandma's recovery scene on later loads.",
    confidence: "high",
    evidence: compactReferences([
      reference(byId, "EV-VCS-NARRATIVE-CONTRACT", "supports", "Establishes the later-story $47,000 operation promise.", "normative"),
      reference(byId, "EV-VCS-ECONOMY", "supports", "Establishes that the Days 7–8 prototype cannot produce the required personal funds.", "configured"),
      reference(byId, "EV-VCS-SEED-ROUND", "supports", "Separates company investment capital from the Founder's personal money.", "normative"),
      reference(byId, "EV-VCS-TRIGGER-REGISTRY", "supports", "Establishes that the current build lacks the payment and persistence transitions.", "configured"),
      reference(byId, "EV-VCS-ENDING-CONTRACT", "supports", "Defines the saved result and later recovery scene that the repair must unlock.", "normative"),
    ]),
    entities: [
      { id: "FOUNDER", name: "The Founder", type: "protagonist", aliases: ["player"], resolution: "resolved", evidenceIds: ["EV-VCS-NARRATIVE-CONTRACT", "EV-VCS-ECONOMY"] },
      { id: "CAST-27", name: "Grandma", type: "character", aliases: ["operation patient"], resolution: "resolved", evidenceIds: ["EV-VCS-CAST-27", "EV-VCS-NARRATIVE-CONTRACT"] },
      { id: "STATE-grandma-surgery-funded", name: "grandma-surgery-funded", type: "story state", aliases: ["operation funded"], resolution: "resolved", evidenceIds: ["EV-VCS-TRIGGER-REGISTRY", "EV-VCS-ENDING-CONTRACT"] },
    ],
    dependencies: [
      { from: "later approved personal-income event", to: "$47,000 in Founder personal funds", claimKey: "producer:founder-personal-funds-47000", claimKind: "configured", relation: "causes", status: "missing", evidenceIds: ["EV-VCS-ECONOMY", "EV-VCS-SEED-ROUND"] },
      { from: "$47,000 in Founder personal funds", to: "one-time hospital payment", claimKey: "producer:grandma-surgery-funded", claimKind: "configured", relation: "requires", status: "missing", evidenceIds: ["EV-VCS-TRIGGER-REGISTRY"] },
      { from: "one-time hospital payment", to: "grandma-surgery-funded", claimKey: "producer:grandma-surgery-funded", claimKind: "configured", relation: "causes", status: "missing", evidenceIds: ["EV-VCS-TRIGGER-REGISTRY"] },
      { from: "grandma-surgery-funded", to: "Grandma's recovery scene", claimKey: "consumer:grandma-surgery-funded", claimKind: "normative", relation: "requires", status: "blocked", evidenceIds: ["EV-VCS-ENDING-CONTRACT"] },
    ],
    proposal: {
      summary: "Build one end-to-end path from legitimate Founder income to a saved, one-time operation payment.",
      assumptions: ["The $47,000 operation remains an approved later-story goal.", "Company investment money remains separate from the Founder's personal money."],
      requiredChanges: [
        "Implement the later progression that creates legitimate personal income for the Founder.",
        "Add a hospital-payment action that requires at least $47,000 in personal funds.",
        "Deduct $47,000 once and persist grandma-surgery-funded in the same successful transaction.",
        "Use that saved result to retire pre-operation dialogue and unlock Grandma's recovery scene.",
        "Add success, insufficient-funds, reload, and repeat-action tests.",
      ],
      downstreamRisks: ["Using Seed Round company cash directly would break the financing rule.", "Saving the flag separately from the deduction could charge twice or unlock the scene without payment."],
    },
    followUpQuestions: [...VCS_DEMO_FOLLOW_UPS.repair],
    caveats: ["This is the minimum complete path for the promised outcome, not necessarily the smallest code diff."],
  });
}

function verificationAnswer(request: QueryRequest, byId: Map<string, EvidenceChunk>): ContinuityAnswer {
  return baseAnswer(request, {
    verdict: "SUPPORTED",
    truthStatus: "supported",
    answer: "Test the operation as one saved transaction. The important checks are: it fails without $47,000 in personal funds; succeeds at the threshold; deducts exactly $47,000; saves one operation-funded result; unlocks the recovery scene; retires pre-operation dialogue; and, after a repeat click or reload, does not deduct money or unlock the scene a second time. The current prototype cannot run this end-to-end test yet because that later sequence is not implemented.",
    confidence: "high",
    evidence: compactReferences([
      reference(byId, "EV-VCS-TRIGGER-TEST", "supports", "Lists the required success, failure, persistence, and repeat-action cases.", "tested"),
      reference(byId, "EV-VCS-ENDING-CONTRACT", "supports", "Requires one saved funded result and no second charge after reload.", "normative"),
      reference(byId, "EV-VCS-TRIGGER-REGISTRY", "context", "Shows why the end-to-end test cannot pass in the current prototype.", "configured"),
    ]),
    conclusions: [{
      claimKey: "tested-operation-threshold",
      claimKind: "tested",
      polarity: "positive",
      basis: "explicit_evidence",
      statement: "The acceptance-test contract requires threshold, deduction, persistence, recovery-scene, reload, and repeat-action cases.",
      evidenceIds: ["EV-VCS-TRIGGER-TEST"],
    }],
    entities: [
      { id: "FOUNDER", name: "The Founder", type: "protagonist", aliases: ["player"], resolution: "resolved", evidenceIds: ["EV-VCS-ECONOMY"] },
      { id: "STATE-grandma-surgery-funded", name: "grandma-surgery-funded", type: "story state", aliases: ["operation funded"], resolution: "resolved", evidenceIds: ["EV-VCS-TRIGGER-REGISTRY", "EV-VCS-ENDING-CONTRACT"] },
    ],
    dependencies: [
      { from: "successful hospital payment", to: "$47,000 personal-balance deduction", claimKey: "tested-operation-threshold", claimKind: "tested", relation: "causes", status: "proposed", evidenceIds: ["EV-VCS-TRIGGER-TEST"] },
      { from: "successful hospital payment", to: "one saved grandma-surgery-funded result", claimKey: "consumer:grandma-surgery-funded", claimKind: "normative", relation: "causes", status: "proposed", evidenceIds: ["EV-VCS-ENDING-CONTRACT"] },
      { from: "saved grandma-surgery-funded result", to: "reload without another charge", claimKey: "consumer:grandma-surgery-funded", claimKind: "normative", relation: "prevents", status: "proposed", evidenceIds: ["EV-VCS-ENDING-CONTRACT", "EV-VCS-TRIGGER-TEST"] },
    ],
    proposal: {
      summary: "Add one table-driven operation test suite around the saved payment transaction.",
      assumptions: ["The payment and persistence changes will be implemented as one atomic operation."],
      requiredChanges: ["Add insufficient-funds and exact-threshold cases.", "Assert the balance deduction and saved funded result together.", "Reload and repeat the action, then assert that neither money nor story state changes again.", "Assert the recovery scene replaces pre-operation dialogue."],
      downstreamRisks: ["A UI-only test can miss a duplicate server-side deduction.", "A happy-path-only test can miss reload and repeated-click failures."],
    },
    followUpQuestions: [...VCS_DEMO_FOLLOW_UPS.verification],
  });
}

function investmentAnswer(request: QueryRequest, byId: Map<string, EvidenceChunk>): ContinuityAnswer {
  const asksForUnknownPrerequisites = /\b(?:before|prerequisite|prerequisites)\b/.test(normalizedQuestionText(request.question))
    && /\bseed round\b/.test(normalizedQuestionText(request.question));
  if (asksForUnknownPrerequisites) {
    return baseAnswer(request, {
      verdict: "INSUFFICIENT_EVIDENCE",
      truthStatus: "unknown",
      answer: "The reviewed story plan says Marc's Seed Round has prerequisites, but this packet does not name them. It would be unsafe to invent the required customer, revenue, day, or relationship threshold. Add the Seed Round scene specification or its trigger record to answer that question.",
      confidence: "high",
      evidence: compactReferences([
        reference(byId, "EV-VCS-SEED-ROUND", "context", "Confirms that the Seed Round is planned but does not enumerate its trigger conditions.", "normative"),
      ]),
      followUpQuestions: [],
      caveats: ["This is a documented gap in the available sample, not proof that the Seed Round has no prerequisites."],
    });
  }
  return baseAnswer(request, {
    verdict: "SUPPORTED",
    truthStatus: "supported",
    answer: "No—not directly. Marc's Seed Round gives investment capital to the company, while Grandma's hospital bill must be paid from the Founder's legitimate personal money. A later salary, disclosed secondary share sale, dividend, or another approved personal-liquidity event must move value to the Founder before the payment can happen.",
    confidence: "high",
    evidence: compactReferences([
      reference(byId, "EV-VCS-SEED-ROUND", "supports", "Separates Seed Round company capital from the Founder's personal money.", "normative"),
      reference(byId, "EV-VCS-NARRATIVE-CONTRACT", "supports", "Makes the Founder personally responsible for the $47,000 operation payoff.", "normative"),
      reference(byId, "EV-VCS-ECONOMY", "supports", "Confirms that company financing and personal money are separate accounts.", "configured"),
    ]),
    conclusions: [{
      claimKey: "constraint:seed-round-company-vs-personal-funds",
      claimKind: "normative",
      polarity: "positive",
      basis: "explicit_evidence",
      statement: "Marc's Seed Round creates company capital, not personal money that the Founder can spend directly on Grandma's operation.",
      evidenceIds: ["EV-VCS-SEED-ROUND"],
    }],
    entities: [
      { id: "FOUNDER", name: "The Founder", type: "protagonist", aliases: ["player"], resolution: "resolved", evidenceIds: ["EV-VCS-NARRATIVE-CONTRACT", "EV-VCS-ECONOMY"] },
      { id: "CAST-27", name: "Grandma", type: "character", aliases: ["operation patient"], resolution: "resolved", evidenceIds: ["EV-VCS-CAST-27"] },
      { id: "EVENT-SEED-ROUND", name: "Marc's Seed Round", type: "planned event", aliases: ["Seed Round"], resolution: "resolved", evidenceIds: ["EV-VCS-SEED-ROUND"] },
    ],
    dependencies: [
      { from: "Marc's Seed Round", to: "company investment capital", claimKey: "constraint:seed-round-company-vs-personal-funds", claimKind: "normative", relation: "causes", status: "established", evidenceIds: ["EV-VCS-SEED-ROUND"] },
      { from: "approved personal-liquidity event", to: "$47,000 in Founder personal funds", claimKey: "producer:founder-personal-funds-47000", claimKind: "configured", relation: "causes", status: "missing", evidenceIds: ["EV-VCS-ECONOMY", "EV-VCS-SEED-ROUND"] },
      { from: "$47,000 in Founder personal funds", to: "hospital payment", claimKey: "producer:grandma-surgery-funded", claimKind: "configured", relation: "requires", status: "missing", evidenceIds: ["EV-VCS-TRIGGER-REGISTRY"] },
    ],
    followUpQuestions: [...VCS_DEMO_FOLLOW_UPS.investment],
    caveats: ["The evidence lists acceptable categories of personal liquidity but does not approve one final implementation."],
  });
}

function sourceAnswer(request: QueryRequest, byId: Map<string, EvidenceChunk>): ContinuityAnswer {
  return baseAnswer(request, {
    verdict: "SUPPORTED",
    truthStatus: "supported",
    answer: "The answer comes from several records with different jobs: story canon establishes the promised $47,000 operation; the current prototype contract establishes the Days 7–8 and $700 limits; the trigger registry shows the missing payment transition; the future-story financing plan separates company and personal money; and the ending and test contracts define the saved payoff and checks. No single filename is treated as sufficient by itself.",
    confidence: "high",
    evidence: compactReferences([
      reference(byId, "EV-VCS-NARRATIVE-CONTRACT", "supports", "Defines the promised story outcome.", "normative"),
      reference(byId, "EV-VCS-ECONOMY", "supports", "Defines what the current prototype can earn.", "configured"),
      reference(byId, "EV-VCS-TRIGGER-REGISTRY", "supports", "Defines the implemented transition gap.", "configured"),
      reference(byId, "EV-VCS-SEED-ROUND", "context", "Defines the company-versus-personal financing constraint.", "normative"),
      reference(byId, "EV-VCS-ENDING-CONTRACT", "context", "Defines the later consumer of the saved operation state.", "normative"),
      reference(byId, "EV-VCS-TRIGGER-TEST", "context", "Defines the acceptance checks for the future sequence.", "tested"),
    ]),
    followUpQuestions: [...VCS_DEMO_FOLLOW_UPS.sources],
  });
}

function reachabilityAnswer(request: QueryRequest, byId: Map<string, EvidenceChunk>): ContinuityAnswer {
  return baseAnswer(request, {
    verdict: "UNREACHABLE",
    truthStatus: "contradicted",
    reachability: {
      status: "unreachable_within_scope",
      completenessScope: `The complete Days 7–8 economy and current trigger registry at ${VCS_DEMO_REVISION}, read alongside the story and ending contracts.`,
      targetClaimKeys: ["producer:founder-personal-funds-47000", "producer:grandma-surgery-funded"],
      blockers: ["The current prototype cannot produce $47,000 in Founder personal funds.", "No registered transition pays the hospital and persists grandma-surgery-funded."],
      assumptions: ["The reviewed Days 7–8 economy and trigger registry are complete for the current prototype."],
      path: ["Story canon establishes the later operation promise", "Missing in this prototype: a personal-income path to $47,000", "Missing: a one-time hospital payment and persisted funded result", "Blocked: Grandma's recovery scene"],
    },
    answer: "No. The current playable prototype covers Days 7 and 8, starts the Founder with $700, and its available jobs and revenue cannot reach $47,000 in personal funds. There is also no transition that pays the hospital and saves Grandma's operation as funded. The wider story promises this outcome later, but the current build contains neither the money path nor the payment path.",
    confidence: "high",
    evidence: compactReferences([
      reference(byId, "EV-VCS-CAST-27", "supports", "Establishes CAST-27 as the Founder's grandmother and the operation patient."),
      reference(byId, "EV-VCS-NARRATIVE-CONTRACT", "supports", "Establishes the required $47,000 payoff."),
      reference(byId, "EV-VCS-ECONOMY", "supports", "Establishes the $700 opening balance, two-day scope, and missing personal-funds path.", "configured"),
      reference(byId, "EV-VCS-TRIGGER-REGISTRY", "supports", "The complete registry establishes that no payment or persistence transition currently exists.", "configured"),
      reference(byId, "EV-VCS-SEED-ROUND", "context", "Shows why later company investment does not itself solve the personal-funds gap.", "normative"),
      reference(byId, "EV-VCS-ENDING-CONTRACT", "supports", "Establishes the intended ending's requirement for the completion flag.", "normative"),
    ]),
    conclusions: [
      {
        claimKey: "producer:founder-personal-funds-47000",
        claimKind: "configured",
        polarity: "negative",
        basis: "closed_world_absence",
        statement: "The complete current prototype economy has no path from $700 to $47,000 in Founder personal funds.",
        evidenceIds: ["EV-VCS-ECONOMY"],
      },
      {
        claimKey: "producer:grandma-surgery-funded",
        claimKind: "configured",
        polarity: "negative",
        basis: "closed_world_absence",
        statement: "The complete current trigger registry has no configured producer for grandma-surgery-funded.",
        evidenceIds: ["EV-VCS-TRIGGER-REGISTRY"],
      },
    ],
    entities: [
      { id: "CAST-27", name: "Grandma", type: "character", aliases: ["the Founder's grandmother", "operation patient"], resolution: "resolved", evidenceIds: ["EV-VCS-CAST-27"] },
      { id: "FOUNDER", name: "The Founder", type: "protagonist", aliases: ["protagonist"], resolution: "resolved", evidenceIds: ["EV-VCS-CAST-27", "EV-VCS-NARRATIVE-CONTRACT"] },
      { id: "STATE-grandma-surgery-funded", name: "grandma-surgery-funded", type: "story state", aliases: [], resolution: "resolved", evidenceIds: ["EV-VCS-TRIGGER-REGISTRY", "EV-VCS-ENDING-CONTRACT"] },
    ],
    dependencies: [
      { from: "Founder and CAST-27 relationship", to: "$47,000 operation obligation", claimKey: "required-payoff:grandma-operation", claimKind: "normative", relation: "reveals", status: "established", evidenceIds: ["EV-VCS-NARRATIVE-CONTRACT"] },
      { from: "current Days 7–8 economy", to: "$47,000 in Founder personal funds", claimKey: "producer:founder-personal-funds-47000", claimKind: "configured", relation: "causes", status: "missing", evidenceIds: ["EV-VCS-ECONOMY"] },
      { from: "$47,000 in Founder personal funds", to: "operation payment resolver", claimKey: "producer:grandma-surgery-funded", claimKind: "configured", relation: "requires", status: "missing", evidenceIds: ["EV-VCS-TRIGGER-REGISTRY"] },
      { from: "operation payment resolver", to: "grandma-surgery-funded", claimKey: "producer:grandma-surgery-funded", claimKind: "configured", relation: "causes", status: "missing", evidenceIds: ["EV-VCS-TRIGGER-REGISTRY"] },
      { from: "grandma-surgery-funded", to: "post-operation reading scene", claimKey: "consumer:grandma-surgery-funded", claimKind: "normative", relation: "requires", status: "blocked", evidenceIds: ["EV-VCS-ENDING-CONTRACT"] },
    ],
    proposal: {
      summary: "Build the missing later-story bridge from legitimate Founder income to a saved, one-time hospital payment.",
      assumptions: ["The $47,000 operation remains an approved future-story promise.", "Company money remains separate from the Founder's personal money."],
      requiredChanges: ["Add the later progression that gives the Founder at least $47,000 in legitimate personal funds.", "Add one hospital-payment action that deducts $47,000.", "Persist grandma-surgery-funded in the same successful transaction.", "Use the saved result to unlock Grandma's recovery scene and retire pre-operation dialogue.", "Test insufficient funds, success, reload, and a repeated payment attempt."],
      downstreamRisks: ["Using Seed Round company cash directly would violate the financing rule.", "Separating deduction from persistence could charge twice or unlock the payoff without payment."],
    },
    followUpQuestions: [...VCS_DEMO_FOLLOW_UPS.reachability],
    caveats: ["This conclusion is about the current Days 7–8 prototype. The future story can still fulfill the promise after the missing progression is implemented."],
  });
}

function blastRadiusAnswer(request: QueryRequest, byId: Map<string, EvidenceChunk>): ContinuityAnswer {
  return baseAnswer(request, {
    verdict: "PROPOSAL",
    truthStatus: "supported",
    reachability: {
      status: "conditionally_reachable",
      completenessScope: `The story, prototype, financing, trigger, ending, and test contracts at ${VCS_DEMO_REVISION}.`,
      targetClaimKeys: ["required-payoff:grandma-operation", "producer:founder-personal-funds-47000", "producer:grandma-surgery-funded"],
      blockers: ["The current prototype cannot reach even the approved $47,000 amount.", "The one-time payment and saved result are not implemented."],
      assumptions: ["Grandma's operation remains the same later-story payoff.", "The higher amount would be approved as a canon change before implementation."],
      path: ["Approve the new amount in story canon", "Revise the later personal-income path", "Update every displayed amount and payment rule", "Implement the one-time payment", "Update the acceptance tests and recovery-scene gate"],
    },
    answer: "A $60,000 operation could work, but it would be a proposed canon change, not a single-number edit. It would change the promised story amount, the later personal-income path, every dialogue or screen that displays $47,000, the hospital-payment validation and deduction, and the acceptance tests. The current Days 7–8 prototype would still be unable to reach the outcome, and it would still need the missing payment and saved result.",
    confidence: "high",
    evidence: compactReferences([
      reference(byId, "EV-VCS-NARRATIVE-CONTRACT", "opposes", "The current canonical operation contract establishes a $47,000 cost."),
      reference(byId, "EV-VCS-ECONOMY", "supports", "Establishes that the current prototype cannot reach the existing amount and separates personal from company money.", "configured"),
      reference(byId, "EV-VCS-SEED-ROUND", "supports", "Shows that the later personal-liquidity plan would need to cover the higher target.", "normative"),
      reference(byId, "EV-VCS-TRIGGER-TEST", "supports", "Identifies the threshold, deduction, persistence, and replay checks that must change.", "tested"),
      reference(byId, "EV-VCS-TRIGGER-REGISTRY", "context", "Shows the pre-existing missing completion producer that a threshold edit would not repair."),
      reference(byId, "EV-VCS-ENDING-CONTRACT", "context", "Shows the downstream state consumed by the ending payoff."),
    ]),
    entities: [
      { id: "CAST-27", name: "Grandma", type: "character", aliases: ["operation patient"], resolution: "resolved", evidenceIds: ["EV-VCS-CAST-27", "EV-VCS-NARRATIVE-CONTRACT"] },
      { id: "STATE-grandma-surgery-funded", name: "grandma-surgery-funded", type: "story state", aliases: [], resolution: "resolved", evidenceIds: ["EV-VCS-TRIGGER-REGISTRY", "EV-VCS-ENDING-CONTRACT"] },
    ],
    conflicts: [{
      type: "proposed_value_conflict",
      basis: "proposal_divergence",
      frameKey: "required-payoff:grandma-operation",
      claimKind: "normative",
      premiseClaimKeys: ["required-payoff:grandma-operation"],
      candidateEntityIds: [],
      statement: "$60,000 conflicts with the currently established $47,000 operation cost until an approved revision supersedes it.",
      severity: "high",
      evidenceIds: ["EV-VCS-NARRATIVE-CONTRACT", "EV-VCS-ECONOMY", "EV-VCS-TRIGGER-TEST"],
    }],
    dependencies: [
      { from: "$60,000 operation cost", to: "approved story promise and displayed amount", claimKey: "proposal:operation-cost:60000:story", claimKind: "causal", relation: "causes", status: "proposed", evidenceIds: ["EV-VCS-NARRATIVE-CONTRACT"] },
      { from: "$60,000 operation cost", to: "later Founder personal-income requirement", claimKey: "proposal:operation-cost:60000:personal-funds", claimKind: "causal", relation: "causes", status: "proposed", evidenceIds: ["EV-VCS-ECONOMY", "EV-VCS-SEED-ROUND"] },
      { from: "$60,000 operation cost", to: "hospital validation and deduction", claimKey: "proposal:operation-cost:60000:payment", claimKind: "causal", relation: "causes", status: "proposed", evidenceIds: ["EV-VCS-TRIGGER-REGISTRY", "EV-VCS-TRIGGER-TEST"] },
      { from: "$60,000 operation cost", to: "payoff regression tests", claimKey: "proposal:operation-cost:60000:tests", claimKind: "causal", relation: "causes", status: "proposed", evidenceIds: ["EV-VCS-TRIGGER-TEST"] },
      { from: "payment resolver", to: "grandma-surgery-funded", claimKey: "producer:grandma-surgery-funded", claimKind: "causal", relation: "causes", status: "missing", evidenceIds: ["EV-VCS-TRIGGER-REGISTRY"] },
    ],
    proposal: {
      summary: "Raise the operation target to $60,000 as one versioned story, economy, interface, payment, and test change.",
      assumptions: ["The operation remains a fixed-dollar later-story goal.", "The player should reach it through legitimate personal income rather than company cash."],
      requiredChanges: ["Approve $60,000 in the story source of truth.", "Revise the later personal-liquidity target and pacing.", "Update all dialogue and interface references to $47,000.", "Make the future payment require and deduct $60,000 once.", "Update threshold, persistence, reload, and recovery-scene tests."],
      downstreamRisks: ["Old dialogue or UI may retain the retired amount.", "The higher target may turn intended progression into excessive grind.", "Company financing may accidentally be treated as personal money.", "The post-operation scene may unlock for the old threshold or charge twice."],
    },
    followUpQuestions: [...VCS_DEMO_FOLLOW_UPS.blastRadius],
    caveats: ["The proposal is not canon until its source revision is approved."],
  });
}

function insufficientAnswer(request: QueryRequest): ContinuityAnswer {
  return baseAnswer(request, {
    verdict: "INSUFFICIENT_EVIDENCE",
    truthStatus: "unknown",
    answer: "The worked example does not contain enough information to answer that question without guessing. Try one of the example questions, or add the missing story, game, or test material in your own workspace.",
    confidence: "low",
    followUpQuestions: [],
    caveats: ["Retrieved context is not treated as proof when it does not address the question."],
  });
}

function baseAnswer(
  request: QueryRequest,
  overrides: Partial<ContinuityAnswer> & Pick<ContinuityAnswer, "verdict" | "truthStatus" | "answer" | "confidence">,
): ContinuityAnswer {
  return {
    version: CONTINUITY_ANSWER_VERSION,
    projectRevision: VCS_DEMO_REVISION,
    timeScope: "Current VCS MVP through the planned operation payoff",
    question: request.question,
    verdict: overrides.verdict,
    truthStatus: overrides.truthStatus,
    reachability: overrides.reachability ?? {
      status: "not_evaluated",
      completenessScope: "Not evaluated for this question.",
      targetClaimKeys: [],
      blockers: [],
      assumptions: [],
      path: [],
    },
    answer: overrides.answer,
    confidence: overrides.confidence,
    evidence: overrides.evidence ?? [],
    conclusions: overrides.conclusions ?? [],
    analysisChecks: overrides.analysisChecks ?? [],
    entities: overrides.entities ?? [],
    conflicts: overrides.conflicts ?? [],
    dependencies: overrides.dependencies ?? [],
    proposal: overrides.proposal ?? null,
    followUpQuestions: overrides.followUpQuestions ?? [],
    caveats: overrides.caveats ?? [],
  };
}

function reference(
  byId: Map<string, EvidenceChunk>,
  id: string,
  stance: EvidenceReference["stance"],
  supports: string,
  requestedClaimKind?: ClaimKind,
): EvidenceReference | null {
  const chunk = byId.get(id);
  if (!chunk) return null;
  const claimKind = requestedClaimKind && chunk.claimKinds?.includes(requestedClaimKind)
    ? requestedClaimKind
    : chunk.claimKinds?.[0] ?? "historical";
  const use = stance === "supports" ? "establish" : stance === "opposes" ? "challenge" : "contextualize";
  return { evidenceId: chunk.id, sourceId: chunk.sourceId, locator: chunk.locator, stance, claimKind, use, supports };
}

function compactReferences(references: Array<EvidenceReference | null>): EvidenceReference[] {
  return references.filter((reference): reference is EvidenceReference => Boolean(reference));
}

function demoAnalysisChecks(answer: ContinuityAnswer, route?: AnalysisRoute): ContinuityAnswer["analysisChecks"] {
  return (route?.requiredChecks ?? []).map((check) => {
    if (answer.verdict === "UNREACHABLE" && check === "identity_scope") {
      return {
        check,
        status: "supported" as const,
        finding: "The operation patient is CAST-27, the Founder's grandmother; USER_0047's grandmother is a separate person.",
        evidenceIds: ["EV-VCS-CAST-27", "EV-VCS-NARRATIVE-CONTRACT"],
      };
    }
    if (answer.verdict === "UNREACHABLE" && check === "actor_knowledge_and_authorization") {
      return {
        check,
        status: "not_applicable" as const,
        finding: "No payment action exists yet, so there is no implemented actor authorization to evaluate.",
        evidenceIds: ["EV-VCS-TRIGGER-REGISTRY"],
      };
    }
    if (answer.verdict === "UNREACHABLE" && check === "resource_conservation") {
      return {
        check,
        status: "supported" as const,
        finding: "The current personal account starts at $700, cannot reach $47,000 in this slice, and remains separate from company financing.",
        evidenceIds: ["EV-VCS-ECONOMY", "EV-VCS-SEED-ROUND"],
      };
    }
    const evidenceIds = answer.evidence
      .filter((reference) => demoCheckAllows(check, reference.claimKind) && reference.use !== "contextualize" && reference.use !== "propose")
      .map((reference) => reference.evidenceId);
    if (!evidenceIds.length) {
      return { check, status: "unknown" as const, finding: "The reviewed packet contains no evidence for this dimension.", evidenceIds: [] };
    }
    return {
      check,
      status: answer.verdict === "CONFLICT" && check === "claim_boundary" ? "conflicted" as const : "supported" as const,
      finding: `The reviewed evidence packet explicitly addresses ${check.replaceAll("_", " ")}.`,
      evidenceIds: evidenceIds.slice(0, 3),
    };
  });
}

function demoCheckAllows(check: AnalysisCheck, claimKind: ClaimKind): boolean {
  const allowed: Record<AnalysisCheck, ClaimKind[]> = {
    identity_scope: ["identity", "historical"],
    authority_and_lifecycle: ["identity", "normative", "configured", "implemented", "tested", "observed", "causal", "historical"],
    temporal_scope: ["normative", "configured", "implemented", "tested", "observed", "causal", "historical"],
    claim_boundary: ["identity", "normative", "configured", "implemented", "tested", "observed", "causal", "historical"],
    preconditions_and_reachability: ["configured", "implemented", "tested", "observed", "causal"],
    actor_knowledge_and_authorization: ["normative", "configured", "implemented", "observed", "causal"],
    resource_conservation: ["configured", "implemented", "observed", "causal"],
    transition_ordering: ["configured", "implemented", "tested", "observed", "causal"],
    repeatability_and_idempotency: ["normative", "configured", "implemented", "tested", "observed", "causal"],
    state_and_asset_compatibility: ["identity", "normative", "configured", "implemented", "tested", "observed", "causal"],
    downstream_consumers: ["normative", "configured", "implemented", "tested", "observed", "causal"],
    verification_and_unknowns: ["tested", "observed", "implemented", "configured", "causal", "historical"],
  };
  return allowed[check].includes(claimKind);
}

function tokenize(value: string): Set<string> {
  const stopWords = new Set(["a", "an", "and", "are", "can", "do", "for", "how", "i", "in", "is", "it", "of", "or", "the", "this", "to", "what", "who"]);
  return new Set((value.toLowerCase().match(/[a-z0-9_]+/g) ?? []).filter((token) => token.length > 1 && !stopWords.has(token)));
}
