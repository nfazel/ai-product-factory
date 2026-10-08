import type { SignalLevel } from "@/domain/constants";
import { TECHNICAL_READINESS_AREAS } from "@/domain/constants";

export type TechnicalReadinessInput = {
  summary: string;
  architectureStyle: string;
  rationale: string;
  integrationApproach: string;
  technologyCount: number;
  technologiesWithAlternatives: number;
  dataEntities: number;
  dataWithOwner: number;
  integrations: number;
  integrationsComplete: number;
  securityAreas: number;
  nfrCount: number;
  coveredNfrs: number;
  openQuestions: number;
  highOpenQuestions: number;
  tasks: number;
  tasksWithObjective: number;
  tasksWithSlice: number;
  tasksWithValidation: number;
  tasksWithDependenciesIdentified: number;
};

export type TechnicalReadiness = {
  summary: string;
  sufficient: number;
  areas: {
    key: string;
    label: string;
    level: SignalLevel;
    explanation: string;
  }[];
};

function level(high: boolean, medium: boolean): SignalLevel {
  if (high) return "HIGH";
  if (medium) return "MEDIUM";
  return "LOW";
}

export function assessTechnicalReadiness(input: TechnicalReadinessInput): TechnicalReadiness {
  const areas: TechnicalReadiness["areas"] = [
    {
      key: "architectureClarity",
      label: "Architecture clarity",
      level: level(
        input.summary.length > 40 && Boolean(input.architectureStyle) && Boolean(input.rationale),
        input.summary.length > 0,
      ),
      explanation:
        input.summary.length > 40 && input.architectureStyle && input.rationale
          ? "The style, summary, and rationale are stated."
          : "The architecture still needs a style, a summary, and a rationale.",
    },
    {
      key: "technologyDecisions",
      label: "Technology decisions",
      level: level(
        input.technologiesWithAlternatives > 0,
        input.technologyCount > 0,
      ),
      explanation:
        input.technologiesWithAlternatives > 0
          ? "Technology choices include a reason and alternatives."
          : "Technology choices need a reason, alternatives, and the constraint that shaped them.",
    },
    {
      key: "dataDesign",
      label: "Data design",
      level: level(input.dataWithOwner > 0, input.dataEntities > 0),
      explanation:
        input.dataWithOwner > 0
          ? "Core data entities name an owner and a classification."
          : "Name the core entities, who owns them, and how sensitive they are. Do not invent a production schema.",
    },
    {
      key: "integrationDesign",
      label: "Integration design",
      level: level(
        input.integrationsComplete > 0 ||
          /no external integration/i.test(input.integrationApproach),
        input.integrations > 0 || input.integrationApproach.length > 0,
      ),
      explanation:
        input.integrationsComplete > 0 || /no external integration/i.test(input.integrationApproach)
          ? "Integrations state purpose, direction, and failure behaviour, or the approach says none are required."
          : "Describe each integration's purpose, direction, protocol, and what happens when it fails.",
    },
    {
      key: "securityConsiderations",
      label: "Security considerations",
      level: level(input.securityAreas >= 6, input.securityAreas >= 3),
      explanation:
        input.securityAreas >= 6
          ? "Initial Architecture Security Assessment covers several areas. This is not a full security review."
          : "The initial security assessment is incomplete. This is not a full security review.",
    },
    {
      key: "nfrCoverage",
      label: "NFR coverage",
      level: level(
        input.nfrCount > 0 && input.coveredNfrs >= input.nfrCount,
        input.coveredNfrs > 0,
      ),
      explanation:
        input.nfrCount === 0
          ? "No non-functional requirements are recorded, so coverage cannot be shown."
          : input.coveredNfrs >= input.nfrCount
            ? "Each non-functional requirement points at a component, decision, or mechanism."
            : "Some non-functional requirements do not yet explain which part of the architecture addresses them.",
    },
    {
      key: "openQuestions",
      label: "Open architecture questions",
      level: level(input.openQuestions === 0, input.highOpenQuestions === 0),
      explanation:
        input.openQuestions === 0
          ? "No architecture questions are open."
          : input.highOpenQuestions > 0
            ? "A high-impact architecture question is still open."
            : "Open questions remain, but none are marked high impact.",
    },
    {
      key: "taskQuality",
      label: "Implementation task quality",
      level: level(
        input.tasks > 0 &&
          input.tasksWithObjective === input.tasks &&
          input.tasksWithSlice === input.tasks,
        input.tasks > 0 && input.tasksWithObjective > 0,
      ),
      explanation:
        input.tasks > 0 &&
        input.tasksWithObjective === input.tasks &&
        input.tasksWithSlice === input.tasks
          ? "Tasks name an objective and a vertical slice."
          : "Tasks should be coherent changes with an objective and a vertical slice, not a whole system.",
    },
    {
      key: "taskDependencies",
      label: "Task dependencies",
      level: level(
        input.tasks > 0 && input.tasksWithDependenciesIdentified === input.tasks,
        input.tasksWithDependenciesIdentified > 0,
      ),
      explanation:
        input.tasks > 0 && input.tasksWithDependenciesIdentified === input.tasks
          ? "Each task says whether its dependencies are known."
          : "Mark which tasks are sequential, which can run in parallel, and which are blocked.",
    },
    {
      key: "validationStrategy",
      label: "Validation strategy",
      level: level(
        input.tasks > 0 && input.tasksWithValidation === input.tasks,
        input.tasksWithValidation > 0,
      ),
      explanation:
        input.tasks > 0 && input.tasksWithValidation === input.tasks
          ? "Each task says how it will be validated."
          : "Each task needs a validation expectation, such as a unit test or an acceptance check.",
    },
  ];

  const sufficient = areas.filter((area) => area.level === "HIGH").length;
  return {
    sufficient,
    summary: `${sufficient} of ${TECHNICAL_READINESS_AREAS.length} areas sufficiently understood.`,
    areas,
  };
}

export function codingReadinessLabel(ready: boolean) {
  return ready ? "CODING READY" : "NOT READY";
}
