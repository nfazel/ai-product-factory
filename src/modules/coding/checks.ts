import { approveCommand } from "@/modules/coding/policy";

type CheckEvidenceType = "TYPECHECK" | "LINT" | "BUILD" | "TEST_RESULT";

export function commandForCheck(label: string, policyCommands: string[]) {
  const text = label.trim().replace(/\s+/g, " ");
  const direct = approveCommand(text, [...policyCommands, text]);
  if (direct.ok && text.startsWith("npm ")) {
    return { command: direct.command, type: evidenceTypeFor(text) };
  }
  const lower = text.toLowerCase();
  if (lower.includes("typecheck")) return { command: "npm run typecheck", type: "TYPECHECK" as const };
  if (lower.includes("lint")) return { command: "npm run lint", type: "LINT" as const };
  if (lower.includes("build")) return { command: "npm run build", type: "BUILD" as const };
  if (lower.includes("test")) return { command: "npm test", type: "TEST_RESULT" as const };
  return null;
}

function evidenceTypeFor(command: string): CheckEvidenceType {
  const lower = command.toLowerCase();
  if (lower.includes("typecheck")) return "TYPECHECK";
  if (lower.includes("lint")) return "LINT";
  if (lower.includes("build")) return "BUILD";
  return "TEST_RESULT";
}
