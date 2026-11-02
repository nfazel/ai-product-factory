import {describe,it,expect} from 'vitest';
import {designView} from './presentation';
import {approvalComment,designDigest,designStateFrom} from './state';
import {sampleDesign} from './test-fixtures';
const run=(id:string,at:string,design:unknown,instructions?:string)=>({id,createdAt:at,input:instructions?{instructions}:{},output:{design}});
describe('design view for the browser',()=>{
 it('is empty before any design',()=>expect(designView(designStateFrom([],[]),'not chosen yet')).toMatchObject({status:'NONE',current:null,history:[],platforms:'not chosen yet'}));
 it('wraps each screen in the locked-down document and never sends raw html',()=>{const view=designView(designStateFrom([run('a','2026-11-02T10:00:00Z',sampleDesign())],[]),'Website');const screen=view.current!.screens[0];expect(screen.doc).toContain('Content-Security-Policy');expect(screen.doc).toContain('Create account');expect('html' in screen).toBe(false)});
 it('lists history newest first with what the person asked for',()=>{const d1=sampleDesign(),d2=sampleDesign({changeNote:'Bigger buttons.'});const view=designView(designStateFrom([run('a','2026-11-02T10:00:00Z',d1),run('b','2026-11-02T11:00:00Z',d2,'bigger buttons')],[{status:'APPROVED',comments:approvalComment('a',designDigest(d1))}]),'Website');expect(view.history.map(h=>[h.version,h.approved,h.instructions])).toEqual([[2,false,'bigger buttons'],[1,true,'']]);expect(view.status).toBe('DRAFT')});
});
