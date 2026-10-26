import {validateParams} from './ela.js';
import {toneTable} from './ela-lut.js';
import {acquireSourceRegionJpeg} from './source-region-ela.js';
import {requireValue,checkAbort,EngineError} from './errors.js';
const MAX_SIDE=2048,MAX_CONTEXTS=8192,MiB=1024**2;
/** Reduced JPEG streams remain separate per exact admitted native context. */
export async function previewSourceRegionClassic({imageId,params,side,original,derived,view,domain,budget,codec,signal}){
 const p=validateParams(params);requireValue(Number.isSafeInteger(side)&&side>=1&&side<=MAX_SIDE,'Invalid scoped Classic preview side.');
 const step=Math.max(1,Math.ceil(Math.max(domain.width,domain.height)/side)),width=Math.ceil(domain.width/step),height=Math.ceil(domain.height/step),n=width*height,rects=[];
 for(const r of view.admittedRectangles()){if(rects.length===MAX_CONTEXTS)throw new EngineError('SOURCE_SCOPE_PREVIEW_UNSUPPORTED','The provisional JPEG context count exceeds its admitted metadata bound.');rects.push({...r});}
 const prefix=imageId+'\0ela-context-preview/',identity=JSON.stringify([original.sha256,domain.fingerprint,domain.origin,domain.width,domain.height,step,rects,codec.id]),pairKey=prefix+'jpeg-pairs',sourceKey=prefix+'presentation';
 const native=derived.rgbRecompression?.entries?.has(p.quality)===true;
 const pairIdentity=identity+'/'+p.quality+'/'+(native?'retained-native-jpeg':'reduced-context-jpeg');
 let entry=budget.get(pairKey);if(entry?.identity!==pairIdentity){budget.remove(pairKey);entry=null;}
 let base=budget.get(sourceKey);if(base?.identity!==identity){budget.remove(sourceKey);base=null;}
 // Pin cache arrays before any await/allocation can evict them.
 if(entry)budget.take(pairKey);if(base)budget.take(sourceKey);
 let resident,sample,borrowed,failed=false,recompressions=0,scientificReads=0;const cacheHit=!!entry;
 try{
  if(!entry&&native)borrowed=await acquireSourceRegionJpeg({quality:p.quality,original,derived,view,domain,budget,signal});
  resident=budget.reserve(40*MiB+18*n+rects.length*512);
  if(!base){sample=await original.surface.readSampledWindow({x:domain.origin[0],y:domain.origin[1],w:domain.width,h:domain.height,step},{signal});checkAbort(signal);requireValue(sample.pixels?.width===width&&sample.pixels.height===height&&sample.pixels.format==='rgb8','The scoped presentation changed its sample grid.');base={identity,data:sample.pixels.data.slice(),byteLength:3*n};await sample.release();sample=null;}
  if(!entry){
   const contexts=[];let pairBytes=0;
   for(const r of rects){checkAbort(signal);const gx=Math.ceil(r.x/step),gy=Math.ceil(r.y/step),sw=Math.ceil((r.x+r.width)/step)-gx,sh=Math.ceil((r.y+r.height)/step)-gy;
    if(!sw||!sh){contexts.push({bounds:[r.x,r.y,r.x+r.width,r.y+r.height],status:'no-sampled-centre'});continue;}
    const data=new Uint8Array(sw*sh*3),qdata=new Uint8Array(data.length),phase=[gx*step-r.x,gy*step-r.y];
    for(let y=0;y<sh;y++){
     const x=gx*step,sy=(gy+y)*step,span=(sw-1)*step+1,loan=await view.readWindow({x,y:sy,width:span,height:1},{signal});
     try{for(let col=0;col<sw;col++)data.set(loan.pixels.data.subarray(col*step*3,col*step*3+3),(y*sw+col)*3);}finally{await loan.release();}scientificReads++;
     if(borrowed){const row=new Uint8Array(span*3);await borrowed.store.readInto(row,(sy*domain.width+x)*3);for(let col=0;col<sw;col++)qdata.set(row.subarray(col*step*3,col*step*3+3),(y*sw+col)*3);}
    }
    if(!borrowed){const decoded=await codec.recompress({width:sw,height:sh,format:'rgb8',data},p.quality,{signal});checkAbort(signal);requireValue(decoded?.width===sw&&decoded.height===sh&&decoded.format==='rgb8'&&decoded.data?.length===data.length,'The scoped preview JPEG changed its dimensions.');qdata.set(decoded.data);recompressions++;}
    contexts.push({bounds:[r.x,r.y,r.x+r.width,r.y+r.height],gx,gy,width:sw,height:sh,phase,original:data,recompressed:qdata,status:'preview'});pairBytes+=data.length+qdata.length;
   }
   entry={identity:pairIdentity,contexts,byteLength:pairBytes+rects.length*512,nativePixelSamples:!!borrowed};
  }
  const table=await toneTable(p,{signal}),data=base.data.slice();
  for(const c of entry.contexts){if(c.status!=='preview')continue;for(let y=0;y<c.height;y++){checkAbort(signal);for(let x=0;x<c.width;x++){const from=(y*c.width+x)*3,to=((y+c.gy)*width+x+c.gx)*3;for(let k=0;k<3;k++)data[to+k]=table[(c.original[from+k]<<8)|c.recompressed[from+k]];if(p.grayscale){const gray=(data[to]*9798+data[to+1]*19235+data[to+2]*3735+16384)>>15;data[to]=data[to+1]=data[to+2]=gray;}}}}
  checkAbort(signal);return{pixels:{width,height,format:'rgb8',data,preview:true,logicalWidth:domain.width,logicalHeight:domain.height},logicalWidth:domain.width,logicalHeight:domain.height,nativePixelSamples:entry.nativePixelSamples,sourceRegionDomain:domain.descriptor,sourceRegionOrigin:[...domain.origin],presentation:{preview:true,exact:false,view:'classic-preview',nativeResolution:step===1,nativePixelSamples:entry.nativePixelSamples,method:entry.nativePixelSamples?'independent-native-jpeg-pixel-samples':'independent-preview-size-jpeg-contexts',sampling:{step,phase:'Original domain lattice; per-context first admitted centre'},params:p},metrics:{preview:true,cacheHit,recompressions,scientificReads,nativeJpegReuse:entry.nativePixelSamples,contexts:entry.contexts.map(({original,recompressed,...v})=>v),admittedPixels:domain.countIncluded,workingBound:40*MiB+18*n+rects.length*512}};
 }catch(error){failed=true;throw error;}finally{
  let cleanupFailed=false,cleanupError;for(const close of[()=>sample?.release(),()=>borrowed?.release()])try{await close();}catch(error){if(!cleanupFailed){cleanupFailed=true;cleanupError=error;}}
  // Pinned arrays return to the native cache, with the same original owner/dependency.
  resident?.();if(base)budget.put(sourceKey,base,[imageId]);if(entry)budget.put(pairKey,entry,[imageId]);if(cleanupFailed&&!failed)throw cleanupError;
 }
}
