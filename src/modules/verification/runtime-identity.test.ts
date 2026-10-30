import fs from 'node:fs';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {currentRuntimeIdentity} from './runtime-identity';
afterEach(()=>vi.restoreAllMocks());
describe('trusted local runtime identity',()=>{
 it('binds image/resource/credential policy and trusted executor content',()=>{const value=currentRuntimeIdentity();expect(value.digest).toMatch(/^[a-f0-9]{64}$/);for(const file of ['src/modules/verification/containers/policy.ts','src/modules/verification/containers/database.ts','src/modules/verification/containers/environment.ts','src/modules/verification/runtime-review.ts','package-lock.json'])expect(value.files[file]).toMatch(/^[a-f0-9]{64}$/)});
 it('fails closed when installed content changes after module load',()=>{vi.spyOn(fs,'readFileSync').mockReturnValueOnce(Buffer.from('changed runtime configuration'));expect(()=>currentRuntimeIdentity()).toThrow(/identity/)});
 it('fails closed when the runtime checkout cannot be inspected',()=>{vi.spyOn(fs,'lstatSync').mockImplementationOnce(()=>{throw new Error('unavailable')});expect(()=>currentRuntimeIdentity()).toThrow()});
});
