import { afterEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { setAIProviderForTests } from "@/modules/ai/provider";
import { getCodingReadiness } from "@/modules/architecture/service";
import { approvePlan, planApprovalBlockers } from "@/modules/plan/approve";
import { prepareTechnical } from "@/modules/plan/prepare-technical";
import { chainProvider, draftedFeaturesProduct, originalKey } from "@/modules/plan/testing";

const created: string[] = [];
async function drafted() {
  const setup = await draftedFeaturesProduct();
  created.push(setup.product.id);
  setAIProviderForTests(chainProvider(setup));
  expect(await prepareTechnical(setup.product.id)).toEqual({ status: "DRAFTED" });
  return setup;
}

afterEach(async () => {
  setAIProviderForTests(null);
  process.env.OPENAI_API_KEY = originalKey;
  while (created.length > 0) {
    const id = created.pop();
    if (id) await db.product.delete({ where: { id } }).catch(() => undefined);
  }
});

describe("approving the whole plan", () => {
  it("records every approval in order, moves the product to Build, and leaves coding ready", async () => {
    const { product } = await drafted();
    expect((await getCodingReadiness(product.id)).ready).toBe(false);
    const result = await approvePlan(product.id);
    expect(result.recorded).toEqual(["the features and first slice", "the move to building", "the design", "the work", "the engineering review", "the coding rules"]);

    const types = (await db.approval.findMany({ where: { productId: product.id, status: "APPROVED" }, orderBy: { requestedAt: "asc" } })).map((approval) => approval.approvalType);
    expect(types).toEqual(["PRODUCT_DEFINITION", "SOLUTION_ARCHITECTURE", "IMPLEMENTATION_PLAN", "ENGINEERING_GOVERNANCE", "CODING_POLICY"]);
    // They are the person's approvals, never the AI's.
    expect((await db.approval.findMany({ where: { productId: product.id } })).every((approval) => approval.approvedBy === "Local user")).toBe(true);
    expect((await db.product.findUniqueOrThrow({ where: { id: product.id } })).currentStage).toBe("BUILD");
    expect((await getCodingReadiness(product.id)).ready).toBe(true);
    // Each step says it was part of the plan approval.
    const notes = await db.activity.findMany({ where: { productId: product.id, type: "WHOLE_PLAN_APPROVED" } });
    expect(notes.length).toBe(7);
    expect(notes.every((note) => note.description.includes(result.bundleId))).toBe(true);
  }, 60_000);

  it("approves nothing, and says which section blocks it, when a part is not ready", async () => {
    const { product } = await drafted();
    const review = await db.engineeringGovernanceReview.findFirstOrThrow({ where: { productId: product.id } });
    await db.engineeringGovernanceReview.update({ where: { id: review.id }, data: { status: "DRAFT" } });
    expect(await planApprovalBlockers(product.id)).toEqual([{ section: "rules", reason: "The review and coding rules are not drafted and ready yet." }]);
    await expect(approvePlan(product.id)).rejects.toThrow(/Nothing was approved/);
    expect(await db.approval.count({ where: { productId: product.id } })).toBe(0);
  }, 60_000);

  it("refuses while a critical finding is open", async () => {
    const { product } = await drafted();
    const finding = await db.governanceFinding.findFirstOrThrow({ where: { review: { productId: product.id } } });
    await db.governanceFinding.update({ where: { id: finding.id }, data: { severity: "CRITICAL", status: "OPEN" } });
    await expect(approvePlan(product.id)).rejects.toThrow(/critical finding/);
    expect(await db.approval.count({ where: { productId: product.id } })).toBe(0);
  }, 60_000);

  it("carries on after a stop, without approving anything twice", async () => {
    const { product } = await drafted();
    // Something already approved on the old pages is left alone.
    const first = await approvePlan(product.id);
    expect(first.recorded.length).toBe(6);
    const again = await approvePlan(product.id);
    expect(again.recorded).toEqual([]);
    expect(await db.approval.count({ where: { productId: product.id, status: "APPROVED" } })).toBe(5);
  }, 60_000);

  it("refuses when the brief is not approved", async () => {
    const { product } = await drafted();
    await db.productBrief.updateMany({ where: { productId: product.id }, data: { status: "DRAFT" } });
    expect((await planApprovalBlockers(product.id)).map((blocker) => blocker.section)).toContain("brief");
    await expect(approvePlan(product.id)).rejects.toThrow(/Nothing was approved/);
  }, 60_000);
});
