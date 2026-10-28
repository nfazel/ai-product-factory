import { redactSecrets } from "@/modules/source-control/redact";

/**
 * Stages of an Independent Verification attempt that can stop without a product verdict.
 * Stored on the session so the Prove UI can say where the process stopped.
 */
export const VERIFICATION_FAILURE_STAGES = ["WORKSPACE_SETUP", "AGENT_PLAN", "AGENT_EXECUTE"] as const;

export type VerificationFailureStage = (typeof VERIFICATION_FAILURE_STAGES)[number];

const STAGE_LABEL: Record<VerificationFailureStage, string> = {
  WORKSPACE_SETUP: "Creating the isolated verification workspace",
  AGENT_PLAN: "Verification Agent planning (conditions, plan, test cases, coverage)",
  AGENT_EXECUTE: "Verification execution (test runs, technical checks, AI interpretation)",
};

export function isVerificationFailureStage(value: string): value is VerificationFailureStage {
  return (VERIFICATION_FAILURE_STAGES as readonly string[]).includes(value);
}

/** Human-readable stage, or null when the attempt predates stage recording. */
export function failureStageLabel(stage: string | null | undefined): string | null {
  return stage && isVerificationFailureStage(stage) ? STAGE_LABEL[stage] : null;
}

/**
 * Patterns that must never reach the database or the UI. Capture group 1 keeps the key name
 * (for example `api_key=`) so the redacted text still says what was withheld.
 */
const SECRET_PATTERNS: { pattern: RegExp; replacement: string }[] = [
  { pattern: /\b(?:sk|pk|rk)-[A-Za-z0-9_-]{8,}/g, replacement: "[redacted]" },
  { pattern: /\bAIza[0-9A-Za-z_-]{20,}/g, replacement: "[redacted]" },
  { pattern: /\bgithub_pat_[A-Za-z0-9_]+/g, replacement: "[redacted]" },
  { pattern: /\b(?:ghp|gho|ghs|ghu|ghr)_[A-Za-z0-9_]+/g, replacement: "[redacted]" },
  { pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, replacement: "Bearer [redacted]" },
  { pattern: /\b(postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s"']+/gi, replacement: "$1://[redacted]" },
  {
    pattern: /\b((?:[A-Za-z0-9]+[_-])*(?:api[_-]?key|token|secret|password|passwd|authorization|credential)s?)(\s*[=:]\s*)["']?[^\s"',;]+/gi,
    replacement: "$1$2[redacted]",
  },
];

/**
 * Prepares a technical error message for storage and display: removes known secrets, masks
 * credential-shaped values, collapses whitespace and bounds the length.
 */
export function sanitizeFailureDetail(message: string, limit = 600): string {
  let text = redactSecrets(message ?? "");
  for (const { pattern, replacement } of SECRET_PATTERNS) {
    text = text.replace(pattern, replacement);
  }
  text = text.replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}
