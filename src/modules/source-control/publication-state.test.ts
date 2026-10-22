import { describe, expect, it } from "vitest";

import { approvedPublication, describePublication, type PublicationRecord } from "@/modules/source-control/publication-state";

const branch = "ai-factory/task-approved-";
const commit = "9abadcbfb2509ffad5902628e1d5bfcd5a8d7075";
const otherCommit = "ad31f96537d67da73d406a77832ae8a94216da7b";

function record(patch: Partial<PublicationRecord> & Pick<PublicationRecord, "id" | "status">): PublicationRecord {
  return {
    demo: false,
    localBranch: branch,
    remoteBranch: branch,
    localCommitSha: commit,
    remoteCommitSha: "",
    failureMessage: "",
    ...patch,
  };
}

describe("publication state", () => {
  it("offers the publish form when no publication record exists", () => {
    const view = describePublication({ branch, commit, eligible: true, records: [] });
    expect(view.offerForm).toBe(true);
    expect(view.latestStatusLabel).toBe("None");
    expect(view.publishedBranch).toBe("");
    expect(view.remoteCommitSha).toBe("");
    expect(view.successfulId).toBeNull();
  });

  it("shows a failed attempt and still offers retry", () => {
    const view = describePublication({
      branch,
      commit,
      eligible: true,
      records: [record({ id: "failed-1", status: "FAILED", failureMessage: "GitHub is unavailable." })],
    });
    expect(view.offerForm).toBe(true);
    expect(view.latestStatus).toBe("FAILED");
    expect(view.latestStatusLabel).toBe("Failed");
    expect(view.latestError).toBe("GitHub is unavailable.");
    expect(view.publishedBranch).toBe("");
    expect(view.remoteCommitSha).toBe("");
  });

  it("keeps retry available when every attempt failed", () => {
    const records = [
      record({ id: "failed-2", status: "FAILED", failureMessage: "GitHub is unavailable." }),
      record({ id: "failed-1", status: "FAILED", failureMessage: "GitHub is unavailable." }),
    ];
    const view = describePublication({ branch, commit, eligible: true, records });
    expect(view.offerForm).toBe(true);
    expect(view.latestError).toBe("GitHub is unavailable.");
    expect(view.publishedBranch).toBe("");
    expect(approvedPublication(records, branch, commit)).toBeNull();
  });

  it("treats a matching published record as the successful publication", () => {
    const view = describePublication({
      branch,
      commit,
      eligible: true,
      records: [
        record({
          id: "published-1",
          status: "PUBLISHED",
          remoteCommitSha: commit,
        }),
      ],
      evidence: [
        {
          id: "evidence-1",
          publishedChangeId: "published-1",
          type: "BRANCH_PUBLISHED",
          description: `Published ${branch} at ${commit}.`,
          result: "PUBLISHED",
        },
        {
          id: "evidence-pr",
          publishedChangeId: "published-1",
          type: "PULL_REQUEST_CREATED",
          description: "Opened a pull request.",
          result: "OPEN",
        },
      ],
    });
    expect(view.offerForm).toBe(false);
    expect(view.publishedBranch).toBe(branch);
    expect(view.remoteCommitSha).toBe(commit);
    expect(view.evidence.map((item) => item.type)).toEqual(["BRANCH_PUBLISHED"]);
    expect(view.successfulId).toBe("published-1");
  });

  it("does not treat a published record for another commit as this task's publication", () => {
    const view = describePublication({
      branch,
      commit,
      eligible: true,
      records: [
        record({
          id: "other",
          status: "PUBLISHED",
          localCommitSha: otherCommit,
          remoteCommitSha: otherCommit,
        }),
      ],
    });
    expect(view.successfulId).toBeNull();
    expect(view.publishedBranch).toBe("");
    expect(view.remoteCommitSha).toBe("");
    expect(view.latestError).toMatch(/does not match the approved branch and commit/);
    expect(view.offerForm).toBe(true);
  });

  it("blocks another submission while a publication attempt is in progress", () => {
    const view = describePublication({
      branch,
      commit,
      eligible: true,
      records: [record({ id: "ready-1", status: "READY" })],
    });
    expect(view.inProgress).toBe(true);
    expect(view.offerForm).toBe(false);
    expect(view.latestStatusLabel).toBe("In progress");
    expect(view.publishedBranch).toBe("");
  });

  it("does not infer the remote commit from a pull request head", () => {
    const view = describePublication({
      branch,
      commit,
      eligible: true,
      records: [record({ id: "failed-1", status: "FAILED", failureMessage: "GitHub is unavailable." })],
    });
    expect(view.remoteCommitSha).toBe("");
    expect(view.remoteCommitSha).not.toBe(otherCommit);
  });

  it("keeps an earlier successful publication when a later attempt fails", () => {
    const records = [
      record({ id: "failed-2", status: "FAILED", failureMessage: "Git could not push the branch." }),
      record({ id: "published-1", status: "PUBLISHED", remoteCommitSha: commit }),
    ];
    const view = describePublication({ branch, commit, eligible: true, records });
    expect(approvedPublication(records, branch, commit)?.id).toBe("published-1");
    expect(view.remoteCommitSha).toBe(commit);
    expect(view.latestStatus).toBe("FAILED");
    expect(view.offerForm).toBe(false);
  });

  it("does not offer publication when the task is not eligible", () => {
    const view = describePublication({ branch, commit, eligible: false, records: [] });
    expect(view.offerForm).toBe(false);
  });
});
