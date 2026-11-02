import {describe,it,expect} from 'vitest';
import {buildDesignContext} from './context';
import {sampleDesign} from './test-fixtures';
const base={productName:'BetMyFriend',platforms:['Website'],brief:{problemStatement:'People struggle to make friends.',productVision:'A friendly app.',targetUsers:[{text:'Adults 25-40'}],userNeeds:['Meet people'],constraints:[{text:'Target platforms: Website'},{text:'Comply with UK data law.'}]},features:[{id:'f1',title:'Registration',description:'Sign up',userNeed:'n',userValue:'v'},{id:'f2',title:'Feed',description:'Browse',userNeed:'n',userValue:'v'}],criteria:[{featureId:'f1',text:'Given a visitor, when they sign up, then an account exists.'},{featureId:'f2',text:'Given a user, when they open the feed, then cards show.'}]};
describe('design context',()=>{
 it('gives the agent the product, platforms, brief and each feature with its own requirements',()=>{const c=buildDesignContext(base);expect(c.product).toBe('BetMyFriend');expect(c.targetPlatforms).toEqual(['Website']);expect(c.brief.targetUsers).toEqual(['Adults 25-40']);expect(c.features[0].requirements).toEqual(['Given a visitor, when they sign up, then an account exists.']);expect(c.features[1].requirements).toHaveLength(1)});
 it('does not repeat the platform line inside the constraints',()=>expect(buildDesignContext(base).brief.constraints).toEqual(['Comply with UK data law.']));
 it('says a website is assumed when no platform was chosen',()=>expect(buildDesignContext({...base,platforms:[]}).targetPlatforms[0]).toContain('assumed'));
 it('includes the previous design and the revision request only for a revision',()=>{expect('previousDesign' in buildDesignContext(base)).toBe(false);const c=buildDesignContext({...base,previous:{design:sampleDesign(),instructions:'Bigger buttons'}}) as unknown as Record<string,unknown>;expect(c.revisionInstructions).toBe('Bigger buttons');expect(c.previousDesign).toBeTruthy()});
 it('limits requirements per feature',()=>{const many=Array.from({length:30},(_,i)=>({featureId:'f1',text:`r${i}`}));expect(buildDesignContext({...base,criteria:many}).features[0].requirements).toHaveLength(12)});
});
