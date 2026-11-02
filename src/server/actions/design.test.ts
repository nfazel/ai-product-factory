import {beforeEach,describe,it,expect,vi} from 'vitest';
import {DomainError} from '@/modules/shared/errors';
const mock=vi.hoisted(()=>({headers:vi.fn(),create:vi.fn(),revise:vi.fn(),approve:vi.fn(),state:vi.fn(),brief:vi.fn()}));
vi.mock('next/headers',()=>({headers:mock.headers}));
vi.mock('@/modules/design/service',()=>({createDesign:mock.create,reviseDesign:mock.revise,approveDesign:mock.approve,getDesignState:mock.state}));
vi.mock('@/modules/discovery/repository',()=>({findCurrentBrief:mock.brief}));
import {designAction} from './design';
import {designStateFrom} from '@/modules/design/state';
import {sampleDesign} from '@/modules/design/test-fixtures';
const withDesign=()=>designStateFrom([{id:'run-1',createdAt:'2026-11-02T10:00:00Z',input:{},output:{design:sampleDesign()}}],[]);
function form(operation:string,extra:Record<string,string>={},productId='cmv0tsipq0003aappiumgzxgn'){const value=new FormData();value.set('productId',productId);value.set('operation',operation);for(const[k,v]of Object.entries(extra))value.set(k,v);return value}
beforeEach(()=>{vi.resetAllMocks();mock.headers.mockResolvedValue(new Headers({origin:'http://127.0.0.1:4317',host:'127.0.0.1:4317'}));mock.state.mockResolvedValue(withDesign());mock.brief.mockResolvedValue({constraints:[{text:'Target platforms: Website'}]});mock.create.mockResolvedValue(withDesign());mock.revise.mockResolvedValue(withDesign());mock.approve.mockResolvedValue(withDesign())});
describe('design server transport',()=>{
 it('loads the design with the chosen platforms in words',async()=>{const result=await designAction(form('LOAD'));expect(result.status).toBe('success');expect(result.design!.platforms).toBe('Website');expect(result.design!.current!.screens).toHaveLength(2);expect(mock.create).not.toHaveBeenCalled()});
 it('drafts a design and says nothing has been built',async()=>{const result=await designAction(form('GENERATE'));expect(mock.create).toHaveBeenCalledWith('cmv0tsipq0003aappiumgzxgn');expect(result.message).toContain('Nothing has been built')});
 it('revises the version the person was looking at, with their own words',async()=>{await designAction(form('REVISE',{runId:'run-1',instructions:'Bigger buttons'}));expect(mock.revise).toHaveBeenCalledWith({productId:'cmv0tsipq0003aappiumgzxgn',previousRunId:'run-1',instructions:'Bigger buttons'})});
 it('only approves after the person says they looked at every screen',async()=>{const refused=await designAction(form('APPROVE',{runId:'run-1',digest:'d'.repeat(64)}));expect(refused.status).toBe('error');expect(mock.approve).not.toHaveBeenCalled();const ok=await designAction(form('APPROVE',{runId:'run-1',digest:'d'.repeat(64),reviewed:'yes'}));expect(ok.status).toBe('success');expect(mock.approve).toHaveBeenCalledWith({productId:'cmv0tsipq0003aappiumgzxgn',runId:'run-1',digest:'d'.repeat(64)});expect(ok.message).toContain('no code has been written')});
 it.each(['../../etc','a/b','short','',' '])('refuses an unsafe product id %j before touching anything',async id=>{const result=await designAction(form('LOAD',{},id));expect(result.status).toBe('error');expect(mock.state).not.toHaveBeenCalled()});
 it('rejects cross-origin requests and unknown actions',async()=>{mock.headers.mockResolvedValue(new Headers({origin:'http://evil.example',host:'127.0.0.1:4317'}));expect((await designAction(form('GENERATE'))).status).toBe('error');expect(mock.create).not.toHaveBeenCalled();mock.headers.mockResolvedValue(new Headers({origin:'http://127.0.0.1:4317',host:'127.0.0.1:4317'}));expect((await designAction(form('DELETE_EVERYTHING'))).status).toBe('error')});
 it('shows plain service errors and hides unexpected ones',async()=>{mock.approve.mockRejectedValueOnce(new DomainError('The design changed; review the latest version.'));expect((await designAction(form('APPROVE',{runId:'x',digest:'d'.repeat(64),reviewed:'yes'}))).message).toBe('The design changed; review the latest version.');mock.create.mockRejectedValueOnce(new Error('ECONNREFUSED 10.0.0.5 password=hunter2'));const result=await designAction(form('GENERATE'));expect(JSON.stringify(result)).not.toContain('hunter2');expect(JSON.stringify(result)).not.toContain('10.0.0.5')});
});
