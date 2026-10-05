import "../../runtime-context.js?v=0.14.5";
import {validateRgbRows} from './rgb-row-source.js';
import {checkAbort,controlCheckpoint} from './errors.js';
// One global native-size gray image. Moments are reduced across every pixel,
// never independently per inference window. The only resize is native floor32.
export async function prepareXfeatRows(source,store,m,{signal,onProgress}={}){
 const {width,height}=source,w=Math.floor(width/32)*32,h=Math.floor(height/32)*32,p=m._malloc(width*6),out=m._malloc(w*4);let sum=0,sum2=0,reads=0,stamp=performance.now(),lease,cached,cachedFirst=0,cachedLast=0;
 if(!p||!out){if(p)m._free(p);if(out)m._free(out);throw Error('XFeat preparation allocation failed');}
 try{
  for(let y=0;y<h;y++){
   if(performance.now()-stamp>8){await controlCheckpoint(signal);stamp=performance.now();}const y0=m._xfeat_source_row(y,height,h),rows=Math.min(2,height-y0);
   if(!lease||y0<cachedFirst||y0+rows>cachedLast){lease?.release();lease=null;const count=Math.min(64,height-y0);lease=await source.readRows(y0,count,{signal});cached=validateRgbRows(lease,width,count);cachedFirst=y0;cachedLast=y0+count;reads++;}
   m.HEAPU8.set(cached.subarray((y0-cachedFirst)*width*3,(y0-cachedFirst+rows)*width*3),p);
   m._xfeat_gray_row(p,p+(rows-1)*width*3,width,height,w,h,y,out);const values=m.HEAPF32.subarray(out/4,out/4+w);for(let x=0;x<w;x++){sum+=values[x];sum2+=values[x]*values[x];}await store.write(m.HEAPU8.subarray(out,out+w*4),y*w*4);
   if(y%32===31)onProgress?.({phase:'learned-preparation',fraction:(y+1)/h});
  }
  checkAbort(signal);const mean=sum/(w*h),variance=Math.max(0,sum2/(w*h)-mean*mean);return {width:w,height:h,mean:Math.fround(mean),inverseStd:Math.fround(1/Math.sqrt(variance+1e-5)),reads,normalization:'one global InstanceNorm; float64 moment reduction, float32 tensor'};
 }finally{lease?.release();m._free(p);m._free(out);}
}
