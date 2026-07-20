import assert from "node:assert/strict";
import test from "node:test";

import { POST as queryPost } from "../../app/api/continuity/query/route.ts";
import { POST as mcpPost } from "../../app/mcp/route.ts";
import {
  VCS_DEMO_CLICKABLE_QUESTIONS,
  VCS_DEMO_QUESTIONS,
  VCS_DEMO_SUGGESTED_QUESTIONS,
  VCS_DEMO_TIME_SCOPE,
} from "../../lib/continuity/demo-questions.ts";
import { analysisModeForQuestion } from "../../lib/continuity/question-intent.ts";

const EXPECTED_VERDICTS = new Map([
  [VCS_DEMO_QUESTIONS.reachability, "UNREACHABLE"],
  [VCS_DEMO_QUESTIONS.identity, "AMBIGUOUS"],
  [VCS_DEMO_QUESTIONS.blastRadius, "PROPOSAL"],
  [VCS_DEMO_QUESTIONS.repair, "PROPOSAL"],
  [VCS_DEMO_QUESTIONS.verification, "SUPPORTED"],
  [VCS_DEMO_QUESTIONS.investment, "SUPPORTED"],
  [VCS_DEMO_QUESTIONS.visualBinding, "CONFLICT"],
  [VCS_DEMO_QUESTIONS.relationship, "SUPPORTED"],
]);

function queryRequest(question) {
  const analysisMode = analysisModeForQuestion(question);
  return new Request("http://localhost/api/continuity/query", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      projectId: "vcs-demo",
      question,
      analysisMode,
      proposedChange: analysisMode === "evaluate_change" ? question : null,
      enginePreference: "demo",
      timeScope: VCS_DEMO_TIME_SCOPE,
      temporalAxis: "day",
      storyPosition: 8,
      targetPosition: question === VCS_DEMO_QUESTIONS.reachability ? 8 : undefined,
    }),
  });
}

function mcpRequest(id, question) {
  return new Request("https://continuity.example/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "MCP-Protocol-Version": "2025-06-18",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method: "tools/call",
      params: { name: "continuity_answer_question", arguments: { question } },
    }),
  });
}

test("every public example and follow-up has a cited deterministic answer", async () => {
  assert.equal(VCS_DEMO_SUGGESTED_QUESTIONS.length, 3);
  assert.ok(VCS_DEMO_CLICKABLE_QUESTIONS.length >= 8);

  for (const question of VCS_DEMO_CLICKABLE_QUESTIONS) {
    const response = await queryPost(queryRequest(question));
    const body = await response.json();
    assert.equal(response.status, 200, question);
    assert.equal(body.answer.verdict, EXPECTED_VERDICTS.get(question), question);
    assert.notEqual(body.answer.verdict, "INSUFFICIENT_EVIDENCE", question);
    assert.ok(body.answer.evidence.length > 0, `${question} must cite evidence`);
    assert.ok(body.answer.answer.length > 40, `${question} must have a useful direct answer`);
    assert.doesNotMatch(body.answer.answer, /Day 24|\$28,000|\$12,000|vcs-demo-r1/i, question);
    assert.ok(body.answer.followUpQuestions.every((followUp) => VCS_DEMO_CLICKABLE_QUESTIONS.includes(followUp)), question);
    assert.ok(!body.answer.followUpQuestions.includes(question), `${question} must not link to itself`);
  }
});

test("the public MCP answers the same visible questions with verdict and citation parity", async () => {
  let id = 0;
  for (const question of VCS_DEMO_CLICKABLE_QUESTIONS) {
    const response = await mcpPost(mcpRequest(++id, question));
    const body = await response.json();
    const result = body.result?.structuredContent;
    assert.equal(response.status, 200, question);
    assert.equal(body.result?.isError, false, question);
    assert.equal(result?.verdict, EXPECTED_VERDICTS.get(question), question);
    assert.ok(result?.citations?.length > 0, `${question} must cite evidence through MCP`);
    assert.doesNotMatch(result?.answer ?? "", /Day 24|\$28,000|\$12,000|vcs-demo-r1/i, question);
  }
});
