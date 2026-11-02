/**
 * Where people will use the product. Stored as one clear line in the brief's constraints, so it travels with the
 * brief through editing, approval and history, and reaches every agent that reads the brief.
 */
export const PLATFORMS=[
 {id:'WEBSITE',label:'Website',hint:'Opens in a browser, on phones and computers'},
 {id:'ANDROID',label:'Android app',hint:'Installed from Google Play'},
 {id:'IOS',label:'iOS app',hint:'Installed from the App Store'},
] as const;
export type PlatformId=typeof PLATFORMS[number]['id'];
export const PLATFORM_LINE_PREFIX='Target platforms:';
const isPlatformLine=(text:string)=>text.trim().toLowerCase().startsWith(PLATFORM_LINE_PREFIX.toLowerCase());
const asText=(item:string|{text:string})=>typeof item==='string'?item:item.text;
const idOf=(name:string):PlatformId|null=>{
 const value=name.trim().toLowerCase();
 if(/^(web|website|web app|web application|responsive web)\b/.test(value))return 'WEBSITE';
 if(/^android\b/.test(value))return 'ANDROID';
 if(/^(ios|iphone|ipad)\b/.test(value))return 'IOS';
 return null;
};
/** The platforms chosen in the brief, in a fixed order; empty when none has been chosen. */
export function readTargetPlatforms(constraints:(string|{text:string})[]):PlatformId[]{
 const line=constraints.map(asText).find(isPlatformLine)?.trim();
 if(!line)return [];
 const found=new Set(line.slice(PLATFORM_LINE_PREFIX.length).split(/,|\band\b|&|\//i).map(idOf).filter((id):id is PlatformId=>!!id));
 return PLATFORMS.filter(p=>found.has(p.id)).map(p=>p.id);
}
export function platformLabels(ids:PlatformId[]){return PLATFORMS.filter(p=>ids.includes(p.id)).map(p=>p.label)}
export function formatPlatformLine(ids:PlatformId[]){return `${PLATFORM_LINE_PREFIX} ${platformLabels(ids).join(', ')}`}
/** Replaces any earlier platform line, keeping every other constraint in order; choosing nothing removes the line. */
export function withTargetPlatforms(constraints:(string|{text:string})[],ids:PlatformId[]){
 const others=constraints.map(asText).filter(text=>!isPlatformLine(text));
 return ids.length?[formatPlatformLine(ids),...others]:others;
}
export function platformSummary(ids:PlatformId[]){
 const labels=platformLabels(ids);
 return labels.length?labels.join(' and '):'not chosen yet';
}
/** Preview can currently run websites only. */
export function previewSupported(ids:PlatformId[]){return !ids.length||ids.includes('WEBSITE')}
