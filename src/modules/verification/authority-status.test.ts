import {describe,it,expect} from 'vitest';
import {AUTHORITY_UNAVAILABLE_BLOCKER,AuthorityUnavailableError,blockersOrUnavailable} from './authority-status';
import {DomainError} from '@/modules/shared/errors';
describe('blockersOrUnavailable',()=>{
 it('returns real blockers unchanged',async()=>{expect(await blockersOrUnavailable(async()=>['A human code approval is required before verification.'])).toEqual(['A human code approval is required before verification.'])});
 it('keeps an empty list empty',async()=>{expect(await blockersOrUnavailable(async()=>[])).toEqual([])});
 it('turns unavailable authority into a blocker, never an empty list that implies readiness',async()=>{const result=await blockersOrUnavailable(async()=>{throw new AuthorityUnavailableError()});expect(result).toEqual([AUTHORITY_UNAVAILABLE_BLOCKER]);expect(result.length).toBeGreaterThan(0)});
 it('does not hide any other failure',async()=>{await expect(blockersOrUnavailable(async()=>{throw new Error('boom')})).rejects.toThrow('boom');await expect(blockersOrUnavailable(async()=>{throw new DomainError('invalid')})).rejects.toThrow('invalid')});
});
