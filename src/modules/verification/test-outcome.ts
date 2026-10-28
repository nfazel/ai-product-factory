/**
 * Classifies one verification test run so that a product verdict is only drawn from evidence about the product.
 *
 * Categories:
 * - PASSED: every declared test ran and passed.
 * - PRODUCT_FAILURE: a test ran and an assertion about product behaviour failed. This is the only category that
 *   becomes a product failure.
 * - ENVIRONMENT_FAILURE: the test could not run because of its environment (missing module or package,
 *   unsupported file type, missing command, unreachable service or database, denied access).
 * - INFRASTRUCTURE_FAILURE: the run was interrupted, timed out, or a file could not be parsed.
 * - NOT_EXECUTED: no test ran, or some declared tests were skipped. Nothing was demonstrated.
 * - UNCLASSIFIED: the run failed in a way this classifier cannot explain. It is treated as blocked for human
 *   review, never as a product failure.
 *
 * Only PRODUCT_FAILURE maps to FAILED. ENVIRONMENT_FAILURE, INFRASTRUCTURE_FAILURE and UNCLASSIFIED map to BLOCKED,
 * which makes the verdict INCONCLUSIVE rather than FAIL. NOT_EXECUTED maps to NOT_RUN.
 */

export type TestRunCategory =
  | "PASSED"
  | "PRODUCT_FAILURE"
  | "ENVIRONMENT_FAILURE"
  | "INFRASTRUCTURE_FAILURE"
  | "NOT_EXECUTED"
  | "UNCLASSIFIED";

export type TestExecutionStatus = "PASSED" | "FAILED" | "BLOCKED" | "NOT_RUN";

export type TestRunCounts = {
  tests: number;
  passed: number;
  failed: number;
  skipped: number;
  reported: boolean;
};

export type TestRunOutcome = {
  category: TestRunCategory;
  status: TestExecutionStatus;
  reason: string;
  counts: TestRunCounts;
};

const ENVIRONMENT_PATTERNS: { pattern: RegExp; reason: string }[] = [
  {
    pattern: /ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND|Cannot find (?:module|package)/,
    reason: "A module or package the test or product code imports is not installed or does not exist in this environment.",
  },
  {
    pattern: /ERR_UNKNOWN_FILE_EXTENSION|ERR_UNSUPPORTED_DIR_IMPORT/,
    reason: "The test loads a file type that node:test cannot run in this verification environment, such as TypeScript or JSX.",
  },
  {
    pattern: /command not found|not recognized as an internal or external command|spawn \S+ ENOENT/,
    reason: "A command the test needs is not available in this environment.",
  },
  {
    pattern: /ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ENETUNREACH/,
    reason: "A network service the test needs could not be reached from this environment.",
  },
  {
    pattern: /Can't reach database server|PrismaClientInitializationError|environment variable not found: DATABASE_URL/i,
    reason: "The database the test needs is unavailable in this verification environment.",
  },
  {
    pattern: /\bEACCES\b|\bEPERM\b/,
    reason: "The test environment denied access to a file or process the test needs.",
  },
];

const INFRASTRUCTURE_PATTERNS: { pattern: RegExp; reason: string }[] = [
  {
    pattern: /SyntaxError|Unexpected token|Unexpected identifier|Cannot use import statement outside a module/,
    reason: "The test file or a module it loads could not be parsed, so the test did not run.",
  },
];

const ASSERTION_PATTERN = /ERR_ASSERTION|AssertionError/;

export function stripAnsi(value: string) {
  return value.replace(/\x1b\[[0-9;]*m/g, "");
}

/** Reads the summary that `node --test` prints in TAP ("# pass 1") or spec ("ℹ pass 1") form. */
export function countTests(output: string): TestRunCounts {
  const counts: TestRunCounts = { tests: 0, passed: 0, failed: 0, skipped: 0, reported: false };
  const pattern = /^\s*(?:#|ℹ)\s+(tests|pass|fail|skipped|todo|cancelled)\s+(\d+)\s*$/gim;
  for (const match of stripAnsi(output).matchAll(pattern)) {
    const value = Number(match[2]);
    counts.reported = true;
    if (match[1] === "tests") counts.tests = value;
    if (match[1] === "pass") counts.passed = value;
    if (match[1] === "fail") counts.failed = value;
    if (match[1] === "skipped" || match[1] === "todo" || match[1] === "cancelled") counts.skipped += value;
  }
  return counts;
}

export function classifyTestRun(input: {
  exitCode: number | null;
  output: string;
  timedOut?: boolean;
}): TestRunOutcome {
  const text = stripAnsi(input.output);
  const counts = countTests(text);
  const outcome = (category: TestRunCategory, reason: string): TestRunOutcome => ({
    category,
    status: statusFor(category),
    reason,
    counts,
  });

  if (input.timedOut) {
    return outcome(
      "INFRASTRUCTURE_FAILURE",
      "The test run exceeded its time limit and was stopped before it reported a result.",
    );
  }

  if (input.exitCode === 0) {
    if (!counts.reported || counts.tests === 0) {
      return outcome("NOT_EXECUTED", "The run did not report any test that ran, so nothing was demonstrated.");
    }
    if (counts.skipped > 0) {
      return outcome("NOT_EXECUTED", "Some declared tests were skipped, so not every test ran.");
    }
    if (counts.failed === 0 && counts.passed === counts.tests) {
      return outcome("PASSED", "Every declared test ran and passed.");
    }
    return outcome("UNCLASSIFIED", "The run exited 0 but its result summary does not account for every test.");
  }

  if (input.exitCode === null) {
    return outcome("INFRASTRUCTURE_FAILURE", "The test run was terminated before it reported a result.");
  }

  const environment = ENVIRONMENT_PATTERNS.find((item) => item.pattern.test(text));
  if (environment) return outcome("ENVIRONMENT_FAILURE", environment.reason);

  const infrastructure = INFRASTRUCTURE_PATTERNS.find((item) => item.pattern.test(text));
  if (infrastructure) return outcome("INFRASTRUCTURE_FAILURE", infrastructure.reason);

  if (counts.tests > 0 && counts.failed > 0 && ASSERTION_PATTERN.test(text)) {
    return outcome("PRODUCT_FAILURE", "A test ran and an assertion about product behaviour failed.");
  }

  if (counts.tests > 0 && counts.failed > 0) {
    return outcome(
      "UNCLASSIFIED",
      "A test failed for a reason other than an assertion on product behaviour. A person must review it before it can count as a product result.",
    );
  }

  return outcome("UNCLASSIFIED", "The test run failed before it reported a result. A person must review the technical detail.");
}

function statusFor(category: TestRunCategory): TestExecutionStatus {
  switch (category) {
    case "PASSED":
      return "PASSED";
    case "PRODUCT_FAILURE":
      return "FAILED";
    case "NOT_EXECUTED":
      return "NOT_RUN";
    default:
      return "BLOCKED";
  }
}
