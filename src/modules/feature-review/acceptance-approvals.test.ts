import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { ACCEPTANCE_APPROVAL_NOTE, approveVerificationsAtAcceptance, isAcceptanceApproval, reviewedApprovals } from "@/modules/feature-review/acceptance-approvals";
import type { FeatureReviewManifest, TechnicalFact } from "@/modules/feature-review/manifest";
import { completedTaskIn } from "@/modules/verification/completed-task.test-support";
import { VERIFICATION_EVIDENCE_INCLUDE, verificationEvidenceFingerprint } from "@/modules/verification/integrity";

const repos: string[] = [];
afterEach(() => { for (const repo of repos.splice(0)) fs.rmSync(repo, { recursive: true, force: true }); });

function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apf-acc-"));
  repos.push(dir);
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "x", scripts: { test: "node -e \"process.exit(0)\"" } }));
  const git = (args: string[]) => execFileSync("git", ["-c", "commit.gpgsign=false", ...args], { cwd: dir });
  git(["init", "-b", "main"]); git(["config", "user.email", "t@example.com"]); git(["config", "user.name", "T"]); git(["add", "."]); git(["commit", "-m", "init"]);
  return dir;
}

async function passingSession(verdict: "PASS" | "PASS_WITH_CONCERNS" = "PASS") {
  const setup = await completedTaskIn(repo(), { pass: true });
  const session = await db.verificationSession.create({ data: { productId: setup.product.id, implementationTaskId: setup.task.id, status: "PASSED", overallVerdict: verdict, commitSha: setup.sha } });
  const loaded = await db.verificationSession.findUniqueOrThrow({ where: { id: session.id }, include: VERIFICATION_EVIDENCE_INCLUDE });
  return { setup, session, fingerprint: verificationEvidenceFingerprint(loaded) };
}

function manifestFor(productId: string, facts: Partial<TechnicalFact>[]): FeatureReviewManifest {
  return { kind: "FEATURE_REVIEW_MANIFEST", version: 1, productId, featureId: "feature-1", technical: facts.map((fact) => ({ taskId: "", taskStatus: "COMPLETED", sessionId: "", commitSha: "", verdict: "PASS", fingerprint: "", approvalIds: [], authorityDigest: "", current: true, criteria: [], mandatoryPassed: true, concerns: [], ...fact })) } as unknown as FeatureReviewManifest;
}

describe("the owner's approval of task verifications, recorded by accepting the feature", () => {
  it("records one approval per covered task that has none, attributed to the owner and to the acceptance", async () => {
    const { setup, session, fingerprint } = await passingSession();
    const manifest = manifestFor(setup.product.id, [{ taskId: setup.task.id, sessionId: session.id, commitSha: setup.sha, fingerprint }]);
    const created = await approveVerificationsAtAcceptance(db, { manifest, eventId: "event-1", actorName: "Local operator" });
    expect(created).toHaveLength(1);
    const approval = await db.approval.findUniqueOrThrow({ where: { id: created[0] } });
    expect(approval).toMatchObject({ approvalType: "VERIFICATION", status: "APPROVED", approvedBy: "Local operator" });
    expect(isAcceptanceApproval(approval.comments)).toBe(true);
    expect(approval.comments).toContain("feature-1");
    const link = await db.verificationApproval.findFirstOrThrow({ where: { approvalId: approval.id } });
    expect(link).toMatchObject({ sessionId: session.id, evidenceFingerprint: fingerprint, stale: false });
  });

  it("does not approve again a task that already has the owner's own approval, or one recorded earlier", async () => {
    const { setup, session, fingerprint } = await passingSession("PASS_WITH_CONCERNS");
    const has = manifestFor(setup.product.id, [{ taskId: setup.task.id, sessionId: session.id, commitSha: setup.sha, fingerprint, approvalIds: ["own"] }]);
    expect(await approveVerificationsAtAcceptance(db, { manifest: has, eventId: "e", actorName: "Local operator" })).toEqual([]);
    const needs = manifestFor(setup.product.id, [{ taskId: setup.task.id, sessionId: session.id, commitSha: setup.sha, fingerprint }]);
    expect(await approveVerificationsAtAcceptance(db, { manifest: needs, eventId: "e", actorName: "Local operator" })).toHaveLength(1);
    expect(await approveVerificationsAtAcceptance(db, { manifest: needs, eventId: "e", actorName: "Local operator" })).toEqual([]);
  });

  it("stops the whole acceptance if a task's evidence is not what was reviewed, and records nothing", async () => {
    const good = await passingSession();
    const changed = await passingSession();
    const manifest = manifestFor(good.setup.product.id, [
      { taskId: good.setup.task.id, sessionId: good.session.id, commitSha: good.setup.sha, fingerprint: good.fingerprint },
      { taskId: changed.setup.task.id, sessionId: changed.session.id, commitSha: changed.setup.sha, fingerprint: "v2:not-what-was-reviewed" },
    ]);
    // Both sessions belong to different products here, so the second is also refused as foreign. Either way nothing is approved.
    await expect(db.$transaction((tx) => approveVerificationsAtAcceptance(tx, { manifest, eventId: "e", actorName: "Local operator" }))).rejects.toThrow();
    expect(await db.verificationApproval.count({ where: { sessionId: good.session.id } })).toBe(0);
  });

  it("refuses a task verification that is not passing or cannot be found", async () => {
    const { setup, session, fingerprint } = await passingSession();
    await db.verificationSession.update({ where: { id: session.id }, data: { overallVerdict: "FAIL" } });
    const failed = manifestFor(setup.product.id, [{ taskId: setup.task.id, sessionId: session.id, commitSha: setup.sha, fingerprint }]);
    await expect(approveVerificationsAtAcceptance(db, { manifest: failed, eventId: "e", actorName: "Local operator" })).rejects.toThrow(/could not be found/);
    const missing = manifestFor(setup.product.id, [{ taskId: setup.task.id, sessionId: "no-such-session", fingerprint }]);
    await expect(approveVerificationsAtAcceptance(db, { manifest: missing, eventId: "e", actorName: "Local operator" })).rejects.toThrow(/could not be found/);
  });

  it("leaves out of the reviewed authority the approvals that acceptance itself records", () => {
    const own = { approval: { comments: "Verification for task t at abc." } };
    const accepted = { approval: { comments: `${ACCEPTANCE_APPROVAL_NOTE} f (review e). Task t at abc.` } };
    expect(reviewedApprovals([own, accepted])).toEqual([own]);
    expect(isAcceptanceApproval(null)).toBe(false);
  });
});
