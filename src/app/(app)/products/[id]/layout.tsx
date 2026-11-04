import { stageDisplayLabel } from "@/modules/plan/display";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageSkeleton } from "@/components/feedback/states";
import { ProgressStrip } from "@/components/guidance/guidance-ui";
import { FeedbackWaitingList } from "@/components/guidance/feedback-waiting";
import { NextStepBar } from "@/components/guidance/next-step-bar";
import { RestoreProductForm } from "@/components/products/product-forms";
import { ProductTabs } from "@/components/products/product-tabs";
import { ProductStatusBadge, StageBadge } from "@/components/status/badges";
import { PRODUCT_START_LABEL } from "@/domain/constants";
import { getProductGuidance } from "@/modules/guidance/service";
import { getProduct } from "@/modules/product/service";
import { feedbackWaiting } from "@/modules/rework/waiting";
import { markDynamic } from "@/server/dynamic";

export default function ProductLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ProductFrame params={params}>{children}</ProductFrame>
    </Suspense>
  );
}

async function ProductFrame({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  await markDynamic();
  const { id } = await params;
  const [product, guidance, waiting] = await Promise.all([getProduct(id), getProductGuidance(id), feedbackWaiting(id).catch(() => [])]);
  if (!product || !guidance) notFound();

  return (
    <div className="space-y-6">
      {product.status === "ARCHIVED" ? (
        <div role="status" className="space-y-3 rounded-2xl border border-stone-300 bg-stone-50 p-4 text-sm text-stone-900">
          <p>This product has been removed. It is hidden from your lists and its history is kept. Restore it to work on it again.</p>
          <RestoreProductForm productId={product.id} />
        </div>
      ) : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            <Link href="/products" className="hover:underline">
              Products
            </Link>
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            {product.name}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <ProductStatusBadge status={product.status} />
          <StageBadge stage={product.currentStage} />
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        {stageDisplayLabel(product.currentStage)} · {PRODUCT_START_LABEL[product.startMode]}. A stage is complete only after its gate is met.
      </p>
      <ProgressStrip stages={guidance.stages} />
      <NextStepBar productId={product.id} action={guidance.action} blocker={guidance.blocker} />
      <FeedbackWaitingList items={waiting} />
      <ProductTabs productId={product.id} />
      {children}
    </div>
  );
}
