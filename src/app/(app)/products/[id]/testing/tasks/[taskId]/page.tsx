import { Suspense } from "react";
import { notFound } from "next/navigation";

import { PageSkeleton } from "@/components/feedback/states";
import { VerificationWorkspace } from "@/components/prove/verification-workspace";
import { parseProveTab, summariseProveTask } from "@/modules/prove/task-status";
import { getCodingView } from "@/modules/coding/service";
import { getProveView } from "@/modules/verification/service";
import { markDynamic } from "@/server/dynamic";

export const metadata = { title: "Verification workspace" };
export const maxDuration = 60;

/**
 * Read-only workspace. Rendering this page never starts, retries, or approves verification.
 * Those actions only happen when a person submits the matching form in the workspace.
 */
export default function ProveTaskPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; taskId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ProveTask params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function ProveTask({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; taskId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  await markDynamic();
  const { id, taskId } = await params;
  const { tab } = await searchParams;
  const [prove, coding] = await Promise.all([getProveView(id), getCodingView(id)]);
  if (!prove) notFound();
  const task = prove.awaiting.find((item) => item.id === taskId);
  if (!task) notFound();
  const sessions = prove.sessions.filter((session) => session.implementationTaskId === taskId);
  const row = summariseProveTask(task, sessions);
  const codingTask = coding?.tasks.find((item) => item.id === taskId);
  const plan = codingTask?.workspace?.plan ?? null;
  return (
    <VerificationWorkspace
      productId={id}
      task={task}
      sessions={sessions}
      row={row}
      planVersion={plan?.version ?? null}
      planStatus={plan?.status ?? null}
      activeTab={parseProveTab(tab)}
    />
  );
}
