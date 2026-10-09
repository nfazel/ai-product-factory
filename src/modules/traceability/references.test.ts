import { describe, expect, it } from "vitest";

import {
  formatReferenceCode,
  nextReferenceCode,
  presentForModel,
  resolveCited,
  staleDesignReferenceMessage,
  translateArchitectureReferences,
  translateGovernanceReferences,
  type CitedRecord,
} from "@/modules/traceability/references";

const records: CitedRecord[] = [
  { kind: "nfr", id: "nfr-row", code: "NFR-001", label: "Encrypt data" },
  { kind: "nfr", id: "nfr-row-2", code: "NFR-002", label: "Retain data" },
  { kind: "component", id: "cmv13x4h7000w69ppvmh2yzq0", code: "CMP-002", label: "Core Backend Service" },
  { kind: "workItem", id: "story-row", code: "STORY-001", label: "Submit a claim" },
  { kind: "capability", id: "cap-row", code: "CAP-001", label: "Claims" },
  { kind: "task", id: "task-row", code: "TSK-001", label: "Validate the notice" },
  { kind: "decision", id: "adr-row", code: "ADR-001", label: "Use a modular monolith" },
  { kind: "assumption", id: "asm-row", code: "ASM-001", label: "Users have an account" },
];

describe("stable references", () => {
  it("keeps the next code when earlier codes already exist", () => {
    expect(formatReferenceCode("NFR", 1)).toBe("NFR-001");
    expect(nextReferenceCode(["NFR-001", "NFR-003"], "NFR")).toBe("NFR-004");
  });

  it("maps a stable NFR code back to the current row and rejects a component id used as an NFR", () => {
    expect(resolveCited(records, "nfr", "NFR-001")).toEqual({ id: "nfr-row" });
    expect(resolveCited(records, "nfr", "")).toEqual({ id: "" });
    const mixed = resolveCited(records, "nfr", "cmv13x4h7000w69ppvmh2yzq0");
    expect("error" in mixed).toBe(true);
    if ("error" in mixed) {
      expect(mixed.error).toMatch(/Core Backend Service/);
      expect(mixed.error).toMatch(/architecture component/);
      expect(mixed.error).toMatch(/NFR-001, NFR-002/);
      expect(mixed.error).toMatch(/cannot complete/);
    }
  });

  it("reports a deleted NFR without inventing a replacement", () => {
    const missing = resolveCited(records, "nfr", "NFR-999");
    expect("error" in missing && missing.error).toMatch(/no longer part of the current approved definition|not part of the current approved definition/);
    expect(staleDesignReferenceMessage("NFR-001")).toMatch(/Design item NFR-001/);
    expect(staleDesignReferenceMessage("NFR-001")).not.toMatch(/nfr-row/);
  });

  it("hides database ids from the model context and restores them before validation", () => {
    const presented = presentForModel(
      {
        nonFunctionalRequirements: [{ id: "nfr-row", title: "Encrypt data" }],
        components: [{ id: "cmv13x4h7000w69ppvmh2yzq0", name: "Core Backend Service" }],
      },
      records,
    );
    expect(JSON.stringify(presented)).not.toContain("nfr-row");
    expect(JSON.stringify(presented)).not.toContain("cmv13x4h7000w69ppvmh2yzq0");
    expect(presented.nonFunctionalRequirements[0]).toMatchObject({ reference: "NFR-001" });

    const translated = translateArchitectureReferences(
      {
        components: [{ capabilityIds: ["CAP-001"], workItemIds: ["STORY-001"], nfrIds: ["NFR-002"] }],
        nfrCoverage: [{ nfrId: "NFR-001" }],
        implementationPlanProposal: { tasks: [{ workItemId: "STORY-001" }] },
      },
      records,
    );
    expect(translated.errors).toEqual([]);
    expect(translated.data.nfrCoverage[0]?.nfrId).toBe("nfr-row");
    expect(translated.data.components[0]?.nfrIds).toEqual(["nfr-row-2"]);
  });

  it("rejects an architecture reference that is not a current requirement before it could be stored", () => {
    const translated = translateArchitectureReferences(
      {
        components: [{ capabilityIds: [], workItemIds: [], nfrIds: ["cmv13x4h7000w69ppvmh2yzq0"] }],
        nfrCoverage: [{ nfrId: "NFR-001" }],
        implementationPlanProposal: { tasks: [{ workItemId: "" }] },
      },
      records,
    );
    expect(translated.errors[0]).toMatch(/Core Backend Service/);
    expect(translated.data.nfrCoverage[0]?.nfrId).toBe("nfr-row");
  });

  it("translates a governance finding that uses reference codes", () => {
    const translated = translateGovernanceReferences(
      {
        findings: [{
          componentId: "CMP-002",
          adrId: "ADR-001",
          taskId: "TSK-001",
          nfrId: "NFR-001",
          workItemId: "STORY-001",
          assumptionId: "",
        }],
        threats: [{ affectedComponentId: "CMP-002" }],
        codingRiskAssessments: [{ taskId: "TSK-001" }],
      },
      records,
    );
    expect(translated.errors).toEqual([]);
    expect(translated.data.findings[0]).toMatchObject({
      componentId: "cmv13x4h7000w69ppvmh2yzq0",
      nfrId: "nfr-row",
      assumptionId: "",
    });
  });
});
