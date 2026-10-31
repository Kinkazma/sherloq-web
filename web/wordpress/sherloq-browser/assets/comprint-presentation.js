import {responseColor,responseBlend} from './response-presentation.js?v=0.31.0';

export const DEFAULT_COMPRINT_OPACITY=1;
export const DEFAULT_COMPRINT_THRESHOLD=0;
export function comprintOpacity(value){return Number.isFinite(value)&&value>=0&&value<=1?value:DEFAULT_COMPRINT_OPACITY;}
export function comprintThreshold(value){return Number.isFinite(value)&&value>=0?value:DEFAULT_COMPRINT_THRESHOLD;}
// Presentation curve only: 194 -> 50%, 388 -> 93.75%, 582 -> 99.8%.
export function comprintResponse(value){return Number.isFinite(value)&&value>0?-Math.expm1(-Math.LN2*(value/194)**2):0;}
// Float64 distances and the result's global range remain authoritative.
// Threshold and fusion affect presentation only, never the scientific result.
export function comprintFrame(width,height,values,{range=[0,1],mode='heat',base,opacity,threshold}={}){
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||values.length!==width*height||base&&base.length!==width*height*3)throw new RangeError('Invalid Comprint presentation dimensions');
 if(!['heat-overlay','heat','gray'].includes(mode))throw new RangeError('Invalid Comprint presentation mode');
 const [lo,hi]=range;if(!Number.isFinite(lo)||!Number.isFinite(hi)||hi<lo)throw new RangeError('Invalid Comprint display range');
 const overlay=mode.endsWith('overlay'),heat=mode.startsWith('heat'),strength=comprintOpacity(opacity),cutoff=comprintThreshold(threshold),data=new Uint8Array(width*height*3);
 if(overlay&&!base)throw new RangeError('Missing Comprint source image');
 for(let i=0;i<values.length;i++){
  const valid=Number.isFinite(values[i]),p=valid?Math.max(0,Math.min(1,(values[i]-lo)/(hi-lo||1))):0,gray=Math.round(p*255),response=overlay?comprintResponse(values[i]):0,visible=valid&&values[i]>=cutoff,alpha=visible?strength*response:0;
  for(let c=0;c<3;c++){
   const color=heat?responseColor(p,c):gray;
   data[i*3+c]=overlay?responseBlend(base[i*3+c],color,alpha):visible?color:0;
  }
 }
 return {width,height,format:'rgb8',data};
}
