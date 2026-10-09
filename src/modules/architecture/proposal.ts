import type { ArchitectureSection } from "@/domain/constants";
import type { ArchitectureResponse, StoredArchitecture } from "@/modules/architecture/schema";
import { toStoredArchitecture } from "@/modules/architecture/schema";

type Reviewable = {
  tempId: string;
  reviewStatus: "PENDING" | "ACCEPTED" | "REJECTED";
  edited: boolean;
};

function keep<T extends Reviewable>(items: T[]) {
  return items.filter(
    (item) => item.reviewStatus !== "PENDING" || item.edited,
  );
}

function mergeList<T extends Reviewable>(current: T[], incoming: T[]) {
  const kept = keep(current);
  const keptIds = new Set(kept.map((item) => item.tempId));
  return [...kept, ...incoming.filter((item) => !keptIds.has(item.tempId))];
}

export function mergeRegeneratedSection(
  current: StoredArchitecture,
  response: ArchitectureResponse,
  section: ArchitectureSection,
  featureTitle = "",
): StoredArchitecture {
  const incoming = toStoredArchitecture(response);
  const next: StoredArchitecture = {
    ...current,
    assistantSummary: incoming.assistantSummary || current.assistantSummary,
  };

  if (section === "summary" && !current.summaryEdited) {
    next.systemKind = incoming.systemKind;
    next.architectureStyle = incoming.architectureStyle;
    next.architectureSummary = incoming.architectureSummary;
    next.rationale = incoming.rationale;
    next.frontendApproach = incoming.frontendApproach;
    next.backendApproach = incoming.backendApproach;
    next.dataApproach = incoming.dataApproach;
    next.integrationApproach = incoming.integrationApproach;
    next.securityApproach = incoming.securityApproach;
    next.deploymentApproach = incoming.deploymentApproach;
    next.observabilityApproach = incoming.observabilityApproach;
  }
  if (section === "components") {
    next.components = mergeList(current.components, incoming.components);
    next.relationships = mergeList(current.relationships, incoming.relationships);
  }
  if (section === "security") {
    next.securityAssessment = mergeList(current.securityAssessment, incoming.securityAssessment);
  }
  if (section === "data") {
    next.dataDesign = mergeList(current.dataDesign, incoming.dataDesign);
  }
  if (section === "alternatives") {
    next.technologyDecisions = mergeList(
      current.technologyDecisions,
      incoming.technologyDecisions,
    );
    next.adrs = mergeList(current.adrs, incoming.adrs);
  }
  if (section === "tasks") {
    const needle = featureTitle.trim().toLowerCase();
    const kept = current.implementationPlanProposal.tasks.filter((task) => {
      const locked = task.reviewStatus !== "PENDING" || task.edited;
      if (locked) return true;
      if (!needle) return false;
      return !`${task.relatedFeature} ${task.verticalSlice} ${task.title}`
        .toLowerCase()
        .includes(needle);
    });
    const keptIds = new Set(kept.map((task) => task.tempId));
    const additions = incoming.implementationPlanProposal.tasks.filter((task) => {
      if (keptIds.has(task.tempId)) return false;
      if (!needle) return true;
      return `${task.relatedFeature} ${task.verticalSlice} ${task.title}`
        .toLowerCase()
        .includes(needle);
    });
    next.implementationPlanProposal = {
      summary: current.implementationPlanProposal.summary || incoming.implementationPlanProposal.summary,
      tasks: [...kept, ...additions],
    };
  }
  return next;
}

const collections = [
  "components",
  "relationships",
  "technologyDecisions",
  "adrs",
  "dataDesign",
  "integrations",
  "securityAssessment",
  "architectureQuestions",
  "nfrCoverage",
] as const;

export function setReviewStatus(
  proposal: StoredArchitecture,
  section: string,
  tempId: string | "all",
  status: "ACCEPTED" | "REJECTED",
): StoredArchitecture {
  if (section === "summary") {
    return { ...proposal, summaryEdited: status === "ACCEPTED" ? true : proposal.summaryEdited };
  }
  if (section === "tasks") {
    return {
      ...proposal,
      implementationPlanProposal: {
        ...proposal.implementationPlanProposal,
        tasks: proposal.implementationPlanProposal.tasks.map((item) =>
          tempId === "all" || item.tempId === tempId
            ? { ...item, reviewStatus: status }
            : item,
        ),
      },
    };
  }
  if (!collections.includes(section as (typeof collections)[number])) {
    return proposal;
  }
  const key = section as (typeof collections)[number];
  return {
    ...proposal,
    [key]: proposal[key].map((item) =>
      tempId === "all" || item.tempId === tempId ? { ...item, reviewStatus: status } : item,
    ),
  };
}

export function acceptAll(proposal: StoredArchitecture): StoredArchitecture {
  let next = setReviewStatus(proposal, "summary", "all", "ACCEPTED");
  for (const key of collections) {
    next = setReviewStatus(next, key, "all", "ACCEPTED");
  }
  next = setReviewStatus(next, "tasks", "all", "ACCEPTED");
  next.nfrCoverage = next.nfrCoverage.map((item) => ({ ...item, reviewStatus: "ACCEPTED" }));
  return next;
}

export function included<T extends Reviewable>(item: T) {
  return item.reviewStatus === "ACCEPTED" || item.edited;
}
