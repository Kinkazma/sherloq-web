import {allocateOwnedTypedArray} from './allocation.js';
import {getExecutionScheduler} from './execution-scheduler.js';
import {isResumableResourceError} from './errors.js';
import{EngineError,requireValue,checkAbort,controlCheckpoint,normalizeResourceError}from'./errors.js';
import{createSegmentedBytes}from'./segmented-bytes.js';import{segmentationProbabilities}from'../experiments/segmentation/probabilities.js';
const BLOCK=1048576;
// The output stores are private until every native zone and exclusion succeeds.
// This performs projection/composition only; raw grids come from real inference.
export async function segmentedNeuralProjection({family,width,height,zones,side,kind,mode='regions',exclusions=[],minimum=500,compare=false},{budget,spatial,postprocess,signal,onProgress,temporarySession,getTemporarySession,storage='auto',checkpoint,onCheckpoint,resourceOperation}={}){
 const d2=family==='d2prl',roles=d2||kind==='softmax',n=width*height,grid=side*side;
 requireValue(['d2prl','segmentation'].includes(family)&&[width,height].every(v=>Number.isSafeInteger(v)&&v>0&&v<=131072)&&Number.isSafeInteger(n*15),'Neural source geometry');
 requireValue(d2?side===448&&typeof postprocess?.run==='function':[256,512].includes(side)&&['sigmoid','softmax'].includes(kind)&&(kind!=='softmax'||side===256),'Native neural grid domain');
 requireValue(typeof spatial?.run==='function'&&Number.isInteger(minimum)&&minimum>=0&&minimum<=5000&&compare===false&&Array.isArray(exclusions)&&exclusions.length<=256&&(d2||exclusions.length===0),'Native projection parameters');
 requireValue(['regions','whole-image'].includes(mode)&&Array.isArray(zones)&&zones.length>0&&zones.length<=256,'Independent native zones required');
 const bounds=(b,min)=>requireValue(Array.isArray(b)&&b.length===4&&b.every(Number.isSafeInteger)&&b[0]>=0&&b[1]>=0&&b[2]<=width&&b[3]<=height&&b[2]-b[0]>=min&&b[3]-b[1]>=min,'Half-open source rectangle');
 const ids=new Set();for(const z of zones){bounds(z.bounds,mode==='whole-image'?1:8);requireValue(typeof z.id==='string'&&z.id.length>0&&z.id.length<=128&&!ids.has(z.id)&&z.raw instanceof Float32Array&&z.raw.length===grid*(roles?3:1),'Unique zone and native raw grid required');ids.add(z.id);}for(const b of exclusions)bounds(b,8);
 if(mode==='whole-image')requireValue(zones.length===1&&JSON.stringify(zones[0].bounds)===JSON.stringify([0,0,width,height]),'Single whole-image rectangle required');checkAbort(signal);
 const fields=['map','mask',...(roles?['target','source']:[]),'analyzed','candidates'],isFloat=key=>['map','target','source'].includes(key),elementBytes=key=>isFloat(key)?4:1,metadataBytes=65536+8192*(zones.length+exclusions.length),borrowedBytes=zones.reduce((s,z)=>s+z.raw.byteLength,0);
 const ioBytes=temporarySession?.backend==='indexeddb'||!temporarySession&&getTemporarySession?2*1024**2:0,workBytes=ioBytes+5*Math.max(width,Math.min(BLOCK,n))+width*4+16384;
 // Keep enough room for the existing native-grid processor before selecting RAM
 // result stores. The real processor owns its reservations during execution.
 const transient=(d2?512*1024**2+2*grid*12+2*grid*16:grid*(roles?29:13))+4*Math.max(width,Math.min(BLOCK,n))+16384;
 const identity=JSON.stringify([family,width,height,side,kind,mode,minimum,exclusions,zones.map(z=>[z.id,z.bounds])]);
 requireValue(!checkpoint||checkpoint.identity===identity&&!checkpoint.disposed,'Projection checkpoint identity');
 const state=checkpoint??{identity,rawSources:zones.map(z=>z.raw),stores:{},zoneMetadata:[],zone:0,plane:0,row:0,exclusion:0,exclusionRow:0,exclusionField:0,scanOffset:0,present:false,processed:null,prepared:null,metadataRetained:false,disposed:false};
 requireValue(state.rawSources.every((raw,i)=>raw===zones[i].raw),'Projection checkpoint raw grids changed');
 const {stores,zoneMetadata}=state,scheduler=getExecutionScheduler(budget),operation=budget.beginOperation?.({owner:family,id:'neural-projection',parent:resourceOperation});
 let planning,working,complete=false,keep=false,composition,analyzed;const started=performance.now();let projectionMs=0,compositionMs=0,postprocessMs=0,blocks=0;
 const dispose=state.dispose??=async()=>{if(state.disposed)return;state.disposed=true;state.processed?.release();state.maskOwner?.release();state.maskOwner=null;state.processed=state.prepared=null;state.rawSources=[];const results=await Promise.allSettled(Object.values(stores).map(s=>s.dispose()));for(const key of Object.keys(stores))delete stores[key];if(state.metadataRetained){budget.retained-=metadataBytes;state.metadataRetained=false;}const failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;};
 const report=()=>onCheckpoint?.(state);
 async function writeRectangle(store,bytes,bytesPerPixel,x0,y0,w,h){
  if(x0===0&&w===width){await store.write(bytes,y0*width*bytesPerPixel);return;}
  for(let y=0;y<h;y++){await store.write(bytes.subarray(y*w*bytesPerPixel,(y+1)*w*bytesPerPixel),((y0+y)*width+x0)*bytesPerPixel);if((y&31)===31)await controlCheckpoint(signal);}
 }
 async function compose(key,values,{y,rows:count},b){
  const at=performance.now(),[x0,y0,x1]=b,w=x1-x0,bpp=elementBytes(key),wide=w*4>=width,span=wide?width:w,buffer=composition.data.subarray(0,span*count*bpp),dest=bpp===4?new Float32Array(buffer.buffer,buffer.byteOffset,span*count):buffer;
  if(wide)await stores[key].readInto(buffer,(y0+y)*width*bpp);
  else for(let row=0;row<count;row++){await stores[key].readInto(buffer.subarray(row*w*bpp,(row+1)*w*bpp),((y0+y+row)*width+x0)*bpp);if((row&31)===31)await controlCheckpoint(signal);}
  let foreground=false;await scheduler.run({cpu:1,signal,resourceOwner:family,operation,label:'neural-compose'},()=>{for(let row=0;row<count;row++)for(let x=0;x<w;x++){const i=row*w+x,to=row*span+x+(wide?x0:0);if(key==='mask'||d2&&['target','source'].includes(key))requireValue(values[i]===0||values[i]===1,'Native binary role/mask projection');dest[to]=Math.max(dest[to],values[i]);if(key==='mask'&&values[i])foreground=true;}});
  if(wide)await stores[key].write(buffer,(y0+y)*width*bpp);else await writeRectangle(stores[key],buffer,bpp,x0,y0+y,w,count);
  if(key==='map'){
   const marked=analyzed.data.subarray(0,span*count);if(wide){await stores.analyzed.readInto(marked,(y0+y)*width);for(let row=0;row<count;row++)marked.fill(1,row*width+x0,row*width+x1);await stores.analyzed.write(marked,(y0+y)*width);}
   else{marked.fill(1);await writeRectangle(stores.analyzed,marked,1,x0,y0+y,w,count);}
  }
  compositionMs+=performance.now()-at;blocks++;return foreground;
 }
 try{
  if(!state.metadataRetained){budget.retain(metadataBytes);state.metadataRetained=true;}report();operation?.setState('io');planning=budget.reserve(workBytes+borrowedBytes+transient);
  // Materialize real scratch before optional result banks can consume the room.
  composition=allocateOwnedTypedArray(Uint8Array,4*Math.max(width,Math.min(BLOCK,n)),{budget,reserve:b=>planning.split(b),owner:family,label:'neural-composition',operation});
  analyzed=allocateOwnedTypedArray(Uint8Array,Math.max(width,Math.min(BLOCK,n)),{budget,reserve:b=>planning.split(b),owner:family,label:'neural-analyzed',operation});
  for(const key of fields)if(!stores[key]){stores[key]=await createSegmentedBytes(n*elementBytes(key),{budget,temporarySession,getTemporarySession,storage,signal,owner:family,label:'neural-'+key});report();}planning();planning=null;working=budget.reserve(Math.max(0,workBytes-composition.data.byteLength-analyzed.data.byteLength)+borrowedBytes);
  for(let index=state.zone;index<zones.length;index++){const z=zones[index];
   checkAbort(signal);let processed=state.processed,prepared=state.prepared;const at=performance.now();let present=state.zonePresent??false;
   {
    if(!prepared&&d2){operation?.setState('waiting-child');processed=state.processed??await postprocess.run({raw:z.raw,minimum},{signal});state.processed=processed;requireValue(processed.masks instanceof Float32Array&&processed.masks.length===grid*3,'Native postprocess masks required');present=processed.masks.subarray(0,grid).some(Boolean);prepared={map:z.raw.subarray(0,grid),mask:processed.masks.subarray(0,grid),target:processed.masks.subarray(grid,grid*2),source:processed.masks.subarray(grid*2)};}
    else if(!prepared){processed=state.processed??await segmentationProbabilities({raw:z.raw,side,kind},{budget,signal});state.processed=processed;state.maskOwner??=allocateOwnedTypedArray(Float32Array,processed.mask.length,{budget,owner:family,label:'neural-mask',operation});prepared={...processed,mask:state.maskOwner.data};prepared.mask.set(processed.mask);}
    state.processed=processed;state.prepared=prepared;state.zonePresent=present;report();postprocessMs+=performance.now()-at;const [x0,y0,x1,y1]=z.bounds,planes=['map','mask',...(roles?['target','source']:[])];
    for(let pi=state.plane;pi<planes.length;pi++){const key=planes[pi];
     const before=performance.now();if(state.row<y1-y0)await spatial.run({input:prepared[key],width:side,height:side,outWidth:x1-x0,outHeight:y1-y0,nearest:key==='mask'||d2&&key!=='map'},{signal,borrowRows:true,startRow:state.row,resourceOperation:operation,rowsPerBlock:Math.max(1,Math.floor(Math.min(BLOCK,n)/Math.max(width,x1-x0))),onRows:async(values,position)=>{const found=await compose(key,values,position,z.bounds);if(!d2&&key==='mask'&&found)present=true;state.row=position.y+position.rows;state.zonePresent=present;operation?.commit();report();onProgress?.({phase:'neural-projection-rows',zone:z.id,field:key,completed:state.row,total:y1-y0});}});projectionMs+=performance.now()-before;state.plane=pi+1;state.row=0;report();
    }
    zoneMetadata[index]={id:z.id,bounds:[...z.bounds],origin:[x0,y0],analysis_shape:[roles?3:1,side,side],status:present?'ok':'empty',...(d2?{input_side:448,patchmatch_iterations:40,seed:22,min_component:minimum,role_filter:50}:{})};
   }
   processed?.release();state.maskOwner?.release();state.maskOwner=null;state.processed=state.prepared=null;
   state.zone=index+1;state.plane=state.row=0;state.zonePresent=false;report();onProgress?.({phase:d2?'zone-projection':'segmentation-projection',completed:index+1,total:zones.length});checkAbort(signal);
  }
  for(let ei=state.exclusion;ei<exclusions.length;ei++){const [x0,y0,x1,y1]=exclusions[ei],rows=Math.max(1,Math.floor(Math.min(BLOCK,n)/width)),keys=fields.filter(k=>k!=='candidates');for(let y=state.exclusionRow||y0;y<y1;y+=rows){await controlCheckpoint(signal);const count=Math.min(rows,y1-y);for(let fi=state.exclusionField;fi<keys.length;fi++){const key=keys[fi],bpp=elementBytes(key),bytes=composition.data.subarray(0,width*count*bpp);await stores[key].readInto(bytes,y*width*bpp);for(let row=0;row<count;row++)bytes.fill(0,(row*width+x0)*bpp,(row*width+x1)*bpp);await stores[key].write(bytes,y*width*bpp);state.exclusionField=fi+1;report();}state.exclusionField=0;state.exclusionRow=y+count;operation?.commit();report();}state.exclusion=ei+1;state.exclusionRow=0;report();}
  for(const store of Object.values(stores))await store.flush();checkAbort(signal);const maskBuffer=analyzed.data.subarray(0,Math.min(BLOCK,n));let present=state.present;
  for(let offset=state.scanOffset;offset<n&&!present;offset+=maskBuffer.length){await controlCheckpoint(signal);const part=maskBuffer.subarray(0,Math.min(maskBuffer.length,n-offset));await stores.mask.readInto(part,offset);present=part.some(Boolean);state.present=present;state.scanOffset=offset+part.length;report();}
  const metadata={boxes:zones.map(z=>[...z.bounds]),zones:zoneMetadata,...(d2?{exclusions:exclusions.map(b=>[...b]),min_component:minimum,exclusion_policy:'output-only-native-d2prl'}:{channel_order:roles?['target','source','background']:['union_probability'],threshold:.5,threshold_rule:roles?'target>=0.5 OR source>=0.5':'probability>0.5',raw_filter_applied:false}),status:present?'ok':'empty',probability_interpolation:'bilinear',mask_interpolation:'nearest',inference_performed:false};
  checkAbort(signal);complete=true;return{width,height,stores,metadata,dispose,metrics:{totalMs:performance.now()-started,projectionMs,compositionMs,postprocessMs,blocks,metadataBytes,storage:Object.fromEntries(fields.map(k=>[k,stores[k].storage])),resultBytes:fields.reduce((s,k)=>s+n*elementBytes(k),0)}};
 }catch(error){const failure=normalizeResourceError(error);keep=!!onCheckpoint&&isResumableResourceError(failure)&&!signal?.aborted;if(keep)report();throw failure;}finally{composition?.release();analyzed?.release();planning?.();working?.();operation?.release();if(!complete&&!keep)await dispose();}
}
