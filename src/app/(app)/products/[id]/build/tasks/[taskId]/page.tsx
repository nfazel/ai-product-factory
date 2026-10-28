import { Suspense } from "react";
import { notFound } from "next/navigation";

import { TaskWorkspaceView } from "@/components/build/task-workspace-view";
import { PageSkeleton } from "@/components/feedback/states";
import { summariseBuildTask } from "@/modules/build/task-status";
import { getCodingView } from "@/modules/coding/service";
import { getProveView } from "@/modules/verification/service";
import { markDynamic } from "@/server/dynamic";

export const metadata = { title: "Build task" };
export const maxDuration = 60;

export default function BuildTaskPage({
  params,
}: {
  params: Promise<{ id: string; taskId: string }>;
}) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <BuildTask params={params} />
    </Suspense>
  );
}

async function BuildTask({ params }: { params: Promise<{ id: string; taskId: string }> }) {
  await markDynamic();
  const { id, taskId } = await params;
  const [coding, prove] = await Promise.all([getCodingView(id), getProveView(id)]);
  if (!coding) notFound();
  const task = coding.tasks.find((item) => item.id === taskId);
  if (!task) notFound();
  const verification =
    prove?.sessions.find((session) => session.implementationTaskId === taskId) ?? null;
  const summary = summariseBuildTask(
    task,
    verification
      ? {
          implementationTaskId: verification.implementationTaskId,
          status: verification.status,
          overallVerdict: verification.overallVerdict,
        }
      : null,
  );
  return <TaskWorkspaceView productId={id} task={task} summary={summary} />;
}
