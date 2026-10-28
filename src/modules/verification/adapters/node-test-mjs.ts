import type { ImplementationProfile } from "@/modules/verification/inspection";
import { isVerificationTestPath } from "@/modules/verification/policy";
import type { TestAdapter } from "@/modules/verification/adapters/types";
import { classifyTestRun } from "@/modules/verification/test-outcome";

/**
 * Runs one `verification/<name>.test.mjs` file with the built-in `node --test` runner. It can exercise a plain
 * JavaScript product module that the test imports by a relative path. It cannot load TypeScript or JSX.
 *
 * This is the behaviour that existed before adapters: the same command, the same approved test paths, and the
 * same output classification.
 */
export const nodeTestMjsAdapter: TestAdapter = {
  id: "node-test-mjs",
  label: "node:test with plain JavaScript (.mjs) product modules",
  technologies: [{ runtime: "node", language: "javascript" }],
  surfaces: ["MODULE_EXPORT"],
  provides: ["node-test-runner", "relative-module-import", "assertion-result"],
  requiredDependencies: [],
  fileConvention: "verification/<name>.test.mjs",
  commandTemplate: "node --test <filePath>",
  environment: [
    "Node.js with the built-in node:test runner",
    "A plain JavaScript product module (.js, .mjs or .cjs) that the test imports by a relative path",
  ],
  setupRequired: false,
  canGenerate: true,
  canExecute: true,

  detect(profile: ImplementationProfile) {
    if (profile.plainJavaScriptSources > 0) {
      return {
        available: true,
        reason: `The implementation has ${profile.plainJavaScriptSources} plain JavaScript source file(s). A verification test in verification/ may import them by a relative path.`,
      };
    }
    return {
      available: false,
      reason:
        "The implementation has no plain JavaScript (.js, .mjs, .cjs) product modules. node:test cannot load TypeScript or JSX, so automated verification tests cannot exercise this implementation.",
    };
  },

  acceptsFile(filePath: string) {
    // HTTP black-box tests live in verification/http/ and belong to the http-blackbox adapter.
    return isVerificationTestPath(filePath) && !filePath.startsWith("verification/http/");
  },

  commandFor(filePath: string) {
    return `node --test ${filePath}`;
  },

  classify(run) {
    return classifyTestRun({ exitCode: run.exitCode, output: run.output, timedOut: run.timedOut });
  },
};
