import { Suspense } from "react";
import { notFound } from "next/navigation";

import { OperatorConfirmationProvider } from "@/components/build/operator-confirmation";
import { PageSkeleton } from "@/components/feedback/states";
import { PlanPage } from "@/components/plan/plan-view";
import { operatorConfirmationRequired } from "@/modules/feature-review/authorization";
import { getPlanView } from "@/modules/plan/view";
import { markDynamic } from "@/server/dynamic";

export const metadata = { title: "Plan" };

export default function PlanRoute({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Plan params={params} />
    </Suspense>
  );
}

async function Plan({ params }: { params: Promise<{ id: string }> }) {
  await markDynamic();
  const { id } = await params;
  const plan = await getPlanView(id);
  if (!plan) notFound();
  return (
    <OperatorConfirmationProvider required={operatorConfirmationRequired()}>
      <PlanPage plan={plan} />
    </OperatorConfirmationProvider>
  );
}
