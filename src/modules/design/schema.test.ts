import {describe,it,expect} from 'vitest';
import {designSchema} from './schema';
import {sampleDesign} from './test-fixtures';
describe('design schema',()=>{
 it('accepts a complete design',()=>expect(designSchema.safeParse(sampleDesign()).success).toBe(true));
 it('rejects unsafe screen html with a repairable issue pointing at it',()=>{const bad=sampleDesign();bad.screens[0].html='<div>'+'x'.repeat(40)+'<script>alert(1)</script></div>';const result=designSchema.safeParse(bad);expect(result.success).toBe(false);const issue=result.error!.issues.find(i=>i.path.join('.')==='screens.0.html')!;expect(issue.message).toContain('script')});
 it('rejects duplicate screen ids',()=>{const d=sampleDesign();d.screens[1].id='sign-up';expect(designSchema.safeParse(d).error!.issues.some(i=>i.message.includes('distinct'))).toBe(true)});
 it('rejects a flow step that names an unknown screen, and says which ids are valid',()=>{const d=sampleDesign({flow:[{from:'sign-up',to:'nowhere',label:'x'}]});const issue=designSchema.safeParse(d).error!.issues[0];expect(issue.path).toEqual(['flow',0,'to']);expect(issue.message).toContain('sign-up, discover')});
 it.each([['id with spaces','Sign Up'],['id starting with a digit','1-screen'],['empty id','']])('rejects a bad screen id (%s)',(_,id)=>{const d=sampleDesign();d.screens[0].id=id;expect(designSchema.safeParse(d).success).toBe(false)});
 it('limits the number of screens and the size of a screen',()=>{expect(designSchema.safeParse(sampleDesign({screens:Array.from({length:9},(_,i)=>({...sampleDesign().screens[0],id:`s-${i}`}))})).success).toBe(false);const big=sampleDesign();big.screens[0].html='<p>'+'x'.repeat(7001)+'</p>';expect(designSchema.safeParse(big).success).toBe(false)});
 it('refuses unknown fields so a model cannot smuggle extra data',()=>{expect(designSchema.safeParse({...sampleDesign(),extra:'x'}).success).toBe(false)});
});
