import type {Design} from './schema';
export const goodHtml='<div style="padding:16px"><h1 style="font-size:22px">Create account</h1><p>Join in a minute.</p><button style="padding:12px;width:100%">Sign up</button></div>';
export function sampleDesign(over:Partial<Design>={}):Design{
 return{
  summary:'Two calm screens that get a new person from sign-up to their first suggestions.',
  principles:['Phone first','Large tap targets'],
  screens:[
   {id:'sign-up',name:'Sign up',purpose:'Create an account.',features:['Email and Password Registration'],elements:['Email field','Password field','Sign up button'],actions:['Create an account'],html:goodHtml},
   {id:'discover',name:'Discover',purpose:'See people to connect with.',features:['Card Discovery Feed'],elements:['Profile card','Like button','Pass button'],actions:['Like','Pass'],html:goodHtml.replace('Create account','Discover')},
  ],
  flow:[{from:'sign-up',to:'discover',label:'After signing up'}],
  openQuestions:['Should photos be required?'],
  changeNote:'First proposal.',
  ...over,
 };
}
