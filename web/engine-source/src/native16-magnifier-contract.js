import {magnifierParams} from './magnifier.js';
import {equalizationPlan} from './equalization-settings.js';
import {EngineError,requireValue} from './errors.js';
import {native16CompositeEqualizationPlan} from './native16-equalization-contract.js';

// Shared by capability inspection and the producer. A post-equalizer is not
// made native by accepting its identity base stage separately.
export function native16MagnifierParams(input={}){
 const plan=Object.hasOwn(input,'equalization')?equalizationPlan('inspection.magnifier',input):null;
 const composite=native16CompositeEqualizationPlan('inspection.magnifier',input);
 if(plan?.post&&!composite)return null;
 return magnifierParams(composite?.base??plan?.base??input);
}
export function native16MagnifierParametersAdmitted(input={}){
 try{return native16MagnifierParams(input)!==null;}catch{return false;}
}

// The caller compiles and admits the Original domain before invoking this
// coordinate helper. No derived RGB grid, mask, or second translation is used.
export function magnifierOriginalRectangleParams(input,domain){
 const p=native16MagnifierParams(input);
 if(!p)throw new EngineError('UNSUPPORTED_PRECISION','This post-equalizer keeps its declared SDR8 regional route.');
 const r=domain?.rect;
 requireValue(domain?.schema==='sherloq.source-region-domain/1'&&r&&Object.isFrozen(domain)&&typeof domain.originalRowIntervals==='function'&&domain.countIncluded===domain.width*domain.height&&[r.x0,r.y0,r.x1,r.y1].every(Number.isSafeInteger)&&r.x1>r.x0&&r.y1>r.y0,'A compiled complete Original rectangle is required.');
 const bounds=(p.bounds??[r.x0,r.y0,r.x1,r.y1]).map((v,i)=>Math.max(i%2?r.y0:r.x0,Math.min(i%2?r.y1:r.x1,v)));
 return{...p,bounds};
}
