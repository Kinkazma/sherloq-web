import "../../runtime-context.js?v=0.16.0";
import {requireValue,checkAbort,createCooperator} from './errors.js';

export function efficientLoFtrParams(input={}){
 const p={algorithm:'EfficientLoFTR',compare:true,longSide:832,threshold:.2,limit:6000,rotations:[0],reflections:false,
  minimum:5,tolerance:50,model:'Affine',geometricThreshold:3,geometricMinimum:24,regions:[],excluded:[],...input};
 requireValue(p.algorithm==='EfficientLoFTR'&&p.compare===true&&Array.isArray(p.regions)&&p.regions.length===2,'EfficientLoFTR requires comparison of two explicit regions.');
 requireValue(Number.isInteger(p.longSide)&&p.longSide>=64&&p.longSide<=2048&&Number.isFinite(p.threshold)&&p.threshold>0&&p.threshold<=1,'Invalid EfficientLoFTR size or confidence.');
 requireValue(Number.isInteger(p.limit)&&p.limit>=1&&p.limit<=20000,'Invalid EfficientLoFTR published correspondence limit.');
 requireValue(Array.isArray(p.rotations)&&p.rotations.length>=1&&p.rotations.length<=4&&new Set(p.rotations).size===p.rotations.length&&p.rotations.every(x=>[0,90,180,270].includes(x))&&typeof p.reflections==='boolean','Invalid EfficientLoFTR transformations.');
 requireValue([p.minimum,p.tolerance,p.geometricThreshold].every(Number.isFinite)&&p.minimum>=0&&p.tolerance>0&&p.geometricThreshold>0&&['None','Similarity','Affine','Homography'].includes(p.model)&&Number.isInteger(p.geometricMinimum)&&p.geometricMinimum>=4,'Invalid EfficientLoFTR geometry.');
 for(const key of ['regions','excluded'])requireValue(Array.isArray(p[key])&&p[key].every(poly=>Array.isArray(poly)&&poly.length>=3&&poly.every(xy=>Array.isArray(xy)&&xy.length===2&&xy.every(x=>Number.isFinite(x)&&Math.abs(x)<=2**30))),'Invalid EfficientLoFTR polygons.');
 return p;
}
export function efficientLoFtrCrop(image,polygon,longSide){
 const xs=polygon.map(p=>p[0]),ys=polygon.map(p=>p[1]);
 const x=Math.max(0,Math.floor(Math.min(...xs))),y=Math.max(0,Math.floor(Math.min(...ys))),
  right=Math.min(image.width,Math.ceil(Math.max(...xs))+1),bottom=Math.min(image.height,Math.ceil(Math.max(...ys))+1);
 requireValue(right>x&&bottom>y,'EfficientLoFTR region lies outside the image.');
 const width=right-x,height=bottom-y,scale=Math.min(1,longSide/Math.max(width,height)),
  contentWidth=Math.max(1,Math.round(width*scale)),contentHeight=Math.max(1,Math.round(height*scale));
 return {x,y,width,height,contentWidth,contentHeight,widthPadded:Math.ceil(contentWidth/32)*32,heightPadded:Math.ceil(contentHeight/32)*32};
}
export function efficientLoFtrVariants(p){return p.rotations.flatMap(rotation=>p.reflections?[{rotation,reflected:false},{rotation,reflected:true}]:[{rotation,reflected:false}]);}
export function efficientLoFtrShape(crop,rotation=0){return rotation%180?{width:crop.heightPadded,height:crop.widthPadded}:{width:crop.widthPadded,height:crop.heightPadded};}

// Three live FP32 N0×N1 tensors at the coarse dual-softmax boundary. The
// portable fine stage gathers only selected windows and nine regression
// logits, with correlation scratch limited to 512 independent rows. Retain
// the conservative full-row bound below for the graph allocator's separate
// coarse/fine arenas. Its maximum match count is
// bounded by the native two-cell source border, not by an empirical sample.
// These are competing lifetime peaks, never a trial inference.
export function efficientLoFtrWorkspace(a,b){
 const pixels=a.width*a.height+b.width*b.height,n0=a.width*a.height/64,n1=b.width*b.height/64;
 requireValue([a.width,a.height,b.width,b.height].every(x=>Number.isInteger(x)&&x>=32&&x<=2048&&x%32===0),'Invalid EfficientLoFTR padded shape.');
 const matrix=n0*n1,sourceInterior=Math.max(0,a.width/8-4)*Math.max(0,a.height/8-4),
  targetInterior=Math.max(0,b.width/8-4)*Math.max(0,b.height/8-4),maximumMatches=targetInterior?sourceInterior:0,
  coarse=matrix*12+pixels*128+(n0+n1)*2048,
  fine=maximumMatches*((64+100)*64*4+4*64*100*4)+pixels*128,
  fpn=pixels*512,workspaceBytes=Math.ceil(Math.max(coarse,fine,fpn)+32*1024**2);
 // GPU control/subgraphs may use WASM fallback. Admit the same graph liveness
 // there rather than assuming every large tensor stays on the graphics card.
 return {workspaceBytes,gpuWasmWorkspaceBytes:workspaceBytes,outputBytes:maximumMatches*5*4,
  maximumMatches,candidateComparisons:matrix};
}
const gray=(r,g,b)=>(r*4899+g*9617+b*1868+8192)>>>14;
// OpenCV's 8-bit RGB→gray coefficients, followed by explicit half-pixel
// bilinear resizing of grayscale values. Only useful source rows are read.
export async function prepareEfficientLoFtr(image,crop,{signal,reserveMemory}={}){
 requireValue(typeof reserveMemory==='function','EfficientLoFTR preparation requires memory admission.');
 const {contentWidth:w,contentHeight:h,widthPadded:wp,heightPadded:hp}=crop;
 const release=reserveMemory(wp*hp*4);let freeRows,output,completed=false;
 const rows=new Map(),cooperate=createCooperator(signal);
 const sourceRow=async y=>{
  if(rows.has(y))return rows.get(y);
  const data=new Uint8Array(crop.width);let window;
  try{
   const rgb=image.data?image.data.subarray(y*image.width*3,(y+1)*image.width*3):(window=await image.readRows(y,1,{signal})).pixels?.data;
   requireValue(rgb instanceof Uint8Array&&rgb.length===image.width*3,'Invalid EfficientLoFTR source row.');
   for(let x=0;x<crop.width;x++){const i=(crop.x+x)*3;data[x]=gray(rgb[i],rgb[i+1],rgb[i+2]);}
  }finally{window?.release?.();}
  rows.set(y,data);return data;
 };
 try{
  freeRows=reserveMemory(image.width*3*2+crop.width*2);output=new Float32Array(wp*hp);
  for(let y=0;y<h;y++){
   checkAbort(signal);const sy=(y+.5)*crop.height/h-.5,iy=Math.floor(sy),fy=sy-iy,
    y0=crop.y+Math.max(0,Math.min(crop.height-1,iy)),y1=crop.y+Math.max(0,Math.min(crop.height-1,iy+1));
   for(const key of rows.keys())if(key!==y0&&key!==y1)rows.delete(key);
   const a=await sourceRow(y0),b=await sourceRow(y1);
   for(let x=0;x<w;x++){
    const sx=(x+.5)*crop.width/w-.5,ix=Math.floor(sx),fx=sx-ix,x0=Math.max(0,Math.min(crop.width-1,ix)),x1=Math.max(0,Math.min(crop.width-1,ix+1));
    output[y*wp+x]=((a[x0]*(1-fx)+a[x1]*fx)*(1-fy)+(b[x0]*(1-fx)+b[x1]*fx)*fy)/255;
   }
   await cooperate();
  }
  completed=true;return {data:output,dims:[1,1,hp,wp],crop,release};
 }finally{rows.clear();freeRows?.();if(!completed)release();}
}
export function transformEfficientLoFtr(prepared,variant,{reserveMemory}={}){
 const {rotation,reflected}=variant;
 if(rotation===0&&!reflected)return {...prepared,release(){}};
 const c=prepared.crop,w=c.contentWidth,h=c.contentHeight,shape=efficientLoFtrShape(c,rotation),
  release=reserveMemory(shape.width*shape.height*4);let complete=false;
 try{
  const output=new Float32Array(shape.width*shape.height);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const mx=reflected?w-1-x:x;
   const tx=rotation===0?mx:rotation===90?h-1-y:rotation===180?w-1-mx:y,
    ty=rotation===0?y:rotation===90?mx:rotation===180?h-1-y:w-1-mx;
   output[ty*shape.width+tx]=prepared.data[y*c.widthPadded+x];
  }
  complete=true;return {data:output,dims:[1,1,shape.height,shape.width],crop:c,release};
 }finally{if(!complete)release();}
}
export function mapEfficientLoFtrPoint(x,y,c,variant={rotation:0,reflected:false}){
 const {rotation,reflected}=variant,w=c.contentWidth,h=c.contentHeight;
 let u=rotation===0?x:rotation===90?y:rotation===180?w-1-x:w-1-y,
  v=rotation===0?y:rotation===90?h-1-x:rotation===180?h-1-y:x;
 if(reflected)u=w-1-u;
 if(!Number.isFinite(u)||!Number.isFinite(v)||u<0||v<0||u>=w||v>=h)return null;
 return [c.x+(u+.5)*c.width/w-.5,c.y+(v+.5)*c.height/h-.5];
}
export function efficientLoFtrInside([x,y],polygon){
 let inside=false;
 for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
  const [a,b]=polygon[j],[c,d]=polygon[i],cross=(x-a)*(d-b)-(y-b)*(c-a);
  if(Math.abs(cross)<=1e-7&&x>=Math.min(a,c)&&x<=Math.max(a,c)&&y>=Math.min(b,d)&&y<=Math.max(b,d))return true;
  if((b>y)!==(d>y)&&x<(c-a)*(y-b)/(d-b)+a)inside=!inside;
 }return inside;
}
