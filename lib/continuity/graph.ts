export type CausalRule = {
  id: string;
  requires: string[];
  produces: string[];
};

export type ReachabilityResult = {
  reachable: boolean;
  reached: string[];
  path: string[];
  missing: string[];
  cycleDetected: boolean;
};

export function evaluateReachability(
  target: string,
  initialFacts: string[],
  rules: CausalRule[],
): ReachabilityResult {
  const reached = new Set(initialFacts);
  const path: string[] = [];
  const applied = new Set<string>();
  let changed = true;

  while (changed && !reached.has(target)) {
    changed = false;
    for (const rule of rules) {
      if (applied.has(rule.id)) continue;
      if (!rule.requires.every((requirement) => reached.has(requirement))) continue;
      applied.add(rule.id);
      path.push(rule.id);
      for (const product of rule.produces) {
        if (!reached.has(product)) changed = true;
        reached.add(product);
      }
    }
  }

  const producers = rules.filter((rule) => rule.produces.includes(target));
  const missing = reached.has(target)
    ? []
    : [...new Set(producers.flatMap((rule) => rule.requires.filter((requirement) => !reached.has(requirement))))];
  const cycleDetected = detectRuleCycle(rules);

  return { reachable: reached.has(target), reached: [...reached], path, missing, cycleDetected };
}

function detectRuleCycle(rules: CausalRule[]): boolean {
  const graph = new Map<string, Set<string>>();
  for (const rule of rules) {
    for (const requirement of rule.requires) {
      const next = graph.get(requirement) ?? new Set<string>();
      for (const product of rule.produces) next.add(product);
      graph.set(requirement, next);
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (node: string): boolean => {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;
    visiting.add(node);
    for (const next of graph.get(node) ?? []) if (visit(next)) return true;
    visiting.delete(node);
    visited.add(node);
    return false;
  };
  return [...graph.keys()].some(visit);
}
