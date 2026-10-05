import "../../runtime-context.js?v=0.14.5";
import {EngineError,requireValue,checkpoint,checkAbort} from './errors.js';
import {PRNU_SCHEMA} from './prnu.js';
let pending,module,serial=0;
async function library(){pending??=import('../vendor/h5wasm/hdf5_hl.js');const h5=(await pending).default;module=await h5.ready;return h5;}
export const prnuHdf5HeapBytes=()=>module?.HEAPU8.buffer.byteLength??0;
const attribute=(object,name,fallback)=>Object.hasOwn(object.attrs,name)?object.attrs[name].value:fallback;
const countAttribute=(group,name)=>{const value=attribute(group,name,null);if(value===null)return null;const number=Number(value);return Number.isSafeInteger(number)&&number>=0?number:null;};
const memoryCheck=(bytes,limit)=>{if(!Number.isSafeInteger(bytes)||bytes>limit||bytes>1900*1024**2)throw new EngineError('MEMORY_LIMIT','PRNU database exceeds its admitted HDF5 working set.');};
function manifest(value){
 const parsed=JSON.parse(value);requireValue(Array.isArray(parsed)&&parsed.every(x=>x&&typeof x==='object'&&typeof x.sha256==='string'),'Invalid PRNU training manifest.');return parsed;
}
export async function readPrnuDatabase(bytes,{signal,maxWorkingBytes,admit=()=>()=>{}}={}){
 requireValue(bytes instanceof Uint8Array&&bytes.length>0,'Original HDF5 bytes are required.');requireValue(Number.isSafeInteger(maxWorkingBytes)&&maxWorkingBytes>0,'An explicit HDF5 working budget is required.');
 memoryCheck(bytes.byteLength*3+64*1024**2,maxWorkingBytes);const baseRelease=admit(bytes.byteLength*3+64*1024**2);
 let file,name,arraysRelease;try{
  await checkpoint(signal);const h5=await library();checkAbort(signal);name='/prnu-read-'+(++serial)+'.h5';module.FS.writeFile(name,bytes);file=new h5.File(name,'r');
  const schema=attribute(file,'schema',null),complete=attribute(file,'complete',false),legacy=schema===null;
  requireValue(legacy||(schema===PRNU_SCHEMA&&Boolean(complete)),'Unsupported or incomplete PRNU fingerprint database.');
  const names=file.keys();requireValue(names.length>0,'PRNU fingerprint database is empty.');let total=0;const prepared=[];
  for(const camera of names){
   await checkpoint(signal);const group=file.get(camera);requireValue(group instanceof h5.Group,'Invalid PRNU camera group.');const dataset=group.get('fingerprint');requireValue(dataset instanceof h5.Dataset,'Missing PRNU fingerprint.');const m=dataset.metadata;
   requireValue(m.type===1&&m.size===8&&!m.vlen&&m.littleEndian&&m.shape?.length===2&&m.shape.every(x=>Number.isSafeInteger(x)&&x>0),'Invalid native float64 PRNU fingerprint.');
   const [height,width]=m.shape,n=width*height;requireValue(Number.isSafeInteger(n),'Invalid PRNU dimensions.');total+=n*8;memoryCheck(bytes.byteLength*3+64*1024**2+total*3,maxWorkingBytes);
   const rawManifest=attribute(group,'training_manifest',null);
   prepared.push({name:camera,dataset,width,height,trainingManifest:rawManifest===null?null:manifest(rawManifest),nImages:countAttribute(group,'n_images'),nUsed:countAttribute(group,'n_used'),skippedImages:JSON.parse(attribute(group,'skipped_images','[]'))});
  }
  arraysRelease=admit(total*3);const cameras=[];
  for(const camera of prepared){
   await checkpoint(signal);const raw=camera.dataset.value;requireValue(raw instanceof Float64Array&&raw.length===camera.width*camera.height,'Invalid PRNU fingerprint data.');const values=raw.slice();
   for(let i=0;i<values.length;i++){if(i%65536===0)await checkpoint(signal);requireValue(Number.isFinite(values[i]),'Non-finite PRNU fingerprint.');}
   const {dataset,width,height,...metadata}=camera;cameras.push({...metadata,fingerprint:{width,height,values}});
  }
  const trainingMembershipVerified=!legacy&&cameras.every(x=>x.trainingManifest?.length>=2&&x.nUsed===x.trainingManifest.length&&x.trainingManifest.every(item=>typeof item.name==='string'&&/^[a-f0-9]{64}$/.test(item.sha256)));
  checkAbort(signal);return {schema,legacy,complete:legacy?null:Boolean(complete),trainingMembershipVerified,cameras,decodedBytes:total};
 }catch(e){checkAbort(signal);if(e instanceof EngineError)throw e;throw new EngineError('INVALID_INPUT','Unreadable PRNU HDF5 database or metadata.');}
 finally{try{file?.close();}finally{if(name){try{module.FS.unlink(name);}catch{}}arraysRelease?.();baseRelease();}}
}
export async function writePrnuDatabase(database,{signal,maxWorkingBytes,admit=()=>()=>{}}={}){
 requireValue(database?.schema===PRNU_SCHEMA&&database.complete===true&&Array.isArray(database.cameras)&&database.cameras.length>0,'A complete PRNU training snapshot is required.');
 requireValue(Number.isSafeInteger(maxWorkingBytes)&&maxWorkingBytes>0,'An explicit HDF5 working budget is required.');const names=new Set();let bytes=0;
 for(const camera of database.cameras){
  requireValue(typeof camera.name==='string'&&camera.name.length>0&&!camera.name.includes('/')&&!camera.name.includes('\0')&&!['.','..'].includes(camera.name)&&!names.has(camera.name),'Invalid or duplicate PRNU camera name.');names.add(camera.name);
  const fp=camera.fingerprint;requireValue(fp?.values instanceof Float64Array&&Number.isSafeInteger(fp.width)&&Number.isSafeInteger(fp.height)&&fp.width>0&&fp.height>0&&fp.values.length===fp.width*fp.height&&fp.values.every(Number.isFinite),'Invalid PRNU fingerprint.');
  requireValue(Array.isArray(camera.trainingManifest)&&camera.trainingManifest.length>=2&&camera.trainingManifest.every(x=>x&&typeof x.name==='string'&&/^[a-f0-9]{64}$/.test(x.sha256))&&camera.nUsed===camera.trainingManifest.length&&Number.isInteger(camera.nImages)&&camera.nImages>=camera.nUsed,'Invalid PRNU training snapshot metadata.');
  bytes+=fp.values.byteLength+new TextEncoder().encode(JSON.stringify(camera.trainingManifest)).byteLength;
 }
 const working=bytes*4+64*1024**2;memoryCheck(working,maxWorkingBytes);const release=admit(working);let file,name;
 try{
  await checkpoint(signal);const h5=await library();checkAbort(signal);name='/prnu-write-'+(++serial)+'.h5';file=new h5.File(name,'x',{libver:'v110'});file.create_attribute('schema',PRNU_SCHEMA);file.create_attribute('complete',0,null,'<i4');
  for(const camera of database.cameras){
   await checkpoint(signal);const group=file.create_group(camera.name),fp=camera.fingerprint;
   group.create_dataset({name:'fingerprint',data:fp.values,shape:[fp.height,fp.width],dtype:'<d',chunks:[Math.min(fp.height,128),Math.min(fp.width,128)],compression:'gzip',compression_opts:4});
   group.create_attribute('n_images',camera.nImages,null,'<i4');group.create_attribute('n_used',camera.nUsed,null,'<i4');group.create_attribute('shape',Int32Array.of(fp.height,fp.width));group.create_attribute('training_manifest',JSON.stringify(camera.trainingManifest));group.create_attribute('skipped_images',JSON.stringify(camera.skippedImages??[]));
  }
  checkAbort(signal);file.delete_attribute('complete');file.create_attribute('complete',1,null,'<i4');file.close();file=null;const result=module.FS.readFile(name);checkAbort(signal);return result;
 }catch(e){checkAbort(signal);if(e instanceof EngineError)throw e;throw new EngineError('INVALID_INPUT','PRNU HDF5 snapshot could not be written.');}
 finally{try{file?.close();}finally{if(name){try{module.FS.unlink(name);}catch{}}release();}}
}
