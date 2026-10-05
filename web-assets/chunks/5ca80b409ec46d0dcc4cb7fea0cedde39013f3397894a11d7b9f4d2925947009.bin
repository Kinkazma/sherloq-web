import "../../runtime-context.js?v=0.14.5";
import {retainResult} from './retained-result.js';
import {FrequencyStripPool} from './frequency-strip-pool.js';
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {frequencyParams} from './frequency.js';
import {frequencyStreamMath,frequencyStreamHeapBytes} from './frequency-stream-math.js';
import {createFloatPlane} from './segmented-float-plane.js';
import {createComplexPlane} from './segmented-complex-plane.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createRgbSurface} from './rgb-surface.js';
import {segmentedDft} from './segmented-dft.js';
import {shiftedComplex} from './frequency-shift.js';
import {createNoiseTable} from './noise-table.js';
import {gray} from './pixel-utils.js';

const semantics='Native padded float32 DFT and four globally normalized views; complete axes preserve the global transform and reconstruction stripe arithmetic.';
async function disposeAnalysis(value){if(value)await Promise.all([...value.views.map(v=>v.dispose()),value.table.dispose()]);}
async function disposeDisplay(value){if(value)await Promise.all(value.views.map(v=>v.dispose()));}
function leasedResult(cache,p,metrics={}){
 const refs=cache.analysis.views.slice();if(p.filter){requireValue(cache.display?.filter===p.filter,'Filtered frequency view unavailable.');refs.splice(2,2,...cache.display.views);}
 const views=refs.map(v=>v.lease());return {surface:views[0],rgbRecords:{high:{surface:views[1]},magnitude:{surface:views[2]},phase:{surface:views[3]}},tableRecords:{mask:{surface:cache.analysis.table.lease()}},frequencyCache:cache,data:{...cache.analysis.data,frequencyDimensions:[cache.width,cache.height]},semantics,metrics:{...cache.analysis.maskMetrics,workers:0,completedStripJobs:0,preflightExecutions:0,policy:'immediate-useful-work',baseCached:true,maskCached:true,analysisCached:true,displayCached:true,...metrics}};
}

export async function segmentedFrequency(image,params,{budget,signal,onProgress,cache,blockPixels=262144,storage='auto',profile={},frequencyGpu,backend='cpu'}={}){
 const pool=new FrequencyStripPool(budget,{...profile,adaptive:image.frequencyScheduling??=(new Map())});
 requireValue(['cpu','auto','webgpu'].includes(backend),'Invalid frequency backend.');if(backend==='webgpu'&&!frequencyGpu)throw new EngineError('UNSUPPORTED_BACKEND','A WebGPU frequency adapter is required.');
 const p=frequencyParams(params),analysisKey=JSON.stringify([p.split,p.smooth,p.threshold,backend]),{width:sw,height:sh}=image.surface.descriptor,owned=new Set(),surfaces=[];let newCache,mask;
 checkAbort(signal);if(cache?.analysis?.key===analysisKey&&(!p.filter||cache.display?.filter===p.filter))return leasedResult(cache,p);
 requireValue(Number.isSafeInteger(blockPixels)&&blockPixels>0&&blockPixels<=262144,'Invalid frequency strip size.');
 const initial=Math.max(8*1024**2,frequencyStreamHeapBytes()),room=budget.limit-budget.retained-budget.active,block=Math.min(blockPixels,Math.floor((room-Math.max(initial,Math.min(24*1024**2,room/2))-4*1024**2)/128));if(block<Math.max(sw,sh)*2)throw new EngineError('MEMORY_LIMIT','One padded frequency axis and filter halo must fit.');
 const options={budget,signal,storage:storage==='auto'&&(image.ensureTemporarySession||image.session)&&sw*sh*48>room-initial-block*128?'temporary':storage,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,chunkBytes:Math.max(8192,block*8)};
 const scalar=async(w,h)=>{const v=await createFloatPlane(w,h,{...options,ArrayType:Float32Array});owned.add(v);return v;},complex=async(w,h)=>{const v=await createComplexPlane(w,h,options);owned.add(v);return v;},drop=async v=>{if(owned.delete(v))await v.dispose();};
 const progress=(phase,completed,total)=>onProgress?.({phase,completed,total});
 const work=async(fn,pixels=block)=>{const release=budget.reserve(Math.max(8*1024**2,frequencyStreamHeapBytes())+pixels*128);try{return await fn();}finally{release();}};
 try{
  const math=await work(()=>frequencyStreamMath()),width=math.optimal(sw),height=math.optimal(sh);requireValue(width>0&&height>0,'Image exceeds OpenCV DFT dimensions.');
  const rows=Math.max(1,Math.floor(block/width));
  const render=async(plane,w,h,lo,hi,filter=0)=>work(async()=>{
   const store=await createSegmentedBytes(w*h*3,options);let success=false;try{for(let y=0;y<h;y+=rows){await controlCheckpoint(signal);const count=Math.min(rows,h-y),top=Math.max(0,y-filter),bottom=Math.min(h,y+count+filter);let values=await plane.read(0,top,w,bottom-top,{signal});if(lo!==undefined)values=math.normalize(values,lo,hi);if(filter)values=math.gaussian8(values,w,bottom-top,filter);const bytes=new Uint8Array(w*count*3);for(let i=0;i<w*count;i++)bytes.fill(values[(y-top)*w+i],i*3,i*3+3);await store.write(bytes,y*w*3);progress('frequency-render',Math.min(h,y+rows),h);}await store.flush();const surface=createRgbSurface(store,{width:w,height:h,budget});surfaces.push(surface);success=true;return surface;}finally{if(!success)await store.dispose();}
  },Math.max(block,w*Math.min(h,rows+filter*2)));
  const filtered=async refs=>{
   const result=[];for(const ref of refs){const view=ref.lease();try{result.push(await render({async read(x,y,w,h,hooks){const part=await view.readWindow({x,y,width:w,height:h},hooks);try{return Float32Array.from({length:w*h},(_,i)=>part.pixels.data[i*3]);}finally{part.release();}}},width,height,undefined,undefined,p.filter));}finally{await view.dispose();}}return result;
  };
  if(cache?.analysis?.key===analysisKey){
   const display=await filtered(cache.analysis.views.slice(2));checkAbort(signal);const previous=cache.display;cache.display=null;await disposeDisplay(previous);cache.display={filter:p.filter,views:display.map(retainResult)};surfaces.length=0;return leasedResult(cache,p,{workers:1,displayCached:false,blockPixels:block});
  }
  if(!cache){
   let grayPlane;await work(async()=>{grayPlane=await scalar(width,height);for(let y=0;y<height;y+=rows){await controlCheckpoint(signal);const h=Math.min(rows,height-y),values=new Float32Array(width*h);if(y<sh){const part=await image.surface.readWindow({x:0,y,width:sw,height:Math.min(h,sh-y)},{signal});try{for(let yy=0;yy<part.pixels.height;yy++)for(let x=0;x<sw;x++){const i=(yy*sw+x)*3;values[yy*width+x]=gray(part.pixels.data[i],part.pixels.data[i+1],part.pixels.data[i+2]);}}finally{part.release();}}await grayPlane.write(values,0,y,width,h,{signal});progress('frequency-gray',Math.min(height,y+rows),height);}});
   const fft=await segmentedDft(grayPlane,{...options,blockPixels:block,pool,onProgress});owned.add(fft);await drop(grayPlane);let polar;
   await work(async()=>{polar=await complex(width,height);const shifted=shiftedComplex(fft),lo=[Infinity,Infinity],hi=[-Infinity,-Infinity];for(let y=0;y<height;y+=rows){await controlCheckpoint(signal);const h=Math.min(rows,height-y),values=math.polar(await shifted.read(0,y,width,h,{signal}));for(let i=0;i<values.length;i++){const k=i%2;lo[k]=Math.min(lo[k],values[i]);hi[k]=Math.max(hi[k],values[i]);}await polar.write(values,0,y,width,h,{signal});}
    for(let y=0;y<height;y+=rows){await controlCheckpoint(signal);const h=Math.min(rows,height-y),values=await polar.read(0,y,width,h,{signal});for(let k=0;k<2;k++){const component=Float32Array.from({length:values.length/2},(_,i)=>values[i*2+k]),normalized=math.normalize(component,lo[k],hi[k]);for(let i=0;i<normalized.length;i++)values[i*2+k]=normalized[i];}await polar.write(values,0,y,width,h,{signal});progress('frequency-polar',Math.min(height,y+rows),height);}});
   let disposed=false;newCache={width,height,fft,polar,mask:null,maskKey:null,async dispose(){if(disposed)return;disposed=true;await Promise.all([this.fft.dispose(),this.polar.dispose(),this.mask?.dispose(),disposeAnalysis(this.analysis),disposeDisplay(this.display)]);}};cache=newCache;
  }
  const maskKey=JSON.stringify([p.split,p.smooth,backend]),maskCached=cache.maskKey===maskKey;
  let maskMetrics=maskCached?cache.maskMetrics??{backend:'cpu'}:{backend:'cpu'};
  if(maskCached)mask=cache.mask;
  else await work(async()=>{
   if(frequencyGpu&&backend!=='cpu'){
    // GPU buffer admission belongs to FrequencyGpu. This reservation covers
    // its full CPU input/readback arrays until persisted to the global plane.
    let release;
    try{release=budget.reserve(width*height*8);const result=await frequencyGpu.mask(width,height,p,{signal,required:backend==='webgpu',prepareMask:async()=>{const input=new Float32Array(width*height);for(let y=0;y<height;y+=rows){await controlCheckpoint(signal);input.set(math.maskHorizontal(width,height,y,Math.min(rows,height-y),p.split,0),y*width);}return {input,weights:math.maskWeights(width,height,p.smooth)};}});maskMetrics=result.metrics;
     if(result.mask){mask=await scalar(width,height);for(let y=0;y<height;y+=rows){await controlCheckpoint(signal);const h=Math.min(rows,height-y);await mask.write(result.mask.subarray(y*width,(y+h)*width),0,y,width,h,{signal});}progress('frequency-mask-gpu',1,1);return;}
    }catch(error){checkAbort(signal);if(backend==='webgpu'||error.code!=='MEMORY_LIMIT')throw error;frequencyGpu.dispose();if(mask){await drop(mask);mask=null;}maskMetrics={backend:'cpu',reason:'Full GPU mask staging exceeds shared memory.'};}finally{release?.();}
   }
   const horizontal=await scalar(width,height);let completed=0;
   await pool.run({count:Math.ceil(height/rows),pixels:Math.min(rows,height)*width,key:`mask-h/${width}/${height}/${p.split}/${p.smooth}/${rows}`,signal,
    prepare:async i=>{await controlCheckpoint(signal);return {op:'mask-horizontal',width,height,top:i*rows,rows:Math.min(rows,height-i*rows),split:p.split,smooth:p.smooth};},local:j=>({values:math.maskHorizontal(j.width,j.height,j.top,j.rows,j.split,j.smooth)}),consume:async(r,i)=>{const y=i*rows,h=Math.min(rows,height-y);await horizontal.write(r.values,0,y,width,h,{signal});completed+=h;progress('frequency-mask-horizontal',completed,height);}
   });
   mask=await scalar(width,height);const step=Math.max(1,Math.floor(block/height));completed=0;
   await pool.run({count:Math.ceil(width/step),pixels:Math.min(step,width)*height,key:`mask-v/${width}/${height}/${p.split}/${p.smooth}/${step}`,signal,
    prepare:async i=>{await controlCheckpoint(signal);const x=i*step,w=Math.min(step,width-x),values=await horizontal.read(x,0,w,height,{signal}),columns=new Float32Array(values.length);for(let xx=0;xx<w;xx++)for(let y=0;y<height;y++)columns[xx*height+y]=values[y*w+xx];return {op:'mask-vertical',values:columns,width,height,columns:w,smooth:p.smooth};},local:j=>({values:math.maskVertical(j.values,j.width,j.height,j.columns,j.smooth)}),consume:async(r,i)=>{const x=i*step,w=Math.min(step,width-x),values=new Float32Array(r.values.length);for(let xx=0;xx<w;xx++)for(let y=0;y<height;y++)values[y*w+xx]=r.values[xx*height+y];await mask.write(values,x,0,w,height,{signal});completed+=w;progress('frequency-mask-vertical',completed,width);}
   });await drop(horizontal);
  });
  let weights,zero=0;await work(async()=>{weights=await scalar(width,height);for(let y=0;y<height;y+=rows){await controlCheckpoint(signal);const h=Math.min(rows,height-y),v=await mask.read(0,y,width,h,{signal}),polar=await cache.polar.read(0,y,width,h,{signal});for(let i=0;i<v.length;i++){v[i]=v[i]/mask.maximum;if(p.threshold&&polar[i*2]<Math.trunc(p.threshold/100*255))v[i]=0;if(v[i]===0)zero++;}await weights.write(v,0,y,width,h,{signal});}});
  const rgb=[];
  for(let high=0;high<2;high++){
   let filtered;await work(async()=>{filtered=await complex(width,height);const shifted=shiftedComplex(cache.fft);for(let y=0;y<height;y+=rows){await controlCheckpoint(signal);const h=Math.min(rows,height-y),v=await shifted.read(0,y,width,h,{signal}),m=await weights.read(0,y,width,h,{signal});for(let i=0;i<m.length;i++){const weight=high?Math.fround(1-m[i]):m[i];v[i*2]*=weight;v[i*2+1]*=weight;}await filtered.write(v,0,y,width,h,{signal});}});
   const inverse=await segmentedDft(shiftedComplex(filtered,true),{...options,blockPixels:block,pool,inverse:true,onProgress});owned.add(inverse);await drop(filtered);let magnitude,lo=Infinity,hi=-Infinity;
   await work(async()=>{magnitude=await scalar(width,height);for(let y=0;y<height;y+=rows){await controlCheckpoint(signal);const h=Math.min(rows,height-y),v=math.polar(await inverse.read(0,y,width,h,{signal}),{reconstruction:true,offset:y*width,total:width*height,columns:width});for(let yy=0;yy<h;yy++)for(let x=0;x<width;x++)if(high||y+yy<sh&&x<sw){lo=Math.min(lo,v[yy*width+x]);hi=Math.max(hi,v[yy*width+x]);}await magnitude.write(v,0,y,width,h,{signal});}});await drop(inverse);rgb.push(await render(magnitude,sw,sh,lo,hi));await drop(magnitude);
  }
  for(let k=0;k<2;k++){let display;await work(async()=>{display=await scalar(width,height);for(let y=0;y<height;y+=rows){await controlCheckpoint(signal);const h=Math.min(rows,height-y),polar=await cache.polar.read(0,y,width,h,{signal}),m=await weights.read(0,y,width,h,{signal}),v=new Float32Array(m.length);for(let i=0;i<v.length;i++)v[i]=Math.trunc(Math.fround(polar[i*2+k]*m[i]))&255;await display.write(v,0,y,width,h,{signal});}});rgb.push(await render(display,width,height,undefined,undefined,0));await drop(display);}
  const nextAnalysis={key:analysisKey,views:rgb.map(retainResult),table:retainResult(createNoiseTable(weights,{budget,block:1,columns:['frequency_y','frequency_x','weight'],valueType:Float32Array,coordinates:'frequency'})),data:{frequencyDimensions:[width,height],zeroPercent:p.threshold?zero/(width*height)*100:0},maskMetrics};
  // Until commit, all original stores remain in the transaction's cleanup set.
  const display=p.filter?await filtered(nextAnalysis.views.slice(2)):null;
  checkAbort(signal);if(!maskCached){await cache.mask?.dispose();cache.mask=mask;cache.maskKey=maskKey;cache.maskMetrics=maskMetrics;owned.delete(mask);}if(newCache){owned.delete(cache.fft);owned.delete(cache.polar);}
  const previousDisplay=cache.display,previousAnalysis=cache.analysis;cache.display=null;cache.analysis=null;await Promise.all([disposeDisplay(previousDisplay),disposeAnalysis(previousAnalysis)]);cache.analysis=nextAnalysis;cache.display=display?{filter:p.filter,views:display.map(retainResult)}:null;owned.delete(weights);surfaces.length=0;
  return leasedResult(cache,p,{...pool.metrics(),baseCached:!newCache,maskCached,analysisCached:false,displayCached:false,blockPixels:block});
 }finally{pool.clear();await Promise.all([...owned].map(v=>v.dispose()));await Promise.all(surfaces.map(v=>v.dispose()));}
}
