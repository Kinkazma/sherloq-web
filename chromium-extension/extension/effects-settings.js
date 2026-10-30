import {effectDefaults as baseDefaults,effectRanges as baseRanges,validateLoupeEffects as validateBase,adjustmentParameters as baseParameters} from './vendor/loupe-effects-settings.js';
export {hasLoupeEffects,sweepPixels} from './vendor/loupe-effects-settings.js';

// Keep the stored CLAHE 1–4 identities: existing settings retain their pixels.
export const AHE=6,CLAHE=7;
export const legacyClips=Object.freeze({2:2,3:5,4:10,5:20});
export const effectDefaults=Object.freeze({...baseDefaults,adjust:Object.freeze({...baseDefaults.adjust,claheClip:5,aheTiles:8})});
export const effectRanges={...baseRanges,adjust:{...baseRanges.adjust,equalize:[0,7],claheClip:[.5,40,true],aheTiles:[2,16]}};
export function equalizationParameter(adjust){
 if(adjust.equalize===AHE)return {key:'aheTiles',fr:'Tuiles par axe',en:'Tiles per axis',min:2,max:16,step:1,value:adjust.aheTiles,initial:8};
 if(adjust.equalize>=2)return {key:'claheClip',fr:'Limite de contraste',en:'Contrast limit',min:.5,max:40,step:.5,value:legacyClips[adjust.equalize]??adjust.claheClip,initial:5};
 return null;
}
export function validateLoupeEffects(input={}){
 if(!input||typeof input!=='object'||Array.isArray(input)||input.adjust!==undefined&&(!input.adjust||typeof input.adjust!=='object'||Array.isArray(input.adjust)))throw Error('Invalid loupe effects');
 const raw=input?.adjust??{},equalize=raw.equalize??0;
 if(!Number.isInteger(equalize)||equalize<0||equalize>7)throw Error('Invalid equalization method');
 const result=validateBase({...input,adjust:{...raw,equalize:equalize>5?0:equalize}});
 const claheClip=raw.claheClip??legacyClips[equalize]??5,aheTiles=raw.aheTiles??8;
 if(!Number.isFinite(claheClip)||claheClip<.5||claheClip>40||!Number.isInteger(claheClip*2)||!Number.isInteger(aheTiles)||aheTiles<2||aheTiles>16)throw Error('Invalid adaptive equalization parameter');
 result.adjust={...result.adjust,equalize,claheClip,aheTiles};return result;
}
export const adjustmentParameters=value=>({...baseParameters(value),claheClip:value.claheClip,aheTiles:value.aheTiles});
