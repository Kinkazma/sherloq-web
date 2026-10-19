// Display-only filtering of RITA's retained class-margin scores. They are not
// calibrated probabilities of an image being forged. Native floats are never
// quantized here; only the optional transient proxy uses 8-bit samples.
export const DEFAULT_RITA_THRESHOLD=.5;
export const DEFAULT_RITA_OPACITY=.6;
export const RITA_PROXY_SIDE=128;
export function ritaDisplayThreshold(value){return Number.isFinite(value)?Math.max(0,Math.min(1,value)):DEFAULT_RITA_THRESHOLD;}
export function ritaDisplayOpacity(value){return Number.isFinite(value)?Math.max(0,Math.min(1,value)):DEFAULT_RITA_OPACITY;}
export function ritaFrame(width,height,values,{base,mode='probability',threshold=DEFAULT_RITA_THRESHOLD,opacity=DEFAULT_RITA_OPACITY,quantized=false,validity}={}){
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||values.length!==width*height||base&&base.length!==width*height*3||validity&&validity.length!==width*height||!['probability','mask','overlay'].includes(mode))throw new RangeError('Invalid RITA presentation');
 if(mode==='overlay'&&!base)throw new RangeError('RITA overlay requires original pixels');
 const cutoff=ritaDisplayThreshold(threshold),alpha=ritaDisplayOpacity(opacity),data=new Uint8Array(width*height*3);
 for(let i=0,j=0;i<values.length;i++,j+=3){
  const raw=values[i],value=quantized?raw/255:raw,valid=Number.isFinite(value)&&(!validity||!!validity[i]),score=valid?Math.max(0,Math.min(1,value)):0,visible=valid&&score>=cutoff;
  if(mode==='overlay'){
   data[j]=visible?Math.round(base[j]*(1-alpha)+255*alpha):base[j];
   data[j+1]=visible?Math.round(base[j+1]*(1-alpha)):base[j+1];
   data[j+2]=visible?Math.round(base[j+2]*(1-alpha)):base[j+2];
  }else if(visible)data[j]=mode==='mask'?255:Math.round(score*255);
 }
 return {width,height,format:'rgb8',data};
}
