import "../../runtime-context.js?v=0.30.0";
import {createNumericSurface} from './numeric-surface.js';
import {createMaskSurface} from './rgb-surface.js';
import {requireValue,checkAbort,controlCheckpoint} from './errors.js';

const formats=new Map([[Float32Array,'float32'],[Float64Array,'float64'],[Int32Array,'int32'],[Uint8Array,'mask8']]);
const typeFormat=data=>formats.get(data?.constructor);
function tensor(value,width,height){
 if(ArrayBuffer.isView(value))return {data:value,width,height};
 if(!value?.data)return null;
 // Public full-source scalar planes can be NCHW or NHWC (Comprint).
 // Source geometry is authoritative when there is exactly one sample/pixel.
 if(value.data.length===width*height)return {data:value.data,width,height};
 const dims=[...(value.dims??[height,width])];
 while(dims.length>2&&dims[0]===1)dims.shift();
 while(dims.length>2&&dims.at(-1)===1)dims.pop();
 requireValue(dims.length===2,'A scalar extension plane must have two spatial dimensions.');
 return {data:value.data,width:dims[dims.length-1],height:dims[dims.length-2]};
}
export function extensionPlanes(result,{width,height}){
 const definitions=[];
 const add=(key,value,semantics,range)=>{
  const plane=tensor(value,width,height);if(!plane)return;
  const format=typeFormat(plane.data);requireValue(format&&plane.data.length===plane.width*plane.height,'Extension scientific plane geometry/type mismatch.');
  definitions.push({key,...plane,format,semantics,range,coordinates:plane.width===width&&plane.height===height?'full-resolution':'native-analysis-grid'});
 };
 if(result.method==='comprint'){
  add('anomaly',result.anomaly,'Compression-fingerprint distance, not a forgery probability.');
  add('fingerprint',result.fingerprint,'Learned compression fingerprint; raw network response.');
 }else if(result.method==='doctamper'){
  add('foreground',result.scoreMap,'Local documentary-text foreground activation; NaN means unprocessed.',[0,1]);
  add('analyzed',result.validRegion,'255=processed;0=unprocessed.',[0,255]);
  add('mask',result.mask,'Foreground activation at the declared display threshold; not a forgery verdict.',[0,255]);
 }
 return definitions;
}
async function rangeOf(plane,signal){
 if(plane.range)return plane.range;
 let low=Infinity,high=-Infinity;
 for(let i=0;i<plane.data.length;i++){
  if(i%1048576===0)await controlCheckpoint(signal);
  const value=plane.data[i];if(Number.isFinite(value)){low=Math.min(low,value);high=Math.max(high,value);}
 }
 return Number.isFinite(low)?[low,high]:[0,1];
}
/** No copy of a full plane. Each core surface owns a share of the borrowed
 * extension lease and copies only the requested scientific/display window. */
export async function createExtensionResultRecord(result,geometry,{budget,scheduler,retain,signal,metadata,planes:preparedPlanes}={}){
 const planes=preparedPlanes??extensionPlanes(result,geometry),records=[];
 if(!planes.length)return null;
 const admission=await scheduler.acquire({cpu:1,signal,resourceOwner:'extensions/surfaces',label:'extensions-surface-range'});
 const analysis={method:result.method,planes,metadata:{...metadata,scientific_planes:Object.fromEntries(planes.map(({key,width,height,format,coordinates,semantics})=>[key,{width,height,format,coordinates,semantics}]))}};
 try{
  for(const plane of planes){
   checkAbort(signal);const release=retain();let closed=false,surface;
   const byteLength=plane.byteLength??plane.data.byteLength;
   const store={byteLength,storage:plane.store?.storage??'borrowed-extension-result',
    readInto(target,offset){requireValue(!closed&&target instanceof Uint8Array&&Number.isSafeInteger(offset)&&offset>=0&&offset<=byteLength-target.byteLength,'Extension plane read outside live storage.');if(plane.store)return plane.store.readInto(target,offset);target.set(new Uint8Array(plane.data.buffer,plane.data.byteOffset+offset,target.byteLength));},
    async dispose(){if(closed)return;closed=true;await release();}
   };
   try{
    const range=await rangeOf(plane,signal);
    surface=plane.format==='mask8'?createMaskSurface(store,{width:plane.width,height:plane.height,budget,range,semantics:plane.semantics}):createNumericSurface(store,{width:plane.width,height:plane.height,format:plane.format,budget,semantics:plane.semantics});
    surface={...surface,descriptor:Object.freeze({...surface.descriptor,range:Object.freeze(range),coordinates:plane.coordinates,sourceWidth:geometry.width,sourceHeight:geometry.height})};
    records.push({key:plane.key,surface,extensionsAnalysis:analysis,semantics:plane.semantics});
   }catch(error){await store.dispose();throw error;}
  }
  const [primary,...auxiliary]=records,planeRecords={},maskRecords={};
  for(const record of auxiliary)(record.surface.descriptor.format==='mask8'?maskRecords:planeRecords)[record.key]=record;
  return {...primary,planeRecords,maskRecords};
 }catch(error){await Promise.allSettled(records.map(r=>r.surface.dispose()));throw error;}
 finally{admission.release();}
}
