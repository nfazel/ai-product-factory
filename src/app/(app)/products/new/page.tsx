import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { CreateProductForm } from "@/components/products/product-forms";

export const metadata = { title: "New product" };

export default function NewProductPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        eyebrow="Products"
        title="New product"
        description="Start with an idea, or bring requirements you already have. Both paths begin in Explore."
        actions={
          <Link href="/products" className="text-sm text-primary hover:underline">
            Cancel
          </Link>
        }
      />
      <div className="rounded-2xl border bg-card p-5 sm:p-6">
        <CreateProductForm />
      </div>
    </div>
  );
}
