import type { ImplementationProfile } from "@/modules/verification/inspection";
import { verificationDatabaseAdminUrl, VERIFICATION_DATABASE_CONFIGURATION_MESSAGE } from "@/modules/verification/http/config";
import { isVerificationTestPath } from "@/modules/verification/policy";
import type { TestAdapter } from "@/modules/verification/adapters/types";
import { countTests, classifyTestRun, type TestRunOutcome } from "@/modules/verification/test-outcome";

/**
 * HTTP black-box acceptance tests. A test file calls the managed application over HTTP with the built-in fetch,
 * at the base URL the framework provides. It never imports product modules.
 *
 * The framework, not the test, starts the application, provisions and seeds its database, signs in test accounts,
 * and stops everything afterwards. The adapter only proposes the command and classifies what the run produced.
 *
 * Limits: the guard restricts TCP connections and fetch origins inside the test process. It does not stop a test that
 * spawns its own process. That limit is recorded in the Phase 2 report.
 */

export const HTTP_BLACKBOX_DIRECTORY = "verification/http/";

const GUARD_REFUSAL = /Verification guard refused/;

export const httpBlackboxAdapter: TestAdapter = {
  id: "http-blackbox",
  label: "HTTP black-box acceptance tests against a managed local application",
  technologies: [
    { runtime: "node", language: "javascript" },
    { runtime: "http", language: "any" },
  ],
  surfaces: ["HTTP_ENDPOINT"],
  provides: [
    "http-request",
    "status-assertion",
    "body-assertion",
    "authenticated-session",
    "managed-application",
    "verification-database",
    "fixture-seeding",
  ],
  requiredDependencies: [],
  fileConvention: "verification/http/<name>.test.mjs",
  commandTemplate: "node --test <filePath>, run with the managed application's base URL",
  environment: [
    "Node.js 18 or later, for the built-in fetch and node:test",
    "A Next.js or Node application with a lockfile and a build or start script, reachable only through the managed local port",
    "VERIFICATION_DATABASE_ADMIN_URL: a PostgreSQL URL that can create and drop databases. Verification never uses DATABASE_URL.",
  ],
  setupRequired: true,
  canGenerate: true,
  canExecute: true,

  detect(profile: ImplementationProfile) {
    if (profile.routes.length === 0) {
      return {
        available: false,
        reason: "The approved snapshot has no API route handlers, so there are no HTTP endpoints to test.",
      };
    }
    if (!profile.scripts.includes("build") && !profile.scripts.includes("start") && !profile.frameworks.includes("Next.js")) {
      return {
        available: false,
        reason: "The approved snapshot has no build or start script, so the application cannot be run for HTTP verification.",
      };
    }
    if (!verificationDatabaseAdminUrl()) {
      return { available: false, reason: VERIFICATION_DATABASE_CONFIGURATION_MESSAGE };
    }
    return {
      available: true,
      reason: `The snapshot exposes ${profile.routes.length} route handler(s). Tests run against a managed local application with a disposable database.`,
    };
  },

  acceptsFile(filePath: string) {
    return filePath.startsWith(HTTP_BLACKBOX_DIRECTORY) && isVerificationTestPath(filePath);
  },

  commandFor(filePath: string) {
    return `node --test ${filePath}`;
  },

  classify(run): TestRunOutcome {
    // A request outside the managed application is an infrastructure stop. It must never become a product verdict.
    if (GUARD_REFUSAL.test(run.output)) {
      return {
        category: "INFRASTRUCTURE_FAILURE",
        status: "BLOCKED",
        reason:
          "A verification test tried to reach something other than the managed application, so the verification guard stopped it. The test was not judged against the product.",
        counts: countTests(run.output),
      };
    }
    return classifyTestRun({ exitCode: run.exitCode, output: run.output, timedOut: run.timedOut });
  },
};
