import "../../runtime-context.js?v=0.16.0";
import {compileForgeryscopeScientificScope} from './forgeryscope-scientific-scope.js';
import {requireValue,checkAbort,controlCheckpoint} from './errors.js';

const area=p=>Math.abs(p.reduce((a,v,i)=>{const q=p[(i+1)%p.length];return a+v[0]*q[1]-q[0]*v[1];},0))/2;
function clipped(p,[x0,y0,x1,y1]){
 for(const [axis,bound,sign]of [[0,x0,1],[0,x1,-1],[1,y0,1],[1,y1,-1]]){const next=[];
  for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length],inside=sign*(a[axis]-bound)>=0,other=sign*(b[axis]-bound)>=0;if(inside)next.push(a);if(inside!==other){const t=(bound-a[axis])/(b[axis]-a[axis]);next.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]);}}p=next;if(!p.length)break;
 }return p;
}
// Exact nonzero support of the existing Pillow bilinear preparation at its
// extreme prepared pixels; this is not the CNN receptive field.
function support(input,side,index,interpolation){
 if(interpolation==='selfdm-opencv-linear'){const scale=input/side,coordinate=Math.fround((index+.5)*scale-.5);let first=Math.floor(coordinate),fraction=Math.fround(coordinate-first);if(first<0){first=0;fraction=0;}if(first>=input-1){first=input-1;fraction=0;}return[fraction===1?Math.min(input-1,first+1):first,fraction===0?first:Math.min(input-1,first+1)];}
 if(input===side)return [index,index];const scale=input/side,s=Math.max(1,scale),center=(index+.5)*scale;
 let first=Math.max(0,Math.trunc(center-s+.5)),last=Math.min(input,Math.trunc(center+s+.5))-1;
 let sum=0;for(let j=first;j<=last;j++){const x=Math.abs((j-center+.5)*(1/s));sum+=x<1?1-x:0;}
 const nonzero=j=>{const x=Math.abs((j-center+.5)*(1/s));return Math.trunc(.5+(x<1?1-x:0)/sum*2**22)>0;};
 while(first<last&&!nonzero(first))first++;while(last>first&&!nonzero(last))last--;return[first,last];
}
function cells(length,count,inputSide,origin,stride,interpolation){
 return Array.from({length:count},(_,i)=>{
  const step=stride??inputSide/count,center=origin===undefined?(i+.5)*step-.5:origin+i*step;
  const first=Math.max(0,Math.ceil(center-step/2)),last=Math.min(inputSide-1,Math.floor(center+step/2));
  requireValue(first<=last,'Latent scientific cell falls outside native input');return[support(length,inputSide,first,interpolation)[0],support(length,inputSide,last,interpolation)[1]];
 });
}
/** Conservative source/target domain in original pixels. Thin excluded polygons
 * invalidate a cell even when they do not cover its centre. RGB and learned
 * features remain immutable, including their native/global CNN context. */
export async function prepareSegmentationScientificMask(context,{rows,columns=rows,inputSide,originX,originY,strideX,strideY,interpolation='pillow-bilinear',budget,signal}={}){
 if(context===undefined)return null;
 const {scope,width,height,sourceSha256,bounds}=context,compiled=compileForgeryscopeScientificScope(scope,{width,height,sourceSha256});
 requireValue(Array.isArray(bounds)&&bounds.length===4&&bounds.every(Number.isSafeInteger)&&bounds[0]>=0&&bounds[1]>=0&&bounds[2]<=width&&bounds[3]<=height&&bounds[2]>bounds[0]&&bounds[3]>bounds[1],'Original scientific crop bounds required');
 requireValue([rows,columns,inputSide].every(v=>Number.isSafeInteger(v)&&v>0&&v<=512)&&typeof budget?.reserve==='function','Bounded scientific latent grid required');
 requireValue(['pillow-bilinear','selfdm-opencv-linear'].includes(interpolation),'Qualified segmentation interpolation required');
 requireValue([originX,originY].every(v=>v===undefined||Number.isFinite(v))&&[strideX,strideY].every(v=>v===undefined||Number.isFinite(v)&&v>0),'Qualified native feature centres required');
 const n=rows*columns,release=budget.reserve(n+(rows+columns)*64+8192);let complete=false;
 try{
  const xs=cells(bounds[2]-bounds[0],columns,inputSide,originX,strideX,interpolation),ys=cells(bounds[3]-bounds[1],rows,inputSide,originY,strideY,interpolation),values=new Uint8Array(n);let admitted=0;
  for(let y=0;y<rows;y++){if((y&15)===0)await controlCheckpoint(signal);for(let x=0;x<columns;x++){
   const rect=[bounds[0]+xs[x][0],bounds[1]+ys[y][0],bounds[0]+xs[x][1],bounds[1]+ys[y][1]],a=(rect[2]-rect[0])*(rect[3]-rect[1]);
   const corners=[[rect[0],rect[1]],[rect[2],rect[1]],[rect[2],rect[3]],[rect[0],rect[3]]];
   if(!corners.every(([px,py])=>compiled.admits(px,py)))continue;
   if(a>0&&!compiled.regions.some(r=>area(clipped(r.polygon,rect))>=a-1e-8))continue;
   if(compiled.excluded.some(r=>r.bounds[0]<=rect[2]&&r.bounds[2]>=rect[0]&&r.bounds[1]<=rect[3]&&r.bounds[3]>=rect[1]&&clipped(r.polygon,rect).length))continue;
   values[y*columns+x]=1;admitted++;
  }}checkAbort(signal);
  const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',values)),v=>v.toString(16).padStart(2,'0')).join('');checkAbort(signal);complete=true;
  return {values,admitted,total:n,partial:admitted!==n,metadata:{schema:'sherloq.segmentation-candidate-domain/1',scopeFingerprint:scope.fingerprint,sourceSha256,width,height,bounds:[...bounds],grid:[rows,columns],gridSha256:sha256,inputSide,coordinates:'original-pixels',interpolation,policy:'whole latent cell and native preparation interpolation support; excluded polygons never contribute candidate positions',nativeCentres:originX===undefined?'normalized feature-grid partition':{originX,originY,strideX,strideY},admittedSources:admitted,admittedTargets:admitted,rejectedSources:n-admitted,rejectedTargets:n-admitted,cnnContext:'Native RGB, convolutions, pooled/global context and downstream decoder are unchanged; this is candidate-domain filtering, not masked CNN inference.'},release};
 }finally{if(!complete)release();}
}
