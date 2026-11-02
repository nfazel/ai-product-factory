import {describe,it,expect} from 'vitest';
import {platformInstruction,modelMessages} from './prompt';
import type {ProductBriefRecord} from './types';
import {PLATFORM_LINE_PREFIX,formatPlatformLine,platformSummary,previewSupported,readTargetPlatforms,withTargetPlatforms} from './platform';
const c=(...text:string[])=>text.map(t=>({id:t,text:t,origin:'AI_PROPOSAL'}));
describe('target platform line',()=>{
 it('reads nothing when no platform was chosen',()=>{expect(readTargetPlatforms([])).toEqual([]);expect(readTargetPlatforms(c('Compliance with UK data protection regulations.'))).toEqual([])});
 it('reads one or several platforms in a fixed order, whatever order they were written',()=>{expect(readTargetPlatforms(c('Target platforms: Website'))).toEqual(['WEBSITE']);expect(readTargetPlatforms(c('Target platforms: iOS app, Android app'))).toEqual(['ANDROID','IOS'])});
 it('is tolerant of how a person or the AI words it',()=>{expect(readTargetPlatforms(c('target platforms: web app and iPhone / Android'))).toEqual(['WEBSITE','ANDROID','IOS']);expect(readTargetPlatforms(c('  TARGET PLATFORMS: ios '))).toEqual(['IOS'])});
 it('ignores unknown words and lines that merely mention a platform',()=>{expect(readTargetPlatforms(c('Target platforms: smart fridge'))).toEqual([]);expect(readTargetPlatforms(c('We might want an Android app later'))).toEqual([])});
 it('accepts plain strings as well as brief items',()=>expect(readTargetPlatforms(['Target platforms: Android app'])).toEqual(['ANDROID']));
 it('formats the line the same way it reads it',()=>{for(const ids of [['WEBSITE'],['ANDROID','IOS'],['WEBSITE','ANDROID','IOS']] as const)expect(readTargetPlatforms([formatPlatformLine([...ids])])).toEqual([...ids]);expect(formatPlatformLine(['WEBSITE','IOS'])).toBe('Target platforms: Website, iOS app')});
 it('replaces the earlier choice and keeps the other constraints in order',()=>{const next=withTargetPlatforms(c('Target platforms: Website','Compliance with UK data protection.','Budget is small.'),['ANDROID']);expect(next).toEqual(['Target platforms: Android app','Compliance with UK data protection.','Budget is small.'])});
 it('adds the line when there was none, and removes it when nothing is chosen',()=>{expect(withTargetPlatforms(c('Budget is small.'),['WEBSITE'])).toEqual(['Target platforms: Website','Budget is small.']);expect(withTargetPlatforms(c('Target platforms: Website','Budget is small.'),[])).toEqual(['Budget is small.'])});
 it('never leaves two platform lines behind',()=>{const next=withTargetPlatforms(c('Target platforms: Website','target platforms: iOS app'),['ANDROID']);expect(next.filter(t=>t.toLowerCase().startsWith(PLATFORM_LINE_PREFIX.toLowerCase()))).toHaveLength(1)});
 it('summarises in plain words',()=>{expect(platformSummary([])).toBe('not chosen yet');expect(platformSummary(['WEBSITE','IOS'])).toBe('Website and iOS app')});
 it('says preview works for websites or when nothing is chosen, not for native-only products',()=>{expect(previewSupported([])).toBe(true);expect(previewSupported(['WEBSITE','ANDROID'])).toBe(true);expect(previewSupported(['ANDROID'])).toBe(false);expect(previewSupported(['ANDROID','IOS'])).toBe(false)});
});
const brief=(...text:string[])=>({version:1,status:'DRAFT',fieldOrigins:{},problemStatement:'',productVision:'',valueProposition:'',constraints:text.map(t=>({id:t,text:t,origin:'AI_PROPOSAL'})),assumptions:[],targetUsers:[],userNeeds:[],desiredOutcomes:[],inScope:[],outOfScope:[],risks:[],successMeasures:[],openQuestions:[]}) as unknown as ProductBriefRecord;
describe('discovery agent instruction',()=>{
 it('tells the agent to ask once and point to the picker when nothing is chosen',()=>{const text=platformInstruction(brief('Budget is small.'));expect(text).toContain('not chosen yet');expect(text).toContain('Ask once');expect(text).toContain("'Where will people use it?'");expect(text).toContain('Do not record the platform yourself')});
 it('tells the agent not to ask again once the person has chosen',()=>{const text=platformInstruction(brief('Target platforms: Website, Android app'));expect(text).toContain('Website and Android app');expect(text).toContain('Do not ask about the platform again');expect(text).not.toContain('Ask once')});
 it('puts the instruction into every discovery turn',()=>{const messages=modelMessages({productName:'BetMyFriend',messages:[],brief:brief()});expect(messages.at(-1)!.content).toContain('Target platforms: not chosen yet')});
});

