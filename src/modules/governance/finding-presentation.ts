import type { FindingSeverityName, FindingStatusName } from "@/domain/constants";
import { FINDING_SEVERITY_LABEL, FINDING_STATUS_LABEL } from "@/domain/constants";
import { workItemPrefix } from "@/modules/traceability/references";

export const RISK_RATIONALE_MIN = 12;

export type FindingDecisionInput = {
  severity: FindingSeverityName | string;
  status: FindingStatusName | string;
  dueBeforeCoding: boolean;
};

export type GovernanceCheckOutcome = "passed" | "risk-accepted" | "open" | "blocking";

const STATUS_MEANING: Record<FindingStatusName, string> = {
  OPEN: "Open. This issue still needs a decision.",
  ACCEPTED: "Acknowledged. This is not a resolution and not a risk acceptance.",
  MITIGATED: "Resolved. The underlying issue has been addressed.",
  RISK_ACCEPTED: "Risk accepted. The issue still exists, and a person has accepted the residual risk.",
  CLOSED: "Closed. This is not the same as accepting the residual risk.",
};

export function findingStatusMeaning(status: FindingStatusName | string) {
  if (status in STATUS_MEANING) return STATUS_MEANING[status as FindingStatusName];
  return FINDING_STATUS_LABEL[status as FindingStatusName] ?? status;
}

/** Coding stays closed only while a critical finding, or a high finding due before coding, is still open. */
export function findingBlocksProgression(finding: FindingDecisionInput) {
  if (finding.status !== "OPEN") return false;
  if (finding.severity === "CRITICAL") return true;
  return finding.severity === "HIGH" && finding.dueBeforeCoding;
}

/**
 * The existing waiver is an explicit risk acceptance with a rationale.
 * Marking a finding ACCEPTED is not that waiver and cannot clear a blocker.
 * Every severity may be risk-accepted; high and critical acceptance still requires the rationale.
 */
export function findingDecisionError(
  finding: FindingDecisionInput,
  nextStatus: FindingStatusName | string,
  rationale: string,
) {
  const note = rationale.trim();
  if (nextStatus === "ACCEPTED") {
    return "Accepting the finding is not a risk decision. Mark it resolved, or accept the residual risk with a rationale.";
  }
  if (nextStatus === "CLOSED" && findingBlocksProgression(finding)) {
    return "This finding blocks progression. Resolve it, or accept the residual risk with a rationale.";
  }
  if (nextStatus === "RISK_ACCEPTED" && note.length < RISK_RATIONALE_MIN) {
    if (finding.severity === "HIGH" || finding.severity === "CRITICAL") {
      return "A rationale is required to accept a high or critical governance risk.";
    }
    return "A rationale is required to accept this risk.";
  }
  if (nextStatus === "MITIGATED" && note.length < RISK_RATIONALE_MIN) {
    return "Record how this finding was addressed before marking it resolved.";
  }
  return null;
}

export function progressionCopy(finding: FindingDecisionInput) {
  if (findingBlocksProgression(finding)) {
    return {
      blocks: true,
      label: "Blocks progression",
      text: "This issue must be resolved before Build can progress. This risk may be accepted by an authorised reviewer with a rationale.",
    };
  }
  return {
    blocks: false,
    label: "Does not block progression",
    text: "This risk may be accepted by an authorised reviewer with a rationale.",
  };
}

export function whyItMatters(finding: FindingDecisionInput & { evidence: string }) {
  const rule = progressionCopy(finding).text;
  const observed = finding.evidence.trim();
  return observed ? `${rule} ${observed}` : rule;
}

export function findingDecisionConfirmation(finding: FindingDecisionInput) {
  if (finding.status === "RISK_ACCEPTED") {
    const cleared = finding.severity === "CRITICAL" || (finding.severity === "HIGH" && finding.dueBeforeCoding);
    return cleared
      ? "Risk accepted. Your rationale has been recorded. This finding no longer blocks progression. The issue itself is not resolved."
      : "Risk accepted. Your rationale has been recorded. This finding does not block progression, and it is not resolved.";
  }
  if (finding.status === "MITIGATED") {
    return "Finding marked resolved. This is different from accepting the risk. A resolved finding no longer blocks progression.";
  }
  if (finding.status === "OPEN") {
    return findingBlocksProgression({ ...finding, status: "OPEN" })
      ? "Finding reopened. This issue blocks progression until it is resolved or the residual risk is accepted."
      : "Finding reopened. It does not block progression, and it still needs a decision.";
  }
  return `Finding updated to ${findingStatusMeaning(finding.status)}`;
}

export function governanceNextActionLabel(input: {
  reviewRequired: boolean;
  openCritical: number;
  openHighBeforeCoding: number;
  openFindings: number;
}) {
  const blocking = input.openCritical + input.openHighBeforeCoding;
  if (input.reviewRequired || blocking > 0) {
    if (blocking === 1) return "Resolve 1 blocking governance issue";
    if (blocking > 1) return `Resolve ${blocking} blocking governance issues`;
    return "Resolve Engineering Finding";
  }
  if (input.openFindings === 1) return "Review 1 open governance finding";
  if (input.openFindings > 1) return `Review ${input.openFindings} open governance findings`;
  return null;
}

type Named = { referenceCode: string; title?: string; name?: string; description?: string; type?: string };

export type FindingTraceLink = {
  nfr: { referenceCode: string; title: string } | null;
  component: { referenceCode: string; name: string } | null;
  adr: { referenceCode: string; title: string } | null;
  task: { referenceCode: string; title: string } | null;
  workItem: { referenceCode: string; title: string; type: string } | null;
  assumption: { referenceCode: string; description: string } | null;
};

function coded(prefix: string, record: Named, label: string) {
  const code = record.referenceCode?.trim() || prefix;
  return `${code} — ${label}`;
}

export function findingTraceLines(links: FindingTraceLink[], findingTitle: string) {
  const lines: string[] = [];
  for (const link of links) {
    if (link.nfr) lines.push(coded("NFR", link.nfr, link.nfr.title));
    if (link.workItem) lines.push(coded(workItemPrefix(link.workItem.type), link.workItem, link.workItem.title));
    if (link.assumption) lines.push(coded("ASM", link.assumption, link.assumption.description));
    if (link.component) lines.push(coded("CMP", link.component, link.component.name));
    if (link.adr) lines.push(coded("ADR", link.adr, link.adr.title));
    if (link.task) lines.push(coded("TSK", link.task, link.task.title));
  }
  const sources = [...new Set(lines)];
  return [
    ...(sources.length > 0 ? sources : ["No linked requirement, component, or decision"]),
    "Governance finding",
    findingTitle,
  ];
}

export type ReviewCheckInput = {
  findings: FindingDecisionInput[];
  threats: { status: string }[];
  questions: { status: string; blocking: boolean }[];
  codingRisks: { riskLevel: string; overrideRiskLevel: string | null; overriddenBy: string }[];
};

export function summarizeGovernanceChecks(input: ReviewCheckInput) {
  const outcomes: GovernanceCheckOutcome[] = [];
  for (const finding of input.findings) {
    if (finding.status === "MITIGATED" || finding.status === "CLOSED") outcomes.push("passed");
    else if (finding.status === "RISK_ACCEPTED") outcomes.push("risk-accepted");
    else if (findingBlocksProgression(finding)) outcomes.push("blocking");
    else outcomes.push("open");
  }
  for (const threat of input.threats) {
    if (threat.status === "MITIGATED" || threat.status === "CLOSED") outcomes.push("passed");
    else if (threat.status === "ACCEPTED") outcomes.push("risk-accepted");
    else outcomes.push("open");
  }
  for (const question of input.questions) {
    if (question.status !== "OPEN") outcomes.push("passed");
    else if (question.blocking) outcomes.push("blocking");
    else outcomes.push("open");
  }
  for (const risk of input.codingRisks) {
    const level = risk.overrideRiskLevel ?? risk.riskLevel;
    if (level === "PROHIBITED" && risk.overriddenBy.trim().length === 0) outcomes.push("blocking");
    else outcomes.push("passed");
  }
  const count = (outcome: GovernanceCheckOutcome) => outcomes.filter((item) => item === outcome).length;
  const blocking = count("blocking");
  const open = count("open");
  return {
    total: outcomes.length,
    passed: count("passed"),
    riskAccepted: count("risk-accepted"),
    open,
    blocking,
    complete: blocking === 0 && open === 0 && outcomes.length > 0,
  };
}

export function severityLabel(severity: string) {
  return FINDING_SEVERITY_LABEL[severity as FindingSeverityName] ?? severity;
}
