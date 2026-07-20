export type ExactRelationKind = "precondition" | "consequence" | "temporal_before";
export type ExactSpan = { start: number; end: number };
export type ExactRelationDirection = "from_before_to" | "to_before_from";

const UNSUPPORTED_RELATION_LOGIC = /\b(?:or|unless|either|otherwise|except(?:\s+when|\s+if)?)\b/i;
const RELATION_CLAIM_KINDS = new Set(["causal", "normative", "historical"]);

export function exactRelationClaimKindIsAdmissible(claimKind: string): boolean {
  return RELATION_CLAIM_KINDS.has(claimKind.trim().toLocaleLowerCase("en-US"));
}

export function exactRelationHasUnsupportedLogic(text: string): boolean {
  return UNSUPPORTED_RELATION_LOGIC.test(text);
}

export function exactRelationSupportIsAdmissible(input: {
  claimKind: string;
  polarity: "positive" | "negative";
  text: string;
}): boolean {
  return input.polarity === "positive"
    && exactRelationClaimKindIsAdmissible(input.claimKind)
    && !exactRelationHasUnsupportedLogic(input.text);
}

/**
 * A deliberately small English cue catalog. Unknown wording stays as visible
 * source prose instead of becoming a typed graph edge. This validates a
 * surface relation shape, not natural-language entailment.
 */
export function exactRelationCueDirection(
  cue: string,
  relation: ExactRelationKind,
): ExactRelationDirection | null {
  const value = cue.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
  if (relation === "precondition") {
    if (/^(?:only after|only if|only when|requires?|depends? on|contingent on|conditioned on)$/.test(value)) {
      return "to_before_from";
    }
    if (/^(?:prerequisite for|required before|must precede|must happen before)$/.test(value)) {
      return "from_before_to";
    }
    return null;
  }
  if (relation === "consequence") {
    if (value === "because") return "to_before_from";
    if (/^(?:causes?|caused|results? in|resulted in|leads? to|led to|triggers?|triggered|produces?|produced|therefore|so)$/.test(value)) {
      return "from_before_to";
    }
    return null;
  }
  if (/^(?:before|prior to|earlier than|precedes?|preceded)$/.test(value)) return "from_before_to";
  if (/^(?:after|later than|follows?|followed)$/.test(value)) return "to_before_from";
  return null;
}

export function exactRelationEndpointsMatch(
  direction: ExactRelationDirection,
  cue: ExactSpan,
  from: ExactSpan,
  to: ExactSpan,
  container: { start: number; text: string },
  intermediateSpans: ExactSpan[] = [],
): boolean {
  const gapIsOnlyBoundarySyntax = (start: number, end: number): boolean => {
    const localStart = start - container.start;
    const localEnd = end - container.start;
    if (localStart < 0 || localEnd < localStart || localEnd > container.text.length) return false;
    const directGap = container.text.slice(localStart, localEnd);
    if (/^[\p{P}\p{Z}\s]*$/u.test(directGap)) return true;

    // A single cue may govern an explicit AND-list ("only after A and B").
    // Remove only other independently accepted, non-overlapping endpoint
    // spans; every remaining character must be boundary syntax or `and`.
    const inside = intermediateSpans
      .filter((span) => span.start >= start && span.end <= end && span.end > span.start)
      .sort((left, right) => left.start - right.start || left.end - right.end);
    if (!inside.length) return false;
    let cursor = start;
    let residue = "";
    for (const span of inside) {
      if (span.start < cursor) continue;
      residue += container.text.slice(cursor - container.start, span.start - container.start);
      cursor = span.end;
    }
    residue += container.text.slice(cursor - container.start, end - container.start);
    return /^[\p{P}\p{Z}\s]*(?:and[\p{P}\p{Z}\s]*)+$/iu.test(residue.trim());
  };
  if (direction === "from_before_to") {
    return from.end <= cue.start && cue.end <= to.start
      && gapIsOnlyBoundarySyntax(from.end, cue.start)
      && gapIsOnlyBoundarySyntax(cue.end, to.start);
  }
  return to.end <= cue.start && cue.end <= from.start
    && gapIsOnlyBoundarySyntax(to.end, cue.start)
    && gapIsOnlyBoundarySyntax(cue.end, from.start);
}
