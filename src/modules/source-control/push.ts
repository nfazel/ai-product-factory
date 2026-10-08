import { spawn } from "node:child_process";

import { childEnv } from "@/modules/coding/git";
import { SourceControlFailure } from "@/modules/source-control/errors";
import { redactSecrets } from "@/modules/source-control/redact";

const SAFE_REF = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

export function assertSafeRef(ref: string) {
  if (!SAFE_REF.test(ref) || ref.includes("..") || ref.includes("+") || ref.startsWith("-")) {
    throw new SourceControlFailure("The branch name is not safe to publish.", "REJECTED");
  }
}

/** The only push argument list the factory builds. It cannot express a force push. */
export function buildPublishArguments(input: { remoteUrl: string; localBranch: string; remoteBranch: string }) {
  assertSafeRef(input.localBranch);
  assertSafeRef(input.remoteBranch);
  if (!input.remoteUrl.startsWith("https://github.com/")) {
    throw new SourceControlFailure("Publication only targets the configured GitHub repository.", "REJECTED");
  }
  return ["push", input.remoteUrl, `${input.localBranch}:${input.remoteBranch}`] as const;
}

export async function pushRef(cwd: string, args: readonly string[], token: string) {
  if (args.some((arg) => arg === "--force" || arg === "--force-with-lease" || arg.startsWith("+"))) {
    throw new SourceControlFailure("Force push is not available.", "REJECTED");
  }
  const header = `AUTHORIZATION: bearer ${token}`;
  return runGit(cwd, ["-c", `http.extraheader=${header}`, "--no-pager", ...args]);
}

function runGit(cwd: string, args: string[]) {
  return new Promise<{ code: number; output: string }>((resolve) => {
    const child = spawn(/*turbopackIgnore: true*/ "git", args, {
      cwd,
      shell: false,
      env: {
        ...childEnv(),
        GIT_TERMINAL_PROMPT: "0",
        GIT_CONFIG_COUNT: "2",
        GIT_CONFIG_KEY_0: "commit.gpgsign",
        GIT_CONFIG_VALUE_0: "false",
        GIT_CONFIG_KEY_1: "core.fsmonitor",
        GIT_CONFIG_VALUE_1: "false",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    child.on("error", () => resolve({ code: 1, output: "Git could not be started." }));
    child.on("close", (code) => resolve({ code: code ?? 1, output: redactSecrets(output).slice(0, 2000) }));
  });
}
