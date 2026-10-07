import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageSkeleton } from "@/components/feedback/states";
import { ProductPipeline } from "@/components/pipeline/product-pipeline";
import { ProductTabs } from "@/components/products/product-tabs";
import { ProductStatusBadge, StageBadge } from "@/components/status/badges";
import { getProduct } from "@/modules/product/service";
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
  const product = await getProduct(id);
  if (!product) notFound();

  return (
    <div className="space-y-6">
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
      <ProductPipeline currentStage={product.currentStage} />
      <ProductTabs productId={product.id} />
      {children}
    </div>
  );
}
