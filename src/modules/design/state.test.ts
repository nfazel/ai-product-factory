import {describe,it,expect} from 'vitest';
import {approvalComment,designDigest,designStateFrom} from './state';
import {sampleDesign} from './test-fixtures';
const run=(id:string,at:string,design:unknown,instructions?:string)=>({id,createdAt:at,input:instructions?{instructions}:{},output:{design}});
describe('design versions and approval',()=>{
 it('has no design before the first run',()=>expect(designStateFrom([],[])).toMatchObject({status:'NONE',current:null,versions:[]}));
 it('numbers versions oldest first and treats the latest as current, draft until approved',()=>{const v2=sampleDesign({changeNote:'Simpler.'});const state=designStateFrom([run('b','2026-11-02T11:00:00Z',v2,'make it simpler'),run('a','2026-11-02T10:00:00Z',sampleDesign())],[]);expect(state.versions.map(v=>[v.runId,v.version])).toEqual([['a',1],['b',2]]);expect(state.current!.runId).toBe('b');expect(state.current!.instructions).toBe('make it simpler');expect(state.status).toBe('DRAFT')});
 it('ignores runs whose output is not a valid design',()=>{const state=designStateFrom([run('bad','2026-11-02T09:00:00Z',{screens:[]}),run('good','2026-11-02T10:00:00Z',sampleDesign())],[]);expect(state.versions).toHaveLength(1);expect(state.current!.runId).toBe('good')});
 it('is approved only by an approval for this exact run and content',()=>{const d=sampleDesign(),digest=designDigest(d);const ok=designStateFrom([run('a','2026-11-02T10:00:00Z',d)],[{status:'APPROVED',comments:approvalComment('a',digest)}]);expect(ok.status).toBe('APPROVED');expect(ok.current!.approved).toBe(true);
  expect(designStateFrom([run('a','2026-11-02T10:00:00Z',d)],[{status:'REJECTED',comments:approvalComment('a',digest)}]).status).toBe('DRAFT');
  expect(designStateFrom([run('a','2026-11-02T10:00:00Z',d)],[{status:'APPROVED',comments:approvalComment('other',digest)}]).status).toBe('DRAFT');
  expect(designStateFrom([run('a','2026-11-02T10:00:00Z',d)],[{status:'APPROVED',comments:approvalComment('a','f'.repeat(64))}]).status).toBe('DRAFT');
  expect(designStateFrom([run('a','2026-11-02T10:00:00Z',d)],[{status:'APPROVED',comments:'approved, trust me'}]).status).toBe('DRAFT')});
 it('makes a newer version a draft again, while keeping the earlier approval in history',()=>{const d1=sampleDesign(),d2=sampleDesign({changeNote:'Bigger buttons.'});const state=designStateFrom([run('a','2026-11-02T10:00:00Z',d1),run('b','2026-11-02T11:00:00Z',d2)],[{status:'APPROVED',comments:approvalComment('a',designDigest(d1))}]);expect(state.status).toBe('DRAFT');expect(state.versions.map(v=>v.approved)).toEqual([true,false])});
 it('digests change when any screen content changes',()=>{const a=sampleDesign(),b=sampleDesign();b.screens[0].elements=[...b.screens[0].elements,'Terms link'];expect(designDigest(a)).not.toBe(designDigest(b));expect(designDigest(a)).toBe(designDigest(sampleDesign()))});
});
