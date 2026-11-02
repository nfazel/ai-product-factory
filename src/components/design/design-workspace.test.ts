import {createElement} from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {describe,it,expect,vi} from 'vitest';
vi.mock('@/server/actions/design',()=>({designAction:vi.fn()}));
import {DesignReview,DesignWorkspace,ScreenFrame} from './design-workspace';
import {designView} from '@/modules/design/presentation';
import {designStateFrom} from '@/modules/design/state';
import {sampleDesign} from '@/modules/design/test-fixtures';
const current=designView(designStateFrom([{id:'run-1',createdAt:'2026-11-02T10:00:00Z',input:{},output:{design:sampleDesign()}}],[]),'Website').current!;
const review=(screenId='sign-up')=>renderToStaticMarkup(createElement(DesignReview,{design:current,screenId,onScreen:()=>{}}));
describe('design review screen',()=>{
 it('draws a screen in a frame with no permissions at all',()=>{const html=renderToStaticMarkup(createElement(ScreenFrame,{doc:'<p>x</p>',name:'Sign up'}));expect(html).toContain('<iframe');expect(html).toContain('sandbox=""');expect(html).not.toContain('allow-');expect(html.toLowerCase()).toContain('referrerpolicy="no-referrer"')});
 it('shows the summary, what changed, and the screens to pick from',()=>{const html=review();for(const text of ['Two calm screens','What changed in this version','First proposal.','Sign up','Discover'])expect(html).toContain(text)});
 it('explains the selected screen in plain words',()=>{const html=review('discover');for(const text of ['See people to connect with.','Card Discovery Feed','Profile card','What a person can do','Like'])expect(html).toContain(text)});
 it('shows where a person goes next and the questions for the person',()=>{const html=review('sign-up');expect(html).toContain('Where they go next');expect(html).toContain('After signing up');expect(html).toContain('Questions for you');expect(html).toContain('Should photos be required?')});
 it('falls back to the first screen if the selected one is unknown',()=>expect(review('missing')).toContain('Create an account.'));
 it('escapes untrusted text in descriptions',()=>{const evil={...current,screens:[{...current.screens[0],purpose:'<script>alert(1)</script>'}]};const html=renderToStaticMarkup(createElement(DesignReview,{design:evil,screenId:'sign-up',onScreen:()=>{}}));expect(html).toContain('&lt;script&gt;');expect(html).not.toContain('<script>alert')});
 it('starts empty and explains what will happen before anything is loaded',()=>{const html=renderToStaticMarkup(createElement(DesignWorkspace,{productId:'prod-12345678'}));expect(html).toContain('Loading the design');expect(html).not.toContain('<iframe')});
});
