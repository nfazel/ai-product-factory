import { beforeEach, describe, it, expect, vi } from 'vitest';
vi.mock('@/lib/db', () => ({ db: { verificationSession: { findFirst: vi.fn() }, verificationEvidence: { create: vi.fn() } } }));
vi.mock('@/modules/activity/service', () => ({ recordActivity: vi.fn() }));
vi.mock('./context', () => ({ currentContainerContext: vi.fn() }));
vi.mock('../runtime-review',()=>({assertSessionRuntimeBinding:vi.fn(async()=>({}))}));
import {assertSessionRuntimeBinding} from '../runtime-review';
import { db } from '@/lib/db';
import { currentContainerContext } from './context';
import { executeVerificationTool } from '../tools';
const slot = {sessionId:'session',productId:'product',workspacePath:'/approved-workspace'};
const run = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.verificationSession.findFirst).mockResolvedValue({ stale:false, staleReason:'', approvals:[], executions:[], coverages:[] } as never);
  vi.mocked(currentContainerContext).mockReturnValue({root:slot.workspacePath,run} as unknown as ReturnType<typeof currentContainerContext>);
});
describe('verification command dispatch', () => {
  it('rejects a revoked runtime approval before executing a command',async()=>{vi.mocked(assertSessionRuntimeBinding).mockRejectedValueOnce(new Error('Runtime approval revoked'));const result=await executeVerificationTool(slot,{action:'RUN_COMMAND',command:'npm test'});expect(result.allowed).toBe(false);expect(run).not.toHaveBeenCalled()});
  it('executes only the policy-approved command through the matching context and records actual exit status', async () => {
    run.mockResolvedValue({code:0,output:'safe result',timedOut:false});
    const result = await executeVerificationTool(slot,{action:'RUN_COMMAND',command:'npm test'});
    expect(run).toHaveBeenCalledWith('npm test'); expect(result.exitCode).toBe(0);
    expect(db.verificationEvidence.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({result:'EXECUTED',exitCode:0})}));
  });
  it('refuses missing context, wrong workspace and caller environment without invoking a native command', async () => {
    vi.mocked(currentContainerContext).mockReturnValue(undefined);
    expect((await executeVerificationTool(slot,{action:'RUN_COMMAND',command:'npm test'})).allowed).toBe(false);
    vi.mocked(currentContainerContext).mockReturnValue({root:slot.workspacePath,run} as unknown as ReturnType<typeof currentContainerContext>);
    expect((await executeVerificationTool({...slot,workspacePath:'/foreign'},{action:'RUN_COMMAND',command:'npm test'})).allowed).toBe(false);
    expect((await executeVerificationTool(slot,{action:'RUN_COMMAND',command:'npm test',environment:{DATABASE_URL:'forbidden'}})).allowed).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });
  it('retains stale-session and command-policy denials ahead of dispatch', async () => {
    vi.mocked(db.verificationSession.findFirst).mockResolvedValue({stale:true,staleReason:'review expired',approvals:[],executions:[],coverages:[]} as never);
    expect((await executeVerificationTool(slot,{action:'RUN_COMMAND',command:'npm test'})).reason).toMatch(/review expired/);
    vi.mocked(db.verificationSession.findFirst).mockResolvedValue({stale:false,approvals:[],executions:[],coverages:[]} as never);
    expect((await executeVerificationTool(slot,{action:'RUN_COMMAND',command:'npm test; curl evil'})).allowed).toBe(false); expect(run).not.toHaveBeenCalled();
  });
  it('records timeouts and controller errors as unavailable evidence without exposing exception secrets', async () => {
    run.mockResolvedValue({code:null,output:'time limit exceeded',timedOut:true});
    expect((await executeVerificationTool(slot,{action:'RUN_COMMAND',command:'npm test'})).timedOut).toBe(true);
    run.mockRejectedValue(new Error('PRIVATE_RUNTIME_PASSWORD'));
    const failed = await executeVerificationTool(slot,{action:'RUN_COMMAND',command:'npm test'});
    expect(failed.allowed).toBe(false);expect(failed.output).not.toContain('PRIVATE_RUNTIME_PASSWORD');
    expect(db.verificationEvidence.create).toHaveBeenLastCalledWith(expect.objectContaining({data:expect.objectContaining({result:'UNAVAILABLE',exitCode:null})}));
  });
});
