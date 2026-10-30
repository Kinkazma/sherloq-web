import {checkAbort,requireValue,controlCheckpoint} from './errors.js';
import {sourceRegionLocalCores,sourceRegionLocalSupport} from './source-region-local-support.js';
import {gradientDerivatives} from './gradient-math.js';
import {echoDerivatives} from './echo-math.js';

const reflect=(x,size)=>{if(size===1)return 0;const period=2*size-2;let value=x%period;if(value<0)value+=period;return value<size?value:period-value;};

// Subtract exactly the existing complete-support planner from admitted row
// spans. No per-pixel metadata grows, and no new acquisition is introduced.
export function* sourceRegionDerivativeBoundaryRuns(domain,{radius,maxWidth=128}){
 const complete=sourceRegionLocalCores(domain,{radius,maxWidth:domain.width,maxHeight:1})[Symbol.iterator]();let current=complete.next();
 for(let y=0;y<domain.height;y++){
  const supported=[];while(!current.done&&current.value.y===y){supported.push([current.value.x,current.value.x+current.value.width]);current=complete.next();}supported.sort((a,b)=>a[0]-b[0]);
  for(const[a,b]of domain.rowIntervals(y)){
   let from=a;for(const[left,right]of supported){if(right<=from)continue;if(left>=b)break;for(let x=from;x<Math.min(b,left);x+=maxWidth)yield{x,y,width:Math.min(maxWidth,Math.min(b,left)-x),height:1,observedBoundary:true};from=Math.max(from,right);if(from>=b)break;}
   for(let x=from;x<b;x+=maxWidth)yield{x,y,width:Math.min(maxWidth,b-x),height:1,observedBoundary:true};
  }
 }
}
export const observedDerivativeWorkingBytes=(width,radius,bpp)=>{const side=2*radius+1;return width*(side*side*3+side*bpp+bpp)+(width+2*radius)*side*4+256;};

/** A missing tap reflects through its admitted centre if the opposite tap is
 * observed; otherwise it repeats the centre. External image coordinates keep
 * REFLECT_101. This is an explicit ROI boundary extension, not full-image
 * context equivalence. Native derivative kernels/coefficients remain intact. */
export async function sourceRegionObservedDerivatives(view,domain,core,{radius,gradient,signal,cooperate,method='sobel'}){
 requireValue(core.observedBoundary&&core.height===1&&core.width>0,'An observed derivative boundary row is required.');
 checkAbort(signal);const side=radius*2+1,support=sourceRegionLocalSupport(domain,core,radius),lease=await view.readMaskedWindow(support,{signal});
 try{
  if(gradient&&method==='krawetz'){
   // The mask is consumed before luminance preparation. Missing observations
   // are omitted, rather than replaced by Sobel's reflected/centre extension.
   const native=await gradientDerivatives(lease.pixels,core.y-support.y,core.height,{signal,cooperate,method,membership:lease.pixels.membership}),bytes=new Uint8Array(core.width*4),at=(core.x-support.x)*4;
   bytes.set(native.bytes.subarray(at,at+bytes.length));return bytes;
  }
  const {data,membership}=lease.pixels,atlasWidth=core.width*side,atlas=new Uint8Array(atlasWidth*side*3),bpp=gradient?4:12;
  const observed=(x,y)=>membership[(y-support.y)*support.width+x-support.x]===1;
  for(let centre=0;centre<core.width;centre++){
   if((centre&15)===0){checkAbort(signal);if(cooperate)await cooperate();else await controlCheckpoint(signal);checkAbort(signal);}const x=core.x+centre,y=core.y;
   requireValue(observed(x,y),'A derivative centre is absent from its scientific domain.');
   for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
    let sx=reflect(x+dx,domain.width),sy=reflect(y+dy,domain.height);
    if(!observed(sx,sy)){sx=reflect(x-dx,domain.width);sy=reflect(y-dy,domain.height);if(!observed(sx,sy)){sx=x;sy=y;}}
    const source=((sy-support.y)*support.width+sx-support.x)*3,target=((dy+radius)*atlasWidth+centre*side+dx+radius)*3;atlas.set(data.subarray(source,source+3),target);
   }
  }
  const image={width:atlasWidth,height:side,format:'rgb8',data:atlas},native=gradient?await gradientDerivatives(image,radius,1,{signal,cooperate}):await echoDerivatives(image,radius,1,radius,{signal}),bytes=new Uint8Array(core.width*bpp);
  checkAbort(signal);for(let x=0;x<core.width;x++){const at=(x*side+radius)*bpp;bytes.set(native.bytes.subarray(at,at+bpp),x*bpp);}return bytes;
 }finally{lease.release();}
}
