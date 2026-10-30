import {EngineError,checkAbort} from './errors.js';
import {GRADIENT_HEAP_BYTES,gradientDerivatives,gradientRender,gradientLut} from './gradient-math.js';
import {gradientToneLut} from './segmented-gradient.js';
import {gradientSemantics} from './gradient-parameters.js';

// The contiguous API uses the same fixed-heap kernel in bounded row bands. The
// input already belongs to its owner; no full duplicate or reduced proxy is made.
export async function krawetzGradient(image,p,hooks={}){
 const {width:w,height:h,data}=image,n=w*h,rows=Math.min(h,Math.floor((GRADIENT_HEAP_BYTES-2*1024**2-w*8)/(w*8)),Math.max(1,Math.floor(262144/w)));
 if(rows<1)throw new EngineError('MEMORY_LIMIT','One Krawetz gradient row exceeds the fixed arithmetic heap.');
 if(p.equalize&&n>2147483647)throw new EngineError('NUMERIC_RANGE','Native int32 equalization counts require at most2147483647 pixels.');
 const output=new Uint8Array(n*3),histogram=new Float64Array(768),stats=new Float64Array(6);
 for(let y=0;y<h;y+=rows){
  checkAbort(hooks.signal);const count=Math.min(rows,h-y),top=Math.max(0,y-1),bottom=Math.min(h,y+count+1),part=await gradientDerivatives({width:w,height:bottom-top,format:'rgb8',data:data.subarray(top*w*3,bottom*w*3)},y-top,count,{signal:hooks.signal,method:'krawetz'}),rendered=await gradientRender(part.bytes,stats,p,n,{signal:hooks.signal});
  output.set(rendered.bytes,y*w*3);for(let i=0;i<768;i++)histogram[i]+=rendered.histogram[i];hooks.onProgress?.(.8*(y+count)/h);
 }
 if(p.equalize||Math.trunc(p.intensity/100*127)>0){const lut=gradientToneLut(histogram,n,p);for(let y=0;y<h;y+=rows){const end=Math.min(h,y+rows)*w*3;output.set(await gradientLut(output.subarray(y*w*3,end),lut,{signal:hooks.signal}),y*w*3);hooks.onProgress?.(.8+.2*Math.min(h,y+rows)/h);}}
 hooks.onProgress?.(1);checkAbort(hooks.signal);
 return{pixels:{width:w,height:h,format:'rgb8',data:output},semantics:gradientSemantics('krawetz'),engineMetrics:{gradientMethod:'krawetz',reconstructedMethod:true}};
}
