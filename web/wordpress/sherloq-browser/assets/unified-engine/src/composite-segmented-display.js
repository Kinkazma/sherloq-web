import {createNumericBank} from './numeric-bank.js';
import {requireValue,checkAbort} from './errors.js';
const MiB=1024**2;
export function nearestRange(range,coordinate){let lo=0,hi=range.length-1;while(lo<hi){const mid=Math.floor((lo+hi)/2);if(coordinate>(range[mid]+range[mid+1])*.5)lo=mid+1;else hi=mid;}return lo;}
export async function compositeNoiseDisplay(noise,{budget,statistics,getTemporarySession,signal,onProgress,storage='auto'}={}){
 const {width,height}=noise,n=width*height,step=Math.max(1,Math.min(128,Math.floor(8*MiB/(width*16)))),interior=Math.min(width,height)>68,border=interior?34:0;let low=Infinity,high=-Infinity,output;
 try{
  for(let y=border;y<height-border;y+=step){const rows=Math.min(step,height-border-y),part=await noise.readRows(y,rows,{signal});try{for(let row=0;row<rows;row++)for(let x=border;x<width-border;x++){const v=part.data[row*width+x];low=Math.min(low,v);high=Math.max(high,v);}}finally{part.release();}}
  output=await createNumericBank(Uint8Array,[height,width,3],{budget,signal,storage:storage==='auto'?(n*3>budget.limit/12?'temporary':'memory'):storage,getTemporarySession});
  for(let y=0;y<height;y+=step){const rows=Math.min(step,height-y),part=await noise.readRows(y,rows,{signal});let r;try{r=await statistics.run('bank:noise-display',{noise:{data:part.data,dims:[rows,width]},range:{data:Float64Array.of(low,high),dims:[2]}},{signal,onProgress,workspaceBytes:rows*width*24,outputBytes:rows*width*3});await output.writeRows(y,rows,r.result.noise_rgb.data,{signal});}finally{r?.release();part.release();}}
  return output;
 }catch(e){await output?.dispose();throw e;}
}
export async function compositeRasterBanks(grid,range0,range1,width,height,{budget,statistics,getTemporarySession,signal,onProgress,storage='auto'}={}){
 const n=width*height,nx=range1.length,step=Math.max(1,Math.min(128,Math.floor(8*MiB/(width*12))));let raster,rgb;
 try{
  const make=(shape)=>createNumericBank(Uint8Array,shape,{budget,signal,storage:storage==='auto'?(shape.reduce((a,b)=>a*b,1)>budget.limit/12?'temporary':'memory'):storage,getTemporarySession});raster=await make([height,width]);rgb=await make([height,width,3]);
  const indexLease=budget.reserve(width*4),xindex=Int32Array.from({length:width},(_,x)=>nearestRange(range1,x));
  try{for(let y=0;y<height;y+=step){checkAbort(signal);const rows=Math.min(step,height-y),release=budget.reserve(rows*width);let r;
   try{const bytes=new Uint8Array(rows*width);for(let row=0;row<rows;row++){const sy=nearestRange(range0,y+row);for(let x=0;x<width;x++)bytes[row*width+x]=255-grid[sy*nx+xindex[x]];}await raster.writeRows(y,rows,bytes,{signal});r=await statistics.run('bank:color',{raster:{data:bytes,dims:[rows,width]}},{signal,onProgress,workspaceBytes:rows*width*12,outputBytes:rows*width*3});await rgb.writeRows(y,rows,r.result.map_rgb.data,{signal});}finally{r?.release();release();}
  }}finally{indexLease();}
  return {raster,map_rgb:rgb};
 }catch(e){await raster?.dispose();await rgb?.dispose();throw e;}
}
export async function renderCompositeSegmented(result,view='noise',rect,{budget,signal}={}){
 const d=result.data,field=d[view+'_rgb'];requireValue(['noise','map'].includes(view)&&field?.readInto,'Requested segmented Composite view is unavailable.');rect??={x:0,y:0,width:d.width,height:d.height};const {x,y,width,height}=rect;requireValue([x,y,width,height].every(Number.isInteger)&&x>=0&&y>=0&&width>0&&height>0&&x+width<=d.width&&y+height<=d.height,'Invalid Composite display window.');
 const release=budget.reserve(width*height*3);try{const data=new Uint8Array(width*height*3);for(let row=0;row<height;row++)await field.readInto(data.subarray(row*width*3,(row+1)*width*3),((y+row)*d.width+x)*3,{signal});return {width,height,format:'rgb8',origin:[x,y],data,release};}catch(e){release();throw e;}
}
