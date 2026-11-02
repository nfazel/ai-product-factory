import "server-only";

import {db} from "@/lib/db";
import {designStateFrom,type DesignState} from "./state";

/** Read-only: the design versions and whether the latest one is approved. Imports nothing that runs agents. */
export async function getDesignState(productId:string):Promise<DesignState>{
 const [runs,approvals]=await Promise.all([
  db.agentRun.findMany({where:{productId,agentType:"UX_DESIGN",status:"COMPLETED"},select:{id:true,createdAt:true,input:true,output:true}}),
  db.approval.findMany({where:{productId,approvalType:"UI_DESIGN"},select:{status:true,comments:true}}),
 ]);
 return designStateFrom(runs,approvals);
}

/** Summary of the approved design for later steps. No HTML, and null unless this exact version is approved. */
export async function approvedDesignReference(productId:string){
 const current=(await getDesignState(productId)).current;
 if(!current?.approved)return null;
 const {design}=current;
 return{version:current.version,summary:design.summary,principles:design.principles,screens:design.screens.map(s=>({name:s.name,purpose:s.purpose,features:s.features,elements:s.elements,actions:s.actions})),flow:design.flow};
}
