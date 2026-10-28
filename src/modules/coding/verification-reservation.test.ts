import { describe, expect, it } from "vitest";

import { classifyRead, classifyWrite, isVerificationReservedPath } from "@/modules/coding/policy";
import { VERIFICATION_SYSTEM_PROMPT } from "@/modules/verification/prompt";
import { classifyVerificationWrite } from "@/modules/verification/policy";

describe("verification files are reserved from the Coding Agent", () => {
  it("refuses the Coding Agent any write to verification files, even when a plan allows everything", () => {
    const result = classifyWrite("verification/claim/claim.test.mjs", ["**"], []);
    expect(result.ok).toBe(false);
    expect(result.kind).toBe("restricted");
    expect(result.reason).toMatch(/reserved for the Testing & Verification Agent/);
  });

  it("refuses the Coding Agent a read of verification files", () => {
    expect(classifyRead("verification/claim/claim.test.mjs", ["**"], []).ok).toBe(false);
  });

  it("does not reserve a product file whose name merely contains the word verification", () => {
    expect(isVerificationReservedPath("src/verification-banner.tsx")).toBe(false);
    expect(classifyWrite("src/verification-banner.tsx", ["**"], []).ok).toBe(true);
  });

  it("recognises the reserved root and nested paths, with or without a leading ./", () => {
    expect(isVerificationReservedPath("verification")).toBe(true);
    expect(isVerificationReservedPath("./verification/a.test.mjs")).toBe(true);
  });

  it("keeps the verification policy's own write rule unchanged for verification files", () => {
    expect(classifyVerificationWrite("/tmp/verification-workspace", "verification/claim/claim.test.mjs").ok).toBe(false);
    expect(classifyVerificationWrite("/tmp/verification-workspace", "src/claims/submit.mjs").ok).toBe(false);
  });
});

describe("verification prompt describes the real execution capabilities", () => {
  it("says automated execution is limited to node:test with relative JavaScript product modules", () => {
    expect(VERIFICATION_SYSTEM_PROMPT).toContain("node:test can run a verification test only when");
    expect(VERIFICATION_SYSTEM_PROMPT).toContain("TypeScript and JSX product modules cannot be loaded");
  });

  it("forbids unsupported runners and invented results", () => {
    expect(VERIFICATION_SYSTEM_PROMPT).toContain("Do not write automated tests that depend on an unavailable runner");
    expect(VERIFICATION_SYSTEM_PROMPT).toContain("Do not invent a result, an execution, or evidence.");
  });

  it("separates source inspection from executed verification", () => {
    expect(VERIFICATION_SYSTEM_PROMPT).toContain("Source inspection is not executed verification.");
  });

  it("asks the agent to explain manual cases with a specific reason", () => {
    expect(VERIFICATION_SYSTEM_PROMPT).toContain("manualReason");
    expect(VERIFICATION_SYSTEM_PROMPT).toContain("Assertions must depend on product behaviour.");
  });
});
