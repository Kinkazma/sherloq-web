import {allocateWasmMemory,copyTypedArray,wasmAllocationFailure} from './allocation.js';
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {roundEven,CLONE_SOURCES,polygonRing} from './clone-relations.js';
import {createSHA256} from '../vendor/hash-wasm/hashes.js';
const f=Math.fround,MiB=1024**2;
const valueBytes=x=>typeof x==='string'?x.length*2:x&&typeof x==='object'?Object.entries(x).reduce((n,[k,v])=>n+32+k.length*2+valueBytes(v),64):8;
// Python json.dumps formatting of binary32 values promoted by ndarray.tolist().
// Values in source pixel coordinates remain below 2**30. Preserve negative zero.
function pyFloat(x){if(Object.is(x,-0))return '-0.0';if(x===0)return '0.0';const a=Math.abs(x);if(a<1e-4||a>=1e16)return x.toExponential().replace(/e([+-])(\d)$/,(_,s,d)=>'e'+s+'0'+d);const s=String(x);return Number.isInteger(x)?s+'.0':s;}
const pyString=x=>JSON.stringify(x).replace(/[\u007f-\uffff]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));
function compare(a,b){for(let i=0;i<Math.min(a.length,b.length);i++){const c=Array.isArray(a[i])?compare(a[i],b[i]):a[i]-b[i];if(c)return c;}return a.length-b.length;}
function identity(source,polygons,provenance){const rounded=x=>{const v=f(roundEven(f(x*1000))/1000);return v===0&&(x<0||Object.is(x,-0))?-0:v;},canonical=polygons.map(p=>p.map(xy=>xy.map(rounded)).sort(compare)).sort(compare),coords='['+canonical.map(p=>'['+p.map(xy=>'['+xy.map(pyFloat).join(', ')+']').join(', ')+']').join(', ')+']',parts=[pyString(source),coords];for(const key of ['branch','search_context'])if(Object.hasOwn(provenance,key))parts.push(pyString(provenance[key]));return '['+parts.join(', ')+']';}
function color(key,source){const index=CLONE_SOURCES.indexOf(source),h=(parseInt(key.slice(0,8),16)/2**32+(index<0?3:index)/3)%1,i=Math.floor(h*6),a=h*6-i,v=.95,s=.8,p=v*(1-s),q=v*(1-s*a),t=v*(1-s*(1-a));return [[v,t,p],[q,v,p],[p,v,t],[p,q,v],[t,p,v],[v,p,q]][i%6].map(x=>roundEven(x*255)).reverse();}

export async function createCloneEntryGeometry({budget,maxPixels=0,maxMaskPixels=0,maxRasterPixels=0,maxVertices=65536,signal,wasmBinary}={}){
 requireValue([maxPixels,maxMaskPixels,maxRasterPixels].every(x=>Number.isSafeInteger(x)&&x>=0)&&Number.isSafeInteger(maxVertices)&&maxVertices>=3,'Invalid native region/vertex capacity');const heapBytes=Math.ceil((64*MiB+maxPixels*32+maxMaskPixels*32+maxRasterPixels*4+Math.max(0,maxVertices-65536)*64)/(16*MiB))*16*MiB;requireValue(heapBytes<=2**31,'Native clone regions exceed bounded heap range');const free=budget.reserve(heapBytes+MiB);let m,hash,closed=false,busy=false;
 try{await controlCheckpoint(signal);const {default:create}=await import('../vendor/clone-entries/clone-entries.js');m=await create({wasmMemory:allocateWasmMemory({initial:256,maximum:heapBytes/65536}),...(wasmBinary?{wasmBinary}:{})});hash=await createSHA256();checkAbort(signal);}catch(error){free();throw error;}
 const alive=()=>{if(closed)throw new EngineError('DISPOSED','Clone entry geometry disposed');};
 function allocate(n){const p=m._malloc(n);if(!p)throw wasmAllocationFailure(m,'Native clone entry allocation failed',n);return p;}
 const geometry={
  polygonKey(p){alive();requireValue(!busy,'Clone entry geometry busy');const release=budget.reserve(p.length*256+8192);try{const ring=polygonRing(p),text='['+ring.map(xy=>'['+xy.map(pyFloat).join(', ')+']').join(', ')+']';hash.init();hash.update(new TextEncoder().encode(text));return 'ring2:'+hash.digest('hex').slice(0,16);}finally{release();}},
  async entry(source,input,count,provenance={}, {signal}={}){
   alive();if(busy)throw new EngineError('BUSY','Clone entry geometry busy');requireValue(typeof source==='string'&&Number.isSafeInteger(count)&&count>=0&&Array.isArray(input)&&Object.keys(provenance).every(k=>!['branch','search_context'].includes(k)||typeof provenance[k]==='string'),'Invalid clone entry metadata');
   if(input.some(p=>!Array.isArray(p)||p.length<3||p.some(xy=>!Array.isArray(xy)||xy.length!==2||xy.some(x=>!Number.isFinite(x)))))return null;
   const vertices=input.reduce((n,p)=>n+p.length,0);requireValue(vertices<=maxVertices&&input.every(p=>p.every(xy=>xy.every(x=>Math.abs(x)<=2**30))),'Clone polygons exceed source coordinate/vertex capacity');const release=budget.reserve(vertices*384+8192+valueBytes(provenance));let ptr=0,out=0,complete=false;busy=true;
   try{await controlCheckpoint(signal);const maximum=Math.max(3,...input.map(p=>p.length));ptr=allocate(maximum*8);out=allocate(maximum*8);const polygons=[];
    for(const p of input){for(let i=0;i<p.length;i++){m.HEAPF32[ptr/4+2*i]=p[i][0];m.HEAPF32[ptr/4+2*i+1]=p[i][1];}const n=m._clone_entry_hull(ptr,p.length,out);if(n<0)throw new EngineError('COMPUTE_FAILED','Native clone hull failed');if(!n)return null;polygons.push(Array.from({length:n},(_,i)=>[m.HEAPF32[out/4+2*i],m.HEAPF32[out/4+2*i+1]]));}
    hash.init();hash.update(new TextEncoder().encode(identity(source,polygons,provenance)));const id=hash.digest('hex').slice(0,24);checkAbort(signal);const entry={id,source,polygons,count,color:color(id,source),provenance:structuredClone(provenance)};complete=true;return {entry,release};
   }finally{if(ptr)m._free(ptr);if(out)m._free(out);if(!complete)release();busy=false;}
  },
  compare(polygons){alive();requireValue(!busy&&polygons.length===2,'Two polygons required');let a=0,b=0;try{a=allocate(polygons[0].length*8);b=allocate(polygons[1].length*8);for(const [p,at]of [[polygons[0],a],[polygons[1],b]])for(let i=0;i<p.length;i++){m.HEAPF32[at/4+2*i]=p[i][0];m.HEAPF32[at/4+2*i+1]=p[i][1];}const distance=m._clone_entry_distance(a,polygons[0].length,b,polygons[1].length),overlap=m._clone_entry_overlap(a,polygons[0].length,b,polygons[1].length);if(distance<0||overlap<0)throw new EngineError('COMPUTE_FAILED','Native clone geometry failed');return {distance,overlap};}finally{if(a)m._free(a);if(b)m._free(b);}},
  async scope({width,height,block,regions,excluded=[]},consume,{signal}={}){
   alive();requireValue(!busy&&[width,height,block].every(x=>Number.isInteger(x)&&x>0)&&width*height<=maxRasterPixels&&Array.isArray(regions)&&Array.isArray(excluded)&&typeof consume==='function','Admitted source scope required');
   const polygons=[...regions,...excluded];requireValue(polygons.every(p=>Array.isArray(p)&&p.length>=3&&p.length<=maxVertices&&p.every(xy=>Array.isArray(xy)&&xy.length===2&&xy.every(x=>Number.isFinite(x)&&Math.abs(x)<=2**30))),'Invalid scope polygon');let ptr=0,complete=false;const cellsLength=Math.floor(width/block)*Math.floor(height/block),release=budget.reserve(cellsLength);busy=true;
   try{await controlCheckpoint(signal);if(!m._clone_scope_begin(width,height))throw wasmAllocationFailure(m,'Native selection mask allocation failed',undefined);ptr=allocate(Math.max(3,...polygons.map(p=>p.length))*8);
    for(let k=0;k<polygons.length;k++){await controlCheckpoint(signal);const p=polygons[k];for(let i=0;i<p.length;i++){m.HEAP32[ptr/4+2*i]=roundEven(p[i][0]);m.HEAP32[ptr/4+2*i+1]=roundEven(p[i][1]);}if(!m._clone_scope_fill(ptr,p.length,k<regions.length?1:0))throw new EngineError('COMPUTE_FAILED','Native selection raster failed');}
    const cellsAt=m._clone_scope_cells(block);if(cellsLength&&!cellsAt)throw new EngineError('MEMORY_LIMIT','Native complete-cell selection failed');const cells=copyTypedArray(m.HEAPU8.subarray(cellsAt,cellsAt+cellsLength),{label:'clone-entry-geometry-output'});
    for(let at=0;at<width*height;at+=MiB){await controlCheckpoint(signal);await consume(m.HEAPU8.subarray(m._clone_scope_data()+at,m._clone_scope_data()+Math.min(width*height,at+MiB)),at);}
    checkAbort(signal);complete=true;return {cells,release};
   }finally{if(ptr)m._free(ptr);m._clone_scope_close();if(!complete)release();busy=false;}
  },
  async contours({width,height,mask,origin=[0,0]},{signal}={}){
   alive();requireValue(!busy&&[width,height].every(x=>Number.isInteger(x)&&x>0)&&width*height<=maxMaskPixels&&mask instanceof Uint8Array&&mask.length===width*height&&origin.length===2&&origin.every(Number.isSafeInteger),'Admitted binary mask required');busy=true;let ptr=0,release,complete=false;
   try{await controlCheckpoint(signal);ptr=allocate(mask.length);m.HEAPU8.set(mask,ptr);if(!m._clone_mask_contours(ptr,width,height,...origin))throw new EngineError('COMPUTE_FAILED','Native mask contours failed');const points=m._clone_regions_points(),count=m._clone_regions_contours();release=budget.reserve(points*64+count*64+8192);const coordinates=m._clone_regions_coordinates()/4,offset=m._clone_regions_offsets()/4,polygons=[];
    for(let i=0;i<count;i++){await controlCheckpoint(signal);const polygon=[];for(let j=m.HEAP32[offset+i];j<m.HEAP32[offset+i+1];j++)polygon.push([m.HEAP32[coordinates+2*j],m.HEAP32[coordinates+2*j+1]]);polygons.push(polygon);}checkAbort(signal);complete=true;return {polygons,release};
   }finally{if(ptr)m._free(ptr);if(!complete)release?.();busy=false;}
  },
  async regions({width,height,mask,boxes=[],minimum=500},{signal,onProgress}={}){
   alive();if(busy)throw new EngineError('BUSY','Clone entry geometry busy');requireValue([width,height].every(x=>Number.isInteger(x)&&x>0)&&width*height<=maxPixels&&mask instanceof Uint8Array&&mask.length===width*height&&Number.isInteger(minimum)&&minimum>=0&&minimum<=5000,'D2PRL mask and admitted region capacity required');busy=true;let ptr=0,complete=false;const leases=[],entries=[];
   try{await controlCheckpoint(signal);ptr=allocate(mask.length);m.HEAPU8.set(mask,ptr);const n=m._clone_regions_begin(ptr,width,height);m._free(ptr);ptr=0;if(n<0)throw new EngineError('COMPUTE_FAILED','Native connected components failed');await controlCheckpoint(signal);
    for(let id=1;id<=n;id++){
     await controlCheckpoint(signal);if(!m._clone_regions_select(id))throw new EngineError('COMPUTE_FAILED','Native region contour failed');const at=m._clone_regions_stats(id)/4,[x,y,w,h,count]=Array.from(m.HEAP32.subarray(at,at+5)),points=m._clone_regions_points(),contours=m._clone_regions_contours();leases.push(budget.reserve(w*h+points*64+8192+valueBytes(boxes)));
     const data=copyTypedArray(m.HEAPU8.subarray(m._clone_regions_pixels(),m._clone_regions_pixels()+w*h),{label:'clone-entry-geometry-output'});hash.init();for(let start=0;start<data.length;start+=MiB){hash.update(data.subarray(start,Math.min(data.length,start+MiB)));await controlCheckpoint(signal);}hash.update(new TextEncoder().encode(`(${x}, ${y}, ${w}, ${h})`));const key=hash.digest('hex').slice(0,24),coords=m._clone_regions_coordinates()/4,offset=m._clone_regions_offsets()/4,polygons=[];
     for(let c=0;c<contours;c++){const polygon=[];for(let j=m.HEAP32[offset+c];j<m.HEAP32[offset+c+1];j++)polygon.push([m.HEAP32[coords+2*j],m.HEAP32[coords+2*j+1]]);polygons.push(polygon);}
     entries.push({id:'d2prl-'+key,source:'D2PRL',label:'D2PRL',count,count_kind:'pixels',color:[230,170,30],pixel_mask:{width:w,height:h,data},origin:[x,y],polygons,search_context:'d2prl-selected-zones',provenance:{min_component:minimum,native_grid:[448,448],evidence:'segmentation',boxes:structuredClone(boxes)}});onProgress?.({phase:'d2prl-regions',completed:id,total:n,fraction:id/n});checkAbort(signal);
    }
    complete=true;let released=false;return {entries,release(){if(released)return;released=true;for(const f of leases)f();}};
   }finally{if(ptr)m._free(ptr);m._clone_regions_close();if(!complete)for(const f of leases)f();busy=false;}
  },
  dispose(){if(closed)return;if(busy)throw new EngineError('BUSY','Clone entry geometry busy');closed=true;m._clone_regions_close();m._clone_scope_close();m=null;hash=null;free();},heapMaximumBytes:heapBytes
 };return geometry;
}
