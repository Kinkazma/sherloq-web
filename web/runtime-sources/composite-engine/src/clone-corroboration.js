import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {CLONE_SOURCES,AI_SOURCES,polygon,roundEven} from './clone-relations.js';
// Native BGR constants converted once to the engine's RGB convention.
export const COUNT_COLORS = Object.freeze([[0,0,0],[30,100,255],[0,210,210],[60,210,60],[255,220,0],[255,128,0],[255,30,20]].map(Object.freeze));
const HEAP_LIMIT=64*1024**2;
export function createCloneCorroboration({budget,wasmBinary}={}) {
  requireValue(typeof budget?.reserve==='function','Shared engine budget required');
  let module,heapRelease,busy=false,disposed=false;
  const ensure=async()=>{if(module)return module;const release=budget.reserve(HEAP_LIMIT);try{const {default:create}=await import('../vendor/composition/composition.js');module=await create(wasmBinary?{wasmBinary}:{});heapRelease=release;return module;}catch(error){release();throw error;}};
  function validate(entries,width,height,excluded) {
    requireValue(Number.isInteger(width)&&Number.isInteger(height)&&width>0&&height>0&&Number.isSafeInteger(width*height)&&Array.isArray(entries)&&Array.isArray(excluded),'Source dimensions and entries required');
    let maximum=3;
    for(const entry of entries) {
      if(!CLONE_SOURCES.includes(entry.source))continue;
      if(entry.pixel_mask){const p=entry.pixel_mask;requireValue(p.data instanceof Uint8Array&&Number.isInteger(p.width)&&p.width>0&&Number.isInteger(p.height)&&p.height>0&&p.data.length===p.width*p.height&&Array.isArray(entry.origin)&&entry.origin.length===2&&entry.origin.every(Number.isInteger),'Exact byte mask with source origin required');requireValue(p.data.every(v=>v<=1),'Masks must contain 0 or 1');}
      else {requireValue(Array.isArray(entry.polygons),'Clone polygons required');for(const p of entry.polygons){polygon(p);maximum=Math.max(maximum,p.length);}}
    }
    for(const p of excluded){polygon(p);maximum=Math.max(maximum,p.length);}
    return maximum;
  }
  function fill(m,maskAt,xyAt,width,rows,p,top,convex,value) {
    const data=m.HEAP32;for(let i=0;i<p.length;i++){data[xyAt/4+2*i]=roundEven(p[i][0]);data[xyAt/4+2*i+1]=roundEven(p[i][1])-top;}
    if(!m._composition_fill(maskAt,width,rows,xyAt,p.length,Number(convex),value))throw new EngineError('COMPUTE_FAILED','Clone polygon rasterization failed');
  }
  // Consumer awaits each stripe; retaining it needs its own budget reservation.
  // Rasterization always uses native 256-row bands: clipping edges against a
  // different band changes OpenCV line pixels. Output stripes may be smaller.
  async function stripes({width,height,entries,excluded=[],byContext=true,stripRows=256}, consume, {signal,onProgress}={}) {
    requireValue(!disposed,'Composition disposed');if(busy)throw new EngineError('BUSY','Composition busy');
    requireValue(typeof consume==='function'&&Number.isInteger(stripRows)&&stripRows>0&&stripRows<=256,'Stripe consumer and 1–256 rows required');
    const maximum=validate(entries,width,height,excluded);checkAbort(signal);busy=true;
    let workspace,maskAt=0,xyAt=0,m;
    try {
      m=await ensure();checkAbort(signal);
      const groups=new Map();
      for(const e of entries){if(!CLONE_SOURCES.includes(e.source))continue;const context=e.source==='D2PRL'?'d2prl-selected-zones':e.search_context??e.provenance?.search_context??'unspecified';const key=JSON.stringify(byContext?[e.source,context]:[e.source]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(e);}
      const available=budget.limit-budget.total(),rows=Math.min(stripRows,height,Math.floor(available/(width*4)));
      if(rows<1)throw new EngineError('MEMORY_LIMIT','No space for a corroboration output row');
      workspace=budget.reserve(width*rows*4);maskAt=m._malloc(width*Math.min(256,height));xyAt=m._malloc(maximum*8);
      if(!maskAt||!xyAt)throw new EngineError('MEMORY_LIMIT','Clone raster workspace allocation failed');
      for(let top=0;top<height;) {
        await controlCheckpoint(signal);const rasterTop=top-top%256,rasterRows=Math.min(256,height-rasterTop),rasterLength=width*rasterRows,offset=(top-rasterTop)*width,count=Math.min(rows,height-top,256-top%256),length=width*count,values=new Uint32Array(length);
        for(const group of groups.values()) {
          m.HEAPU8.fill(0,maskAt,maskAt+rasterLength);
          for(const e of group) {
            if(e.pixel_mask){const [x,y]=e.origin,p=e.pixel_mask,x0=Math.max(0,x),x1=Math.min(width,x+p.width),y0=Math.max(top,y),y1=Math.min(top+count,y+p.height);for(let yy=y0;yy<y1;yy++)for(let xx=x0;xx<x1;xx++)m.HEAPU8[maskAt+(yy-rasterTop)*width+xx]|=p.data[(yy-y)*p.width+xx-x];}
            else for(const p of e.polygons)fill(m,maskAt,xyAt,width,rasterRows,p,rasterTop,true,1);
          }
          for(let i=0;i<length;i++)values[i]+=m.HEAPU8[maskAt+offset+i];
          await controlCheckpoint(signal);
        }
        m.HEAPU8.fill(0,maskAt,maskAt+rasterLength);for(const p of excluded)fill(m,maskAt,xyAt,width,rasterRows,p,rasterTop,false,1);
        for(let i=0;i<length;i++)if(m.HEAPU8[maskAt+offset+i])values[i]=0;
        await consume({width,height:count,top,values});checkAbort(signal);onProgress?.((top+count)/height);top+=count;
      }
    } finally {if(maskAt)m._free(maskAt);if(xyAt)m._free(xyAt);workspace?.();busy=false;}
  }
  return {
    stripes,
    async counts(request,hooks) {
      validate(request.entries,request.width,request.height,request.excluded??[]);
      const release=budget.reserve(request.width*request.height*4);let complete=false;
      try{const values=new Uint32Array(request.width*request.height);await stripes(request,strip=>values.set(strip.values,strip.top*request.width),hooks);complete=true;return {width:request.width,height:request.height,values,release};}finally{if(!complete)release();}
    },
    async uniqueEnvelopes(entries,{threshold=.9,signal}={}) {
      requireValue(!disposed&&threshold>=0&&threshold<=1,'Invalid envelope request');if(busy)throw new EngineError('BUSY','Composition busy');busy=true;let at=0,m;
      try{checkAbort(signal);m=await ensure();const maximum=Math.max(3,...entries.flatMap(e=>e.polygons.map(p=>polygon(p).length)));at=m._malloc(maximum*16);if(!at)throw new EngineError('MEMORY_LIMIT','Envelope workspace allocation failed');
        const iou=(a,b)=>{m.HEAPF32.set(a.flat(),at/4);m.HEAPF32.set(b.flat(),at/4+maximum*2);const v=m._composition_iou(at,a.length,at+maximum*8,b.length);if(v<0)throw new EngineError('COMPUTE_FAILED','Envelope intersection failed');return v;},result=[];
        for(const entry of entries){await controlCheckpoint(signal);let match;
          if(!entry.pixel_mask&&entry.polygons.length===2){const [a,b]=entry.polygons;match=result.find(old=>!old.pixel_mask&&old.polygons.length===2&&(!(AI_SOURCES.includes(entry.source)||AI_SOURCES.includes(old.source))||entry.source===old.source)&&((iou(a,old.polygons[0])>=threshold&&iou(b,old.polygons[1])>=threshold)||(iou(a,old.polygons[1])>=threshold&&iou(b,old.polygons[0])>=threshold)));}
          if(match){match.member_ids.push(entry.id);if(!match.corroborating_sources.includes(entry.source))match.corroborating_sources.push(entry.source);}else result.push({...entry,member_ids:[entry.id],corroborating_sources:[entry.source]});
        }return result;
      }finally{if(at)m._free(at);busy=false;}
    },
    dispose(){if(busy)throw new EngineError('BUSY','Composition busy');module=null;heapRelease?.();heapRelease=null;disposed=true;}
  };
}
export function colorizeCounts({width,height,values},{image=null,opacity=.7}={}) {
  requireValue(values instanceof Uint32Array&&values.length===width*height&&Number.isFinite(opacity)&&opacity>=0&&opacity<=1,'Count map and opacity required');
  requireValue(!image||(image.format==='rgb8'&&image.width===width&&image.height===height&&image.data.length===width*height*3),'Matching source RGB required');
  const data=image?image.data.slice():new Uint8Array(width*height*3);
  for(let i=0;i<values.length;i++)if(values[i]){const color=COUNT_COLORS[Math.min(6,values[i])];for(let c=0;c<3;c++)data[3*i+c]=image?roundEven(data[3*i+c]*(1-opacity)+color[c]*opacity):color[c];}
  return {width,height,format:'rgb8',data};
}
