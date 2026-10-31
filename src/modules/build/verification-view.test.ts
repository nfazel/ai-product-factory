import {describe,it,expect} from 'vitest';
import {AuthorityUnavailableError} from '@/modules/verification/authority-status';
import {inspectBuildVerification} from './verification-view';
describe('Build separates feedback availability from technical verification',()=>{
 it('retains current verification without changing its result',async()=>{const view={verdict:'FAIL'};expect(await inspectBuildVerification(async()=>view)).toEqual({view,unavailable:false})});
 it('renders no technical authority rather than granting a passing result during an outage',async()=>{expect(await inspectBuildVerification(async()=>{throw new AuthorityUnavailableError()})).toEqual({view:null,unavailable:true})});
 it('does not suppress unrelated application errors',async()=>{await expect(inspectBuildVerification(async()=>{throw new Error('Unexpected failure')})).rejects.toThrow('Unexpected failure')});
});
