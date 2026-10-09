import "server-only";

import { existsSync, realpathSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { db } from "@/lib/db";
import { developmentContextInstruction } from "@/modules/architecture/development-context";
import { findCurrentBrief } from "@/modules/discovery/repository";
import { DomainError } from "@/modules/shared/errors";

function listField(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object" && "text" in item && typeof item.text === "string") {
        return item.text;
      }
      return "";
    })
    .filter(Boolean);
}

export function analyseConfiguredRoot() {
  const root = process.env.CODEBASE_CONTEXT_ROOT?.trim();
  if (!root) return null;
  let resolved: string;
  try {
    resolved = realpathSync(root);
  } catch {
    throw new DomainError("The configured project directory cannot be read.");
  }
  if (resolved !== realpathSync(path.resolve(root))) {
    throw new DomainError("The configured project directory cannot be read.");
  }
  const packagePath = path.join(resolved, "package.json");
  let name = path.basename(resolved);
  const frameworks: string[] = [];
  try {
    const raw = JSON.parse(readFileSync(packagePath, "utf8")) as {
      name?: string;
      dependencies?: Record<string, string>;
    };
    if (raw.name) name = raw.name;
    frameworks.push(...Object.keys(raw.dependencies ?? {}).slice(0, 12));
  } catch {
    // A directory without package.json can still contribute a directory list.
  }
  const keyDirectories = readdirSync(resolved, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => name !== "node_modules" && name !== ".git" && !name.startsWith("."))
    .slice(0, 20);
  const languages = existsSync(packagePath) ? ["TypeScript"] : [];
  return {
    repositoryName: name,
    languages,
    frameworks,
    keyDirectories,
    architectureSummary: "Read from the configured project directory. Only package.json and the top-level directories were inspected.",
  };
}

export async function loadArchitectureContext(productId: string) {
  const [product, brief, definition, outcomes, capabilities, slice, workItems, nfrs, questions, assumptions, decisions, context, architectures, runs] =
    await Promise.all([
      db.product.findUnique({ where: { id: productId }, select: { developmentContext: true } }),
      findCurrentBrief(productId),
      db.productDefinition.findUnique({ where: { productId } }),
      db.productOutcome.findMany({ where: { productId } }),
      db.productCapability.findMany({ where: { productId } }),
      db.productSlice.findFirst({ where: { productId, status: "APPROVED" }, orderBy: { createdAt: "asc" } }),
      db.workItem.findMany({
        where: { productId },
        include: { acceptanceCriteria: true, parent: { select: { id: true, title: true, type: true } } },
      }),
      db.nonFunctionalRequirement.findMany({ where: { productId } }),
      db.requirementQuestion.findMany({ where: { productId } }),
      db.requirementAssumption.findMany({ where: { productId } }),
      db.decision.findMany({ where: { productId } }),
      db.codebaseContext.findUnique({ where: { productId } }),
      db.solutionArchitecture.findMany({
        where: { productId },
        orderBy: { version: "desc" },
        include: { components: true, decisions: true },
      }),
      db.agentRun.findMany({
        where: { productId, agentType: "ARCHITECTURE" },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
    ]);

  return {
    brief: brief
      ? {
          status: brief.status,
          problemStatement: brief.problemStatement,
          productVision: brief.productVision,
          valueProposition: brief.valueProposition,
          targetUsers: listField(brief.targetUsers),
          inScope: listField(brief.inScope),
          outOfScope: listField(brief.outOfScope),
          constraints: listField(brief.constraints),
          risks: listField(brief.risks),
          openQuestions: listField(brief.openQuestions),
        }
      : null,
    definition: definition ? { status: definition.status } : null,
    outcomes,
    capabilities,
    approvedSlice: slice,
    workItems: workItems.map((item) => ({
      id: item.id,
      referenceCode: item.referenceCode,
      type: item.type,
      title: item.title,
      description: item.description,
      parentTitle: item.parent?.title ?? "",
      capabilityId: item.capabilityId,
      sliceId: item.sliceId,
      acceptanceCriteria: item.acceptanceCriteria.map((criterion) => criterion.description),
    })),
    nonFunctionalRequirements: nfrs,
    questions,
    assumptions,
    decisions,
    developmentContext: product?.developmentContext ?? null,
    developmentInstruction: developmentContextInstruction(product?.developmentContext ?? null),
    codebaseContext: product?.developmentContext === "GREENFIELD" ? null : context,
    localProject: product?.developmentContext === "EXISTING_SYSTEM" ? safeLocalSummary() : null,
    approvedArchitecture: architectures.find((item) => item.status === "APPROVED") ?? null,
    previousArchitectures: architectures.map((item) => ({
      version: item.version,
      status: item.status,
      summary: item.summary,
      reviewRequired: item.reviewRequired,
      reviewReason: item.reviewReason,
    })),
    previousRuns: runs.map((run) => ({ status: run.status, createdAt: run.createdAt })),
  };
}

function safeLocalSummary() {
  if (!process.env.CODEBASE_CONTEXT_ROOT?.trim()) return null;
  try {
    return analyseConfiguredRoot();
  } catch {
    return null;
  }
}
