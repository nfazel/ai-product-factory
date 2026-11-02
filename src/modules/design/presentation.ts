import {designFrameDocument} from './html';
import type {DesignState} from './state';
/** What the browser receives. Each screen carries a ready-to-frame document, so the safety wrapper cannot be skipped. */
export function designView(state:DesignState,platforms:string){
 const current=state.current;
 return{
  status:state.status,platforms,
  current:current?{runId:current.runId,version:current.version,digest:current.digest,approved:current.approved,createdAt:current.createdAt,summary:current.design.summary,principles:current.design.principles,flow:current.design.flow,openQuestions:current.design.openQuestions,changeNote:current.design.changeNote,screens:current.design.screens.map(screen=>({id:screen.id,name:screen.name,purpose:screen.purpose,features:screen.features,elements:screen.elements,actions:screen.actions,doc:designFrameDocument(screen.html)}))}:null,
  history:[...state.versions].reverse().map(version=>({version:version.version,runId:version.runId,changeNote:version.design.changeNote,instructions:version.instructions,createdAt:version.createdAt,approved:version.approved})),
 };
}
export type DesignView=ReturnType<typeof designView>;
