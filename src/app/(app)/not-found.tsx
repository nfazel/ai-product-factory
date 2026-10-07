import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <h1 className="text-xl font-semibold tracking-tight">Not found</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        That record is not in the factory.
      </p>
      <Button asChild className="mt-6" size="lg">
        <Link href="/dashboard">Back to dashboard</Link>
      </Button>
    </div>
  );
}
