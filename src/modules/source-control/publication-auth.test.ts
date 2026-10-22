import { spawn } from "node:child_process";

import { describe, expect, it } from "vitest";

import { SourceControlFailure } from "@/modules/source-control/errors";
import {
  buildPublishArguments,
  installationTokenUsable,
  publicationGitInvocation,
  PUBLICATION_TOKEN_ENV,
} from "@/modules/source-control/push";

const token = "ghs_testdummyvalue";

function invocation() {
  return publicationGitInvocation(
    buildPublishArguments({
      remoteUrl: "https://github.com/nfazel/betmyfriend.git",
      localBranch: "ai-factory/task-approved-",
      remoteBranch: "ai-factory/task-approved-",
    }),
    token,
  );
}

function credential(operation: "fill" | "approve", input: string, command = invocation()) {
  const helper = command.argv.find((arg) => arg.startsWith("credential.helper=!"));
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    const child = spawn("git", ["-c", "credential.helper=", "-c", helper ?? "", "credential", operation], {
      env: command.env,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.stdin.end(input);
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

describe("publication git authentication", () => {
  it("keeps the installation token out of the git arguments and remote URL", () => {
    const command = invocation();
    expect(command.argv.join("\n")).not.toContain(token);
    expect(command.argv.join("\n")).not.toContain("extraheader");
    expect(command.argv.join("\n")).not.toContain("@github.com");
    expect(command.argv).toContain("https://github.com/nfazel/betmyfriend.git");
    expect(command.argv.some((arg) => arg === "--force" || arg === "--force-with-lease")).toBe(false);
    expect(command.env.GIT_TERMINAL_PROMPT).toBe("0");
    expect(command.env.GCM_INTERACTIVE).toBe("never");
    expect(command.env[PUBLICATION_TOKEN_ENV]).toBe(token);
    expect(command.argv.some((arg) => arg === "credential.helper=")).toBe(true);
    const helper = command.argv.find((arg) => arg.startsWith("credential.helper=!")) ?? "";
    expect(helper).toContain("$AI_PRODUCT_FACTORY_GIT_TOKEN");
    expect(helper).not.toContain(token);
  });

  it("answers Git's credential request from the process environment and does not store it", async () => {
    const filled = await credential("fill", "protocol=https\nhost=github.com\n\n");
    expect(filled.code).toBe(0);
    expect(filled.stdout).toContain("username=x-access-token");
    expect(filled.stdout).toContain(`password=${token}`);
    expect(filled.stderr).not.toContain(token);
    const stored = await credential("approve", `protocol=https\nhost=github.com\nusername=x-access-token\npassword=${token}\n\n`);
    expect(stored.stdout).not.toContain(token);
    expect(stored.stderr).not.toContain(token);
  });

  it("refuses a token that cannot be passed through the environment safely", () => {
    expect(() => publicationGitInvocation(["push", "https://github.com/nfazel/betmyfriend.git", "main:main"], "ghs_token;touch")).toThrow(SourceControlFailure);
    expect(() => publicationGitInvocation(["push", "https://github.com/nfazel/betmyfriend.git", "main:main"], "")).toThrow(/authentication failed/);
  });

  it("refuses a force push and a credential-bearing remote URL", () => {
    expect(() => publicationGitInvocation(["push", "--force", "https://github.com/nfazel/betmyfriend.git", "main:main"], token)).toThrow(/Force push/);
    expect(() =>
      buildPublishArguments({
        remoteUrl: `https://x-access-token:${token}@github.com/nfazel/betmyfriend.git`,
        localBranch: "main",
        remoteBranch: "main",
      }),
    ).toThrow(/configured GitHub repository/);
  });

  it("rejects an installation token that is already near expiry", () => {
    const now = Date.parse("2026-10-21T12:00:00.000Z");
    expect(installationTokenUsable("2026-10-21T13:00:00.000Z", now)).toBe(true);
    expect(installationTokenUsable("2026-10-21T12:00:30.000Z", now)).toBe(false);
    expect(installationTokenUsable("not-a-date", now)).toBe(false);
    expect(installationTokenUsable(undefined, now)).toBe(true);
  });
});
