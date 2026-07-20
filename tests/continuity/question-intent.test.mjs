import assert from "node:assert/strict";
import test from "node:test";

import {
  analysisModeForQuestion,
  inferContinuityQuestionIntent,
  normalizedQuestionText,
} from "../../lib/continuity/question-intent.ts";

test("question intent routing is punctuation-tolerant and domain-neutral", () => {
  assert.equal(normalizedQuestionText("Who does “the Guardian” mean?"), "who does the guardian mean");
  assert.equal(inferContinuityQuestionIntent("Who does “the Guardian” mean?"), "identity");
  assert.equal(inferContinuityQuestionIntent("Can the account accumulate enough funds to complete the transfer?"), "reachability");
  assert.equal(inferContinuityQuestionIntent("If we raise the price, what else would need to change?"), "change_analysis");
  assert.equal(inferContinuityQuestionIntent("What is the minimum change that makes this workflow reachable?"), "repair_plan");
  assert.equal(inferContinuityQuestionIntent("Which tests prove the migration runs exactly once?"), "verification_plan");
  assert.equal(inferContinuityQuestionIntent("Which records support this answer?"), "source_authority");
  assert.equal(inferContinuityQuestionIntent("Is this portrait showing the correct person?"), "visual_binding");
});

test("browser analysis modes follow the shared intent instead of a second classifier", () => {
  assert.equal(analysisModeForQuestion("Can this event happen?"), "trace_dependencies");
  assert.equal(analysisModeForQuestion("What is the minimum change that makes it possible?"), "trace_dependencies");
  assert.equal(analysisModeForQuestion("If I remove this quest, what else changes?"), "evaluate_change");
  assert.equal(analysisModeForQuestion("Who does the guardian mean?"), "answer_question");
  assert.equal(analysisModeForQuestion("Which tests prove it runs once?"), "answer_question");
});
