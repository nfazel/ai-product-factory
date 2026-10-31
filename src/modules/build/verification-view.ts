import {AuthorityUnavailableError} from '@/modules/verification/authority-status';
/** Unavailable technical observations must not prevent intent review or imply PASS. */
export async function inspectBuildVerification<T>(load:()=>Promise<T>){try{return{view:await load(),unavailable:false}}catch(error){if(!(error instanceof AuthorityUnavailableError))throw error;return{view:null,unavailable:true}}}
