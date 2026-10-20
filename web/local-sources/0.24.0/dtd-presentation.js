import {displayThreshold,responseColor,responseBlend} from './response-presentation.js?v=0.24.0';

export const DEFAULT_DTD_OPACITY=0.7;
export const DEFAULT_DTD_THRESHOLD=0.5;
export function dtdOpacity(value){return Number.isFinite(value)&&value>=0&&value<=1?value:DEFAULT_DTD_OPACITY;}
// Read retained activations only. Filtering never changes the native mask,
// scores or validity. Unprocessed pixels retain the photo in the overlay.
export function dtdFrame(width,height,values,{base,opacity,threshold}={}){
 const strength=dtdOpacity(opacity),cutoff=displayThreshold(threshold,DEFAULT_DTD_THRESHOLD);
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||values.length!==width*height||base&&base.length!==width*height*3)throw new RangeError('Invalid DTD presentation dimensions');
 const data=new Uint8Array(width*height*3);
 for(let i=0;i<values.length;i++){
  const valid=Number.isFinite(values[i]),p=valid?Math.max(0,Math.min(1,values[i])):0,visible=valid&&p>=cutoff,alpha=visible&&p>0?strength:0;
  for(let c=0;c<3;c++){
   const heat=responseColor(p,c);
   data[i*3+c]=base?responseBlend(base[i*3+c],heat,alpha):visible?heat:0;
  }
 }
 return {width,height,format:'rgb8',data};
}
