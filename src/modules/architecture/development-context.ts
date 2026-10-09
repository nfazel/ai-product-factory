import type { SystemKindName } from "@/domain/constants";

export type DevelopmentContextChoice = SystemKindName | null;

export function developmentContextInstruction(choice: DevelopmentContextChoice) {
  if (choice === "GREENFIELD") {
    return "This is a new application. There is no legacy codebase to preserve. Propose the initial technical foundation, stack, and repository structure from the approved product definition, requirements, constraints, and delivery plan. Do not assume an existing repository, framework, directory layout, or code. Technology and architecture choices stay proposals until a person approves them.";
  }
  if (choice === "EXISTING_SYSTEM") {
    return "This builds on an existing application. Use the supplied codebase context to understand the technology stack, architecture, directory structure, modules, conventions, dependencies, tests, data, reusable parts, and constraints. Reading that context does not publish changes.";
  }
  return "It has not been recorded whether this is a new application or an existing codebase. Do not assume an existing repository.";
}

export function codebaseCaptured(context: {
  repositoryName: string;
  architectureSummary: string;
  source: string;
  languages: unknown;
  frameworks: unknown;
} | null) {
  if (!context) return false;
  const listed = [context.languages, context.frameworks].some((value) => Array.isArray(value) && value.length > 0);
  return Boolean(
    context.repositoryName.trim() ||
      context.architectureSummary.trim() ||
      listed ||
      context.source === "LOCAL_ANALYSIS",
  );
}
