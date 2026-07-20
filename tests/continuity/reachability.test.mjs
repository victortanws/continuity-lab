import assert from "node:assert/strict";
import test from "node:test";

import { evaluateTransitionGraph, REACHABILITY_LIMITS } from "../../lib/continuity/reachability.ts";

function state(overrides = {}) {
  return {
    position: { axis: "day", order: 8 },
    trueAtoms: [],
    falseAtoms: [],
    balances: [],
    permissions: [],
    knowledge: [],
    eventHistory: [],
    applications: [],
    ...overrides,
  };
}

function graph(overrides = {}) {
  return {
    version: "continuity.transition-graph.v1",
    projectId: "generic-project",
    projectRevision: "revision-1",
    plane: "implemented",
    temporalAxis: "day",
    initialState: state(),
    rules: [],
    coverage: {
      completeTargetKeys: [],
      completeInitialDimensions: [],
      excludedSources: [],
      parseFailures: [],
    },
    ...overrides,
  };
}

function paymentRule(overrides = {}) {
  return {
    ruleId: "PAY-SURGERY",
    label: "Authorize and settle the operation payment",
    admission: "established",
    plane: "implemented",
    activation: { kind: "invoked", actorKey: "FOUNDER", actionKey: "pay", scopeKey: "GRANDMA-SURGERY" },
    conditions: [
      { id: "cash", kind: "resource", accountKey: "COMPANY", resourceKey: "cash", unit: "usd-cent", compare: "gte", amountMinor: "4700000" },
      { id: "permission", kind: "permission", actorKey: "FOUNDER", actionKey: "pay", scopeKey: "GRANDMA-SURGERY" },
    ],
    effects: [
      { id: "debit", kind: "external_outflow", fromAccountKey: "COMPANY", sinkKey: "HOSPITAL", resourceKey: "cash", unit: "usd-cent", amountMinor: "4700000" },
      { id: "funded", kind: "set_fact", atomKey: "grandma-surgery-funded", value: true },
      { id: "scene", kind: "emit_event", eventKey: "THE-PAYMENT" },
    ],
    idempotency: { mode: "once", applicationKey: "payment:grandma-surgery" },
    window: { axis: "day", earliest: 8, latest: 24, duration: 0 },
    evidenceIds: ["EV-PAYMENT-RULE"],
    ...overrides,
  };
}

test("a cash threshold does not authorize the VCS surgery payment", () => {
  const result = evaluateTransitionGraph(graph({
    initialState: state({ balances: [{ accountKey: "COMPANY", resourceKey: "cash", unit: "usd-cent", amountMinor: "4700000" }] }),
    rules: [paymentRule()],
    coverage: {
      completeTargetKeys: ["fact:grandma-surgery-funded=true"],
      completeInitialDimensions: ["facts", "resources", "permissions"],
      excludedSources: [], parseFailures: [],
    },
  }), { kind: "fact", atomKey: "grandma-surgery-funded", value: true }, 24);

  assert.equal(result.status, "unreachable_within_scope");
  assert.ok(result.blockers.some((blocker) => blocker.kind === "permission"));
});

test("a complete target with no registered producer surfaces a causal bridge gap", () => {
  const result = evaluateTransitionGraph(graph({
    initialState: state({ falseAtoms: ["door-open"] }),
    rules: [],
    coverage: {
      completeTargetKeys: ["fact:door-open=true"],
      completeInitialDimensions: ["facts"],
      evidenceIds: ["EV-COMPLETE-TRANSITION-REGISTRY"],
      excludedSources: [], parseFailures: [],
    },
  }), { kind: "fact", atomKey: "door-open", value: true }, 12);

  assert.equal(result.status, "unreachable_within_scope");
  assert.deepEqual(result.blockers.map((item) => item.ruleId), ["coverage:no-producer:fact:door-open=true"]);
  assert.deepEqual(result.blockers[0].evidenceIds, ["EV-COMPLETE-TRANSITION-REGISTRY"]);
});

test("permission plus sufficient funds yields a server-owned once-only path", () => {
  const result = evaluateTransitionGraph(graph({
    initialState: state({
      balances: [{ accountKey: "COMPANY", resourceKey: "cash", unit: "usd-cent", amountMinor: "4700000" }],
      permissions: [{ actorKey: "FOUNDER", actionKey: "pay", scopeKey: "GRANDMA-SURGERY" }],
    }),
    rules: [paymentRule()],
  }), { kind: "fact", atomKey: "grandma-surgery-funded", value: true }, 24);

  assert.equal(result.status, "reachable");
  assert.deepEqual(result.rulePath.map((step) => step.ruleId), ["PAY-SURGERY"]);
  assert.deepEqual(result.rulePath[0].evidenceIds, ["EV-PAYMENT-RULE"]);
});

test("one balance cannot fund two incompatible branches", () => {
  const surgery = paymentRule();
  const investment = paymentRule({
    ruleId: "MAKE-INVESTMENT",
    label: "Make the investment",
    activation: { kind: "invoked", actorKey: "FOUNDER", actionKey: "invest", scopeKey: "SEED-ROUND" },
    conditions: [
      { id: "cash", kind: "resource", accountKey: "COMPANY", resourceKey: "cash", unit: "usd-cent", compare: "gte", amountMinor: "4700000" },
      { id: "permission", kind: "permission", actorKey: "FOUNDER", actionKey: "invest", scopeKey: "SEED-ROUND" },
    ],
    effects: [
      { id: "debit", kind: "external_outflow", fromAccountKey: "COMPANY", sinkKey: "INVESTOR", resourceKey: "cash", unit: "usd-cent", amountMinor: "4700000" },
      { id: "invested", kind: "set_fact", atomKey: "investment-funded", value: true },
    ],
    idempotency: { mode: "once", applicationKey: "payment:investment" },
    evidenceIds: ["EV-INVESTMENT-RULE"],
  });
  const finish = {
    ruleId: "BOTH-FUNDED",
    label: "Both obligations are complete",
    admission: "established",
    plane: "implemented",
    activation: { kind: "automatic" },
    conditions: [
      { id: "surgery", kind: "fact", atomKey: "grandma-surgery-funded", value: true },
      { id: "investment", kind: "fact", atomKey: "investment-funded", value: true },
    ],
    effects: [{ id: "complete", kind: "set_fact", atomKey: "both-funded", value: true }],
    idempotency: { mode: "once", applicationKey: "both-funded" },
    window: { axis: "day", earliest: 8, latest: 24, duration: 0 },
    evidenceIds: ["EV-BOTH-RULE"],
  };
  const result = evaluateTransitionGraph(graph({
    initialState: state({
      balances: [{ accountKey: "COMPANY", resourceKey: "cash", unit: "usd-cent", amountMinor: "4700000" }],
      permissions: [
        { actorKey: "FOUNDER", actionKey: "pay", scopeKey: "GRANDMA-SURGERY" },
        { actorKey: "FOUNDER", actionKey: "invest", scopeKey: "SEED-ROUND" },
      ],
    }),
    rules: [surgery, investment, finish],
    coverage: {
      completeTargetKeys: ["fact:both-funded=true"],
      completeInitialDimensions: ["facts", "resources", "permissions"],
      excludedSources: [], parseFailures: [],
    },
  }), { kind: "fact", atomKey: "both-funded", value: true }, 24);

  assert.equal(result.status, "unreachable_within_scope");
});

test("an unknown fact is not treated as explicitly false", () => {
  const result = evaluateTransitionGraph(graph({
    rules: [{
      ...paymentRule({
        ruleId: "OPEN-GATE",
        label: "Open an unsealed gate",
        activation: { kind: "automatic" },
        conditions: [{ id: "unsealed", kind: "fact", atomKey: "gate-sealed", value: false }],
        effects: [{ id: "opened", kind: "set_fact", atomKey: "gate-open", value: true }],
        idempotency: { mode: "once", applicationKey: "gate-open" },
        evidenceIds: ["EV-GATE-RULE"],
      }),
    }],
    coverage: {
      completeTargetKeys: [], completeInitialDimensions: [], excludedSources: [], parseFailures: ["gate state unresolved"],
    },
  }), { kind: "fact", atomKey: "gate-open", value: true }, 24);

  assert.equal(result.status, "unknown");
  assert.ok(result.blockers.some((blocker) => blocker.conditionId === "unsealed"));
});

test("a proposed producer yields conditional rather than established reachability", () => {
  const result = evaluateTransitionGraph(graph({
    initialState: state({ falseAtoms: ["gate-open"] }),
    rules: [{
      ...paymentRule({
        ruleId: "PROPOSE-GATE-LEVER",
        label: "Add a gate lever",
        admission: "proposed",
        activation: { kind: "automatic" },
        conditions: [],
        effects: [{ id: "opened", kind: "set_fact", atomKey: "gate-open", value: true }],
        idempotency: { mode: "once", applicationKey: "gate-lever" },
        evidenceIds: ["EV-GATE-PROPOSAL"],
      }),
    }],
  }), { kind: "fact", atomKey: "gate-open", value: true }, 24);

  assert.equal(result.status, "conditionally_reachable");
  assert.deepEqual(result.assumptions, ["Admit proposed transition PROPOSE-GATE-LEVER."]);
});

test("configured deployment intent does not prove implemented reachability", () => {
  const result = evaluateTransitionGraph(graph({
    plane: "implemented",
    rules: [{
      ...paymentRule({
        ruleId: "DEPLOY-CANARY",
        label: "Deploy canary",
        plane: "configured",
        activation: { kind: "automatic" },
        conditions: [],
        effects: [{ id: "live", kind: "set_fact", atomKey: "canary-live", value: true }],
        idempotency: { mode: "once", applicationKey: "deploy-canary" },
        evidenceIds: ["EV-DESIRED-CONFIG"],
      }),
    }],
  }), { kind: "fact", atomKey: "canary-live", value: true }, 24);

  assert.equal(result.status, "unknown");
  assert.match(result.diagnostics.join("\n"), /execution planes/i);
});

test("a revocation effect can establish an explicit negative permission target", () => {
  const permission = { actorKey: "OPERATOR", actionKey: "release", scopeKey: "BATCH-9" };
  const result = evaluateTransitionGraph(graph({
    initialState: state({ permissions: [permission] }),
    rules: [{
      ...paymentRule({
        ruleId: "REVOKE-RELEASE",
        label: "Revoke release after a failed cold-chain check",
        activation: { kind: "automatic" },
        conditions: [],
        effects: [{ id: "revoke", kind: "revoke_permission", ...permission }],
        idempotency: { mode: "once", applicationKey: "revoke:batch-9" },
        evidenceIds: ["EV-COLD-CHAIN-RULE"],
      }),
    }],
  }), { kind: "permission", ...permission, present: false }, 24);

  assert.equal(result.status, "reachable");
  assert.deepEqual(result.rulePath.map((step) => step.ruleId), ["REVOKE-RELEASE"]);
});

test("reachability rejects oversized graphs and search budgets before state expansion", () => {
  const oversized = graph({
    rules: Array.from({ length: REACHABILITY_LIMITS.maxRules + 1 }, (_, index) => paymentRule({
      ruleId: `RULE-${index}`,
      idempotency: { mode: "once", applicationKey: `rule:${index}` },
    })),
  });
  const graphResult = evaluateTransitionGraph(oversized, { kind: "fact", atomKey: "goal", value: true }, 24);
  assert.equal(graphResult.status, "unknown");
  assert.equal(graphResult.search.statesExplored, 0);
  assert.match(graphResult.diagnostics.join("\n"), /rule structural limit/i);

  const budgetResult = evaluateTransitionGraph(
    graph(),
    { kind: "fact", atomKey: "goal", value: true },
    24,
    { maxStates: REACHABILITY_LIMITS.maxStates + 1 },
  );
  assert.equal(budgetResult.status, "unknown");
  assert.match(budgetResult.diagnostics.join("\n"), /maxStates/i);
});

test("a chain-of-custody handoff needs the named receiver and matching seal state", () => {
  const custodyGraph = graph({
    initialState: state({
      trueAtoms: ["seal:S-17-intact"],
      permissions: [{ actorKey: "CUSTODIAN-9", actionKey: "accept", scopeKey: "SPECIMEN-42" }],
    }),
    rules: [{
      ...paymentRule({
        ruleId: "ACCEPT-SPECIMEN",
        label: "Accept sealed specimen",
        activation: { kind: "invoked", actorKey: "CUSTODIAN-9", actionKey: "accept", scopeKey: "SPECIMEN-42" },
        conditions: [
          { id: "seal", kind: "fact", atomKey: "seal:S-17-intact", value: true },
          { id: "receiver", kind: "permission", actorKey: "CUSTODIAN-9", actionKey: "accept", scopeKey: "SPECIMEN-42" },
        ],
        effects: [{ id: "receipt", kind: "emit_event", eventKey: "SPECIMEN-42-ACCEPTED" }],
        idempotency: { mode: "once", applicationKey: "handoff:SPECIMEN-42" },
        evidenceIds: ["EV-CUSTODY-PROCEDURE", "EV-SEAL-REGISTER"],
      }),
    }],
  });
  const result = evaluateTransitionGraph(custodyGraph, { kind: "event", eventKey: "SPECIMEN-42-ACCEPTED" }, 24);

  assert.equal(result.status, "reachable");
  assert.deepEqual(result.rulePath[0].evidenceIds, ["EV-CUSTODY-PROCEDURE", "EV-SEAL-REGISTER"]);
});

test("time axes, future rules, and partial compilation remain conservative", () => {
  const wrongAxis = evaluateTransitionGraph(graph({
    initialState: state({ position: { axis: "chapter", order: 8 } }),
  }), { kind: "fact", atomKey: "done", value: true }, 24);
  assert.equal(wrongAxis.status, "unknown");
  assert.match(wrongAxis.diagnostics.join("\n"), /temporal axis/i);

  const future = evaluateTransitionGraph(graph({
    rules: [{
      ...paymentRule({
        ruleId: "DAY-25-EVENT",
        label: "A future event",
        activation: { kind: "automatic" },
        conditions: [],
        effects: [{ id: "done", kind: "set_fact", atomKey: "done", value: true }],
        window: { axis: "day", earliest: 25, latest: 30, duration: 0 },
        evidenceIds: ["EV-FUTURE"],
      }),
    }],
    coverage: {
      completeTargetKeys: ["fact:done=true"], completeInitialDimensions: ["facts"], excludedSources: [], parseFailures: [],
    },
  }), { kind: "fact", atomKey: "done", value: true }, 24);
  assert.equal(future.status, "unreachable_within_scope");

  const partial = evaluateTransitionGraph(graph({
    coverage: {
      completeTargetKeys: ["fact:done=true"], completeInitialDimensions: ["facts"], excludedSources: ["corrupt.pdf"], parseFailures: [],
    },
  }), { kind: "fact", atomKey: "done", value: true }, 24);
  assert.equal(partial.status, "unknown");
});
