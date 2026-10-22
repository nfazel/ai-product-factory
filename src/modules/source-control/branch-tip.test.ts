import { describe, expect, it } from "vitest";

import { SourceControlFailure } from "@/modules/source-control/errors";
import { branchTipFromGitHub, publicationTransportFailure } from "@/modules/source-control/push";

const SHA = "9abadcbfb2509ffad5902628e1d5bfcd5a8d7075";

describe("GitHub branch lookup", () => {
  it("treats an empty repository 409 as no remote branch", () => {
    expect(branchTipFromGitHub(409, { message: "Git Repository is empty." })).toBeNull();
  });

  it("treats a missing branch 404 as no remote branch", () => {
    expect(branchTipFromGitHub(404, { message: "Not Found" })).toBeNull();
  });

  it("returns the commit SHA when the remote branch exists", () => {
    expect(branchTipFromGitHub(200, { object: { sha: SHA } })).toBe(SHA);
  });

  it("keeps any other HTTP 409 as an error and does not include the response body", () => {
    expect(() => branchTipFromGitHub(409, { message: "Resource conflict ghs_installationsecret" })).toThrow(
      SourceControlFailure,
    );
    try {
      branchTipFromGitHub(409, { message: "Resource conflict ghs_installationsecret" });
    } catch (error) {
      expect(error).toBeInstanceOf(SourceControlFailure);
      expect((error as SourceControlFailure).kind).toBe("REJECTED");
      expect((error as SourceControlFailure).message).toBe("GitHub rejected the branch lookup. Nothing was published.");
      expect((error as SourceControlFailure).message).not.toContain("ghs_installationsecret");
    }
  });

  it("distinguishes authentication, permission, and unavailable responses", () => {
    expect(() => branchTipFromGitHub(401, { message: "Bad credentials" })).toThrow(/authentication failed/);
    expect(() => branchTipFromGitHub(403, { message: "Resource not accessible" })).toThrow(/denied permission/);
    expect(() => branchTipFromGitHub(502, { message: "Server Error" })).toThrow(/GitHub is unavailable/);
    try {
      branchTipFromGitHub(401, {});
    } catch (error) {
      expect((error as SourceControlFailure).kind).toBe("AUTH");
    }
    try {
      branchTipFromGitHub(403, {});
    } catch (error) {
      expect((error as SourceControlFailure).kind).toBe("PERMISSION");
    }
    try {
      branchTipFromGitHub(503, {});
    } catch (error) {
      expect((error as SourceControlFailure).kind).toBe("UNAVAILABLE");
    }
  });
});

describe("Git push failures", () => {
  it("refuses a conflicting remote history without repeating credentials", () => {
    const failure = publicationTransportFailure(
      "error: failed to push some refs\n! [rejected] updates were rejected because the remote contains work that you do not have locally. AUTHORIZATION: bearer ghs_installationsecret https://x-access-token:ghs_installationsecret@github.com/nfazel/betmyfriend.git",
    );
    expect(failure.kind).toBe("DIVERGENCE");
    expect(failure.message).toMatch(/will not overwrite/);
    expect(failure.message).not.toContain("ghs_installationsecret");
    expect(failure.message).not.toContain("x-access-token");
  });

  it("reports a disabled terminal prompt as an authentication failure", () => {
    const failure = publicationTransportFailure("fatal: could not read Username for 'https://github.com': terminal prompts disabled");
    expect(failure.kind).toBe("AUTH");
    expect(failure.message).toBe("Git could not authenticate the push. Nothing was published.");
  });

  it("keeps other transport failures distinct and sanitised", () => {
    const failure = publicationTransportFailure("fatal: unable to access repository AUTHORIZATION: bearer ghp_secretvalue");
    expect(failure.kind).toBe("REJECTED");
    expect(failure.message).toMatch(/could not push/);
    expect(failure.message).not.toContain("ghp_secretvalue");
    expect(failure.message).not.toContain("bearer ghp");
  });
});
