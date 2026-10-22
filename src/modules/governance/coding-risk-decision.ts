import type { CodingRiskDispositionName, CodingRiskLevelName } from "@/domain/constants";

export const CODING_RISK_NOTE_MIN = 12;

export type CodingRiskState = {
  riskLevel: CodingRiskLevelName | string;
  disposition: CodingRiskDispositionName | string;
  overriddenBy?: string;
};

/** A prohibited task blocks while the risk itself is still open. The recommendation override does not change that. */
export function codingRiskStillBlocks(risk: CodingRiskState) {
  return risk.disposition === "OPEN" && risk.riskLevel === "PROHIBITED";
}

export function codingRiskDecisionError(disposition: string, rationale: string) {
  if (disposition !== "OPEN") {
    return "This coding risk already has a human decision. Override the recommendation separately if the approach should change.";
  }
  if (rationale.trim().length < CODING_RISK_NOTE_MIN) {
    return "A rationale is required before this coding risk can change state.";
  }
  return null;
}

export function codingRiskImpact(level: string) {
  if (level === "PROHIBITED") {
    return "This task is prohibited for the coding assistant. It blocks this task until the risk is resolved or an authorised person accepts the residual risk.";
  }
  if (level === "HIGH") {
    return "A mistake here can affect authentication, customer data, or another sensitive control. The task does not block coding solely because the recommendation is high.";
  }
  if (level === "MEDIUM") {
    return "The change needs supervision. It does not block Build while the risk stays open.";
  }
  if (level === "LOW") {
    return "The change is small and bounded. It does not block Build while the risk stays open.";
  }
  return "The coding assessment records a risk for this implementation task.";
}

export function codingRiskStatusMeaning(disposition: string) {
  if (disposition === "RESOLVED") return "Resolved. The underlying issue has been addressed.";
  if (disposition === "RISK_ACCEPTED") return "Risk accepted. The issue still exists, and a person has accepted the residual risk.";
  return "Open. This risk still needs a decision or completed mitigation.";
}

export function recommendationOverridden(risk: { overriddenBy?: string }) {
  return Boolean(risk.overriddenBy?.trim());
}

export function overrideConfirmation(disposition: string) {
  if (disposition === "OPEN") {
    return "AI recommendation overridden. The risk remains open until the alternative mitigation is completed or the risk is accepted.";
  }
  if (disposition === "RISK_ACCEPTED") {
    return "AI recommendation overridden. The risk stays accepted, and the issue is not resolved.";
  }
  return "AI recommendation overridden. The risk stays resolved.";
}

export function acceptCodingRiskConfirmation(risk: CodingRiskState) {
  return codingRiskStillBlocks({ ...risk, disposition: "OPEN" })
    ? "Risk accepted. Your rationale has been recorded. This risk no longer blocks progression. The issue is not resolved."
    : "Risk accepted. Your rationale has been recorded. This risk does not block progression, and it is not resolved.";
}

export function resolveCodingRiskConfirmation() {
  return "Risk resolved.";
}

export function summarizeCodingRisks(risks: CodingRiskState[]) {
  return {
    open: risks.filter((risk) => risk.disposition === "OPEN").length,
    riskAccepted: risks.filter((risk) => risk.disposition === "RISK_ACCEPTED").length,
    resolved: risks.filter((risk) => risk.disposition === "RESOLVED").length,
  };
}
