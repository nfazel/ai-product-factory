/** A failed observation is not evidence of a changed or revoked approval. */
export class AuthorityUnavailableError extends Error {
  constructor(){super('Technical authority is temporarily unavailable.');this.name='AuthorityUnavailableError'}
}
export type AuthorityStatus='CURRENT'|'CHANGED'|'UNAVAILABLE';
/** Display only: an unreadable workspace blocks verification for that task instead of crashing the whole page. */
export const AUTHORITY_UNAVAILABLE_BLOCKER='Technical authority for this task is temporarily unavailable (its saved workspace cannot be read). Verification cannot start from here.';
export async function blockersOrUnavailable(load:()=>Promise<string[]>){
 try{return await load()}catch(error){if(!(error instanceof AuthorityUnavailableError))throw error;return [AUTHORITY_UNAVAILABLE_BLOCKER]}
}
