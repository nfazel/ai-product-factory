import {
  Blocks,
  Check,
  Compass,
  FlaskConical,
  LineChart,
  PackageCheck,
  PenLine,
  type LucideIcon,
} from "lucide-react";

import {
  PRODUCT_STAGES,
  STAGE_META,
  stageState,
  type ProductStage,
} from "@/domain/constants";
import { cn } from "cn";

const ICONS: Record<ProductStage, LucideIcon> = {
  EXPLORE: Compass,
  DEFINE: PenLine,
  BUILD: Blocks,
  PROVE: FlaskConical,
  SHIP: PackageCheck,
  LEARN: LineChart,
};

const STATE_COPY = {
  completed: "Completed",
  current: "Current",
  upcoming: "Upcoming",
} as const;

export function ProductPipeline({
  currentStage,
}: {
  currentStage: ProductStage;
}) {
  const stages = PRODUCT_STAGES.map((stage, index) => ({
    stage,
    index,
    state: stageState(stage, currentStage),
    label: STAGE_META[stage].label,
    summary: STAGE_META[stage].summary,
    Icon: ICONS[stage],
  }));

  return (
    <section
      aria-label="Product development pipeline"
      className="rounded-2xl border bg-card px-4 py-5 shadow-sm sm:px-6 sm:py-6"
    >
      <div className="mb-5 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
            Development pipeline
          </p>
          <p className="mt-1 text-sm text-foreground">
            Explore to Learn · now in{" "}
            <span className="font-medium">{STAGE_META[currentStage].label}</span>
          </p>
        </div>
        <ol className="flex items-center gap-3 text-xs text-muted-foreground">
          <li className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-emerald-600" />
            Completed
          </li>
          <li className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-primary" />
            Current
          </li>
          <li className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-border" />
            Upcoming
          </li>
        </ol>
      </div>

      <ol className="hidden md:grid md:grid-cols-6">
        {stages.map((item, index) => (
          <li
            key={item.stage}
            className="min-w-0"
            aria-current={item.state === "current" ? "step" : undefined}
          >
            <div className="flex items-center">
              <StageNode
                state={item.state}
                Icon={item.Icon}
                label={item.label}
              />
              {index < stages.length - 1 ? (
                <span
                  className={cn(
                    "mx-2 h-px flex-1",
                    item.state === "completed" ? "bg-emerald-600" : "bg-border",
                  )}
                />
              ) : null}
            </div>
            <div className="mt-3 pr-3">
              <p className="text-[11px] font-medium tracking-wide text-muted-foreground">
                0{index + 1}
              </p>
              <p
                className={cn(
                  "text-sm font-medium",
                  item.state === "upcoming" && "text-muted-foreground",
                )}
              >
                {item.label}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {STATE_COPY[item.state]}
              </p>
            </div>
          </li>
        ))}
      </ol>

      <ol className="space-y-0 md:hidden">
        {stages.map((item, index) => (
          <li
            key={item.stage}
            className="flex gap-3"
            aria-current={item.state === "current" ? "step" : undefined}
          >
            <div className="flex flex-col items-center">
              <StageNode state={item.state} Icon={item.Icon} label={item.label} />
              {index < stages.length - 1 ? (
                <span
                  className={cn(
                    "my-1 w-px flex-1",
                    item.state === "completed" ? "bg-emerald-600" : "bg-border",
                  )}
                />
              ) : null}
            </div>
            <div className="pb-5">
              <p className="text-sm font-medium">{item.label}</p>
              <p className="text-xs text-muted-foreground">
                {STATE_COPY[item.state]} · {item.summary}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function StageNode({
  state,
  Icon,
  label,
}: {
  state: "completed" | "current" | "upcoming";
  Icon: LucideIcon;
  label: string;
}) {
  return (
    <span
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-full border-2",
        state === "completed" && "border-emerald-600 bg-emerald-600 text-white",
        state === "current" &&
          "size-11 border-primary bg-primary text-primary-foreground ring-4 ring-primary/15",
        state === "upcoming" &&
          "border-border bg-background text-muted-foreground",
      )}
      aria-hidden="true"
      title={label}
    >
      {state === "completed" ? <Check className="size-4" /> : <Icon className="size-4" />}
    </span>
  );
}

export function PipelineDots({ currentStage }: { currentStage: ProductStage }) {
  return (
    <ol className="flex items-center gap-1" aria-label="Stage progress">
      {PRODUCT_STAGES.map((stage) => {
        const state = stageState(stage, currentStage);
        return (
          <li
            key={stage}
            title={`${STAGE_META[stage].label} · ${STATE_COPY[state]}`}
            className={cn(
              "h-1.5 rounded-full",
              state === "current" ? "w-6 bg-primary" : "w-4",
              state === "completed" && "bg-emerald-600",
              state === "upcoming" && "bg-border",
            )}
          />
        );
      })}
    </ol>
  );
}
