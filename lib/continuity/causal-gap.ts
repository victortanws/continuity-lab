import {
  evaluateTransitionGraph,
  targetKeyOf,
  type GraphState,
  type ReachabilityProof,
  type ReachabilityTargetLeaf,
  type StateDimension,
  type TransitionGraph,
} from "./reachability";

export type ObservedSnapshot = {
  id: string;
  /** Image region, page, row, line, or event record that supports this state. */
  evidenceIds: string[];
  state: GraphState;
  /**
   * Omission is unknown by default. A snapshot extractor must either state
   * that a whole dimension was observed or record an exact negative assertion
   * before absence can become a causal target.
   */
  observationScope?: {
    completeDimensions?: StateDimension[];
    explicitAbsent?: {
      facts?: string[];
      resources?: Array<Pick<GraphState["balances"][number], "accountKey" | "resourceKey" | "unit">>;
      permissions?: GraphState["permissions"];
      knowledge?: GraphState["knowledge"];
      events?: string[];
    };
  };
};

export type CausalGapFinding = {
  fromSnapshotId: string;
  toSnapshotId: string;
  status: "explained" | "proposed_bridge" | "causal_gap" | "unknown" | "no_change";
  targetKeys: string[];
  evidenceIds: string[];
  proof: ReachabilityProof | null;
  explanation: string;
};

/**
 * Compares adjacent, already entity-resolved observations and asks a
 * deterministic transition graph to account for every explicit new state at
 * once. Adjacency is never treated as causation. An image-capable ingestion
 * layer may create these snapshots, but it must retain region-level evidence
 * and uncertainty before calling this function.
 */
export function findCausalGaps(
  graph: TransitionGraph,
  snapshots: ObservedSnapshot[],
  options: { maxStates?: number } = {},
): CausalGapFinding[] {
  const ordered = snapshots.slice().sort((left, right) =>
    left.state.position.order - right.state.position.order || left.id.localeCompare(right.id));
  const findings: CausalGapFinding[] = [];
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const next = ordered[index];
    const evidenceIds = [...new Set([...previous.evidenceIds, ...next.evidenceIds])].sort();
    if (previous.state.position.axis !== graph.temporalAxis
      || next.state.position.axis !== graph.temporalAxis
      || next.state.position.order < previous.state.position.order) {
      findings.push({
        fromSnapshotId: previous.id,
        toSnapshotId: next.id,
        status: "unknown",
        targetKeys: [],
        evidenceIds,
        proof: null,
        explanation: "The adjacent observations do not share a valid ordered temporal axis.",
      });
      continue;
    }
    const targets = changedTargets(previous, next);
    if (!targets.length) {
      findings.push({
        fromSnapshotId: previous.id,
        toSnapshotId: next.id,
        status: "no_change",
        targetKeys: [],
        evidenceIds,
        proof: null,
        explanation: "No explicit state change was asserted between these observations.",
      });
      continue;
    }
    const target = targets.length === 1 ? targets[0] : { kind: "all" as const, targets };
    const proof = evaluateTransitionGraph({
      ...graph,
      initialState: structuredClone(previous.state),
    }, target, next.state.position.order, options);
    const status = proof.status === "reachable" ? "explained"
      : proof.status === "conditionally_reachable" ? "proposed_bridge"
      : proof.status === "unreachable_within_scope" ? "causal_gap"
      : "unknown";
    findings.push({
      fromSnapshotId: previous.id,
      toSnapshotId: next.id,
      status,
      targetKeys: targets.map(targetKeyOf),
      evidenceIds,
      proof,
      explanation: status === "explained"
        ? "The established transition graph accounts for the complete observed delta on one compatible path."
        : status === "proposed_bridge"
          ? "The observed delta is explainable only if a proposed transition is admitted."
          : status === "causal_gap"
            ? `The complete scoped graph cannot account for the observed delta: ${proof.blockers.map((item) => item.explanation).join(" ")}`
            : "The graph or source coverage is incomplete, so adjacency cannot establish the missing cause.",
    });
  }
  return findings;
}

function changedTargets(previousSnapshot: ObservedSnapshot, nextSnapshot: ObservedSnapshot): ReachabilityTargetLeaf[] {
  const previous = previousSnapshot.state;
  const next = nextSnapshot.state;
  const complete = new Set(nextSnapshot.observationScope?.completeDimensions ?? []);
  const explicitAbsent = nextSnapshot.observationScope?.explicitAbsent;
  const targets: ReachabilityTargetLeaf[] = [];
  for (const atomKey of next.trueAtoms) if (!previous.trueAtoms.includes(atomKey)) targets.push({ kind: "fact", atomKey, value: true });
  for (const atomKey of next.falseAtoms) if (!previous.falseAtoms.includes(atomKey)) targets.push({ kind: "fact", atomKey, value: false });
  for (const atomKey of previous.trueAtoms) {
    const explicitlyFalse = next.falseAtoms.includes(atomKey) || explicitAbsent?.facts?.includes(atomKey);
    if (!next.trueAtoms.includes(atomKey) && (explicitlyFalse || complete.has("facts"))) {
      targets.push({ kind: "fact", atomKey, value: false });
    }
  }
  for (const balance of next.balances) {
    const before = previous.balances.find((item) => item.accountKey === balance.accountKey && item.resourceKey === balance.resourceKey && item.unit === balance.unit);
    if (before?.amountMinor !== balance.amountMinor) targets.push({
      kind: "resource",
      accountKey: balance.accountKey,
      resourceKey: balance.resourceKey,
      unit: balance.unit,
      compare: "eq",
      amountMinor: balance.amountMinor,
    });
  }
  for (const balance of previous.balances) {
    const remains = next.balances.some((item) => item.accountKey === balance.accountKey
      && item.resourceKey === balance.resourceKey && item.unit === balance.unit);
    const explicitlyAbsent = explicitAbsent?.resources?.some((item) => item.accountKey === balance.accountKey
      && item.resourceKey === balance.resourceKey && item.unit === balance.unit);
    if (!remains && balance.amountMinor !== "0" && (explicitlyAbsent || complete.has("resources"))) {
      targets.push({
        kind: "resource",
        accountKey: balance.accountKey,
        resourceKey: balance.resourceKey,
        unit: balance.unit,
        compare: "eq",
        amountMinor: "0",
      });
    }
  }
  for (const permission of next.permissions) {
    if (!previous.permissions.some((item) => recordKey(item) === recordKey(permission))) targets.push({ kind: "permission", ...permission });
  }
  for (const permission of previous.permissions) {
    const removed = !next.permissions.some((item) => recordKey(item) === recordKey(permission));
    const explicitlyAbsent = explicitAbsent?.permissions?.some((item) => recordKey(item) === recordKey(permission));
    if (removed && (explicitlyAbsent || complete.has("permissions"))) {
      targets.push({ kind: "permission", ...permission, present: false });
    }
  }
  for (const knowledge of next.knowledge) {
    if (!previous.knowledge.some((item) => recordKey(item) === recordKey(knowledge))) targets.push({ kind: "knowledge", ...knowledge });
  }
  for (const knowledge of previous.knowledge) {
    const removed = !next.knowledge.some((item) => recordKey(item) === recordKey(knowledge));
    const explicitlyAbsent = explicitAbsent?.knowledge?.some((item) => recordKey(item) === recordKey(knowledge));
    if (removed && (explicitlyAbsent || complete.has("knowledge"))) {
      targets.push({ kind: "knowledge", ...knowledge, present: false });
    }
  }
  for (const event of next.eventHistory) {
    if (!previous.eventHistory.some((item) => item.eventKey === event.eventKey && item.position === event.position)) {
      targets.push({ kind: "event", eventKey: event.eventKey });
    }
  }
  const priorEvents = new Set(previous.eventHistory.map((event) => event.eventKey));
  const nextEvents = new Set(next.eventHistory.map((event) => event.eventKey));
  for (const eventKey of priorEvents) {
    if (nextEvents.has(eventKey)) continue;
    if (explicitAbsent?.events?.includes(eventKey) || complete.has("history")) {
      targets.push({ kind: "event", eventKey, state: "not_occurred" });
    }
  }
  return [...new Map(targets.map((target) => [targetKeyOf(target), target])).values()]
    .sort((left, right) => targetKeyOf(left).localeCompare(targetKeyOf(right)));
}

function recordKey(value: object): string {
  return JSON.stringify(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));
}
