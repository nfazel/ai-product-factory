import ts from 'typescript';import type {HttpObservation} from './http/guard';
type Origin='response'|'data'|'unknown';
/** Conservative response-value provenance, not a proof of business semantics.
 * Unknown helpers are rejected rather than treated as evidence. */
export function responseValueAssertions(body:string):number{
 const source=ts.createSourceFile('case.mjs',body,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),returns=new Map<string,Origin>();let accepted=new Set<string>();
 const expression=(node:ts.Node|undefined,env:Map<string,Origin>):Origin=>{
  if(!node)return'unknown';if(ts.isAwaitExpression(node)||ts.isParenthesizedExpression(node))return expression(node.expression,env);if(ts.isIdentifier(node))return env.get(node.text)??'unknown';
  if(ts.isPropertyAccessExpression(node)||ts.isElementAccessExpression(node))return expression(node.expression,env);
  if(ts.isCallExpression(node)){if(ts.isIdentifier(node.expression)){if(node.expression.text==='fetch')return'response';return returns.get(node.expression.text)??'unknown'}if(ts.isPropertyAccessExpression(node.expression)){const receiver=expression(node.expression.expression,env);if(receiver==='response'&&['json','text'].includes(node.expression.name.text))return'data';if(receiver==='data')return'data'}return'unknown'}
  if(ts.isBinaryExpression(node))return expression(node.left,env)==='data'||expression(node.right,env)==='data'?'data':'unknown';return'unknown';
 };
 const walk=(node:ts.Node,env:Map<string,Origin>,functionName='')=>{
  if(ts.isFunctionDeclaration(node)||ts.isFunctionExpression(node)||ts.isArrowFunction(node)){const local=new Map(env);node.parameters.forEach(p=>{if(ts.isIdentifier(p.name))local.set(p.name.text,'unknown')});if(node.body)walk(node.body,local,ts.isFunctionDeclaration(node)?node.name?.text??'':functionName);return}
  if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name))env.set(node.name.text,expression(node.initializer,env));
  if(ts.isBinaryExpression(node)&&node.operatorToken.kind===ts.SyntaxKind.EqualsToken&&ts.isIdentifier(node.left))env.set(node.left.text,expression(node.right,env));
  if(ts.isReturnStatement(node)&&functionName){const origin=expression(node.expression,env);if(origin!=='unknown')returns.set(functionName,origin)}
  if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&node.expression.expression.getText(source)==='assert'){
   const name=node.expression.name.text,arg=node.arguments[0];const shape=arg&&(/\b(?:Array\.isArray|Object\.(?:keys|values)|typeof)\b/.test(arg.getText(source)));
   const okValue=name!=='ok'||!!arg&&(ts.isBinaryExpression(arg)||ts.isCallExpression(arg));const expected=node.arguments[1];const nullCheck=expected&&(expected.kind===ts.SyntaxKind.NullKeyword||expected.getText(source)==='undefined');
   if(arg&&!shape&&okValue&&!nullCheck&&expression(arg,env)==='data')accepted.add(node.getText(source).replace(/\s+/g,''));
  }
  ts.forEachChild(node,child=>walk(child,env,functionName));
 };
 for(let round=0;round<3;round++){accepted=new Set();walk(source,new Map())}return accepted.size;
}
export type BehaviorRequirement={id:string;criterionId:string;description:string;minimumValueAssertions:number;read:boolean;write:boolean;concurrent:boolean};
export function approvedBehaviors(validationPlan:string):BehaviorRequirement[]{let value;try{value=JSON.parse(validationPlan)}catch{return[]}const list=value?.verificationRuntime?.behaviors;if(list===undefined)return[];if(!Array.isArray(list)||list.length>30)throw new Error('Invalid approved behavior requirements.');const seen=new Set<string>();return list.map(v=>{if(!v||Object.keys(v).sort().join()!=='concurrent,criterionId,description,id,minimumValueAssertions,read,write'||typeof v.id!=='string'||!/^[a-z][a-z0-9-]{0,63}$/.test(v.id)||seen.has(v.id)||typeof v.criterionId!=='string'||!v.criterionId||typeof v.description!=='string'||!v.description.trim()||!Number.isInteger(v.minimumValueAssertions)||v.minimumValueAssertions<1||v.minimumValueAssertions>20||[v.read,v.write,v.concurrent].some(x=>typeof x!=='boolean'))throw new Error('Invalid or duplicate approved behavior obligation.');seen.add(v.id);return v as BehaviorRequirement})}
export function behaviorMarkers(body:string){return[...body.matchAll(/^\s*\/\/\s*behavior:([a-z][a-z0-9-]{0,63})\s*$/gm)].map(m=>m[1])}
export function assessBehavior(requirement:BehaviorRequirement,body:string,observations:HttpObservation[],loginPath:string,signupPath=''):string[]{
 const reasons:string[]=[];if(behaviorMarkers(body).length!==1||behaviorMarkers(body)[0]!==requirement.id)reasons.push('Each approved behavior requires its own independently authored case with the exact behavior marker.');
 if(responseValueAssertions(body)<requirement.minimumValueAssertions)reasons.push('The case lacks the required assertions on actual returned domain values.');
 const meaningful=observations.filter(o=>o.status>=200&&o.status<300&&o.path!==loginPath&&o.path!==signupPath);
 if(requirement.read&&!meaningful.some(o=>o.method==='GET'))reasons.push('The required read behavior was not observed.');
 const writes=meaningful.filter(o=>['POST','PUT','PATCH','DELETE'].includes(o.method));if(requirement.write&&!writes.length)reasons.push('The required state-changing behavior was not observed.');
 if(requirement.concurrent&&!writes.some((a,i)=>writes.slice(i+1).some(b=>{const ae=Date.parse(a.at),be=Date.parse(b.at);return Number.isFinite(ae)&&Number.isFinite(be)&&Math.max(ae-a.ms,be-b.ms)<Math.min(ae,be)})))reasons.push('Concurrent state-changing requests were not observed.');
 return reasons;
}
