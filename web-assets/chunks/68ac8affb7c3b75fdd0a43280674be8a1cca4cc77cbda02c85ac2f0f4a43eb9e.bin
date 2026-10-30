import "../../runtime-context.js?v=0.30.0";
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {plotsParams} from './plots.js';
import {plotsStreamMath,plotsStreamHeapBytes} from './plots-stream-math.js';
import {createSegmentedBytes} from './segmented-bytes.js';

const columns=['Red','Green','Blue','Hue','Saturation','Value'],weights=[1,4,6,4,1];
function reflected(value,size){if(size===1)return 0;while(value<0||value>=size)value=value<0?-value:2*size-value-2;return value;}
const retained=store=>{let refs=1;return{store,retain(){requireValue(refs>0,'Scoped plot values disposed.');refs++;},async release(){if(--refs===0)await store.dispose();}};};

/** A missing sample is a membership bit, never an observed black pixel. */
function storedMembership(rgb,mask,width,height,budget){let closed=false;return{width,height,
 async readMaskedWindow(rect,{signal}={}){requireValue(!closed,'Scoped pyramid disposed.');checkAbort(signal);const n=rect.width*rect.height,release=budget.reserve(n*4);let done=false;
  try{const data=new Uint8Array(n*3),membership=new Uint8Array(n);for(let row=0;row<rect.height;row++){checkAbort(signal);const at=(rect.y+row)*width+rect.x;await rgb.readInto(data.subarray(row*rect.width*3,(row+1)*rect.width*3),at*3);await mask.readInto(membership.subarray(row*rect.width,(row+1)*rect.width),at);}return{pixels:{width:rect.width,height:rect.height,format:'rgb8-membership',data,membership},release(){if(done)return;done=true;release();}};}catch(e){release();throw e;}
 },async dispose(){if(closed)return;closed=true;await Promise.all([rgb.dispose(),mask.dispose()]);}};}

/** Maintained integer 5x5 pyrDown, with missing observations omitted before
 * normalization. Complete reflected support retains the exact native256 divisor. */
export async function sourceRegionPyrDown(source,{budget,signal,storage={},blockPixels=262144,onProgress}={}){
 const {width,height}=source,ow=Math.ceil(width/2),oh=Math.ceil(height/2);
 if(width*5>blockPixels)throw new EngineError('MEMORY_LIMIT','A scoped plot row and its native pyrDown halo must fit without resizing.');
 const rows=Math.max(1,Math.floor((Math.floor(blockPixels/width)-4)/2));let rgb,mask,committed=false,count=0;
 try{rgb=await createSegmentedBytes(ow*oh*3,{budget,...storage,signal});mask=await createSegmentedBytes(ow*oh,{budget,...storage,signal});
  for(let first=0;first<oh;first+=rows){await controlCheckpoint(signal);const nrows=Math.min(rows,oh-first),top=Math.max(0,2*first-2),end=Math.min(height,2*(first+nrows-1)+3),part=await source.readMaskedWindow({x:0,y:top,width,height:end-top},{signal});let free;
   try{free=budget.reserve(ow*nrows*4);const data=new Uint8Array(ow*nrows*3),membership=new Uint8Array(ow*nrows);
    for(let y=0;y<nrows;y++){await controlCheckpoint(signal);for(let x=0;x<ow;x++){
     let mass=0;const sums=[0,0,0];for(let j=0;j<5;j++){const row=(reflected(2*(first+y)+j-2,height)-top)*width;for(let i=0;i<5;i++){const index=row+reflected(2*x+i-2,width);if(!part.pixels.membership[index])continue;const weight=weights[j]*weights[i];mass+=weight;for(let c=0;c<3;c++)sums[c]+=weight*part.pixels.data[index*3+c];}}
     if(!mass)continue;const at=y*ow+x;membership[at]=1;count++;
     // sum and mass are exact small integers. mass256 follows the historical
     // fixed-point operation byte for byte; incomplete support rounds once.
     for(let c=0;c<3;c++)data[at*3+c]=mass===256?(sums[c]+128)>>8:Math.floor((sums[c]+mass/2)/mass);
    }}await rgb.write(data,first*ow*3);await mask.write(membership,first*ow);onProgress?.({phase:'source-region-plots-pyrdown',completed:Math.min(oh,first+nrows),total:oh});
   }finally{free?.();part.release();}
  }await rgb.flush();await mask.flush();checkAbort(signal);committed=true;return{...storedMembership(rgb,mask,ow,oh,budget),count};
 }finally{if(!committed)await Promise.all([rgb?.dispose(),mask?.dispose()]);}
}

function valuesTable(shared,{count,width,height,scale},budget){shared.retain();let closed=false;
 const descriptor=Object.freeze({id:crypto.randomUUID(),revision:1,format:'float32-table',rowCount:count,columns:Object.freeze([...columns]),order:'observed-native-pyrDown-row,column',coordinates:'native-pyrDown-level',scale,gridWidth:width,gridHeight:height,storage:shared.store.storage,membership:'positive observed Gaussian support; excluded observations absent, weights renormalized'});
 const table={descriptor,async readRows({offset=0,length=4096}={},{signal}={}){requireValue(!closed&&Number.isSafeInteger(offset)&&offset>=0&&offset<=count&&Number.isSafeInteger(length)&&length>0,'Invalid scoped plot page.');length=Math.min(length,count-offset);const release=budget.reserve(length*24);try{checkAbort(signal);const data=new Float32Array(length*6);await shared.store.readInto(new Uint8Array(data.buffer),offset*24);checkAbort(signal);return{tableId:descriptor.id,revision:1,offset,length,totalRows:count,columns:[...columns],data,done:offset+length===count,release};}catch(e){release();throw e;}},
  async readCsv(request,hooks={}){let page,release;try{page=await table.readRows(request,hooks);release=budget.reserve(page.length*1024+1024);let text=page.offset===0?columns.join(',')+'\r\n':'';for(let i=0;i<page.data.length;i+=6){if(i%12288===0)await controlCheckpoint(hooks.signal);text+=Array.from(page.data.subarray(i,i+6)).join(',')+'\r\n';}return{tableId:descriptor.id,revision:1,offset:page.offset,length:page.length,nextOffset:page.offset+page.length,totalRows:count,done:page.done,mime:'text/csv',bytes:new TextEncoder().encode(text),release};}catch(e){release?.();throw e;}finally{page?.release();}},
  async dispose(){if(closed)return;closed=true;await shared.release();}};return table;
}

export async function sourceRegionPlots({task,original,derived,view,domain,budget,signal,onProgress,publishTable,releaseResult,cpuKernel}){
 const p=plotsParams(task.params),maximum=Math.floor(Math.log2(Math.min(domain.width,domain.height))),scale=p.scale??Math.min(1,maximum);requireValue(scale<=maximum,'Sampling scale exceeds the native source-domain limit.');
 const previous=derived.plotsCache,hit=previous?.sourceRegionPlots===true&&previous.boundaryPolicy==='observed-gaussian-v2'&&!previous.disposed&&previous.scale===scale;let cache=hit?previous:null,owned,values,table,release,published=false,newCache,descriptor;
 try{if(!cache){release=budget.reserve(Math.max(0,8*1024**2-plotsStreamHeapBytes())+Math.min(domain.width*64,16*1024**2)+65536);await plotsStreamMath();checkAbort(signal);
   const storage={temporarySession:original.session,getTemporarySession:original.ensureTemporarySession},startFromPrevious=previous?.sourceRegionPlots===true&&previous.boundaryPolicy==='observed-gaussian-v2'&&!previous.disposed&&previous.scale<scale&&previous.raster;
   let current=startFromPrevious?previous.raster:{width:domain.width,height:domain.height,readMaskedWindow:(...args)=>view.readMaskedWindow(...args)},level=startFromPrevious?previous.scale:0,count=startFromPrevious?previous.count:domain.countIncluded;
   for(;level<scale;level++){const next=await sourceRegionPyrDown(current,{budget,signal,storage,onProgress:e=>onProgress?.({...e,level:level+1,fraction:(level+e.completed/e.total)/(scale+1)})});await owned?.dispose();owned=next;current=next;count=next.count;}
   if(!count)throw new EngineError('SOURCE_SCOPE_EMPTY','No plot sample has observed source support at this sampling level.');
   const width=current.width,height=current.height;values=await createSegmentedBytes(count*24,{budget,...storage,signal});const math=await plotsStreamMath();let written=0;
   // The native HSV kernel has SIMD groups of four followed by a scalar tail.
   // Retain that classification in the ORIGINAL sampled row. Padding repeats
   // an admitted pixel only to fill a useful SIMD call; it is never exported.
   for(let y=0;y<height;y++){await controlCheckpoint(signal);const part=await current.readMaskedWindow({x:0,y,width,height:1},{signal});try{const prefix=Math.floor(width/4)*4;
     for(let x=0;x<width;){if(!part.pixels.membership[x]){x++;continue;}const start=x,isPrefix=x<prefix;while(x<width&&part.pixels.membership[x]&&(x<prefix)===isPrefix&&x-start<16384)x++;const length=x-start,padded=isPrefix?Math.ceil(length/4)*4:length,free=budget.reserve(padded*64);
      try{const data=new Uint8Array(padded*3);data.set(part.pixels.data.subarray(start*3,x*3));for(let at=length;at<padded;at++)data.set(data.subarray(0,3),at*3);const result=math.run({op:'values',rgb:data,width:padded,rows:1,original:cpuKernel==='reference'});await values.write(new Uint8Array(result.values.buffer,0,length*24),written*24);written+=length;}finally{free();}
     }}finally{part.release();}onProgress?.({phase:'source-region-plots-values',completed:y+1,total:height,fraction:(scale+(y+1)/height)/(scale+1)});
   }requireValue(written===count,'Scoped plot population differs from its native membership.');await values.flush();checkAbort(signal);const shared=retained(values);values=null;const raster=owned;owned=null;
   newCache=cache={sourceRegionPlots:true,boundaryPolicy:'observed-gaussian-v2',scale,width,height,count,shared,raster,disposed:false,async dispose(){if(this.disposed)return;this.disposed=true;await Promise.all([shared.release(),raster?.dispose()]);}};
  }
  table=valuesTable(cache.shared,cache,budget);checkAbort(signal);descriptor=publishTable(task.imageId,{surface:table});if(previous!==cache)await previous?.dispose();checkAbort(signal);derived.plotsCache=cache;published=true;
  return{id:task.id,imageId:task.imageId,operation:task.operation,status:'ok',layout:'table',tables:{values:descriptor},data:{scale,count:cache.count,columns:[...columns],style:p},layers:[],semantics:'Native RGB/HSV row order and5x5 pyrDown weights. Incomplete sampling support omits excluded observations and normalizes over positive observed Gaussian mass. Complete support preserves native bytes; no selected boundary band is discarded.',metrics:{valuesCached:hit,samplingScale:scale,sourcePixels:domain.width*domain.height,admittedSourcePixels:domain.countIncluded,admittedSamples:cache.count,storedValueBytes:cache.count*24},provenance:{params:p,sourceRegionDomain:domain.descriptor,excludedParticipation:'omitted before native pyrDown and HSV',nativeSupport:'reflected5x5 positive observed mass at every requested level',incompleteSupport:'sum(admittedRGB*integerGaussian)/sum(admittedGaussian)',originalEncodedBytesPreserved:true}};
 }catch(e){const errors=[];if(!published){if(descriptor&&releaseResult)try{await releaseResult(descriptor.id);}catch(error){errors.push(error);}if(table)try{await table.dispose();}catch(error){errors.push(error);}}if(newCache&&derived.plotsCache!==newCache)try{await newCache.dispose();}catch(error){errors.push(error);}if(errors.length)e.details={...e.details,cleanupErrors:errors.map(error=>({code:error?.code,message:String(error?.message??error)}))};throw e;}finally{await values?.dispose();await owned?.dispose();release?.();}
}
