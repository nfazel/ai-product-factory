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
