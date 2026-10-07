import {
  PRODUCT_STAGES,
  STAGE_META,
  stageState,
  type ProductStage,
} from "@/domain/constants";
import { cn } from "cn";

const STATE_COPY = {
  completed: "Completed",
  current: "Current",
  upcoming: "Upcoming",
} as const;

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
