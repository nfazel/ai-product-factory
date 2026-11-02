import {describe,it,expect} from 'vitest';
import {analysisSchemaFor} from './schema';
const proposal=(ids:string[])=>({status:'PROPOSAL',classification:'IMPROVEMENT',intendedOutcome:'Highlight matches',interpretation:'Highlight matching text.',scope:'CURRENT_FEATURE',scopeReason:'Within search',questions:[],proposal:{summary:'Highlight',changes:['Highlight matches'],unchanged:['Search logic'],affectedRequirementIds:ids,acceptanceCriteria:['Matches are highlighted']}});
describe('feedback analysis requirement references',()=>{
 it('accepts only requirement IDs supplied for the feature',()=>{expect(analysisSchemaFor(['req-1']).safeParse(proposal(['req-1'])).success).toBe(true);expect(analysisSchemaFor([]).safeParse(proposal([])).success).toBe(true)});
 it('rejects unknown IDs with a repairable issue naming the allowed IDs',()=>{const result=analysisSchemaFor(['req-1']).safeParse(proposal(['feature-9']));expect(result.success).toBe(false);expect(result.error?.issues[0]?.path).toEqual(['proposal','affectedRequirementIds']);expect(result.error?.issues[0]?.message).toContain('req-1');expect(analysisSchemaFor([]).safeParse(proposal(['x'])).error?.issues[0]?.message).toContain('no requirement IDs')});
});
