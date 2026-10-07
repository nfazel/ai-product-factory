import type { DefinitionSection } from "@/domain/constants";
import type { RequirementsResponse, StoredProposal } from "@/modules/requirements/schema";
import { toStoredProposal } from "@/modules/requirements/schema";

type Reviewable = {
  tempId: string;
  reviewStatus: "PENDING" | "ACCEPTED" | "REJECTED";
  edited: boolean;
  committedId: string | null;
  replacesId: string | null;
};

function keep<T extends Reviewable>(items: T[]) {
  return items.filter(
    (item) => item.reviewStatus !== "PENDING" || item.edited || item.committedId,
  );
}

function mergeList<T extends Reviewable>(current: T[], incoming: T[]) {
  const kept = keep(current);
  const keptIds = new Set(kept.map((item) => item.tempId));
  const additions = incoming.filter((item) => !keptIds.has(item.tempId));
  return [...kept, ...additions];
}

export function mergeRegeneratedSection(
  current: StoredProposal,
  response: RequirementsResponse,
  section: DefinitionSection,
): StoredProposal {
  const incoming = toStoredProposal(response);
  const next: StoredProposal = {
    ...current,
    assistantSummary: incoming.assistantSummary || current.assistantSummary,
  };

  if (section === "outcomes") next.outcomes = mergeList(current.outcomes, incoming.outcomes);
  if (section === "capabilities") {
    next.capabilities = mergeList(current.capabilities, incoming.capabilities);
  }
  if (section === "epics") next.epics = mergeList(current.epics, incoming.epics);
  if (section === "features") next.features = mergeList(current.features, incoming.features);
  if (section === "stories") next.stories = mergeList(current.stories, incoming.stories);
  if (section === "acceptanceCriteria") {
    next.acceptanceCriteria = mergeList(
      current.acceptanceCriteria,
      incoming.acceptanceCriteria,
    );
  }
  if (section === "nfrs") next.nfrs = mergeList(current.nfrs, incoming.nfrs);
  if (section === "assumptions") {
    next.assumptions = mergeList(current.assumptions, incoming.assumptions);
  }
  if (section === "questions") next.questions = mergeList(current.questions, incoming.questions);
  if (section === "dependencies") {
    next.dependencies = mergeList(current.dependencies, incoming.dependencies);
  }
  if (section === "firstSlice") {
    const slice = current.firstSlice;
    const locked =
      slice &&
      (slice.reviewStatus !== "PENDING" || slice.edited || slice.committedId);
    if (!locked) next.firstSlice = incoming.firstSlice;
  }
  return next;
}

export function setReviewStatus(
  proposal: StoredProposal,
  section: DefinitionSection,
  tempId: string | "all",
  status: "ACCEPTED" | "REJECTED",
): StoredProposal {
  const apply = <T extends Reviewable>(items: T[]) =>
    items.map((item) =>
      item.committedId
        ? item
        : tempId === "all" || item.tempId === tempId
          ? { ...item, reviewStatus: status }
          : item,
    );

  return {
    ...proposal,
    outcomes: section === "outcomes" ? apply(proposal.outcomes) : proposal.outcomes,
    capabilities:
      section === "capabilities" ? apply(proposal.capabilities) : proposal.capabilities,
    epics: section === "epics" ? apply(proposal.epics) : proposal.epics,
    features: section === "features" ? apply(proposal.features) : proposal.features,
    stories: section === "stories" ? apply(proposal.stories) : proposal.stories,
    acceptanceCriteria:
      section === "acceptanceCriteria"
        ? apply(proposal.acceptanceCriteria)
        : proposal.acceptanceCriteria,
    nfrs: section === "nfrs" ? apply(proposal.nfrs) : proposal.nfrs,
    assumptions: section === "assumptions" ? apply(proposal.assumptions) : proposal.assumptions,
    questions: section === "questions" ? apply(proposal.questions) : proposal.questions,
    dependencies:
      section === "dependencies" ? apply(proposal.dependencies) : proposal.dependencies,
    firstSlice:
      section === "firstSlice" &&
      proposal.firstSlice &&
      !proposal.firstSlice.committedId &&
      (tempId === "all" || proposal.firstSlice.tempId === tempId)
        ? { ...proposal.firstSlice, reviewStatus: status }
        : proposal.firstSlice,
  };
}

export function editProposalItem(
  proposal: StoredProposal,
  section: DefinitionSection,
  tempId: string,
  title: string,
  body: string,
): StoredProposal {
  const mark = <T extends Reviewable>(item: T): T => {
    if (item.tempId !== tempId || item.committedId) return item;
    const next: Reviewable & Record<string, unknown> = {
      ...item,
      edited: true,
      reviewStatus: "PENDING",
    };
    if (typeof next.title === "string") next.title = title || next.title;
    if (typeof next.name === "string" && section !== "outcomes") next.name = title || next.name;
    if (typeof next.description === "string" && section !== "questions") {
      next.description = body || title || next.description;
    }
    if (typeof next.question === "string") next.question = title || next.question;
    return next as T;
  };

  if (section === "firstSlice" && proposal.firstSlice?.tempId === tempId) {
    return {
      ...proposal,
      firstSlice: {
        ...proposal.firstSlice,
        edited: true,
        reviewStatus: "PENDING",
        name: title || proposal.firstSlice.name,
        description: body || proposal.firstSlice.description,
      },
    };
  }

  const map = <T extends Reviewable>(items: T[]) => items.map((item) => mark(item));

  return {
    ...proposal,
    outcomes: section === "outcomes" ? map(proposal.outcomes) : proposal.outcomes,
    capabilities: section === "capabilities" ? map(proposal.capabilities) : proposal.capabilities,
    epics: section === "epics" ? map(proposal.epics) : proposal.epics,
    features: section === "features" ? map(proposal.features) : proposal.features,
    stories: section === "stories" ? map(proposal.stories) : proposal.stories,
    acceptanceCriteria:
      section === "acceptanceCriteria" ? map(proposal.acceptanceCriteria) : proposal.acceptanceCriteria,
    nfrs: section === "nfrs" ? map(proposal.nfrs) : proposal.nfrs,
    assumptions: section === "assumptions" ? map(proposal.assumptions) : proposal.assumptions,
    questions: section === "questions" ? map(proposal.questions) : proposal.questions,
    dependencies: section === "dependencies" ? map(proposal.dependencies) : proposal.dependencies,
  };
}

export function acceptAll(proposal: StoredProposal): StoredProposal {
  let next = proposal;
  const sections: DefinitionSection[] = [
    "outcomes",
    "capabilities",
    "epics",
    "features",
    "stories",
    "acceptanceCriteria",
    "nfrs",
    "firstSlice",
    "assumptions",
    "questions",
    "dependencies",
  ];
  for (const section of sections) {
    next = setReviewStatus(next, section, "all", "ACCEPTED");
  }
  return next;
}
