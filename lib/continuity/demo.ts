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
import { evaluateTransitionGraph, type TransitionGraph } from "./reachability";

export const VCS_DEMO_PROJECT_ID = "vcs-demo";
export const VCS_DEMO_REVISION = "vcs-demo-r1";
const VCS_DEMO_SOURCE_VERSION_IDS = [
  "SRC-VCS-CAST-v1",
  "SRC-VCS-CONTRACT-v4",
  "SRC-VCS-DIALOGUE-v2",
  "SRC-VCS-ECONOMY-v5",
  "SRC-VCS-ENDING-v2",
  "SRC-VCS-ASSETS-v2",
  "SRC-VCS-STORY-v3",
  "SRC-VCS-TESTS-v3",
  "SRC-VCS-TRIGGERS-v7",
  "SRC-VCS-UI-BINDINGS-v3",
  "SRC-VCS-UI-CONTRACT-v1",
].sort();
const VCS_TRIGGER_COMPLETENESS_BOUNDARY = {
  version: "continuity.completeness-boundary.v1" as const,
  boundaryId: "BOUNDARY-VCS-TRIGGER-PRODUCERS-R1",
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

export const VCS_DEMO_COMPLETENESS_REGISTRY: TrustedCompletenessRegistry = {
  version: "continuity.trusted-completeness-registry.v1",
  projectId: VCS_DEMO_PROJECT_ID,
  projectRevision: VCS_DEMO_REVISION,
  grants: [{
    boundary: VCS_TRIGGER_COMPLETENESS_BOUNDARY,
    evidenceBinding: {
      evidenceId: "EV-VCS-TRIGGER-REGISTRY",
      sourceId: "SRC-VCS-TRIGGERS",
      sourceVersionId: "SRC-VCS-TRIGGERS-v7",
      claimKey: "producer:grandma-surgery-funded",
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
    sourceVersionId: "SRC-VCS-CONTRACT-v4",
    title: "Narrative contract",
    locator: "Obligation G-04",
    text: "The story must allow the Founder protagonist to earn and pay $47,000 for CAST-27's operation. The payment is a promised payoff, not merely optional flavor text. USER_0047 is a customer and is not the actor responsible for this operation goal.",
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
    sourceVersionId: "SRC-VCS-ECONOMY-v5",
    title: "Economy table",
    locator: "Milestones / founder cash",
    text: "The current balance uses operation_cost = 47000, a Day 24 target window, and an investment decision at $28,000. Accepting the investment diverts $12,000 before the operation target. The table can raise available cash, but it does not itself emit a story-completion flag.",
    score: 0.91,
    authority: "production",
    role: "configuration",
    lifecycle: "active",
    claimKinds: ["configured", "causal"],
    claimKey: "economy-operation-threshold",
    polarity: "positive",
  },
  {
    id: "EV-VCS-TRIGGER-REGISTRY",
    projectId: VCS_DEMO_PROJECT_ID,
    sourceId: "SRC-VCS-TRIGGERS",
    sourceVersionId: "SRC-VCS-TRIGGERS-v7",
    title: "Story trigger registry",
    locator: "Complete current registry / operation payoff",
    text: "The complete current trigger registry contains no producer for grandma-surgery-funded. It can advance days and generate plausible events, but no registered transition converts available cash into the operation payment or emits that completion flag.",
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
    sourceVersionId: "SRC-VCS-ENDING-v2",
    title: "Ending contract",
    locator: "Grandma payoff gate",
    text: "The post-operation reading scene requires grandma-surgery-funded exactly once. Pre-operation dialogue must retire after that state is persisted.",
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
    sourceVersionId: "SRC-VCS-TESTS-v3",
    title: "Trigger regression tests",
    locator: "operation-payoff.spec / threshold cases",
    text: "Existing payoff fixtures and threshold assertions use $47,000. They do not contain a $60,000 case, and they assume the Day 24 balance window remains unchanged.",
    score: 0.86,
    authority: "production",
    role: "test",
    lifecycle: "active",
    claimKinds: ["tested", "causal"],
    claimKey: "tested-operation-threshold",
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
    text: "The shipped Day 8 USER_0047 customer-message presentation binds its adjacent portrait slot to ART-27, which is CAST-27. The message text refers to USER_0047's separate unnamed grandmother, so the visual and textual referents do not match. The Founder portrait is the proposed replacement for this framing slot.",
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
    ? ["producer:grandma-surgery-funded"]
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
        balances: [{ accountKey: "FOUNDER", resourceKey: "cash", unit: "usd-cent", amountMinor: "4700000" }],
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
        completeInitialDimensions: ["facts"],
        evidenceIds: ["EV-VCS-TRIGGER-REGISTRY"],
        excludedSources: [],
        parseFailures: [],
      },
    };
    const proof = evaluateTransitionGraph(
      graph,
      { kind: "fact", atomKey: "grandma-surgery-funded", value: true },
      request.targetPosition ?? 24,
    );
    return {
      source: "server_transition_graph",
      status: proof.status,
      graphRevision: proof.graphRevision,
      plane: proof.plane,
      completenessScope: route.coverage.scope,
      targetClaimKeys: ["producer:grandma-surgery-funded"],
      blockers: proof.blockers.map((blocker) => blocker.explanation),
      assumptions: proof.assumptions,
      path: proof.rulePath.map((step) => `${step.ruleId} @ ${graph.temporalAxis} ${step.at}`),
      evidenceIds: [...new Set([
        "EV-VCS-TRIGGER-REGISTRY",
        ...proof.rulePath.flatMap((step) => step.evidenceIds),
        ...proof.blockers.flatMap((blocker) => blocker.evidenceIds),
      ])],
      obligations: [{
        id: "OBL-VCS-PAYMENT-PRODUCER",
        kind: "producer",
        from: "sufficient available cash",
        to: "operation payment resolver",
        claimKey: "producer:grandma-surgery-funded",
        claimKind: "configured",
        relation: "causes",
        required: true,
        status: "blocked",
        evidenceIds: ["EV-VCS-TRIGGER-REGISTRY"],
      }],
      diagnostics: proof.diagnostics,
      search: proof.search,
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
      : kind === "reachability" ? reachabilityAnswer(request, byId)
      : kind === "blast-radius" ? blastRadiusAnswer(request, byId)
      : insufficientAnswer(request);
    return { ...answer, analysisChecks: demoAnalysisChecks(answer, route) };
  }
}

type DemoQuestionKind = "identity" | "relation" | "visual-binding" | "reachability" | "blast-radius" | "general";

function classifyQuestion(value: string): DemoQuestionKind {
  const question = value.toLowerCase();
  if (/\b60[,.]?000\b|what breaks|blast radius|change (?:the )?(?:price|cost)|raise (?:the )?(?:price|cost)|increase (?:the )?(?:price|cost)/.test(question)) {
    return "blast-radius";
  }
  const asksAboutMessageVisual = /(?:picture|portrait|shown|beside|visual|image)/.test(question)
    && /message/.test(question)
    && /(?:customer|user_0047)/.test(question);
  if (asksAboutMessageVisual) {
    return "visual-binding";
  }
  if (/same (?:person|grandma|grandmother)|(?:grandma|grandmother).*same|merge.*grandm/.test(question)) {
    return "identity";
  }
  if (/which grandma|how is .*grandma.*related|relationship|user_0047|whose grandmother|screenshot/.test(question)) {
    return "relation";
  }
  if (/who is grandma|tell me about grandma|how many grandmothers?|multiple grandmothers?|grandma mean/.test(question)) {
    return "identity";
  }
  if (/fund|afford|operation|surgery|reachable|reachability|completion path|trigger/.test(question)) {
    return "reachability";
  }
  return "general";
}

function visualBindingAnswer(request: QueryRequest, byId: Map<string, EvidenceChunk>): ContinuityAnswer {
  return baseAnswer(request, {
    verdict: "CONFLICT",
    truthStatus: "conflicted",
    answer: "No—the CAST-27 portrait is not a valid identity image for that message. The shipped Day 8 customer card sends two different identity signals: its adjacent portrait is ART-27, the asset for CAST-27 (the Founder protagonist's grandmother), while the text refers to USER_0047's different, unnamed grandmother. The picture therefore shows CAST-27, but it does not identify the grandmother discussed by the customer. Rebinding the framing slot to the Founder would remove the false association without merging the two grandmothers.",
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
      summary: "Use the Founder portrait for the USER_0047 customer-message framing slot while keeping ART-27 reserved for scenes explicitly about CAST-27.",
      assumptions: ["The framing portrait represents the player-facing speaker or viewpoint, not a newly asserted identity for the customer's grandmother."],
      requiredChanges: ["Replace the customer-message portrait binding.", "Retain stable IDs for CAST-27 and the unnamed customer grandmother.", "Add a UI assertion that message text and portrait roles cannot silently merge entities."],
      downstreamRisks: ["Other customer messages may reuse the same incorrect binding.", "A purely visual regression test may miss semantic identity drift."],
    },
    followUpQuestions: ["Which other message cards reuse ART-27?", "Should portrait roles be validated against speaker, subject, or player viewpoint?"],
    caveats: ["The Founder replacement is a proposed presentation fix; it does not change either grandmother's canonical identity."],
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
    followUpQuestions: ["Do you mean CAST-27 in the operation storyline or USER_0047's grandmother in the customer message?", "Would you like the customer-message binding checked against both entity IDs?"],
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
    followUpQuestions: ["Do you mean CAST-27 or MENTION-USER0047-GRANDMA?", "Which art asset is approved for CAST-27 before the operation?"],
  });
}

function reachabilityAnswer(request: QueryRequest, byId: Map<string, EvidenceChunk>): ContinuityAnswer {
  return baseAnswer(request, {
    verdict: "UNREACHABLE",
    truthStatus: "supported",
    reachability: {
      status: "unreachable_within_scope",
      completenessScope: "The complete current VCS trigger registry, economy table, narrative contract, and ending gate at vcs-demo-r1.",
      targetClaimKeys: ["producer:grandma-surgery-funded"],
      blockers: ["No registered transition converts sufficient available cash into the operation payment and emits grandma-surgery-funded."],
      assumptions: ["The current registry marked complete is the runtime source of truth for story transitions."],
      path: ["Narrative contract establishes the Founder's obligation to CAST-27", "Economy can accumulate available cash", "Missing: payment resolver and one-time completion flag"],
    },
    answer: "Not in the current audited build. The Founder's $47,000 operation obligation for CAST-27 is canonical, and the economy can increase available cash, but the complete trigger registry has no transition that pays for the operation or emits grandma-surgery-funded. The promise is established; its executable completion path is missing. USER_0047's separately mentioned grandmother is not the patient in this goal.",
    confidence: "high",
    evidence: compactReferences([
      reference(byId, "EV-VCS-CAST-27", "supports", "Establishes CAST-27 as the Founder's grandmother and the operation patient."),
      reference(byId, "EV-VCS-NARRATIVE-CONTRACT", "supports", "Establishes the required $47,000 payoff."),
      reference(byId, "EV-VCS-ECONOMY", "context", "Shows that cash accumulation and story completion are separate mechanisms."),
      reference(byId, "EV-VCS-TRIGGER-REGISTRY", "supports", "The closed-world registry establishes that no configured completion producer currently exists.", "configured"),
      reference(byId, "EV-VCS-ENDING-CONTRACT", "supports", "Establishes the intended ending's requirement for the completion flag.", "normative"),
    ]),
    conclusions: [{
      claimKey: "producer:grandma-surgery-funded",
      claimKind: "configured",
      polarity: "negative",
      basis: "closed_world_absence",
      statement: "The complete current trigger registry has no configured producer for grandma-surgery-funded.",
      evidenceIds: ["EV-VCS-TRIGGER-REGISTRY"],
    }],
    entities: [
      { id: "CAST-27", name: "Grandma", type: "character", aliases: ["the Founder's grandmother", "operation patient"], resolution: "resolved", evidenceIds: ["EV-VCS-CAST-27"] },
      { id: "FOUNDER", name: "The Founder", type: "protagonist", aliases: ["protagonist"], resolution: "resolved", evidenceIds: ["EV-VCS-CAST-27", "EV-VCS-NARRATIVE-CONTRACT"] },
      { id: "STATE-grandma-surgery-funded", name: "grandma-surgery-funded", type: "story state", aliases: [], resolution: "resolved", evidenceIds: ["EV-VCS-TRIGGER-REGISTRY", "EV-VCS-ENDING-CONTRACT"] },
    ],
    dependencies: [
      { from: "Founder and CAST-27 relationship", to: "$47,000 operation obligation", claimKey: "required-payoff:grandma-operation", claimKind: "normative", relation: "reveals", status: "established", evidenceIds: ["EV-VCS-NARRATIVE-CONTRACT"] },
      { from: "sufficient available cash", to: "operation payment resolver", claimKey: "producer:grandma-surgery-funded", claimKind: "configured", relation: "causes", status: "missing", evidenceIds: ["EV-VCS-TRIGGER-REGISTRY"] },
      { from: "operation payment resolver", to: "grandma-surgery-funded", claimKey: "producer:grandma-surgery-funded", claimKind: "configured", relation: "causes", status: "missing", evidenceIds: ["EV-VCS-TRIGGER-REGISTRY"] },
      { from: "grandma-surgery-funded", to: "post-operation reading scene", claimKey: "consumer:grandma-surgery-funded", claimKind: "normative", relation: "requires", status: "blocked", evidenceIds: ["EV-VCS-ENDING-CONTRACT"] },
    ],
    followUpQuestions: ["What is the smallest change that makes the operation reachable?", "Which tests should prove the completion flag fires exactly once?"],
    caveats: ["This conclusion is scoped to the current complete registry; unindexed code or an unreleased branch could change it."],
  });
}

function blastRadiusAnswer(request: QueryRequest, byId: Map<string, EvidenceChunk>): ContinuityAnswer {
  return baseAnswer(request, {
    verdict: "PROPOSAL",
    truthStatus: "supported",
    reachability: {
      status: "conditionally_reachable",
      completenessScope: "The current economy, trigger, test, and ending contracts at vcs-demo-r1.",
      targetClaimKeys: ["producer:grandma-surgery-funded", "economy-operation-threshold"],
      blockers: ["The current completion producer is already missing.", "The balance window and tests still encode $47,000."],
      assumptions: ["The operation remains the same narrative payoff.", "The Day 24 target window remains desirable."],
      path: ["Rebalance income or extend the window", "Update the operation threshold", "Add a one-time payment resolver", "Persist grandma-surgery-funded", "Unlock the ending scene"],
    },
    answer: "A $60,000 operation can remain narratively possible, but it is a change proposal rather than current canon. It affects at least four connected surfaces: the required income curve, the Day 24 eligibility window, the $28,000 investment trade-off, and the payoff fixtures. It also inherits the existing missing-trigger problem, so changing one price literal would not make the outcome playable.",
    confidence: "high",
    evidence: compactReferences([
      reference(byId, "EV-VCS-NARRATIVE-CONTRACT", "opposes", "The current canonical operation contract establishes a $47,000 cost."),
      reference(byId, "EV-VCS-ECONOMY", "supports", "Identifies the balance window and investment trade-off affected by a higher target."),
      reference(byId, "EV-VCS-TRIGGER-TEST", "supports", "Identifies fixtures and assertions that encode $47,000."),
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
      { from: "$60,000 operation cost", to: "required income curve", claimKey: "proposal:operation-cost:60000:income-curve", claimKind: "causal", relation: "causes", status: "proposed", evidenceIds: ["EV-VCS-ECONOMY"] },
      { from: "$60,000 operation cost", to: "Day 24 target window", claimKey: "proposal:operation-cost:60000:day-window", claimKind: "causal", relation: "causes", status: "proposed", evidenceIds: ["EV-VCS-ECONOMY"] },
      { from: "$60,000 operation cost", to: "investment pacing", claimKey: "proposal:operation-cost:60000:investment", claimKind: "causal", relation: "causes", status: "proposed", evidenceIds: ["EV-VCS-ECONOMY"] },
      { from: "$60,000 operation cost", to: "payoff regression tests", claimKey: "proposal:operation-cost:60000:tests", claimKind: "causal", relation: "causes", status: "proposed", evidenceIds: ["EV-VCS-TRIGGER-TEST"] },
      { from: "payment resolver", to: "grandma-surgery-funded", claimKey: "producer:grandma-surgery-funded", claimKind: "causal", relation: "causes", status: "missing", evidenceIds: ["EV-VCS-TRIGGER-REGISTRY"] },
    ],
    proposal: {
      summary: "Raise the operation target to $60,000 as one versioned story-and-system change, then rebalance and test the full completion path.",
      assumptions: ["The operation remains a fixed-dollar goal.", "The player should still reach the payoff within a bounded, satisfying number of days.", "The investment proposal remains a meaningful trade-off rather than a mandatory solution."],
      requiredChanges: ["Revise the Day 8 and narrative contracts.", "Rebalance the income curve or target window.", "Recalculate the investment diversion and recovery path.", "Add the missing one-time payment resolver.", "Update $47,000 payoff fixtures and ending-gate tests."],
      downstreamRisks: ["Longer grind or accidental pay-to-win pacing.", "Investment becomes the only viable route.", "Old dialogue displays the retired amount.", "The post-operation scene fires late, twice, or not at all."],
    },
    followUpQuestions: ["Must the Day 24 window stay fixed?", "Should the investment route be optional, necessary, or one of several viable paths?"],
    caveats: ["The proposal is not canon until its source revision is approved."],
  });
}

function insufficientAnswer(request: QueryRequest): ContinuityAnswer {
  return baseAnswer(request, {
    verdict: "INSUFFICIENT_EVIDENCE",
    truthStatus: "unknown",
    answer: "The indexed VCS demonstration packet does not contain enough directly relevant evidence to answer that question safely. Add or identify the governing source, then ask again so the answer can be traced to it.",
    confidence: "low",
    followUpQuestions: ["Which source should govern this question?", "Is this asking about established canon, executable game state, or a proposed change?"],
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
    const explicitlyOpen = check === "actor_knowledge_and_authorization" || check === "resource_conservation";
    if (explicitlyOpen && answer.verdict === "UNREACHABLE") {
      return {
        check,
        status: "unknown" as const,
        finding: check === "actor_knowledge_and_authorization"
          ? "The reviewed sample does not establish an authorized actor for the missing payment transition."
          : "The reviewed sample establishes the target and diversion, but not a complete executable ledger path.",
        evidenceIds: [],
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
