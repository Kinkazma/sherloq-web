import {createAdaptiveHistogram} from './adaptive-histogram.js';
import {AHE,CLAHE} from './effects-settings.js';
import {Budget} from './vendor/unified-engine/src/cache.js';
import {createSegmentedBytes} from './vendor/unified-engine/src/segmented-bytes.js';
import {createRgbSurface} from './vendor/unified-engine/src/rgb-surface.js';
import {adjustLocalRows,adjustTileHistogram,adjustClaheTables,adjustMapRows,adjustOtsu,ADJUST_HEAP_BYTES,adjustWorkspace} from './vendor/unified-engine/src/adjust-math.js';
import {magnifierLuts} from './vendor/unified-engine/src/magnifier.js';
import {gray,equalizeHistogramLut} from './vendor/unified-engine/src/pixel-utils.js';
import {checkAbort,controlCheckpoint} from './vendor/unified-engine/src/errors.js';
import {validateLoupeEffects,adjustmentParameters,sweepPixels} from './effects-settings.js';

// The same maintained arithmetic, on requested native windows with the full
// sharpening halo. Global histogram domains remain the entire image.
export function createRegionalLoupeImage(source,effects,{temporarySession,checkpoint=controlCheckpoint}={}){
 const p=validateLoupeEffects(effects),{width,height}=source.descriptor,a=adjustmentParameters(p.adjust),nativeParams=a.equalize>5?{...a,equalize:2}:a,adaptive=p.adjust.enabled&&a.equalize>5?createAdaptiveHistogram(width,height,a.equalize===AHE?a.aheTiles:8,a.equalize===CLAHE?a.claheClip:0):null,halo=p.adjust.enabled?Math.floor(a.sharpen/4):0,budget=new Budget(128*1024**2);
 const padding=width%8!==0||height%8!==0,pw=adaptive?.pw??(padding?width+8-width%8:width),ph=adaptive?.ph??(padding?height+8-height%8:height);
 const globalAdjust=p.adjust.enabled&&(a.equalize>0||a.threshold===0),globalEnhance=p.enhance.enabled;
 const maxRows=Math.floor((ADJUST_HEAP_BYTES-4*1024**2-256*1024)/(width*48))-2*halo,rows=Math.min(128,Math.max(1,Math.floor(262144/width)),Math.max(1,maxRows));
 let prefix=null,tables=null,threshold=a.threshold,enhance=null,initialized=false,closed=false;
 const metrics={native:true,progressive:true,fullPixels:width*height,tileSize:128,globalDependencies:[...(globalAdjust?['adjust-histogram']:[]),...(globalEnhance?['enhance-histogram']:[])],statisticsPixels:0,retainedBytes:0};
 const reflected=(i,n)=>{if(n===1)return 0;const x=i%(2*(n-1));return Math.min(x,2*(n-1)-x);};
 function alive(signal){checkAbort(signal);if(closed)throw Object.assign(Error('Image released'),{code:'CANCELLED'});}
 async function local(rect,signal){
  alive(signal);const x=Math.max(0,rect.x-halo),y=Math.max(0,rect.y-halo),right=Math.min(width,rect.x+rect.width+halo),bottom=Math.min(height,rect.y+rect.height+halo),window={x,y,width:right-x,height:bottom-y};
  if(adjustWorkspace(window.width,window.height)>ADJUST_HEAP_BYTES)throw Object.assign(Error('Adjustment window exceeds native heap'),{code:'MEMORY_LIMIT'});
  const part=await source.readWindow(window,{signal});try{
   if(!p.adjust.enabled)return part.pixels;
   const bytes=await adjustLocalRows(part.pixels,nativeParams,rect.y-y,rect.height,{signal}),data=new Uint8Array(rect.width*rect.height*3);
   for(let row=0;row<rect.height;row++){const start=(row*window.width+rect.x-x)*3;data.set(bytes.subarray(start,start+rect.width*3),row*rect.width*3);}
   return {width:rect.width,height:rect.height,format:'rgb8',data};
  }finally{part.release();}
 }
 function finish(bytes){if(!p.adjust.enabled)return bytes;for(let i=0;i<bytes.length;i++){let v=a.threshold<255?(bytes[i]>threshold?255:0):bytes[i];bytes[i]=a.invert?255-v:v;}return bytes;}
 const identity=Uint8Array.from({length:256},(_,i)=>i);
 async function mapRows(bytes,count,y,signal){
  if(adaptive){if(adaptive.tiles===8)return adjustMapRows(bytes,width,count,y,pw,ph,2,tables,{signal});const hsv=adaptive.mapRows(bytes,count,y);return adjustMapRows(hsv,width,count,y,Math.ceil(width/8)*8,Math.ceil(height/8)*8,1,identity,{signal});}
  return a.equalize?adjustMapRows(bytes,width,count,y,pw,ph,a.equalize,tables,{signal}):bytes;
 }
 async function mapped(rect,signal){
  if(!prefix)return local(rect,signal).then(pixels=>({...pixels,data:finish(pixels.data)}));
  // The maintained CLAHE kernel takes global x coordinates through full rows.
  // Only the requested row groups are mapped; never independent tile histograms.
  const data=new Uint8Array(rect.width*rect.height*3);
  for(let row=0;row<rect.height;row+=rows){await checkpoint(signal);const count=Math.min(rows,rect.height-row),part=await prefix.readWindow({x:0,y:rect.y+row,width,height:count},{signal});try{
   const bytes=await mapRows(part.pixels.data,count,rect.y+row,signal);
   for(let r=0;r<count;r++)data.set(bytes.subarray((r*width+rect.x)*3,(r*width+rect.x+rect.width)*3),(row+r)*rect.width*3);
  }finally{part.release();}}
  return {width:rect.width,height:rect.height,format:'rgb8',data:finish(data)};
 }
 async function initialize(signal){
  if(initialized)return;alive(signal);let store;
  try{
   if(globalAdjust){
    const hist=a.equalize===1?new Float64Array(256):a.equalize>=2?new Int32Array(16384):null;
    store=await createSegmentedBytes(width*height*3,{budget,signal,getTemporarySession:temporarySession,label:'loupe-global-prefix'});
    async function histogram(bytes,count,y){if(adaptive){adaptive.addRows(bytes,count,y);}else if(a.equalize===1){for(let i=2;i<bytes.length;i+=3)hist[bytes[i]]++;}else if(a.equalize>=2){const bins=await adjustTileHistogram(bytes,width,count,y,pw,ph,{signal});for(let i=0;i<hist.length;i++)hist[i]+=bins[i];}}
    for(let y=0;y<height;y+=rows){await checkpoint(signal);const count=Math.min(rows,height-y),pixels=await local({x:0,y,width,height:count},signal);await histogram(pixels.data,count,y);await store.write(pixels.data,y*width*3);metrics.statisticsPixels+=width*count;}
    await store.flush();prefix=createRgbSurface(store,{width,height,budget});store=null;
    if(a.equalize>=2&&ph>height)for(let y=height;y<ph;y++){const part=await prefix.readWindow({x:0,y:reflected(y,height),width,height:1},{signal});try{await histogram(part.pixels.data,1,y);}finally{part.release();}}
    if(a.equalize)tables=adaptive?adaptive.build():a.equalize===1?equalizeHistogramLut(hist,width*height):await adjustClaheTables(hist,(pw/8)*(ph/8),a.equalize,{signal});
    if(a.threshold===0){const hist=new Int32Array(256);for(let y=0;y<height;y+=rows){await checkpoint(signal);const count=Math.min(rows,height-y),part=await prefix.readWindow({x:0,y,width,height:count},{signal});try{const bytes=await mapRows(part.pixels.data,count,y,signal);for(let i=0;i<bytes.length;i+=3)hist[gray(bytes[i],bytes[i+1],bytes[i+2])]++;}finally{part.release();}}threshold=await adjustOtsu(hist,width*height,{signal});}
   }
   if(globalEnhance){const hist=Array.from({length:4},()=>new Uint32Array(256));for(let y=0;y<height;y+=rows){await checkpoint(signal);const count=Math.min(rows,height-y),pixels=await mapped({x:0,y,width,height:count},signal),v=pixels.data;for(let i=0;i<v.length;i+=3){hist[0][v[i]]++;hist[1][v[i+1]]++;hist[2][v[i+2]]++;hist[3][gray(v[i],v[i+1],v[i+2])]++;}metrics.statisticsPixels+=width*count;}enhance=magnifierLuts(hist,width*height,p.enhance);}
   alive(signal);initialized=true;metrics.retainedBytes=budget.total();
  }catch(error){await store?.dispose();await prefix?.dispose();prefix=null;tables=null;enhance=null;throw error;}
 }
 return {metrics,descriptor:{width,height,format:'rgb8'},async readWindow(rect,{signal}={}){await initialize(signal);alive(signal);let pixels=await mapped(rect,signal);if(enhance){const v=pixels.data;for(let i=0;i<v.length;i+=3)for(let c=0;c<3;c++)v[i+c]=enhance[c][v[i+c]];}if(p.sweep.enabled)pixels=sweepPixels(pixels,p.sweep);alive(signal);return {pixels,release(){}};},async dispose(){closed=true;await prefix?.dispose();prefix=null;budget.clear();}};
}
