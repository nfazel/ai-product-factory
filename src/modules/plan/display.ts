import { STAGE_META, type ProductStage } from "@/domain/constants";
import { STAGE_PROGRESS_LABEL, type StageMark, type StageProgress } from "@/modules/guidance/types";

/**
 * The stages the person sees: Plan, Build and Ship. The stored stages are unchanged. Explore and Define show as Plan, and Learn
 * is hidden for now. Presentation only, so nothing that decides what happens next reads it.
 */
export type DisplayStage = { key: string; label: string; status: StageProgress; text: string };

const PLAN_STAGES: ProductStage[] = ["EXPLORE", "DEFINE"];
const HIDDEN_STAGES: ProductStage[] = ["LEARN"];

/** The name a person sees for a stored stage. */
export function stageDisplayLabel(stage: ProductStage) {
  return PLAN_STAGES.includes(stage) ? "Plan" : STAGE_META[stage].label;
}

/** Whether a stored stage belongs to Plan. */
export const isPlanStage = (stage: ProductStage) => PLAN_STAGES.includes(stage);

/** Two stages shown as one: complete only when both are, blocked or waiting if either is, otherwise under way. */
export function mergeProgress(parts: StageProgress[]): StageProgress {
  if (parts.every((part) => part === "COMPLETED")) return "COMPLETED";
  if (parts.includes("BLOCKED")) return "BLOCKED";
  if (parts.includes("WAITING_FOR_YOU")) return "WAITING_FOR_YOU";
  if (parts.every((part) => part === "NOT_STARTED")) return "NOT_STARTED";
  if (parts.includes("READY_TO_MOVE") && parts.every((part) => part === "READY_TO_MOVE" || part === "COMPLETED")) return "READY_TO_MOVE";
  return "IN_PROGRESS";
}

export function displayStages(marks: StageMark[]): DisplayStage[] {
  const plan = marks.filter((mark) => PLAN_STAGES.includes(mark.stage));
  const rest = marks.filter((mark) => !PLAN_STAGES.includes(mark.stage) && !HIDDEN_STAGES.includes(mark.stage));
  const result: DisplayStage[] = [];
  if (plan.length > 0) {
    const status = mergeProgress(plan.map((mark) => mark.status));
    result.push({ key: "PLAN", label: "Plan", status, text: STAGE_PROGRESS_LABEL[status] });
  }
  for (const mark of rest) result.push({ key: mark.stage, label: STAGE_META[mark.stage].label, status: mark.status, text: mark.label });
  return result;
}

/** Which top-level tab a page belongs to, so the old Explore, Define and design pages still light up Plan. */
export function activeTabSlug(pathname: string, productId: string): string {
  const base = `/products/${productId}`;
  const rest = pathname.startsWith(base) ? pathname.slice(base.length) : pathname;
  const first = `/${rest.split("/").filter(Boolean)[0] ?? ""}`;
  if (first === "/") return "";
  if (["/plan", "/discovery", "/definition", "/design", "/backlog", "/architecture"].includes(first)) return "/plan";
  return first;
}
