import { describe, expect, it, vi } from "vitest";

import { db } from "@/lib/db";
import { installRunHarness, KEY, readyTask } from "@/modules/run-authority/harness.test-support";
import { orderedTaskIds, startFeatureRun, waitForRun } from "@/modules/run-authority/runner";
import { grantRunAuthority, stopRunAuthority } from "@/modules/run-authority/service";
import { getRunView } from "@/modules/run-authority/view";

installRunHarness();

describe("the background run and what the screen reads from it", () => {
  it("runs in the background, stops at the first task that needs the person, and the screen shows why after a reload", async () => {
    const { productId, taskId, planId } = await readyTask("LOW");
    const authority = await grantRunAuthority({ productId, planId, credential: KEY });

    const before = await getRunView(productId);
    expect(before.authority).toMatchObject({ status: "ACTIVE", running: false });
    expect(before.tasks.map((task) => task.state)).toEqual(["WAITING"]);

    expect(startFeatureRun({ productId, authorityId: authority.id })).toBe("started");
    // A second press while it runs does nothing.
    expect(startFeatureRun({ productId, authorityId: authority.id })).toBe("already-running");
    await waitForRun(authority.id);

    // Verification needs the container sandbox, which this fast test leaves off, so the Builder hands the task back and says why.
    const view = await getRunView(productId);
    expect(view.authority?.running).toBe(false);
    expect(view.tasks[0]).toMatchObject({ id: taskId, state: "NEEDS_YOU" });
    expect(view.tasks[0].reason.length).toBeGreaterThan(10);
    expect(view.headline).toContain("needs you");
    expect(await db.runAuthorityEvent.count({ where: { authorityId: authority.id, type: "RUN_STARTED" } })).toBe(1);
  }, 120_000);

  it("carrying on starts a fresh run that looks at the task again", async () => {
    const { productId, planId } = await readyTask("LOW");
    const authority = await grantRunAuthority({ productId, planId, credential: KEY });
    startFeatureRun({ productId, authorityId: authority.id });
    await waitForRun(authority.id);
    startFeatureRun({ productId, authorityId: authority.id });
    await waitForRun(authority.id);
    expect(await db.runAuthorityEvent.count({ where: { authorityId: authority.id, type: "RUN_STARTED" } })).toBe(2);
    // Nothing was approved twice.
    const steps = (await db.runAuthorityEvent.findMany({ where: { authorityId: authority.id, type: "STEP" } })).map((event) => event.step);
    expect(steps.filter((step) => step === "APPROVE_TASK")).toHaveLength(1);
  }, 120_000);

  it("shows a stopped authority as stopped and does nothing when started after being stopped", async () => {
    const { productId, taskId, planId } = await readyTask("LOW");
    const authority = await grantRunAuthority({ productId, planId, credential: KEY });
    await stopRunAuthority({ authorityId: authority.id, stoppedBy: "Local user" });
    expect(startFeatureRun({ productId, authorityId: authority.id })).toBe("started");
    await waitForRun(authority.id);
    expect((await db.implementationTask.findUniqueOrThrow({ where: { id: taskId } })).status).toBe("PROPOSED");
    const view = await getRunView(productId);
    expect(view.authority?.status).toBe("STOPPED");
    expect(view.headline).toContain("was stopped");
    // Stopping twice is harmless.
    await expect(stopRunAuthority({ authorityId: authority.id, stoppedBy: "Local user" })).resolves.toBeUndefined();
  });

  it("offers the grant only when there is an approved plan with tasks and operator confirmation is set up", async () => {
    const { productId, planId } = await readyTask("LOW");
    expect((await getRunView(productId)).grant).toEqual({ available: true, reasons: [] });
    vi.stubEnv("EXTERNAL_REVIEW_APPROVAL_KEY", "");
    expect((await getRunView(productId)).grant.available).toBe(false);
    vi.stubEnv("EXTERNAL_REVIEW_APPROVAL_KEY", KEY);
    await db.implementationPlan.update({ where: { id: planId }, data: { status: "DRAFT" } });
    expect(await getRunView(productId)).toMatchObject({ planId: null, grant: { available: false } });
  });

  it("orders tasks so one runs after what it depends on", async () => {
    const { planId, taskId } = await readyTask("LOW");
    const first = await db.implementationTask.create({ data: { implementationPlanId: planId, title: "Foundation", status: "PROPOSED" } });
    await db.implementationTaskDependency.create({ data: { taskId, dependsOnId: first.id } });
    const order = await orderedTaskIds(planId);
    expect(order.indexOf(first.id)).toBeLessThan(order.indexOf(taskId));
  });
});
