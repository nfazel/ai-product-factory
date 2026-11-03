/** Short-lived memory of on-screen feature acceptance, kept apart so recording a decision can clear it without an import cycle. */
export const GUIDANCE_TTL_MS=15_000;
/** Beyond this age an answer is no longer shown while a fresh one is worked out. */
export const GUIDANCE_STALE_MS=120_000;
export const recentAcceptance=new Map<string,{at:number;promise:Promise<unknown>;refreshing:boolean}>();
/** A feature decision was just recorded for this product: show the new state immediately. */
export function forgetGuidanceFeatureAcceptance(productId:string){for(const key of [...recentAcceptance.keys()])if(key.startsWith(`${productId}\0`))recentAcceptance.delete(key)}
