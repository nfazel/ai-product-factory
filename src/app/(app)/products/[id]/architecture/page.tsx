import Link from "next/link";

export const metadata = { title: "Architecture" };

export default async function ArchitecturePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <section className="rounded-2xl border bg-card p-5 sm:p-6">
      <p className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
        Build
      </p>
      <h1 className="mt-2 text-xl font-semibold">Architecture lives in Build</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
        Solution architecture and the implementation plan are governed activities inside Build.
        They are not a separate pipeline stage.
      </p>
      <Link
        href={`/products/${id}/build`}
        className="mt-4 inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        Open the Build workspace
      </Link>
    </section>
  );
}
