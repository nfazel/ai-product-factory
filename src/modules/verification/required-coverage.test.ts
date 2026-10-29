import { describe, expect, it } from "vitest";
import { requiredFunctionalCriteria } from "@/modules/verification/obligations";
import { decideVerdict } from "@/modules/verification/verdict";

describe("approved requirements are independent of recorded coverage", () => {
  it("retains a missing requirement as untested rather than manufacturing a pass", () => {
    const criteria = requiredFunctionalCriteria([{ id: "approved-a", description: "Create a reservation" }, { id: "approved-b", description: "Reject conflicts" }], [{ id: "approved-a", status: "VERIFIED" }]);
    expect(criteria.find(item => item.id === "approved-b")?.status).toBe("NOT_TESTED");
    const result = decideVerdict({ coverages: [{ status: "VERIFIED", humanConfirmed: false }], executions: [], defects: [], blockingEscalation: false, obligations: criteria.map(item => ({ id: item.id, title: item.description, kind: "FUNCTIONAL_ACCEPTANCE", source: "FUNCTIONAL_ACCEPTANCE_CRITERION", mandatory: true, status: item.status, evidence: "" })) });
    expect(result.verdict).not.toBe("PASS");
  });
  it("retains stale bound criteria so current requirements cannot erase a failed result", () => {
    expect(requiredFunctionalCriteria([], [{ id: "bound", status: "FAILED" }])[0].status).toBe("FAILED");
  });
});
