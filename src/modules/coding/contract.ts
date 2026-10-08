import { createHash } from "node:crypto";

import type { CodingExecutionModeName, CodingRiskLevelName } from "@/domain/constants";
import { ALWAYS_RESTRICTED, asStrings } from "@/modules/coding/strings";

export type ContractDraft = {
  objective: string;
  allowedPaths: string[];
  restrictedPaths: string[];
  acceptanceCriteria: string[];
  requiredChecks: string[];
  architectureConstraints: string;
  codingPolicyConstraints: string;
  dependencies: string[];
  validationExpectations: string;
  maxFiles: number;
  executionMode: CodingExecutionModeName;
  riskLevel: CodingRiskLevelName;
  allowFileDelete: boolean;
  sourceFingerprint: string;
};

const DEFAULT_MAX_FILES = 8;

export function buildContractDraft(input: {
  taskTitle: string;
  objective: string;
  validation: string;
  filesLikely: string;
  allowedPaths: unknown;
  restrictedPaths: unknown;
  prohibitedActions: unknown;
  requiredChecks: unknown;
  maxFilesPerTask: number | null;
  riskLevel: CodingRiskLevelName;
  executionMode: CodingExecutionModeName;
  acceptanceCriteria: string[];
  dependencies: string[];
  architectureSummary: string;
  componentNotes: string[];
}): ContractDraft {
  const allowedPaths = asStrings(input.allowedPaths);
  const restrictedPaths = [...new Set([...asStrings(input.restrictedPaths), ...ALWAYS_RESTRICTED])];
  const requiredChecks = asStrings(input.requiredChecks);
  const prohibited = asStrings(input.prohibitedActions);
  const maxFiles =
    input.maxFilesPerTask && input.maxFilesPerTask > 0 ? input.maxFilesPerTask : DEFAULT_MAX_FILES;
  const objective = input.objective.trim() || input.taskTitle.trim();
  const allowFileDelete = /\b(remove|delete)\b/i.test(`${input.taskTitle} ${objective}`);
  const architectureConstraints = [input.architectureSummary.trim(), ...input.componentNotes]
    .filter(Boolean)
    .join("\n");
  const fingerprintSource = JSON.stringify({
    objective,
    allowedPaths,
    restrictedPaths,
    acceptanceCriteria: input.acceptanceCriteria,
    requiredChecks,
    architectureConstraints,
    prohibited,
    dependencies: input.dependencies,
    validation: input.validation,
    maxFiles,
    executionMode: input.executionMode,
    riskLevel: input.riskLevel,
    allowFileDelete,
  });
  return {
    objective,
    allowedPaths,
    restrictedPaths,
    acceptanceCriteria: input.acceptanceCriteria,
    requiredChecks,
    architectureConstraints,
    codingPolicyConstraints: prohibited.join("\n"),
    dependencies: input.dependencies,
    validationExpectations: input.validation.trim() || input.filesLikely.trim(),
    maxFiles,
    executionMode: input.executionMode,
    riskLevel: input.riskLevel,
    allowFileDelete,
    sourceFingerprint: createHash("sha256").update(fingerprintSource).digest("hex"),
  };
}
