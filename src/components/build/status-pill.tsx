import type { StatusTone } from "@/modules/build/task-status";

const TONE_CLASS: Record<StatusTone, string> = {
  neutral: "bg-stone-100 text-stone-700",
  progress: "bg-sky-50 text-sky-900",
  success: "bg-emerald-50 text-emerald-900",
  attention: "bg-amber-50 text-amber-950",
  blocked: "bg-rose-50 text-rose-950",
};

export function StatusPill({ label, tone }: { label: string; tone: StatusTone }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${TONE_CLASS[tone]}`}>
      {label}
    </span>
  );
}
