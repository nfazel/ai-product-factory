import {createElement} from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {describe,it,expect,vi} from 'vitest';
vi.mock('@/server/actions/rework',()=>({reworkAction:vi.fn()}));
import {DevelopmentTasksContent} from './development-tasks';
import type {ReworkView} from '@/modules/rework/service';
const task={title:'Show suggestion reason',description:'Add a badge to each card.',objective:'Cards explain why',guidance:'Reuse the card component',validation:'Render a card and read the text',filesLikely:'src/cards.tsx',risks:'Layout overflow'};
const view=(amendment:ReworkView['amendment'],eligibility:Partial<ReworkView['eligibility']>={}):ReworkView=>({eligibility:{ok:true,reasons:[],planId:'plan',scopeRevisionId:'rev',...eligibility},amendment});
const base={id:'a',digest:'d'.repeat(64),message:'',tasks:[task],created:[] as {ref:string;title:string;status:string}[]};
const render=(v:ReworkView)=>renderToStaticMarkup(createElement(DevelopmentTasksContent,{rework:v}));
describe('development tasks rendering',()=>{
 it('lists blockers in words when tasks cannot be drafted yet',()=>{const html=render(view(null,{ok:false,reasons:['The scope adds new acceptance criteria, which would change approved requirements.']}));expect(html).toContain('Before development tasks can be drafted');expect(html).toContain('new acceptance criteria')});
 it('shows drafted tasks in plain language for review',()=>{const html=render(view({...base,state:'DRAFTED'}));for(const text of ['waiting for your review','Show suggestion reason','Add a badge to each card.','How it will be checked','src/cards.tsx','Nothing is created, coded, verified or accepted'])expect(html).toContain(text)});
 it('says approved tasks are not created yet',()=>expect(render(view({...base,state:'APPROVED'}))).toContain('not created yet'));
 it('shows created tasks as proposals only and says coding has not started',()=>{const html=render(view({...base,state:'ACTIVATED',created:[{ref:'TSK-008',title:'Show suggestion reason',status:'PROPOSED'}]}));expect(html).toContain('TSK-008');expect(html).toContain('not approved for coding');expect(html).toContain('coding has not started');expect(html).toContain('own approval')});
 it('labels a created task without a reference code instead of leaving a blank',()=>{const html=render(view({...base,state:'ACTIVATED',created:[{ref:'',title:'Show suggestion reason',status:'PROPOSED'}]}));expect(html).toContain('New task');expect(html).toContain('Show suggestion reason')});
 it('explains an unavailable amendment and hides its tasks',()=>{const html=render(view({...base,state:'UNAVAILABLE',message:'Scope approval or source changed.',tasks:[]}));expect(html).toContain('Scope approval or source changed.');expect(html).not.toContain('Drafted tasks')});
 it('escapes untrusted task text',()=>{const html=render(view({...base,state:'DRAFTED',tasks:[{...task,title:'<script>alert(1)</script>'}]}));expect(html).toContain('&lt;script&gt;');expect(html).not.toContain('<script>')});
});
