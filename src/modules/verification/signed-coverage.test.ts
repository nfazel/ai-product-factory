import { describe, expect, it } from 'vitest';
import { signedCoverage, type SignedCoverageRun } from './signed-coverage';
const SNAP = 'a'.repeat(40), links = [{ command: 'npm run test:integration', criterionId: 'c1' }];
const run = (over: Partial<SignedCoverageRun> = {}): SignedCoverageRun => ({ kind: 'EXISTING_REGRESSION', command: 'npm run test:integration', status: 'PASSED', snapshotCommit: SNAP, createdAt: new Date('2026-11-03T10:00:00Z'), ...over });
describe('signed test-to-criterion coverage', () => {
  it('verifies a criterion only while the linked test passed on the approved version', () => {
    expect(signedCoverage(links, 'c1', [run()], SNAP)).toEqual({ tests: ['npm run test:integration'], verified: true, failed: false });
  });
  it('does nothing without a link, for another criterion, or with no run', () => {
    expect(signedCoverage(undefined, 'c1', [run()], SNAP)).toMatchObject({ verified: false, failed: false });
    expect(signedCoverage(links, 'c2', [run()], SNAP)).toMatchObject({ verified: false, failed: false });
    expect(signedCoverage(links, 'c1', [], SNAP)).toMatchObject({ verified: false, failed: false });
  });
  it('ignores runs of another version, another kind of run, or an unresolved version', () => {
    expect(signedCoverage(links, 'c1', [run({ snapshotCommit: 'b'.repeat(40) })], SNAP).verified).toBe(false);
    expect(signedCoverage(links, 'c1', [run({ kind: 'NEW_VERIFICATION' })], SNAP).verified).toBe(false);
    expect(signedCoverage(links, 'c1', [run({ snapshotCommit: '' })], '').verified).toBe(false);
  });
  it('uses the latest run: a later failure fails the criterion, a later pass recovers it', () => {
    const early = run({ createdAt: new Date('2026-11-03T09:00:00Z') });
    expect(signedCoverage(links, 'c1', [early, run({ status: 'FAILED' })], SNAP)).toMatchObject({ verified: false, failed: true });
    expect(signedCoverage(links, 'c1', [run({ status: 'FAILED', createdAt: new Date('2026-11-03T08:00:00Z') }), early], SNAP)).toMatchObject({ verified: true, failed: false });
  });
  it('needs every linked test to pass', () => {
    const two = [...links, { command: 'npm run test:other', criterionId: 'c1' }];
    expect(signedCoverage(two, 'c1', [run()], SNAP).verified).toBe(false);
    expect(signedCoverage(two, 'c1', [run(), run({ command: 'npm run test:other' })], SNAP).verified).toBe(true);
  });
});
