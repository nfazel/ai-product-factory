import { DomainError } from "@/modules/shared/errors";
import type { StoredProposal } from "@/modules/requirements/schema";

const WORK_PREFIX = /^(epic|feature|story)-\d+$/;

function unique(ids: string[], label: string) {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      throw new DomainError(`Duplicate ${label} id "${id}". Nothing was saved.`);
    }
    seen.add(id);
  }
}

export function assertProposalReferences(proposal: StoredProposal) {
  unique(proposal.outcomes.map((item) => item.tempId), "outcome");
  unique(proposal.capabilities.map((item) => item.tempId), "capability");
  unique(proposal.epics.map((item) => item.tempId), "epic");
  unique(proposal.features.map((item) => item.tempId), "feature");
  unique(proposal.stories.map((item) => item.tempId), "story");
  unique(proposal.acceptanceCriteria.map((item) => item.tempId), "acceptance criterion");
  unique(proposal.nfrs.map((item) => item.tempId), "non-functional requirement");
  unique(proposal.assumptions.map((item) => item.tempId), "assumption");
  unique(proposal.dependencies.map((item) => item.tempId), "dependency");
  unique(proposal.questions.map((item) => item.tempId), "question");

  const outcomes = new Set(proposal.outcomes.map((item) => item.tempId));
  const capabilities = new Set(proposal.capabilities.map((item) => item.tempId));
  const epics = new Set(proposal.epics.map((item) => item.tempId));
  const features = new Set(proposal.features.map((item) => item.tempId));
  const stories = new Set(proposal.stories.map((item) => item.tempId));
  const work = new Set([...epics, ...features, ...stories]);

  for (const item of proposal.capabilities) {
    if (!outcomes.has(item.outcomeTempId)) {
      throw new DomainError(
        `Capability ${item.tempId} references missing outcome ${item.outcomeTempId}. Nothing was saved.`,
      );
    }
  }
  for (const item of proposal.epics) {
    if (!capabilities.has(item.capabilityTempId)) {
      throw new DomainError(
        `Epic ${item.tempId} references missing capability ${item.capabilityTempId}. Nothing was saved.`,
      );
    }
  }
  for (const item of proposal.features) {
    if (!epics.has(item.epicTempId)) {
      throw new DomainError(
        `Feature ${item.tempId} references missing epic ${item.epicTempId}. Nothing was saved.`,
      );
    }
  }
  for (const item of proposal.stories) {
    if (!features.has(item.featureTempId)) {
      throw new DomainError(
        `Story ${item.tempId} references missing feature ${item.featureTempId}. Nothing was saved.`,
      );
    }
  }
  for (const item of proposal.acceptanceCriteria) {
    if (!stories.has(item.storyTempId)) {
      throw new DomainError(
        `Acceptance criterion ${item.tempId} references missing story ${item.storyTempId}. Nothing was saved.`,
      );
    }
  }
  for (const item of proposal.assumptions) {
    if (item.storyTempId && !stories.has(item.storyTempId)) {
      throw new DomainError(
        `Assumption ${item.tempId} references missing story ${item.storyTempId}. Nothing was saved.`,
      );
    }
  }
  for (const item of proposal.questions) {
    if (item.storyTempId && !stories.has(item.storyTempId)) {
      throw new DomainError(
        `Question ${item.tempId} references missing story ${item.storyTempId}. Nothing was saved.`,
      );
    }
  }
  for (const item of proposal.dependencies) {
    if (!WORK_PREFIX.test(item.fromTempId) || !work.has(item.fromTempId)) {
      throw new DomainError(
        `Dependency ${item.tempId} starts at missing item ${item.fromTempId}. Nothing was saved.`,
      );
    }
    if (!WORK_PREFIX.test(item.toTempId) || !work.has(item.toTempId)) {
      throw new DomainError(
        `Dependency ${item.tempId} points at missing item ${item.toTempId}. Nothing was saved.`,
      );
    }
    if (item.fromTempId === item.toTempId) {
      throw new DomainError(
        `Dependency ${item.tempId} points at itself. Nothing was saved.`,
      );
    }
  }
}
