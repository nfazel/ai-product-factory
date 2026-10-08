import { createHash } from "node:crypto";

import { redactSecrets } from "@/modules/source-control/redact";

export const OPERATIONAL_AREAS = [
  "MONITORING",
  "LOGGING",
  "ALERTING",
  "SUPPORT",
  "RUNBOOK",
  "ROLLBACK",
  "DEPENDENCIES",
  "DATA_MIGRATION",
  "CONFIGURATION",
  "FEATURE_FLAGS",
  "INCIDENT_RESPONSE",
] as const;

export const OPERATIONAL_AREA_LABEL: Record<(typeof OPERATIONAL_AREAS)[number], string> = {
  MONITORING: "Monitoring",
  LOGGING: "Logging",
  ALERTING: "Alerting",
  SUPPORT: "Support ownership",
  RUNBOOK: "Runbook",
  ROLLBACK: "Rollback",
  DEPENDENCIES: "Dependencies",
  DATA_MIGRATION: "Data migration",
  CONFIGURATION: "Configuration",
  FEATURE_FLAGS: "Feature flags",
  INCIDENT_RESPONSE: "Incident response",
};

const RISK_RANK = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 } as const;
const FAILED_CHECKS = new Set(["FAILURE", "TIMED_OUT", "CANCELLED", "ACTION_REQUIRED"]);

export type ReleaseLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type ReleasePullFact = {
  id: string;
  number: number;
  state: string;
  demo: boolean;
  headSha: string;
  mergeSha: string;
  mergedBy: string;
  mergedAt: string | null;
  requiredChecks: string[] | null;
  checks: { name: string; status: string; conclusion: string }[];
  reviews: { reviewer: string; state: string }[];
};

export type ReleaseTaskFact = {
  id: string;
  title: string;
  status: string;
  workItemId: string;
  storyTitle: string;
  featureTitle: string;
  epicTitle: string;
  criteria: { id: string; description: string }[];
  verifiedCriteria: string[];
  commitSha: string;
  verificationSessionId: string;
  verificationCommit: string;
  verificationApproved: boolean;
  verificationStale: boolean;
  verificationVerdict: string;
  codeApproved: boolean;
  pull: ReleasePullFact | null;
};

export type ReleaseFacts = {
  productId: string;
  slice: { id: string; name: string; status: string; description: string } | null;
  outcome: { id: string; title: string; successMeasure: string; target: string; status: string } | null;
  capability: { name: string } | null;
  governanceCurrent: boolean;
  policyCurrent: boolean;
  architectureApproved: boolean;
  architectureSummary: string;
  definitionApproved: boolean;
  tasks: ReleaseTaskFact[];
  defects: { id: string; title: string; priority: string; status: string }[];
  integrated: { id: string; verdict: string; gaps: string[] } | null;
};

export type PlanFact = {
  id: string;
  version: number;
  status: string;
  strategy: string;
  summary: string;
  rollbackTrigger: string;
  rollbackSteps: string;
  rollbackDataImplications: string;
  rollbackRole: string;
  rollbackVerification: string;
  rollbackUnavailable: boolean;
  rollbackAcknowledgement: string;
  rollbackAcknowledgedBy: string;
  checks: { phase: string; name: string; required: boolean; status: string; waiverRationale: string }[];
};

export type FactorDraft = {
  category: string;
  severity: ReleaseLevel;
  description: string;
  evidence: string;
  mitigation: string;
  blocking: boolean;
};

export type EvidenceDraft = {
  type: string;
  source: string;
  description: string;
  result: string;
  referenceId: string;
};

function verificationCurrent(task: ReleaseTaskFact) {
  if (!task.verificationApproved || task.verificationStale) return false;
  if (task.verificationVerdict !== "PASS" && task.verificationVerdict !== "PASS_WITH_CONCERNS") return false;
  if (task.pull && !task.pull.demo && task.pull.state === "MERGED" && task.pull.headSha && task.verificationCommit !== task.pull.headSha) {
    return false;
  }
  return true;
}

function mergedPull(task: ReleaseTaskFact) {
  return Boolean(task.pull && !task.pull.demo && task.pull.state === "MERGED" && task.pull.mergeSha);
}

export function entryBlockers(facts: ReleaseFacts) {
  const reasons: string[] = [];
  if (!facts.slice || facts.slice.status !== "APPROVED") reasons.push("The product slice is not approved.");
  if (facts.tasks.length === 0) reasons.push("The approved slice has no implementation tasks.");
  for (const task of facts.tasks) {
    if (task.status !== "COMPLETED") reasons.push(`Implementation task "${task.title}" is not completed.`);
    if (!verificationCurrent(task)) {
      reasons.push(`Implementation task "${task.title}" does not have current approved verification.`);
    }
    if (!mergedPull(task)) reasons.push(`Implementation task "${task.title}" does not have a merged pull request.`);
  }
  for (const defect of facts.defects) {
    if ((defect.priority === "CRITICAL" || defect.priority === "HIGH") && defect.status !== "DONE") {
      reasons.push(`${defect.priority} defect "${defect.title}" is still open.`);
    }
  }
  if (!facts.governanceCurrent) reasons.push("Engineering Governance is not current.");
  if (!facts.policyCurrent) reasons.push("Coding Policy is not current.");
  if (!facts.integrated) reasons.push("An integrated verification session has not been recorded.");
  return reasons;
}

function acknowledged(plan: PlanFact) {
  return plan.rollbackAcknowledgement.trim().length >= 12 && plan.rollbackAcknowledgedBy.trim().length > 0;
}

export function desiredRiskFactors(facts: ReleaseFacts, plan: PlanFact | null): FactorDraft[] {
  const factors: FactorDraft[] = [];
  const open = facts.defects.filter((defect) => defect.status !== "DONE");
  if (open.some((defect) => defect.priority === "CRITICAL")) {
    factors.push({
      category: "QUALITY",
      severity: "CRITICAL",
      description: "A critical defect is open.",
      evidence: open.filter((defect) => defect.priority === "CRITICAL").map((defect) => defect.title).join("; "),
      mitigation: "Resolve the defect or record a human risk acceptance.",
      blocking: true,
    });
  }
  if (open.some((defect) => defect.priority === "HIGH")) {
    factors.push({
      category: "QUALITY",
      severity: "HIGH",
      description: "A high defect is open.",
      evidence: open.filter((defect) => defect.priority === "HIGH").map((defect) => defect.title).join("; "),
      mitigation: "Resolve the defect or record a human risk acceptance.",
      blocking: true,
    });
  }
  if (facts.tasks.some((task) => task.criteria.some((criterion) => !task.verifiedCriteria.includes(criterion.id)))) {
    factors.push({
      category: "QUALITY",
      severity: "HIGH",
      description: "An acceptance criterion has no current verification.",
      evidence: "Verification coverage does not include every acceptance criterion.",
      mitigation: "Verify the criterion before release approval.",
      blocking: true,
    });
  }
  if (facts.tasks.some((task) => task.verificationStale || (task.pull && !task.pull.demo && task.pull.headSha && task.verificationCommit !== task.pull.headSha))) {
    factors.push({
      category: "QUALITY",
      severity: "HIGH",
      description: "Verification is stale for a released change.",
      evidence: "The verification commit does not match the current merged head.",
      mitigation: "Re-verify the merged commit.",
      blocking: true,
    });
  }
  if (facts.tasks.some((task) => !mergedPull(task))) {
    factors.push({
      category: "DEPLOYMENT",
      severity: "HIGH",
      description: "A required pull request is not merged.",
      evidence: "Release content includes an unmerged pull request.",
      mitigation: "Merge the pull request in GitHub and refresh it.",
      blocking: true,
    });
  }
  const ci = ciProblem(facts);
  if (ci) {
    factors.push({
      category: "QUALITY",
      severity: "HIGH",
      description: ci,
      evidence: "GitHub check results recorded on the merged pull request.",
      mitigation: "Restore the required check before release approval.",
      blocking: true,
    });
  }
  if (facts.integrated && facts.integrated.gaps.length > 0) {
    factors.push({
      category: "QUALITY",
      severity: "MEDIUM",
      description: "Integrated verification recorded evidence gaps.",
      evidence: facts.integrated.gaps.join("; "),
      mitigation: "Keep the gap visible. It does not by itself verify the slice.",
      blocking: false,
    });
  }
  if (facts.integrated && facts.integrated.verdict !== "PASS" && facts.integrated.verdict !== "PASS_WITH_CONCERNS") {
    factors.push({
      category: "QUALITY",
      severity: "MEDIUM",
      description: "Integrated verification has not passed.",
      evidence: facts.integrated.verdict || "No verdict",
      mitigation: "The gap stays visible. Release approval still requires the other gates.",
      blocking: false,
    });
  }
  if (!plan || plan.status !== "APPROVED") {
    factors.push({
      category: "DEPLOYMENT",
      severity: "HIGH",
      description: "The deployment plan is not approved.",
      evidence: plan ? `Plan version ${plan.version} is ${plan.status}.` : "No deployment plan is recorded.",
      mitigation: "A person approves the deployment plan.",
      blocking: true,
    });
  }
  const rollback = plan ? rollbackMessage(plan) : "Rollback is not recorded.";
  if (rollback) {
    const unavailable = Boolean(plan?.rollbackUnavailable && !acknowledged(plan));
    factors.push({
      category: "ROLLBACK",
      severity: unavailable ? "CRITICAL" : "HIGH",
      description: unavailable ? "Rollback is unavailable and has not been acknowledged." : "Rollback is not recorded.",
      evidence: rollback,
      mitigation: unavailable ? "A person acknowledges that rollback is impossible and records why." : "Record the rollback trigger, steps, role, and verification.",
      blocking: true,
    });
  }
  if (plan?.checks.some((check) => check.phase === "PRE_DEPLOYMENT" && check.required && check.status === "FAILED")) {
    factors.push({
      category: "DEPLOYMENT",
      severity: "HIGH",
      description: "A required pre-deployment check failed.",
      evidence: plan.checks.filter((check) => check.phase === "PRE_DEPLOYMENT" && check.status === "FAILED").map((check) => check.name).join("; "),
      mitigation: "Pass the check or waive it with a human rationale.",
      blocking: true,
    });
  }
  return factors;
}

function rollbackMessage(plan: PlanFact) {
  if (plan.rollbackUnavailable) {
    return acknowledged(plan) ? "" : "Rollback is unavailable and needs a human acknowledgement.";
  }
  if (!plan.rollbackTrigger.trim() || !plan.rollbackSteps.trim() || !plan.rollbackRole.trim() || !plan.rollbackVerification.trim()) {
    return "Rollback trigger, steps, responsible role, and verification after rollback are required.";
  }
  return "";
}

export function ciProblem(facts: ReleaseFacts) {
  for (const task of facts.tasks) {
    const pull = task.pull;
    if (!pull || pull.demo) return "CI evidence is missing.";
    if (pull.checks.length === 0) return `CI evidence is missing for pull request #${pull.number}.`;
    for (const check of pull.checks) {
      if (FAILED_CHECKS.has(check.conclusion)) return `GitHub check ${check.name} did not succeed.`;
      if (check.status !== "COMPLETED" || check.conclusion === "UNKNOWN") return `CI status for ${check.name} is unknown.`;
    }
    if (pull.requiredChecks) {
      for (const name of pull.requiredChecks) {
        const check = pull.checks.find((item) => item.name === name);
        if (!check || check.status !== "COMPLETED" || check.conclusion !== "SUCCESS") {
          return `Required check ${name} did not succeed.`;
        }
      }
    }
  }
  return "";
}

export function overallRisk(factors: { severity: string; status: string }[]): ReleaseLevel {
  let rank = 0;
  let level: ReleaseLevel = "LOW";
  for (const factor of factors) {
    if (factor.status !== "OPEN") continue;
    const next = RISK_RANK[factor.severity as ReleaseLevel] ?? 0;
    if (next > rank) {
      rank = next;
      level = factor.severity as ReleaseLevel;
    }
  }
  return level;
}

export function evidenceDrafts(facts: ReleaseFacts): EvidenceDraft[] {
  const rows: EvidenceDraft[] = [];
  rows.push({
    type: "PRODUCT_APPROVAL",
    source: "FACTORY",
    description: facts.slice ? `Product slice ${facts.slice.name} is ${facts.slice.status}.` : "No approved product slice is recorded.",
    result: facts.slice?.status === "APPROVED" ? "APPROVED" : "MISSING",
    referenceId: facts.slice?.id ?? "",
  });
  if (facts.definitionApproved) {
    rows.push({
      type: "PRODUCT_APPROVAL",
      source: "FACTORY",
      description: "Product definition approval is recorded.",
      result: "APPROVED",
      referenceId: facts.productId,
    });
  }
  if (facts.tasks.length === 0) {
    rows.push({
      type: "REQUIREMENT_TRACEABILITY",
      source: "FACTORY",
      description: "No story is linked to this release.",
      result: "MISSING",
      referenceId: "",
    });
  }
  for (const task of facts.tasks) {
    rows.push({
      type: "REQUIREMENT_TRACEABILITY",
      source: "FACTORY",
      description: [task.epicTitle, task.featureTitle, task.storyTitle, ...task.criteria.map((criterion) => criterion.description)].filter(Boolean).join(" / "),
      result: task.storyTitle ? "RECORDED" : "MISSING",
      referenceId: task.workItemId,
    });
    rows.push({
      type: "CODE_APPROVAL",
      source: "FACTORY",
      description: task.codeApproved ? `Code approval matches commit ${task.commitSha}.` : `Code approval is missing for ${task.title}.`,
      result: task.codeApproved ? "APPROVED" : "MISSING",
      referenceId: task.id,
    });
    rows.push({
      type: "VERIFICATION_APPROVAL",
      source: "FACTORY",
      description: verificationCurrent(task)
        ? `Verification ${task.verificationVerdict} for commit ${task.verificationCommit}.`
        : `Verification is missing or stale for ${task.title}.`,
      result: verificationCurrent(task) ? task.verificationVerdict : "MISSING",
      referenceId: task.verificationSessionId || task.id,
    });
    const pull = task.pull;
    if (pull && !pull.demo && pull.state === "MERGED") {
      rows.push({
        type: "PULL_REQUEST_MERGE",
        source: "GITHUB",
        description: `Pull request #${pull.number} merged by ${pull.mergedBy || "an unknown GitHub user"} at ${pull.mergedAt || "an unknown time"}. Head ${pull.headSha}. Merge ${pull.mergeSha}.`,
        result: "MERGED",
        referenceId: pull.id,
      });
      if (pull.checks.length === 0) {
        rows.push({
          type: "CI_RESULT",
          source: "FACTORY",
          description: `No CI check is recorded for pull request #${pull.number}.`,
          result: "MISSING",
          referenceId: pull.id,
        });
      }
      for (const check of pull.checks) {
        rows.push({
          type: "CI_RESULT",
          source: "GITHUB",
          description: `Check ${check.name} is ${check.status} with conclusion ${check.conclusion}. This records that check only.`,
          result: check.conclusion,
          referenceId: `${pull.id}:${check.name}`,
        });
      }
      for (const review of pull.reviews) {
        rows.push({
          type: "PULL_REQUEST_REVIEW",
          source: "GITHUB",
          description: `${review.reviewer} ${review.state}.`,
          result: review.state,
          referenceId: `${pull.id}:${review.reviewer}`,
        });
      }
    } else {
      rows.push({
        type: "PULL_REQUEST_MERGE",
        source: "FACTORY",
        description: `No merged pull request is recorded for ${task.title}.`,
        result: "MISSING",
        referenceId: task.id,
      });
    }
  }
  rows.push({
    type: "ARCHITECTURE_APPROVAL",
    source: "FACTORY",
    description: facts.architectureApproved ? facts.architectureSummary || "Architecture approval is recorded." : "Architecture approval is missing.",
    result: facts.architectureApproved ? "APPROVED" : "MISSING",
    referenceId: facts.slice?.id ?? "",
  });
  rows.push({
    type: "GOVERNANCE_APPROVAL",
    source: "FACTORY",
    description: facts.governanceCurrent ? "Engineering Governance is current." : "Engineering Governance is not current.",
    result: facts.governanceCurrent ? "APPROVED" : "MISSING",
    referenceId: facts.productId,
  });
  const blocking = facts.defects.filter((defect) => defect.status !== "DONE" && (defect.priority === "HIGH" || defect.priority === "CRITICAL"));
  rows.push({
    type: "DEFECT_STATUS",
    source: "FACTORY",
    description: blocking.length > 0 ? blocking.map((defect) => `${defect.priority} ${defect.title}`).join("; ") : "No critical or high defect is open.",
    result: blocking.length > 0 ? "OPEN" : "NONE_OPEN",
    referenceId: facts.productId,
  });
  rows.push({
    type: "INTEGRATED_VERIFICATION",
    source: "FACTORY",
    description: facts.integrated
      ? `Verdict ${facts.integrated.verdict || "unrecorded"}. Gaps: ${facts.integrated.gaps.join("; ") || "none recorded"}.`
      : "An integrated verification session has not been recorded.",
    result: facts.integrated ? (facts.integrated.verdict === "PASS" || facts.integrated.verdict === "PASS_WITH_CONCERNS" ? facts.integrated.verdict : "GAP") : "MISSING",
    referenceId: facts.integrated?.id ?? "",
  });
  return rows.map((row) => ({ ...row, description: redactSecrets(row.description) }));
}

const REQUIRED_EVIDENCE = new Set([
  "PRODUCT_APPROVAL",
  "REQUIREMENT_TRACEABILITY",
  "ARCHITECTURE_APPROVAL",
  "GOVERNANCE_APPROVAL",
  "CODE_APPROVAL",
  "VERIFICATION_APPROVAL",
  "CI_RESULT",
  "PULL_REQUEST_MERGE",
  "INTEGRATED_VERIFICATION",
]);

export function approvalBlockers(input: {
  factors: { severity: string; status: string; blocking: boolean; description: string }[];
  questions: { question: string; blocking: boolean; status: string }[];
  evidence: { type: string; result: string }[];
  plan: PlanFact | null;
}) {
  const reasons: string[] = [];
  for (const factor of input.factors) {
    if (factor.status !== "OPEN") continue;
    if (factor.severity === "CRITICAL" || (factor.severity === "HIGH" && factor.blocking)) {
      reasons.push(factor.severity === "CRITICAL" ? `Critical release risk is open: ${factor.description}` : `Blocking high release risk is open: ${factor.description}`);
    }
  }
  for (const question of input.questions) {
    if (question.blocking && question.status === "OPEN") reasons.push(`A blocking release question is open: ${question.question}`);
  }
  for (const type of REQUIRED_EVIDENCE) {
    const rows = input.evidence.filter((row) => row.type === type);
    if (rows.length === 0 || rows.every((row) => row.result === "MISSING")) {
      reasons.push(`Required evidence is missing: ${type}.`);
    }
  }
  if (!input.plan || input.plan.status !== "APPROVED") reasons.push("The deployment plan is not approved.");
  const rollback = input.plan ? rollbackMessage(input.plan) : "Rollback is not recorded.";
  if (rollback) reasons.push(rollback);
  if (!input.plan?.checks.some((check) => check.phase === "POST_DEPLOYMENT" && check.required)) {
    reasons.push("A required post-deployment check has not been defined.");
  }
  if (input.plan?.checks.some((check) => check.phase === "PRE_DEPLOYMENT" && check.required && check.status === "FAILED")) {
    reasons.push("A required pre-deployment check failed.");
  }
  return [...new Set(reasons)];
}

export function assessReleaseReadiness(input: {
  facts: ReleaseFacts;
  plan: PlanFact | null;
  evidence: { type: string; result: string }[];
  operationalSufficient: number;
  operationalRelevant: number;
}) {
  const areas: { key: string; label: string; level: "LOW" | "MEDIUM" | "HIGH"; explanation: string }[] = [];
  const scopeHigh = Boolean(input.facts.slice?.status === "APPROVED" && input.facts.tasks.length > 0 && input.facts.tasks.every((task) => task.status === "COMPLETED"));
  areas.push({
    key: "scope",
    label: "Scope completeness",
    level: scopeHigh ? "HIGH" : "LOW",
    explanation: scopeHigh ? "The approved slice and its completed tasks are included." : "The slice or its tasks are incomplete.",
  });
  const verified = input.facts.tasks.every((task) => verificationCurrent(task));
  const stale = input.facts.tasks.some((task) => task.verificationStale);
  areas.push({
    key: "verification",
    label: "Verification",
    level: verified ? "HIGH" : stale ? "MEDIUM" : "LOW",
    explanation: verified ? "Each task has current approved verification." : "Verification is missing or stale.",
  });
  const ci = ciProblem(input.facts);
  areas.push({
    key: "ci",
    label: "CI",
    level: ci ? (ci.includes("unknown") || ci.includes("missing") ? "MEDIUM" : "LOW") : "HIGH",
    explanation: ci || "Recorded GitHub checks succeeded.",
  });
  const blockingDefects = input.facts.defects.filter((defect) => defect.status !== "DONE" && (defect.priority === "HIGH" || defect.priority === "CRITICAL"));
  areas.push({
    key: "defects",
    label: "Defects",
    level: blockingDefects.length > 0 ? "LOW" : "HIGH",
    explanation: blockingDefects.length > 0 ? "A critical or high defect is open." : "No critical or high defect is open.",
  });
  areas.push({
    key: "governance",
    label: "Security and governance",
    level: input.facts.governanceCurrent && input.facts.policyCurrent ? "HIGH" : "LOW",
    explanation: input.facts.governanceCurrent && input.facts.policyCurrent ? "Engineering Governance and Coding Policy are current." : "Governance or coding policy is not current.",
  });
  areas.push({
    key: "operations",
    label: "Operational readiness",
    level: input.operationalRelevant > 0 && input.operationalSufficient === input.operationalRelevant ? "HIGH" : input.operationalSufficient > 0 ? "MEDIUM" : "LOW",
    explanation: `${input.operationalSufficient} of ${input.operationalRelevant} relevant operational areas are sufficiently understood.`,
  });
  areas.push({
    key: "plan",
    label: "Deployment plan",
    level: input.plan?.status === "APPROVED" ? "HIGH" : input.plan ? "MEDIUM" : "LOW",
    explanation: input.plan ? `Deployment plan version ${input.plan.version} is ${input.plan.status}.` : "No deployment plan is recorded.",
  });
  const rollback = input.plan ? rollbackMessage(input.plan) : "Rollback is not recorded.";
  areas.push({
    key: "rollback",
    label: "Rollback",
    level: rollback ? "LOW" : "HIGH",
    explanation: rollback || "Rollback is recorded, or a person has acknowledged that it is unavailable.",
  });
  const missing = input.evidence.some((row) => row.result === "MISSING" && REQUIRED_EVIDENCE.has(row.type));
  const gaps = input.evidence.some((row) => row.type === "INTEGRATED_VERIFICATION" && row.result === "GAP");
  areas.push({
    key: "evidence",
    label: "Evidence completeness",
    level: missing ? "LOW" : gaps ? "MEDIUM" : "HIGH",
    explanation: missing ? "Required evidence is missing." : gaps ? "Integrated verification still has a visible gap." : "Required evidence is recorded.",
  });
  return { sufficient: areas.filter((area) => area.level === "HIGH").length, total: 9, areas };
}

export function postDeploymentReady(checks: { phase: string; required: boolean; status: string; waiverRationale: string }[]) {
  const required = checks.filter((check) => check.phase === "POST_DEPLOYMENT" && check.required);
  if (required.length === 0) return false;
  return required.every((check) => check.status === "PASSED" || (check.status === "WAIVED" && check.waiverRationale.trim().length >= 12));
}

export function learnBlockers(input: {
  demo: boolean;
  status: string;
  checks: { phase: string; required: boolean; status: string; waiverRationale: string }[];
  issues: { severity: string; status: string }[];
}) {
  if (input.demo) return ["DEMO DATA. This seeded release is not a deployed release."];
  const reasons: string[] = [];
  if (input.status !== "DEPLOYED") reasons.push("The release candidate is not deployed.");
  if (!postDeploymentReady(input.checks)) reasons.push("A required post-deployment check is incomplete.");
  if (input.issues.some((issue) => issue.status === "OPEN" && (issue.severity === "HIGH" || issue.severity === "CRITICAL"))) {
    reasons.push("A blocking release issue is open.");
  }
  return reasons;
}

export function releaseFingerprint(input: {
  sliceId: string;
  tasks: ReleaseTaskFact[];
  plan: PlanFact | null;
  factors: { category: string; severity: string; status: string; blocking: boolean; description: string }[];
  evidence: { type: string; source: string; result: string; referenceId: string }[];
  governanceCurrent: boolean;
  policyCurrent: boolean;
  integratedId: string;
  integratedGaps: string[];
}) {
  const body = {
    sliceId: input.sliceId,
    governanceCurrent: input.governanceCurrent,
    policyCurrent: input.policyCurrent,
    integratedId: input.integratedId,
    integratedGaps: [...input.integratedGaps].sort(),
    tasks: [...input.tasks]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((task) => ({
        id: task.id,
        status: task.status,
        commitSha: task.commitSha,
        verificationSessionId: task.verificationSessionId,
        verificationCommit: task.verificationCommit,
        verificationStale: task.verificationStale,
        pullId: task.pull?.id ?? "",
        pullState: task.pull?.state ?? "",
        headSha: task.pull?.headSha ?? "",
        mergeSha: task.pull?.mergeSha ?? "",
      })),
    plan: input.plan
      ? {
          version: input.plan.version,
          status: input.plan.status,
          rollbackTrigger: input.plan.rollbackTrigger,
          rollbackSteps: input.plan.rollbackSteps,
          rollbackRole: input.plan.rollbackRole,
          rollbackVerification: input.plan.rollbackVerification,
          rollbackUnavailable: input.plan.rollbackUnavailable,
          rollbackAcknowledgement: input.plan.rollbackAcknowledgement,
          rollbackAcknowledgedBy: input.plan.rollbackAcknowledgedBy,
        }
      : null,
    factors: [...input.factors]
      .map((factor) => ({ category: factor.category, severity: factor.severity, status: factor.status, blocking: factor.blocking, description: factor.description }))
      .sort((a, b) => `${a.category}${a.description}`.localeCompare(`${b.category}${b.description}`)),
    evidence: [...input.evidence]
      .map((row) => ({ type: row.type, source: row.source, result: row.result, referenceId: row.referenceId }))
      .sort((a, b) => `${a.type}${a.referenceId}${a.result}`.localeCompare(`${b.type}${b.referenceId}${b.result}`)),
  };
  return createHash("sha256").update(JSON.stringify(body)).digest("hex");
}

export function draftReleaseNotes(input: { version: string; facts: ReleaseFacts; planSummary: string }) {
  const lines = [
    `# ${input.version}`,
    "",
    "## Product slice",
    input.facts.slice?.name || "No slice",
    "",
    "## Customer value",
    input.facts.outcome?.title || "No product outcome is linked.",
    input.facts.capability ? `Capability: ${input.facts.capability.name}` : "",
    "",
    "## Features delivered",
    ...input.facts.tasks.map((task) => `- ${task.storyTitle || task.title}`),
    "",
    "## Defects fixed",
    "- None recorded in this candidate.",
    "",
    "## Known limitations",
    ...(input.facts.integrated?.gaps.length ? input.facts.integrated.gaps.map((gap) => `- ${gap}`) : ["- None recorded."]),
    "",
    "## Verification",
    ...input.facts.tasks.map((task) => `- ${task.title}: ${verificationCurrent(task) ? task.verificationVerdict : "not current"}`),
    "",
    "## Deployment notes",
    input.planSummary || "Deployment remains a human action.",
    "",
    "## Identifiers",
    `Product ID: ${input.facts.productId}`,
    `Slice ID: ${input.facts.slice?.id ?? "none"}`,
    ...input.facts.tasks.flatMap((task) => [
      `Task ID: ${task.id}`,
      `Verification Session ID: ${task.verificationSessionId || "none"}`,
      `Commit SHA: ${task.commitSha || "none"}`,
      task.pull ? `Pull request #${task.pull.number} merge SHA: ${task.pull.mergeSha || "none"}` : "Pull request: none",
    ]),
  ];
  return redactSecrets(lines.filter((line) => line !== "").join("\n"));
}
