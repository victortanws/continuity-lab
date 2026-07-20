import assert from "node:assert/strict";
import test from "node:test";

import { classifyRepositoryPath } from "../../lib/continuity/policy/default.ts";
import { routeEvidence } from "../../lib/continuity/routing/authority-router.ts";

function evidence(overrides = {}) {
  return {
    id: "EV-1",
    projectId: "project-a",
    sourceId: "SRC-1",
    sourceVersionId: "SRC-1@v1",
    title: "README.md",
    locator: "README.md",
    text: "A project statement.",
    score: 0.8,
    authority: "reference",
    ...overrides,
  };
}

test("path routing distinguishes intent, implementation, tests, archives, and evaluation material", () => {
  assert.equal(classifyRepositoryPath("docs/PROTOTYPE-CONTRACT.md").role, "intent");
  assert.equal(classifyRepositoryPath("src/story-engine.ts").role, "implementation");
  assert.equal(classifyRepositoryPath("tests/story-engine.test.ts").role, "test");
  assert.equal(classifyRepositoryPath("docs/archive/old-plan.md").role, "archive");
  assert.equal(classifyRepositoryPath("benchmarks/gold-key.json").role, "evaluation");
  assert.equal(classifyRepositoryPath("archive/old.md").role, "archive");
  assert.equal(classifyRepositoryPath("proposals/new.md").role, "proposal");
  assert.equal(classifyRepositoryPath("decisions/001.md").role, "decision");
  assert.equal(classifyRepositoryPath("tests/helper.ts").role, "test");
  assert.equal(classifyRepositoryPath("evals/case.md").role, "evaluation");
  assert.equal(classifyRepositoryPath("logs/run.md").role, "observation");
});

test("analysis routing enforces its evidence budget even with many contradictions", () => {
  const fragments = Array.from({ length: 30 }, (_, index) => [
    evidence({ id: `EV-${index}-YES`, claimKey: `claim-${index}`, polarity: "positive", score: 1 - index / 100 }),
    evidence({ id: `EV-${index}-NO`, claimKey: `claim-${index}`, polarity: "negative", score: 0.99 - index / 100 }),
  ]).flat();

  const result = routeEvidence(fragments, { projectId: "project-a", question: "Which claims conflict?" });

  assert.ok(result.evidence.length <= 24);
});

test("analysis routing excludes answer keys and preserves multiple evidence lanes", () => {
  const result = routeEvidence([
    evidence({ id: "EV-INTENT", title: "docs/PROTOTYPE-CONTRACT.md", locator: "docs/PROTOTYPE-CONTRACT.md", authority: "canon", score: 0.9 }),
    evidence({ id: "EV-CODE", title: "src/story-engine.ts", locator: "src/story-engine.ts", authority: "production", score: 0.55 }),
    evidence({ id: "EV-TEST", title: "tests/story-engine.test.ts", locator: "tests/story-engine.test.ts", authority: "production", score: 0.5 }),
    evidence({ id: "EV-GOLD", title: "benchmarks/gold-key.json", locator: "benchmarks/gold-key.json", text: "The expected answer is yes.", score: 1 }),
    evidence({ id: "EV-FOREIGN", projectId: "project-b", text: "private evidence", score: 1 }),
  ], { projectId: "project-a", question: "What is implemented and tested?" });

  assert.deepEqual(new Set(result.evidence.map((item) => item.id)), new Set(["EV-INTENT", "EV-CODE", "EV-TEST"]));
  assert.equal(result.evidence.some((item) => item.text.includes("expected answer")), false);
  assert.equal(result.evidence.some((item) => item.text.includes("private evidence")), false);
  assert.match(result.route.diagnostics.join("\n"), /Excluded 1 evaluation/i);
  assert.match(result.route.diagnostics.join("\n"), /cross-project/i);
});

test("a claimed complete corpus is not trusted without selected closed-world evidence", () => {
  const open = routeEvidence([
    evidence({ id: "EV-OPEN", title: "src/story-engine.ts", locator: "src/story-engine.ts", authority: "production" }),
  ], {
    projectId: "project-a",
    question: "Does a producer exist?",
    coverage: { scope: "repository snapshot", complete: true },
  });
  assert.equal(open.route.coverage.trustedComplete, false);

  const closed = routeEvidence([
    evidence({ id: "EV-CLOSED", title: "data/trigger-registry.json", locator: "data/trigger-registry.json", authority: "production", closedWorld: true }),
  ], {
    projectId: "project-a",
    question: "Does a producer exist?",
    coverage: { scope: "complete trigger registry", complete: true },
  });
  assert.equal(closed.route.coverage.trustedComplete, true);
  assert.deepEqual(closed.route.coverage.closedWorldEvidenceIds, ["EV-CLOSED"]);
});
