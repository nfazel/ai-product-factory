import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { primaryNav, secondaryNav } from "@/components/layout/nav";
import { productTabs } from "@/components/products/product-nav";
import { assessGuidance, emptySnapshot } from "@/modules/guidance/assess";
import type { GuidanceSnapshot, TaskSnapshot } from "@/modules/guidance/types";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("navigation", () => {
  it("keeps the primary navigation to Home, Products, Decisions, and Settings", () => {
    expect(primaryNav.map((item) => item.label)).toEqual(["Home", "Products", "Decisions"]);
    expect(primaryNav.map((item) => item.href)).toEqual(["/dashboard", "/products", "/decisions"]);
    expect(secondaryNav.map((item) => item.label)).toEqual(["Settings"]);
    const labels = [...primaryNav, ...secondaryNav].map((item) => item.label);
    expect(labels).not.toContain("Work Items");
    expect(labels).not.toContain("Approvals");
    expect(labels).not.toContain("Activity");
    expect(labels).not.toContain("Agents");
  });

  it("keeps product navigation to the lifecycle and intelligence", () => {
    expect(productTabs.map((tab) => tab.label)).toEqual([
      "Overview",
      "Explore",
      "Define",
      "Build",
      "Prove",
      "Ship",
      "Learn",
      "Intelligence",
    ]);
    const labels = productTabs.map((tab) => tab.label);
    expect(labels).not.toContain("Backlog");
    expect(labels).not.toContain("Architecture");
    expect(labels).not.toContain("Activity");
    expect(productTabs.map((tab) => tab.slug)).not.toContain("/architecture");
    expect(productTabs.map((tab) => tab.slug)).not.toContain("/backlog");
  });

  it("keeps old approval and architecture routes pointed at the new experience", () => {
    expect(read("src/app/(app)/approvals/page.tsx")).toContain('redirect("/decisions")');
    expect(read("src/app/(app)/products/[id]/architecture/page.tsx")).toContain("/build#design");
    expect(read("src/app/(app)/products/[id]/testing/page.tsx")).toContain("Prove");
    expect(read("src/app/(app)/products/[id]/metrics/page.tsx")).toContain("Learn");
  });

  it("gives every Define next action a section or button the Define page can run", () => {
    const definition = read("src/app/(app)/products/[id]/definition/page.tsx");
    const proposal = read("src/components/definition/proposal-panel.tsx");
    const controls = read("src/components/definition/controls.tsx");
    const requirements = read("src/components/intake/requirements-panel.tsx");
    const guidance = read("src/components/guidance/guidance-ui.tsx");
    const surface = [definition, proposal, controls, requirements].join("\n");
    for (const id of ["proposal", "outcomes", "slice", "questions", "approve", "move", "requirements"]) {
      expect(surface, id).toContain(`id="${id}"`);
    }
    expect(proposal).toContain("Review the draft definition");
    expect(proposal).toContain("proposalId");
    expect(controls).toContain("approveDefinitionAction");
    expect(controls).toContain("reviewDefinitionAction");
    expect(controls).toContain("moveToBuildAction");
    expect(guidance).toContain('action.key === "draft-definition"');
    expect(guidance).toContain("moveStageAction");
    expect(guidance).toContain("scrollIntoView");
    expect(read("src/modules/requirements/service.ts")).toContain("The stage was not changed.");
  });

  it("asks what is being built before requiring a repository", () => {
    const page = read("src/app/(app)/products/[id]/build/page.tsx");
    const controls = read("src/components/build/controls.tsx");
    expect(page).toContain("DevelopmentContextPanel");
    expect(page).not.toContain("No codebase context yet");
    expect(controls).toContain("What are we building?");
    expect(controls).toContain("New application");
    expect(controls).toContain("Existing application");
    expect(controls).toContain("No existing codebase required");
    expect(controls).toContain("id=\"context\"");
  });

  it("opens recent products on Overview", () => {
    const dashboard = read("src/app/(app)/dashboard/page.tsx");
    expect(dashboard).toContain("href={`/products/${product.id}`}");
    expect(dashboard).not.toContain("/products/${product.id}/intelligence");
  });
});

describe("brand", () => {
  const surfaces = [
    "src/app/layout.tsx",
    "src/app/(app)/dashboard/page.tsx",
    "src/app/(app)/settings/page.tsx",
    "src/app/(app)/decisions/page.tsx",
    "src/app/(app)/not-found.tsx",
    "src/components/layout/sidebar-nav.tsx",
    "src/components/layout/app-shell.tsx",
    "README.md",
  ];

  it("uses AI Product Builder on the main surfaces", () => {
    for (const surface of surfaces) {
      const source = read(surface);
      expect(source, surface).toContain("AI Product Builder");
      expect(source, surface).not.toContain("AI Product Factory");
    }
  });

  it("does not present Local user as a role in the shell", () => {
    expect(read("src/components/layout/app-shell.tsx")).not.toContain("Local user");
    expect(read("src/components/layout/app-shell.tsx")).toContain("Human approval required");
  });
});

describe("safety of the simplified experience", () => {
  it("still refuses stage movement unless the existing gates pass", () => {
    const service = read("src/modules/product/service.ts");
    expect(service).toContain("Approve the product brief before moving to Define.");
    expect(service).toContain("buildProgressionBlockers");
    expect(service).toContain("proveAdvanceBlockers");
    expect(service).toContain("stageMoveBlockers");
    const action = read("src/server/actions/products.ts");
    expect(action).toContain("updateProduct");
    expect(action).not.toContain("currentStage: parsed.data.stage\n    });\n    // skip");
  });

  it("does not add merge, force push, deployment, or automatic outcome achievement to next actions", () => {
    for (const snapshot of representativeSnapshots()) {
      const key = assessGuidance(snapshot).action?.key ?? "";
      const label = assessGuidance(snapshot).action?.label ?? "";
      expect(key).not.toMatch(/^(merge|deploy|force|achieve)/);
      expect(label).not.toMatch(/^(Merge|Deploy|Force push|Mark outcome)/);
    }
    const assess = read("src/modules/guidance/assess.ts");
    expect(assess).not.toContain("markOutcomeAchieved");
    expect(assess).not.toContain("mergePullRequest");
    expect(assess).not.toContain("forcePush");
    expect(read("src/modules/source-control/types.ts")).toContain("Merge is intentionally absent");
    expect(read("src/modules/source-control/push.ts")).toContain("cannot express a force push");
    expect(read("src/modules/release/service.ts")).toContain("export async function markOutcomeAchieved");
  });
});

function task(patch: Partial<TaskSnapshot> = {}): TaskSnapshot {
  return {
    id: "t1",
    title: "Submit a claim",
    status: "COMPLETED",
    humanOnly: false,
    prohibited: false,
    contractStale: false,
    codeApproval: "CURRENT",
    workspace: "DONE",
    published: true,
    pullRequest: "MERGED",
    verification: "APPROVED",
    updatedAt: null,
    ...patch,
  };
}

function representativeSnapshots(): GuidanceSnapshot[] {
  const base = emptySnapshot({ productId: "p1" });
  return [
    base,
    emptySnapshot({
      productId: "p1",
      stage: "SHIP",
      discovery: { ...base.discovery, started: true, briefStatus: "APPROVED" },
      definition: { ...base.definition, exists: true, status: "APPROVED", approved: true, slice: "APPROVED" },
      design: { ...base.design, architecture: "APPROVED", plan: "APPROVED" },
      review: { ...base.review, exists: true, approved: true, policyApproved: true },
      tasks: [task()],
      release: {
        real: {
          version: "1.0.0",
          status: "APPROVED",
          approval: "CURRENT",
          staleReason: "",
          openBlockingRisks: 0,
          planApproved: true,
          deployed: true,
          postChecksReady: true,
          updatedAt: null,
        },
        demoOnly: false,
        readyToLearn: true,
        learnReason: "",
      },
    }),
  ];
}
