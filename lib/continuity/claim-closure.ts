export const CLAIM_CLOSURE_VERSION = "continuity.claim-closure.v1" as const;

export type ClaimClosureDocument = {
  id?: string;
  name: string;
  text: string;
  locator?: string;
};

export type ClaimSurfaceStatement = {
  id: string;
  text: string;
  start: number;
  end: number;
  mode: "assertion" | "proposal" | "question";
  numberIds: string[];
  citationIds: string[];
  identifierIds: string[];
};

export type NumericClaim = {
  id: string;
  statementId: string;
  surface: string;
  kind: "currency" | "percent" | "number";
  normalized: string;
  stance: "asserted" | "rejected" | "questioned";
  status: "matched" | "refuted" | "conflicted" | "unverified";
  evidence: Array<{ document: string; locator: string; excerpt: string }>;
};

export type LocatorClaim = {
  id: string;
  statementId: string;
  surface: string;
  path: string;
  lineStart: number | null;
  lineEnd: number | null;
  status: "verified" | "mismatch" | "unavailable";
  evidence: Array<{ document: string; locator: string; excerpt: string }>;
  reason: string;
};

export type IdentifierClaim = {
  id: string;
  statementId: string;
  surface: string;
  status: "existing" | "proposed_new" | "unknown";
  evidence: Array<{ document: string; locator: string; excerpt: string }>;
};

export type ClaimClosureReceipt = {
  version: typeof CLAIM_CLOSURE_VERSION;
  status: "closed" | "needs_review" | "insufficient_evidence";
  safeForFinalAnswer: boolean;
  profile: {
    risk: "low" | "standard" | "high";
    materialStatements: number;
    numericClaims: number;
    suppliedCitations: number;
    identifiers: number;
    requiresBroadRetrieval: boolean;
    reasons: string[];
  };
  statements: Array<ClaimSurfaceStatement & {
    status: "verified" | "proposal" | "unverified" | "conflicted";
    reasons: string[];
  }>;
  numbers: NumericClaim[];
  citations: LocatorClaim[];
  identifiers: IdentifierClaim[];
  unresolved: string[];
};

export type RequestCoverageReceipt = {
  version: typeof CLAIM_CLOSURE_VERSION;
  checked: boolean;
  safeForFinalAnswer: boolean;
  findings: Array<{
    id: string;
    requestStatementId: string;
    kind: "number" | "locator" | "identifier";
    surface: string;
    status: "addressed" | "omitted";
    answerStatementIds: string[];
    reason: string;
  }>;
  unaddressed: string[];
};

type RawNumber = Omit<NumericClaim, "status" | "evidence">;
type RawCitation = Omit<LocatorClaim, "status" | "evidence" | "reason">;
type RawIdentifier = Omit<IdentifierClaim, "status" | "evidence">;

export type ClaimSurfaceProfile = {
  version: typeof CLAIM_CLOSURE_VERSION;
  profile: ClaimClosureReceipt["profile"];
  statements: ClaimSurfaceStatement[];
  numbers: RawNumber[];
  citations: RawCitation[];
  identifiers: RawIdentifier[];
};

const STOPWORDS = new Set([
  "about", "after", "again", "against", "also", "among", "because", "before", "being", "between",
  "could", "does", "from", "have", "into", "just", "more", "must", "only", "other", "should", "some",
  "such", "than", "that", "their", "them", "then", "there", "these", "they", "this", "those", "through",
  "under", "using", "very", "what", "when", "where", "which", "while", "with", "would", "your",
]);

const PROPOSAL_RE = /\b(?:propos(?:e|ed|al)|draft|should|could|would|may|might|add|create|introduce|register|rename|replace|change|new field|new flag|pending approval)\b/i;
const ASSERTION_RE = /\b(?:is|are|was|were|has|have|had|does|do|did|must|cannot|can't|never|always|requires?|precedes?|follows?|pays?|costs?|leads?|reports?|writes?|fires?|becomes?|remains?|ends?|starts?)\b/i;
const PATH_EXT_RE = /\.(?:md|mdx|txt|log|html?|pdf|docx?|xlsx?|json|ya?ml|toml|xml|csv|tsv|js|jsx|ts|tsx|py|go|rs|java|kt|swift|rb|php|cs|cpp|c|h)$/i;

export function profileClaimSurface(text: string): ClaimSurfaceProfile {
  const statements: ClaimSurfaceStatement[] = splitStatements(text).slice(0, 64).map((statement, index): ClaimSurfaceStatement => {
    const id = `ST-${String(index + 1).padStart(3, "0")}`;
    const mode = statement.text.trim().endsWith("?")
      ? "question" as const
      : PROPOSAL_RE.test(statement.text) ? "proposal" as const : "assertion" as const;
    return { ...statement, id, mode, numberIds: [], citationIds: [], identifierIds: [] };
  }).filter((statement) => isMaterialStatement(statement.text, statement.mode));

  const numbers: RawNumber[] = [];
  const citations: RawCitation[] = [];
  const identifiers: RawIdentifier[] = [];
  for (const statement of statements) {
    for (const value of extractNumbers(statement.text)) {
      const id = `NUM-${String(numbers.length + 1).padStart(3, "0")}`;
      numbers.push({ id, statementId: statement.id, ...value });
      statement.numberIds.push(id);
    }
    for (const value of extractCitations(statement.text)) {
      const id = `CIT-${String(citations.length + 1).padStart(3, "0")}`;
      citations.push({ id, statementId: statement.id, ...value });
      statement.citationIds.push(id);
    }
    for (const surface of extractIdentifiers(statement.text)) {
      const id = `ID-${String(identifiers.length + 1).padStart(3, "0")}`;
      identifiers.push({ id, statementId: statement.id, surface });
      statement.identifierIds.push(id);
    }
  }

  const reasons: string[] = [];
  if (statements.length >= 4) reasons.push("The request contains several independently checkable statements.");
  if (numbers.length >= 2) reasons.push("Several numeric values require exact comparison rather than semantic similarity.");
  if (citations.length) reasons.push("Caller-supplied locators must be checked against their claimed passages.");
  if (identifiers.length >= 2) reasons.push("Several exact identifiers require registry or source verification.");
  const risk = statements.length >= 8 || numbers.length >= 3 || citations.length >= 2 || identifiers.length >= 4
    ? "high" as const
    : statements.length >= 3 || numbers.length || citations.length || identifiers.length >= 2
      ? "standard" as const : "low" as const;

  return {
    version: CLAIM_CLOSURE_VERSION,
    profile: {
      risk,
      materialStatements: statements.length,
      numericClaims: numbers.length,
      suppliedCitations: citations.length,
      identifiers: identifiers.length,
      requiresBroadRetrieval: risk === "high" || statements.length >= 4 || citations.length > 0 || numbers.length >= 2,
      reasons,
    },
    statements,
    numbers,
    citations,
    identifiers,
  };
}

export function auditClaimClosure(text: string, documents: ClaimClosureDocument[]): ClaimClosureReceipt {
  const profile = profileClaimSurface(text);
  const documentSentences = documents.flatMap((document) => splitStatements(document.text).map((statement) => ({
    document,
    ...statement,
    tokens: significantTokens(statement.text),
  })));
  const statementById = new Map(profile.statements.map((statement) => [statement.id, statement]));

  const numbers: NumericClaim[] = profile.numbers.map((claim) => {
    const statement = statementById.get(claim.statementId)!;
    const anchors = significantTokens(stripCitationsAndNumbers(statement.text));
    const candidates = documentSentences.filter((candidate) => tokenOverlap(anchors, candidate.tokens) >= requiredAnchorOverlap(anchors));
    const exact = candidates.filter((candidate) => extractNumbers(candidate.text)
      .some((number) => number.kind === claim.kind && number.normalized === claim.normalized));
    const alternatives = candidates.filter((candidate) => extractNumbers(candidate.text)
      .some((number) => number.kind === claim.kind && number.normalized !== claim.normalized));
    const status = exact.length ? "matched" as const
      : alternatives.length && claim.stance === "rejected" ? "refuted" as const
        : alternatives.length ? "conflicted" as const : "unverified" as const;
    const chosen = exact.length ? exact : alternatives;
    return { ...claim, status, evidence: chosen.slice(0, 4).map(evidenceForSentence) };
  });

  const citations: LocatorClaim[] = profile.citations.map((claim) => auditLocator(claim, statementById.get(claim.statementId)!, documents));
  const identifiers: IdentifierClaim[] = profile.identifiers.map((claim) => {
    const statement = statementById.get(claim.statementId)!;
    const exact = documents.flatMap((document) => exactOccurrences(document, claim.surface)).slice(0, 4);
    const status = exact.length
      ? "existing" as const
      : statement.mode === "proposal" && PROPOSAL_RE.test(statement.text)
        ? "proposed_new" as const : "unknown" as const;
    return { ...claim, status, evidence: exact };
  });

  const numberById = new Map(numbers.map((claim) => [claim.id, claim]));
  const citationById = new Map(citations.map((claim) => [claim.id, claim]));
  const identifierById = new Map(identifiers.map((claim) => [claim.id, claim]));
  const statements = profile.statements.map((statement) => {
    const reasons: string[] = [];
    const statementNumbers = statement.numberIds.map((id) => numberById.get(id)!).filter(Boolean);
    const statementCitations = statement.citationIds.map((id) => citationById.get(id)!).filter(Boolean);
    const statementIdentifiers = statement.identifierIds.map((id) => identifierById.get(id)!).filter(Boolean);
    if (statementNumbers.some((claim) => claim.status === "conflicted")) reasons.push("At least one asserted numeric value conflicts with a relevant source passage.");
    if (statementCitations.some((claim) => claim.status === "mismatch")) reasons.push("At least one supplied locator does not support the statement attached to it.");
    if (statementIdentifiers.some((claim) => claim.status === "unknown")) reasons.push("At least one exact identifier is neither present in the evidence nor declared as new.");
    if (statementNumbers.some((claim) => claim.status === "unverified")) reasons.push("At least one numeric value was not verified.");
    if (statementCitations.some((claim) => claim.status === "unavailable")) reasons.push("At least one supplied locator could not be checked from the submitted evidence.");

    let status: "verified" | "proposal" | "unverified" | "conflicted";
    if (reasons.some((reason) => /conflicts|does not support/.test(reason))) status = "conflicted";
    else if (statement.mode === "proposal") status = "proposal";
    else if (reasons.length) status = "unverified";
    else if (statementNumbers.length || statementCitations.length || statementIdentifiers.length) status = "verified";
    else status = exactOrStrongParaphrase(statement.text, documentSentences) ? "verified" : "unverified";
    return { ...statement, status, reasons };
  });

  const unresolved = [
    ...numbers.filter((claim) => claim.status !== "matched" && claim.status !== "refuted").map((claim) => `${claim.id}: ${claim.surface} is ${claim.status}.`),
    ...citations.filter((claim) => claim.status !== "verified").map((claim) => `${claim.id}: ${claim.surface} is ${claim.status}.`),
    ...identifiers.filter((claim) => claim.status === "unknown").map((claim) => `${claim.id}: ${claim.surface} is not registered or declared as new.`),
    ...statements.filter((statement) => statement.status === "unverified" && !statement.numberIds.length && !statement.citationIds.length && !statement.identifierIds.length)
      .map((statement) => `${statement.id}: no exact or strongly matching evidence was found.`),
  ];
  const conflicted = statements.some((statement) => statement.status === "conflicted");
  const safeForFinalAnswer = !conflicted && unresolved.length === 0;
  const status = safeForFinalAnswer ? "closed" as const
    : documents.length ? "needs_review" as const : "insufficient_evidence" as const;
  return { ...profile, status, safeForFinalAnswer, statements, numbers, citations, identifiers, unresolved };
}

/**
 * Compare a completed answer with the risky, exact claims in the request that
 * prompted it. This closes the omission gap: a draft cannot pass merely by
 * saying nothing about a bad amount, locator, or identifier in the request.
 */
export function auditRequestCoverage(
  request: string,
  draft: string,
  documents: ClaimClosureDocument[],
): RequestCoverageReceipt {
  if (!request.trim()) {
    return { version: CLAIM_CLOSURE_VERSION, checked: false, safeForFinalAnswer: true, findings: [], unaddressed: [] };
  }
  const requestAudit = auditClaimClosure(request, documents);
  const answerAudit = auditClaimClosure(draft, documents);
  const requestStatements = new Map(requestAudit.statements.map((statement) => [statement.id, statement]));
  const answerStatements = answerAudit.statements;
  const findings: RequestCoverageReceipt["findings"] = [];

  const matchingAnswerStatements = (statementId: string) => {
    const requestStatement = requestStatements.get(statementId);
    if (!requestStatement) return [];
    const anchors = significantTokens(stripCitationsAndNumbers(requestStatement.text));
    return answerStatements.filter((answer) => {
      const answerTokens = significantTokens(stripCitationsAndNumbers(answer.text));
      return tokenOverlap(anchors, answerTokens) >= requiredAnchorOverlap(anchors);
    });
  };

  for (const claim of requestAudit.numbers.filter((item) => item.status === "conflicted" || item.status === "unverified")) {
    const candidates = matchingAnswerStatements(claim.statementId);
    const candidateIds = new Set(candidates.map((item) => item.id));
    const answerNumbers = answerAudit.numbers.filter((item) => candidateIds.has(item.statementId));
    const addressed = answerNumbers.some((item) => item.status === "matched" || item.status === "refuted")
      || candidates.some((item) => item.text.includes(claim.surface) && correctionLanguage(item.text));
    findings.push({
      id: `REQ-${String(findings.length + 1).padStart(3, "0")}`,
      requestStatementId: claim.statementId,
      kind: "number",
      surface: claim.surface,
      status: addressed ? "addressed" : "omitted",
      answerStatementIds: candidates.map((item) => item.id),
      reason: addressed
        ? "The answer rejects the disputed value or supplies a source-matched value for the same claim."
        : "The request's disputed numeric claim was not corrected or otherwise addressed in the answer.",
    });
  }

  for (const claim of requestAudit.citations.filter((item) => item.status !== "verified")) {
    const candidates = matchingAnswerStatements(claim.statementId);
    const locatorSignals = [claim.path.split(/[\\/]/).at(-1) ?? claim.path, claim.lineStart ? String(claim.lineStart) : ""]
      .filter(Boolean);
    const addressed = candidates.some((item) => locatorSignals.some((signal) => item.text.includes(signal)) && correctionLanguage(item.text));
    findings.push({
      id: `REQ-${String(findings.length + 1).padStart(3, "0")}`,
      requestStatementId: claim.statementId,
      kind: "locator",
      surface: claim.surface,
      status: addressed ? "addressed" : "omitted",
      answerStatementIds: candidates.map((item) => item.id),
      reason: addressed
        ? "The answer explicitly calls out the unsupported locator."
        : "The unsupported locator in the request was not explicitly called out in the answer.",
    });
  }

  for (const claim of requestAudit.identifiers.filter((item) => item.status === "unknown")) {
    const candidates = answerStatements.filter((item) => item.text.includes(claim.surface));
    const addressed = candidates.some((item) => correctionLanguage(item.text) || PROPOSAL_RE.test(item.text));
    findings.push({
      id: `REQ-${String(findings.length + 1).padStart(3, "0")}`,
      requestStatementId: claim.statementId,
      kind: "identifier",
      surface: claim.surface,
      status: addressed ? "addressed" : "omitted",
      answerStatementIds: candidates.map((item) => item.id),
      reason: addressed
        ? "The answer identifies the symbol as unsupported or explicitly proposes it as new."
        : "The request's unknown identifier was not identified as unsupported or proposed as new.",
    });
  }

  const unaddressed = findings.filter((finding) => finding.status === "omitted")
    .map((finding) => `${finding.id}: ${finding.kind} ${finding.surface} was omitted.`);
  return {
    version: CLAIM_CLOSURE_VERSION,
    checked: true,
    safeForFinalAnswer: answerAudit.safeForFinalAnswer && unaddressed.length === 0,
    findings,
    unaddressed,
  };
}

export function claimFocusText(text: string): string {
  const profile = profileClaimSurface(text);
  if (!profile.profile.requiresBroadRetrieval) return "";
  return profile.statements.slice(0, 24).map((statement) => {
    const signals = [
      ...statement.numberIds.map((id) => profile.numbers.find((claim) => claim.id === id)?.surface),
      ...statement.citationIds.map((id) => profile.citations.find((claim) => claim.id === id)?.surface),
      ...statement.identifierIds.map((id) => profile.identifiers.find((claim) => claim.id === id)?.surface),
    ].filter(Boolean).join(", ");
    return `- ${statement.text}${signals ? ` [exact checks: ${signals}]` : ""}`;
  }).join("\n");
}

function splitStatements(text: string): Array<{ text: string; start: number; end: number }> {
  const results: Array<{ text: string; start: number; end: number }> = [];
  let lineStart = 0;
  for (const line of text.split("\n")) {
    const prefix = line.match(/^\s*(?:[-*•]|\d+[.)])?\s*/)?.[0] ?? "";
    const body = line.slice(prefix.length);
    let segmentStart = 0;
    for (const segment of body.split(/(?<=[.!?])\s+(?=[A-Z0-9"'“‘`])/)) {
      const trimmed = segment.trim();
      if (trimmed) {
        const relative = body.indexOf(trimmed, segmentStart);
        const start = lineStart + prefix.length + Math.max(0, relative);
        results.push({ text: trimmed, start, end: start + trimmed.length });
        segmentStart = Math.max(segmentStart, relative + trimmed.length);
      }
    }
    lineStart += line.length + 1;
  }
  return dedupeBy(results, (item) => `${item.start}:${item.text}`);
}

function isMaterialStatement(text: string, mode: ClaimSurfaceStatement["mode"]): boolean {
  if (text.length < 5) return false;
  if (mode === "question") return extractNumbers(text).length > 0 || extractIdentifiers(text).length > 0 || extractCitations(text).length > 0;
  return ASSERTION_RE.test(text) || PROPOSAL_RE.test(text) || extractNumbers(text).length > 0
    || extractIdentifiers(text).length > 0 || extractCitations(text).length > 0;
}

function extractNumbers(text: string): Array<Pick<RawNumber, "surface" | "kind" | "normalized" | "stance">> {
  const values: Array<Pick<RawNumber, "surface" | "kind" | "normalized" | "stance">> = [];
  const occupied: Array<[number, number]> = [];
  for (const match of text.matchAll(/\[[^\]]*\]\([^)]+\)/g)) occupied.push([match.index!, match.index! + match[0].length]);
  for (const match of text.matchAll(/(?:line|lines|#L)\s*\d+(?:\s*[-–]\s*(?:L)?\d+)?/gi)) occupied.push([match.index!, match.index! + match[0].length]);
  const money = /(?:\bUSD\s*|\$)\s*\d[\d,]*(?:\.\d{1,2})?/gi;
  let match: RegExpExecArray | null;
  while ((match = money.exec(text)) !== null) {
    const numeric = match[0].replace(/USD|\$|,/gi, "").trim();
    values.push({ surface: match[0], kind: "currency", normalized: `usd-cent:${decimalMinor(numeric, 2)}`, stance: numericStance(text, match.index, match[0].length) });
    occupied.push([match.index, match.index + match[0].length]);
  }
  const percent = /\b\d[\d,]*(?:\.\d+)?\s*%/g;
  while ((match = percent.exec(text)) !== null) {
    values.push({ surface: match[0], kind: "percent", normalized: `percent:${canonicalDecimal(match[0].replace(/[%\s,]/g, ""))}`, stance: numericStance(text, match.index, match[0].length) });
    occupied.push([match.index, match.index + match[0].length]);
  }
  const plain = /\b\d[\d,]*(?:\.\d+)?\b/g;
  while ((match = plain.exec(text)) !== null) {
    if (occupied.some(([start, end]) => match!.index >= start && match!.index < end)) continue;
    const prefix = text.slice(Math.max(0, match.index - 8), match.index).toLowerCase();
    if (/line[s]?\s*$/.test(prefix) || /#l\s*$/.test(prefix)) continue;
    values.push({ surface: match[0], kind: "number", normalized: `number:${canonicalDecimal(match[0].replace(/,/g, ""))}`, stance: numericStance(text, match.index, match[0].length) });
  }
  return values;
}

function numericStance(text: string, start: number, length: number): NumericClaim["stance"] {
  const before = text.slice(Math.max(0, start - 30), start).toLowerCase();
  const after = text.slice(start + length, Math.min(text.length, start + length + 40)).toLowerCase();
  if (/\b(?:not|never|no|wrong|incorrect|false|unsupported|unapproved|rather than|instead of)\b[^.;:]{0,24}$/.test(before)
    || /^[^.;:]{0,24}\b(?:is not|was not|isn't|wasn't|wrong|incorrect|unsupported|unapproved|does not apply)\b/.test(after)) return "rejected";
  if (text.trim().endsWith("?") || /\b(?:whether|is it|could|would|does)\b[^?]{0,40}$/.test(before)) return "questioned";
  return "asserted";
}

function correctionLanguage(text: string): boolean {
  return /\b(?:not|never|no|wrong|incorrect|false|unsupported|unapproved|does not exist|isn't|wasn't|rather than|instead|actually|correct(?:ion|ed)?|conflicts?|mismatch|fabricated|propos(?:e|ed|al)|new)\b/i.test(text);
}

function extractCitations(text: string): Array<Pick<RawCitation, "surface" | "path" | "lineStart" | "lineEnd">> {
  const citations: Array<Pick<RawCitation, "surface" | "path" | "lineStart" | "lineEnd">> = [];
  const markdown = /\[[^\]]*\]\(([^)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = markdown.exec(text)) !== null) {
    const parsed = parseLocatorTarget(match[1]);
    if (parsed) citations.push({ surface: match[0], ...parsed });
  }
  const plain = /(?:^|\s)([A-Za-z0-9_./\\ -]+\.[A-Za-z0-9]{1,8})\s*(?:\(|,)?\s*(?:line|lines|#L)\s*(\d+)(?:\s*[-–]\s*(?:L)?(\d+))?\)?/gi;
  while ((match = plain.exec(text)) !== null) {
    const surface = match[0].trim();
    if (citations.some((citation) => citation.surface.includes(surface) || surface.includes(citation.surface))) continue;
    citations.push({ surface, path: match[1].trim(), lineStart: Number(match[2]), lineEnd: Number(match[3] ?? match[2]) });
  }
  return citations;
}

function parseLocatorTarget(target: string): { path: string; lineStart: number | null; lineEnd: number | null } | null {
  const decoded = target.replace(/^file:\/\//, "");
  const match = decoded.match(/^(.*?)(?:#L(\d+)(?:-L?(\d+))?|:(\d+))$/i);
  const path = (match?.[1] ?? decoded).trim();
  if (!PATH_EXT_RE.test(path)) return null;
  const start = Number(match?.[2] ?? match?.[4] ?? 0) || null;
  const end = Number(match?.[3] ?? match?.[2] ?? match?.[4] ?? 0) || null;
  return { path, lineStart: start, lineEnd: end };
}

function extractIdentifiers(text: string): string[] {
  const identifiers = new Set<string>();
  for (const match of text.matchAll(/`([^`\n]{2,160})`/g)) {
    const value = match[1].trim();
    if (!value.includes(" ") && !PATH_EXT_RE.test(value)) identifiers.add(value);
  }
  for (const match of text.matchAll(/\b([A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)?)\s*\(\s*\)/g)) identifiers.add(`${match[1]}()`);
  for (const match of text.matchAll(/\b(?:[A-Z]{2,}[A-Z0-9_]*-\d+[A-Z0-9_-]*|[a-z][a-z0-9]*(?:[_-][a-z0-9]+){1,})\b/g)) {
    const value = match[0];
    if (!/^(?:source-owned|server-owned|one-time|read-only|open-world|closed-world|long-running|machine-readable|human-reviewed|claim-level|line-number)$/i.test(value)) identifiers.add(value);
  }
  return [...identifiers].slice(0, 64);
}

function auditLocator(claim: RawCitation, statement: ClaimSurfaceStatement, documents: ClaimClosureDocument[]): LocatorClaim {
  const document = documents.find((candidate) => pathMatches(candidate.name, claim.path));
  if (!document || claim.lineStart === null) {
    return { ...claim, status: "unavailable", evidence: [], reason: "The cited file or line was not present in the submitted evidence." };
  }
  const lines = document.text.split(/\r?\n/);
  const baseLine = locatorStartLine(document.locator) ?? 1;
  const localStart = claim.lineStart - baseLine;
  const localEnd = (claim.lineEnd ?? claim.lineStart) - baseLine;
  if (localStart < 0 || localEnd >= lines.length || localEnd < localStart) {
    return { ...claim, status: "unavailable", evidence: [], reason: "The cited line falls outside the submitted excerpt." };
  }
  const excerpt = lines.slice(localStart, localEnd + 1).join("\n").trim();
  const claimTokens = significantTokens(stripCitationSurface(statement.text, claim.surface));
  const excerptTokens = significantTokens(excerpt);
  const overlap = tokenOverlap(claimTokens, excerptTokens);
  const verified = claimTokens.length === 0 || overlap >= requiredAnchorOverlap(claimTokens);
  return {
    ...claim,
    status: verified ? "verified" : "mismatch",
    evidence: [{ document: document.name, locator: `${document.name}#L${claim.lineStart}${claim.lineEnd && claim.lineEnd !== claim.lineStart ? `-L${claim.lineEnd}` : ""}`, excerpt }],
    reason: verified
      ? "The locator exists and its passage shares the material anchors of the attached statement."
      : "The locator exists, but its passage does not share the material anchors of the attached statement.",
  };
}

function exactOrStrongParaphrase(text: string, candidates: Array<{ text: string; tokens: string[] }>): boolean {
  const normalized = normalizeText(text);
  if (candidates.some((candidate) => normalizeText(candidate.text).includes(normalized) || normalized.includes(normalizeText(candidate.text)))) return true;
  const tokens = significantTokens(text);
  return tokens.length >= 3 && candidates.some((candidate) => tokenOverlap(tokens, candidate.tokens) / tokens.length >= 0.75);
}

function exactOccurrences(document: ClaimClosureDocument, surface: string) {
  const evidence: Array<{ document: string; locator: string; excerpt: string }> = [];
  let start = 0;
  while ((start = document.text.indexOf(surface, start)) >= 0 && evidence.length < 4) {
    const line = document.text.slice(0, start).split(/\r?\n/).length + (locatorStartLine(document.locator) ?? 1) - 1;
    const lineText = document.text.split(/\r?\n/)[line - (locatorStartLine(document.locator) ?? 1)] ?? surface;
    evidence.push({ document: document.name, locator: `${document.name}#L${line}`, excerpt: lineText.trim() });
    start += surface.length;
  }
  return evidence;
}

function evidenceForSentence(candidate: { document: ClaimClosureDocument; text: string; start: number }) {
  const line = candidate.document.text.slice(0, candidate.start).split(/\r?\n/).length + (locatorStartLine(candidate.document.locator) ?? 1) - 1;
  return { document: candidate.document.name, locator: `${candidate.document.name}#L${line}`, excerpt: candidate.text };
}

function locatorStartLine(locator?: string): number | null {
  const match = locator?.match(/#L(\d+)(?:-L?\d+)?/i);
  return match ? Number(match[1]) : null;
}

function pathMatches(documentName: string, suppliedPath: string): boolean {
  const normalize = (value: string) => value.replaceAll("\\", "/").replace(/^file:\/\//, "").replace(/^\.\//, "").toLowerCase();
  const left = normalize(documentName);
  const right = normalize(suppliedPath);
  return left === right || left.endsWith(`/${right}`) || right.endsWith(`/${left}`) || left.split("/").at(-1) === right.split("/").at(-1);
}

function stripCitationSurface(text: string, surface: string): string {
  return text.replace(surface, " ").replace(/\([^)]*line[s]?\s*\d+[^)]*\)/gi, " ");
}

function stripCitationsAndNumbers(text: string): string {
  let value = text.replace(/\[[^\]]*\]\([^)]+\)/g, " ");
  for (const number of extractNumbers(value)) value = value.replace(number.surface, " ");
  return value;
}

function significantTokens(text: string): string[] {
  return [...new Set((text.toLowerCase().replace(/[-_]/g, " ").match(/[a-z][a-z0-9']{2,}/g) ?? [])
    .map((token) => token.replace(/(?:'s|s)$/i, ""))
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token)))];
}

function tokenOverlap(left: string[], right: string[]): number {
  const set = new Set(right);
  return left.filter((token) => set.has(token)).length;
}

function requiredAnchorOverlap(tokens: string[]): number {
  if (tokens.length <= 1) return tokens.length;
  return Math.min(2, Math.ceil(tokens.length / 3));
}

function decimalMinor(value: string, scale: number): string {
  const [whole = "0", fraction = ""] = value.split(".");
  return (BigInt(whole || "0") * (10n ** BigInt(scale)) + BigInt((fraction + "0".repeat(scale)).slice(0, scale) || "0")).toString();
}

function canonicalDecimal(value: string): string {
  const [whole = "0", fraction = ""] = value.split(".");
  const normalizedWhole = whole.replace(/^0+(?=\d)/, "") || "0";
  const normalizedFraction = fraction.replace(/0+$/, "");
  return normalizedFraction ? `${normalizedWhole}.${normalizedFraction}` : normalizedWhole;
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function dedupeBy<T>(values: T[], key: (value: T) => string): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const id = key(value);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export const CLAIM_CLOSURE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["version", "status", "safeForFinalAnswer", "profile", "statements", "numbers", "citations", "identifiers", "unresolved"],
  properties: {
    version: { type: "string", enum: [CLAIM_CLOSURE_VERSION] },
    status: { type: "string", enum: ["closed", "needs_review", "insufficient_evidence"] },
    safeForFinalAnswer: { type: "boolean" },
    profile: {
      type: "object", additionalProperties: false,
      required: ["risk", "materialStatements", "numericClaims", "suppliedCitations", "identifiers", "requiresBroadRetrieval", "reasons"],
      properties: {
        risk: { type: "string", enum: ["low", "standard", "high"] },
        materialStatements: { type: "integer" }, numericClaims: { type: "integer" }, suppliedCitations: { type: "integer" }, identifiers: { type: "integer" },
        requiresBroadRetrieval: { type: "boolean" }, reasons: { type: "array", items: { type: "string" } },
      },
    },
    statements: { type: "array", items: { type: "object" } },
    numbers: { type: "array", items: { type: "object" } },
    citations: { type: "array", items: { type: "object" } },
    identifiers: { type: "array", items: { type: "object" } },
    unresolved: { type: "array", items: { type: "string" } },
  },
} as const;
