export const REFERENCE_KINDS = [
  "nfr",
  "workItem",
  "assumption",
  "capability",
  "component",
  "decision",
  "task",
] as const;

export type ReferenceKind = (typeof REFERENCE_KINDS)[number];

export type CitedRecord = {
  kind: ReferenceKind;
  id: string;
  code: string;
  label: string;
};

const KIND_LABEL: Record<ReferenceKind, string> = {
  nfr: "non-functional requirement",
  workItem: "work item",
  assumption: "assumption",
  capability: "capability",
  component: "architecture component",
  decision: "architecture decision",
  task: "implementation task",
};

export function formatReferenceCode(prefix: string, sequence: number) {
  return `${prefix}-${String(sequence).padStart(3, "0")}`;
}

export function workItemPrefix(type: string) {
  if (type === "EPIC") return "EPIC";
  if (type === "FEATURE") return "FEAT";
  if (type === "STORY") return "STORY";
  if (type === "DEFECT") return "DEFECT";
  return "TASK";
}

export function nextReferenceCode(existing: string[], prefix: string) {
  const pattern = new RegExp(`^${prefix}-(\\d+)$`);
  let max = 0;
  for (const code of existing) {
    const match = pattern.exec(code);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return formatReferenceCode(prefix, max + 1);
}

export function resolveCited(records: CitedRecord[], kind: ReferenceKind, value: string): { id: string } | { error: string } {
  const trimmed = value.trim();
  if (!trimmed) return { id: "" };
  const expected = records.filter((record) => record.kind === kind);
  const byCode = expected.find((record) => record.code.toLowerCase() === trimmed.toLowerCase());
  if (byCode) return { id: byCode.id };
  const byId = expected.find((record) => record.id === trimmed);
  if (byId) return { id: byId.id };
  const allowed = expected.map((record) => record.code).filter(Boolean);
  const allowedText = allowed.length > 0 ? allowed.join(", ") : "none";
  const other = records.find((record) => record.id === trimmed || record.code.toLowerCase() === trimmed.toLowerCase());
  if (other) {
    return {
      error: `Governance review cannot complete because "${other.label}" (${other.code || "unlabelled"}) is a ${KIND_LABEL[other.kind]}, not a ${KIND_LABEL[kind]}. Use one of: ${allowedText}. Leave the link empty when it does not apply.`,
    };
  }
  return {
    error: `Governance review cannot complete because ${KIND_LABEL[kind]} reference "${trimmed}" is not part of the current approved definition. Use one of: ${allowedText}.`,
  };
}

export function presentForModel<T>(value: T, records: CitedRecord[]): T {
  const codes = new Map(records.filter((record) => record.code).map((record) => [record.id, record.code]));
  function walk(node: unknown): unknown {
    if (typeof node === "string") return codes.get(node) ?? node;
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== "object") return node;
    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(node)) {
      if (key === "id") {
        if (typeof child === "string" && codes.has(child)) output.reference = codes.get(child);
        continue;
      }
      output[key] = walk(child);
    }
    return output;
  }
  return walk(value) as T;
}

function rewrite(records: CitedRecord[], kind: ReferenceKind, value: unknown, errors: string[]) {
  if (typeof value !== "string") return value;
  const resolved = resolveCited(records, kind, value);
  if ("error" in resolved) {
    errors.push(resolved.error);
    return value;
  }
  return resolved.id;
}

export function translateGovernanceReferences<T extends {
  findings: Array<{ componentId: string; adrId: string; taskId: string; nfrId: string; workItemId: string; assumptionId: string }>;
  threats: Array<{ affectedComponentId: string }>;
  codingRiskAssessments: Array<{ taskId: string }>;
}>(response: T, records: CitedRecord[]): { data: T; errors: string[] } {
  const errors: string[] = [];
  const data = structuredClone(response);
  for (const finding of data.findings) {
    finding.componentId = rewrite(records, "component", finding.componentId, errors) as string;
    finding.adrId = rewrite(records, "decision", finding.adrId, errors) as string;
    finding.taskId = rewrite(records, "task", finding.taskId, errors) as string;
    finding.nfrId = rewrite(records, "nfr", finding.nfrId, errors) as string;
    finding.workItemId = rewrite(records, "workItem", finding.workItemId, errors) as string;
    finding.assumptionId = rewrite(records, "assumption", finding.assumptionId, errors) as string;
  }
  for (const threat of data.threats) {
    threat.affectedComponentId = rewrite(records, "component", threat.affectedComponentId, errors) as string;
  }
  for (const risk of data.codingRiskAssessments) {
    risk.taskId = rewrite(records, "task", risk.taskId, errors) as string;
  }
  return { data, errors };
}

export function translateArchitectureReferences<T extends {
  components: Array<{ capabilityIds: string[]; workItemIds: string[]; nfrIds: string[] }>;
  nfrCoverage: Array<{ nfrId: string }>;
  implementationPlanProposal: { tasks: Array<{ workItemId: string }> };
}>(response: T, records: CitedRecord[]): { data: T; errors: string[] } {
  const errors: string[] = [];
  const data = structuredClone(response);
  for (const component of data.components) {
    component.capabilityIds = component.capabilityIds.map((id) => rewrite(records, "capability", id, errors) as string);
    component.workItemIds = component.workItemIds.map((id) => rewrite(records, "workItem", id, errors) as string);
    component.nfrIds = component.nfrIds.map((id) => rewrite(records, "nfr", id, errors) as string);
  }
  for (const coverage of data.nfrCoverage) {
    coverage.nfrId = rewrite(records, "nfr", coverage.nfrId, errors) as string;
  }
  for (const task of data.implementationPlanProposal.tasks) {
    task.workItemId = rewrite(records, "workItem", task.workItemId, errors) as string;
  }
  return { data, errors };
}

export function staleDesignReferenceMessage(item: string) {
  return `Governance review cannot complete because Design item ${item} references an NFR that is no longer part of the current approved definition.`;
}
