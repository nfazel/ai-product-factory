import Link from "next/link";

export function AINotConfiguredNotice({
  capability,
  title = "AI is not configured",
  body,
}: {
  capability: string;
  title?: string;
  body?: string;
}) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
      <p className="font-medium">{title}</p>
      <p className="mt-1">
        {body ?? `AI Product Builder needs an AI model connection before it can run ${capability}.`}
      </p>
      <p className="mt-2">
        <Link className="font-medium underline" href="/settings">
          Configure AI
        </Link>
      </p>
    </div>
  );
}
