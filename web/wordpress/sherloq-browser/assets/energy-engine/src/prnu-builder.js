import "../../runtime-context.js?v=0.14.5";
import {requireValue,checkpoint,checkAbort} from './errors.js';
import {PRNU_SCHEMA,prnuAdmission} from './prnu.js';
import {cvPrnuResidual} from './opencv.js';
import {jpegCodec} from './jpeg.js';
const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
export const prnuCameraLabel=name=>{const dot=name.lastIndexOf('.'),stem=dot>0?name.slice(0,dot):name,parts=stem.split('_');return parts.length>=3?parts.slice(0,-1).join('_'):stem;};
const validLabel=name=>typeof name==='string'&&name.length>0&&!name.includes('/')&&!name.includes('\0')&&!['.','..'].includes(name);
function hdf5NameOrder(a,b){const encode=new TextEncoder(),x=encode.encode(a.name),y=encode.encode(b.name);for(let i=0;i<Math.min(x.length,y.length);i++)if(x[i]!==y[i])return x[i]-y[i];return x.length-y.length;}

// Blob/File inputs are immutable and structured-cloneable. Read just one JPEG
// at a time; decoded images are never retained with the accumulated fingerprint.
// Returned arrays remain admitted until the caller consumes/releases the snapshot.
export async function buildPrnuSnapshot(input,querySha256,{signal,onProgress,admit,fast=true}={}){
 requireValue(Array.isArray(input.files)&&input.files.length>0,'Select JPEG files for the new PRNU snapshot.');
 requireValue(input.singleCamera==null||validLabel(input.singleCamera),'Invalid single-camera label.');
 requireValue(typeof admit==='function','An explicit PRNU working-set admission is required.');
 const grouped=new Map(),releases=new Set();let metadataRelease;
 const hold=bytes=>{const release=admit(bytes);releases.add(release);return ()=>{if(releases.delete(release))release();};};
 const releaseAll=()=>{for(const release of releases)release();releases.clear();metadataRelease?.();metadataRelease=null;};
 try{
  let metadataBytes=0;
  for(const item of input.files){requireValue(typeof item?.name==='string'&&!item.name.includes('\0'),'A training file name is required.');metadataBytes+=item.name.length*8+2048;}
  metadataRelease=admit(metadataBytes);
  for(const item of input.files){
   const blob=item.blob??item;requireValue(blob instanceof Blob,'PRNU training files must be immutable Blob/File values.');
   const name=item.name.split('/').at(-1);if(!/^.+\.jpe?g$/i.test(name))continue;
   const label=input.singleCamera??prnuCameraLabel(name);requireValue(validLabel(label),'Invalid camera label derived from a file name.');
   if(!grouped.has(label))grouped.set(label,[]);grouped.get(label).push({name,blob});
  }
  const groups=[...grouped].filter(([,files])=>files.length>=2);requireValue(groups.length>0,'At least two JPEGs per camera are required. Use a single-camera label for ordinary filenames.');
  const cameras=[];let done=0,total=groups.reduce((sum,[,files])=>sum+files.length,0);
  for(const [name,files] of groups){
   let mean=null,meanRelease;const trainingManifest=[],skippedImages=[];
   for(const item of files){
    await checkpoint(signal);const byteRelease=admit(item.blob.size*3+32*1024**2);let workingRelease;
    try{
     const bytes=new Uint8Array(await item.blob.arrayBuffer());checkAbort(signal);const digest=await sha(bytes);checkAbort(signal);
     if(digest===querySha256){skippedImages.push({name:item.name,reason:'query excluded from training'});continue;}
     requireValue(bytes[0]===255&&bytes[1]===216,'Unreadable JPEG signature.');
     const shape=jpegCodec.inspect(bytes);workingRelease=admit(prnuAdmission(shape));
     const residual=await cvPrnuResidual(await jpegCodec.decode(bytes,{signal}),{signal,fast});
     const count=trainingManifest.length+1,width=Math.min(mean?.width??residual.width,residual.width),height=Math.min(mean?.height??residual.height,residual.height);
     let values=residual.values;
     if(mean){values=new Float64Array(width*height);for(let y=0;y<height;y++)for(let x=0;x<width;x++){const value=mean.values[y*mean.width+x];values[y*width+x]=value+(residual.values[y*residual.width+x]-value)/count;}}
     const nextRelease=hold(values.byteLength);meanRelease?.();meanRelease=nextRelease;mean={width,height,values};trainingManifest.push({name:item.name,sha256:digest});
    }catch(error){
     // Corrupt/unreadable images are skipped as in the native snapshot builder.
     // Unsupported codecs, budget failures and cancellation abort explicitly.
     if(error.code!=='INVALID_INPUT')throw error;
     skippedImages.push({name:item.name,reason:error.message});
    }finally{workingRelease?.();byteRelease();done++;onProgress?.(done/total);}
   }
   requireValue(trainingManifest.length>=2,name+': fewer than two readable JPEGs remain after query exclusion.');
   cameras.push({name,fingerprint:mean,trainingManifest,skippedImages,nImages:files.length,nUsed:trainingManifest.length});
  }
  await checkpoint(signal);cameras.sort(hdf5NameOrder);
  const database={schema:PRNU_SCHEMA,complete:true,legacy:false,trainingMembershipVerified:true,cameras,decodedBytes:cameras.reduce((sum,c)=>sum+c.fingerprint.values.byteLength,0)};
  return {database,release:releaseAll};
 }catch(error){releaseAll();throw error;}
}
