import { repairsForCurrentImplementation } from "@/modules/coding/implementation";

export const REPAIR_RECORD_MESSAGE =
  "Repair execution could not be fully recorded. No further repair has been started. Review the saved workspace state before retrying.";

export const IMPLEMENT_RECORD_MESSAGE =
  "Coding finished in the workspace, but the result could not be fully recorded. No further coding run has been started. Review the saved workspace state before retrying.";

const POSTGRES_INT_MAX = 2_147_483_647;

export function boundedDiffCount(value: number) {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(Math.floor(value), POSTGRES_INT_MAX);
}

export function sanitizeStoredPatch(patch: string) {
  if (!patch.includes("\u0000")) return { patch, omittedNullBytes: false };
  return { patch: patch.replaceAll("\u0000", ""), omittedNullBytes: true };
}

export function binaryPatchNote(filePath: string) {
  return `\ndiff --git a/${filePath} b/${filePath}\nBinary file omitted from the stored patch.\n`;
}

export function persistenceEvidenceOutput(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  const postgresCode = message.includes("22021") ? "22021" : "";
  const codes = [code, postgresCode].filter(Boolean);
  return [
    "CodingDiff upsert failed before the workspace result was saved.",
    codes.length > 0 ? `Database code: ${[...new Set(codes)].join(", ")}.` : "",
    "The stored patch contained a byte PostgreSQL cannot keep in a text column.",
    "Workspace files were left unchanged by this failure.",
  ].filter(Boolean).join(" ");
}

export function persistenceUserMessage(phase: "implement" | "repair") {
  return phase === "repair" ? REPAIR_RECORD_MESSAGE : IMPLEMENT_RECORD_MESSAGE;
}

export function repairResultNeedsRecording(input: {
  runs: { createdAt?: Date | string | null; input: unknown; output?: unknown }[];
  workspaceId: string;
  planVersion: number | null;
  diffUpdatedAt: Date | string | null;
  commands: { command: string; result: string; createdAt: Date | string }[];
  requiredCommands: string[];
  gaps: number;
}) {
  const repair = repairsForCurrentImplementation(input.runs, input.workspaceId, input.planVersion).at(-1);
  if (!repair?.createdAt || input.gaps > 0 || input.requiredCommands.length === 0) return false;
  const output = repair.output && typeof repair.output === "object" ? repair.output as { outcome?: unknown } : null;
  if (output?.outcome === "COMPLETED" || output?.outcome === "COMPLETED_WITH_CONCERNS") return false;
  const started = new Date(repair.createdAt).getTime();
  const latest = new Map<string, { result: string; createdAt: number }>();
  for (const item of input.commands) {
    if (!item.command) continue;
    const at = new Date(item.createdAt).getTime();
    const current = latest.get(item.command);
    if (!current || at >= current.createdAt) latest.set(item.command, { result: item.result, createdAt: at });
  }
  const passed = input.requiredCommands.every((command) => {
    const item = latest.get(command);
    return item?.result === "PASS" && item.createdAt >= started;
  });
  if (!passed) return false;
  if (input.diffUpdatedAt && new Date(input.diffUpdatedAt).getTime() >= started) return false;
  return true;
}
