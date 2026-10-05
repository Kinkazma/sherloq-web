import{EngineError,requireValue,checkAbort,controlCheckpoint}from'./errors.js';
import{createSegmentedBytes}from'./segmented-bytes.js';import{segmentationProbabilities}from'../experiments/segmentation/probabilities.js';
const BLOCK=1048576;
// The output stores are private until every native zone and exclusion succeeds.
// This performs projection/composition only; raw grids come from real inference.
export async function segmentedNeuralProjection({family,width,height,zones,side,kind,mode='regions',exclusions=[],minimum=500,compare=false},{budget,spatial,postprocess,signal,onProgress,temporarySession,getTemporarySession,storage='auto'}={}){
 const d2=family==='d2prl',roles=d2||kind==='softmax',n=width*height,grid=side*side;
 requireValue(['d2prl','segmentation'].includes(family)&&[width,height].every(v=>Number.isSafeInteger(v)&&v>0&&v<=131072)&&Number.isSafeInteger(n*15),'Neural source geometry');
 requireValue(d2?side===448&&typeof postprocess?.run==='function':[256,512].includes(side)&&['sigmoid','softmax'].includes(kind)&&(kind!=='softmax'||side===256),'Native neural grid domain');
 requireValue(typeof spatial?.run==='function'&&Number.isInteger(minimum)&&minimum>=0&&minimum<=5000&&compare===false&&Array.isArray(exclusions)&&exclusions.length<=256&&(d2||exclusions.length===0),'Native projection parameters');
 requireValue(['regions','whole-image'].includes(mode)&&Array.isArray(zones)&&zones.length>0&&zones.length<=256,'Independent native zones required');
 const bounds=(b,min)=>requireValue(Array.isArray(b)&&b.length===4&&b.every(Number.isSafeInteger)&&b[0]>=0&&b[1]>=0&&b[2]<=width&&b[3]<=height&&b[2]-b[0]>=min&&b[3]-b[1]>=min,'Half-open source rectangle');
 const ids=new Set();for(const z of zones){bounds(z.bounds,mode==='whole-image'?1:8);requireValue(typeof z.id==='string'&&z.id.length>0&&z.id.length<=128&&!ids.has(z.id)&&z.raw instanceof Float32Array&&z.raw.length===grid*(roles?3:1),'Unique zone and native raw grid required');ids.add(z.id);}for(const b of exclusions)bounds(b,8);
 if(mode==='whole-image')requireValue(zones.length===1&&JSON.stringify(zones[0].bounds)===JSON.stringify([0,0,width,height]),'Single whole-image rectangle required');checkAbort(signal);
 const fields=['map','mask',...(roles?['target','source']:[]),'analyzed','candidates'],isFloat=key=>['map','target','source'].includes(key),elementBytes=key=>isFloat(key)?4:1,stores={},zoneMetadata=[],metadataBytes=65536+8192*(zones.length+exclusions.length),borrowedBytes=zones.reduce((s,z)=>s+z.raw.byteLength,0);
 const ioBytes=temporarySession?.backend==='indexeddb'||!temporarySession&&getTemporarySession?2*1024**2:0,workBytes=ioBytes+5*Math.max(width,Math.min(BLOCK,n))+width*4+16384;
 // Keep enough room for the existing native-grid processor before selecting RAM
 // result stores. The real processor owns its reservations during execution.
 const transient=(d2?512*1024**2+2*grid*12+2*grid*16:grid*(roles?29:13))+4*Math.max(width,Math.min(BLOCK,n))+16384;
 let planning,working,metadataRetained=false,complete=false;const started=performance.now();let projectionMs=0,compositionMs=0,postprocessMs=0,blocks=0;
 const dispose=async()=>{const results=await Promise.allSettled(Object.values(stores).map(s=>s.dispose()));if(metadataRetained){budget.retained-=metadataBytes;metadataRetained=false;}const failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;};
 async function writeRectangle(store,bytes,bytesPerPixel,x0,y0,w,h){
  if(x0===0&&w===width){await store.write(bytes,y0*width*bytesPerPixel);return;}
  for(let y=0;y<h;y++){await store.write(bytes.subarray(y*w*bytesPerPixel,(y+1)*w*bytesPerPixel),((y0+y)*width+x0)*bytesPerPixel);if((y&31)===31)await controlCheckpoint(signal);}
 }
 async function compose(key,values,{y,rows:count},b){
  const at=performance.now(),[x0,y0,x1]=b,w=x1-x0,bpp=elementBytes(key),wide=w*4>=width,span=wide?width:w,buffer=new Uint8Array(span*count*bpp),dest=bpp===4?new Float32Array(buffer.buffer):buffer;
  if(wide)await stores[key].readInto(buffer,(y0+y)*width*bpp);
  else for(let row=0;row<count;row++){await stores[key].readInto(buffer.subarray(row*w*bpp,(row+1)*w*bpp),((y0+y+row)*width+x0)*bpp);if((row&31)===31)await controlCheckpoint(signal);}
  let foreground=false;for(let row=0;row<count;row++)for(let x=0;x<w;x++){const i=row*w+x,to=row*span+x+(wide?x0:0);if(key==='mask'||d2&&['target','source'].includes(key))requireValue(values[i]===0||values[i]===1,'Native binary role/mask projection');dest[to]=Math.max(dest[to],values[i]);if(key==='mask'&&values[i])foreground=true;}
  if(wide)await stores[key].write(buffer,(y0+y)*width*bpp);else await writeRectangle(stores[key],buffer,bpp,x0,y0+y,w,count);
  if(key==='map'){
   const analyzed=new Uint8Array(span*count);if(wide){await stores.analyzed.readInto(analyzed,(y0+y)*width);for(let row=0;row<count;row++)analyzed.fill(1,row*width+x0,row*width+x1);await stores.analyzed.write(analyzed,(y0+y)*width);}
   else{analyzed.fill(1);await writeRectangle(stores.analyzed,analyzed,1,x0,y0+y,w,count);}
  }
  compositionMs+=performance.now()-at;blocks++;return foreground;
 }
 try{
  budget.retain(metadataBytes);metadataRetained=true;planning=budget.reserve(workBytes+borrowedBytes+transient);
  for(const key of fields)stores[key]=await createSegmentedBytes(n*elementBytes(key),{budget,temporarySession,getTemporarySession,storage,signal});planning();planning=null;working=budget.reserve(workBytes+borrowedBytes);
  for(const [index,z]of zones.entries()){
   checkAbort(signal);let processed,prepared,maskLease;const at=performance.now();let present=false;
   try{
    if(d2){processed=await postprocess.run({raw:z.raw,minimum},{signal});requireValue(processed.masks instanceof Float32Array&&processed.masks.length===grid*3,'Native postprocess masks required');present=processed.masks.subarray(0,grid).some(Boolean);prepared={map:z.raw.subarray(0,grid),mask:processed.masks.subarray(0,grid),target:processed.masks.subarray(grid,grid*2),source:processed.masks.subarray(grid*2)};}
    else{processed=await segmentationProbabilities({raw:z.raw,side,kind},{budget,signal});maskLease=budget.reserve(grid*4);prepared={...processed,mask:Float32Array.from(processed.mask)};}
    postprocessMs+=performance.now()-at;const [x0,y0,x1,y1]=z.bounds;
    for(const key of ['map','mask',...(roles?['target','source']:[])]){
     const before=performance.now();await spatial.run({input:prepared[key],width:side,height:side,outWidth:x1-x0,outHeight:y1-y0,nearest:key==='mask'||d2&&key!=='map'},{signal,rowsPerBlock:(x1-x0)*4>=width?Math.max(1,Math.floor(BLOCK/width)):undefined,onRows:async(values,position)=>{const found=await compose(key,values,position,z.bounds);if(!d2&&key==='mask'&&found)present=true;}});projectionMs+=performance.now()-before;
    }
    zoneMetadata.push({id:z.id,bounds:[...z.bounds],origin:[x0,y0],analysis_shape:[roles?3:1,side,side],status:present?'ok':'empty',...(d2?{input_side:448,patchmatch_iterations:40,seed:22,min_component:minimum,role_filter:50}:{})});
   }finally{maskLease?.();processed?.release();}
   onProgress?.({phase:d2?'zone-projection':'segmentation-projection',completed:index+1,total:zones.length});checkAbort(signal);
  }
  for(const [x0,y0,x1,y1] of exclusions){const rows=Math.max(1,Math.floor(BLOCK/width));for(let y=y0;y<y1;y+=rows){await controlCheckpoint(signal);const count=Math.min(rows,y1-y);for(const key of fields.filter(k=>k!=='candidates')){const bpp=elementBytes(key),bytes=new Uint8Array(width*count*bpp);await stores[key].readInto(bytes,y*width*bpp);for(let row=0;row<count;row++)bytes.fill(0,(row*width+x0)*bpp,(row*width+x1)*bpp);await stores[key].write(bytes,y*width*bpp);}}}
  for(const store of Object.values(stores))await store.flush();checkAbort(signal);const maskBuffer=new Uint8Array(Math.min(BLOCK,n));let present=false;
  for(let offset=0;offset<n&&!present;offset+=maskBuffer.length){await controlCheckpoint(signal);const part=maskBuffer.subarray(0,Math.min(maskBuffer.length,n-offset));await stores.mask.readInto(part,offset);present=part.some(Boolean);}
  const metadata={boxes:zones.map(z=>[...z.bounds]),zones:zoneMetadata,...(d2?{exclusions:exclusions.map(b=>[...b]),min_component:minimum,exclusion_policy:'output-only-native-d2prl'}:{channel_order:roles?['target','source','background']:['union_probability'],threshold:.5,threshold_rule:roles?'target>=0.5 OR source>=0.5':'probability>0.5',raw_filter_applied:false}),status:present?'ok':'empty',probability_interpolation:'bilinear',mask_interpolation:'nearest',inference_performed:false};
  checkAbort(signal);complete=true;return{width,height,stores,metadata,dispose,metrics:{totalMs:performance.now()-started,projectionMs,compositionMs,postprocessMs,blocks,metadataBytes,storage:Object.fromEntries(fields.map(k=>[k,stores[k].storage])),resultBytes:fields.reduce((s,k)=>s+n*elementBytes(k),0)}};
 }catch(error){if(error instanceof RangeError)throw new EngineError('MEMORY_ALLOCATION','Neural projection allocation failed after admission');throw error;}finally{planning?.();working?.();if(!complete)await dispose();}
}
