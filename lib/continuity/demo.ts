import {
  CONTINUITY_ANSWER_VERSION,
  type ContinuityAnswer,
  type ContinuityReasoner,
  type EvidenceChunk,
  type EvidenceReference,
  type EvidenceRetriever,
  type QueryRequest,
} from "./contracts";

export const VCS_DEMO_PROJECT_ID = "vcs-demo";
export const VCS_DEMO_REVISION = "vcs-demo-r1";

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
    claimKey: "relationship:CAST-27:FOUNDER",
    polarity: "positive",
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
    validFrom: "day-8",
    claimKey: "relationship:USER_0047:unnamed-grandmother",
    polarity: "positive",
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
    claimKey: "identity:MENTION-USER0047-GRANDMA",
    polarity: "positive",
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
    claimKey: "ui-binding:customer-message-referent",
    polarity: "negative",
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

export class DemoReasoner implements ContinuityReasoner {
  readonly mode = "demonstration" as const;
  readonly model = null;

  async answer(request: QueryRequest, evidence: EvidenceChunk[]): Promise<ContinuityAnswer> {
    const kind = classifyQuestion(`${request.question} ${request.proposedChange ?? ""}`);
    const byId = new Map(evidence.map((chunk) => [chunk.id, chunk]));

    if (kind === "visual-binding") return visualBindingAnswer(request, byId);
    if (kind === "identity") return identityAnswer(request, byId);
    if (kind === "relation") return relationshipAnswer(request, byId);
    if (kind === "reachability") return reachabilityAnswer(request, byId);
    if (kind === "blast-radius") return blastRadiusAnswer(request, byId);
    return insufficientAnswer(request);
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
      reference(byId, "EV-VCS-CUSTOMER-MESSAGE-BINDING", "supports", "Records the mismatched UI binding and the proposed Founder replacement."),
      reference(byId, "EV-VCS-ASSET-27", "supports", "Identifies ART-27 as CAST-27's visual record."),
      reference(byId, "EV-VCS-SECOND-GRANDMA", "opposes", "Identifies the grandmother in the message text as USER_0047's separate unnamed grandmother."),
      reference(byId, "EV-VCS-CAST-27", "context", "Establishes that CAST-27 belongs to the Founder protagonist's family, not USER_0047's."),
    ]),
    entities: [
      { id: "CAST-27", name: "Grandma", type: "character", aliases: ["the Founder's grandmother", "ART-27"] },
      { id: "MENTION-USER0047-GRANDMA", name: "USER_0047's grandmother", type: "mentioned character", aliases: ["their grandma"] },
      { id: "FOUNDER", name: "The Founder", type: "protagonist", aliases: ["protagonist"] },
      { id: "USER_0047", name: "USER_0047", type: "adult customer", aliases: ["Day 8 customer"] },
    ],
    conflicts: [{
      type: "visual_text_identity_mismatch",
      statement: "The bound portrait resolves to the Founder protagonist's grandmother, CAST-27, while the adjacent customer message resolves to USER_0047's different grandmother.",
      severity: "high",
      evidenceIds: ["EV-VCS-CUSTOMER-MESSAGE-BINDING", "EV-VCS-ASSET-27", "EV-VCS-SECOND-GRANDMA"],
    }],
    dependencies: [{
      from: "customer-message portrait binding",
      to: "viewer interpretation of the message referent",
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
      { id: "CAST-27", name: "Grandma", type: "character", aliases: ["the Founder's grandmother", "the operation patient"] },
      { id: "MENTION-USER0047-GRANDMA", name: "USER_0047's grandmother", type: "mentioned character", aliases: ["their grandma"] },
      { id: "FOUNDER", name: "The Founder", type: "protagonist", aliases: ["protagonist"] },
      { id: "USER_0047", name: "USER_0047", type: "adult customer", aliases: ["Day 8 customer"] },
    ],
    conflicts: [{
      type: "referent_ambiguity",
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
    entities: [
      { id: "CAST-27", name: "Grandma", type: "character", aliases: ["the Founder's grandmother"] },
      { id: "FOUNDER", name: "The Founder", type: "protagonist", aliases: ["protagonist"] },
      { id: "USER_0047", name: "USER_0047", type: "adult customer", aliases: ["Day 8 customer"] },
      { id: "MENTION-USER0047-GRANDMA", name: "USER_0047's grandmother", type: "mentioned character", aliases: ["their grandma"] },
    ],
    dependencies: [{
      from: "CAST-27",
      to: "FOUNDER",
      relation: "reveals",
      status: "established",
      evidenceIds: ["EV-VCS-CAST-27"],
    }],
    conflicts: asksAboutCustomer ? [{
      type: "pronoun_referent_ambiguity",
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
      blockers: ["No registered transition converts sufficient available cash into the operation payment and emits grandma-surgery-funded."],
      assumptions: ["The current registry marked complete is the runtime source of truth for story transitions."],
      path: ["Narrative contract establishes the Founder's obligation to CAST-27", "Economy can accumulate available cash", "Missing: payment resolver and one-time completion flag"],
    },
    answer: "Not in the current audited build. The Founder's $47,000 operation obligation for CAST-27 is canonical, and the economy can increase available cash, but the complete trigger registry has no transition that pays for the operation or emits grandma-surgery-funded. The promise is established; its executable completion path is missing. USER_0047's separately mentioned grandmother is not the patient in this goal.",
    confidence: "high",
    evidence: compactReferences([
      reference(byId, "EV-VCS-NARRATIVE-CONTRACT", "supports", "Establishes the required $47,000 payoff."),
      reference(byId, "EV-VCS-ECONOMY", "context", "Shows that cash accumulation and story completion are separate mechanisms."),
      reference(byId, "EV-VCS-TRIGGER-REGISTRY", "supports", "The closed-world registry establishes that no completion producer currently exists."),
      reference(byId, "EV-VCS-ENDING-CONTRACT", "supports", "Shows that the ending consumes a flag the current graph cannot produce."),
    ]),
    entities: [
      { id: "CAST-27", name: "Grandma", type: "character", aliases: ["the Founder's grandmother", "operation patient"] },
      { id: "FOUNDER", name: "The Founder", type: "protagonist", aliases: ["protagonist"] },
      { id: "STATE-grandma-surgery-funded", name: "grandma-surgery-funded", type: "story state", aliases: [] },
    ],
    dependencies: [
      { from: "Founder and CAST-27 relationship", to: "$47,000 operation obligation", relation: "reveals", status: "established", evidenceIds: ["EV-VCS-CAST-27", "EV-VCS-NARRATIVE-CONTRACT"] },
      { from: "sufficient available cash", to: "operation payment resolver", relation: "causes", status: "missing", evidenceIds: ["EV-VCS-ECONOMY", "EV-VCS-TRIGGER-REGISTRY"] },
      { from: "operation payment resolver", to: "grandma-surgery-funded", relation: "causes", status: "missing", evidenceIds: ["EV-VCS-TRIGGER-REGISTRY"] },
      { from: "grandma-surgery-funded", to: "post-operation reading scene", relation: "requires", status: "blocked", evidenceIds: ["EV-VCS-ENDING-CONTRACT"] },
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
      { id: "CAST-27", name: "Grandma", type: "character", aliases: ["operation patient"] },
      { id: "STATE-grandma-surgery-funded", name: "grandma-surgery-funded", type: "story state", aliases: [] },
    ],
    conflicts: [{
      type: "proposed_value_conflict",
      statement: "$60,000 conflicts with the currently established $47,000 operation cost until an approved revision supersedes it.",
      severity: "high",
      evidenceIds: ["EV-VCS-NARRATIVE-CONTRACT", "EV-VCS-ECONOMY", "EV-VCS-TRIGGER-TEST"],
    }],
    dependencies: [
      { from: "$60,000 operation cost", to: "required income curve", relation: "causes", status: "proposed", evidenceIds: ["EV-VCS-ECONOMY"] },
      { from: "$60,000 operation cost", to: "Day 24 target window", relation: "causes", status: "proposed", evidenceIds: ["EV-VCS-ECONOMY"] },
      { from: "$60,000 operation cost", to: "investment pacing", relation: "causes", status: "proposed", evidenceIds: ["EV-VCS-ECONOMY"] },
      { from: "$60,000 operation cost", to: "payoff regression tests", relation: "causes", status: "proposed", evidenceIds: ["EV-VCS-TRIGGER-TEST"] },
      { from: "payment resolver", to: "grandma-surgery-funded", relation: "causes", status: "missing", evidenceIds: ["EV-VCS-TRIGGER-REGISTRY"] },
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
      blockers: [],
      assumptions: [],
      path: [],
    },
    answer: overrides.answer,
    confidence: overrides.confidence,
    evidence: overrides.evidence ?? [],
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
): EvidenceReference | null {
  const chunk = byId.get(id);
  return chunk ? { evidenceId: chunk.id, sourceId: chunk.sourceId, locator: chunk.locator, stance, supports } : null;
}

function compactReferences(references: Array<EvidenceReference | null>): EvidenceReference[] {
  return references.filter((reference): reference is EvidenceReference => Boolean(reference));
}

function tokenize(value: string): Set<string> {
  const stopWords = new Set(["a", "an", "and", "are", "can", "do", "for", "how", "i", "in", "is", "it", "of", "or", "the", "this", "to", "what", "who"]);
  return new Set((value.toLowerCase().match(/[a-z0-9_]+/g) ?? []).filter((token) => token.length > 1 && !stopWords.has(token)));
}
