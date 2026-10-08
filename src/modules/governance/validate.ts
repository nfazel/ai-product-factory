import type { GovernanceResponse } from "@/modules/governance/schema";
import { DomainError } from "@/modules/shared/errors";

export type GovernanceRefs = {
  componentIds: Set<string>;
  adrIds: Set<string>;
  taskIds: Set<string>;
  nfrIds: Set<string>;
  workItemIds: Set<string>;
  assumptionIds: Set<string>;
};

const TOOL_MARKERS = ["TOOL VERIFIED", "TOOL_VERIFIED", "DEPENDENCY_SCAN", "SECURITY_SCAN", "STATIC_ANALYSIS"];

export function assertEvidenceIsNotFabricated(evidence: {
  type: string;
  source: string;
  result: string;
  description: string;
}) {
  const blob = `${evidence.type} ${evidence.source} ${evidence.result} ${evidence.description}`.toUpperCase();
  if (
    evidence.type !== "AI_ANALYSIS" &&
    evidence.type !== "HUMAN_CONFIRMATION" &&
    evidence.type !== "DOCUMENT"
  ) {
    throw new DomainError(
      "Governance evidence cannot claim tool verification unless a scanner has recorded it. This review only supports AI review and human confirmation.",
    );
  }
  if (TOOL_MARKERS.some((marker) => blob.includes(marker))) {
    throw new DomainError(
      "Governance evidence cannot claim tool verification unless a scanner has recorded it. Label this result as AI REVIEW.",
    );
  }
}

function unique(ids: string[], label: string) {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) throw new DomainError(`Duplicate ${label} id ${id}.`);
    seen.add(id);
  }
}

function known(id: string, set: Set<string>, label: string) {
  if (!id) return;
  if (!set.has(id)) throw new DomainError(`Unknown ${label} reference ${id}.`);
}

export function assertGovernanceGraph(
  data: GovernanceResponse,
  refs: GovernanceRefs,
  options: { requireAllTasks: boolean },
) {
  unique(
    data.findings.map((item) => item.tempId),
    "finding",
  );
  unique(
    data.threats.map((item) => item.tempId),
    "threat",
  );
  unique(
    data.governanceQuestions.map((item) => item.tempId),
    "question",
  );
  unique(
    data.evidence.map((item) => item.tempId),
    "evidence",
  );
  unique(
    data.codingRiskAssessments.map((item) => item.taskId),
    "coding risk task",
  );

  const findingIds = new Set(data.findings.map((item) => item.tempId));
  for (const item of data.findings) {
    known(item.componentId, refs.componentIds, "architecture component");
    known(item.adrId, refs.adrIds, "architecture decision");
    known(item.taskId, refs.taskIds, "implementation task");
    known(item.nfrId, refs.nfrIds, "non-functional requirement");
    known(item.workItemId, refs.workItemIds, "work item");
    known(item.assumptionId, refs.assumptionIds, "assumption");
  }
  for (const threat of data.threats) {
    known(threat.affectedComponentId, refs.componentIds, "architecture component");
  }
  for (const risk of data.codingRiskAssessments) {
    known(risk.taskId, refs.taskIds, "implementation task");
  }
  for (const item of data.evidence) {
    assertEvidenceIsNotFabricated(item);
    if (item.findingTempId && !findingIds.has(item.findingTempId)) {
      throw new DomainError(`Evidence ${item.tempId} references unknown finding ${item.findingTempId}.`);
    }
  }
  if (options.requireAllTasks) {
    for (const taskId of refs.taskIds) {
      if (!data.codingRiskAssessments.some((item) => item.taskId === taskId)) {
        throw new DomainError(
          `Coding risk is missing for implementation task ${taskId}. Assess every task before the review can be stored.`,
        );
      }
    }
  }
}
