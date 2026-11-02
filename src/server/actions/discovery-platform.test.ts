import {beforeEach,describe,it,expect,vi} from 'vitest';
const mock=vi.hoisted(()=>({set:vi.fn(),refresh:vi.fn(),fail:vi.fn((e:unknown)=>({status:'error',message:e instanceof Error?e.message:'failed'}))}));
vi.mock('@/modules/discovery/service',()=>({approveProductBrief:vi.fn(),continueDiscovery:vi.fn(),editProductBrief:vi.fn(),moveDiscoveryToDefine:vi.fn(),requestDiscoveryReview:vi.fn(),retryDiscovery:vi.fn(),setAssumptionStatus:vi.fn(),setTargetPlatforms:mock.set,startDiscovery:vi.fn()}));
vi.mock('@/server/action-helpers',()=>({actionFailure:mock.fail,formValues:(data:FormData)=>Object.fromEntries(data.entries()),refreshWorkspace:mock.refresh}));
import {targetPlatformAction} from './discovery';
const idle={status:'idle'} as const;
function form(platforms:string[],productId='prod-123'){const data=new FormData();data.set('productId',productId);for(const p of platforms)data.append('platform',p);return data}
beforeEach(()=>{vi.clearAllMocks();mock.set.mockResolvedValue({version:2,section:'constraints'})});
describe('target platform action',()=>{
 it('saves the chosen platforms in a fixed order and says the brief needs approving again',async()=>{const result=await targetPlatformAction(idle,form(['IOS','WEBSITE']));expect(mock.set).toHaveBeenCalledWith({productId:'prod-123',platforms:['WEBSITE','IOS']});expect(result.status).toBe('success');expect(result.message).toContain('Website and iOS app');expect(result.message).toContain('approve again');expect(mock.refresh).toHaveBeenCalledWith('prod-123')});
 it('allows choosing nothing, which clears the choice',async()=>{expect((await targetPlatformAction(idle,form([]))).status).toBe('success');expect(mock.set).toHaveBeenCalledWith({productId:'prod-123',platforms:[]})});
 it.each([['TOASTER'],['website'],['<script>']])('refuses an unknown platform %j and saves nothing',async value=>{const result=await targetPlatformAction(idle,form(['WEBSITE',value]));expect(result.status).toBe('error');expect(mock.set).not.toHaveBeenCalled()});
 it('refuses a missing product',async()=>{const data=new FormData();data.append('platform','WEBSITE');expect((await targetPlatformAction(idle,data)).status).toBe('error');expect(mock.set).not.toHaveBeenCalled()});
 it('shows the service message, such as discovery not started',async()=>{mock.set.mockRejectedValueOnce(new Error('Start product discovery before choosing where people will use the product.'));const result=await targetPlatformAction(idle,form(['WEBSITE']));expect(result.status).toBe('error');expect(result.message).toContain('Start product discovery')});
});
