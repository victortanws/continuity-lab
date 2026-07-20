/**
 * Mark excerpts that try to control the evaluator rather than describe the
 * source domain. This is a conservative, chunk-level quarantine signal, not a
 * claim that every flagged span is malicious.
 */
export function detectEvidenceFlags(text: string, existing: string[] = []): string[] {
  const flags = new Set(existing);
  const normalized = text.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();

  const classicControlAttempt = /\b(?:ignore\s+(?:all|any|the)\s+(?:previous|prior|system)\s+instructions?|disregard\s+(?:every|all|the|any)?\s*(?:earlier|prior|previous)\s+(?:rules?|directions?|instructions?)|follow\s+(?:these|the)\s+new\s+(?:rules?|instructions?)|you\s+are\s+now|system\s+prompt)\b/i;
  const directedAtEvaluator = /\b(?:assistant|model|llm|ai\s+agent|agent|evaluator|grader|reviewer|judge)\s*(?::|,|\b(?:must|should|shall|needs?\s+to|is\s+to|please)\b)/i.test(normalized)
    || /\b(?:tell|instruct|direct|ask)\s+(?:the\s+)?(?:assistant|model|llm|ai\s+agent|agent|evaluator|grader|reviewer|judge)\s+to\b/i.test(normalized)
    || /\b(?:when|while|before)\s+(?:the\s+)?(?:assistant|model|llm|ai\s+agent|agent|evaluator|grader|reviewer|judge)\s+(?:answers?|responds?|evaluates?|reviews?|grades?|resolves?)\b/i.test(normalized)
    || /\b(?:in|for)\s+(?:your|the)\s+(?:answer|response|evaluation|review|verdict|score|output)\b/i.test(normalized);
  const ignoreAuthorityOrEvidence = /\b(?:ignore|disregard|override|bypass|skip|set\s+aside|do\s+not\s+(?:consult|follow|use)|don['’]?t\s+(?:consult|follow|use))\b.{0,140}\b(?:evidence|sources?|source\s+(?:priority|hierarchy)|authority|authority\s+(?:map|router)|canon|continuity|registr(?:y|ies)|identifiers?|entity\s+ids?|policy|policies|rubric|constraints?|conflicts?|ambiguity)\b/i;
  const suppressTrace = /\b(?:omit|suppress|hide|remove|drop|erase|exclude|do\s+not\s+(?:cite|mention|show|report|include)|don['’]?t\s+(?:cite|mention|show|report|include))\b.{0,140}\b(?:citations?|evidence|sources?|provenance|trace|conflicts?|ambiguity|uncertainty|caveats?)\b/i;
  const convenientIdentity = /\b(?:choose|pick|select|resolve|merge|collapse|treat)\b.{0,160}\b(?:identity|identities|referent|entity|entities|candidate|name|character)\b.{0,100}\b(?:convenient|easiest|simplest|whichever|first\s+available|makes?\s+the\s+answer\s+work)\b/i.test(normalized)
    || /\b(?:choose|pick|select|resolve|merge|collapse|treat)\b.{0,100}\b(?:convenient|easiest|simplest|whichever|first\s+available)\b.{0,160}\b(?:identity|identities|referent|entity|entities|candidate|name|character)\b/i.test(normalized);
  const invokeTools = /\b(?:use|call|invoke|run|open|browse|execute)\b.{0,120}\b(?:tool|tools|shell|terminal|browser|connector|function|command)\b/i;
  const exposeSecrets = /\b(?:reveal|print|return|expose|extract|read|send|leak|exfiltrate|access)\b.{0,140}\b(?:secret|secrets|token|tokens|api\s+keys?|credentials?|passwords?|environment\s+variables?|system\s+prompt)\b/i;
  const highRiskSecretTransfer = /\b(?:send|leak|exfiltrate)\b.{0,140}\b(?:secrets?|tokens?|api\s+keys?|credentials?|passwords?|environment\s+variables?)\b/i;

  if (classicControlAttempt.test(normalized)
    || highRiskSecretTransfer.test(normalized)
    || (directedAtEvaluator && (
      ignoreAuthorityOrEvidence.test(normalized)
      || suppressTrace.test(normalized)
      || convenientIdentity
      || invokeTools.test(normalized)
      || exposeSecrets.test(normalized)
    ))) flags.add("possible_prompt_injection");
  return [...flags];
}
