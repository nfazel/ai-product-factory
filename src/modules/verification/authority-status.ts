/** A failed observation is not evidence of a changed or revoked approval. */
export class AuthorityUnavailableError extends Error {
  constructor(){super('Technical authority is temporarily unavailable.');this.name='AuthorityUnavailableError'}
}
export type AuthorityStatus='CURRENT'|'CHANGED'|'UNAVAILABLE';
