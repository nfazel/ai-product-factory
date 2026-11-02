import {beforeEach,describe,it,expect,vi} from 'vitest';
import {DomainError} from '@/modules/shared/errors';
const mock=vi.hoisted(()=>({headers:vi.fn(),status:vi.fn(),start:vi.fn(),stop:vi.fn()}));
vi.mock('next/headers',()=>({headers:mock.headers}));
vi.mock('@/modules/preview/service',()=>({getPreviewStatus:mock.status,startPreview:mock.start,stopPreview:mock.stop}));
import {previewAction} from './preview';
const view={state:'RUNNING',url:'http://127.0.0.1:4401',port:4401,commit:'a'.repeat(40),commitSubject:null,branch:'main',startedAt:'now',pages:[]};
function form(operation:string,productId='cmv0tsipq0003aappiumgzxgn'){const value=new FormData();value.set('productId',productId);value.set('operation',operation);return value}
beforeEach(()=>{vi.resetAllMocks();mock.headers.mockResolvedValue(new Headers({origin:'http://127.0.0.1:4317',host:'127.0.0.1:4317'}));mock.status.mockResolvedValue(view);mock.start.mockResolvedValue(view);mock.stop.mockResolvedValue({...view,state:'STOPPED',url:null})});
describe('preview server transport',()=>{
 it('reports status without starting anything',async()=>{const result=await previewAction(form('STATUS'));expect(result.preview?.state).toBe('RUNNING');expect(mock.start).not.toHaveBeenCalled()});
 it('starts and stops, telling the user the data is throwaway',async()=>{expect((await previewAction(form('START'))).message).toContain('thrown away');expect(mock.start).toHaveBeenCalledWith('cmv0tsipq0003aappiumgzxgn');expect((await previewAction(form('STOP'))).message).toContain('removed')});
 it.each(['../../etc','a/b','short','',' '])('refuses an unsafe product id %j before touching anything',async id=>{const result=await previewAction(form('START',id));expect(result.status).toBe('error');for(const fn of [mock.status,mock.start,mock.stop])expect(fn).not.toHaveBeenCalled()});
 it('rejects cross-origin requests',async()=>{mock.headers.mockResolvedValue(new Headers({origin:'http://evil.example',host:'127.0.0.1:4317'}));expect((await previewAction(form('START'))).status).toBe('error');expect(mock.start).not.toHaveBeenCalled()});
 it('rejects an unknown action',async()=>{expect((await previewAction(form('RUN_ANYTHING'))).status).toBe('error');expect(mock.start).not.toHaveBeenCalled()});
 it('shows plain service errors and hides unexpected ones',async()=>{mock.start.mockRejectedValueOnce(new DomainError('Preview currently supports Next.js products only.'));expect((await previewAction(form('START'))).message).toBe('Preview currently supports Next.js products only.');mock.start.mockRejectedValueOnce(new Error('ENOENT /Users/secret/path password=hunter2'));const result=await previewAction(form('START'));expect(JSON.stringify(result)).not.toContain('hunter2');expect(JSON.stringify(result)).not.toContain('/Users/secret')});
});
