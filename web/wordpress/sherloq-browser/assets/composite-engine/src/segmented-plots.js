import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {plotsParams} from './plots.js';import {plotsStreamMath,plotsStreamHeapBytes} from './plots-stream-math.js';
import {WaveletStripPool} from './wavelet-strip-pool.js';import {createSegmentedBytes} from './segmented-bytes.js';import {createRgbSurface} from './rgb-surface.js';
const columns=['Red','Green','Blue','Hue','Saturation','Value'];
function retainedStore(store){let references=1;return {store,retain(){requireValue(references>0,'Plot values disposed.');references++;},async release(){if(--references===0)await store.dispose();}};}
function plotTable(shared,width,height,scale,budget){shared.retain();let disposed=false;const descriptor=Object.freeze({id:crypto.randomUUID(),revision:1,format:'float32-table',rowCount:width*height,columns,order:'row,column',coordinates:'native-pyrDown-level',scale,gridWidth:width,gridHeight:height,storage:shared.store.storage});
 const table={descriptor,async readRows({offset=0,length=4096}={},{signal}={}){requireValue(!disposed&&Number.isSafeInteger(offset)&&Number.isSafeInteger(length)&&offset>=0&&offset<=descriptor.rowCount&&length>0,'Invalid plot value page.');length=Math.min(length,descriptor.rowCount-offset);const release=budget.reserve(length*24);try{checkAbort(signal);const data=new Float32Array(length*6);await shared.store.readInto(new Uint8Array(data.buffer),offset*24);checkAbort(signal);return {tableId:descriptor.id,revision:1,offset,length,totalRows:descriptor.rowCount,columns,data,done:offset+length===descriptor.rowCount,release};}catch(e){release();throw e;}},
 async readCsv(request,hooks={}){let page,release;try{page=await table.readRows(request,hooks);release=budget.reserve(page.length*1024+1024);let text=page.offset===0?columns.join(',')+'\r\n':'';for(let i=0;i<page.data.length;i+=6){if(i%12288===0)await controlCheckpoint(hooks.signal);text+=Array.from(page.data.subarray(i,i+6)).join(',')+'\r\n';}return {tableId:descriptor.id,revision:1,offset:page.offset,length:page.length,nextOffset:page.offset+page.length,totalRows:descriptor.rowCount,done:page.done,mime:'text/csv',bytes:new TextEncoder().encode(text),release};}catch(e){release?.();throw e;}finally{page?.release();}},
 async dispose(){if(disposed)return;disposed=true;await shared.release();}};return table;
}
export async function segmentedPlots(image,params,{budget,signal,onProgress,profile={},cache,blockPixels=65536,storage='auto',original=false}={}){
 const p=plotsParams(params),{width:sourceWidth,height:sourceHeight}=image.surface.descriptor,maximum=Math.floor(Math.log2(Math.min(sourceWidth,sourceHeight))),scale=p.scale??Math.min(1,maximum);requireValue(scale<=maximum,'Sampling scale exceeds the native image limit.');
 requireValue(Number.isSafeInteger(blockPixels)&&blockPixels>0&&blockPixels<=262144,'Invalid plot strip size.');const hit=cache?.scale===scale&&!cache.disposed;
 const pool=new WaveletStripPool(budget,{...profile,adaptive:image.plotScheduling??=new Map(),workerHeapBytes:8*1024**2,workerPixelBytes:128,workerFactory:globalThis.Worker?()=>new Worker(new URL('./plots-strip-worker.js',import.meta.url),{type:'module'}):null});let release,values,newCache,previousSurface,ownedSurface;
 try{
  if(!hit){
   const room=budget.limit-budget.retained-budget.active,block=Math.min(blockPixels,Math.floor((room-12*1024**2-sourceWidth*64)/128));if(block<sourceWidth)throw new EngineError('MEMORY_LIMIT','A full plot row with its native halo must fit.');release=budget.reserve(Math.max(8*1024**2,plotsStreamHeapBytes())+block*128+sourceWidth*64);
   const options={budget,signal,storage:storage==='auto'&&image.ensureTemporarySession?'temporary':storage,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession};
   let current=image.surface,level=0;
   if(cache&&!cache.disposed&&cache.scale<scale&&cache.rgb){current=cache.rgb;level=cache.scale;}
   for(;level<scale;level++){
    const {width,height}=current.descriptor,w=Math.ceil(width/2),h=Math.ceil(height/2),rows=Math.max(1,Math.floor(block/(2*width))),store=await createSegmentedBytes(w*h*3,options),next=createRgbSurface(store,{width:w,height:h,budget});previousSurface=ownedSurface;ownedSurface=next;
    await pool.run({count:Math.ceil(h/rows),pixels:Math.min(height,2*rows+4)*width,key:`plots/pyr/${width}/${rows}`,signal,
     prepare:async i=>{const first=i*rows,n=Math.min(rows,h-first),top=Math.max(0,first*2-2),end=Math.min(height,2*(first+n-1)+3),part=await current.readWindow({x:0,y:top,width,height:end-top},{signal});try{return {op:'pyrdown',rgb:part.pixels.data,width,height,top,first,rows:n};}finally{part.release();}},
     local:async job=>(await plotsStreamMath()).run(job),consume:async(result,i)=>{await store.write(result.values,i*rows*w*3);onProgress?.({phase:'plots-pyrdown',level:level+1,completed:Math.min(h,(i+1)*rows),total:h});}});
    await store.flush();await previousSurface?.dispose();previousSurface=null;current=next;
   }
   const {width,height}=current.descriptor,rows=Math.max(1,Math.floor(block/width));values=await createSegmentedBytes(width*height*24,options);
   await pool.run({count:Math.ceil(height/rows),pixels:Math.min(height,rows)*width,key:`plots/values/${width}/${rows}`,signal,
    prepare:async i=>{const n=Math.min(rows,height-i*rows),part=await current.readWindow({x:0,y:i*rows,width,height:n},{signal});try{return {op:'values',rgb:part.pixels.data,width,rows:n,original};}finally{part.release();}},
    local:async job=>(await plotsStreamMath()).run(job),consume:async(result,i)=>{await values.write(new Uint8Array(result.values.buffer),i*rows*width*24);onProgress?.({phase:'plots-values',completed:Math.min(height,(i+1)*rows),total:height});}});
   await values.flush();checkAbort(signal);const shared=retainedStore(values);values=null;newCache={scale,width,height,shared,rgb:ownedSurface,disposed:false,async dispose(){if(this.disposed)return;this.disposed=true;await Promise.all([shared.release(),this.rgb?.dispose()]);}};ownedSurface=null;cache=newCache;
  }
  const table=plotTable(cache.shared,cache.width,cache.height,scale,budget);
  return {surface:table,plotsCache:cache,data:{scale,count:cache.width*cache.height,columns,style:p},semantics:'Native full-axis pyrDown sampling, exact RGB/HSV float32 values in original row order; user-selected scale only. Graph rendering consumes the table without position/color copies.',metrics:{...pool.metrics(),valuesCached:hit,samplingScale:scale,sourcePixels:sourceWidth*sourceHeight,storedValueBytes:cache.width*cache.height*24}};
 }catch(e){await values?.dispose();await newCache?.dispose();throw e;}finally{pool.clear();await previousSurface?.dispose();await ownedSurface?.dispose();release?.();}
}
