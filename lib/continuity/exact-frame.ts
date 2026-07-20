/**
 * Conservative shape checks for model-proposed exact claim frames. These
 * checks prove only that parts were copied from a quote in the declared order;
 * they do not claim to solve grammar or natural-language entailment.
 */
export type ExactFrameArity = "transitive" | "intransitive";

export type ExactClaimFrame = {
  quote: string;
  subject: string;
  predicate: string;
  object: string;
  frameArity?: ExactFrameArity;
};
export type ExactFrameSpan = { start: number; end: number };

const TERMINAL_TAIL = /^[\p{P}\p{Z}\s]*$/u;
const MEANINGFUL_OBJECT = /[\p{L}\p{N}\p{S}]/u;
// These are deliberately conservative surface boundaries. They keep a model
// from assembling a frame out of neighboring clauses while making no claim to
// solve grammar or semantic roles.
const CLAUSE_BOUNDARY = /[.!?;:\r\n\u2013\u2014\u2026]|,\s*(?:and|but|or|yet)\b/iu;
const TEMPORAL_CLAUSE_BOUNDARY = /[.!?;\r\n\u2013\u2014\u2026]|,\s*(?:and|but|or|yet)\b/iu;
const SINGLE_TOKEN_PREDICATE = /^[\p{L}\p{N}_'\u2019-]+$/u;

export function exactClaimFrameAppearsInOrder(frame: ExactClaimFrame): boolean {
  const subjectAt = frame.quote.indexOf(frame.subject);
  const predicateAt = subjectAt < 0
    ? -1
    : frame.quote.indexOf(frame.predicate, subjectAt + frame.subject.length);
  if (subjectAt < 0 || predicateAt < 0) return false;
  if (CLAUSE_BOUNDARY.test(frame.quote.slice(subjectAt + frame.subject.length, predicateAt))) return false;

  if (frame.object === "") {
    if (frame.frameArity !== "intransitive") return false;
    // We cannot prove grammatical arity without a language parser. Requiring
    // one copied predicate token prevents a whole expressed object from being
    // smuggled into the predicate (for example, "opened the hatch").
    if (!SINGLE_TOKEN_PREDICATE.test(frame.predicate)) return false;
    return TERMINAL_TAIL.test(frame.quote.slice(predicateAt + frame.predicate.length));
  }

  if (frame.frameArity === "intransitive" || !MEANINGFUL_OBJECT.test(frame.object)) return false;
  const objectAt = frame.quote.indexOf(frame.object, predicateAt + frame.predicate.length);
  return objectAt >= 0
    && !CLAUSE_BOUNDARY.test(frame.quote.slice(predicateAt + frame.predicate.length, objectAt));
}

export function exactClaimFrameSpan(frame: ExactClaimFrame): ExactFrameSpan | null {
  const subjectAt = frame.quote.indexOf(frame.subject);
  const predicateAt = subjectAt < 0
    ? -1
    : frame.quote.indexOf(frame.predicate, subjectAt + frame.subject.length);
  if (subjectAt < 0 || predicateAt < 0) return null;
  const objectAt = frame.object
    ? frame.quote.indexOf(frame.object, predicateAt + frame.predicate.length)
    : -1;
  if (frame.object && objectAt < 0) return null;
  return {
    start: subjectAt,
    end: frame.object ? objectAt + frame.object.length : predicateAt + frame.predicate.length,
  };
}

export function exactSpansShareClause(text: string, left: ExactFrameSpan, right: ExactFrameSpan): boolean {
  const gapStart = Math.min(left.end, right.end);
  const gapEnd = Math.max(left.start, right.start);
  if (gapEnd <= gapStart) return true;
  return !CLAUSE_BOUNDARY.test(text.slice(gapStart, gapEnd));
}

/**
 * Temporal labels commonly use a colon (`Day 8: Alice arrives`). Permit that
 * one presentation form while retaining every other conservative boundary.
 */
export function exactTemporalMarkerSharesClause(
  text: string,
  marker: ExactFrameSpan,
  frame: ExactFrameSpan,
): boolean {
  const gapStart = Math.min(marker.end, frame.end);
  const gapEnd = Math.max(marker.start, frame.start);
  if (gapEnd <= gapStart) return true;
  const gap = text.slice(gapStart, gapEnd);
  if (TEMPORAL_CLAUSE_BOUNDARY.test(gap)) return false;
  const withoutOneLabelColon = gap.replace(/^\s*:\s*$/u, "");
  return !withoutOneLabelColon.includes(":");
}

export function exactClaimFramePolarityMatches(
  frame: ExactClaimFrame,
  polarity: "positive" | "negative",
): boolean {
  const subjectAt = frame.quote.indexOf(frame.subject);
  const predicateAt = subjectAt < 0
    ? -1
    : frame.quote.indexOf(frame.predicate, subjectAt + frame.subject.length);
  if (subjectAt < 0 || predicateAt < 0) return false;
  const objectAt = frame.object
    ? frame.quote.indexOf(frame.object, predicateAt + frame.predicate.length)
    : -1;
  if (frame.object && objectAt < 0) return false;
  const end = frame.object ? objectAt + frame.object.length : predicateAt + frame.predicate.length;
  const immediatePrefix = frame.quote.slice(0, subjectAt).match(/\b(?:no|not|neither)\s*$/i)?.[0] ?? "";
  const window = `${immediatePrefix}${frame.quote.slice(subjectAt, end)}`
    .toLocaleLowerCase("en-US")
    .replace(/\bnot only\b/g, "");
  const negated = /\b(?:no|not|never|neither|nor|cannot|can't|doesn't|does not|didn't|did not|isn't|is not|wasn't|was not|without|lacks?|lacking|absent|missing|fails? to|failed to)\b/.test(window);
  return polarity === "negative" ? negated : !negated;
}
