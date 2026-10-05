import "../../runtime-context.js?v=0.14.5";
import {magnifierRegion,magnifierLuts} from './magnifier.js';
import {gray} from './pixel-utils.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createRgbSurface} from './rgb-surface.js';
import {controlCheckpoint,checkAbort,EngineError,normalizeResourceError} from './errors.js';
// The histogram belongs to the entire selected oriented region. Row grouping
// is storage only; clipping and per-channel/global-gray LUT semantics are native.
export async function segmentedMagnifierLarge(image,p,{budget,signal,onProgress,cacheKey}={}){
 const {bounds,width,height}=magnifierRegion(image.surface.descriptor,p),[left,top]=bounds,n=width*height,key=cacheKey&&cacheKey+JSON.stringify(bounds)+'/histogram',cached=key&&budget.get(key),rows=Math.min(height,Math.max(1,Math.floor(262144/width))),release=budget.reserve(16384+width*(rows+1)*3);let store,reads=0;
 const start=performance.now();try{store=await createSegmentedBytes(n*3,{budget,signal,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession});const hist=cached?.value??Array.from({length:4},()=>new Uint32Array(256));
  if(!cached)for(let y=0;y<height;y+=rows){await controlCheckpoint(signal);const h=Math.min(rows,height-y),part=await image.surface.readWindow({x:left,y:top+y,width,height:h},{signal});try{const v=part.pixels.data;for(let i=0;i<v.length;i+=3){hist[0][v[i]]++;hist[1][v[i+1]]++;hist[2][v[i+2]]++;hist[3][gray(v[i],v[i+1],v[i+2])]++;}reads++;}finally{part.release();}onProgress?.({phase:'histogram',fraction:.5*(y+h)/height});}
  const tables=magnifierLuts(hist,n,p);for(let y=0;y<height;y+=rows){await controlCheckpoint(signal);const h=Math.min(rows,height-y),part=await image.surface.readWindow({x:left,y:top+y,width,height:h},{signal});try{const bytes=part.pixels.data;for(let i=0;i<bytes.length;i+=3)for(let c=0;c<3;c++)bytes[i+c]=tables[c][bytes[i+c]];await store.write(bytes,y*width*3);reads++;}finally{part.release();}onProgress?.({phase:'render',fraction:.5+.5*(y+h)/height});}
  await store.flush();checkAbort(signal);if(key&&!cached)budget.put(key,{value:hist,byteLength:4096});return {surface:createRgbSurface(store,{width,height,budget}),data:{bounds,empty:false},semantics:'Native selected-region histogram and LUT, full-resolution oriented coordinates.',metrics:{totalMs:performance.now()-start,analysisCacheHit:!!cached,sourceReads:reads,rowsPerBlock:rows,storage:store.storage,workers:1}};
 }catch(e){await store?.dispose();throw normalizeResourceError(e);}finally{release();}
}
