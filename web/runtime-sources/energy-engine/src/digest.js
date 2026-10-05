import {parameters} from './pixel-utils.js';import {checkpoint,checkAbort} from './errors.js';
import {cvHash} from './opencv.js';
export const digestParams=(p={})=>parameters(p,{imageHashes:true},{},{},['imageHashes']);
export async function fileDigest(image,p,hooks={},context){
 const h=await import('../vendor/hash-wasm/hashes.js');
 const factories=[['MD5',()=>h.createMD5()],['SHA-1',()=>h.createSHA1()],['SHA2-224',()=>h.createSHA224()],['SHA2-256',()=>h.createSHA256()],['SHA2-384',()=>h.createSHA384()],['SHA2-512',()=>h.createSHA512()],...([224,256,384,512].map(bits=>['SHA3-'+bits,()=>h.createSHA3(bits)]))];
 const states=[];for(const [name,create] of factories){checkAbort(hooks.signal);states.push([name,await create()]);}
 const byteLength=context.source?.byteLength??context.bytes.length,update=(chunk,offset)=>{for(const [,state] of states)state.update(chunk);hooks.onProgress?.(byteLength?Math.min(1,(offset+chunk.length)/byteLength):1);};
 if(context.source)await context.source.visit(update,{signal:hooks.signal});
 else for(let offset=0;offset<byteLength;offset+=1024**2){await checkpoint(hooks.signal);update(context.bytes.subarray(offset,offset+1024**2),offset);}
 checkAbort(hooks.signal);const includeImage=Boolean(image)&&p.imageHashes!==false,imageHashes={};if(includeImage)for(const [kind,name] of [[0,'Average'],[1,'Block mean'],[4,'pHash'],[5,'Radial variance']])imageHashes[name]=await cvHash(image,kind,hooks);
 return {data:{bytes:byteLength,hashes:Object.fromEntries(states.map(([name,state])=>[name,state.digest('hex')])),imageHashes,imageHashStatus:p.imageHashes===false?'Not requested (imageHashes:false)':includeImage?'Four byte hashes validated; Color moments and Marr-Hildreth unavailable because native comparisons differ':'No pixels supplied',unavailable:{'Color moments':'Native float64 hash mismatch; maximum measured absolute error 4.674e-6.','Marr-Hildreth':'Native binary hash differs on two synthetic cases; not returned as equivalent.',filenameBallistics:'Original filename is not part of the image-byte contract.'}},semantics:'Cryptographic digests use unchanged source bytes; perceptual hashes use decoded RGB8. Matching digests establish byte identity, not image authenticity.'};
}
