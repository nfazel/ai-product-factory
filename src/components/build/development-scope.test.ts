import {createElement} from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {describe,it,expect,vi} from 'vitest';
vi.mock('@/server/actions/development-scope',()=>({developmentScopeAction:vi.fn()}));
import {DevelopmentScopeContent} from './development-scope';
import type {DevelopmentScopeView} from '@/modules/development-scope/presentation';
const risks={architecture:[],authentication:[],data:[],security:[],platformPermissions:['Needs no new permissions']};
function scope(over:Partial<DevelopmentScopeView>={}):DevelopmentScopeView{return{scopeId:'s',productId:'p',featureId:'f',feedbackId:'t',status:'DRAFT',version:2,digest:'d'.repeat(64),baseline:{commit:'',tree:''},proposal:{revision:3,digest:'x',confirmationEventId:'e'},content:{classification:'ENHANCEMENT',summary:'Match names by prefix.',changes:['Filter on each keystroke'],preserve:['Existing contact data'],exclusions:['Fuzzy matching'],affectedBehaviour:['Search results'],additionalAcceptanceCriteria:['Typing Jo finds John'],affectedRequirementIds:[],requirementsRequiringApproval:[],assumptions:[],unresolvedQuestions:[],separateFeature:false,separateFeatureReason:'',dependencies:[],behaviouralTests:[{behaviour:'Prefix match',method:'Type Jo',expected:'John listed'}],risks},instructions:undefined,blockers:[],history:[],decisions:[],...over} as DevelopmentScopeView}
const render=(value:DevelopmentScopeView)=>renderToStaticMarkup(createElement(DevelopmentScopeContent,{scope:value}));
describe('development scope rendering',()=>{
 it('explains the scope in plain language',()=>{const html=render(scope());for(const text of ['Match names by prefix.','Filter on each keystroke','Existing contact data','Fuzzy matching','Typing Jo finds John','How it will be tested','version 2','waiting for your review'])expect(html).toContain(text)});
 it('lists approval blockers in words',()=>{const html=render(scope({blockers:['Current approved requirements are required.']}));expect(html).toContain('Before this scope can be approved');expect(html).toContain('Current approved requirements are required.')});
 it('states that approval does not start work',()=>{expect(render(scope({status:'APPROVED'}))).toContain('does not create tasks, start coding');});
 it('escapes untrusted scope text',()=>{const value=scope();value.content.summary='<script>alert(1)</script>';const html=render(value);expect(html).toContain('&lt;script&gt;');expect(html).not.toContain('<script>')});
 it('flags stale scope',()=>{expect(render(scope({status:'STALE'}))).toContain('out of date')});
});
