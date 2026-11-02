import type {Design} from './schema';
type Item={text:string}|string;
const texts=(items:Item[])=>items.map(item=>typeof item==='string'?item:item.text).filter(Boolean);
/** What the design agent is given. Pure, so it can be checked without a database. */
export function buildDesignContext(input:{
 productName:string;platforms:string[];
 brief:{problemStatement:string;productVision:string;targetUsers:Item[];userNeeds:Item[];constraints:Item[]};
 features:{id:string;title:string;description:string;userNeed:string;userValue:string}[];
 criteria:{featureId:string;text:string}[];
 previous?:{design:Design;instructions:string}|null;
}){
 return{
  product:input.productName,
  targetPlatforms:input.platforms.length?input.platforms:['Website (assumed: none chosen yet)'],
  brief:{problem:input.brief.problemStatement,vision:input.brief.productVision,targetUsers:texts(input.brief.targetUsers),userNeeds:texts(input.brief.userNeeds),constraints:texts(input.brief.constraints).filter(text=>!/^target platforms:/i.test(text))},
  features:input.features.map(feature=>({id:feature.id,title:feature.title,description:feature.description,userNeed:feature.userNeed,userValue:feature.userValue,requirements:input.criteria.filter(c=>c.featureId===feature.id).map(c=>c.text).slice(0,12)})),
  ...(input.previous?{previousDesign:input.previous.design,revisionInstructions:input.previous.instructions}:{}),
 };
}
