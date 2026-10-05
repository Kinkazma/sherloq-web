import "../../runtime-context.js?v=0.14.5";
import {requireValue,checkAbort,createCooperator} from './errors.js';
import {allocateOwnedTypedArray} from './allocation.js';
import {rasterPresentation} from './raster-presentation.js';

// Presentation only: analysis and exports continue to read exact source pixels.
export const MAX_DISPLAY_PIXELS=8*1024**2;
const unbudgeted={reserve:()=>()=>{}};
export function displayGeometry({width,height},{x,y,w,h,step=1}){
 requireValue([x,y,w,h,step].every(Number.isSafeInteger)&&x>=0&&y>=0&&w>0&&h>0&&step>0&&x<=width-w&&y<=height-h,'Invalid display window.');
 const ow=Math.ceil(w/step),oh=Math.ceil(h/step);
 requireValue(ow*oh<=MAX_DISPLAY_PIXELS,'Display window exceeds the presentation budget.');
 return {x,y,w,h,step,width:ow,height:oh};
}
function layout(format){requireValue(['rgb8','rgb-flags8','mask8','float32','int32'].includes(format),'Unsupported display surface format.');return {channels:['rgb8','rgb-flags8'].includes(format)?3:1,Type:format==='float32'?Float32Array:format==='int32'?Int32Array:Uint8Array};}
export async function samplePixels(pixels,tile,{budget=unbudgeted,signal,alive=()=>{}}={}){
 const g=displayGeometry(pixels,tile),{channels,Type}=layout(pixels.format),owned=allocateOwnedTypedArray(Type,g.width*g.height*channels,{budget,label:'display-frame'}),cooperate=createCooperator(signal);
 try{for(let row=0;row<g.height;row++){await cooperate();alive();const start=((g.y+row*g.step)*pixels.width+g.x)*channels;
  for(let col=0;col<g.width;col++)for(let c=0;c<channels;c++)owned.data[(row*g.width+col)*channels+c]=pixels.data[start+col*g.step*channels+c];
 }checkAbort(signal);return {pixels:{width:g.width,height:g.height,format:pixels.format,data:owned.data},release:owned.release,metrics:{sourceBytes:g.width*g.height*channels*Type.BYTES_PER_ELEMENT}};
 }catch(e){owned.release();throw e;}
}

// Read only source scanlines that contribute a sampled texel, including EXIF
// rotations. One reusable row; no full-resolution intermediate view.
export async function sampleStoredPixels(store,{width:sw,height:sh,format,orientation=1},tile,{budget,signal,alive=()=>{}}={}){
 const transposed=orientation>=5,descriptor={width:transposed?sh:sw,height:transposed?sw:sh},g=displayGeometry(descriptor,tile),{channels,Type}=layout(format),cooperate=createCooperator(signal);
 const source=(x,y)=>{switch(orientation){case 2:return[sw-1-x,y];case 3:return[sw-1-x,sh-1-y];case 4:return[x,sh-1-y];case 5:return[y,x];case 6:return[y,sh-1-x];case 7:return[sw-1-y,sh-1-x];case 8:return[sw-1-y,x];default:return[x,y];}};
 const a=source(g.x,g.y),b=source(g.x+(g.width-1)*g.step,g.y+(g.height-1)*g.step),left=Math.min(a[0],b[0]),span=Math.abs(a[0]-b[0])+1;
 const output=allocateOwnedTypedArray(Type,g.width*g.height*channels,{budget,label:'display-frame'});let scratch,sourceBytes=0;
 try{scratch=allocateOwnedTypedArray(Type,span*channels,{budget,label:'display-row'});const bytes=new Uint8Array(scratch.data.buffer),rows=transposed?g.width:g.height,cols=transposed?g.height:g.width;
  for(let row=0;row<rows;row++){
   await cooperate();alive();const first=source(g.x+(transposed?row*g.step:0),g.y+(transposed?0:row*g.step));
   const read=store.readInto(bytes,(first[1]*sw+left)*channels*Type.BYTES_PER_ELEMENT);if(read?.then)await read;sourceBytes+=bytes.length;
   const direction=transposed?(orientation===5||orientation===6?1:-1):(orientation===1||orientation===4?1:-1);
   for(let col=0;col<cols;col++){const from=(first[0]-left+direction*col*g.step)*channels,to=(transposed?col*g.width+row:row*g.width+col)*channels;for(let c=0;c<channels;c++)output.data[to+c]=scratch.data[from+c];}
  }
  alive();checkAbort(signal);return {pixels:{width:g.width,height:g.height,format,data:output.data},release:output.release,metrics:{sourceBytes}};
 }catch(error){output.release();throw error;}finally{scratch?.release();}
}

export async function sampleSurface(surface,tile,options){
 if(surface.readSampledWindow)return surface.readSampledWindow(tile,options);
 const g=displayGeometry(surface.descriptor,tile),{channels,Type}=layout(surface.descriptor.format),output=allocateOwnedTypedArray(Type,g.width*g.height*channels,{budget:options.budget,label:'display-frame'}),cooperate=createCooperator(options.signal);let sourceBytes=0;
 try{for(let row=0;row<g.height;row++){await cooperate();const part=await surface.readWindow({x:g.x,y:g.y+row*g.step,width:g.w,height:1},options);
  try{sourceBytes+=part.pixels.data.byteLength;for(let col=0;col<g.width;col++)for(let c=0;c<channels;c++)output.data[(row*g.width+col)*channels+c]=part.pixels.data[col*g.step*channels+c];}finally{part.release?.();}
 }return{pixels:{width:g.width,height:g.height,format:surface.descriptor.format,data:output.data},release:output.release,metrics:{sourceBytes}};
 }catch(e){output.release();throw e;}
}

export async function readDisplayFrame(surface,tile,{budget,signal,render,overlay}={}){
 const start=performance.now();let sample,base,result;
 try{
  sample=await sampleSurface(surface,tile,{budget,signal});if(overlay)base=await sampleSurface(overlay,tile,{budget,signal});
  const wrap=part=>({descriptor:{...surface.descriptor,...part.pixels},readWindow:async()=>({pixels:part.pixels,release(){}})});
  if(render||sample.pixels.format!=='rgb8')result=await rasterPresentation(wrap(sample),render??{},{budget,overlay:base?wrap(base):undefined}).readWindow({x:0,y:0,width:sample.pixels.width,height:sample.pixels.height},{signal});
  else {result=sample;sample=null;}
  return {...result,metrics:{sourceBytes:(sample?.metrics?.sourceBytes??result.metrics?.sourceBytes??0)+(base?.metrics?.sourceBytes??0),outboundBytes:result.pixels.data.byteLength,displayMs:performance.now()-start}};
 }catch(e){result?.release();throw e;}finally{sample?.release();base?.release();}
}
