import "server-only";

import {db} from "@/lib/db";
import {aiRunEvidence} from "@/modules/ai/evidence";
import {getAIProvider,isAIConfigured} from "@/modules/ai/provider";
import {findCurrentBrief} from "@/modules/discovery/repository";
import {platformLabels,readTargetPlatforms} from "@/modules/discovery/platform";
import {findProductRow} from "@/modules/product/repository";
import {DomainError} from "@/modules/shared/errors";
import type {AgentRunner} from "@/modules/agent/types";
import {buildDesignContext} from "./context";
import {DESIGN_SYSTEM_PROMPT} from "./prompt";
import {designSchema} from "./schema";

export const designRunner:AgentRunner={
 agentType:"UX_DESIGN",
 isConfigured(){return isAIConfigured()},
 async execute(request){
  const [product,brief]=await Promise.all([findProductRow(request.productId),findCurrentBrief(request.productId)]);
  if(!product)throw new DomainError("Product not found.","NOT_FOUND");
  if(!brief)throw new DomainError("Start product discovery so there is a brief to design from.");
  const features=await db.workItem.findMany({where:{productId:request.productId,type:"FEATURE"},orderBy:[{createdAt:"asc"},{id:"asc"}],select:{id:true,title:true,description:true,userNeed:true,userValue:true}});
  if(!features.length)throw new DomainError("Define at least one feature before designing its screens.");
  const rows=await db.acceptanceCriterion.findMany({where:{workItem:{OR:[{id:{in:features.map(f=>f.id)}},{parentId:{in:features.map(f=>f.id)}}]}},select:{description:true,workItemId:true,workItem:{select:{parentId:true}}}});
  const criteria=rows.map(row=>({featureId:features.some(f=>f.id===row.workItemId)?row.workItemId:row.workItem.parentId??row.workItemId,text:row.description}));
  const previousRunId=typeof request.input.previousRunId==="string"?request.input.previousRunId:"",instructions=typeof request.input.instructions==="string"?request.input.instructions:"";
  let previous=null;
  if(previousRunId){
   const run=await db.agentRun.findFirst({where:{id:previousRunId,productId:request.productId,agentType:"UX_DESIGN",status:"COMPLETED"},select:{output:true}});
   const parsed=designSchema.safeParse((run?.output as {design?:unknown}|null)?.design);
   if(!parsed.success)throw new DomainError("The design to revise could not be found.","NOT_FOUND");
   previous={design:parsed.data,instructions};
  }
  const context=buildDesignContext({productName:product.name,platforms:platformLabels(readTargetPlatforms(brief.constraints)),brief,features,criteria,previous});
  const content=JSON.stringify(context);
  if(content.length>150_000)throw new DomainError("This product is too large to design in one go. Design a smaller slice first.");
  const result=await (await getAIProvider()).generate({systemPrompt:DESIGN_SYSTEM_PROMPT,messages:[{role:"user",content}],responseSchema:designSchema,schemaName:"ui_design",purpose:"ui-design",temperature:0.4});
  const parsed=designSchema.safeParse(result.data);
  if(!parsed.success)throw new DomainError("The design did not match the required structure. Nothing was saved. You can retry.");
  return{output:{purpose:"UI/UX design proposal",design:parsed.data,...(previousRunId?{basedOnRunId:previousRunId}:{}),...aiRunEvidence(result)},estimatedCost:null};
 },
};
