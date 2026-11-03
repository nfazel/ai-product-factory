import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({work:vi.fn()}));
vi.mock('@/lib/db',()=>({db:{workItem:{findMany:mock.work}}}));
vi.mock('./service',()=>({getFeatureReview:vi.fn()}));
import {guidanceFeatureAcceptance} from './release';
import {forgetGuidanceFeatureAcceptance,recentAcceptance} from './acceptance-cache';
const tasks=[{id:'t1',workItemId:'w1'}];
beforeEach(()=>{vi.useFakeTimers();mock.work.mockReset();recentAcceptance.clear()});
afterEach(()=>vi.useRealTimers());
describe('on-screen feature acceptance memory',()=>{
 it('shares one run between requests made close together',async()=>{mock.work.mockResolvedValue([]);await Promise.all([guidanceFeatureAcceptance('p',tasks),guidanceFeatureAcceptance('p',tasks)]);await guidanceFeatureAcceptance('p',tasks);expect(mock.work).toHaveBeenCalledTimes(1)});
 it('keeps products and task sets apart',async()=>{mock.work.mockResolvedValue([]);await guidanceFeatureAcceptance('p',tasks);await guidanceFeatureAcceptance('q',tasks);await guidanceFeatureAcceptance('p',[{id:'t2',workItemId:'w2'}]);expect(mock.work).toHaveBeenCalledTimes(3)});
 it('shows an older answer at once and refreshes it in the background',async()=>{
  mock.work.mockResolvedValueOnce([]);await guidanceFeatureAcceptance('p',tasks);
  vi.advanceTimersByTime(30_000);let release!:()=>void;mock.work.mockImplementationOnce(()=>new Promise(resolve=>{release=()=>resolve([])}));
  await expect(guidanceFeatureAcceptance('p',tasks)).resolves.toHaveLength(1);expect(mock.work).toHaveBeenCalledTimes(2);
  await guidanceFeatureAcceptance('p',tasks);expect(mock.work).toHaveBeenCalledTimes(2);release();
 });
 it('recomputes once an answer is too old',async()=>{mock.work.mockResolvedValue([]);await guidanceFeatureAcceptance('p',tasks);vi.advanceTimersByTime(3*60_000);await guidanceFeatureAcceptance('p',tasks);expect(mock.work).toHaveBeenCalledTimes(2)});
 it('forgets a product when a feature decision is recorded',async()=>{mock.work.mockResolvedValue([]);await guidanceFeatureAcceptance('p',tasks);await guidanceFeatureAcceptance('q',tasks);forgetGuidanceFeatureAcceptance('p');await guidanceFeatureAcceptance('p',tasks);await guidanceFeatureAcceptance('q',tasks);expect(mock.work).toHaveBeenCalledTimes(3)});
 it('does not remember a failure',async()=>{mock.work.mockRejectedValueOnce(new Error('db down')).mockResolvedValue([]);await expect(guidanceFeatureAcceptance('p',tasks)).rejects.toThrow();await vi.advanceTimersByTimeAsync(0);await expect(guidanceFeatureAcceptance('p',tasks)).resolves.toHaveLength(1);expect(mock.work).toHaveBeenCalledTimes(2)});
});
