import type {
  AuthorityPolicy,
  CitationUse,
  ClaimKind,
  EvidenceChunk,
  EvidenceLifecycle,
  EvidenceRole,
} from "../contracts";

const contextualize: CitationUse[] = ["contextualize"];
const propose: CitationUse[] = ["propose", "contextualize"];
const establish: CitationUse[] = ["establish", "corroborate", "challenge", "contextualize"];
const everyClaimKind = ["identity", "normative", "configured", "implemented", "tested", "observed", "causal", "historical"] as const;

const DEFAULT_ALLOWED_USES: AuthorityPolicy["allowedUsesByRole"] = {
  intent: {
    identity: ["establish", "corroborate", "challenge"],
    normative: ["establish", "corroborate", "challenge"],
    causal: contextualize,
  },
  decision: {
    identity: ["establish", "corroborate", "challenge"],
    normative: ["establish", "corroborate", "challenge"],
    causal: contextualize,
  },
  configuration: {
    configured: ["establish", "corroborate", "challenge"],
    implemented: ["corroborate", "challenge", "contextualize"],
    causal: contextualize,
  },
  implementation: {
    identity: ["establish", "corroborate", "challenge"],
    implemented: ["establish", "corroborate", "challenge"],
    configured: ["corroborate", "challenge", "contextualize"],
    causal: ["establish", "corroborate", "challenge"],
  },
  test: {
    tested: ["establish", "corroborate", "challenge"],
    configured: ["corroborate", "challenge", "contextualize"],
    implemented: ["corroborate", "challenge", "contextualize"],
    causal: ["corroborate", "challenge", "contextualize"],
  },
  observation: {
    observed: ["establish", "corroborate", "challenge"],
    historical: ["establish", "corroborate", "challenge"],
    configured: ["corroborate", "challenge", "contextualize"],
    implemented: ["corroborate", "challenge", "contextualize"],
    causal: ["corroborate", "challenge", "contextualize"],
  },
  proposal: {
    identity: propose, normative: propose, configured: propose, implemented: propose,
    tested: propose, observed: propose, causal: propose, historical: propose,
  },
  archive: {
    identity: contextualize, normative: contextualize, configured: contextualize,
    implemented: contextualize, tested: contextualize, observed: contextualize,
    causal: contextualize, historical: ["establish", "corroborate", "challenge", "contextualize"],
  },
  asset: {
    identity: ["establish", "corroborate", "challenge", "contextualize"],
    implemented: ["establish", "corroborate", "challenge"],
  },
  reference: {
    identity: ["establish", "corroborate", "challenge", "contextualize"],
    historical: ["establish", "corroborate", "challenge", "contextualize"],
    normative: contextualize, configured: contextualize, implemented: contextualize,
    tested: contextualize, observed: contextualize, causal: contextualize,
  },
  evaluation: {},
};

const DEFAULT_RULES: AuthorityPolicy["sourceRules"] = [
  { id: "evaluation", pathPattern: "**/{eval,evals,evaluation,evaluations,benchmark,benchmarks}/**", role: "evaluation" },
  { id: "gold-or-rubric", pathPattern: "**/{gold-key,gold_key,rubric,answer-key,answer_key}*", role: "evaluation" },
  { id: "evaluation-filename", pathPattern: "**/*{eval,evals,evaluation,evaluations,benchmark,benchmarks,rubric,grader,gold-key,gold_key,answer-key,answer_key}*", role: "evaluation" },
  { id: "fixture-answer", pathPattern: "**/{fixture,fixtures,__fixture__,__fixtures__}/**/*{expected,answer,gold,oracle}*", role: "evaluation" },
  { id: "archive", pathPattern: "**/{archive,archives,historical,history}/**", role: "archive", lifecycle: "historical" },
  { id: "proposal", pathPattern: "**/{proposal,proposals,draft,drafts,experiment,experiments}/**", role: "proposal", lifecycle: "proposed" },
  { id: "decision", pathPattern: "**/{decision,decisions,adr,adrs}/**", role: "decision" },
  { id: "tests", pathPattern: "**/{test,tests,__tests__,spec,specs}/**", role: "test" },
  { id: "observations", pathPattern: "**/{log,logs,ledger,ledgers,audit,audits,incident,incidents,releases,deployments}/**", role: "observation" },
  { id: "assets", pathPattern: "**/{asset,assets,art,visual,visuals}/**", role: "asset" },
];

export const DEFAULT_AUTHORITY_POLICY: AuthorityPolicy = {
  id: "continuity.default-authority",
  version: "2.4.0",
  authorityWeights: {
    immutable: 1,
    retcon: 0.9,
    canon: 0.8,
    production: 0.65,
    proposal: 0.3,
    reference: 0.2,
  },
  roleWeightsByClaimKind: {
    identity: { intent: 1, decision: 1, configuration: 0.9, observation: 0.9, asset: 0.75, implementation: 0.7, test: 0.6, archive: 0.3, proposal: 0.25, reference: 0.4 },
    normative: { decision: 1, intent: 0.95, test: 0.55, configuration: 0.5, implementation: 0.35, observation: 0.3, proposal: 0.2, archive: 0.15, reference: 0.2 },
    configured: { configuration: 1, implementation: 0.8, test: 0.65, decision: 0.55, intent: 0.5, observation: 0.45, proposal: 0.2, archive: 0.15, reference: 0.2 },
    implemented: { observation: 1, implementation: 0.95, test: 0.8, configuration: 0.7, decision: 0.45, intent: 0.4, proposal: 0.2, archive: 0.15, reference: 0.2 },
    tested: { test: 1, observation: 0.75, implementation: 0.7, configuration: 0.6, decision: 0.4, intent: 0.35, proposal: 0.15, archive: 0.15, reference: 0.2 },
    observed: { observation: 1, implementation: 0.75, test: 0.6, configuration: 0.5, decision: 0.35, intent: 0.3, proposal: 0.1, archive: 0.25, reference: 0.3 },
    causal: { implementation: 1, test: 0.9, configuration: 0.85, observation: 0.8, decision: 0.65, intent: 0.6, asset: 0.4, proposal: 0.25, archive: 0.2, reference: 0.25 },
    historical: { archive: 1, observation: 0.9, decision: 0.7, intent: 0.6, implementation: 0.45, test: 0.4, configuration: 0.4, proposal: 0.3, reference: 0.5 },
  },
  allowedUsesByRole: DEFAULT_ALLOWED_USES,
  allowedUsesByAuthority: {
    immutable: Object.fromEntries(everyClaimKind.map((kind) => [kind, establish])),
    canon: Object.fromEntries(everyClaimKind.map((kind) => [kind, establish])),
    retcon: Object.fromEntries(everyClaimKind.map((kind) => [kind, establish])),
    production: Object.fromEntries(everyClaimKind.map((kind) => [kind, establish])),
    proposal: Object.fromEntries(everyClaimKind.map((kind) => [kind, propose])),
    reference: {
      identity: establish,
      historical: establish,
      normative: contextualize,
      configured: contextualize,
      implemented: contextualize,
      tested: contextualize,
      observed: contextualize,
      causal: contextualize,
    },
  } as AuthorityPolicy["allowedUsesByAuthority"],
  allowedUsesByAssertionScope: {
    project_truth: Object.fromEntries(everyClaimKind.map((kind) => [kind, establish])),
    // This establishes only that a pinned source states the proposition. The
    // conclusion and top-level truthStatus retain that narrower plane.
    source_assertion: Object.fromEntries(everyClaimKind.map((kind) => [kind, establish])),
    proposal: Object.fromEntries(everyClaimKind.map((kind) => [kind, propose])),
  } as AuthorityPolicy["allowedUsesByAssertionScope"],
  sourceRules: DEFAULT_RULES,
  excludedRoles: ["evaluation"],
  protectedAuthorities: ["immutable"],
  maxEvidence: 24,
  minimumPerLane: 1,
  maxRetrievalLanes: 5,
  maxResultsPerLane: 10,
};

export type EvidenceProfile = {
  path: string;
  role: EvidenceRole;
  lifecycle: EvidenceLifecycle;
  claimKinds: ClaimKind[];
  classification: "explicit" | "policy" | "heuristic";
};

export function classifyEvidence(
  chunk: Pick<EvidenceChunk, "title" | "locator" | "role" | "lifecycle" | "claimKinds">,
  policy: AuthorityPolicy = DEFAULT_AUTHORITY_POLICY,
): EvidenceProfile {
  const path = evidencePath(chunk.title, chunk.locator);
  if (chunk.role) {
    return {
      path,
      role: chunk.role,
      lifecycle: chunk.lifecycle ?? lifecycleForRole(chunk.role),
      claimKinds: chunk.claimKinds?.length ? [...new Set(chunk.claimKinds)] : claimKindsForRole(chunk.role),
      classification: "explicit",
    };
  }

  const rule = policy.sourceRules.find((candidate) => globMatches(path, candidate.pathPattern));
  if (rule) {
    return {
      path,
      role: rule.role,
      lifecycle: chunk.lifecycle ?? rule.lifecycle ?? lifecycleForRole(rule.role),
      claimKinds: chunk.claimKinds?.length
        ? [...new Set(chunk.claimKinds)]
        : rule.claimKinds?.length ? [...new Set(rule.claimKinds)] : claimKindsForRole(rule.role),
      classification: "policy",
    };
  }

  const role = heuristicRole(path);
  return {
    path,
    role,
    lifecycle: chunk.lifecycle ?? lifecycleForRole(role),
    claimKinds: chunk.claimKinds?.length ? [...new Set(chunk.claimKinds)] : claimKindsForRole(role),
    classification: "heuristic",
  };
}

export function classifyRepositoryPath(path: string, policy: AuthorityPolicy = DEFAULT_AUTHORITY_POLICY): EvidenceProfile {
  return classifyEvidence({ title: path, locator: path }, policy);
}

export function evidencePath(title: string, locator: string): string {
  const repositoryLocator = locator.match(/github:[a-f\d]+\/(.+)$/i)?.[1];
  return normalizePath(repositoryLocator || title || locator);
}

function heuristicRole(path: string): EvidenceRole {
  const basename = path.split("/").pop() ?? path;
  const stem = basename.replace(/\.[^.]+$/, "");
  if (/(?:^|[-_.])(evals?|evaluation|benchmarks?|rubric|grader|gold[-_]?key|answer[-_]?key)(?:[-_.]|$)/i.test(stem)) return "evaluation";
  if (/(?:^|\/)(?:fixture|fixtures|__fixture__|__fixtures__)(?:\/|$)/i.test(path)
    && /(?:^|[-_.])(expected|answer|gold|oracle)(?:[-_.]|$)/i.test(stem)) return "evaluation";
  // Lifecycle-bearing filenames are common outside carefully organized
  // repositories. Classify the filename itself before its extension so a
  // DRAFT.yaml cannot masquerade as active configuration.
  if (/(?:^|[-_.])(archived?|historical|legacy|obsolete)(?:[-_.]|$)/i.test(stem)) return "archive";
  if (/(?:^|[-_.])(draft|proposal|proposed|experiment)(?:[-_.]|$)/i.test(stem)) return "proposal";
  if (/^(agents|readme)\.md$/i.test(basename) || /(?:contract|policy|charter|requirements?|specification)\b/i.test(basename)) return "intent";
  if (/(?:^|[-_.])(adr|decision)(?:[-_.]|$)/i.test(basename)) return "decision";
  if (/(?:^|[-_.])(test|tests|spec)(?:[-_.]|$)/i.test(basename) || /\.(?:test|spec)\.[a-z\d]+$/i.test(basename)) return "test";
  // A structured serialization format describes *what kind of file it is*,
  // not what authority role its contents play. Story, canon, cast, and event
  // sources remain narrative intent even when encoded as YAML/CSV/JSON. An
  // explicit config/settings path retains configuration semantics.
  if (isStructuredOrDocument(basename) && isConfigurationPath(path)) return "configuration";
  if (isStructuredOrDocument(basename) && isNarrativeSourcePath(path, stem)) return "intent";
  if (/\.(?:json|ya?ml|toml|ini|csv|tsv|properties)$/i.test(basename)) return "configuration";
  if (/\.(?:[cm]?[jt]sx?|py|rb|go|rs|java|kt|swift|cs|cpp|c|h|php|sh|sql)$/i.test(basename)) return "implementation";
  if (/(?:manifest|asset|art|visual|sprite|image)/i.test(path)) return "asset";
  if (/(?:release|deploy|incident|audit|ledger|telemetry|observation)/i.test(path)) return "observation";
  return "reference";
}

function isStructuredOrDocument(basename: string): boolean {
  return /\.(?:json|ya?ml|toml|ini|csv|tsv|properties|md|mdx|txt|pdf|docx?|epub)$/i.test(basename);
}

function isConfigurationPath(path: string): boolean {
  return /(?:^|\/)(?:config|configs|configuration|settings)(?:\/|$)/i.test(path);
}

function isNarrativeSourcePath(path: string, stem: string): boolean {
  return /(?:^|\/)(?:canon|story|stories|narrative|characters?|events?)(?:\/|$)/i.test(path)
    || /(?:^|[-_.])(story|stories|canon|bible|character|characters|event|events|chapter|chapters|novel|manuscript|screenplay|script)(?:[-_.]|$)/i.test(stem);
}

function lifecycleForRole(role: EvidenceRole): EvidenceLifecycle {
  if (role === "archive") return "historical";
  if (role === "proposal") return "proposed";
  return "active";
}

function claimKindsForRole(role: EvidenceRole): ClaimKind[] {
  const byRole: Record<EvidenceRole, ClaimKind[]> = {
    intent: ["normative", "identity", "causal"],
    decision: ["normative", "identity", "causal"],
    configuration: ["configured", "causal"],
    implementation: ["implemented", "causal"],
    test: ["tested", "causal"],
    observation: ["observed", "historical"],
    proposal: ["normative", "causal", "historical"],
    archive: ["historical"],
    asset: ["identity", "implemented"],
    reference: ["identity", "historical"],
    evaluation: [],
  };
  return byRole[role];
}

function normalizePath(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\.\//, "").toLowerCase();
}

function globMatches(path: string, pattern: string): boolean {
  let normalizedPattern = normalizePath(pattern);
  const optionalLeadingDirectories = normalizedPattern.startsWith("**/");
  if (optionalLeadingDirectories) normalizedPattern = normalizedPattern.slice(3);
  const escaped = normalizedPattern
    .replace(/[.+^$()|[\]\\]/g, "\\$&")
    .replaceAll("**", "::DOUBLE_STAR::")
    .replaceAll("*", "[^/]*")
    .replaceAll("::DOUBLE_STAR::", ".*")
    .replaceAll("{", "(?:")
    .replaceAll("}", ")")
    .replaceAll(",", "|");
  const prefix = optionalLeadingDirectories ? "(?:.*/)?" : "";
  return new RegExp(`^${prefix}${escaped}$`, "i").test(normalizePath(path));
}
