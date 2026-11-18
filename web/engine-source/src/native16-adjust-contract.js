import {parameters} from './pixel-utils.js';
import {equalizationPlan} from './equalization-settings.js';
import {requireValue} from './errors.js';
import {native16CompositeEqualizationPlan,retainNative16AdjustEqualization,native16AdjustEqualization} from './native16-equalization-contract.js';
export {native16AdjustEqualization} from './native16-equalization-contract.js';

// Controls retain their historical UI units. Only their working code domain
// changes; an encoded10/12-bit source is not reconstructed from its SDR view.
export const NATIVE16_ADJUST_UNITS=Object.freeze({
 source:'Exact working RGB16 encoded channel values, without an implicit profile or transfer conversion.',
 order:'Sharpen, continuous HSV, tone LUT, shared value equalization when admitted, global threshold, inversion.',
 hsv:'HSVfloat32; V/S offsets in UIcodes/255, hue in2degree UIsteps; RGB16round-to-nearest-even.',
 sharpen:'radius=floor(UI/4), REFLECT101 Gaussian sigma0, clamp/round-even((3*source-filtered)/2).',
 tone:'Native65536-code gamma/shadow/highlight LUT; sweep=257*UI, radius=floor(257*UIwidth/2).',
 threshold:'Strict RGBcode>257*UIthreshold;255 disables it;0 selects the separately reduced global16-bit Otsu threshold.',
 invert:'65535-code after threshold and all preceding transformations.',
 output:'RGB16 scientific result; profile/HDR-to-SDR conversion is an independent display consumer.',
 parameterUnits:'ui8'
});

// Keep the byte engine's validator/arithmetic untouched. A serialized shared
// equalizer is normalized before validation, including in memory preflight.
export function native16AdjustParams(input={}){
 const toneDomain=input?.toneDomain??'native';
 requireValue(toneDomain==='native'||toneDomain==='perceptual-srgb-trc','Invalid native16 adjustment tone domain.');
 const composite=native16CompositeEqualizationPlan('inspection.adjust',input);
 const plan=Object.hasOwn(input,'equalization')?equalizationPlan('inspection.adjust',input):null;
 requireValue(composite||!plan?.post,'This post-equalizer retains its declared8-bit adjustment stage.');
 let base=composite?.base??plan?.base??input;if(Object.hasOwn(base,'toneDomain')){base={...base};delete base.toneDomain;}
 const p=parameters(base,
  {brightness:0,saturation:0,hue:0,gamma:10,shadows:0,highlights:0,sweep:127,width:255,sharpen:0,threshold:255,equalize:0,invert:false},
  {brightness:[-255,255],saturation:[-255,255],hue:[0,180],gamma:[1,50],shadows:[-100,100],highlights:[-100,100],sweep:[0,255],width:[0,255],sharpen:[0,100],threshold:[0,255],equalize:[0,5]}, {}, ['invert']);
 requireValue(p.equalize===0,'The shared native16 value equalizer must be qualified before its adjustment stage is admitted.');
 if(toneDomain!=='native')p.toneDomain=toneDomain;
 return composite?retainNative16AdjustEqualization(p,composite):p;
}
export function native16AdjustPerceptualActive(p){
 return p.toneDomain==='perceptual-srgb-trc'&&(native16AdjustNeedsPrefix(p)||p.gamma!==10||p.shadows!==0||p.highlights!==0||p.width<255||p.threshold<255||p.invert||!!native16AdjustEqualization(p));
}
export function native16AdjustParametersAdmitted(input={}){try{native16AdjustParams(input);return true;}catch{return false;}}
export function native16AdjustNeedsPrefix(p){return Math.floor(p.sharpen/4)>0||p.brightness!==0||p.saturation!==0||p.hue!==0;}
export function native16AdjustPrefixKey(d,p,backend='auto'){
 return JSON.stringify([d.id,d.revision,Math.floor(p.sharpen/4),p.brightness,p.saturation,p.hue,backend,...(p.toneDomain?[p.toneDomain]:[])]);
}
