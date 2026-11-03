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

import { criterionStatus, type SignedCoverage } from './signed-coverage';
describe('criterion status with a person\'s signed test', () => {
  const none: SignedCoverage = { tests: [], verified: false, failed: false };
  const passed: SignedCoverage = { tests: ['npm run test:chat'], verified: true, failed: false };
  const failed: SignedCoverage = { tests: ['npm run test:chat'], verified: false, failed: true };
  const base = { independentFailed: false, independentOrManualVerified: false, humanConfirmedNotApplicable: false, blocked: false };
  it('keeps today\'s rules when there is no signed test', () => {
    expect(criterionStatus({ ...base, signed: none, independentFailed: true })).toEqual({ status: 'FAILED', contradicted: false });
    expect(criterionStatus({ ...base, signed: none, independentOrManualVerified: true })).toEqual({ status: 'VERIFIED', contradicted: false });
    expect(criterionStatus({ ...base, signed: none, humanConfirmedNotApplicable: true }).status).toBe('NOT_APPLICABLE');
    expect(criterionStatus({ ...base, signed: none, blocked: true }).status).toBe('BLOCKED');
    expect(criterionStatus({ ...base, signed: none }).status).toBe('NOT_TESTED');
  });
  it('verifies on a passing signed test alone', () => {
    expect(criterionStatus({ ...base, signed: passed })).toEqual({ status: 'VERIFIED', contradicted: false });
  });
  it('lets a passing signed test outrank a failing AI-written test, and says so', () => {
    expect(criterionStatus({ ...base, signed: passed, independentFailed: true })).toEqual({ status: 'VERIFIED', contradicted: true });
  });
  it('always fails the criterion when the signed test itself fails, whatever else passed', () => {
    expect(criterionStatus({ ...base, signed: failed, independentOrManualVerified: true })).toEqual({ status: 'FAILED', contradicted: false });
    expect(criterionStatus({ ...base, signed: failed, independentFailed: true }).status).toBe('FAILED');
  });
  it('never turns a missing run of the signed test into a pass', () => {
    expect(criterionStatus({ ...base, signed: { tests: ['npm run test:chat'], verified: false, failed: false }, independentFailed: true }).status).toBe('FAILED');
  });
});
