import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it } from "vitest";

import { SourceControlPanel } from "@/components/source-control/source-control-panel";
import { nextActionDestination } from "@/modules/guidance/next-action-registry";
import { describePublication, type PublicationRecord } from "@/modules/source-control/publication-state";

const branch = "ai-factory/task-approved-";
const commit = "9abadcbfb2509ffad5902628e1d5bfcd5a8d7075";
const pullHead = "ad31f96537d67da73d406a77832ae8a94216da7b";

function attempt(id: string, status: PublicationRecord["status"], failureMessage = ""): PublicationRecord {
  return {
    id,
    status,
    demo: false,
    localBranch: branch,
    remoteBranch: branch,
    localCommitSha: commit,
    remoteCommitSha: status === "PUBLISHED" ? commit : "",
    failureMessage,
  };
}

function panel(
  records: PublicationRecord[],
  eligible = true,
  pullRequest: {
    headSha: string;
    state?: string;
    mergeCommitSha?: string;
    mergedBy?: string;
    mergedAt?: string | null;
    mergeable?: boolean | null;
    mergeableState?: string;
    protectionAccess?: string;
  } | null = { headSha: pullHead },
  checks: { id: string; name: string; status: string; conclusion: string; source: "GITHUB"; startedAt: Date; completedAt: Date }[] = [],
  readiness: { label: string; reasons: string[]; approvals?: { valid: number; required: number } } = {
    label: "NOT READY",
    reasons: ["No pull request has been created."],
  },
) {
  const publication = describePublication({ branch, commit, eligible, records });
  const view = {
        connection: { status: "CONNECTED", message: "Connected as nfazel." },
        productRepository: { owner: "nfazel", repositoryName: "betmyfriend" },
        release: { label: "NOT READY", reasons: ["A pull request is still open."] },
        tasks: [
          {
            id: "task-1",
            title: "Initialize Next.js project and database schema",
            status: "COMPLETED",
            commitSha: commit,
            branchName: branch,
            codeApprovalLabel: "Current",
            verificationLabel: "Approved for this commit",
            blockers: eligible ? [] : ["Independent Verification approval is required for this commit."],
            publication,
            pullRequest: pullRequest
              ? {
                  id: "pr-1",
                  number: 7,
                  state: pullRequest.state ?? "OPEN",
                  headSha: pullRequest.headSha,
                  mergeCommitSha: pullRequest.mergeCommitSha ?? "",
                  mergedBy: pullRequest.mergedBy ?? "",
                  mergedAt: pullRequest.mergedAt ?? null,
                  mergeable: pullRequest.mergeable,
                  mergeableState: pullRequest.mergeableState ?? "",
                  protectionAccess: pullRequest.protectionAccess ?? "",
                  demo: false,
                  url: "https://github.com/nfazel/betmyfriend/pull/7",
                  checks,
                  reviews: [],
                  comments: [],
                }
              : null,
            readiness,
            trace: { outcome: "Demand", capability: "Accounts", story: "Register", task: "Initialize" },
          },
        ],
  };
  return renderToStaticMarkup(
    createElement(SourceControlPanel, {
      productId: "product-1",
      view: view as Parameters<typeof SourceControlPanel>[0]["view"],
    }),
  );
}

function field(html: string, label: string) {
  const match = html.replaceAll("\n", "").match(new RegExp(`${label}</dt><dd[^>]*>(.*?)</dd>`));
  return match?.[1] ?? "";
}

describe("publish branch panel", () => {
  it("shows the confirmation form when nothing has been published", () => {
    const html = panel([]);
    expect(field(html, "Latest publication attempt")).toBe("None");
    expect(field(html, "Published remote branch")).toBe("Not published");
    expect(field(html, "Remote commit SHA")).toBe("None");
    expect(html).toContain('name="confirmPublication"');
    expect(html).toContain("required");
    expect(html).toContain(">Publish Branch</button>");
    expect(html).not.toContain("Pull request title");
  });

  it("shows the failure and the retry form without calling the attempt published", () => {
    const html = panel([attempt("failed-1", "FAILED", "GitHub is unavailable.")]);
    expect(field(html, "Source branch")).toBe(branch);
    expect(field(html, "Publication destination")).toBe("nfazel/betmyfriend");
    expect(field(html, "Latest publication attempt")).toBe("Failed");
    expect(field(html, "Latest publication error")).toBe("GitHub is unavailable.");
    expect(field(html, "Published remote branch")).toBe("Not published");
    expect(field(html, "Remote commit SHA")).toBe("None");
    expect(field(html, "Remote commit SHA")).not.toBe(pullHead);
    expect(field(html, "Pull request")).toBe("#7 OPEN");
    expect(html).toContain('id="publish-branch-task-1"');
    expect(html).toContain('name="confirmPublication"');
    expect(html).toContain("required");
    expect(html).toContain(">Publish Branch</button>");
  });

  it("keeps the retry form when more than one attempt failed", () => {
    const html = panel([
      attempt("failed-2", "FAILED", "GitHub is unavailable."),
      attempt("failed-1", "FAILED", "GitHub is unavailable."),
    ]);
    expect(field(html, "Published remote branch")).toBe("Not published");
    expect(html).toContain('name="confirmPublication"');
    expect(html).toContain(">Publish Branch</button>");
  });

  it("shows the published branch and commit without using the pull request head", () => {
    const html = panel([attempt("published-1", "PUBLISHED")], true, null);
    expect(field(html, "Latest publication attempt")).toBe("Published");
    expect(field(html, "Published remote branch")).toBe(branch);
    expect(field(html, "Remote commit SHA")).toBe(commit);
    expect(field(html, "Pull request")).toBe("None");
    expect(html).toContain("A pull request has not been created. That does not undo the publication.");
    expect(html).toContain("Pull request title");
    expect(html).not.toContain('name="confirmPublication"');
    expect(html).not.toContain(pullHead);
  });

  it("shows the confirmed remote main action and keeps pull request creation waiting", () => {
    const publication = describePublication({
      branch,
      commit,
      eligible: true,
      records: [{
        id: "published-1",
        status: "PUBLISHED",
        demo: false,
        localBranch: branch,
        remoteBranch: branch,
        localCommitSha: commit,
        remoteCommitSha: commit,
        failureMessage: "",
      }],
    });
    const html = renderToStaticMarkup(createElement(SourceControlPanel, {
      productId: "product-1",
      view: {
        connection: { status: "CONNECTED", message: "Connected as nfazel." },
        productRepository: { owner: "nfazel", repositoryName: "betmyfriend" },
        release: { label: "NOT READY", reasons: ["A pull request is still open."] },
        bootstrap: {
          status: "offer",
          message: "Remote main does not exist. The baseline commit can be published as main.",
          repository: "nfazel/betmyfriend",
          baselineSha: "ad31f96537d67da73d406a77832ae8a94216da7b",
          remoteSha: "",
          defaultBranch: "main",
        },
        tasks: [{
          id: "task-1",
          title: "Initialize Next.js project and database schema",
          status: "COMPLETED",
          commitSha: commit,
          branchName: branch,
          codeApprovalLabel: "Current",
          verificationLabel: "Approved for this commit",
          blockers: [],
          publication,
          pullRequest: null,
          readiness: { label: "NOT READY", reasons: ["No pull request has been created."] },
          trace: { outcome: "Demand", capability: "Accounts", story: "Register", task: "Initialize" },
        }],
      } as unknown as Parameters<typeof SourceControlPanel>[0]["view"],
    }));
    expect(html).toContain("Initialize Remote Main Branch");
    expect(html).toContain('name="confirmRemoteMain"');
    expect(html).toContain("ad31f96537d67da73d406a77832ae8a94216da7b");
    expect(html).not.toContain("Pull request title");
  });

  it("hides the form while publication is in progress", () => {
    const html = panel([attempt("ready-1", "READY")]);
    expect(field(html, "Latest publication attempt")).toBe("In progress");
    expect(html).toContain("Another publication cannot be submitted until this attempt finishes.");
    expect(html).not.toContain('name="confirmPublication"');
    expect(html).not.toContain(">Publish Branch</button>");
  });

  it("sends a retry through the publish server action and requires confirmation", () => {
    const controls = readFileSync(resolve("src/components/source-control/source-control-controls.tsx"), "utf8");
    const action = readFileSync(resolve("src/server/actions/source-control.ts"), "utf8");
    expect(controls).toContain("useActionState(publishBranchAction, idleState)");
    expect(controls).toContain('name="confirmPublication"');
    expect(controls).toContain("required");
    expect(action).toContain('confirmPublication !== "yes"');
    expect(action).toContain("publishTaskBranch");
    const publishAction = action.slice(action.indexOf("export async function publishBranchAction"), action.indexOf("export async function createPullRequestAction"));
    expect(publishAction).toContain("publishTaskBranch(parsed.data.productId, parsed.data.taskId, undefined, { confirmed: true })");
    expect(publishAction).toContain("refreshWorkspace(parsed.data.productId)");
    expect(publishAction).not.toContain("createTaskPullRequest");
  });

  it("points Publish Branch at the section that contains the usable form", () => {
    const destination = nextActionDestination("publish-branch");
    expect(destination).toMatchObject({ path: "/testing", hash: "publish", execution: "confirm" });
    const page = readFileSync(resolve("src/app/(app)/products/[id]/testing/page.tsx"), "utf8");
    expect(page).toContain('id="publish"');
    expect(page).toContain("<SourceControlPanel");
    const html = panel([attempt("failed-1", "FAILED", "GitHub is unavailable.")]);
    expect(html).toContain('id="publish-branch-task-1"');
    expect(html).toContain('name="confirmPublication"');
    expect(html).toContain(">Publish Branch</button>");
    const guidance = readFileSync(resolve("src/components/guidance/guidance-ui.tsx"), "utf8");
    expect(guidance).toContain("does not perform");
  });

  it("labels an earlier failed check without treating it as the current result", () => {
    const html = panel([attempt("published", "PUBLISHED")], true, { headSha: pullHead }, [
      { id: "old", name: "verify", status: "COMPLETED", conclusion: "FAILURE", source: "GITHUB", startedAt: new Date("2026-10-21T15:17:00Z"), completedAt: new Date("2026-10-21T15:17:00Z") },
      { id: "new", name: "verify", status: "COMPLETED", conclusion: "SUCCESS", source: "GITHUB", startedAt: new Date("2026-10-22T09:46:21Z"), completedAt: new Date("2026-10-22T09:46:47Z") },
    ]);
    expect(html).toContain("verify: COMPLETED FAILURE · GITHUB · earlier attempt");
    expect(html).toContain("verify: COMPLETED SUCCESS · GITHUB");
    expect(html).not.toContain("verify: COMPLETED SUCCESS · GITHUB · earlier attempt");
  });

  it("shows merge details for a completed merge and does not ask whether it can merge", () => {
    const mergeSha = "d".repeat(40);
    const html = panel(
      [attempt("published", "PUBLISHED")],
      true,
      {
        headSha: pullHead,
        state: "MERGED",
        mergeCommitSha: mergeSha,
        mergedBy: "Ada",
        mergedAt: "2026-10-22T10:00:00.000Z",
        mergeable: null,
        mergeableState: "unknown",
        protectionAccess: "NOT_PROTECTED",
      },
      [],
      {
        label: "MERGED — COMPLETE",
        reasons: [`GitHub reports the pull request merged as ${mergeSha} by Ada at 2026-10-22T10:00:00.000Z.`],
        approvals: { valid: 1, required: 1 },
      },
    );
    expect(html).toContain("MERGED — COMPLETE");
    expect(html).toContain(mergeSha);
    expect(html).toContain("Ada");
    expect(html).toContain("2026-10-22T10:00:00.000Z");
    expect(html).toContain("Mergeability does not apply after GitHub has merged the pull request.");
    expect(html).not.toContain("GitHub has not confirmed");
    expect(html).not.toContain("not required before publishing");
  });
});
