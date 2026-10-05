import "../../runtime-context.js?v=0.14.5";
import {streamedImageHashes} from './digest-stream.js';
import {extraImageHashes} from './digest-extra.js';
import {filenameBallistics,signatureMime} from './source-file.js';
import {parameters} from './pixel-utils.js';import {checkpoint,checkAbort} from './errors.js';
import {cvHash} from './opencv.js';
export const digestParams=(p={})=>parameters(p,{imageHashes:true},{},{},['imageHashes']);
export async function fileDigest(image,p,hooks={},context){
 const includeImage=Boolean(image||context.surface)&&p.imageHashes!==false;
 const h=await import('../vendor/hash-wasm/hashes.js');
 const factories=[['MD5',()=>h.createMD5()],['SHA-1',()=>h.createSHA1()],['SHA2-224',()=>h.createSHA224()],['SHA2-256',()=>h.createSHA256()],['SHA2-384',()=>h.createSHA384()],['SHA2-512',()=>h.createSHA512()],...([224,256,384,512].map(bits=>['SHA3-'+bits,()=>h.createSHA3(bits)]))];
 const states=[];for(const [name,create] of factories){checkAbort(hooks.signal);states.push([name,await create()]);}
 let detectedMimeType=null;const prefix=new Uint8Array(16);
 const byteLength=context.source?.byteLength??context.bytes.length,update=(chunk,offset)=>{if(offset<16){const count=Math.min(16-offset,chunk.length);prefix.set(chunk.subarray(0,count),offset);detectedMimeType=signatureMime(prefix.subarray(0,offset+count));}for(const [,state] of states)state.update(chunk);hooks.onProgress?.((includeImage?.8:1)*(byteLength?Math.min(1,(offset+chunk.length)/byteLength):1));};
 if(context.source)await context.source.visit(update,{signal:hooks.signal});
 else for(let offset=0;offset<byteLength;offset+=1024**2){await checkpoint(hooks.signal);update(context.bytes.subarray(offset,offset+1024**2),offset);}
 checkAbort(hooks.signal);const imageHashes={};let engineMetrics,completed=0;if(includeImage&&!context.surface)for(const [kind,name] of [[0,'Average'],[1,'Block mean'],[4,'pHash']]){imageHashes[name]=await cvHash(image,kind,hooks);hooks.onProgress?.(.8+.2*(++completed)/6);}
 if(includeImage&&!context.surface)Object.assign(imageHashes,await extraImageHashes(image,{signal:hooks.signal,account:context.reserveMemory,onProgress:f=>hooks.onProgress?.(.8+.2*(3+2*f)/6)}));
 if(includeImage&&!context.surface){
  // This adapter exposes existing contiguous rows without a second RGB copy.
  // Radial uses the same native angle/reduction arithmetic on both layouts.
  const surface={descriptor:{width:image.width,height:image.height,format:'rgb8'},readWindow:async({y,height})=>({pixels:{data:image.data.subarray(y*image.width*3,(y+height)*image.width*3)},release(){}})};
  const result=await streamedImageHashes(surface,{algorithms:[5],signal:hooks.signal,account:context.reserveMemory,onProgress:f=>hooks.onProgress?.(.8+.2*(5+f)/6)});Object.assign(imageHashes,result.hashes);engineMetrics=result.metrics;
 }
 if(includeImage&&context.surface){const result=await streamedImageHashes(context.surface,{signal:hooks.signal,account:context.reserveMemory,onProgress:f=>hooks.onProgress?.(.8+.2*f)});Object.assign(imageHashes,result.hashes);engineMetrics=result.metrics;}
 const file=context.sourceFile??{},physicalFile={name:file.name??null,sizeBytes:byteLength,declaredMimeType:file.declaredMimeType??null,signatureMimeType:detectedMimeType,lastModified:file.lastModified??null,metadataOrigin:file.origin??null,nameBallistics:file.name===null||file.name===undefined?null:filenameBallistics(file.name),unavailable:['parentFolder','owner','permissions','creationTime','lastAccess','metadataChanged']};
 return {...(engineMetrics?{engineMetrics}:{}),data:{bytes:byteLength,physicalFile,hashes:Object.fromEntries(states.map(([name,state])=>[name,state.digest('hex')])),imageHashes,imageHashStatus:p.imageHashes===false?'Not requested (imageHashes:false)':includeImage?'Six image hashes validated on the declared native corpus':'No pixels supplied',unavailable:{}},semantics:'Cryptographic digests use unchanged source bytes; perceptual hashes use decoded RGB8. Matching digests establish byte identity, not image authenticity. Filename patterns are weak naming hints and do not identify a camera; supplied file properties are distinct from signature-derived MIME and filesystem stat.'};
}
