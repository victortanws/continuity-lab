import type {
  AnalysisMode,
  CompiledEntityCandidate,
  CoverageAssessment,
  EvidenceChunk,
} from "./contracts";

export const QUESTION_GRAPH_VERSION = "continuity.question-graph.v1" as const;

export const QUESTION_GRAPH_LIMITS = Object.freeze({
  maxInputEvidence: 512,
  maxSemanticRecords: 512,
  maxRelationsPerRecord: 64,
  maxNodes: 256,
  maxEdges: 512,
  maxDepth: 6,
  defaultNodes: 72,
  defaultEdges: 144,
  defaultDepth: 3,
} as const);

export type QuestionGraphNodeKind = "entity" | "claim" | "event" | "constraint" | "evidence";
export type QuestionGraphRelation =
  | "supports"
  | "contradicts"
  | "mentions"
  | "precondition"
  | "consequence"
  | "identity"
  | "temporal_before";

export type QuestionGraphNode = {
  id: string;
  kind: QuestionGraphNodeKind;
  /** Canonical, non-display identifier used to join graph records. */
  key: string;
  label: string;
  evidenceIds: string[];
  grounding: "grounded" | "conflicted" | "referenced";
  temporal?: { axis: string; order: number } | null;
};

export type QuestionGraphEdge = {
  id: string;
  relation: QuestionGraphRelation;
  from: string;
  to: string;
  evidenceIds: string[];
};

/**
 * Optional semantic links proposed upstream and admitted only when their
 * `evidenceId` resolves to an exact, atomic evidence record. The graph does not
 * ask a model to invent links. A compiler, parser, or reviewed adapter may
 * supply them after verifying the source span.
 */
export type QuestionGraphSemanticRecord = {
  evidenceId: string;
  assertionKind?: "claim" | "event" | "constraint";
  label?: string;
  mentionsEntityIds?: string[];
  preconditionClaimKeys?: string[];
  consequenceClaimKeys?: string[];
  temporal?: { axis: string; order: number } | null;
};

export type QuestionGraphBuildRequest = {
  projectId: string;
  projectRevision: string;
  evidence: EvidenceChunk[];
  semanticRecords?: QuestionGraphSemanticRecord[];
  /** Must come from the trusted authority router, not uploaded source prose. */
  coverage?: Pick<
    CoverageAssessment,
    "scope" | "closure" | "trustedComplete" | "truncated" | "failures" | "deferredEvidenceIds" | "deferredSources" | "excludedSources"
  >;
};

export type QuestionGraph = {
  version: typeof QUESTION_GRAPH_VERSION;
  projectId: string;
  projectRevision: string;
  nodes: QuestionGraphNode[];
  edges: QuestionGraphEdge[];
  receipt: QuestionGraphBuildReceipt;
};

export type QuestionGraphBuildReceipt = {
  inputEvidence: number;
  admittedAtomicEvidence: number;
  rejectedEvidence: number;
  semanticRecordsAdmitted: number;
  semanticRecordsRejected: number;
  unresolvedReferencedNodes: number;
  totalNodes: number;
  totalEdges: number;
  corpusCoverage: "closed" | "partial" | "open" | "not_asserted";
  coverageScope: string;
  coverageWarnings: string[];
};

export type QuestionGraphQuery = {
  question: string;
  seedKeys?: string[];
  maxNodes?: number;
  maxEdges?: number;
  maxDepth?: number;
};

export type QuestionGraphQueryResult = {
  version: typeof QUESTION_GRAPH_VERSION;
  nodes: QuestionGraphNode[];
  edges: QuestionGraphEdge[];
  receipt: {
    seedNodeIds: string[];
    visitedNodes: number;
    visitedEdges: number;
    maxNodes: number;
    maxEdges: number;
    maxDepth: number;
    graphTraversalComplete: boolean;
    truncatedBy: Array<"nodes" | "edges" | "depth">;
    deferredNodeCount: number;
    deferredEdgeCount: number;
    corpusCoverage: QuestionGraphBuildReceipt["corpusCoverage"];
    coverageScope: string;
    warning: string | null;
  };
};

export type QuestionGraphUsePlan = {
  useGraph: boolean;
  path: "direct_lookup" | "question_graph";
  reason: string;
};

/**
 * Keep ordinary lookups quick. Causal, change, contradiction, sequence, and
 * dependency questions use the graph; a short direct who/what/where/when
 * lookup can answer from a small evidence set without paying traversal cost.
 */
export function planQuestionGraphUse(
  question: string,
  mode: AnalysisMode = "answer_question",
): QuestionGraphUsePlan {
  const normalized = normalizeText(question);
  if (mode !== "answer_question") {
    return {
      useGraph: true,
      path: "question_graph",
      reason: `${mode} requires dependency or change reasoning.`,
    };
  }
  const graphSignals = /\b(?:cause|caused|causal|because|before|after|depend|requires?|prerequisite|consequence|result|lead to|what if|change|break|conflict|contradict|consistent|possible|reach|timeline|sequence|retcon|downstream)\b/u;
  if (graphSignals.test(normalized)) {
    return {
      useGraph: true,
      path: "question_graph",
      reason: "The question asks about causality, order, consistency, or consequences.",
    };
  }
  const wordCount = normalized.split(/\s+/u).filter(Boolean).length;
  const directLookup = /^(?:who|what|where|when)\s+(?:is|are|was|were|did|does)\b/u.test(normalized);
  const asksAnotherClause = /[,;]\s*(?:and|but|or)\b|\b(?:and|but|or)\s+(?:does|did|is|are|was|were|can|could|would|will)\b/u.test(normalized);
  if (directLookup && !asksAnotherClause && wordCount <= 24) {
    return {
      useGraph: false,
      path: "direct_lookup",
      reason: "A short factual lookup can use the smallest relevant evidence set.",
    };
  }
  return {
    useGraph: true,
    path: "question_graph",
    reason: "The question is not a confidently bounded direct lookup.",
  };
}

/** Build a deterministic, in-memory graph from already verified atomic facts. */
export function buildQuestionGraph(request: QuestionGraphBuildRequest): QuestionGraph {
  if (!request.projectId.trim() || !request.projectRevision.trim()) {
    throw new QuestionGraphInputError("projectId and projectRevision are required.");
  }
  if (request.evidence.length > QUESTION_GRAPH_LIMITS.maxInputEvidence) {
    throw new QuestionGraphInputError(`Evidence exceeds the ${QUESTION_GRAPH_LIMITS.maxInputEvidence}-record graph limit.`);
  }
  const semanticRecords = request.semanticRecords ?? [];
  if (semanticRecords.length > QUESTION_GRAPH_LIMITS.maxSemanticRecords) {
    throw new QuestionGraphInputError(`Semantic records exceed the ${QUESTION_GRAPH_LIMITS.maxSemanticRecords}-record graph limit.`);
  }

  const atomicEvidence = request.evidence
    .filter(isAdmissibleAtomicEvidence)
    .slice()
    .sort(compareEvidence);
  const evidenceById = new Map(atomicEvidence.map((item) => [item.id, item]));
  const recordsByEvidence = groupSemanticRecords(semanticRecords, evidenceById);
  const nodes = new Map<string, MutableNode>();
  const edges = new Map<string, QuestionGraphEdge>();
  const assertionByEvidenceId = new Map<string, MutableNode>();
  let recordsAdmitted = 0;
  let recordsRejected = 0;

  for (const record of semanticRecords) {
    if (evidenceById.has(record.evidenceId) && validSemanticRecord(record)) recordsAdmitted += 1;
    else recordsRejected += 1;
  }

  for (const evidence of atomicEvidence) {
    const evidenceNode = upsertNode(nodes, {
      id: nodeId("evidence", `${evidence.sourceVersionId}\u0000${evidence.id}`),
      kind: "evidence",
      key: evidence.id,
      label: `${evidence.title} — ${evidence.locator}`,
      evidenceIds: [evidence.id],
      grounding: "grounded",
      temporal: temporalOf(evidence),
    });
    const records = recordsByEvidence.get(evidence.id) ?? [];
    const primary = records[0];
    const assertionKind = primary?.assertionKind ?? inferAssertionKind(evidence);
    const assertion = upsertNode(nodes, {
      id: nodeId(assertionKind, scopedClaimKey(evidence)),
      kind: assertionKind,
      key: evidence.claimKey!,
      label: primary?.label?.trim() || evidence.text.trim(),
      evidenceIds: [evidence.id],
      grounding: "grounded",
      temporal: primary?.temporal ?? temporalOf(evidence),
    });
    assertionByEvidenceId.set(evidence.id, assertion);
    addEdge(edges, evidence.polarity === "negative" ? "contradicts" : "supports", evidenceNode.id, assertion.id, [evidence.id]);

    const candidates = deduplicateCandidates(evidence.entityCandidates ?? []);
    for (const candidate of candidates) {
      const entity = entityNode(nodes, candidate, evidence.id);
      addEdge(
        edges,
        evidence.claimKind === "identity" ? "identity" : "mentions",
        evidence.claimKind === "identity" ? evidenceNode.id : assertion.id,
        entity.id,
        [evidence.id],
      );
    }

  }

  // Resolve semantic edges only after every grounded assertion exists. This
  // avoids producing a placeholder merely because its target appeared later
  // in the input array.
  for (const evidence of atomicEvidence) {
    const assertion = assertionByEvidenceId.get(evidence.id)!;
    for (const record of recordsByEvidence.get(evidence.id) ?? []) {
      for (const entityId of uniqueBounded(record.mentionsEntityIds ?? [])) {
        const entity = entityByCandidateId(nodes, evidence, entityId);
        if (entity) addEdge(edges, "mentions", assertion.id, entity.id, [evidence.id]);
      }
      for (const key of uniqueBounded(record.preconditionClaimKeys ?? [])) {
        const prerequisite = groundedOrReferencedClaimNode(nodes, request.projectId, key);
        addEdge(edges, "precondition", prerequisite.id, assertion.id, [evidence.id]);
      }
      for (const key of uniqueBounded(record.consequenceClaimKeys ?? [])) {
        const consequence = groundedOrReferencedClaimNode(nodes, request.projectId, key);
        addEdge(edges, "consequence", assertion.id, consequence.id, [evidence.id]);
      }
    }
  }

  markConflictedNodes(nodes, edges);
  addTemporalEdges(nodes, edges);
  const nodeList = [...nodes.values()].map(freezeNode).sort(compareNodes);
  const edgeList = [...edges.values()].sort(compareEdges);
  if (nodeList.length > QUESTION_GRAPH_LIMITS.maxNodes) {
    throw new QuestionGraphInputError(`Compiled graph exceeds the ${QUESTION_GRAPH_LIMITS.maxNodes}-node limit.`);
  }
  if (edgeList.length > QUESTION_GRAPH_LIMITS.maxEdges) {
    throw new QuestionGraphInputError(`Compiled graph exceeds the ${QUESTION_GRAPH_LIMITS.maxEdges}-edge limit.`);
  }
  const coverage = coverageReceipt(request.coverage);
  return {
    version: QUESTION_GRAPH_VERSION,
    projectId: request.projectId,
    projectRevision: request.projectRevision,
    nodes: nodeList,
    edges: edgeList,
    receipt: {
      inputEvidence: request.evidence.length,
      admittedAtomicEvidence: atomicEvidence.length,
      rejectedEvidence: request.evidence.length - atomicEvidence.length,
      semanticRecordsAdmitted: recordsAdmitted,
      semanticRecordsRejected: recordsRejected,
      unresolvedReferencedNodes: nodeList.filter((node) => node.grounding === "referenced").length,
      totalNodes: nodeList.length,
      totalEdges: edgeList.length,
      ...coverage,
    },
  };
}

/**
 * Bounded breadth-first traversal. It walks both directions because a user may
 * ask either “what caused X?” or “what follows from X?”. Output ordering does
 * not depend on input ordering.
 */
export function queryQuestionGraph(graph: QuestionGraph, query: QuestionGraphQuery): QuestionGraphQueryResult {
  const maxNodes = boundedInteger(query.maxNodes, QUESTION_GRAPH_LIMITS.defaultNodes, 1, QUESTION_GRAPH_LIMITS.maxNodes);
  const maxEdges = boundedInteger(query.maxEdges, QUESTION_GRAPH_LIMITS.defaultEdges, 0, QUESTION_GRAPH_LIMITS.maxEdges);
  const maxDepth = boundedInteger(query.maxDepth, QUESTION_GRAPH_LIMITS.defaultDepth, 0, QUESTION_GRAPH_LIMITS.maxDepth);
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const candidateSeedIds = selectSeedIds(graph.nodes, query.question, query.seedKeys ?? []);
  const incident = incidentEdges(graph.edges);
  const visited = new Set<string>();
  const selectedEdges = new Map<string, QuestionGraphEdge>();
  const seedIds: string[] = [];
  const queue: Array<{ id: string; depth: number }> = [];
  let nodeLimited = false;
  let edgeLimited = false;
  let depthLimited = false;

  for (const seed of candidateSeedIds) {
    if (visited.size >= maxNodes) { nodeLimited = true; break; }
    visited.add(seed);
    seedIds.push(seed);
    queue.push({ id: seed, depth: 0 });
  }
  while (queue.length) {
    const current = queue.shift()!;
    const candidates = incident.get(current.id) ?? [];
    if (current.depth >= maxDepth) {
      if (candidates.some((edge) => !visited.has(otherEnd(edge, current.id)))) depthLimited = true;
      continue;
    }
    for (const edge of candidates) {
      if (!selectedEdges.has(edge.id)) {
        if (selectedEdges.size >= maxEdges) { edgeLimited = true; continue; }
        selectedEdges.set(edge.id, edge);
      }
      const other = otherEnd(edge, current.id);
      if (visited.has(other)) continue;
      if (visited.size >= maxNodes) { nodeLimited = true; continue; }
      visited.add(other);
      queue.push({ id: other, depth: current.depth + 1 });
    }
  }

  const nodes = [...visited].flatMap((id) => nodeById.get(id) ?? []).sort(compareNodes);
  const selectedNodeIds = new Set(nodes.map((node) => node.id));
  const edges = [...selectedEdges.values()]
    .filter((edge) => selectedNodeIds.has(edge.from) && selectedNodeIds.has(edge.to))
    .sort(compareEdges);
  const truncatedBy: QuestionGraphQueryResult["receipt"]["truncatedBy"] = [];
  if (nodeLimited) truncatedBy.push("nodes");
  if (edgeLimited) truncatedBy.push("edges");
  if (depthLimited) truncatedBy.push("depth");
  const traversalComplete = truncatedBy.length === 0;
  return {
    version: QUESTION_GRAPH_VERSION,
    nodes,
    edges,
    receipt: {
      seedNodeIds: seedIds,
      visitedNodes: nodes.length,
      visitedEdges: edges.length,
      maxNodes,
      maxEdges,
      maxDepth,
      graphTraversalComplete: traversalComplete,
      truncatedBy,
      deferredNodeCount: Math.max(0, graph.nodes.length - nodes.length),
      deferredEdgeCount: Math.max(0, graph.edges.length - edges.length),
      corpusCoverage: graph.receipt.corpusCoverage,
      coverageScope: graph.receipt.coverageScope,
      warning: graph.receipt.corpusCoverage === "closed" && traversalComplete
        ? null
        : "This is a bounded question-scoped view, not proof that the wider corpus contains no other facts or paths.",
    },
  };
}

export class QuestionGraphInputError extends Error {
  readonly code = "question_graph_input_invalid";

  constructor(message: string) {
    super(message);
    this.name = "QuestionGraphInputError";
  }
}

type MutableNode = QuestionGraphNode;

function isAdmissibleAtomicEvidence(evidence: EvidenceChunk): boolean {
  return Boolean(
    evidence.id.trim()
    && evidence.sourceVersionId.trim()
    && evidence.claimKey?.trim()
    && evidence.claimKind
    && evidence.polarity
    && !evidence.flags?.includes("compiled_context_only")
    && !evidence.flags?.includes("possible_prompt_injection"),
  );
}

function inferAssertionKind(evidence: EvidenceChunk): "claim" | "event" | "constraint" {
  if (/^(?:event|historical):/u.test(evidence.claimKey ?? "") || evidence.claimKind === "historical") return "event";
  if (/^(?:constraint|rule|permission):/u.test(evidence.claimKey ?? "") || evidence.claimKind === "normative") return "constraint";
  return "claim";
}

function scopedClaimKey(evidence: EvidenceChunk): string {
  const scope = evidence.assertionScope ?? "project_truth";
  const owner = evidence.assertionOwnerId ?? evidence.projectId;
  const temporalFrame = evidence.temporalAxis && typeof evidence.validFromOrder === "number"
    ? `${evidence.temporalAxis}:${evidence.validFromOrder}:${evidence.validToOrder ?? evidence.validFromOrder}`
    : "unscoped-time";
  return `${scope}\u0000${owner}\u0000${temporalFrame}\u0000${evidence.claimKey}`;
}

function nodeId(kind: QuestionGraphNodeKind, key: string): string {
  const prefixes: Record<QuestionGraphNodeKind, string> = {
    entity: "ENT",
    claim: "CLM",
    event: "EVT",
    constraint: "CNS",
    evidence: "EVD",
  };
  return `QG-${prefixes[kind]}-${stableHash(`${kind}\u0000${key}`)}`;
}

function edgeId(relation: QuestionGraphRelation, from: string, to: string): string {
  return `QG-EDG-${stableHash(`${relation}\u0000${from}\u0000${to}`)}`;
}

function stableHash(value: string): string {
  let left = 0x811c9dc5;
  let right = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    left = Math.imul(left ^ code, 0x01000193);
    right = Math.imul(right ^ code, 0x85ebca6b);
  }
  return `${(left >>> 0).toString(16).padStart(8, "0")}${(right >>> 0).toString(16).padStart(8, "0")}`;
}

function upsertNode(nodes: Map<string, MutableNode>, node: MutableNode): MutableNode {
  const prior = nodes.get(node.id);
  if (!prior) {
    nodes.set(node.id, node);
    return node;
  }
  prior.evidenceIds = uniqueSorted([...prior.evidenceIds, ...node.evidenceIds]);
  if (prior.grounding === "referenced" && node.grounding === "grounded") prior.grounding = "grounded";
  if (!prior.temporal && node.temporal) prior.temporal = node.temporal;
  if (node.label.length > prior.label.length) prior.label = node.label;
  return prior;
}

function addEdge(
  edges: Map<string, QuestionGraphEdge>,
  relation: QuestionGraphRelation,
  from: string,
  to: string,
  evidenceIds: string[],
): void {
  const id = edgeId(relation, from, to);
  const prior = edges.get(id);
  if (prior) {
    prior.evidenceIds = uniqueSorted([...prior.evidenceIds, ...evidenceIds]);
    return;
  }
  edges.set(id, { id, relation, from, to, evidenceIds: uniqueSorted(evidenceIds) });
}

function entityNode(nodes: Map<string, MutableNode>, candidate: CompiledEntityCandidate, evidenceId: string): MutableNode {
  return upsertNode(nodes, {
    id: nodeId("entity", candidate.id),
    kind: "entity",
    key: candidate.id,
    label: candidate.name,
    evidenceIds: [evidenceId],
    grounding: "grounded",
    temporal: null,
  });
}

function entityByCandidateId(
  nodes: Map<string, MutableNode>,
  evidence: EvidenceChunk,
  entityId: string,
): MutableNode | null {
  const candidate = (evidence.entityCandidates ?? []).find((item) => item.id === entityId);
  return candidate ? entityNode(nodes, candidate, evidence.id) : null;
}

function groundedOrReferencedClaimNode(nodes: Map<string, MutableNode>, projectId: string, key: string): MutableNode {
  const clean = key.trim().slice(0, 512);
  const candidates = [...nodes.values()]
    .filter((node) => node.key === clean && node.kind !== "evidence" && node.kind !== "entity")
    .sort(compareNodes);
  // A bare semantic key may resolve one temporal assertion. When several
  // temporal frames share the key, preserve an unresolved join node instead
  // of silently choosing whichever happened to sort first.
  if (candidates.length === 1) return candidates[0];
  return upsertNode(nodes, {
    id: nodeId("claim", `project_truth\u0000${projectId}\u0000unresolved-time\u0000${clean}`),
    kind: "claim",
    key: clean,
    label: clean,
    evidenceIds: [],
    grounding: "referenced",
    temporal: null,
  });
}

function groupSemanticRecords(
  records: QuestionGraphSemanticRecord[],
  evidence: Map<string, EvidenceChunk>,
): Map<string, QuestionGraphSemanticRecord[]> {
  const grouped = new Map<string, QuestionGraphSemanticRecord[]>();
  for (const record of records) {
    if (!evidence.has(record.evidenceId) || !validSemanticRecord(record)) continue;
    const current = grouped.get(record.evidenceId) ?? [];
    current.push(record);
    grouped.set(record.evidenceId, current);
  }
  for (const current of grouped.values()) current.sort((left, right) => canonicalRecord(left).localeCompare(canonicalRecord(right)));
  return grouped;
}

function validSemanticRecord(record: QuestionGraphSemanticRecord): boolean {
  const relations = [
    ...(record.mentionsEntityIds ?? []),
    ...(record.preconditionClaimKeys ?? []),
    ...(record.consequenceClaimKeys ?? []),
  ];
  return Boolean(record.evidenceId.trim())
    && relations.length <= QUESTION_GRAPH_LIMITS.maxRelationsPerRecord
    && relations.every((item) => Boolean(item.trim()) && item.length <= 512)
    && (!record.label || record.label.length <= 2_000)
    && (!record.temporal || (Boolean(record.temporal.axis.trim()) && Number.isFinite(record.temporal.order)));
}

function canonicalRecord(record: QuestionGraphSemanticRecord): string {
  return JSON.stringify({
    ...record,
    mentionsEntityIds: uniqueSorted(record.mentionsEntityIds ?? []),
    preconditionClaimKeys: uniqueSorted(record.preconditionClaimKeys ?? []),
    consequenceClaimKeys: uniqueSorted(record.consequenceClaimKeys ?? []),
  });
}

function temporalOf(evidence: EvidenceChunk): QuestionGraphNode["temporal"] {
  return evidence.temporalAxis && typeof evidence.validFromOrder === "number" && Number.isFinite(evidence.validFromOrder)
    ? { axis: evidence.temporalAxis, order: evidence.validFromOrder }
    : null;
}

function addTemporalEdges(nodes: Map<string, MutableNode>, edges: Map<string, QuestionGraphEdge>): void {
  const groups = new Map<string, MutableNode[]>();
  for (const node of nodes.values()) {
    if (!node.temporal || node.kind === "evidence" || node.kind === "entity") continue;
    const group = groups.get(node.temporal.axis) ?? [];
    group.push(node);
    groups.set(node.temporal.axis, group);
  }
  for (const group of groups.values()) {
    const ordered = group.sort((left, right) =>
      left.temporal!.order - right.temporal!.order || left.id.localeCompare(right.id));
    for (let index = 1; index < ordered.length; index += 1) {
      const previous = ordered[index - 1];
      const current = ordered[index];
      if (previous.temporal!.order < current.temporal!.order) {
        addEdge(edges, "temporal_before", previous.id, current.id, uniqueSorted([...previous.evidenceIds, ...current.evidenceIds]));
      }
    }
  }
}

function markConflictedNodes(nodes: Map<string, MutableNode>, edges: Map<string, QuestionGraphEdge>): void {
  const relations = new Map<string, Set<QuestionGraphRelation>>();
  for (const edge of edges.values()) {
    if (edge.relation !== "supports" && edge.relation !== "contradicts") continue;
    const set = relations.get(edge.to) ?? new Set<QuestionGraphRelation>();
    set.add(edge.relation);
    relations.set(edge.to, set);
  }
  for (const [id, set] of relations) {
    if (set.has("supports") && set.has("contradicts")) nodes.get(id)!.grounding = "conflicted";
  }
}

function coverageReceipt(coverage: QuestionGraphBuildRequest["coverage"]): Pick<
  QuestionGraphBuildReceipt,
  "corpusCoverage" | "coverageScope" | "coverageWarnings"
> {
  if (!coverage) return {
    corpusCoverage: "not_asserted",
    coverageScope: "question-scoped admitted evidence",
    coverageWarnings: ["No trusted corpus-coverage assessment was supplied."],
  };
  const trustedClosed = coverage.closure === "closed"
    && coverage.trustedComplete
    && !coverage.truncated
    && coverage.failures.length === 0
    && coverage.deferredEvidenceIds.length === 0
    && coverage.deferredSources.length === 0
    && coverage.excludedSources.length === 0;
  const corpusCoverage = trustedClosed ? "closed" : coverage.closure === "open" ? "open" : "partial";
  const warnings: string[] = [];
  if (coverage.truncated) warnings.push("The authority route reached a source or evidence bound.");
  if (coverage.failures.length) warnings.push(`${coverage.failures.length} in-scope source read failed.`);
  if (coverage.deferredEvidenceIds.length || coverage.deferredSources.length) warnings.push("Some relevant material was deferred.");
  if (coverage.excludedSources.length) warnings.push("Some in-scope sources were excluded.");
  if (coverage.closure === "closed" && !trustedClosed) warnings.push("A nominal closed-coverage claim lacked all trusted closure conditions.");
  return { corpusCoverage, coverageScope: coverage.scope, coverageWarnings: warnings };
}

function selectSeedIds(nodes: QuestionGraphNode[], question: string, seedKeys: string[]): string[] {
  const keys = new Set(seedKeys.map(normalizeText).filter(Boolean));
  const terms = queryTerms(question);
  return nodes
    .map((node) => {
      const normalizedKey = normalizeText(node.key);
      const haystack = normalizeText(`${node.key} ${node.label}`);
      const explicit = keys.has(normalizedKey);
      const score = explicit ? 10_000 : terms.reduce((total, term) => total + (haystack.includes(term) ? term.length : 0), 0);
      return { id: node.id, score };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
    .slice(0, 12)
    .map((item) => item.id);
}

function queryTerms(question: string): string[] {
  const stop = new Set(["a", "an", "and", "are", "can", "did", "do", "does", "for", "how", "in", "is", "it", "of", "on", "or", "the", "this", "to", "was", "what", "when", "where", "which", "who", "why", "with", "would"]);
  return [...new Set(normalizeText(question).split(/[^\p{L}\p{N}._-]+/u).filter((term) => term.length >= 2 && !stop.has(term)))]
    .sort((left, right) => right.length - left.length || left.localeCompare(right));
}

function incidentEdges(edges: QuestionGraphEdge[]): Map<string, QuestionGraphEdge[]> {
  const incident = new Map<string, QuestionGraphEdge[]>();
  for (const edge of edges) {
    for (const nodeId of [edge.from, edge.to]) {
      const current = incident.get(nodeId) ?? [];
      current.push(edge);
      incident.set(nodeId, current);
    }
  }
  for (const current of incident.values()) current.sort(compareEdges);
  return incident;
}

function otherEnd(edge: QuestionGraphEdge, nodeId: string): string {
  return edge.from === nodeId ? edge.to : edge.from;
}

function deduplicateCandidates(candidates: CompiledEntityCandidate[]): CompiledEntityCandidate[] {
  return [...new Map(candidates.slice().sort((left, right) => left.id.localeCompare(right.id)).map((item) => [item.id, item])).values()];
}

function uniqueBounded(values: string[]): string[] {
  return uniqueSorted(values.map((item) => item.trim()).filter(Boolean)).slice(0, QUESTION_GRAPH_LIMITS.maxRelationsPerRecord);
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function normalizeText(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en-US");
}

function compareEvidence(left: EvidenceChunk, right: EvidenceChunk): number {
  return left.id.localeCompare(right.id) || left.sourceVersionId.localeCompare(right.sourceVersionId);
}

function compareNodes(left: QuestionGraphNode, right: QuestionGraphNode): number {
  return left.kind.localeCompare(right.kind) || left.key.localeCompare(right.key) || left.id.localeCompare(right.id);
}

function compareEdges(left: QuestionGraphEdge, right: QuestionGraphEdge): number {
  return left.relation.localeCompare(right.relation) || left.from.localeCompare(right.from) || left.to.localeCompare(right.to) || left.id.localeCompare(right.id);
}

function freezeNode(node: MutableNode): QuestionGraphNode {
  return { ...node, evidenceIds: uniqueSorted(node.evidenceIds), temporal: node.temporal ? { ...node.temporal } : null };
}

function boundedInteger(value: number | undefined, fallback: number, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.floor(value)));
}
