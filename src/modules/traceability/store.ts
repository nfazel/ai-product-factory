import "server-only";

import { db } from "@/lib/db";
import {
  nextReferenceCode,
  staleDesignReferenceMessage,
  workItemPrefix,
  type CitedRecord,
} from "@/modules/traceability/references";

async function fill(
  rows: { id: string; referenceCode: string }[],
  existing: string[],
  prefixFor: (row: { id: string }) => string,
  save: (id: string, code: string) => Promise<unknown>,
) {
  const codes = [...existing];
  for (const row of rows) {
    if (row.referenceCode) continue;
    const code = nextReferenceCode(codes, prefixFor(row));
    codes.push(code);
    await save(row.id, code);
  }
}

export async function assignMissingReferenceCodes(productId: string) {
  const [workItems, capabilities, nfrs, assumptions, components, decisions, tasks] = await Promise.all([
    db.workItem.findMany({ where: { productId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, type: true, referenceCode: true } }),
    db.productCapability.findMany({ where: { productId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, referenceCode: true } }),
    db.nonFunctionalRequirement.findMany({ where: { productId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, referenceCode: true } }),
    db.requirementAssumption.findMany({ where: { productId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, referenceCode: true } }),
    db.architectureComponent.findMany({
      where: { architecture: { productId } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, referenceCode: true, solutionArchitectureId: true },
    }),
    db.architectureDecisionRecord.findMany({
      where: { productId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, referenceCode: true, solutionArchitectureId: true },
    }),
    db.implementationTask.findMany({
      where: { plan: { productId } },
      orderBy: [{ sequence: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      select: { id: true, referenceCode: true, implementationPlanId: true },
    }),
  ]);

  const byPrefix = new Map<string, string[]>();
  for (const item of workItems) {
    const key = item.type;
    byPrefix.set(key, [...(byPrefix.get(key) ?? []), item.referenceCode].filter(Boolean));
  }
  for (const item of workItems) {
    if (item.referenceCode) continue;
    const key = item.type;
    const codes = byPrefix.get(key) ?? [];
    const code = nextReferenceCode(codes, workItemPrefix(item.type));
    codes.push(code);
    byPrefix.set(key, codes);
    await db.workItem.update({ where: { id: item.id }, data: { referenceCode: code } });
  }

  await fill(capabilities, capabilities.map((item) => item.referenceCode).filter(Boolean), () => "CAP", (id, code) =>
    db.productCapability.update({ where: { id }, data: { referenceCode: code } }),
  );
  await fill(nfrs, nfrs.map((item) => item.referenceCode).filter(Boolean), () => "NFR", (id, code) =>
    db.nonFunctionalRequirement.update({ where: { id }, data: { referenceCode: code } }),
  );
  await fill(assumptions, assumptions.map((item) => item.referenceCode).filter(Boolean), () => "ASM", (id, code) =>
    db.requirementAssumption.update({ where: { id }, data: { referenceCode: code } }),
  );

  const componentGroups = new Map<string, typeof components>();
  for (const item of components) {
    componentGroups.set(item.solutionArchitectureId, [...(componentGroups.get(item.solutionArchitectureId) ?? []), item]);
  }
  for (const group of componentGroups.values()) {
    await fill(group, group.map((item) => item.referenceCode).filter(Boolean), () => "CMP", (id, code) =>
      db.architectureComponent.update({ where: { id }, data: { referenceCode: code } }),
    );
  }
  const decisionGroups = new Map<string, typeof decisions>();
  for (const item of decisions) {
    decisionGroups.set(item.solutionArchitectureId, [...(decisionGroups.get(item.solutionArchitectureId) ?? []), item]);
  }
  for (const group of decisionGroups.values()) {
    await fill(group, group.map((item) => item.referenceCode).filter(Boolean), () => "ADR", (id, code) =>
      db.architectureDecisionRecord.update({ where: { id }, data: { referenceCode: code } }),
    );
  }
  const taskGroups = new Map<string, typeof tasks>();
  for (const item of tasks) {
    taskGroups.set(item.implementationPlanId, [...(taskGroups.get(item.implementationPlanId) ?? []), item]);
  }
  for (const group of taskGroups.values()) {
    await fill(group, group.map((item) => item.referenceCode).filter(Boolean), () => "TSK", (id, code) =>
      db.implementationTask.update({ where: { id }, data: { referenceCode: code } }),
    );
  }
}

export async function findStaleDesignReferences(productId: string) {
  const coverages = await db.nfrCoverage.findMany({
    where: { architecture: { productId, status: { not: "SUPERSEDED" } } },
    include: { nfr: { select: { title: true, status: true, referenceCode: true } } },
    orderBy: { createdAt: "asc" },
  });
  const stale = coverages.filter((coverage) => !coverage.nfr || coverage.nfr.status === "REJECTED");
  if (stale.length === 0) return "";
  const item = stale[0]?.nfr?.referenceCode || stale[0]?.nfr?.title || stale[0]?.mechanism || "the design";
  return staleDesignReferenceMessage(item);
}

export function citedFromContext(input: {
  nfrs: { id: string; referenceCode: string; title: string }[];
  workItems: { id: string; referenceCode: string; title: string }[];
  assumptions: { id: string; referenceCode: string; description: string }[];
  capabilities: { id: string; referenceCode: string; name: string }[];
  components: { id: string; referenceCode: string; name: string }[];
  decisions: { id: string; referenceCode: string; title: string }[];
  tasks: { id: string; referenceCode: string; title: string }[];
}): CitedRecord[] {
  return [
    ...input.nfrs.map((item) => ({ kind: "nfr" as const, id: item.id, code: item.referenceCode, label: item.title })),
    ...input.workItems.map((item) => ({ kind: "workItem" as const, id: item.id, code: item.referenceCode, label: item.title })),
    ...input.assumptions.map((item) => ({ kind: "assumption" as const, id: item.id, code: item.referenceCode, label: item.description })),
    ...input.capabilities.map((item) => ({ kind: "capability" as const, id: item.id, code: item.referenceCode, label: item.name })),
    ...input.components.map((item) => ({ kind: "component" as const, id: item.id, code: item.referenceCode, label: item.name })),
    ...input.decisions.map((item) => ({ kind: "decision" as const, id: item.id, code: item.referenceCode, label: item.title })),
    ...input.tasks.map((item) => ({ kind: "task" as const, id: item.id, code: item.referenceCode, label: item.title })),
  ];
}
