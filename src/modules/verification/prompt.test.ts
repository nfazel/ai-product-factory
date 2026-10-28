import { describe, expect, it } from "vitest";

import { VERIFICATION_SYSTEM_PROMPT, withDeclaredAccountKeys } from "@/modules/verification/prompt";
import { validateFixturePlan } from "@/modules/verification/http/fixtures";
import { classifyVerificationWrite, isVerificationTestPath, verificationMarker } from "@/modules/verification/policy";

describe("verification test case contract", () => {
  it("tells the agent where executable tests must live and how they link to a criterion", () => {
    expect(VERIFICATION_SYSTEM_PROMPT).toContain("verification/<name>.test.mjs");
    expect(VERIFICATION_SYSTEM_PROMPT).toContain("// verifies:<acceptanceCriterionId>");
    expect(VERIFICATION_SYSTEM_PROMPT).toContain("node:test");
  });

  it("states that product source paths are never executed, and manual cases are marked as manual", () => {
    expect(VERIFICATION_SYSTEM_PROMPT).toContain("Never use a product source file");
    expect(VERIFICATION_SYSTEM_PROMPT).toContain("set automated to false");
    expect(VERIFICATION_SYSTEM_PROMPT).toContain("A manual case is not executed until a person records its result.");
  });

  it("does not present source-text checks as acceptance evidence", () => {
    expect(VERIFICATION_SYSTEM_PROMPT).toContain("not proof of behaviour");
  });

  it("matches the path and marker rules the runner enforces", () => {
    expect(isVerificationTestPath("verification/abc/claim.test.mjs")).toBe(true);
    expect(isVerificationTestPath("src/app/(app)/products/[id]/testing/page.tsx")).toBe(false);
    expect(verificationMarker("crit-1")).toBe("// verifies:crit-1");
    expect(classifyVerificationWrite("/tmp/verification-workspace", "src/app/discovery/page.tsx").ok).toBe(false);
  });
});

describe("HTTP account and capability rules in the planning prompt", () => {
  it("replaces plan account context with the validated fixture keys, including an empty account set", () => {
    const original = withDeclaredAccountKeys("Bounded context", { required: true, accountKeys: ["viewer"] });
    const corrected = withDeclaredAccountKeys(original, { required: true, accountKeys: ["seeker", "target"] });
    expect(corrected).toContain("Validated verification account keys for this plan");
    expect(corrected).toContain("- seeker\n- target");
    expect(corrected).not.toContain("- viewer");

    const none = withDeclaredAccountKeys(corrected, { required: false, accountKeys: [] });
    expect(none).toContain("(none) - no authentication accounts will be provisioned");
    expect(none).not.toContain("- seeker");
  });

  it("states the account key format the fixture validator enforces", () => {
    expect(VERIFICATION_SYSTEM_PROMPT).toContain("lowercase letters, digits and hyphens only");
    expect(VERIFICATION_SYSTEM_PROMPT).toContain("viewer or candidate-b");
    expect(VERIFICATION_SYSTEM_PROMPT).toContain("Format-only examples include viewer or candidate-b");
    expect(VERIFICATION_SYSTEM_PROMPT).toContain("not available unless they appear in that validated list");
    expect(VERIFICATION_SYSTEM_PROMPT).toContain("keys retained by fixture validation");
  });

  it("tells the agent to declare authenticated-session only when the body signs in", () => {
    expect(VERIFICATION_SYSTEM_PROMPT).toContain("Declare authenticated-session in requiredCapabilities only when the test body signs in");
    expect(VERIFICATION_SYSTEM_PROMPT).toContain("VERIFICATION_PATHS");
    expect(VERIFICATION_SYSTEM_PROMPT).toContain("getSetCookie");
    expect(VERIFICATION_SYSTEM_PROMPT).toContain("Derive the requests from the approved acceptance criterion");
  });

  it("documents example account keys that the validator accepts, and the invalid form it refuses", () => {
    const routes = ["/api/auth/signup", "/api/auth/login", "/api/discovery/feed"];
    const accepted = validateFixturePlan(
      {
        authentication: { required: true, signupPath: "/api/auth/signup", loginPath: "/api/auth/login", accountKeys: ["viewer", "candidate-b"] },
        steps: [],
      },
      routes,
    );
    expect(accepted.plan.authentication.accountKeys).toEqual(["viewer", "candidate-b"]);
    expect(accepted.plan.authentication.required).toBe(true);

    const refused = validateFixturePlan(
      {
        authentication: { required: true, signupPath: "/api/auth/signup", loginPath: "/api/auth/login", accountKeys: ["userA"] },
        steps: [],
      },
      routes,
    );
    expect(refused.plan.authentication.required).toBe(false);
    expect(refused.notes.join(" ")).toMatch(/Account key "userA" was refused/);
  });
});
