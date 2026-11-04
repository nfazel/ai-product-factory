import { describe, expect, it } from "vitest";

import { codeGuardrails } from "@/modules/run-authority/guardrails";

const ok = { riskLevel: "LOW", riskCeiling: "LOW", fileCount: 3, maxFiles: 8, openEscalations: 0 };

describe("when the Builder may approve code by itself", () => {
  it("allows a LOW risk change inside the limits", () => {
    expect(codeGuardrails(ok)).toEqual({ ok: true });
  });

  it("hands MEDIUM and HIGH risk back to the person, with the reason", () => {
    for (const riskLevel of ["MEDIUM", "HIGH", "UNKNOWN"]) {
      const result = codeGuardrails({ ...ok, riskLevel });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reasons[0]).toContain("needs you");
    }
  });

  it("hands back a change that is bigger than the limit, but not one exactly at it, and ignores a missing limit", () => {
    expect(codeGuardrails({ ...ok, fileCount: 9 }).ok).toBe(false);
    expect(codeGuardrails({ ...ok, fileCount: 8 }).ok).toBe(true);
    expect(codeGuardrails({ ...ok, fileCount: 50, maxFiles: null }).ok).toBe(true);
  });

  it("hands back anything with an open escalation, and lists every reason at once", () => {
    const result = codeGuardrails({ ...ok, riskLevel: "HIGH", fileCount: 99, openEscalations: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons).toHaveLength(3);
  });
});
