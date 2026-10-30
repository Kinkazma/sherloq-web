import "../../runtime-context.js?v=0.30.0";
import {retireCompositeOwners} from './composite-owner-release.js';
import {checkAbort,requireValue,EngineError} from './errors.js';

/** Spatial presentation of ONE explicitly selected native ELA population.
 * Overlaps never combine scores; Original outside that selected context is display only; numeric gaps are NaN, never a zero score.
 * No data from this compositor is sent back to a JPEG/statistics provider. */
export function createAutomaticCompleteElaPresentation(value,{image,budget}={}){
 const {width,height,contextOwner}=value,source=(image.originalSource??image).surface,origin=contextOwner.origin;
 const held=new Set(),reads=new Set();let closed=false,disposal;
 const alive=signal=>{checkAbort(signal);if(closed)throw new EngineError('DISPOSED','Complete ELA presentation is retired.');};
 function run(work){alive();const promise=Promise.resolve().then(work);reads.add(promise);promise.then(()=>reads.delete(promise),()=>reads.delete(promise));return promise;}
 const release=async lease=>{await lease.release();held.delete(lease);};
 const selected=id=>{if(id===null)return null;if(id===undefined)return value.nativeContexts.find(f=>f.raw)??null;const context=value.nativeContexts.find(f=>f.context.id===id&&f.raw);requireValue(context,'Unknown or unavailable native ELA context.');return context;};
 const makeSurface=(energyField,contextId)=>({descriptor:{id:'complete-ela-'+contextOwner.fingerprint+(energyField?'/'+energyField:'')+'/'+String(contextId??'Original'),revision:1,width,height,format:'rgb8'},readWindow(rect,{signal}={}){return run(async()=>{
  alive(signal);requireValue(['x','y','width','height'].every(k=>Number.isSafeInteger(rect[k]))&&rect.x>=0&&rect.y>=0&&rect.width>0&&rect.height>0&&rect.x+rect.width<=width&&rect.y+rect.height<=height,'Complete ELA presentation window exceeds its grid.');
  const free=budget.reserve(rect.width*rect.height*3);let returned=false,rowFree,row;
  try{
   const base=await source.readWindow({...rect,x:rect.x+origin[0],y:rect.y+origin[1]},{signal});held.add(base);const data=base.pixels.data.slice();await release(base);alive(signal);
   if(energyField){const n=Math.min(rect.width,8192);rowFree=budget.reserve(n*4);row=new Float32Array(n);}
   for(const f of [selected(contextId)].filter(Boolean)){const[x,y,r,b]=f.context.bounds,left=Math.max(x,rect.x),top=Math.max(y,rect.y),right=Math.min(r,rect.x+rect.width),bottom=Math.min(b,rect.y+rect.height);if(right<=left||bottom<=top)continue;
    if(energyField){const store=f.raw.value.energy?.[energyField];if(!store)continue;
     for(let yy=top;yy<bottom;yy++)for(let xx=left;xx<right;xx+=row.length){const n=Math.min(row.length,right-xx);await store.readInto(new Uint8Array(row.buffer,0,n*4),((yy-y)*(r-x)+xx-x)*4);alive(signal);for(let i=0;i<n;i++)if(Number.isFinite(row[i])){const at=((yy-rect.y)*rect.width+xx-rect.x+i)*3;data[at]=Math.max(0,Math.min(255,Math.round(row[i]*255)));data[at+1]=data[at+2]=0;}}
     continue;
    }
    const part=await f.raw.value.preview.surface.readWindow({x:left-x,y:top-y,width:right-left,height:bottom-top},{signal});held.add(part);
    for(let row=0;row<bottom-top;row++)data.set(part.pixels.data.subarray(row*(right-left)*3,(row+1)*(right-left)*3),((top-rect.y+row)*rect.width+left-rect.x)*3);
    await release(part);alive(signal);
   }
   let done=false;returned=true;return{pixels:{width:rect.width,height:rect.height,format:'rgb8',data},release(){if(!done){done=true;free();}}};
  }finally{rowFree?.();if(!returned)free();}
 });}});
 const surface={...makeSurface(),dispose:()=>api.dispose()};
 const scalar=(field,contextId)=>({byteLength:width*height*4,readInto(out,offset,{signal}={}){return run(async()=>{
  alive(signal);requireValue(out instanceof Uint8Array&&Number.isSafeInteger(offset)&&offset>=0&&offset+out.length<=width*height*4,'Complete ELA numeric presentation read exceeds its grid.');
  const nan=new Uint8Array(new Float32Array([NaN]).buffer);for(let i=0;i<out.length;i++)out[i]=nan[(offset+i)%4];
  const end=offset+out.length;
  for(const f of [selected(contextId)].filter(Boolean)){const store=f.raw?.value.energy?.[field];if(!store)continue;const[x,y,r,b]=f.context.bounds,w=r-x;
   const top=Math.max(y,Math.floor(offset/(width*4))),bottom=Math.min(b,Math.ceil(end/(width*4)));
   for(let row=top;row<bottom;row++){
    const start=Math.max(offset,(row*width+x)*4),stop=Math.min(end,(row*width+r)*4);if(stop<=start)continue;
    await store.readInto(out.subarray(start-offset,stop-offset),((row-y)*w)*4+start-(row*width+x)*4);alive(signal);
   }
  }
 });}});
 const api={preview:{surface},previewFor(id){selected(id);return makeSurface(undefined,id);},energyPreview(field,id){selected(id);requireValue(['energy_low_score','energy_high_score'].includes(field),'Native complete Energy display field required.');return makeSurface(field,id);},energy:{energy_low_score:scalar('energy_low_score'),energy_high_score:scalar('energy_high_score'),metadata:{energy:{thresholds:null,profileLayout:'per-native-context'}}},dispose(){if(disposal)return disposal;closed=true;disposal=(async()=>{await Promise.allSettled([...reads]);await retireCompositeOwners([...held].map(w=>()=>release(w)));})().catch(error=>{disposal=undefined;throw error;});return disposal;}};
 return api;
}
