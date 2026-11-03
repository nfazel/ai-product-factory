import fs from 'node:fs';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {currentRuntimeIdentity,runtimeIdentityEnforced} from './runtime-identity';
import {DEVELOPMENT_RUNTIME_DIGEST} from './runtime-manifest';
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs()});
describe('trusted local runtime identity',()=>{
 it('binds image/resource/credential policy and trusted executor content',()=>{const value=currentRuntimeIdentity();expect(value.digest).toMatch(/^[a-f0-9]{64}$/);for(const file of ['src/modules/verification/containers/policy.ts','src/modules/verification/containers/database.ts','src/modules/verification/containers/environment.ts','src/modules/verification/runtime-review.ts','package-lock.json'])expect(value.files[file]).toMatch(/^[a-f0-9]{64}$/)});
 it('fails closed when installed content changes after module load',()=>{vi.spyOn(fs,'readFileSync').mockReturnValueOnce(Buffer.from('changed runtime configuration'));expect(()=>currentRuntimeIdentity()).toThrow(/identity/)});
 it('fails closed when the runtime checkout cannot be inspected',()=>{vi.spyOn(fs,'lstatSync').mockImplementationOnce(()=>{throw new Error('unavailable')});expect(()=>currentRuntimeIdentity()).toThrow()});
 it('is enforced by default',()=>{expect(runtimeIdentityEnforced()).toBe(true);expect(currentRuntimeIdentity().digest).not.toBe(DEVELOPMENT_RUNTIME_DIGEST)});
 it('in development mode records a fixed label, with no file fingerprint, and ignores changed framework content',()=>{
  vi.stubEnv('APF_RUNTIME_IDENTITY','off');vi.spyOn(fs,'readFileSync').mockReturnValue(Buffer.from('changed runtime configuration'));
  expect(runtimeIdentityEnforced()).toBe(false);expect(currentRuntimeIdentity()).toEqual({digest:DEVELOPMENT_RUNTIME_DIGEST,files:{}});
 });
 it('enforces again for any other value, so only an explicit off relaxes it',()=>{for(const value of ['on','0','false','']){vi.stubEnv('APF_RUNTIME_IDENTITY',value);expect(runtimeIdentityEnforced()).toBe(true)}});
});
