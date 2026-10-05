// Development comparison only. Never imported by the runtime or product.
import {Budget} from '../src/cache.js';
import {createSegmentedBytes} from '../src/segmented-bytes.js';
import {createRgbSurface} from '../src/rgb-surface.js';
import {DenseImageEngine} from '../src/dense-image.js';
self.onmessage=async({data:request})=>{
 const {width,height,forcePaged=false}=request,budget=new Budget(512*1024**2),rgb=Uint8Array.from({length:width*height*3},(_,i)=>{const pixel=Math.floor(i/3),x=pixel%width%(width/2),y=Math.floor(pixel/width);return (Math.imul(x,7919)+Math.imul(y,104729)+(i%3)*97+(x*y*37))&255;});let surface,engine,result;
 try{
  const started=performance.now(),source=await createSegmentedBytes(rgb.byteLength,{budget,storage:'memory'});await source.write(rgb);surface=createRgbSurface(source,{width,height,budget});engine=new DenseImageEngine({surface},budget,{maxWorkers:3,residentSurface:!forcePaged});
  result=await engine.analyze({profile:'Extended: PatchMatch Zernike + PatchMatch SIFT + Mirror',patch:8,iterations:2,radius:160,texture:2,coherence:true,limit:250});
  const arrays=[];for(const field of result.fields)for(const key of ['targets','distancesSquared','allowed','selected','errors'])if(field[key]){const bytes=new Uint8Array(field[key].byteLength);await field[key].readInto(bytes);arrays.push(bytes);}
  const totalMs=performance.now()-started,hashes=[];self.postMessage({timedResultReady:true});
  // Verification follows the timed requested pipeline; no reference/calibration
  // is performed before or inside its execution.
  for(const array of arrays)hashes.push(Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',array)),n=>n.toString(16).padStart(2,'0')).join(''));
  const info={width,height,forcePaged,totalMs,peakAccountedBytes:budget.peak,metrics:result.metrics,comparisons:result.fields.map(field=>String(field.comparisons)),links:result.fields.map(field=>field.uniqueLinks),hashes};
  await result.release();result=null;await engine.dispose();engine=null;await surface.dispose();surface=null;if(budget.total())throw Error('Budget leak '+budget.total());self.postMessage({result:info});
 }catch(error){self.postMessage({error:{code:error.code,message:error.message,stack:error.stack}});}
 finally{await result?.release();await engine?.dispose();await surface?.dispose();}
};
