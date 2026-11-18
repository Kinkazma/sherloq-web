import {EngineError,requireValue} from './errors.js';

// Literal existing frequency preview geometry: OpenCV's padded axes use the
// smallest dimension composed only of factors2,3,5. No transform is executed.
export function frequencyDimension(n){
 requireValue(Number.isSafeInteger(n)&&n>0,'Frequency preview dimensions must be positive integers.');
 let best=2147483647;for(let a=1;a<best;a*=2)for(let b=a;b<best;b*=3){let c=b;while(c<n)c*=5;if(c<best)best=c;}
 requireValue(best!==2147483647,'Frequency preview geometry exceeds native DFT dimensions.');return best;
}
function frequencyViewName(view){
 const value=(typeof view==='string'?view:view?.id??view?.mode)??'low';
 if(typeof value!=='string')throw new EngineError('PREVIEW_UNAVAILABLE','Frequency draft layer must be named explicitly.');const name=value.split('.').at(-1);
 if(!['low','high','magnitude','phase'].includes(name))throw new EngineError('PREVIEW_UNAVAILABLE','The selected frequency layer is not a raster draft.');return name;
}
/** Pure shared input/frame geometry. Logical coordinates describe the complete
 * selected view, while width/height describe its actual sampled native input. */
export function native16TransformPreviewLayout(operation,{width,height,logicalWidth=width,logicalHeight=height}={},view){
 requireValue(['detail.frequency','detail.wavelets'].includes(operation),'A native frequency/wavelet preview operation is required.');
 requireValue([width,height,logicalWidth,logicalHeight].every(v=>Number.isSafeInteger(v)&&v>0)&&Number.isSafeInteger(width*height)&&Number.isSafeInteger(logicalWidth*logicalHeight),'Native transform preview needs exact positive geometry.');
 const viewId=operation==='detail.frequency'?frequencyViewName(view):'low',padded=operation==='detail.frequency'&&['magnitude','phase'].includes(viewId);
 const outputWidth=padded?frequencyDimension(width):width,outputHeight=padded?frequencyDimension(height):height;
 const lw=padded?frequencyDimension(logicalWidth):logicalWidth,lh=padded?frequencyDimension(logicalHeight):logicalHeight;
 requireValue(Number.isSafeInteger(outputWidth*outputHeight)&&Number.isSafeInteger(lw*lh),'Native transform preview output exceeds exact addressing.');
 return Object.freeze({operation,viewId,inputWidth:width,inputHeight:height,outputWidth,outputHeight,logicalWidth:lw,logicalHeight:lh,coordinates:padded?'frequency':'source'});
}
