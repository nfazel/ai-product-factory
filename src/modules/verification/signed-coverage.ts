/**
 * What a person's signed statement "this existing test proves this criterion" is worth. It counts only while the named
 * test's latest run on the approved version passed; one failing linked test fails the criterion. Pure: reads nothing.
 */
export type SignedCoverageRun = { kind: string; command: string; status: string; snapshotCommit: string | null; createdAt: Date };
export type SignedCoverage = { tests: string[]; verified: boolean; failed: boolean };
export function signedCoverage(links: { command: string; criterionId: string }[] | undefined, criterionId: string, runs: SignedCoverageRun[], approvedSnapshot: string): SignedCoverage {
  const tests = (links ?? []).filter(link => link.criterionId === criterionId).map(link => link.command);
  const latest = (command: string) => runs.filter(run => run.kind === 'EXISTING_REGRESSION' && run.command === command && !!approvedSnapshot && run.snapshotCommit === approvedSnapshot).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  return { tests, failed: tests.some(command => latest(command)?.status === 'FAILED'), verified: tests.length > 0 && tests.every(command => latest(command)?.status === 'PASSED') };
}

/**
 * The status of one acceptance criterion from all its evidence. A person's signed statement that an existing test
 * proves the criterion outranks an AI-written test: if that signed test passed, a failing AI-written test cannot fail
 * the criterion. The failure stays on record and is reported as a concern, so the verdict becomes a pass with concerns
 * for a person to weigh. A failure of the signed test itself always fails the criterion.
 */
export type CriterionStatus = "VERIFIED" | "FAILED" | "NOT_TESTED" | "BLOCKED" | "NOT_APPLICABLE";
export function criterionStatus(input: {
  independentFailed: boolean;
  independentOrManualVerified: boolean;
  signed: SignedCoverage;
  humanConfirmedNotApplicable: boolean;
  blocked: boolean;
}): { status: CriterionStatus; contradicted: boolean } {
  if (input.signed.failed) return { status: "FAILED", contradicted: false };
  if (input.independentFailed && input.signed.verified) return { status: "VERIFIED", contradicted: true };
  if (input.independentFailed) return { status: "FAILED", contradicted: false };
  if (input.independentOrManualVerified || input.signed.verified) return { status: "VERIFIED", contradicted: false };
  if (input.humanConfirmedNotApplicable) return { status: "NOT_APPLICABLE", contradicted: false };
  if (input.blocked) return { status: "BLOCKED", contradicted: false };
  return { status: "NOT_TESTED", contradicted: false };
}
