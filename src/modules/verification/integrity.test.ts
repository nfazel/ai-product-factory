import { describe, expect, it } from "vitest";

import {
  verificationApprovalIsCurrent,
  verificationEvidenceFingerprint,
  withCurrentVerificationApprovals,
} from "@/modules/verification/integrity";

const session = {
  commitSha: "a".repeat(40),
  stale: false,
  executions: [{ id: "execution-1", exitCode: 0, status: "PASSED" }],
  coverages: [{ acceptanceCriterionId: "criterion-1", status: "VERIFIED" }],
};

function approval(overrides: Partial<{
  stale: boolean;
  commitSha: string;
  evidenceFingerprint: string;
  approval: { status: string };
}> = {}) {
  return {
    stale: false,
    commitSha: session.commitSha,
    evidenceFingerprint: verificationEvidenceFingerprint(session),
    approval: { status: "APPROVED" },
    ...overrides,
  };
}

describe("verification approval integrity", () => {
  it("preserves the stored execution and coverage fingerprint format", () => {
    expect(verificationEvidenceFingerprint(session)).toBe(
      verificationEvidenceFingerprint({
        ...session,
        executions: [...session.executions].reverse(),
        coverages: [...session.coverages].reverse(),
      }),
    );
  });

  it("retains legacy history without granting new runtime authority", () => {
    expect(verificationApprovalIsCurrent(approval(), session)).toBe(false);
    expect(verificationApprovalIsCurrent(approval({ evidenceFingerprint: "different" }), session)).toBe(false);
    expect(verificationApprovalIsCurrent(approval({ commitSha: "b".repeat(40) }), session)).toBe(false);
    expect(verificationApprovalIsCurrent(approval({ stale: true }), session)).toBe(false);
  });

  it("exposes a fingerprint mismatch as a stale approval to consumers", () => {
    const current = withCurrentVerificationApprovals({
      ...session,
      approvals: [approval({ evidenceFingerprint: "different" })],
    });
    expect(current.approvals[0]?.stale).toBe(true);
  });
});
describe('versioned bound verification evidence',()=>{
  function boundSession(){return {...session,productId:'p',implementationTaskId:'t',repositoryWorkspaceId:'w',runState:{runtimeBinding:{kind:'VERIFICATION_RUNTIME_BINDING',version:1,approvalId:'runtime',evidenceId:'human-evidence',digest:'d'.repeat(64),manifest:{kind:'VERIFICATION_RUNTIME_MANIFEST',version:1,productId:'p',taskId:'t',workspaceId:'w',commitSha:session.commitSha}}},testCases:[{id:'case',body:'assert actual value',adapterId:'http-blackbox',filePath:'verification/http/case.test.mjs'}],executions:[{...session.executions[0],command:'node --test verification/http/case.test.mjs',snapshotCommit:session.commitSha,observations:[{method:'GET',path:'/claims',status:200}]}],evidence:[{id:'e',result:'DEMONSTRATED',artifactReference:'sha256:body'}],conditions:[{id:'condition',description:'Expected behaviour'}],nfrResults:[{id:'nfr',status:'PASSED'}],defectLinks:[],escalations:[]}}
  it('retains legacy history but never accepts a legacy fingerprint for a bound session',()=>{const current=boundSession();expect(verificationEvidenceFingerprint(current)).toMatch(/^v2:[a-f0-9]{64}$/);expect(verificationApprovalIsCurrent(approval(),current)).toBe(false)});
  it.each(['body','adapter','command','snapshot','observations','coverage','manual','nfr','binding','criterion','condition'] as const)('invalidates human approval after %s changes with unchanged pass statuses',change=>{
    const before=boundSession(),after=structuredClone(before),old=approval({evidenceFingerprint:verificationEvidenceFingerprint(before)});
    if(change==='body')after.testCases[0].body='weaker assertion';if(change==='adapter')after.testCases[0].adapterId='other';if(change==='command')after.executions[0].command='npm test';if(change==='snapshot')after.executions[0].snapshotCommit='b'.repeat(40);if(change==='observations')after.executions[0].observations[0].path='/unrelated';if(change==='coverage')after.coverages[0].acceptanceCriterionId='other';if(change==='manual')after.evidence[0].result='edited';if(change==='nfr')after.nfrResults[0].id='different';if(change==='binding')after.runState.runtimeBinding.digest='e'.repeat(64);if(change==='criterion')after.implementationTaskId='foreign';if(change==='condition')after.conditions[0].description='weaker condition';
    expect(verificationApprovalIsCurrent(old,before)).toBe(true);expect(verificationApprovalIsCurrent(old,after)).toBe(false);
  });
  it('ignores ORM-only criterion joins without losing coverage content',()=>{const current=boundSession();const joined={...current,coverages:current.coverages.map(c=>({...c,criterion:{description:'display only'}}))};expect(verificationEvidenceFingerprint(joined)).toBe(verificationEvidenceFingerprint(current))});
});
