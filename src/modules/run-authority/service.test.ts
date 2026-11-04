import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/lib/db";
import { approveImplementationTask } from "@/modules/coding/service";
import { readyCodingProduct } from "@/modules/coding/ready-product.test-support";
import { authorityWording } from "@/modules/run-authority/manifest";
import { grantRunAuthority, recordAuthorityStep, requireAuthority, revokeRunAuthority } from "@/modules/run-authority/service";

const KEY = "synthetic-run-authority-key-32-bytes-long!!";
const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => {
  vi.stubEnv("EXTERNAL_REVIEW_APPROVAL_KEY", KEY);
  vi.stubEnv("OPERATOR_CONFIRMATION", "on");
});

// Products with a granted authority cannot be deleted (the records are append-only), so these tests leave them behind in the test database.
async function planned(risk: "LOW" | "MEDIUM" | "HIGH" = "LOW") {
  const setup = await readyCodingProduct({ taskStatus: "PROPOSED", mode: "SUPERVISED", risk });
  const planId = (await db.implementationTask.findUniqueOrThrow({ where: { id: setup.task.id } })).implementationPlanId;
  return { productId: setup.product.id, taskId: setup.task.id, planId };
}

describe("granting and stopping an authority", () => {
  it("is signed by a person, covers the plan's tasks, and is recorded as their approval of the grant only", async () => {
    const { productId, planId, taskId } = await planned();
    const authority = await grantRunAuthority({ productId, planId, credential: KEY });
    const approval = await db.approval.findUniqueOrThrow({ where: { id: authority.grantApprovalId } });
    expect(approval.approvalType).toBe("RUN_AUTHORITY");
    expect(approval.approvedBy).toBe("Local operator");
    expect(approval.authorityId).toBeNull();
    const manifest = authority.manifest as { tasks: { id: string }[]; riskCeiling: string; maxRetries: number };
    expect(manifest.tasks.map((task) => task.id)).toContain(taskId);
    expect(manifest.riskCeiling).toBe("LOW");
    expect(manifest.maxRetries).toBe(2);
    expect(authority.expiresAt.getTime() - authority.createdAt.getTime()).toBe(7 * DAY);
  });

  it("needs the operator credential, and writes nothing without it", async () => {
    const { productId, planId } = await planned();
    await expect(grantRunAuthority({ productId, planId, credential: "wrong" })).rejects.toThrow();
    expect(await db.runAuthority.count({ where: { productId } })).toBe(0);
  });

  it("refuses a second authority while one is active, and allows one after it is stopped", async () => {
    const { productId, planId } = await planned();
    const first = await grantRunAuthority({ productId, planId, credential: KEY });
    await expect(grantRunAuthority({ productId, planId, credential: KEY })).rejects.toThrow(/already has an authority/);
    await revokeRunAuthority({ authorityId: first.id, credential: KEY });
    await expect(grantRunAuthority({ productId, planId, credential: KEY })).resolves.toBeTruthy();
  });

  it("refuses a plan that is not approved", async () => {
    const { productId, planId } = await planned();
    await db.implementationPlan.update({ where: { id: planId }, data: { status: "DRAFT" } });
    await expect(grantRunAuthority({ productId, planId, credential: KEY })).rejects.toThrow(/Approve the plan/);
  });
});

describe("what an authority allows", () => {
  it("allows a task in its plan, and nothing for another product, another task, or after expiry or a stop", async () => {
    const { productId, planId, taskId } = await planned();
    const authority = await grantRunAuthority({ productId, planId, credential: KEY });
    await expect(requireAuthority({ authorityId: authority.id, productId, step: "APPROVE_TASK", taskId })).resolves.toMatchObject({ riskCeiling: "LOW", maxRetries: 2 });
    await expect(requireAuthority({ authorityId: authority.id, productId: randomUUID(), step: "APPROVE_TASK", taskId })).rejects.toThrow(/no authority for this product/);
    await expect(requireAuthority({ authorityId: authority.id, productId, step: "APPROVE_TASK", taskId: "not-in-plan" })).rejects.toThrow(/not part of the plan/);
    await expect(requireAuthority({ authorityId: authority.id, productId, step: "APPROVE_TASK", taskId, now: new Date(Date.now() + 8 * DAY) })).rejects.toThrow(/expired/);
    await revokeRunAuthority({ authorityId: authority.id, credential: KEY });
    await expect(requireAuthority({ authorityId: authority.id, productId, step: "APPROVE_TASK", taskId })).rejects.toThrow(/stopped/);
  });
});

describe("approving a task under authority", () => {
  it("approves a LOW risk task as the Builder under authority, and records the step", async () => {
    const { productId, planId, taskId } = await planned("LOW");
    const authority = await grantRunAuthority({ productId, planId, credential: KEY });
    await approveImplementationTask(productId, taskId, { underAuthority: { authorityId: authority.id } });
    expect((await db.implementationTask.findUniqueOrThrow({ where: { id: taskId } })).status).toBe("APPROVED");
    const events = await db.runAuthorityEvent.findMany({ where: { authorityId: authority.id, type: "STEP" } });
    expect(events.map((event) => [event.step, event.subjectId])).toEqual([["APPROVE_TASK", taskId]]);
    const activity = await db.activity.findFirst({ where: { productId, type: "CODING_TASK_APPROVED" }, orderBy: { createdAt: "desc" } });
    expect(activity?.description).toContain(authorityWording(authority.id, "Local operator"));
  });

  it("hands a MEDIUM risk task back to the person and changes nothing", async () => {
    const { productId, planId, taskId } = await planned("MEDIUM");
    const authority = await grantRunAuthority({ productId, planId, credential: KEY });
    await expect(approveImplementationTask(productId, taskId, { underAuthority: { authorityId: authority.id } })).rejects.toThrow(/MEDIUM risk.*needs you/);
    expect((await db.implementationTask.findUniqueOrThrow({ where: { id: taskId } })).status).toBe("PROPOSED");
    expect(await db.runAuthorityEvent.count({ where: { authorityId: authority.id } })).toBe(0);
  });

  it("cannot be impersonated by passing the Builder's wording as a name", async () => {
    const { productId, taskId } = await planned("LOW");
    await expect(approveImplementationTask(productId, taskId, { actorName: "Builder, under authority x granted by y" })).rejects.toThrow(/reserved/);
  });
});

describe("what the database refuses on its own", () => {
  async function granted() {
    const base = await planned();
    const authority = await grantRunAuthority({ productId: base.productId, planId: base.planId, credential: KEY });
    return { ...base, authority };
  }

  it("never lets a grant or an event be rewritten or deleted", async () => {
    const { authority } = await granted();
    await expect(db.runAuthority.update({ where: { id: authority.id }, data: { maxRetries: 5 } })).rejects.toThrow();
    await expect(db.runAuthority.delete({ where: { id: authority.id } })).rejects.toThrow();
    const event = await recordAuthorityStep(authority.id, "APPROVE_TASK", "t");
    await expect(db.runAuthorityEvent.delete({ where: { id: event.id } })).rejects.toThrow();
  });

  it("refuses the Builder's wording without an authority, and an authority without the wording", async () => {
    const { productId, authority } = await granted();
    await expect(db.approval.create({ data: { productId, approvalType: "CODE_CHANGE", status: "APPROVED", approvedBy: `Builder, under authority ${authority.id} granted by Local operator` } })).rejects.toThrow(/reserved/);
    await expect(db.approval.create({ data: { productId, approvalType: "CODE_CHANGE", status: "APPROVED", approvedBy: "Local user", authorityId: authority.id } })).rejects.toThrow(/must say so/);
    await expect(db.approval.create({ data: { productId, approvalType: "CODE_CHANGE", status: "APPROVED", approvedBy: authorityWording(authority.id, "Local operator"), authorityId: authority.id } })).resolves.toBeTruthy();
  });

  it("allows only a code change approval to be made under an authority", async () => {
    const { productId, authority } = await granted();
    for (const approvalType of ["VERIFICATION", "RELEASE", "IMPLEMENTATION_PLAN"]) {
      await expect(db.approval.create({ data: { productId, approvalType, status: "APPROVED", approvedBy: authorityWording(authority.id, "Local operator"), authorityId: authority.id } })).rejects.toThrow(/code change/);
    }
  });

  it("refuses to record a step once the authority is stopped, even if the service were bypassed", async () => {
    const { authority } = await granted();
    await revokeRunAuthority({ authorityId: authority.id, credential: KEY });
    await expect(recordAuthorityStep(authority.id, "APPROVE_CODE", "w")).rejects.toThrow(/expired or been revoked/);
  });

  it("refuses an approval that points at another product's authority", async () => {
    const { authority } = await granted();
    const other = await planned();
    await expect(db.approval.create({ data: { productId: other.productId, approvalType: "CODE_CHANGE", status: "APPROVED", approvedBy: authorityWording(authority.id, "Local operator"), authorityId: authority.id } })).rejects.toThrow(/same product/);
  });

  it("refuses a grant that is not backed by a person's resolved approval", async () => {
    const { productId, planId } = await planned();
    const fake = await db.approval.create({ data: { productId, approvalType: "RUN_AUTHORITY", status: "APPROVED", approvedBy: "Builder, under authority nothing", resolvedAt: new Date() } }).catch(() => null);
    expect(fake).toBeNull();
    const agent = await db.approval.create({ data: { productId, approvalType: "RUN_AUTHORITY", status: "PENDING" } });
    await expect(db.runAuthority.create({ data: { id: randomUUID(), productId, planId, grantApprovalId: agent.id, manifest: { kind: "RUN_AUTHORITY" } as never, digest: "a".repeat(64), signature: "b".repeat(64), expiresAt: new Date(Date.now() + DAY), maxRetries: 2, riskCeiling: "LOW" } })).rejects.toThrow();
  });
});
