import { Suspense } from "react";
import Link from "next/link";

import { EmptyState, PageSkeleton } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { ProductCard } from "@/components/products/product-card";
import { Button } from "@/components/ui/button";
import { listProducts } from "@/modules/product/service";
import { markDynamic } from "@/server/dynamic";

export const metadata = { title: "Products" };

export default function ProductsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ProductsContent />
    </Suspense>
  );
}

async function ProductsContent() {
  await markDynamic();
  const products = await listProducts();

  return (
    <div>
      <PageHeader
        eyebrow="Portfolio"
        title="Products"
        description="Each product moves from an idea through Explore, Define, Build, Prove, Ship, and Learn."
        actions={
          <Button asChild size="lg">
            <Link href="/products/new">New product</Link>
          </Button>
        }
      />
      {products.length === 0 ? (
        <EmptyState
          title="No products yet"
          description="AI Product Builder helps teams take a product idea through discovery, definition, engineering, independent verification, release and learning, while keeping material decisions under human control. Start with the problem. The pipeline begins in Explore."
          action={
            <Button asChild size="lg">
              <Link href="/products/new">New product</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}
