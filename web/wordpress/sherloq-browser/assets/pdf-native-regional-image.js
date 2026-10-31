import {equalizationPlan} from './unified-engine/src/equalization-settings.js';
import {createEqualizationRegionalEffects} from './equalization-regional-effects.js?v=0.31.0';
import {Budget} from './unified-engine/src/cache.js';
import {createSegmentedBytes} from './unified-engine/src/segmented-bytes.js';
import {createRgbSurface} from './unified-engine/src/rgb-surface.js';
import {adjustLocalRows,adjustTileHistogram,adjustClaheTables,adjustMapRows,adjustOtsu,ADJUST_HEAP_BYTES,adjustWorkspace} from './unified-engine/src/adjust-math.js';
import {magnifierLuts} from './unified-engine/src/magnifier.js';
import {gray,equalizeHistogramLut} from './unified-engine/src/pixel-utils.js';
import {checkAbort,controlCheckpoint} from './unified-engine/src/errors.js';
import {validateLoupeEffects,adjustmentParameters,sweepPixels} from './loupe-effects-settings.js?v=0.31.0';

// Both maintained HSV conversions have explicit 8/16-pixel prefix rules.
// Interior windows preserve those rules with16-aligned sides. At the native
// right tail, retain the true right edge so both scalar tails stay identical.
export function alignedLoupeWindow(width,left,right,halo=0){
 if(![width,left,right,halo].every(Number.isSafeInteger)||width<1||left<0||right<=left||right>width||halo<0)throw new RangeError('Invalid aligned native loupe window.');
 const x=Math.max(0,Math.floor((left-halo)/16)*16),tail=Math.floor(width/16)*16,end=right+halo>=tail?width:Math.min(width,Math.ceil((right+halo)/16)*16);
 return{x,width:end-x};
}
// The same maintained arithmetic, on requested native windows with the full
// sharpening halo. Global histogram domains remain the entire image.
export function createRegionalLoupeImage(source,effects,{temporarySession,budget:sharedBudget,memoryBudgetBytes=128*1024**2}={}){
 const p=validateLoupeEffects(effects),budget=sharedBudget??new Budget(memoryBudgetBytes),adjustPlan=p.adjust.enabled?equalizationPlan('inspection.adjust',adjustmentParameters(p.adjust)):null,enhancePlan=p.enhance.enabled?equalizationPlan('inspection.magnifier',p.enhance):null;
 if(adjustPlan?.post||enhancePlan?.post)return createEqualizationRegionalEffects(source,p,{budget,temporarySession});
 if(adjustPlan){const enabled=p.adjust.enabled;p.adjust={...adjustPlan.base,enabled};}if(enhancePlan){const enabled=p.enhance.enabled;p.enhance={...enhancePlan.base,enabled};}
 const {width,height}=source.descriptor,a=adjustmentParameters(p.adjust),halo=p.adjust.enabled?Math.floor(a.sharpen/4):0;
 const padding=width%8!==0||height%8!==0,pw=padding?width+8-width%8:width,ph=padding?height+8-height%8:height;
 const globalAdjust=p.adjust.enabled&&(a.equalize>0||a.threshold===0),globalEnhance=p.enhance.enabled;
 const maxRows=p.adjust.enabled?Math.floor((ADJUST_HEAP_BYTES-4*1024**2-256*1024)/(width*48))-2*halo:128,rows=Math.min(128,Math.max(1,maxRows));
 let prefix=null,tables=null,threshold=a.threshold,enhance=null,initialized=false,closed=false;
 const bands=new Map(),bandLimit=Math.max(0,Math.min(24*1024**2,Math.floor(budget.limit/8)));let bandBytes=0;
 const metrics={native:true,progressive:true,fullPixels:width*height,tileSize:128,nativeBandRows:rows,haloRows:halo,globalDependencies:[...(globalAdjust?['adjust-histogram']:[]),...(globalEnhance?['enhance-histogram']:[])],statisticsPixels:0,retainedBytes:0,computedBands:0,reusedBands:0,bandCacheBytes:0};
 function evictBand(key){const entry=bands.get(key);if(!entry)return;bands.delete(key);bandBytes-=entry.data.byteLength;entry.release();metrics.bandCacheBytes=bandBytes;}
 function clearBands(){for(const key of [...bands.keys()])evictBand(key);}
 const unregister=budget.registerReclaimer(()=>clearBands(),{owner:'loupe-native-bands',label:'Exact native adjustment row bands',allocationKind:'array-buffer'});
 async function band(stage,y,signal,compute,metadata){
  alive(signal);const key=stage+':'+y,known=bands.get(key);if(known){bands.delete(key);bands.set(key,known);metrics.reusedBands++;return known.data;}
  const data=await compute();alive(signal);metrics.computedBands++;
  if(data.byteLength<=bandLimit){while(bandBytes+data.byteLength>bandLimit&&bands.size)evictBand(bands.keys().next().value);let release;try{release=budget.reserve(data.byteLength);}catch(error){if(error.code!=='MEMORY_LIMIT')throw error;}
   if(release){bands.set(key,{data,release,metadata});bandBytes+=data.byteLength;metrics.bandCacheBytes=bandBytes;}}
  return data;
 }
 const reflected=(i,n)=>{if(n===1)return 0;const x=i%(2*(n-1));return Math.min(x,2*(n-1)-x);};
 function alive(signal){checkAbort(signal);if(closed)throw Object.assign(Error('Image released'),{code:'CANCELLED'});}
 const priorityBands=new Map();
 function setPriority(regions){priorityBands.clear();for(const rect of regions){for(let y=Math.floor(rect.y/rows)*rows;y<rect.y+rect.height;y+=rows){const known=priorityBands.get(y);priorityBands.set(y,{left:Math.min(known?.left??width,rect.x),right:Math.max(known?.right??0,rect.x+rect.width)});}}}
 async function localBand(start,rect,signal){
  for(const[key,entry]of bands){const m=entry.metadata;if(m?.kind==='local'&&m.start===start&&m.validLeft<=rect.x&&m.validRight>=rect.x+rect.width){bands.delete(key);bands.set(key,entry);metrics.reusedBands++;return{data:entry.data,x:m.x,width:m.width};}}
  const wanted=priorityBands.get(start),left=Math.min(rect.x,wanted?.left??rect.x),right=Math.max(rect.x+rect.width,wanted?.right??rect.x+rect.width),horizontal=alignedLoupeWindow(width,left,right,halo);
  const count=Math.min(rows,height-start),y=Math.max(0,start-halo),bottom=Math.min(height,start+count+halo),window={...horizontal,y,height:bottom-y},metadata={kind:'local',start,...horizontal,validLeft:horizontal.x===0?0:horizontal.x+halo,validRight:horizontal.x+horizontal.width===width?width:horizontal.x+horizontal.width-halo};
  const bytes=await band('local/'+horizontal.x+'/'+horizontal.width,start,signal,async()=>{
   if(p.adjust.enabled&&adjustWorkspace(window.width,window.height)>ADJUST_HEAP_BYTES)throw Object.assign(Error('Adjustment window exceeds native heap'),{code:'MEMORY_LIMIT'});
   const part=await source.readWindow(window,{signal});try{
    return p.adjust.enabled?await adjustLocalRows(part.pixels,a,start-y,count,{signal}):new Uint8Array(part.pixels.data);
   }finally{part.release();}
  },metadata);
  return{data:bytes,x:horizontal.x,width:horizontal.width};
 }
 async function local(rect,signal){
  alive(signal);
  // Share one aligned operation over the union of missing horizontal tiles in
  // this row band. The native8/16-pixel tail and full sharpening halo survive.
  const data=new Uint8Array(rect.width*rect.height*3);let y=rect.y;
  while(y<rect.y+rect.height){const start=Math.floor(y/rows)*rows,part=await localBand(start,rect,signal),count=Math.min(start+rows,rect.y+rect.height)-y;for(let row=0;row<count;row++){const offset=((y-start+row)*part.width+rect.x-part.x)*3;data.set(part.data.subarray(offset,offset+rect.width*3),(y-rect.y+row)*rect.width*3);}y+=count;}
  return{width:rect.width,height:rect.height,format:'rgb8',data};
 }
 function finish(bytes){if(!p.adjust.enabled)return bytes;for(let i=0;i<bytes.length;i++){let v=a.threshold<255?(bytes[i]>threshold?255:0):bytes[i];bytes[i]=a.invert?255-v:v;}return bytes;}
 async function mapped(rect,signal){
  if(!prefix)return local(rect,signal).then(pixels=>({...pixels,data:finish(pixels.data)}));
  // The maintained CLAHE kernel takes global x coordinates through full rows.
  // Only the requested row groups are mapped; never independent tile histograms.
  const data=new Uint8Array(rect.width*rect.height*3);let y=rect.y;
  while(y<rect.y+rect.height){await controlCheckpoint(signal);const start=Math.floor(y/rows)*rows,bytes=await band('mapped',start,signal,async()=>{const count=Math.min(rows,height-start),part=await prefix.readWindow({x:0,y:start,width,height:count},{signal});try{return finish(a.equalize?await adjustMapRows(part.pixels.data,width,count,start,pw,ph,a.equalize,tables,{signal}):new Uint8Array(part.pixels.data));}finally{part.release();}}),count=Math.min(start+rows,rect.y+rect.height)-y;
   for(let r=0;r<count;r++){const offset=((y-start+r)*width+rect.x)*3;data.set(bytes.subarray(offset,offset+rect.width*3),(y-rect.y+r)*rect.width*3);}y+=count;}
  return {width:rect.width,height:rect.height,format:'rgb8',data};
 }
 async function initialize(signal){
  if(initialized)return;alive(signal);let store;
  try{
   if(globalAdjust){
    const hist=a.equalize===1?new Float64Array(256):a.equalize>=2?new Int32Array(16384):null;
    store=await createSegmentedBytes(width*height*3,{budget,signal,getTemporarySession:temporarySession,label:'loupe-global-prefix'});
    async function histogram(bytes,count,y){if(a.equalize===1){for(let i=2;i<bytes.length;i+=3)hist[bytes[i]]++;}else if(a.equalize>=2){const bins=await adjustTileHistogram(bytes,width,count,y,pw,ph,{signal});for(let i=0;i<hist.length;i++)hist[i]+=bins[i];}}
    for(let y=0;y<height;y+=rows){await controlCheckpoint(signal);const count=Math.min(rows,height-y),pixels=await local({x:0,y,width,height:count},signal);await histogram(pixels.data,count,y);await store.write(pixels.data,y*width*3);metrics.statisticsPixels+=width*count;}
    await store.flush();prefix=createRgbSurface(store,{width,height,budget});store=null;
    if(a.equalize>=2&&ph>height)for(let y=height;y<ph;y++){const part=await prefix.readWindow({x:0,y:reflected(y,height),width,height:1},{signal});try{await histogram(part.pixels.data,1,y);}finally{part.release();}}
    if(a.equalize)tables=a.equalize===1?equalizeHistogramLut(hist,width*height):await adjustClaheTables(hist,(pw/8)*(ph/8),a.equalize,{signal});
    if(a.threshold===0){const hist=new Int32Array(256);for(let y=0;y<height;y+=rows){await controlCheckpoint(signal);const count=Math.min(rows,height-y),part=await prefix.readWindow({x:0,y,width,height:count},{signal});try{const bytes=a.equalize?await adjustMapRows(part.pixels.data,width,count,y,pw,ph,a.equalize,tables,{signal}):part.pixels.data;for(let i=0;i<bytes.length;i+=3)hist[gray(bytes[i],bytes[i+1],bytes[i+2])]++;}finally{part.release();}}threshold=await adjustOtsu(hist,width*height,{signal});}
   }
   if(globalEnhance){const hist=Array.from({length:4},()=>new Uint32Array(256));for(let y=0;y<height;y+=rows){await controlCheckpoint(signal);const count=Math.min(rows,height-y),pixels=await mapped({x:0,y,width,height:count},signal),v=pixels.data;for(let i=0;i<v.length;i+=3){hist[0][v[i]]++;hist[1][v[i+1]]++;hist[2][v[i+2]]++;hist[3][gray(v[i],v[i+1],v[i+2])]++;}metrics.statisticsPixels+=width*count;}enhance=magnifierLuts(hist,width*height,p.enhance);}
   alive(signal);initialized=true;metrics.globalPrefixBytes=prefix?width*height*3:0;metrics.globalPrefixStorage=prefix?.descriptor.storage??null;metrics.retainedBytes=prefix?.descriptor.storage==='memory'?width*height*3:0;
  }catch(error){clearBands();await store?.dispose();await prefix?.dispose();prefix=null;tables=null;enhance=null;throw error;}
 }
 return {metrics,descriptor:{width,height,format:'rgb8'},setPriority,async readWindow(rect,{signal}={}){await initialize(signal);alive(signal);let pixels=await mapped(rect,signal);if(enhance){const v=pixels.data;for(let i=0;i<v.length;i+=3)for(let c=0;c<3;c++)v[i+c]=enhance[c][v[i+c]];}if(p.sweep.enabled)pixels=sweepPixels(pixels,p.sweep);alive(signal);return {pixels,release(){}};},async dispose(){closed=true;unregister();clearBands();priorityBands.clear();await prefix?.dispose();prefix=null;if(!sharedBudget)budget.clear();}};
}
