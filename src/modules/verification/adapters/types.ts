import type { ImplementationProfile } from "@/modules/verification/inspection";
import type { HttpObservation } from "@/modules/verification/http/guard";
import type { TestExecutionStatus, TestRunCategory, TestRunOutcome } from "@/modules/verification/test-outcome";

/**
 * What a verification test exercises. A surface names the thing under test, not the tool that runs it. The
 * framework knows these surfaces; an adapter declares which of them it can exercise.
 */
export const TEST_SURFACES = ["MODULE_EXPORT", "HTTP_ENDPOINT", "DATABASE", "BROWSER_UI", "OTHER"] as const;
export type TestSurface = (typeof TEST_SURFACES)[number];

/**
 * Describes what an adapter can do. It is data, so the registry and the Verification Agent can read it without
 * running anything.
 */
export type AdapterDescriptor = {
  /** Stable identifier stored on test cases, executions and evidence. Lowercase words joined by hyphens. */
  id: string;
  label: string;
  /** Runtime and language the adapter loads product code with. */
  technologies: { runtime: string; language: string }[];
  surfaces: TestSurface[];
  /** Capability ids a proposed test may require. A proposal requiring anything else is refused. */
  provides: string[];
  /** Packages the adapter depends on. The framework never installs packages for an adapter. */
  requiredDependencies: string[];
  /** Human-readable test file convention, for example `verification/<name>.test.mjs`. */
  fileConvention: string;
  /** Human-readable command shape, for example `node --test <filePath>`. The real command is built by commandFor. */
  commandTemplate: string;
  /** Environment requirements the adapter needs in order to run. */
  environment: string[];
  /** Whether the environment must be set up before this adapter can run. The framework does not run setup for adapters. */
  setupRequired: boolean;
  canGenerate: boolean;
  canExecute: boolean;
};

export type AdapterAvailability = { available: boolean; reason: string };

/**
 * An adapter proposes commands and classifies their output. It never runs a process itself: every command it
 * proposes goes through the verification command gate, so an adapter cannot widen what may be executed.
 */
export type TestAdapter = AdapterDescriptor & {
  /** Capability detection for one implementation. Pure: it reads the inspection profile only. */
  detect(profile: ImplementationProfile): AdapterAvailability;
  /** Whether a test file path is one this adapter may run. */
  acceptsFile(filePath: string): boolean;
  /** The command that runs one test file. It must pass the verification command gate to execute. */
  commandFor(filePath: string): string;
  /** Error classification: turns the raw run into a product result, an environment stop, or an infrastructure stop. */
  classify(run: { exitCode: number | null; output: string; timedOut: boolean }): TestRunOutcome;
};

/** The structured result of one adapter execution. Every field is stored with the execution and its evidence. */
export type AdapterTestResult = {
  executionId: string;
  evidenceId: string;
  testCaseId: string;
  acceptanceCriterionId: string | null;
  adapterId: string;
  command: string;
  executionStatus: TestExecutionStatus;
  /** The outcome category, or the framework stage name when setup failed before the test ran. */
  failureCategory: string;
  durationMs: number;
  output: string;
  snapshotCommit: string;
  /** HTTP requests the test made, recorded by the guard. Empty for adapters that make no HTTP requests. */
  observations: HttpObservation[];
};

export type { TestRunCategory };
