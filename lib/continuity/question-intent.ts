export type ContinuityQuestionIntent =
  | "identity"
  | "relationship"
  | "visual_binding"
  | "reachability"
  | "change_analysis"
  | "repair_plan"
  | "verification_plan"
  | "source_authority"
  | "fact_lookup"
  | "general";

/** Normalize punctuation so quoted names and typographic apostrophes do not
 * make otherwise identical questions take different routes. */
export function normalizedQuestionText(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Domain-neutral intent routing shared by the browser and deterministic
 * example. Project adapters may refine the result with their own entity names,
 * but should not invent separate meanings for repair, verification, or change
 * questions.
 */
export function inferContinuityQuestionIntent(value: string): ContinuityQuestionIntent {
  const question = normalizedQuestionText(value);

  if (/\b(?:test|tests|testing|verify|verification|prove|regression)\b/.test(question)
    || /\b(?:exactly once|only once|second charge|reload|replay|idempotent|idempotency)\b/.test(question)
    || /\bcharge\b.{0,40}\btwice\b/.test(question)) {
    return "verification_plan";
  }
  if (/\b(?:smallest|minimum|minimal) change\b/.test(question)
    || /\bwhat (?:would|does|will|must|needs to|need to) (?:the )?(?:game|system|story|project|code)? ?(?:need|add|build|implement)\b/.test(question)
    || /\bmake(?:s)? .+ (?:reachable|possible|work)\b/.test(question)
    || /\bhow (?:can|could|would) .+ (?:become|be made) (?:reachable|possible)\b/.test(question)) {
    return "repair_plan";
  }
  if (/\bwhat (?:else )?(?:breaks|changes|is affected|would need to change)\b/.test(question)
    || /\bblast radius\b/.test(question)
    || /\bif (?:we |i )?(?:change|remove|replace|add|move|raise|increase)\b/.test(question)
    || /\b(?:change|raise|increase)\b.{0,40}\b(?:price|cost|rule|date|amount)\b/.test(question)
    || /\b(?:change|raise|increase) (?:the )?(?:price|cost|rule|date|amount)\b/.test(question)) {
    return "change_analysis";
  }
  if (/\b(?:picture|portrait|image|visual|art|asset)\b/.test(question)
    && /\b(?:shown|beside|next to|match|correct|right|valid|depict|represents?)\b/.test(question)) {
    return "visual_binding";
  }
  if (/\b(?:who|what|which) does .+ mean\b/.test(question)
    || /\bwho is\b/.test(question)
    || /\bwhich (?:person|character|one)\b/.test(question)
    || /^which .+ is this\b/.test(question)
    || /^tell me about\b/.test(question)
    || /\b(?:same person|same character|same entity|multiple people|multiple characters)\b/.test(question)) {
    return "identity";
  }
  if (/\b(?:related|relationship|whose|mother|father|grandmother|grandfather|sibling|parent|child)\b/.test(question)
    && /\b(?:how|who|whose|to|is|are)\b/.test(question)) {
    return "relationship";
  }
  if (/\b(?:which|what|where) (?:file|files|source|sources|document|documents|record|records)\b/.test(question)
    || /\b(?:source of truth|support this answer|evidence for)\b/.test(question)) {
    return "source_authority";
  }
  if (/\b(?:can|could|will|would|may)\b/.test(question)
    && /\b(?:happen|occur|reach|earn|afford|fund|funded|funding|pay|save|unlock|complete|achieve|trigger)\b/.test(question)) {
    return "reachability";
  }
  if (/\b(?:prerequisite|dependency|dependencies|must happen|reachable|reachability|producer|trigger|unlock)\b/.test(question)) {
    return "reachability";
  }
  if (/^why\b/.test(question)
    || /\b(?:prevents?|blocks?|enables?|feasible|feasibility|mechanism|causal|causality|chain|pathway)\b/.test(question)) {
    return "reachability";
  }
  // A bounded factual lookup is not a causal audit merely because the router
  // has access to implementation, test, and history lanes. Keep ordinary
  // questions about one value, place, date, status, or count on the smallest
  // sufficient route. Negative and exhaustive wording is handled separately
  // by the proof contract because it changes what coverage is required, not
  // what the user is asking about.
  const boundedFactShape = /^(?:where|when|how many|how much)\b/.test(question)
    || (/^(?:what|which|is|are|does|do|did|has|have)\b/.test(question)
      && /\b(?:configured|configuration|setting|value|limit|threshold|price|cost|date|status|implemented|implementation|runtime|handler|function|executes?|writes?|test|tested|verification|result|pass|fail|observed|recorded|measured|reported|count|number|amount|location)\b/.test(question));
  if (boundedFactShape) {
    return "fact_lookup";
  }
  return "general";
}

export function analysisModeForQuestion(value: string): "answer_question" | "evaluate_change" | "trace_dependencies" {
  const intent = inferContinuityQuestionIntent(value);
  if (intent === "change_analysis") return "evaluate_change";
  if (intent === "reachability" || intent === "repair_plan") return "trace_dependencies";
  return "answer_question";
}
