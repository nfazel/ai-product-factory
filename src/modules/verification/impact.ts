import "server-only";

import { db } from "@/lib/db";
import { recordActivity } from "@/modules/activity/service";

const MESSAGE = "RE-VERIFICATION REQUIRED.";

export async function noteVerificationStale(productId: string, reason: string) {
  const sessions = await db.verificationSession.findMany({
    where: { productId, demo: false, status: { not: "PLANNING" } },
  });
  if (sessions.length === 0) return;
  const flaggedAt = new Date();
  const message = reason.startsWith(MESSAGE) ? reason : `${MESSAGE} ${reason}`;
  await db.verificationSession.updateMany({
    where: { id: { in: sessions.map((session) => session.id) } },
    data: { stale: true, staleReason: message, staleFlaggedAt: flaggedAt },
  });
  await db.verificationContract.updateMany({
    where: { sessionId: { in: sessions.map((session) => session.id) } },
    data: { stale: true },
  });
  await db.verificationApproval.updateMany({
    where: { sessionId: { in: sessions.map((session) => session.id) }, stale: false },
    data: { stale: true, staleReason: message, staleFlaggedAt: flaggedAt },
  });
  await recordActivity({
    productId,
    type: "VERIFICATION_STALE",
    description: message,
  });
}

export async function noteVerificationCommitChanged(taskId: string, commitSha: string) {
  const sessions = await db.verificationSession.findMany({
    where: { implementationTaskId: taskId, demo: false, commitSha: { not: commitSha } },
  });
  if (sessions.length === 0) return;
  const flaggedAt = new Date();
  const message = `${MESSAGE} The implementation commit changed.`;
  await db.verificationSession.updateMany({
    where: { id: { in: sessions.map((session) => session.id) } },
    data: { stale: true, staleReason: message, staleFlaggedAt: flaggedAt },
  });
  await db.verificationApproval.updateMany({
    where: { sessionId: { in: sessions.map((session) => session.id) }, stale: false },
    data: { stale: true, staleReason: message, staleFlaggedAt: flaggedAt },
  });
  await recordActivity({
    productId: sessions[0]?.productId ?? "",
    type: "VERIFICATION_STALE",
    description: message,
  });
}
