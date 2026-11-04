import { describe, expect, it } from "vitest";

import type { StageMark, StageProgress } from "@/modules/guidance/types";
import { activeTabSlug, displayStages, isPlanStage, mergeProgress, stageDisplayLabel } from "@/modules/plan/display";

const marks = (statuses: Record<string, StageProgress>): StageMark[] =>
  (["EXPLORE", "DEFINE", "BUILD", "PROVE", "SHIP", "LEARN"] as const).map((stage) => ({ stage, status: statuses[stage] ?? "NOT_STARTED", label: `${stage} label` }));

describe("the stages a person sees", () => {
  it("shows Explore and Define as Plan, and hides Learn", () => {
    const shown = displayStages(marks({}));
    expect(shown.map((stage) => stage.label)).toEqual(["Plan", "Build", "Prove", "Ship"]);
  });

  it("keeps the unchanged stages exactly as the guidance reported them", () => {
    const shown = displayStages(marks({ BUILD: "BLOCKED" }));
    expect(shown.find((stage) => stage.label === "Build")).toMatchObject({ status: "BLOCKED", text: "BUILD label" });
  });

  it("names the stored stages for people", () => {
    expect(stageDisplayLabel("EXPLORE")).toBe("Plan");
    expect(stageDisplayLabel("DEFINE")).toBe("Plan");
    expect(stageDisplayLabel("BUILD")).toBe("Build");
    expect(stageDisplayLabel("LEARN")).toBe("Learn");
    expect(isPlanStage("DEFINE")).toBe(true);
    expect(isPlanStage("BUILD")).toBe(false);
  });
});

describe("two stages shown as one", () => {
  it("is complete only when both are, blocked or waiting if either is, and under way otherwise", () => {
    expect(mergeProgress(["COMPLETED", "COMPLETED"])).toBe("COMPLETED");
    expect(mergeProgress(["COMPLETED", "BLOCKED"])).toBe("BLOCKED");
    expect(mergeProgress(["IN_PROGRESS", "WAITING_FOR_YOU"])).toBe("WAITING_FOR_YOU");
    expect(mergeProgress(["NOT_STARTED", "NOT_STARTED"])).toBe("NOT_STARTED");
    expect(mergeProgress(["COMPLETED", "NOT_STARTED"])).toBe("IN_PROGRESS");
    expect(mergeProgress(["COMPLETED", "READY_TO_MOVE"])).toBe("READY_TO_MOVE");
  });
});

describe("which tab a page lights up", () => {
  it("lights Plan for the plan page and for the old Explore, Define, design and backlog pages", () => {
    for (const path of ["/plan", "/discovery", "/definition", "/design", "/backlog", "/architecture"]) {
      expect(activeTabSlug(`/products/p1${path}`, "p1")).toBe("/plan");
    }
  });

  it("keeps every other page on its own tab, and the overview on the first", () => {
    expect(activeTabSlug("/products/p1", "p1")).toBe("");
    expect(activeTabSlug("/products/p1/build/tasks/t1", "p1")).toBe("/build");
    expect(activeTabSlug("/products/p1/testing", "p1")).toBe("/testing");
    expect(activeTabSlug("/products/p1/releases", "p1")).toBe("/releases");
  });
});
