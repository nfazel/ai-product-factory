import "server-only";

import { db } from "@/lib/db";
import { feedbackProgress, FEEDBACK_NEEDS_PERSON, type FeedbackFacts, type FeedbackStep } from "@/modules/rework/waiting-model";

export type FeedbackWaitingItem = {
  feedbackId: string;
  feature: string;
  text: string;
  step: FeedbackStep;
  sentence: string;
  /** Where to continue: the task page once there is a task, otherwise the feature review section of Build. */
  href: string;
};

/** Read-only: feedback that is waiting for a person, oldest first. Never changes anything. */
export async function feedbackWaiting(productId: string): Promise<FeedbackWaitingItem[]> {
  const threads = await db.featureFeedback.findMany({
    where: { productId },
    orderBy: { createdAt: "asc" },
    include: {
      events: { orderBy: { revision: "desc" }, take: 1, select: { type: true } },
      developmentScopes: {
        include: {
          revisions: {
            orderBy: { version: "desc" },
            take: 1,
            include: { decision: { select: { type: true } }, reworkAmendments: { orderBy: { createdAt: "desc" }, take: 1, include: { events: { select: { type: true, taskId: true } }, bindings: { select: { taskId: true } } } } },
          },
        },
      },
    },
  });
  if (!threads.length) return [];
  const features = await db.workItem.findMany({ where: { id: { in: threads.map((thread) => thread.featureId) } }, select: { id: true, title: true } });
  const items: FeedbackWaitingItem[] = [];
  for (const thread of threads) {
    const scope = thread.developmentScopes[0];
    const revision = scope?.revisions[0];
    const amendment = revision?.reworkAmendments[0];
    const types = new Set((amendment?.events ?? []).map((event) => event.type));
    const taskIds = (amendment?.bindings ?? []).map((binding) => binding.taskId);
    const tasks = taskIds.length ? await db.implementationTask.findMany({ where: { id: { in: taskIds } }, select: { id: true, title: true, status: true }, orderBy: { sequence: "asc" } }) : [];
    const authorised = new Set((amendment?.events ?? []).filter((event) => event.type === "TASK_EXECUTION_AUTHORISED" && event.taskId).map((event) => event.taskId as string));
    const facts: FeedbackFacts = {
      head: thread.events[0]?.type ?? null,
      scope: !scope ? "NONE" : revision?.decision?.type === "APPROVED" ? "APPROVED" : revision?.decision?.type === "REJECTED" ? "REJECTED" : "DRAFT",
      amendment: !amendment ? "NONE" : types.has("ACTIVATED") ? "ACTIVATED" : types.has("REJECTED") ? "REJECTED" : types.has("APPROVED") ? "APPROVED" : "DRAFTED",
      tasks: tasks.map((task) => ({ id: task.id, title: task.title, status: task.status, authorised: authorised.has(task.id) })),
    };
    const progress = feedbackProgress(facts);
    if (!FEEDBACK_NEEDS_PERSON.has(progress.step)) continue;
    items.push({
      feedbackId: thread.id,
      feature: features.find((feature) => feature.id === thread.featureId)?.title ?? "A feature",
      text: thread.originalText.slice(0, 140),
      step: progress.step,
      sentence: progress.sentence,
      href: progress.taskId ? `/products/${productId}/build/tasks/${progress.taskId}` : `/products/${productId}/build#feature-reviews`,
    });
  }
  return items;
}
