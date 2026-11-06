/* Bounded stored ZIP/NPY export of raw Splicebuster arrays (no pickle). */
import {scientificZipPlan,scientificZipLocal,scientificZipCentral,scientificZipEnd} from '../scientific-zip.js';
import {npyHeader} from '../npz.js';
import {requireValue,checkAbort,createCooperator} from '../errors.js';
import {allocateOwnedTypedArray,allocateTypedArray,registerArrayViews} from '../allocation.js';
import {resultDescription,requireNumeric,readNumericBytes,resourceScope,cleanupScope,pinInto} from './splicebuster-result-io.mjs';

const MiB=1024**2,encoder=new TextEncoder(),little=new Uint8Array(new Uint32Array([1]).buffer)[0]===1;
const table=Uint32Array.from({length:256},(_,n)=>{let c=n;for(let i=0;i<8;i++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
function crc(bytes,c){for(const b of bytes)c=table[(c^b)&255]^(c>>>8);return c;}
function jsonBound(value,ancestors=new Set(),depth=0){
 requireValue(depth<128,'Splicebuster metadata is too deeply nested.');
 if(value===null||typeof value!=='object')return typeof value==='string'?6*value.length+2:32;
 requireValue(!ancestors.has(value),'Cyclic Splicebuster metadata cannot be exported.');ancestors.add(value);let size=2;
 for(const key in value)if(Object.hasOwn(value,key)){size+=6*key.length+jsonBound(value[key],ancestors,depth+1)+4;requireValue(Number.isSafeInteger(size),'Unsafe metadata bound.');}ancestors.delete(value);return size;
}

/** M2-compatible random-access export. This function pins result itself.
 * read(offset,count) returns a new Uint8Array, <=4MiB: as in M2 readExport,
 * its caller must fund the returned transport buffer until sent/consumed.
 * readInto(target,offset) instead uses an already-owned destination.
 * release() waits for active reads, retires compact snapshots and unpins.
 */
export async function createSplicebusterNpzStream(result,{budget,signal,onProgress,onCleanupError,chunkBytes=MiB,zip64=false}={}){
 requireValue(budget&&typeof budget.reserve==='function'&&Number.isSafeInteger(chunkBytes)&&chunkBytes>0&&chunkBytes<=4*MiB&&typeof zip64==='boolean','Invalid Splicebuster export settings.');
 requireValue(little,'Splicebuster numeric bank exports require a little-endian platform.');
 const {d,rows,cols,n}=resultDescription(result),scope=resourceScope(),cooperate=createCooperator(signal);let failed=false;
 try{
  await pinInto(result,scope);checkAbort(signal);
  const metadata=d.metadata??{},provenance=result.provenance??{};
  scope.ownRelease(budget.reserve(65536+32*(jsonBound(metadata)+jsonBound(provenance))));
  const entries=[],segments=[];let at=0;
  const add=(key,value,descr,shape)=>{const bytes=shape.reduce((a,b)=>a*b,1)*value.BYTES_PER_ELEMENT;requireValue(Number.isSafeInteger(bytes)&&value.byteLength===bytes,'Invalid export shape for '+key);entries.push({key,value,header:npyHeader(descr,shape),bytes});};
  const snapshot=(Type,value,label)=>{const owner=allocateOwnedTypedArray(Type,value.length,{budget,owner:'splicebuster',label:'splicebuster-export-'+label});scope.own(owner);owner.data.set(value);return owner.data;};
  add('map',d.map,'<f8',[rows,cols]);add('valid',d.valid,'|u1',[rows,cols]);
  add('range0',snapshot(Float64Array,d.range0,'range0'),'<f8',[rows]);add('range1',snapshot(Float64Array,d.range1,'range1'),'<f8',[cols]);
  for(const [key,shape]of [['mu',[2,25]],['Sigma',[25,25]],['L',[50,25]]])if(d[key]!==undefined){requireNumeric(d[key],Float64Array,shape.reduce((a,b)=>a*b,1),key);requireValue(d[key] instanceof Float64Array,'Compact Splicebuster model must be in RAM.');add(key,snapshot(Float64Array,d[key],key),'<f8',shape);}
  if(d.outliersProb!==undefined){requireValue(Number.isFinite(d.outliersProb)&&d.outliersProb>=0&&d.outliersProb<=1,'Invalid Splicebuster outlier probability.');add('outliersProb',snapshot(Float64Array,[d.outliersProb],'outliersProb'),'<f8',[]);}
  add('image_shape',snapshot(BigInt64Array,[BigInt(d.height),BigInt(d.width)],'image-shape'),'<i8',[2]);
  add('map_shape',snapshot(BigInt64Array,[BigInt(rows),BigInt(cols)],'map-shape'),'<i8',[2]);
  for(const [key,value]of [['metadata_json',metadata],['browser_provenance_json',provenance]]){
   const text=JSON.stringify(value);requireValue(typeof text==='string','Export metadata must be JSON serializable.');let count=0;for(const _point of text)count++;
   const points=allocateTypedArray(Uint32Array,count,{label:'splicebuster-export-unicode'});let i=0;for(const point of text)points[i++]=point.codePointAt(0);
   entries.push({key,value:points,header:npyHeader('<U'+count,[]),bytes:points.byteLength});
  }
  for(const e of entries){e.name=encoder.encode(e.key+'.npy');e.size=e.header.length+e.bytes;}
  scope.ownRelease(registerArrayViews(budget,Object.fromEntries(entries.flatMap(e=>[[e.key+'-header',e.header],...(e.key.endsWith('_json')?[[e.key,e.value]]:[])])),{owner:'splicebuster',label:'splicebuster-export-framing'}));
  const plan=scientificZipPlan(entries,{zip64}),total=plan.capacity;
  const scratch=allocateOwnedTypedArray(Uint8Array,chunkBytes,{budget,owner:'splicebuster',label:'splicebuster-export-crc'}),scratchEntry=scope.own(scratch);
  const appendBytes=(bytes,registered=false)=>{if(!registered)scope.ownRelease(registerArrayViews(budget,{bytes},{owner:'splicebuster',label:'splicebuster-export-zip-framing'}));segments.push({start:at,length:bytes.length,bytes});at+=bytes.length;};
  for(let index=0;index<entries.length;index++){
   const e=entries[index];checkAbort(signal);let c=crc(e.header,0xffffffff);
   for(let offset=0;offset<e.bytes;offset+=chunkBytes){await cooperate();const part=scratch.data.subarray(0,Math.min(chunkBytes,e.bytes-offset));await readNumericBytes(e.value,part,offset,{signal});c=crc(part,c);}
   e.crc=(c^0xffffffff)>>>0;e.offset=at;
   const local=scientificZipLocal(e);new DataView(local.buffer).setUint32(14,e.crc,true);appendBytes(local);appendBytes(e.header,true);segments.push({start:at,length:e.bytes,value:e.value});at+=e.bytes;
   await onProgress?.({phase:'export',completed:index+1,total:entries.length});checkAbort(signal);
  }
  requireValue(at===plan.central,'Invalid Splicebuster ZIP central offset.');for(const e of entries)appendBytes(scientificZipCentral(e));appendBytes(scientificZipEnd(plan));requireValue(at===total,'Invalid Splicebuster NPZ size.');
  await scope.retire(scratchEntry);checkAbort(signal);
  let closed=false,retiring;const pending=new Set();
  const readInto=(target,offset=0)=>{
   requireValue(!closed&&target instanceof Uint8Array&&target.length>0&&target.byteLength<=4*MiB&&Number.isSafeInteger(offset)&&offset>=0&&offset<=total-target.length,'Invalid Splicebuster NPZ window.');
   const task=(async()=>{checkAbort(signal);for(const s of segments){const a=Math.max(offset,s.start),b=Math.min(offset+target.length,s.start+s.length);if(a<b){const out=target.subarray(a-offset,b-offset);if(s.bytes)out.set(s.bytes.subarray(a-s.start,b-s.start));else await readNumericBytes(s.value,out,a-s.start,{signal});}}checkAbort(signal);return target;})();
   pending.add(task);task.then(()=>pending.delete(task),()=>pending.delete(task));return task;
  };
  return {mime:'application/zip',length:total,maximumWindowBytes:4*MiB,
   read(offset,count){requireValue(!closed&&Number.isSafeInteger(count)&&count>0&&count<=4*MiB&&Number.isSafeInteger(offset)&&offset>=0&&offset<=total-count,'Invalid Splicebuster NPZ window.');return readInto(allocateTypedArray(Uint8Array,count,{label:'splicebuster-export-transport'}),offset);},
   readInto,
   release(){closed=true;if(retiring)return retiring;retiring=(async()=>{await Promise.allSettled([...pending]);await scope.release();segments.length=0;entries.length=0;})();return retiring.finally(()=>{retiring=null;});}
  };
 }catch(error){failed=true;throw error;}finally{if(failed)await cleanupScope(scope,true,onCleanupError);}
}
