/**
 * Screens are AI-written HTML shown in a locked-down frame. Two layers keep that safe: these rules reject anything
 * that could run code or reach the network (so the model is asked to fix it), and the frame itself forbids scripts
 * and every external request through its sandbox and Content-Security-Policy.
 */
export function unsafeHtmlReasons(html:string){
 const reasons:string[]=[];
 if(/<\s*script\b/i.test(html))reasons.push('Do not use script tags.');
 if(/\son[a-z]+\s*=/i.test(html))reasons.push('Do not use event handler attributes such as onclick.');
 if(/javascript\s*:/i.test(html))reasons.push('Do not use javascript: links.');
 if(/<\s*(iframe|object|embed|link|meta|base|form|style\s+[^>]*src)\b/i.test(html))reasons.push('Do not use iframe, object, embed, link, meta, base or form tags. Style with a style tag or style attributes only.');
 if(/\b(src|href|action|poster|srcset)\s*=\s*["']?\s*(https?:|\/\/|file:|ftp:)/i.test(html))reasons.push('Do not load anything from the internet; use inline SVG or text instead of images.');
 if(/url\(\s*["']?\s*(https?:|\/\/)/i.test(html)||/@import\b/i.test(html))reasons.push('Do not reference external styles, fonts or images.');
 return reasons;
}
export const FRAME_CSP="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; base-uri 'none'; form-action 'none'";
/** The complete document for one screen, ready for an iframe's srcdoc with sandbox="" (no scripts, no forms, no navigation). */
export function designFrameDocument(html:string){
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${FRAME_CSP}"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;padding:0;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#111;background:#fff}*{box-sizing:border-box}</style></head><body>${html}</body></html>`;
}
