import {EngineError,requireValue,controlCheckpoint,checkAbort} from './errors.js';
import {stereoParams} from './stereogram.js';
import {gray,roundEven} from './pixel-utils.js';
import {stereoStreamMath,stereoStreamHeapBytes} from './stereo-stream-kernel.js';
import {stereoFlowStage,stereoFlowReservation} from './stereo-flow-stage.js';
import {WaveletStripPool} from './wavelet-strip-pool.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createFloatPlane} from './segmented-float-plane.js';
import {createRgbSurface} from './rgb-surface.js';
import {createNoiseTable} from './noise-table.js';
import {retainResult} from './retained-result.js';
const semantics='Native periodicity heuristic and global horizontal Farneback disparity. Relative disparity is not physical depth. No detected period returns no raster.';
function triangle(input){const h=Float64Array.from(input);let left=0,right=0,peak=0,maximum=0,flipped=false;for(let i=0;i<256;i++)if(h[i]>0){left=i;break;}if(left>0)left--;for(let i=255;i>0;i--)if(h[i]>0){right=i;break;}if(right<255)right++;for(let i=0;i<256;i++)if(h[i]>maximum){maximum=h[i];peak=i;}if(peak-left<right-peak){flipped=true;h.reverse();left=255-right;peak=255-peak;}let threshold=left,distance=0;for(let i=left+1;i<=peak;i++){const d=maximum*i+(left-peak)*h[i];if(d>distance){distance=d;threshold=i;}}threshold--;return flipped?255-threshold:threshold;}
export async function segmentedStereogram(image,params,{budget,signal,onProgress,cache,storage='auto',profile={},original=false,blockPixels=32768}={}){
 const p=stereoParams(params),{width,height}=image.surface.descriptor,rows=Math.max(1,Math.floor(blockPixels/width)),workBytes=Math.max(8*1024**2,stereoStreamHeapBytes())+Math.max(blockPixels,width)*64,options={budget,signal,storage,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,chunkBytes:262144};
 requireValue(Number.isSafeInteger(blockPixels)&&blockPixels>0&&blockPixels<=262144,'Invalid stereo strip size.');const reserve=budget.reserve(workBytes),owned=[];let pool,createdCache=false,newView,newFlow,patternLease;
 const progress=(phase,completed,total)=>onProgress?.({phase,completed,total});
 try{
  const math=await stereoStreamMath();const searchCached=!!cache,patternCached=!!cache?.views.get(0),flowCached=!!cache?.flow;
  if(!cache){
   const differences=new Float32Array(height>=2&&Math.floor(width/3)>11?Math.floor(width/3)-10:0),sums=new Float64Array(differences.length),smallHeight=roundEven(height*.5);let offset=-1,completed=0;
   if(differences.length){pool=new WaveletStripPool(budget,{...profile,workerHeapBytes:8*1024**2,workerPixelBytes:24,workerFactory:globalThis.Worker?()=>new Worker(new URL('./stereo-stream-worker.js',import.meta.url),{type:'module'}):null});await pool.run({count:Math.ceil(smallHeight/rows),pixels:Math.min(rows,smallHeight)*width*2,key:`stereo-search/${width}/${rows}`,signal,
    prepare:async i=>{const y=i*rows*2,h=Math.min(rows,smallHeight-i*rows),sourceRows=Math.min(h*2,height-y),part=await image.surface.readWindow({x:0,y,width,height:sourceRows},{signal});try{return {op:'search',rgb:part.pixels.data.slice(),width,height:sourceRows,outputRows:h};}finally{part.release();}},local:j=>({sums:math.search(j.rgb,j.width,j.height,j.outputRows)}),consume:async result=>{for(let i=0;i<sums.length;i++)sums[i]+=result.sums[i];progress('stereo-search',++completed,Math.ceil(smallHeight/rows));}});
    for(let i=0;i<sums.length;i++)differences[i]=sums[i]*(1/(smallHeight*(width-i-10)));let maximum=-Infinity;for(let i=0;i<differences.length-1;i++){const d=Math.fround(differences[i+1]-differences[i]);if(d>maximum){maximum=d;offset=i+10;}}if(maximum<2)offset=-1;
   }
   budget.retain(differences.byteLength);let disposed=false;cache={differences,offset,views:new Map(),flow:null,searchMetrics:pool?.metrics()??{workers:1,completedStripJobs:0,preflightExecutions:0},async dispose(){if(disposed)return;disposed=true;try{await Promise.all([...this.views.values()].map(x=>x.dispose()).concat(this.flow?.owner.dispose()??[]));}finally{budget.retained-=differences.byteLength;}}};createdCache=true;
  }
  const data={detected:cache.offset>=0,offset:cache.offset>=0?cache.offset:null,firstTestedOffset:10,differences:cache.differences.slice(),sourceDimensions:[width,height],mode:p.mode};
  if(cache.offset<0){checkAbort(signal);createdCache=false;return {surface:null,stereoCache:cache,data,semantics,metrics:{...cache.searchMetrics,searchCached,preflightExecutions:0}};}
  const offset=cache.offset,w=width-offset,n=w*height;data.width=w;data.height=height;data.comparedBounds=[[offset,0,width,height],[0,0,w,height]];
  const allocate=async(bytes,opts=options)=>{const store=await createSegmentedBytes(bytes,opts);owned.push(store);return store;};
  if(!cache.views.has(0)){
   let protection;if(p.mode>=2)protection=budget.reserve(stereoFlowReservation(w,height,budget));let store;try{store=await allocate(n*3);}finally{protection?.();}const lo=[255,255,255],hi=[0,0,0];
   for(let y=0;y<height;y+=rows){await controlCheckpoint(signal);const h=Math.min(rows,height-y),part=await image.surface.readWindow({x:0,y,width,height:h},{signal});try{const delta=new Uint8Array(w*h*3),rgb=part.pixels.data;for(let yy=0;yy<h;yy++)for(let x=0;x<w;x++)for(let c=0;c<3;c++){const v=Math.abs(rgb[(yy*width+x+offset)*3+c]-rgb[(yy*width+x)*3+c]);delta[(yy*w+x)*3+c]=v;lo[c]=Math.min(lo[c],v);hi[c]=Math.max(hi[c],v);}await store.write(delta,y*w*3);}finally{part.release();}progress('stereo-pattern',y+h,height);}
   const a=lo.map((v,c)=>Math.fround(hi[c]===v?0:255/(hi[c]-v))),b=lo.map((v,c)=>Math.fround(-v*(hi[c]===v?0:255/(hi[c]-v))));
   for(let y=0;y<height;y+=rows){await controlCheckpoint(signal);const bytes=new Uint8Array(w*Math.min(rows,height-y)*3);await store.readInto(bytes,y*w*3);for(let i=0;i<bytes.length;i++){const c=i%3;bytes[i]=Math.max(0,Math.min(255,roundEven(Math.fround(Math.fround(bytes[i]*a[c])+b[c]))));}await store.write(bytes,y*w*3);}
   await store.flush();cache.views.set(0,retainResult(createRgbSurface(store,{width:w,height,budget})));owned.splice(owned.indexOf(store),1);
  }
  if(p.mode>=2&&!cache.flow){
   const protection=budget.reserve(stereoFlowReservation(w,height,budget));let plane;try{plane=await createFloatPlane(w,height,{...options,ArrayType:Float32Array});owned.push(plane);}finally{protection();}
   const result=await stereoFlowStage(image,offset,plane,{budget,signal,onProgress,original,blockPixels});newFlow={plane,...result,owner:retainResult(createNoiseTable(plane,{budget,valueType:Float32Array,coordinates:'cropped-stereo-pair',columns:['row','column','horizontal_disparity']}))};owned.splice(owned.indexOf(plane),1);cache.flow=newFlow;newFlow=null;
  }
  const viewCached=cache.views.has(p.mode);
  if(!viewCached){
   const output=await allocate(n*3);patternLease=cache.views.get(0).lease();
   if(p.mode===1){const histogram=new Float64Array(256);for(let y=0;y<height;y+=rows){const part=await patternLease.readWindow({x:0,y,width:w,height:Math.min(rows,height-y)},{signal});try{const b=part.pixels.data;for(let i=0;i<b.length;i+=3)histogram[gray(b[i],b[i+1],b[i+2])]++;}finally{part.release();}}const threshold=triangle(histogram);
    for(let y=0;y<height;y+=rows){const h=Math.min(rows,height-y),top=Math.max(0,y-1),bottom=Math.min(height,y+h+1),part=await patternLease.readWindow({x:0,y:top,width:w,height:bottom-top},{signal});try{const rgb=part.pixels.data,mask=Uint8Array.from({length:w*(bottom-top)},(_,i)=>gray(rgb[i*3],rgb[i*3+1],rgb[i*3+2])>threshold?1:0),out=new Uint8Array(w*h*3);for(let yy=0;yy<h;yy++)for(let x=0;x<w;x++){let count=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)count+=mask[(Math.max(0,Math.min(height-1,y+yy+dy))-top)*w+Math.max(0,Math.min(w-1,x+dx))];out.fill(count>=5?255:0,(yy*w+x)*3,(yy*w+x+1)*3);}await output.write(out,y*w*3);}finally{part.release();}progress('stereo-triangle',y+h,height);}
   }else{
    let shaded,lo=cache.flow.lo,hi=cache.flow.hi;
    if(p.mode===3){shaded=await createFloatPlane(w*3,height,{...options,ArrayType:Float32Array});owned.push(shaded);lo=Infinity;hi=-Infinity;
     for(let y=0;y<height;y+=rows){const h=Math.min(rows,height-y),values=math.normalize(await cache.flow.plane.read(0,y,w,h,{signal}),cache.flow.lo,cache.flow.hi,1),part=await patternLease.readWindow({x:0,y,width:w,height:h},{signal});try{const rgb=part.pixels.data,out=new Float32Array(rgb.length);for(let i=0;i<out.length;i++){out[i]=Math.fround(rgb[i]*values[Math.floor(i/3)]);lo=Math.min(lo,out[i]);hi=Math.max(hi,out[i]);}await shaded.write(out,0,y,w*3,h,{signal});}finally{part.release();}}
    }
    for(let y=0;y<height;y+=rows){await controlCheckpoint(signal);const h=Math.min(rows,height-y),values=math.normalize(await (shaded??cache.flow.plane).read(0,y,w*(shaded?3:1),h,{signal}),lo,hi,255),out=new Uint8Array(w*h*3);if(shaded)out.set(values);else for(let i=0;i<values.length;i++)out.fill(values[i],i*3,i*3+3);await output.write(out,y*w*3);progress('stereo-disparity-render',y+h,height);}if(shaded){await shaded.dispose();owned.splice(owned.indexOf(shaded),1);}
   }
   await patternLease.dispose();patternLease=null;await output.flush();newView=retainResult(createRgbSurface(output,{width:w,height,budget}));owned.splice(owned.indexOf(output),1);cache.views.set(p.mode,newView);newView=null;
  }
  checkAbort(signal);createdCache=false;const flow=p.mode>=2?{flow:{surface:cache.flow.owner.lease()}}:undefined;if(flow)data.flowLayout='row,column';
  return {surface:cache.views.get(p.mode).lease(),tableRecords:flow,stereoCache:cache,data,semantics,metrics:{...cache.searchMetrics,searchCached,patternCached,flowCached,viewCached,...(cache.flow?{flowWorkerHeapBytes:cache.flow.heapBytes,flowTimings:cache.flow.timings,flowPaged:!!cache.flow.paged,flowMetrics:cache.flow.metrics}:{}),preflightExecutions:0}};
 }catch(error){await Promise.allSettled([...owned.map(x=>x.dispose()),patternLease?.dispose(),newView?.dispose(),newFlow?.owner.dispose(),...(createdCache?[cache?.dispose()]:[])]);throw error;}finally{pool?.clear();reserve();}
}
