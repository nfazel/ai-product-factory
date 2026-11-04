/**
 * When the Builder may approve code by itself. These are checked in addition to the checks that already stop anyone approving
 * code (required checks passed, nothing outside the plan, no open escalation). Pure, so the rules can be read and tested alone.
 */
export type CodeGuardrailInput = {
  riskLevel: string;
  riskCeiling: string;
  fileCount: number;
  maxFiles: number | null;
  openEscalations: number;
};

export type Guardrail = { ok: true } | { ok: false; reasons: string[] };

export function codeGuardrails(input: CodeGuardrailInput): Guardrail {
  const reasons: string[] = [];
  if (input.riskLevel !== input.riskCeiling) {
    reasons.push(`This task is ${input.riskLevel} risk. The Builder only approves ${input.riskCeiling} risk code, so it needs you.`);
  }
  if (input.maxFiles !== null && input.fileCount > input.maxFiles) {
    reasons.push(`The change touches ${input.fileCount} files and the limit is ${input.maxFiles}, so it needs you.`);
  }
  if (input.openEscalations > 0) {
    reasons.push("There is an open escalation, so it needs you.");
  }
  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}
