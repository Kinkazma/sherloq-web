import {createPDFSubimageSurface,pdfSubimageRectangles} from './pdf-subimages.js';
import {createLoupeImageCache} from './native-effects.js';

// The crop is a native source coordinate domain, not a resized/encoded proxy.
// Cache lifetime belongs to the reader; visible domains may exceed the soft
// limit, like the existing native-image cache, and are never reduced to fit it.
export function createPDFSubimageMemory(memory,{changed=()=>{},beforePublish=async()=>{},maxBytes=128*1024**2,maxEntries=4,cacheFactory=createLoupeImageCache}={}){
 const descriptors=new Map(),entries=new Map(),pending=new Map();let closed=false,clock=0,needed=new Set(),collecting=false;
 const cancelled=()=>Object.assign(Error('PDF sub-image preparation superseded.'),{code:'CANCELLED'});
 function release(entry){entry.closed=true;entry.cache?.dispose();entry.prepared?.close();entry.raw.release();entries.delete(entry.id);}
 function retainedBytes(){const parents=new Map();let bytes=0;for(const e of entries.values()){parents.set(e.parentId,e.parentBytes);bytes+=e.prepared?.byteLength??0;}return bytes+[...parents.values()].reduce((a,b)=>a+b,0);}
 function trim(){for(const e of [...entries.values()].sort((a,b)=>a.used-b.used)){if(entries.size<=maxEntries&&retainedBytes()<=maxBytes)break;if(needed.has(e.id)||e.build)continue;release(e);}}
 const api={
  partition(page){
   const placements=[];
   for(const item of page.placements){const parent=item.job,rectangles=pdfSubimageRectangles(parent.width,parent.height,item.image.scope?.subimages?.map(rect=>({rectangle:[rect.x0,rect.y0,rect.x1,rect.y1]})));
    for(const rect of rectangles){const id=parent.id+':subimage:'+Object.values(rect).join(':'),width=rect.x1-rect.x0,height=rect.y1-rect.y0;
     let descriptor=descriptors.get(id);if(!descriptor){descriptor={id,parentId:parent.id,rectangle:rect,job:{...parent,id,width,height,parentImageId:parent.id,sourceDomain:rect},image:{entry:null,scope:{fingerprint:id,regions:[{x0:0,y0:0,x1:width,y1:height}],excluded:[]},allowedTiles:undefined}};descriptors.set(id,descriptor);}
     if(descriptor.image.entry?.closed)descriptor.image.entry=null;
     const m=item.matrix,matrix=[m[0],m[1],m[2],m[3],m[4]+m[0]*rect.x0+m[2]*rect.y0,m[5]+m[1]*rect.x0+m[3]*rect.y0],occurrence={...item.occurrence,textExclusions:(item.occurrence.textExclusions??[]).map(p=>p.map(([x,y])=>[x-rect.x0,y-rect.y0]))};
     placements.push({job:descriptor.job,image:descriptor.image,matrix,occurrence});
    }
   }
   return {...page,rawPage:page,placements};
  },
  retainPDFItems(ids){if(!collecting){needed=new Set();collecting=true;queueMicrotask(()=>{collecting=false;trim();});}for(const id of ids)needed.add(id);},
  async get(id,options){
   const descriptor=descriptors.get(id);if(!descriptor)return memory.get(id,options);if(closed)throw cancelled();
   if(entries.has(id)){const e=entries.get(id);e.used=++clock;return e;}if(pending.has(id))return pending.get(id);
   const task=(async()=>{const parent=await memory.get(descriptor.parentId,{...options,foreground:true});if(closed)throw cancelled();if(!parent)return null;const raw=createPDFSubimageSurface(parent.raw,descriptor.rectangle),entry={id,parentId:descriptor.parentId,parentBytes:parent.raw.width*parent.raw.height*4,job:descriptor.job,bitmap:{width:raw.width,height:raw.height},raw,used:++clock,prepared:null,preparedKey:null,closed:false};entries.set(id,entry);descriptor.image.entry=entry;trim();return entry;})().finally(()=>pending.delete(id));pending.set(id,task);return task;
  },
  prepared(entry,effects){if(!descriptors.has(entry?.id))return memory.prepared(entry,effects);return !entry.closed&&entry.preparedSource===entry.raw&&entry.preparedKey===JSON.stringify(effects)?entry.prepared:null;},
  async prepare(entry,effects){
   if(!descriptors.has(entry?.id))return memory.prepare(entry,effects);if(closed||entry.closed)throw cancelled();entry.used=++clock;
   const key=JSON.stringify(effects),input=entry.raw;if(api.prepared(entry,effects))return;if(entry.build?.key===key&&entry.build.input===input)return entry.build.promise;
   entry.cache??=cacheFactory({changed});const build={key,input};entry.build=build;
   build.promise=(async()=>{const lease=await entry.cache.acquire(input,effects,changed);try{await beforePublish(entry,effects);}catch(error){lease.close();throw error;}if(closed||entry.closed||entry.build!==build||entry.raw!==input){lease.close();throw cancelled();}const old=entry.prepared;entry.prepared=lease;entry.preparedKey=key;entry.preparedSource=input;queueMicrotask(()=>old?.close());changed();trim();})().finally(()=>{if(entry.build===build)entry.build=null;});return build.promise;
  },
  stats(){return {subimages:entries.size,prepared:[...entries.values()].filter(e=>e.prepared).length,bytes:retainedBytes()};},
  invalidate(){for(const e of entries.values()){e.build=null;e.preparedSource=null;e.cache?.cancel();}},
  dispose(){if(closed)return;closed=true;for(const e of [...entries.values()])release(e);descriptors.clear();needed.clear();}
 };return api;
}
