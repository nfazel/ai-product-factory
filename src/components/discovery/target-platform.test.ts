import {createElement} from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {describe,it,expect,vi} from 'vitest';
vi.mock('@/server/actions/discovery',()=>({targetPlatformAction:vi.fn()}));
import {TargetPlatformPanel} from './target-platform';
import type {PlatformId} from '@/modules/discovery/platform';
const render=(chosen:PlatformId[],editable=true)=>renderToStaticMarkup(createElement(TargetPlatformPanel,{productId:'prod-123',chosen,editable}));
describe('target platform panel',()=>{
 it('asks the question in plain words and offers the three choices',()=>{const html=render([]);expect(html).toContain('Where will people use it?');for(const text of ['Website','Android app','iOS app','Opens in a browser'])expect(html).toContain(text)});
 it('says what is assumed until a choice is made',()=>{const html=render([]);expect(html).toContain('not chosen yet');expect(html).toContain('assumes a website')});
 it('shows and pre-ticks the current choice',()=>{const html=render(['WEBSITE','ANDROID']);expect(html).toContain('Website and Android app');expect(html).not.toContain('assumes a website');expect(html.match(/checked=""/g)).toHaveLength(2)});
 it('warns that preview covers websites only when the product is native only',()=>{expect(render(['ANDROID'])).toContain('runs websites only');expect(render(['WEBSITE','ANDROID'])).not.toContain('runs websites only')});
 it('is read-only for historical briefs',()=>{const html=render(['WEBSITE'],false);expect(html).toContain('disabled');expect(html).not.toContain('Save choice')});
});
