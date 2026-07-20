/**
 * Public questions for the deterministic Vibe Code Simulator example.
 *
 * Keeping these in a client-safe module gives the page, reasoner, MCP tests,
 * and regression suite one vocabulary. A question may appear in the UI only
 * when the reviewed sample engine has a dedicated, cited answer for it.
 */
export const VCS_DEMO_TIME_SCOPE = "through the current Vibe Code Simulator demonstration build";

export const VCS_DEMO_QUESTIONS = Object.freeze({
  reachability: "Can the player earn and pay $47,000 in the current prototype?",
  identity: "Who does “Grandma” mean in the Day 8 customer message?",
  blastRadius: "If Grandma's operation cost changed to $60,000, what else would need to change?",
  repair: "What would the game need before Grandma's operation can happen?",
  verification: "How do we make sure the operation cannot charge the player twice?",
  investment: "Can Marc's Seed Round money pay for Grandma's operation?",
  visualBinding: "Is the portrait beside the Day 8 customer message showing the right Grandma?",
  relationship: "How is CAST-27 related to the Founder?",
  sources: "Which project records support this answer?",
});

export const VCS_DEMO_SUGGESTED_QUESTIONS = Object.freeze([
  VCS_DEMO_QUESTIONS.reachability,
  VCS_DEMO_QUESTIONS.identity,
  VCS_DEMO_QUESTIONS.blastRadius,
]);

export const VCS_DEMO_FOLLOW_UPS = Object.freeze({
  reachability: [VCS_DEMO_QUESTIONS.repair, VCS_DEMO_QUESTIONS.investment, VCS_DEMO_QUESTIONS.identity],
  identity: [VCS_DEMO_QUESTIONS.visualBinding, VCS_DEMO_QUESTIONS.relationship, VCS_DEMO_QUESTIONS.reachability],
  relationship: [VCS_DEMO_QUESTIONS.identity, VCS_DEMO_QUESTIONS.visualBinding, VCS_DEMO_QUESTIONS.reachability],
  visualBinding: [VCS_DEMO_QUESTIONS.identity, VCS_DEMO_QUESTIONS.relationship, VCS_DEMO_QUESTIONS.repair],
  repair: [VCS_DEMO_QUESTIONS.verification, VCS_DEMO_QUESTIONS.blastRadius, VCS_DEMO_QUESTIONS.investment],
  verification: [VCS_DEMO_QUESTIONS.repair, VCS_DEMO_QUESTIONS.investment, VCS_DEMO_QUESTIONS.identity],
  investment: [VCS_DEMO_QUESTIONS.reachability, VCS_DEMO_QUESTIONS.repair, VCS_DEMO_QUESTIONS.blastRadius],
  blastRadius: [VCS_DEMO_QUESTIONS.reachability, VCS_DEMO_QUESTIONS.repair, VCS_DEMO_QUESTIONS.verification],
  sources: [VCS_DEMO_QUESTIONS.reachability, VCS_DEMO_QUESTIONS.identity, VCS_DEMO_QUESTIONS.blastRadius],
});

export const VCS_DEMO_CLICKABLE_QUESTIONS = Object.freeze([
  ...new Set([
    ...VCS_DEMO_SUGGESTED_QUESTIONS,
    ...Object.values(VCS_DEMO_FOLLOW_UPS).flat(),
  ]),
]);
