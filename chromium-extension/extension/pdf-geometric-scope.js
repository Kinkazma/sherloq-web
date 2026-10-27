import './native-runtime.js';
import {subimageData,subimageParams} from './pdf-panel-detector.js';
import {Budget} from './vendor/unified-engine/src/cache.js';
import {composePDFSubimageScope,pdfSubimageFingerprint} from './pdf-subimages.js';
import {PDF_DOMAIN_DETECTOR} from './pdf-scope-version.js';

export {PDF_DOMAIN_DETECTOR};
const cacheName='sherloq-pdf-subimage-domains-v1',extensionVersion=globalThis.chrome?.runtime?.getManifest?.().version??'development';
const sha=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
const abort=signal=>signal?.throwIfAborted();
function valid(scope,image,hash){return scope?.schema==='sherloq.pdf-subimages/1'&&scope.width===image.width&&scope.height===image.height&&scope.sourceSha256===hash&&scope.provenance?.detector===PDF_DOMAIN_DETECTOR&&Array.isArray(scope.subimages)&&scope.subimages.length>0&&scope.subimages.every(r=>r&&[r.x0,r.y0,r.x1,r.y1].every(Number.isSafeInteger)&&r.x0>=0&&r.y0>=0&&r.x1>r.x0&&r.y1>r.y0&&r.x1<=image.width&&r.y1<=image.height);}

export async function detectPDFGeometricScope(image,{signal,cacheStorage=globalThis.caches}={}){
 abort(signal);
 const sourceSha256=await sha(await image.blob.arrayBuffer());abort(signal);
 const cache=cacheStorage?await cacheStorage.open(cacheName):null,key='https://sherloq.invalid/__pdf_domains__/'+PDF_DOMAIN_DETECTOR+'/'+extensionVersion+'/'+sourceSha256;
 if(cache){const stored=await cache.match(key);if(stored)try{const scope=await stored.json();if(valid(scope,image,sourceSha256)&&scope.fingerprint===await pdfSubimageFingerprint(scope)){abort(signal);return {...scope,metrics:{...scope.metrics,cacheHit:true}};}}catch(error){abort(signal);}}
 const started=performance.now(),budget=new Budget(2*1024**3),releases=[];let bitmap,canvas;
 try{
  const n=image.width*image.height;if(!Number.isSafeInteger(n)||n<1||n>100_000_000)throw Error('Dimensions PDF invalides.');
  releases.push(budget.reserve(n*15));
  bitmap=await createImageBitmap(image.blob);abort(signal);if(bitmap.width!==image.width||bitmap.height!==image.height)throw Error('Dimensions PDF incohérentes.');
  canvas=new OffscreenCanvas(image.width,image.height);const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.fillStyle='white';ctx.fillRect(0,0,image.width,image.height);ctx.drawImage(bitmap,0,0);bitmap.close();bitmap=null;
  const rgba=ctx.getImageData(0,0,image.width,image.height).data,rgb=new Uint8Array(n*3);
  for(let a=0,b=0;a<rgba.length;a+=4,b+=3){rgb[b]=rgba[a];rgb[b+1]=rgba[a+1];rgb[b+2]=rgba[a+2];}
  canvas.width=canvas.height=1;canvas=null;abort(signal);
  const result=await subimageData({width:image.width,height:image.height,format:'rgb8',data:rgb},subimageParams(),{signal},{reserveMemory:bytes=>releases.push(budget.reserve(bytes))});abort(signal);
  const scope=composePDFSubimageScope(image,{width:image.width,height:image.height,sourceSha256,panels:{panels:result.data.regions.map(r=>({rectangle:r.bounds})),detector:{kind:'geometric',operation:'subimages.detect',version:PDF_DOMAIN_DETECTOR}},provenance:{detector:PDF_DOMAIN_DETECTOR,extensionVersion,classificationApplied:false}});
  scope.fingerprint=await pdfSubimageFingerprint(scope);scope.metrics={milliseconds:performance.now()-started,cacheHit:false,nativePixels:n};abort(signal);
  if(cache){await cache.put(key,new Response(JSON.stringify(scope),{headers:{'Content-Type':'application/json'}}));const keys=await cache.keys();for(const old of keys.slice(0,Math.max(0,keys.length-128)))await cache.delete(old);}
  abort(signal);return scope;
 }finally{bitmap?.close();if(canvas)canvas.width=canvas.height=1;for(const release of releases)release();}
}
