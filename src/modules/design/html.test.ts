import {describe,it,expect} from 'vitest';
import {FRAME_CSP,designFrameDocument,unsafeHtmlReasons} from './html';
import {goodHtml} from './test-fixtures';
describe('screen html safety rules',()=>{
 it('accepts plain markup with inline styles and inline svg',()=>{expect(unsafeHtmlReasons(goodHtml)).toEqual([]);expect(unsafeHtmlReasons('<svg width="20" height="20"><circle cx="10" cy="10" r="8"/></svg><a href="#">Next</a><style>.a{color:red}</style>')).toEqual([])});
 it.each([
  ['<script>alert(1)</script>','script'],['<SCRIPT src=x></SCRIPT>','script'],['<div onclick="x()">a</div>','event handler'],['<img src=x onerror=alert(1)>','event handler'],
  ['<a href="javascript:alert(1)">a</a>','javascript'],['<iframe src="x"></iframe>','iframe'],['<form action="x"><input></form>','form'],['<link rel="stylesheet" href="x">','link'],['<meta http-equiv="refresh" content="0;url=x">','meta'],['<base href="https://evil.test/">','base'],
  ['<img src="https://evil.test/a.png">','internet'],['<img src="//evil.test/a.png">','internet'],['<a href="http://evil.test">x</a>','internet'],['<div style="background:url(https://evil.test/a.png)">x</div>','external'],['<style>@import url(x);</style>','external'],
 ])('rejects %s',(html,word)=>{const reasons=unsafeHtmlReasons(html);expect(reasons.length).toBeGreaterThan(0);expect(reasons.join(' ').toLowerCase()).toContain(word)});
 it('wraps every screen in a document that forbids scripts and any network request',()=>{const doc=designFrameDocument(goodHtml);expect(doc).toContain(`content="${FRAME_CSP}"`);expect(FRAME_CSP).toContain("default-src 'none'");expect(FRAME_CSP).not.toContain('script-src');expect(FRAME_CSP).not.toMatch(/https?:/);expect(doc).toContain(goodHtml);expect(doc.indexOf('Content-Security-Policy')).toBeLessThan(doc.indexOf(goodHtml))});
 it('puts the policy before any model-written content, even hostile content',()=>{const doc=designFrameDocument('<script>x</script>');expect(doc.indexOf('Content-Security-Policy')).toBeLessThan(doc.indexOf('<script>x'))});
});
