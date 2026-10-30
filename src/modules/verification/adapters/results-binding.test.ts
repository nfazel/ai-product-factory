import {describe,expect,it,vi} from 'vitest';
vi.mock('@/lib/db',()=>({db:{verificationExecution:{create:vi.fn(async()=>({id:'execution'}))},verificationEvidence:{create:vi.fn(async()=>({id:'evidence'}))}}}));
import {db} from '@/lib/db';
import {hashText} from '@/modules/coding/policy';
import {persistTestResult} from './results';
describe('independent execution content evidence',()=>{
 it('records the executed case hash alongside its adapter, snapshot and observations',async()=>{
  const body='assert.equal(actual.reference,"CLM-1")';
  await persistTestResult({sessionId:'s',testCaseId:'case',acceptanceCriterionId:'criterion',adapterId:'http-blackbox',command:'node --test verification/http/case.test.mjs',exitCode:0,output:'passed',outcome:{category:'PASSED',status:'PASSED',reason:'Passed',counts:{tests:1,passed:1,failed:0,skipped:0,reported:true}},snapshotCommit:'a'.repeat(40),startedAt:new Date(),evidenceDescription:'Observed criterion',evidenceResult:'DEMONSTRATED',testBody:body,observations:[]});
  expect(db.verificationEvidence.create).toHaveBeenCalledWith({data:expect.objectContaining({executionId:'execution',testCaseId:'case',artifactReference:`sha256:${hashText(body)}`,adapterId:'http-blackbox',snapshotCommit:'a'.repeat(40)})});
 });
});
