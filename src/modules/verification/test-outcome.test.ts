import { describe, expect, it } from "vitest";

import { classifyTestRun, countTests } from "@/modules/verification/test-outcome";

const TAP_PASS = "TAP version 13\nok 1 - submit valid claim\n1..1\n# tests 1\n# suites 0\n# pass 1\n# fail 0\n# skipped 0\n# todo 0\n# cancelled 0\n";
const TAP_ASSERTION_FAILURE = [
  "TAP version 13",
  "not ok 1 - submit valid claim",
  "  ---",
  "  error: 'Expected values to be strictly equal'",
  "  code: 'ERR_ASSERTION'",
  "  ...",
  "1..1",
  "# tests 1",
  "# pass 0",
  "# fail 1",
  "",
].join("\n");

describe("classifyTestRun", () => {
  it("passes only when every declared test ran and passed", () => {
    const outcome = classifyTestRun({ exitCode: 0, output: TAP_PASS });
    expect(outcome.category).toBe("PASSED");
    expect(outcome.status).toBe("PASSED");
    expect(outcome.counts).toMatchObject({ tests: 1, passed: 1, failed: 0 });
  });

  it("reads the spec reporter summary as well as TAP", () => {
    const output = "ℹ tests 2\nℹ suites 0\nℹ pass 2\nℹ fail 0\nℹ skipped 0\nℹ todo 0\n";
    expect(classifyTestRun({ exitCode: 0, output }).status).toBe("PASSED");
  });

  it("treats an assertion about product behaviour that failed as the only product failure", () => {
    const outcome = classifyTestRun({ exitCode: 1, output: TAP_ASSERTION_FAILURE });
    expect(outcome.category).toBe("PRODUCT_FAILURE");
    expect(outcome.status).toBe("FAILED");
  });

  it("classifies a missing module or package as an environment failure, not a product failure", () => {
    const output = "Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'left-pad' imported from /tmp/product/src/claims/submit.mjs\n# tests 1\n# fail 1\n";
    const outcome = classifyTestRun({ exitCode: 1, output });
    expect(outcome.category).toBe("ENVIRONMENT_FAILURE");
    expect(outcome.status).toBe("BLOCKED");
    expect(outcome.reason).toMatch(/not installed or does not exist/);
  });

  it("classifies a file type the runner cannot load as an environment failure", () => {
    const output = "TypeError [ERR_UNKNOWN_FILE_EXTENSION]: Unknown file extension \".tsx\" for /tmp/product/src/app/page.tsx";
    const outcome = classifyTestRun({ exitCode: 1, output });
    expect(outcome.category).toBe("ENVIRONMENT_FAILURE");
    expect(outcome.reason).toMatch(/TypeScript or JSX/);
  });

  it("classifies a missing command as an environment failure", () => {
    const outcome = classifyTestRun({ exitCode: 127, output: "sh: pytest: command not found" });
    expect(outcome.category).toBe("ENVIRONMENT_FAILURE");
    expect(outcome.status).toBe("BLOCKED");
  });

  it("classifies an unavailable database as an environment failure", () => {
    const output = "PrismaClientInitializationError: Can't reach database server at 127.0.0.1:5433";
    expect(classifyTestRun({ exitCode: 1, output }).category).toBe("ENVIRONMENT_FAILURE");
  });

  it("gives environment precedence over an assertion when both appear", () => {
    const output = `${TAP_ASSERTION_FAILURE}\nError: Cannot find module '/tmp/x'\n`;
    expect(classifyTestRun({ exitCode: 1, output }).category).toBe("ENVIRONMENT_FAILURE");
  });

  it("classifies a timeout as an infrastructure failure", () => {
    const outcome = classifyTestRun({ exitCode: 1, output: "", timedOut: true });
    expect(outcome.category).toBe("INFRASTRUCTURE_FAILURE");
    expect(outcome.status).toBe("BLOCKED");
    expect(outcome.reason).toMatch(/time limit/);
  });

  it("classifies a run terminated by a signal as an infrastructure failure", () => {
    const outcome = classifyTestRun({ exitCode: null, output: "" });
    expect(outcome.category).toBe("INFRASTRUCTURE_FAILURE");
    expect(outcome.status).toBe("BLOCKED");
  });

  it("classifies a file that cannot be parsed as an infrastructure failure", () => {
    const output = "SyntaxError: Unexpected token '<'\n# tests 0\n";
    expect(classifyTestRun({ exitCode: 1, output }).category).toBe("INFRASTRUCTURE_FAILURE");
  });

  it("does not pass a run that reports no test", () => {
    const outcome = classifyTestRun({ exitCode: 0, output: "# tests 0\n# pass 0\n# fail 0\n" });
    expect(outcome.category).toBe("NOT_EXECUTED");
    expect(outcome.status).toBe("NOT_RUN");
  });

  it("does not pass a run with no result summary at all", () => {
    const outcome = classifyTestRun({ exitCode: 0, output: "" });
    expect(outcome.status).toBe("NOT_RUN");
  });

  it("does not pass a run where some declared tests were skipped", () => {
    const output = "# tests 2\n# pass 1\n# fail 0\n# skipped 1\n";
    const outcome = classifyTestRun({ exitCode: 0, output });
    expect(outcome.category).toBe("NOT_EXECUTED");
    expect(outcome.reason).toMatch(/skipped/);
  });

  it("does not turn a failure that is not an assertion into a product failure", () => {
    const output = "# tests 1\n# pass 0\n# fail 1\nTypeError: submitClaim is not a function\n";
    const outcome = classifyTestRun({ exitCode: 1, output });
    expect(outcome.category).toBe("UNCLASSIFIED");
    expect(outcome.status).toBe("BLOCKED");
  });

  it("treats an unexplained failure as blocked for human review", () => {
    const outcome = classifyTestRun({ exitCode: 1, output: "something unexpected happened" });
    expect(outcome.category).toBe("UNCLASSIFIED");
    expect(outcome.status).toBe("BLOCKED");
  });

  it("reads summaries with terminal colour codes", () => {
    const output = "\u001b[31m# tests 1\u001b[39m\n\u001b[31m# fail 1\u001b[39m\nAssertionError [ERR_ASSERTION]: no\n";
    expect(classifyTestRun({ exitCode: 1, output }).category).toBe("PRODUCT_FAILURE");
  });
});

describe("countTests", () => {
  it("returns zeros and reported false when no summary is present", () => {
    expect(countTests("nothing here")).toEqual({ tests: 0, passed: 0, failed: 0, skipped: 0, reported: false });
  });
});
