import {describe,it,expect} from 'vitest';
import {initialRequirementsManifest,baselineDigest} from './manifest';
const one={criterionId:'one',workItemId:'owner',description:'Original behaviour'},two={criterionId:'two',workItemId:'owner',description:'Other behaviour'};
describe('initial membership canonical digest',()=>{
 it('is stable regardless of input order and never mutates the input',()=>{const source=[two,one];expect(baselineDigest(initialRequirementsManifest('p',source))).toBe(baselineDigest(initialRequirementsManifest('p',[one,two])));expect(source[0]).toEqual(two)});
 it('binds product, criterion identity, owner and exact content',()=>{const initial=baselineDigest(initialRequirementsManifest('p',[one]));for(const changed of [{...one,criterionId:'other'},{...one,workItemId:'other'},{...one,description:'Changed'}])expect(baselineDigest(initialRequirementsManifest('p',[changed]))).not.toBe(initial);expect(baselineDigest(initialRequirementsManifest('other',[one]))).not.toBe(initial)});
 it('records no approval or test status semantics',()=>{const manifest=initialRequirementsManifest('p',[one]);expect(manifest).not.toHaveProperty('approved');expect(manifest.members[0]).not.toHaveProperty('status');expect(manifest.version).toBe(1)});
});
