'use client';
import {createContext,useContext,type ReactNode} from 'react';
/** Required unless a server component says otherwise, so a missing provider never hides the credential. */
const RequiredContext=createContext(true);
export function OperatorConfirmationProvider({required,children}:{required:boolean;children?:ReactNode}){return <RequiredContext.Provider value={required}>{children}</RequiredContext.Provider>}
export function useOperatorConfirmationRequired(){return useContext(RequiredContext)}
/** The credential input; renders nothing while the proof-of-concept switch is off. */
export function OperatorCredentialField({note}:{note?:string}){
 if(!useOperatorConfirmationRequired())return null;
 return <label className="block text-sm">Local operator confirmation<input type="password" name="credential" required autoComplete="off" aria-label="Local operator confirmation" className="block rounded border p-2"/><span className="text-xs text-muted-foreground">{note??'Cleared on submission; never saved.'}</span></label>;
}
