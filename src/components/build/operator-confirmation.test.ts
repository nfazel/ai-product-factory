import {createElement} from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {describe,it,expect,vi} from 'vitest';
vi.mock('@/server/actions/feature-feedback',()=>({featureFeedbackAction:vi.fn()}));
vi.mock('@/server/actions/development-scope',()=>({developmentScopeAction:vi.fn()}));
import {OperatorConfirmationProvider,OperatorCredentialField} from './operator-confirmation';
import {FeedbackTextForm} from './feature-feedback';
const field=(required?:boolean)=>renderToStaticMarkup(required===undefined?createElement(OperatorCredentialField):createElement(OperatorConfirmationProvider,{required},createElement(OperatorCredentialField)));
describe('operator credential field',()=>{
 it('is shown by default, so a missing provider can never hide the credential',()=>{const html=field();expect(html).toContain('name="credential"');expect(html).toContain('type="password"')});
 it('is shown when the server says confirmation is required',()=>expect(field(true)).toContain('name="credential"'));
 it('is hidden when the proof-of-concept switch is off',()=>expect(field(false)).toBe(''));
 it('also hides the credential in the reject form when off, and keeps it when required',()=>{const reject=(required:boolean)=>renderToStaticMarkup(createElement(OperatorConfirmationProvider,{required},createElement(FeedbackTextForm,{operation:'REJECT',pending:false,onSubmit:()=>{}})));expect(reject(true)).toContain('name="credential"');expect(reject(false)).not.toContain('name="credential"');expect(reject(false)).toContain('Reject proposal')});
});
