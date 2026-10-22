import { describe, expect, it } from "vitest";

import { decideRemoteMain, type PublishedBranchFact } from "@/modules/source-control/remote-main";

const baseline = "ad31f96537d67da73d406a77832ae8a94216da7b";
const approved = "9abadcbfb2509ffad5902628e1d5bfcd5a8d7075";
const other = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function branch(patch: Partial<PublishedBranchFact> = {}): PublishedBranchFact {
  return {
    branch: "ai-factory/task-approved-",
    approvedSha: approved,
    localSha: approved,
    remoteSha: approved,
    recordedBaselineSha: baseline,
    baselineIsAncestor: true,
    ...patch,
  };
}

function input(patch: Partial<Parameters<typeof decideRemoteMain>[0]> = {}) {
  return {
    configuredRepository: "nfazel/betmyfriend",
    observedRepository: "nfazel/betmyfriend",
    githubDefaultBranch: "main",
    remoteMainSha: null as string | null,
    localMainSha: baseline,
    published: [branch()],
    ...patch,
  };
}

describe("remote main bootstrap decision", () => {
  it("offers initialization when remote main is absent and the baseline precedes the approved commit", () => {
    const decision = decideRemoteMain(input());
    expect(decision.status).toBe("offer");
    expect(decision.baselineSha).toBe(baseline);
    expect(decision.repository).toBe("nfazel/betmyfriend");
  });

  it("reports a missing baseline and does not offer the push", () => {
    expect(decideRemoteMain(input({ localMainSha: "" })).status).toBe("blocked");
    expect(decideRemoteMain(input({ localMainSha: "", published: [branch({ recordedBaselineSha: "" })] })).message).toMatch(/baseline/);
  });

  it("rejects a baseline that is not an ancestor of the published commit", () => {
    const decision = decideRemoteMain(input({ published: [branch({ baselineIsAncestor: false })] }));
    expect(decision.status).toBe("blocked");
    expect(decision.message).toMatch(/not an ancestor/);
  });

  it("rejects a baseline that already contains the approved implementation", () => {
    const decision = decideRemoteMain(input({
      localMainSha: approved,
      published: [branch({ recordedBaselineSha: approved, baselineIsAncestor: true })],
    }));
    expect(decision.status).toBe("blocked");
    expect(decision.message).toMatch(/already contains the approved task implementation/);
  });

  it("does not offer initialization when remote main already exists", () => {
    const decision = decideRemoteMain(input({ remoteMainSha: baseline }));
    expect(decision.status).toBe("ready");
    expect(decision.remoteSha).toBe(baseline);
  });

  it("reports a GitHub default branch other than main and still offers the missing main branch", () => {
    const decision = decideRemoteMain(input({ githubDefaultBranch: "master" }));
    expect(decision.status).toBe("offer");
    expect(decision.message).toMatch(/default branch is master/);
    expect(decision.message).toMatch(/settings were not changed/);
    expect(decision.message).toMatch(/Remote main does not exist/);
  });

  it("keeps an existing main branch when GitHub's default branch is different", () => {
    const decision = decideRemoteMain(input({ githubDefaultBranch: "master", remoteMainSha: baseline }));
    expect(decision.status).toBe("ready");
    expect(decision.message).toMatch(/default branch is master/);
    expect(decision.message).toMatch(/settings were not changed/);
    expect(decision.remoteSha).toBe(baseline);
  });

  it("rejects a published branch that no longer matches the approved commit", () => {
    const decision = decideRemoteMain(input({ published: [branch({ remoteSha: other })] }));
    expect(decision.status).toBe("blocked");
    expect(decision.message).toMatch(/does not match the approved commit/);
  });

  it("rejects a repository that is not the configured destination", () => {
    const decision = decideRemoteMain(input({ observedRepository: "nfazel/ai-product-factory" }));
    expect(decision.status).toBe("blocked");
    expect(decision.message).toMatch(/does not match the repository/);
  });
});
