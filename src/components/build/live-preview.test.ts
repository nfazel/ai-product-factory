import {createElement} from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {describe,it,expect,vi} from 'vitest';
vi.mock('@/server/actions/preview',()=>({previewAction:vi.fn()}));
vi.mock('@/server/actions/feature-feedback',()=>({featureFeedbackAction:vi.fn()}));
vi.mock('@/server/actions/development-scope',()=>({developmentScopeAction:vi.fn()}));
vi.mock('@/server/actions/rework',()=>({reworkAction:vi.fn()}));
import {LivePreviewPanel,PreviewFrame,PreviewWorkbench} from './live-preview';
import type {PreviewView} from '@/modules/preview/helpers';
const running:PreviewView={state:'RUNNING',url:'http://127.0.0.1:4401',port:4401,commit:'78a33afbf213f57f30f94818e6433c4ce414dc49',commitSubject:'Complete Task 4',branch:'main',startedAt:'2026-11-02T10:00:00Z',pages:['/','/signup','/profile/setup']};
const frame=(size:'phone'|'tablet'|'desktop',view=running)=>renderToStaticMarkup(createElement(PreviewFrame,{preview:view,size}));
describe('live preview rendering',()=>{
 it('shows the running app in a sandboxed frame with the exact version',()=>{const html=frame('phone');expect(html).toContain('<iframe');expect(html).toContain('src="http://127.0.0.1:4401"');expect(html).toContain('78a33af');expect(html).toContain('Complete Task 4');expect(html).toContain('sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-modals"')});
 it('never grants the frame top-navigation or download rights',()=>{const sandbox=/sandbox="([^"]*)"/.exec(frame('desktop'))![1];expect(sandbox).not.toContain('allow-top-navigation');expect(sandbox).not.toContain('allow-downloads')});
 it('sizes the frame for phone, tablet and desktop',()=>{expect(frame('phone')).toContain('width:390px');expect(frame('tablet')).toContain('width:768px');expect(frame('desktop')).toContain('width:100%')});
 it('offers links to the app pages and loads the chosen one',()=>{const html=renderToStaticMarkup(createElement(PreviewFrame,{preview:running,size:'phone',path:'/signup'}));expect(html).toContain('Go to:');expect(html).toContain('Profile setup');expect(html).toContain('aria-current="page"');expect(html).toContain('src="http://127.0.0.1:4401/signup"')});
 it('hides the page links when there is only one page',()=>expect(frame('phone',{...running,pages:['/']})).not.toContain('Go to:'));
 it('opens the new-tab link safely',()=>{const html=frame('phone');expect(html).toContain('target="_blank"');expect(html).toContain('rel="noopener noreferrer"')});
 it('explains that the copy is private and throwaway before anything is loaded',()=>{const html=renderToStaticMarkup(createElement(LivePreviewPanel,{productId:'prod-12345678'}));expect(html).toContain('Live preview');expect(html).toContain('throwaway copy');expect(html).not.toContain('<iframe')});
 
});
const features=[{id:'feat-1',title:'Card Discovery Feed'},{id:'feat-2',title:'Profile Builder'}];
const bench=(over:Partial<Parameters<typeof PreviewWorkbench>[0]>={})=>renderToStaticMarkup(createElement(PreviewWorkbench,{productId:'prod-12345678',preview:running,size:'phone',path:'/',onGo:()=>{},features,feedbackOpen:false,featureId:'feat-1',onOpenFeedback:()=>{},onCloseFeedback:()=>{},onFeature:()=>{},...over}));
describe('feedback beside the running app',()=>{
 it('offers feedback next to the app without opening a conversation yet',()=>{const html=bench();expect(html).toContain('<iframe');expect(html).toContain('Give feedback on what you see');expect(html).not.toContain('Which feature is this about?')});
 it('lets the person pick which feature they are talking about, and shows that feature\'s conversation',()=>{const html=bench({feedbackOpen:true,featureId:'feat-2'});expect(html).toContain('Which feature is this about?');expect(html).toContain('Card Discovery Feed');expect(html).toContain('Profile Builder');expect(html).toContain('aria-label="Feedback for Profile Builder"');expect(html).toContain('Request changes: Profile Builder')});
 it('keeps the app and the conversation on screen together for a phone-sized frame',()=>expect(bench({feedbackOpen:true})).toContain('lg:flex-row'));
 it('stacks them when the app needs the full width',()=>{expect(bench({feedbackOpen:true,size:'desktop'})).not.toContain('lg:flex-row');expect(bench({feedbackOpen:true,size:'tablet'})).not.toContain('lg:flex-row')});
 it('says so when there is nothing to comment on',()=>{const html=bench({features:[]});expect(html).toContain('no features to give feedback on');expect(html).not.toContain('Give feedback')});
 it('falls back to the first feature if the selected one is unknown',()=>expect(bench({feedbackOpen:true,featureId:'missing'})).toContain('aria-label="Feedback for Card Discovery Feed"'));
});
