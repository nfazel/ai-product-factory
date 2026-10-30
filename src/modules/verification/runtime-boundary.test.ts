import {beforeEach,describe,expect,it,vi} from 'vitest';
vi.mock('@/lib/db',()=>({db:{verificationSession:{findUnique:vi.fn(),findFirst:vi.fn()},verificationCoverage:{update:vi.fn()},approval:{create:vi.fn()}}}));
vi.mock('./runtime-review',()=>({assertSessionRuntimeBinding:vi.fn(),requireRuntimeReview:vi.fn()}));
import {db} from '@/lib/db';
import {assertSessionRuntimeBinding} from './runtime-review';
import {recomputeSession} from './assess';
import {approveVerification} from './service';
beforeEach(()=>{vi.clearAllMocks();vi.mocked(assertSessionRuntimeBinding).mockRejectedValue(new Error('Signed runtime authority is not current'));const row={id:'s',productId:'p',commitSha:'a'.repeat(40),approvals:[],executions:[],coverages:[],stale:false,runState:{},overallVerdict:'PASS'};vi.mocked(db.verificationSession.findUnique).mockResolvedValue(row as never);vi.mocked(db.verificationSession.findFirst).mockResolvedValue(row as never)});
describe('independent verification runtime authority boundaries',()=>{
 it('refuses assessment before mutating coverage when approval is unavailable',async()=>{await expect(recomputeSession('s')).rejects.toThrow(/authority/);expect(db.verificationCoverage.update).not.toHaveBeenCalled()});
 it('refuses final human approval despite a stored PASS when runtime authority is unavailable',async()=>{await expect(approveVerification('p','s',{actorName:'Test human'})).rejects.toThrow(/authority/);expect(db.approval.create).not.toHaveBeenCalled()});
});
