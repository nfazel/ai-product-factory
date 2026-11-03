import {beforeEach,describe,it,expect,vi} from 'vitest';
import {DomainError} from '@/modules/shared/errors';
const mock=vi.hoisted(()=>({resolve:vi.fn((value:string)=>value),headers:vi.fn(),draft:vi.fn(),decide:vi.fn(),activate:vi.fn(),authorise:vi.fn(),approveTask:vi.fn(),amendmentRow:vi.fn(),read:vi.fn(),find:vi.fn(),available:vi.fn(),confirm:vi.fn()}));
vi.mock('next/headers',()=>({headers:mock.headers}));
vi.mock('@/modules/rework/service',()=>({draftReworkAmendment:mock.draft,decideReworkAmendment:mock.decide,activateReworkAmendment:mock.activate,readReworkForScope:mock.read,authoriseReworkTaskExecution:mock.authorise}));
vi.mock('@/modules/coding/service',()=>({approveImplementationTask:mock.approveTask}));
vi.mock('@/lib/db',()=>({db:{reworkAmendment:{findFirst:mock.amendmentRow}}}));
vi.mock('@/modules/development-scope',()=>({findDevelopmentScopeId:mock.find}));
vi.mock('@/modules/feature-review/authorization',()=>({operatorConfirmationAvailable:mock.available,confirmLocalOperator:mock.confirm,resolveOperatorCredential:mock.resolve}));
import {reworkAction} from './rework';
const D='d'.repeat(64);
const view=(amendment:unknown=null,eligibility:Record<string,unknown>={})=>({eligibility:{ok:true,reasons:[],planId:'plan-1',scopeRevisionId:'rev-1',...eligibility},amendment});
const amendment=(state:string)=>({id:'amend-1',digest:D,state,message:'',tasks:[],created:[]});
function form(operation:string,extra:Record<string,string>={}){const value=new FormData();for(const[k,v]of Object.entries({productId:'p',featureId:'f',feedbackId:'thread',operation,credential:'synthetic-credential',idempotencyKey:'request-12345',digest:D,...extra}))value.set(k,v);return value}
beforeEach(()=>{vi.resetAllMocks();mock.resolve.mockImplementation((value:string)=>value);mock.headers.mockResolvedValue(new Headers({origin:'http://localhost:4317',host:'localhost:4317'}));mock.available.mockReturnValue(true);mock.confirm.mockReturnValue({});mock.find.mockResolvedValue('scope-1');mock.read.mockResolvedValue(view());mock.draft.mockResolvedValue({});mock.decide.mockResolvedValue({});mock.activate.mockResolvedValue({})});
describe('rework server transport',()=>{
 it('loads without a credential, and reports no scope as none',async()=>{expect((await reworkAction(form('LOAD',{credential:''}))).status).toBe('success');expect(mock.confirm).not.toHaveBeenCalled();mock.find.mockResolvedValue(null);expect((await reworkAction(form('LOAD'))).rework).toBeNull()});
 it('drafts for the scope revision and plan the server found, not browser-supplied ones',async()=>{await reworkAction(form('DRAFT',{scopeRevisionId:'forged',planId:'forged'}));expect(mock.draft).toHaveBeenCalledWith(expect.objectContaining({scopeId:'scope-1',scopeRevisionId:'rev-1',planId:'plan-1'}))});
 it('refuses to draft when the scope is not eligible, with the reason in words',async()=>{mock.read.mockResolvedValue(view(null,{ok:false,reasons:['The scope adds new acceptance criteria.']}));const result=await reworkAction(form('DRAFT'));expect(result.message).toBe('The scope adds new acceptance criteria.');expect(mock.draft).not.toHaveBeenCalled()});
 it('does not draft twice over live tasks',async()=>{mock.read.mockResolvedValue(view(amendment('DRAFTED')));expect((await reworkAction(form('DRAFT'))).status).toBe('error');expect(mock.draft).not.toHaveBeenCalled()});
 it('allows drafting again after a rejection',async()=>{mock.read.mockResolvedValue(view(amendment('REJECTED')));expect((await reworkAction(form('DRAFT'))).status).toBe('success')});
 it.each(['DRAFT','APPROVE','REJECT','ACTIVATE'])('rejects %s with a wrong credential before any write',async operation=>{mock.confirm.mockImplementation(()=>{throw new Error('internal key detail')});mock.read.mockResolvedValue(view(amendment('DRAFTED')));const result=await reworkAction(form(operation,{unchangedAck:'yes',impactAck:'yes'}));expect(result.message).toContain('Local operator confirmation was not accepted');expect(result.message).not.toContain('internal key');for(const write of [mock.draft,mock.decide,mock.activate])expect(write).not.toHaveBeenCalled()});
 it('approves only with the unchanged-requirements acknowledgement and the reviewed digest',async()=>{mock.read.mockResolvedValue(view(amendment('DRAFTED')));expect((await reworkAction(form('APPROVE'))).status).toBe('error');expect(mock.decide).not.toHaveBeenCalled();const ok=await reworkAction(form('APPROVE',{unchangedAck:'yes'}));expect(ok.status).toBe('success');expect(mock.decide).toHaveBeenCalledWith(expect.objectContaining({decision:'APPROVED',requirementsUnchanged:true,reviewedDigest:D,amendmentId:'amend-1'}));mock.decide.mockClear();expect((await reworkAction(form('APPROVE',{unchangedAck:'yes',digest:'e'.repeat(64)}))).status).toBe('error');expect(mock.decide).not.toHaveBeenCalled()});
 it('rejects without needing the acknowledgement',async()=>{mock.read.mockResolvedValue(view(amendment('DRAFTED')));await reworkAction(form('REJECT'));expect(mock.decide).toHaveBeenCalledWith(expect.objectContaining({decision:'REJECTED'}))});
 it('creates tasks only with the re-verification acknowledgement, and says coding has not started',async()=>{mock.read.mockResolvedValue(view(amendment('APPROVED')));expect((await reworkAction(form('ACTIVATE'))).status).toBe('error');expect(mock.activate).not.toHaveBeenCalled();const ok=await reworkAction(form('ACTIVATE',{impactAck:'yes'}));expect(ok.message).toContain('Coding has not started');expect(mock.activate).toHaveBeenCalledWith(expect.objectContaining({acknowledgeAcceptanceImpact:true,reviewedDigest:D}))});
 it('uses the server-held credential when operator confirmation is off and still enforces origin',async()=>{mock.resolve.mockReturnValue('server-held-key');mock.read.mockResolvedValue(view(amendment('DRAFTED')));await reworkAction(form('REJECT',{credential:''}));expect(mock.confirm).toHaveBeenCalledWith('server-held-key');expect(mock.decide).toHaveBeenCalledWith(expect.objectContaining({credential:'server-held-key'}));mock.decide.mockClear();mock.headers.mockResolvedValue(new Headers({origin:'http://evil.example',host:'localhost:4317'}));expect((await reworkAction(form('REJECT',{credential:''}))).status).toBe('error');expect(mock.decide).not.toHaveBeenCalled()});
 it('shows plain service errors and hides unexpected ones, never echoing the credential',async()=>{mock.read.mockResolvedValue(view(amendment('DRAFTED')));mock.decide.mockRejectedValueOnce(new DomainError('Amendment content changed.'));expect((await reworkAction(form('REJECT'))).message).toBe('Amendment content changed.');mock.decide.mockRejectedValueOnce(new Error('db password=hunter2 synthetic-credential'));const result=await reworkAction(form('REJECT'));expect(JSON.stringify(result)).not.toContain('hunter2');expect(JSON.stringify(result)).not.toContain('synthetic-credential')});
 it('rejects a malformed request key',async()=>{expect((await reworkAction(form('REJECT',{idempotencyKey:'x'}))).status).toBe('error');expect(mock.decide).not.toHaveBeenCalled()});
 describe('authorising a created task for coding',()=>{
  const made=(over:Record<string,unknown>={})=>({...amendment('ACTIVATED'),created:[{id:'task-1',ref:'TSK-008',title:'Fix ordering',status:'PROPOSED',coding:'NOT_AUTHORISED',reviewedDigest:D,...over}]});
  const ask=(extra:Record<string,string>={})=>reworkAction(form('AUTHORISE_TASK',{taskId:'task-1',reviewedDigest:D,authoriseAck:'yes',...extra}));
  beforeEach(()=>{mock.read.mockResolvedValue(view(made()));mock.amendmentRow.mockResolvedValue({id:'amend-1',scopeRevisionId:'rev-1'})});
  it('records the coding decision, then the execution authority, using the amendment and revision the server found',async()=>{
   const result=await ask({amendmentId:'forged',scopeRevisionId:'forged'});
   expect(result.status).toBe('success');expect(result.message).toContain('built in Build');
   expect(mock.approveTask).toHaveBeenCalledWith('p','task-1',{reworkApproval:expect.objectContaining({amendmentId:'amend-1',scopeRevisionId:'rev-1',reviewedDigest:D,idempotencyKey:'request-12345:coding'})});
   expect(mock.authorise).toHaveBeenCalledWith(expect.objectContaining({productId:'p',taskId:'task-1',amendmentId:'amend-1',scopeRevisionId:'rev-1',idempotencyKey:'request-12345:execution'}));
   expect(mock.approveTask.mock.invocationCallOrder[0]).toBeLessThan(mock.authorise.mock.invocationCallOrder[0]);
  });
  it('needs the acknowledgement, a task the server lists as authorisable, and the digest the person reviewed',async()=>{
   expect((await ask({authoriseAck:'no'})).status).toBe('error');
   expect((await ask({taskId:'other-task'})).status).toBe('error');
   expect((await ask({reviewedDigest:'0'.repeat(64)})).message).toContain('changed');
   mock.read.mockResolvedValue(view(made({coding:'AUTHORISED',reviewedDigest:null})));expect((await ask()).status).toBe('error');
   expect(mock.approveTask).not.toHaveBeenCalled();expect(mock.authorise).not.toHaveBeenCalled();
  });
  it('rejects a wrong credential before any write',async()=>{mock.confirm.mockImplementation(()=>{throw new Error('internal key detail')});const result=await ask();expect(result.status).toBe('error');expect(result.message).not.toContain('internal key detail');expect(mock.approveTask).not.toHaveBeenCalled()});
  it('shows plain service errors and records nothing further when the first step fails',async()=>{mock.approveTask.mockRejectedValueOnce(new DomainError('Reviewed task, scope, amendment or context changed.'));const result=await ask();expect(result.message).toBe('Reviewed task, scope, amendment or context changed.');expect(mock.authorise).not.toHaveBeenCalled()});
 });
});
