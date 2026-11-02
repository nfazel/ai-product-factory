import {describe,it,expect} from 'vitest';
import {reworkTasksFor,unchangedIssues} from './tasks-schema';
import type {ScopeManifest} from '@/modules/development-scope/service';
const allowed={workItemIds:['feature-1'],criterionIds:['crit-1'],componentIds:['comp-1'],originalTaskIds:['task-1']};
const task=(over:Record<string,unknown>={})=>({workItemId:'feature-1',title:'Show reason',description:'Add the reason badge',objective:'Cards explain why',guidance:'Reuse the card component',validation:'Render a card and check text',risks:'',filesLikely:'src/cards.tsx',criterionIds:['crit-1'],dependsOn:[],componentIds:[],...over});
describe('rework task references',()=>{
 it('accepts tasks that cite only supplied ids',()=>expect(reworkTasksFor(allowed).safeParse({tasks:[task({componentIds:['comp-1'],dependsOn:['task-1']})]}).success).toBe(true));
 it.each([['workItemId',{workItemId:'other'}],['criterionIds',{criterionIds:['nope']}],['componentIds',{componentIds:['nope']}],['dependsOn',{dependsOn:['nope']}]])('rejects an unknown %s with a repairable issue that lists what is allowed',(field,over)=>{const result=reworkTasksFor(allowed).safeParse({tasks:[task(over)]});expect(result.success).toBe(false);const issue=result.error!.issues[0];expect(issue.path).toEqual(['tasks',0,field]);expect(issue.message).toContain('Use only')});
 it('says to use an empty list when nothing is allowed',()=>{const result=reworkTasksFor({...allowed,componentIds:[]}).safeParse({tasks:[task({componentIds:['x']})]});expect(result.error!.issues[0].message).toContain('empty list')});
 it('still requires at least one task and at least one requirement per task',()=>{expect(reworkTasksFor(allowed).safeParse({tasks:[]}).success).toBe(false);expect(reworkTasksFor(allowed).safeParse({tasks:[task({criterionIds:[]})]}).success).toBe(false)});
});
const scope=(over:Record<string,unknown>={})=>({content:{classification:'ENHANCEMENT',separateFeature:false,requirementsRequiringApproval:[],additionalAcceptanceCriteria:[],unresolvedQuestions:[],...over}}) as unknown as ScopeManifest;
describe('unchangedIssues',()=>{
 it('is empty for a fix or enhancement that keeps requirements unchanged',()=>{expect(unchangedIssues(scope())).toEqual([]);expect(unchangedIssues(scope({classification:'DEFECT'}))).toEqual([])});
 it.each([[{classification:'NEW_FEATURE'},'new feature'],[{classification:'REQUIREMENT_CHANGE'},'requirement change'],[{separateFeature:true},'separate feature'],[{requirementsRequiringApproval:['x']},'approved separately'],[{additionalAcceptanceCriteria:['x']},'new acceptance criteria'],[{unresolvedQuestions:['x']},'unresolved questions']])('explains %j in words',(over,words)=>{const reasons=unchangedIssues(scope(over));expect(reasons.length).toBeGreaterThan(0);expect(reasons.join(' ')).toContain(words)});
});
