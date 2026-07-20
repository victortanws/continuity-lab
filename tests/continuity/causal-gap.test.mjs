import assert from "node:assert/strict";
import test from "node:test";

import { findCausalGaps } from "../../lib/continuity/causal-gap.ts";

function state(order, overrides = {}) {
  return {
    position: { axis: "beat", order },
    trueAtoms: [], falseAtoms: [], balances: [], permissions: [], knowledge: [], eventHistory: [], applications: [],
    ...overrides,
  };
}

function doorGraph(initialState) {
  return {
    version: "continuity.transition-graph.v1",
    projectId: "visual-sequence",
    projectRevision: "sequence-r1",
    plane: "observed",
    temporalAxis: "beat",
    initialState,
    rules: [{
      ruleId: "UNLOCK-AND-ENTER",
      label: "Use the key and enter",
      admission: "established",
      plane: "observed",
      activation: { kind: "invoked", actorKey: "ALICE", actionKey: "unlock", scopeKey: "DOOR-1" },
      conditions: [
        { id: "has-key", kind: "fact", atomKey: "alice-has-key", value: true },
        { id: "allowed", kind: "permission", actorKey: "ALICE", actionKey: "unlock", scopeKey: "DOOR-1" },
      ],
      effects: [
        { id: "open", kind: "set_fact", atomKey: "door-open", value: true },
        { id: "inside", kind: "set_fact", atomKey: "alice-inside", value: true },
      ],
      idempotency: { mode: "once", applicationKey: "door-1-entry" },
      window: { axis: "beat", earliest: 1, latest: 2, duration: 1 },
      evidenceIds: ["EV-KEY-RULE"],
    }],
    coverage: {
      completeTargetKeys: ["fact:door-open=true", "fact:alice-inside=true"],
      completeInitialDimensions: ["facts", "permissions"],
      evidenceIds: ["EV-TRANSITION-REGISTRY"],
      excludedSources: [], parseFailures: [],
    },
  };
}

test("adjacent pictures do not imply a cause when the required bridge is absent", () => {
  const before = state(1, { falseAtoms: ["door-open", "alice-inside"] });
  const after = state(2, { trueAtoms: ["door-open", "alice-inside"] });
  const [finding] = findCausalGaps(doorGraph(before), [
    { id: "PANEL-1", evidenceIds: ["EV-PANEL-1"], state: before },
    { id: "PANEL-2", evidenceIds: ["EV-PANEL-2"], state: after },
  ]);

  assert.equal(finding.status, "causal_gap");
  assert.ok(finding.proof.blockers.some((item) => item.conditionId === "has-key"));
  assert.ok(finding.proof.blockers.some((item) => item.conditionId === "allowed"));
});

test("one compatible transition must explain the whole observed delta", () => {
  const before = state(1, {
    trueAtoms: ["alice-has-key"],
    falseAtoms: ["door-open", "alice-inside"],
    permissions: [{ actorKey: "ALICE", actionKey: "unlock", scopeKey: "DOOR-1" }],
  });
  const after = state(2, {
    trueAtoms: ["alice-has-key", "door-open", "alice-inside"],
    permissions: [{ actorKey: "ALICE", actionKey: "unlock", scopeKey: "DOOR-1" }],
  });
  const [finding] = findCausalGaps(doorGraph(before), [
    { id: "DESCRIPTION-1", evidenceIds: ["EV-DESC-1"], state: before },
    { id: "DESCRIPTION-2", evidenceIds: ["EV-DESC-2"], state: after },
  ]);

  assert.equal(finding.status, "explained");
  assert.deepEqual(finding.proof.rulePath.map((step) => step.ruleId), ["UNLOCK-AND-ENTER"]);
  assert.equal(finding.targetKeys.length, 2);
});

test("an open image description does not turn an omitted permission into a revocation", () => {
  const custodyPermission = { actorKey: "CURATOR", actionKey: "release", scopeKey: "CRATE-17" };
  const before = state(1, { permissions: [custodyPermission] });
  const after = state(2, { permissions: [] });
  const [finding] = findCausalGaps({
    ...doorGraph(before),
    projectId: "museum-custody",
    rules: [],
    coverage: {
      completeTargetKeys: ["permission:CURATOR:release:CRATE-17=false"],
      completeInitialDimensions: ["permissions"],
      evidenceIds: ["EV-CUSTODY-REGISTRY"],
      excludedSources: [], parseFailures: [],
    },
  }, [
    { id: "PHOTO-1", evidenceIds: ["EV-PHOTO-1"], state: before },
    { id: "PHOTO-2", evidenceIds: ["EV-PHOTO-2"], state: after },
  ]);

  assert.equal(finding.status, "no_change");
  assert.deepEqual(finding.targetKeys, []);
});

test("an explicit custody revocation is audited symmetrically and requires its causal rule", () => {
  const custodyPermission = { actorKey: "CURATOR", actionKey: "release", scopeKey: "CRATE-17" };
  const before = state(1, { permissions: [custodyPermission] });
  const after = state(2, { permissions: [] });
  const graph = {
    ...doorGraph(before),
    projectId: "museum-custody",
    rules: [{
      ruleId: "REVOKE-ON-HOLD",
      label: "Revoke release authority when a conservation hold is entered",
      admission: "established",
      plane: "observed",
      activation: { kind: "automatic" },
      conditions: [{ id: "hold", kind: "fact", atomKey: "conservation-hold", value: true }],
      effects: [{ id: "revoke", kind: "revoke_permission", ...custodyPermission }],
      idempotency: { mode: "once", applicationKey: "revoke:crate-17" },
      window: { axis: "beat", earliest: 1, latest: 2, duration: 1 },
      evidenceIds: ["EV-HOLD-RULE"],
    }],
    coverage: {
      completeTargetKeys: ["permission:CURATOR:release:CRATE-17=false"],
      completeInitialDimensions: ["facts", "permissions"],
      evidenceIds: ["EV-CUSTODY-REGISTRY"],
      excludedSources: [], parseFailures: [],
    },
  };
  const snapshots = [
    { id: "RECORD-1", evidenceIds: ["EV-RECORD-1"], state: state(1, {
      trueAtoms: ["conservation-hold"], permissions: [custodyPermission],
    }) },
    {
      id: "RECORD-2",
      evidenceIds: ["EV-RECORD-2"],
      state: after,
      observationScope: { explicitAbsent: { permissions: [custodyPermission] } },
    },
  ];
  const [explained] = findCausalGaps({ ...graph, initialState: snapshots[0].state }, snapshots);
  assert.equal(explained.status, "explained");
  assert.deepEqual(explained.targetKeys, ["permission:CURATOR:release:CRATE-17=false"]);

  const [missing] = findCausalGaps({ ...graph, initialState: snapshots[0].state, rules: [] }, snapshots);
  assert.equal(missing.status, "causal_gap");
  assert.match(missing.proof.blockers[0].explanation, /No registered transition produces/i);
});

test("explicit record deletion can be represented as a false fact without inferring from silence", () => {
  const before = state(1, { trueAtoms: ["degree:student-4:waiver-active"] });
  const after = state(2, { falseAtoms: ["degree:student-4:waiver-active"] });
  const graph = {
    ...doorGraph(before),
    projectId: "degree-audit",
    rules: [{
      ruleId: "DELETE-EXPIRED-WAIVER",
      label: "Expire the waiver record",
      admission: "established",
      plane: "observed",
      activation: { kind: "automatic" },
      conditions: [],
      effects: [{ id: "delete", kind: "set_fact", atomKey: "degree:student-4:waiver-active", value: false }],
      idempotency: { mode: "once", applicationKey: "waiver-expiry" },
      window: { axis: "beat", earliest: 1, latest: 2, duration: 1 },
      evidenceIds: ["EV-WAIVER-POLICY"],
    }],
    coverage: {
      completeTargetKeys: ["fact:degree:student-4:waiver-active=false"],
      completeInitialDimensions: ["facts"],
      evidenceIds: ["EV-WAIVER-REGISTRY"], excludedSources: [], parseFailures: [],
    },
  };
  const [finding] = findCausalGaps(graph, [
    { id: "AUDIT-1", evidenceIds: ["EV-AUDIT-1"], state: before },
    { id: "AUDIT-2", evidenceIds: ["EV-AUDIT-2"], state: after },
  ]);
  assert.equal(finding.status, "explained");
  assert.deepEqual(finding.targetKeys, ["fact:degree:student-4:waiver-active=false"]);
});

test("a missing balance is unknown in an open snapshot but zero in an explicitly complete resource ledger", () => {
  const before = state(1, {
    balances: [{ accountKey: "ESCROW", resourceKey: "deposit", unit: "cent", amountMinor: "500" }],
  });
  const after = state(2, { balances: [] });
  const graph = {
    ...doorGraph(before),
    projectId: "escrow-ledger",
    rules: [{
      ruleId: "RETURN-DEPOSIT",
      label: "Return the complete escrow balance",
      admission: "established",
      plane: "observed",
      activation: { kind: "automatic" },
      conditions: [],
      effects: [{
        id: "outflow",
        kind: "external_outflow",
        fromAccountKey: "ESCROW",
        sinkKey: "DEPOSITOR",
        resourceKey: "deposit",
        unit: "cent",
        amountMinor: "500",
      }],
      idempotency: { mode: "once", applicationKey: "return:deposit" },
      window: { axis: "beat", earliest: 1, latest: 2, duration: 1 },
      evidenceIds: ["EV-ESCROW-RULE"],
    }],
    coverage: {
      completeTargetKeys: ["resource:ESCROW:deposit:cent:eq:0"],
      completeInitialDimensions: ["resources"],
      evidenceIds: ["EV-ESCROW-REGISTRY"], excludedSources: [], parseFailures: [],
    },
  };
  const [open] = findCausalGaps(graph, [
    { id: "LEDGER-1", evidenceIds: ["EV-LEDGER-1"], state: before },
    { id: "LEDGER-2", evidenceIds: ["EV-LEDGER-2"], state: after },
  ]);
  assert.equal(open.status, "no_change");

  const [complete] = findCausalGaps(graph, [
    { id: "LEDGER-1", evidenceIds: ["EV-LEDGER-1"], state: before },
    {
      id: "LEDGER-2",
      evidenceIds: ["EV-LEDGER-2"],
      state: after,
      observationScope: { completeDimensions: ["resources"] },
    },
  ]);
  assert.equal(complete.status, "explained");
  assert.deepEqual(complete.targetKeys, ["resource:ESCROW:deposit:cent:eq:0"]);
});

test("explicit forgotten knowledge and retracted events remain typed negative targets on one path", () => {
  const knowledge = { actorKey: "ANALYST", atomKey: "temporary-access-code" };
  const before = state(1, {
    knowledge: [knowledge],
    eventHistory: [{ eventKey: "TEMPORARY-ALERT", position: 1 }],
  });
  const after = state(2, { knowledge: [], eventHistory: [] });
  const graph = {
    ...doorGraph(before),
    projectId: "incident-ledger",
    rules: [{
      ruleId: "CLOSE-INCIDENT",
      label: "Retire temporary incident state",
      admission: "established",
      plane: "observed",
      activation: { kind: "automatic" },
      conditions: [],
      effects: [
        { id: "forget", kind: "forget", ...knowledge },
        { id: "retract", kind: "retract_event", eventKey: "TEMPORARY-ALERT" },
      ],
      idempotency: { mode: "once", applicationKey: "close:incident" },
      window: { axis: "beat", earliest: 1, latest: 2, duration: 1 },
      evidenceIds: ["EV-INCIDENT-CLOSE"],
    }],
    coverage: {
      completeTargetKeys: [
        "knowledge:ANALYST:temporary-access-code=false",
        "event:TEMPORARY-ALERT=not_occurred",
      ],
      completeInitialDimensions: ["knowledge", "history"],
      evidenceIds: ["EV-INCIDENT-REGISTRY"], excludedSources: [], parseFailures: [],
    },
  };
  const [finding] = findCausalGaps(graph, [
    { id: "INCIDENT-1", evidenceIds: ["EV-INCIDENT-1"], state: before },
    {
      id: "INCIDENT-2",
      evidenceIds: ["EV-INCIDENT-2"],
      state: after,
      observationScope: { explicitAbsent: { knowledge: [knowledge], events: ["TEMPORARY-ALERT"] } },
    },
  ]);
  assert.equal(finding.status, "explained");
  assert.deepEqual(finding.targetKeys, [
    "event:TEMPORARY-ALERT=not_occurred",
    "knowledge:ANALYST:temporary-access-code=false",
  ]);
});
