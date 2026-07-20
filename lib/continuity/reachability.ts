export type ExecutionPlane = "normative" | "configured" | "implemented" | "observed";
export type GraphAdmission = "established" | "proposed" | "conflicted" | "unknown";
export type StateDimension = "facts" | "resources" | "permissions" | "knowledge" | "history";

export const REACHABILITY_LIMITS = Object.freeze({
  maxRules: 512,
  maxConditionsPerRule: 64,
  maxEffectsPerRule: 64,
  maxEvidenceIdsPerRule: 128,
  maxStateRecordsPerDimension: 4_096,
  maxTargetLeaves: 128,
  maxIdentifierBytes: 512,
  maxStates: 25_000,
  maxHorizonDelta: 1_000_000,
} as const);

export type FactCondition = { id: string; kind: "fact"; atomKey: string; value: boolean };
export type ResourceCondition = {
  id: string;
  kind: "resource";
  accountKey: string;
  resourceKey: string;
  unit: string;
  compare: "gte" | "lte" | "eq";
  amountMinor: string;
};
export type PermissionCondition = {
  id: string;
  kind: "permission";
  actorKey: string;
  actionKey: string;
  scopeKey: string;
};
export type KnowledgeCondition = { id: string; kind: "knowledge"; actorKey: string; atomKey: string };
export type EventCondition = { id: string; kind: "event"; eventKey: string; state: "occurred" | "not_occurred" };
export type TransitionCondition =
  | FactCondition
  | ResourceCondition
  | PermissionCondition
  | KnowledgeCondition
  | EventCondition;

export type TransitionEffect =
  | { id: string; kind: "set_fact"; atomKey: string; value: boolean }
  | {
      id: string;
      kind: "transfer";
      fromAccountKey: string;
      toAccountKey: string;
      resourceKey: string;
      unit: string;
      amountMinor: string;
    }
  | {
      id: string;
      kind: "external_inflow";
      sourceKey: string;
      toAccountKey: string;
      resourceKey: string;
      unit: string;
      amountMinor: string;
    }
  | {
      id: string;
      kind: "external_outflow";
      fromAccountKey: string;
      sinkKey: string;
      resourceKey: string;
      unit: string;
      amountMinor: string;
    }
  | {
      id: string;
      kind: "grant_permission" | "revoke_permission";
      actorKey: string;
      actionKey: string;
      scopeKey: string;
    }
  | { id: string; kind: "learn"; actorKey: string; atomKey: string }
  | { id: string; kind: "forget"; actorKey: string; atomKey: string }
  | { id: string; kind: "emit_event" | "retract_event"; eventKey: string };

export type TransitionRule = {
  ruleId: string;
  label: string;
  admission: GraphAdmission;
  plane: ExecutionPlane;
  activation:
    | { kind: "automatic" }
    | { kind: "invoked"; actorKey: string; actionKey: string; scopeKey: string };
  conditions: TransitionCondition[];
  effects: TransitionEffect[];
  idempotency:
    | { mode: "once"; applicationKey: string }
    | { mode: "bounded_repeat"; applicationKey: string; maxApplications: number; minPositionGap: number };
  window: { axis: string; earliest?: number; latest?: number; duration: number };
  evidenceIds: string[];
};

export type GraphState = {
  position: { axis: string; order: number };
  trueAtoms: string[];
  falseAtoms: string[];
  balances: Array<{ accountKey: string; resourceKey: string; unit: string; amountMinor: string }>;
  permissions: Array<{ actorKey: string; actionKey: string; scopeKey: string }>;
  knowledge: Array<{ actorKey: string; atomKey: string }>;
  eventHistory: Array<{ eventKey: string; position: number }>;
  applications: Array<{ applicationKey: string; count: number; lastPosition: number }>;
};

export type ReachabilityTargetLeaf =
  | { kind: "fact"; atomKey: string; value: boolean }
  | { kind: "event"; eventKey: string; state?: "occurred" | "not_occurred" }
  | { kind: "resource"; accountKey: string; resourceKey: string; unit: string; compare: "gte" | "lte" | "eq"; amountMinor: string }
  | { kind: "permission"; actorKey: string; actionKey: string; scopeKey: string; present?: boolean }
  | { kind: "knowledge"; actorKey: string; atomKey: string; present?: boolean };

export type ReachabilityTarget = ReachabilityTargetLeaf | { kind: "all"; targets: ReachabilityTargetLeaf[] };

export type TransitionGraph = {
  version: "continuity.transition-graph.v1";
  projectId: string;
  projectRevision: string;
  plane: ExecutionPlane;
  temporalAxis: string;
  initialState: GraphState;
  rules: TransitionRule[];
  coverage: {
    completeTargetKeys: string[];
    completeInitialDimensions: StateDimension[];
    /** Evidence that establishes the declared closed-world boundary itself. */
    evidenceIds?: string[];
    excludedSources: string[];
    parseFailures: string[];
  };
};

export type ReachabilityProof = {
  status: "reachable" | "conditionally_reachable" | "unreachable_within_scope" | "unknown";
  graphRevision: string;
  plane: ExecutionPlane;
  targetKey: string;
  rulePath: Array<{
    ruleId: string;
    at: number;
    beforeStateHash: string;
    afterStateHash: string;
    evidenceIds: string[];
  }>;
  blockers: Array<{ ruleId: string; conditionId: string; kind: TransitionCondition["kind"]; explanation: string; evidenceIds: string[] }>;
  assumptions: string[];
  diagnostics: string[];
  search: { complete: boolean; statesExplored: number; truncated: boolean };
};

type SearchNode = { state: GraphState; path: ReachabilityProof["rulePath"]; proposedRuleIds: string[] };

export function evaluateTransitionGraph(
  graph: TransitionGraph,
  target: ReachabilityTarget,
  horizon: number,
  options: { maxStates?: number } = {},
): ReachabilityProof {
  const envelopeDiagnostics = validateStructuralEnvelope(graph, target, horizon, options.maxStates);
  const targetKey = envelopeDiagnostics.length ? "invalid:target" : targetKeyOf(target);
  if (envelopeDiagnostics.length) return unknownProof(graph, targetKey, envelopeDiagnostics);
  const diagnostics = validateGraph(graph, horizon);
  if (diagnostics.length) return unknownProof(graph, targetKey, diagnostics);

  const maxStates = options.maxStates ?? 10_000;
  const established = searchGraph(graph, target, horizon, false, maxStates);
  if (established.reached) {
    return {
      status: "reachable",
      graphRevision: graph.projectRevision,
      plane: graph.plane,
      targetKey,
      rulePath: established.node.path,
      blockers: [],
      assumptions: [],
      diagnostics: [],
      search: established.search,
    };
  }
  if (established.search.truncated) {
    return {
      ...unknownProof(graph, targetKey, ["The deterministic state search reached its configured limit."]),
      search: established.search,
    };
  }

  const withProposals = searchGraph(graph, target, horizon, true, maxStates);
  if (withProposals.reached) {
    return {
      status: "conditionally_reachable",
      graphRevision: graph.projectRevision,
      plane: graph.plane,
      targetKey,
      rulePath: withProposals.node.path,
      blockers: [],
      assumptions: withProposals.node.proposedRuleIds.map((ruleId) => `Admit proposed transition ${ruleId}.`),
      diagnostics: [],
      search: withProposals.search,
    };
  }
  if (withProposals.search.truncated) {
    return {
      ...unknownProof(graph, targetKey, ["The proposal-inclusive state search reached its configured limit."]),
      search: withProposals.search,
    };
  }

  const blockers = findBlockers(graph, established.frontier, horizon, target);
  const exactTargetCovered = graph.coverage.completeTargetKeys.includes(targetKey)
    || (target.kind === "all" && target.targets.every((item) => graph.coverage.completeTargetKeys.includes(targetKeyOf(item))));
  const requiredDimensions = requiredCoverageDimensions(graph, target);
  const initialStateCovered = requiredDimensions.every((dimension) =>
    graph.coverage.completeInitialDimensions.includes(dimension));
  const exhaustive = exactTargetCovered
    && initialStateCovered
    && graph.coverage.excludedSources.length === 0
    && graph.coverage.parseFailures.length === 0
    && !graph.rules.some((rule) => rule.admission === "conflicted" || rule.admission === "unknown");
  return {
    status: exhaustive ? "unreachable_within_scope" : "unknown",
    graphRevision: graph.projectRevision,
    plane: graph.plane,
    targetKey,
    rulePath: [],
    blockers,
    assumptions: [],
    diagnostics: exhaustive ? [] : ["The compiled graph does not establish complete coverage for this target and state dimension."],
    search: established.search,
  };
}

function validateStructuralEnvelope(
  graph: TransitionGraph,
  target: ReachabilityTarget,
  horizon: number,
  requestedMaxStates: number | undefined,
): string[] {
  const issues: string[] = [];
  if (!graph || typeof graph !== "object") return ["The transition graph is not an object."];
  if (!Array.isArray(graph.rules) || graph.rules.length > REACHABILITY_LIMITS.maxRules) {
    return [`The transition graph exceeds the ${REACHABILITY_LIMITS.maxRules}-rule structural limit.`];
  }
  const targetLeavesCount = target && typeof target === "object" && target.kind === "all"
    ? Array.isArray(target.targets) ? target.targets.length : REACHABILITY_LIMITS.maxTargetLeaves + 1
    : target && typeof target === "object" ? 1 : REACHABILITY_LIMITS.maxTargetLeaves + 1;
  if (targetLeavesCount < 1 || targetLeavesCount > REACHABILITY_LIMITS.maxTargetLeaves) {
    issues.push(`The reachability target exceeds the ${REACHABILITY_LIMITS.maxTargetLeaves}-leaf structural limit.`);
  }
  const maxStates = requestedMaxStates ?? 10_000;
  if (!Number.isSafeInteger(maxStates) || maxStates < 1 || maxStates > REACHABILITY_LIMITS.maxStates) {
    issues.push(`maxStates must be between 1 and ${REACHABILITY_LIMITS.maxStates}.`);
  }
  if (!Number.isSafeInteger(horizon)
    || !Number.isSafeInteger(graph.initialState?.position?.order)
    || horizon - graph.initialState.position.order > REACHABILITY_LIMITS.maxHorizonDelta) {
    issues.push(`The reachability horizon exceeds the ${REACHABILITY_LIMITS.maxHorizonDelta}-position structural limit.`);
  }
  const stateCollections: Array<[string, unknown]> = [
    ["trueAtoms", graph.initialState?.trueAtoms],
    ["falseAtoms", graph.initialState?.falseAtoms],
    ["balances", graph.initialState?.balances],
    ["permissions", graph.initialState?.permissions],
    ["knowledge", graph.initialState?.knowledge],
    ["eventHistory", graph.initialState?.eventHistory],
    ["applications", graph.initialState?.applications],
  ];
  for (const [name, collection] of stateCollections) {
    if (!Array.isArray(collection) || collection.length > REACHABILITY_LIMITS.maxStateRecordsPerDimension) {
      issues.push(`Initial ${name} exceeds its structural limit.`);
    }
  }
  const coverageCollections: Array<[string, unknown, number]> = [
    ["coverage.completeTargetKeys", graph.coverage?.completeTargetKeys, 1_024],
    ["coverage.completeInitialDimensions", graph.coverage?.completeInitialDimensions, 5],
    ["coverage.evidenceIds", graph.coverage?.evidenceIds ?? [], REACHABILITY_LIMITS.maxEvidenceIdsPerRule],
    ["coverage.excludedSources", graph.coverage?.excludedSources, 256],
    ["coverage.parseFailures", graph.coverage?.parseFailures, 256],
  ];
  for (const [name, collection, maximum] of coverageCollections) {
    if (!Array.isArray(collection) || collection.length > maximum) {
      issues.push(`${name} exceeds its structural limit.`);
    }
  }
  for (const rule of graph.rules) {
    if (!Array.isArray(rule.conditions) || rule.conditions.length > REACHABILITY_LIMITS.maxConditionsPerRule) {
      issues.push(`Transition ${String(rule.ruleId)} exceeds its condition limit.`);
    }
    if (!Array.isArray(rule.effects) || rule.effects.length > REACHABILITY_LIMITS.maxEffectsPerRule) {
      issues.push(`Transition ${String(rule.ruleId)} exceeds its effect limit.`);
    }
    if (!Array.isArray(rule.evidenceIds) || rule.evidenceIds.length > REACHABILITY_LIMITS.maxEvidenceIdsPerRule) {
      issues.push(`Transition ${String(rule.ruleId)} exceeds its evidence-reference limit.`);
    }
    if (typeof rule.ruleId !== "string" || byteLength(rule.ruleId) > REACHABILITY_LIMITS.maxIdentifierBytes) {
      issues.push("A transition rule ID exceeds its structural limit.");
    }
    if (issues.length >= 32) break;
  }
  return [...new Set(issues)].slice(0, 32);
}

function searchGraph(
  graph: TransitionGraph,
  target: ReachabilityTarget,
  horizon: number,
  includeProposals: boolean,
  maxStates: number,
): { reached: boolean; node: SearchNode; frontier: SearchNode[]; search: ReachabilityProof["search"] } {
  const initial: SearchNode = { state: normalizeState(graph.initialState), path: [], proposedRuleIds: [] };
  const queue: SearchNode[] = [initial];
  const visited = new Set<string>();
  const frontier: SearchNode[] = [];
  let statesExplored = 0;

  while (queue.length && statesExplored < maxStates) {
    queue.sort((left, right) => left.state.position.order - right.state.position.order
      || left.path.length - right.path.length
      || left.path.map((step) => step.ruleId).join("\u0000").localeCompare(right.path.map((step) => step.ruleId).join("\u0000")));
    const node = queue.shift()!;
    const signature = stateSignature(node.state);
    if (visited.has(signature)) continue;
    visited.add(signature);
    statesExplored += 1;
    if (targetReached(node.state, target)) {
      return { reached: true, node, frontier, search: { complete: true, statesExplored, truncated: false } };
    }

    let advanced = false;
    for (const rule of graph.rules.slice().sort((a, b) => a.ruleId.localeCompare(b.ruleId))) {
      if (rule.admission !== "established" && !(includeProposals && rule.admission === "proposed")) continue;
      if (!ruleAvailable(rule, node.state, horizon)) continue;
      if (!rule.conditions.every((condition) => conditionSatisfied(condition, node.state))) continue;
      const nextState = applyRule(rule, node.state);
      if (!nextState) continue;
      advanced = true;
      const beforeStateHash = stableStateHash(node.state);
      const afterStateHash = stableStateHash(nextState);
      queue.push({
        state: nextState,
        path: [...node.path, {
          ruleId: rule.ruleId,
          at: node.state.position.order,
          beforeStateHash,
          afterStateHash,
          evidenceIds: [...new Set(rule.evidenceIds)].sort(),
        }],
        proposedRuleIds: rule.admission === "proposed"
          ? [...new Set([...node.proposedRuleIds, rule.ruleId])]
          : node.proposedRuleIds,
      });
    }

    const nextTime = nextRelevantPosition(graph.rules, node.state.position.order, horizon);
    if (nextTime !== null) {
      advanced = true;
      queue.push({ ...node, state: { ...node.state, position: { ...node.state.position, order: nextTime } } });
    }
    if (!advanced) frontier.push(node);
  }

  return {
    reached: false,
    node: initial,
    frontier: frontier.length ? frontier : queue.slice(0, 100),
    search: { complete: queue.length === 0, statesExplored, truncated: queue.length > 0 },
  };
}

function validateGraph(graph: TransitionGraph, horizon: number): string[] {
  const issues: string[] = [];
  if (graph.initialState.position.axis !== graph.temporalAxis) issues.push("The initial state uses a different temporal axis from the graph.");
  if (!Number.isSafeInteger(horizon) || horizon < graph.initialState.position.order) issues.push("The target horizon is invalid or precedes the initial state.");
  if (graph.initialState.trueAtoms.some((atom) => graph.initialState.falseAtoms.includes(atom))) {
    issues.push("The initial state asserts the same fact as both true and false.");
  }
  const balanceFrames = new Set<string>();
  for (const balance of graph.initialState.balances) {
    const frame = `${balance.accountKey}\u0000${balance.resourceKey}`;
    if (balanceFrames.has(frame) || parseAmount(balance.amountMinor) === null) {
      issues.push("The initial resource state contains an invalid or ambiguous balance.");
    }
    balanceFrames.add(frame);
  }
  if (graph.initialState.eventHistory.some((event) => !Number.isSafeInteger(event.position))) {
    issues.push("The initial event history contains an invalid position.");
  }
  const ids = new Set<string>();
  for (const rule of graph.rules) {
    if (!rule.ruleId.trim() || ids.has(rule.ruleId)) issues.push(`Duplicate or empty transition rule ID: ${rule.ruleId || "(empty)"}`);
    ids.add(rule.ruleId);
    if (rule.plane !== graph.plane) issues.push(`Transition ${rule.ruleId} crosses execution planes.`);
    if (rule.window.axis !== graph.temporalAxis) issues.push(`Transition ${rule.ruleId} uses a different temporal axis.`);
    if (!Number.isSafeInteger(rule.window.duration) || rule.window.duration < 0) issues.push(`Transition ${rule.ruleId} has an invalid duration.`);
    if (!rule.effects.length || !rule.evidenceIds.length) issues.push(`Transition ${rule.ruleId} lacks effects or evidence.`);
    const activation = rule.activation;
    if (activation.kind === "invoked") {
      const hasPermission = rule.conditions.some((condition) => condition.kind === "permission"
        && condition.actorKey === activation.actorKey
        && condition.actionKey === activation.actionKey
        && condition.scopeKey === activation.scopeKey);
      if (!hasPermission) issues.push(`Invoked transition ${rule.ruleId} lacks its matching permission condition.`);
    }
    if (rule.idempotency.mode === "bounded_repeat" && (
      !Number.isSafeInteger(rule.idempotency.maxApplications)
      || rule.idempotency.maxApplications < 1
      || !Number.isSafeInteger(rule.idempotency.minPositionGap)
      || rule.idempotency.minPositionGap < 0
    )) issues.push(`Transition ${rule.ruleId} has an invalid repeat bound.`);
    for (const condition of rule.conditions) {
      if (condition.kind === "resource" && parseAmount(condition.amountMinor) === null) issues.push(`Transition ${rule.ruleId} has an invalid resource condition.`);
    }
    for (const effect of rule.effects) {
      if ((effect.kind === "transfer" || effect.kind === "external_inflow" || effect.kind === "external_outflow")
        && parseAmount(effect.amountMinor) === null) issues.push(`Transition ${rule.ruleId} has an invalid resource effect.`);
    }
  }
  return [...new Set(issues)];
}

function normalizeState(state: GraphState): GraphState {
  return {
    ...state,
    trueAtoms: [...new Set(state.trueAtoms)].sort(),
    falseAtoms: [...new Set(state.falseAtoms)].filter((atom) => !state.trueAtoms.includes(atom)).sort(),
    balances: state.balances.slice().sort(balanceCompare),
    permissions: dedupeRecords(state.permissions, permissionKey),
    knowledge: dedupeRecords(state.knowledge, knowledgeKey),
    eventHistory: state.eventHistory.slice().sort((a, b) => a.position - b.position || a.eventKey.localeCompare(b.eventKey)),
    applications: state.applications.slice().sort((a, b) => a.applicationKey.localeCompare(b.applicationKey)),
  };
}

function ruleAvailable(rule: TransitionRule, state: GraphState, horizon: number): boolean {
  const position = state.position.order;
  if (rule.window.earliest !== undefined && position < rule.window.earliest) return false;
  if (rule.window.latest !== undefined && position > rule.window.latest) return false;
  if (position + rule.window.duration > horizon) return false;
  const application = state.applications.find((item) => item.applicationKey === rule.idempotency.applicationKey);
  if (rule.idempotency.mode === "once") return !application?.count;
  if ((application?.count ?? 0) >= rule.idempotency.maxApplications) return false;
  return !application || position - application.lastPosition >= rule.idempotency.minPositionGap;
}

function conditionSatisfied(condition: TransitionCondition, state: GraphState): boolean {
  if (condition.kind === "fact") {
    return condition.value ? state.trueAtoms.includes(condition.atomKey) : state.falseAtoms.includes(condition.atomKey);
  }
  if (condition.kind === "permission") return state.permissions.some((permission) => permissionKey(permission) === permissionKey(condition));
  if (condition.kind === "knowledge") return state.knowledge.some((item) => knowledgeKey(item) === knowledgeKey(condition));
  if (condition.kind === "event") {
    const occurred = state.eventHistory.some((event) => event.eventKey === condition.eventKey);
    return condition.state === "occurred" ? occurred : !occurred;
  }
  const amount = balanceAmount(state, condition.accountKey, condition.resourceKey, condition.unit);
  const expected = parseAmount(condition.amountMinor);
  if (amount === null || expected === null) return false;
  if (condition.compare === "gte") return amount >= expected;
  if (condition.compare === "lte") return amount <= expected;
  return amount === expected;
}

function applyRule(rule: TransitionRule, original: GraphState): GraphState | null {
  const state: GraphState = normalizeState(structuredClone(original));
  for (const effect of rule.effects) {
    if (effect.kind === "set_fact") {
      state.trueAtoms = state.trueAtoms.filter((atom) => atom !== effect.atomKey);
      state.falseAtoms = state.falseAtoms.filter((atom) => atom !== effect.atomKey);
      (effect.value ? state.trueAtoms : state.falseAtoms).push(effect.atomKey);
    } else if (effect.kind === "transfer") {
      const amount = parseAmount(effect.amountMinor);
      if (amount === null || !changeBalance(state, effect.fromAccountKey, effect.resourceKey, effect.unit, -amount)) return null;
      if (!changeBalance(state, effect.toAccountKey, effect.resourceKey, effect.unit, amount)) return null;
    } else if (effect.kind === "external_inflow") {
      const amount = parseAmount(effect.amountMinor);
      if (amount === null || !changeBalance(state, effect.toAccountKey, effect.resourceKey, effect.unit, amount)) return null;
    } else if (effect.kind === "external_outflow") {
      const amount = parseAmount(effect.amountMinor);
      if (amount === null || !changeBalance(state, effect.fromAccountKey, effect.resourceKey, effect.unit, -amount)) return null;
    } else if (effect.kind === "grant_permission" || effect.kind === "revoke_permission") {
      const key = permissionKey(effect);
      state.permissions = state.permissions.filter((permission) => permissionKey(permission) !== key);
      if (effect.kind === "grant_permission") state.permissions.push(effect);
    } else if (effect.kind === "learn" || effect.kind === "forget") {
      state.knowledge = state.knowledge.filter((item) => knowledgeKey(item) !== knowledgeKey(effect));
      if (effect.kind === "learn") state.knowledge.push(effect);
    } else if (effect.kind === "emit_event" || effect.kind === "retract_event") {
      if (effect.kind === "emit_event") {
        state.eventHistory.push({ eventKey: effect.eventKey, position: state.position.order + rule.window.duration });
      } else {
        state.eventHistory = state.eventHistory.filter((event) => event.eventKey !== effect.eventKey);
      }
    }
  }
  const existing = state.applications.find((item) => item.applicationKey === rule.idempotency.applicationKey);
  if (existing) {
    existing.count += 1;
    existing.lastPosition = state.position.order;
  } else {
    state.applications.push({ applicationKey: rule.idempotency.applicationKey, count: 1, lastPosition: state.position.order });
  }
  state.position.order += rule.window.duration;
  return normalizeState(state);
}

function targetReached(state: GraphState, target: ReachabilityTarget): boolean {
  if (target.kind === "all") return target.targets.length > 0 && target.targets.every((item) => targetReached(state, item));
  if (target.kind === "event") {
    const occurred = state.eventHistory.some((event) => event.eventKey === target.eventKey);
    return target.state === "not_occurred" ? !occurred : occurred;
  }
  if (target.kind === "fact") return target.value ? state.trueAtoms.includes(target.atomKey) : state.falseAtoms.includes(target.atomKey);
  if (target.kind === "permission") {
    const present = state.permissions.some((item) => permissionKey(item) === permissionKey(target));
    return target.present === false ? !present : present;
  }
  if (target.kind === "knowledge") {
    const present = state.knowledge.some((item) => knowledgeKey(item) === knowledgeKey(target));
    return target.present === false ? !present : present;
  }
  return conditionSatisfied({ id: "target", ...target }, state);
}

function nextRelevantPosition(rules: TransitionRule[], current: number, horizon: number): number | null {
  if (current >= horizon) return null;
  const boundary = rules.flatMap((rule) => rule.window.earliest !== undefined && rule.window.earliest > current
    ? [rule.window.earliest]
    : []).sort((a, b) => a - b)[0];
  return Math.min(boundary ?? current + 1, horizon);
}

function findBlockers(
  graph: TransitionGraph,
  frontier: SearchNode[],
  horizon: number,
  target: ReachabilityTarget,
): ReachabilityProof["blockers"] {
  const states = frontier.length ? frontier.map((node) => node.state) : [graph.initialState];
  const blockers: ReachabilityProof["blockers"] = [];
  for (const leaf of targetLeaves(target)) {
    const targetHasProducer = graph.rules.some((rule) => rule.effects.some((effect) => effectProducesTarget(effect, leaf)));
    if (!targetHasProducer && !targetReached(graph.initialState, leaf)) {
      const key = targetKeyOf(leaf);
      blockers.push({
        ruleId: `coverage:no-producer:${key}`,
        conditionId: `coverage:no-producer:${key}`,
        kind: leaf.kind,
        explanation: `No registered transition produces ${key}.`,
        evidenceIds: [...new Set(graph.coverage.evidenceIds ?? [])].sort(),
      });
    }
  }
  for (const rule of graph.rules.filter((candidate) => candidate.admission === "established")) {
    if (rule.window.earliest !== undefined && rule.window.earliest > horizon) continue;
    for (const condition of rule.conditions) {
      if (states.some((state) => conditionSatisfied(condition, state))) continue;
      blockers.push({
        ruleId: rule.ruleId,
        conditionId: condition.id,
        kind: condition.kind,
        explanation: blockerExplanation(condition),
        evidenceIds: [...new Set(rule.evidenceIds)].sort(),
      });
    }
  }
  return blockers.slice(0, 24);
}

function blockerExplanation(condition: TransitionCondition): string {
  if (condition.kind === "fact") return `${condition.atomKey} is not established as ${condition.value}.`;
  if (condition.kind === "permission") return `${condition.actorKey} lacks established permission for ${condition.actionKey} in ${condition.scopeKey}.`;
  if (condition.kind === "knowledge") return `${condition.actorKey} is not established to know ${condition.atomKey}.`;
  if (condition.kind === "event") return `${condition.eventKey} is not established as ${condition.state}.`;
  return `${condition.accountKey} does not satisfy ${condition.compare} ${condition.amountMinor} ${condition.unit} of ${condition.resourceKey}.`;
}

function requiredCoverageDimensions(graph: TransitionGraph, target: ReachabilityTarget): TransitionGraph["coverage"]["completeInitialDimensions"] {
  const dimensions = new Set<TransitionGraph["coverage"]["completeInitialDimensions"][number]>();
  for (const item of targetLeaves(target)) {
    if (item.kind === "fact") dimensions.add("facts");
    if (item.kind === "event") dimensions.add("history");
    if (item.kind === "resource") dimensions.add("resources");
    if (item.kind === "permission") dimensions.add("permissions");
    if (item.kind === "knowledge") dimensions.add("knowledge");
  }
  for (const rule of graph.rules) for (const condition of rule.conditions) {
    if (condition.kind === "fact") dimensions.add("facts");
    if (condition.kind === "resource") dimensions.add("resources");
    if (condition.kind === "permission") dimensions.add("permissions");
    if (condition.kind === "knowledge") dimensions.add("knowledge");
    if (condition.kind === "event") dimensions.add("history");
  }
  return [...dimensions];
}

export function targetKeyOf(target: ReachabilityTarget): string {
  if (target.kind === "all") return `all(${target.targets.map(targetKeyOf).sort().join("&")})`;
  if (target.kind === "fact") return `fact:${target.atomKey}=${target.value}`;
  if (target.kind === "event") return target.state === "not_occurred"
    ? `event:${target.eventKey}=not_occurred`
    : `event:${target.eventKey}`;
  if (target.kind === "resource") return `resource:${target.accountKey}:${target.resourceKey}:${target.unit}:${target.compare}:${target.amountMinor}`;
  if (target.kind === "permission") return target.present === false
    ? `permission:${target.actorKey}:${target.actionKey}:${target.scopeKey}=false`
    : `permission:${target.actorKey}:${target.actionKey}:${target.scopeKey}`;
  return target.present === false
    ? `knowledge:${target.actorKey}:${target.atomKey}=false`
    : `knowledge:${target.actorKey}:${target.atomKey}`;
}

function targetLeaves(target: ReachabilityTarget): ReachabilityTargetLeaf[] {
  return target.kind === "all" ? target.targets : [target];
}

function effectProducesTarget(effect: TransitionEffect, target: ReachabilityTargetLeaf): boolean {
  if (target.kind === "fact") return effect.kind === "set_fact" && effect.atomKey === target.atomKey && effect.value === target.value;
  if (target.kind === "event") return (effect.kind === "emit_event" || effect.kind === "retract_event")
    && effect.eventKey === target.eventKey
    && (target.state === "not_occurred" ? effect.kind === "retract_event" : effect.kind === "emit_event");
  if (target.kind === "permission") return (effect.kind === "grant_permission" || effect.kind === "revoke_permission")
    && permissionKey(effect) === permissionKey(target)
    && (target.present === false ? effect.kind === "revoke_permission" : effect.kind === "grant_permission");
  if (target.kind === "knowledge") return (effect.kind === "learn" || effect.kind === "forget")
    && knowledgeKey(effect) === knowledgeKey(target)
    && (target.present === false ? effect.kind === "forget" : effect.kind === "learn");
  if (effect.kind === "transfer") {
    return [effect.fromAccountKey, effect.toAccountKey].includes(target.accountKey)
      && effect.resourceKey === target.resourceKey && effect.unit === target.unit;
  }
  if (effect.kind === "external_inflow") {
    return effect.toAccountKey === target.accountKey && effect.resourceKey === target.resourceKey && effect.unit === target.unit;
  }
  if (effect.kind === "external_outflow") {
    return effect.fromAccountKey === target.accountKey && effect.resourceKey === target.resourceKey && effect.unit === target.unit;
  }
  return false;
}

function changeBalance(state: GraphState, accountKey: string, resourceKey: string, unit: string, delta: bigint): boolean {
  const matching = state.balances.filter((balance) => balance.accountKey === accountKey && balance.resourceKey === resourceKey);
  if (matching.some((balance) => balance.unit !== unit) || matching.length > 1) return false;
  const balance = matching[0];
  const current = balance ? parseAmount(balance.amountMinor) : 0n;
  if (current === null || current + delta < 0n) return false;
  if (balance) balance.amountMinor = String(current + delta);
  else state.balances.push({ accountKey, resourceKey, unit, amountMinor: String(delta) });
  return true;
}

function balanceAmount(state: GraphState, accountKey: string, resourceKey: string, unit: string): bigint | null {
  const matching = state.balances.filter((balance) => balance.accountKey === accountKey && balance.resourceKey === resourceKey);
  if (matching.length > 1 || matching.some((balance) => balance.unit !== unit)) return null;
  return matching[0] ? parseAmount(matching[0].amountMinor) : 0n;
}

function parseAmount(value: string): bigint | null {
  if (!/^(?:0|[1-9]\d*)$/.test(value)) return null;
  try { return BigInt(value); } catch { return null; }
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function permissionKey(value: { actorKey: string; actionKey: string; scopeKey: string }): string {
  return `${value.actorKey}\u0000${value.actionKey}\u0000${value.scopeKey}`;
}

function knowledgeKey(value: { actorKey: string; atomKey: string }): string {
  return `${value.actorKey}\u0000${value.atomKey}`;
}

function balanceCompare(left: GraphState["balances"][number], right: GraphState["balances"][number]): number {
  return `${left.accountKey}\u0000${left.resourceKey}\u0000${left.unit}`.localeCompare(`${right.accountKey}\u0000${right.resourceKey}\u0000${right.unit}`);
}

function dedupeRecords<T>(values: T[], key: (value: T) => string): T[] {
  return [...new Map(values.map((value) => [key(value), value])).values()].sort((left, right) => key(left).localeCompare(key(right)));
}

function stateSignature(state: GraphState): string {
  const normalized = normalizeState(state);
  return JSON.stringify(normalized);
}

function stableStateHash(state: GraphState): string {
  const value = stateSignature(state);
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `state-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function unknownProof(graph: TransitionGraph, targetKey: string, diagnostics: string[]): ReachabilityProof {
  return {
    status: "unknown",
    graphRevision: graph.projectRevision,
    plane: graph.plane,
    targetKey,
    rulePath: [],
    blockers: [],
    assumptions: [],
    diagnostics,
    search: { complete: false, statesExplored: 0, truncated: false },
  };
}
