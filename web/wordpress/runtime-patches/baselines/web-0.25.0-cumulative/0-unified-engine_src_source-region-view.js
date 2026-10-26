import {compileOriginalSourceRegions} from './source-region-geometry.js';
import {EngineError,checkAbort,requireValue} from './errors.js';

/** A native view of an original source. The encoded source remains owned by
 * its original decoder. Ordinary readWindow never manufactures hole pixels:
 * callers must either request an admitted rectangle or opt into a typed mask. */
export async function createSourceRegionView(source,input,{budget,signal,maxReadPixels=1024*1024}={}){
 const domain=await compileOriginalSourceRegions(input);checkAbort(signal);
 requireValue(source&&typeof source.readWindow==='function','A native source window reader is required.');
 const dimensions=source.descriptor??source;
 requireValue(dimensions.width===domain.sourceWidth&&dimensions.height===domain.sourceHeight,'The source-region view belongs to another native grid.');
 if(source.sha256!==undefined)requireValue(source.sha256===domain.sourceSha256,'The source-region view belongs to another source identity.');
 if(domain.empty)throw new EngineError('SOURCE_SCOPE_EMPTY','No original pixels are admitted by this source selection.');
 requireValue(Number.isSafeInteger(maxReadPixels)&&maxReadPixels>0,'A finite native window admission is required.');
 const held=new Set();let disposed=false;
 const alive=extra=>{checkAbort(signal);checkAbort(extra);if(disposed)throw new EngineError('DISPOSED','The source-region view is closed.');};
 function rectangle(value,{admit=true}={}){
  requireValue(value&&['x','y','width','height'].every(key=>Number.isSafeInteger(value[key]))&&value.x>=0&&value.y>=0&&value.width>0&&value.height>0&&value.x+value.width<=domain.width&&value.y+value.height<=domain.height,'A source-region window must remain inside its derived grid.');
  if(admit&&value.width*value.height>maxReadPixels)throw new EngineError('SOURCE_REGION_WINDOW_LIMIT','Split this native window instead of reducing its resolution.');
  return value;
 }
 const spans=(row,rect)=>domain.rowIntervals(row).map(([a,b])=>[Math.max(a,rect.x),Math.min(b,rect.x+rect.width)]).filter(([a,b])=>b>a);
 function admitted(rect){for(let y=rect.y;y<rect.y+rect.height;y++){const row=spans(y,rect);if(row.length!==1||row[0][0]!==rect.x||row[0][1]!==rect.x+rect.width)return false;}return true;}
 // Merge only equal adjacent spans. Each emitted native rectangle contains
 // admitted pixels exclusively, including negative zones within acquisitions.
 function* rectangles(rect){
  let active=new Map();
  for(let y=rect.y;y<rect.y+rect.height;y++){
   const next=new Map();for(const [x,right]of spans(y,rect)){const key=x+':'+right,prior=active.get(key);next.set(key,prior?{...prior,height:prior.height+1}:{x,y,width:right-x,height:1});}
   for(const[key,value]of active)if(!next.has(key))yield value;
   active=next;
  }
  yield* active.values();
 }
 async function native(rect,extra){
  alive(extra);const readSignal=signal&&extra?AbortSignal.any([signal,extra]):extra??signal,window=await source.readWindow({...rect,x:rect.x+domain.origin[0],y:rect.y+domain.origin[1]},{signal:readSignal});
  try{alive(extra);requireValue(window.pixels?.format==='rgb8'&&window.pixels.width===rect.width&&window.pixels.height===rect.height&&window.pixels.data?.length===rect.width*rect.height*3,'The native source returned another pixel grid.');return window;}catch(error){window.release?.();throw error;}
 }
 function retain(value,release){let done=false;const lease={...value,release(){if(done)return;done=true;held.delete(lease);release?.();}};held.add(lease);return lease;}
 const api={
  descriptor:Object.freeze({width:domain.width,height:domain.height,format:'rgb8',sourceRegionDomain:domain.descriptor}),
  domain,originalSource:source,encodedOriginal:source.encodedOriginal??source.blob??source.bytes,
  contains:domain.contains,rowIntervals:domain.rowIntervals,
  includesRectangle(value){return admitted(rectangle(value,{admit:false}));},
  async readWindow(value,{signal:extra}={}){alive(extra);const rect=rectangle(value);if(!admitted(rect))throw new EngineError('SOURCE_REGION_PARTIAL_WINDOW','This operation must use admitted spans or its explicit membership-aware adapter.');const window=await native(rect,extra);return retain({...window,origin:[rect.x,rect.y],originalOrigin:domain.toOriginal([rect.x,rect.y])},()=>window.release?.());},
  async visitIncluded(visitor,{signal:extra,windowPixels=maxReadPixels}={}){
   alive(extra);requireValue(typeof visitor==='function'&&Number.isSafeInteger(windowPixels)&&windowPixels>0&&windowPixels<=maxReadPixels,'Invalid included-window visitor.');
   const full={x:0,y:0,width:domain.width,height:domain.height};let completed=0;
   for(const region of rectangles(full))for(let y=region.y;y<region.y+region.height;){
    const width=Math.min(region.width,windowPixels),rows=Math.max(1,Math.floor(windowPixels/width)),height=Math.min(rows,region.y+region.height-y);
    for(let x=region.x;x<region.x+region.width;x+=width){alive(extra);const rect={x,y,width:Math.min(width,region.x+region.width-x),height},window=await native(rect,extra);try{await visitor(window.pixels,{rect,originalOrigin:domain.toOriginal([x,y]),completed,total:domain.countIncluded});completed+=rect.width*rect.height;}finally{window.release?.();}}
    y+=height;
   }
   alive(extra);return{completed,total:domain.countIncluded};
  },
  async readMaskedWindow(value,{signal:extra}={}){
   alive(extra);const rect=rectangle(value),count=rect.width*rect.height,release=budget?.reserve(count*4);let committed=false;
   try{const data=new Uint8Array(count*3),membership=new Uint8Array(count);let included=0;
    for(const part of rectangles(rect)){const window=await native(part,extra);try{for(let row=0;row<part.height;row++){const at=(part.y+row-rect.y)*rect.width+part.x-rect.x;data.set(window.pixels.data.subarray(row*part.width*3,(row+1)*part.width*3),at*3);membership.fill(1,at,at+part.width);included+=part.width;}}finally{window.release?.();}}
    alive(extra);const lease=retain({pixels:{width:rect.width,height:rect.height,format:'rgb8-membership',data,membership},included,origin:[rect.x,rect.y],originalOrigin:domain.toOriginal([rect.x,rect.y]),semantics:'Only membership=1 entries are observations; other storage slots are not black image pixels.'},release);committed=true;return lease;
   }finally{if(!committed)release?.();}
  },
  admittedRectangles(value={x:0,y:0,width:domain.width,height:domain.height}){return rectangles(rectangle(value,{admit:false}));},
  dispose(){if(disposed)return;disposed=true;for(const lease of [...held])lease.release();}
 };return api;
}
