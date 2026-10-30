import "../../runtime-context.js?v=0.30.0";
import {compileForgeryscopeScientificScope} from './forgeryscope-scientific-scope.js';
import {requireValue,EngineError,checkAbort,controlCheckpoint} from './errors.js';
import {SELFDM_SCOPE_POLICY} from './selfdm-scoped-graph.js';
import {prepareSegmentationScientificMask} from './segmentation-scientific-scope.js';

// This is the exact half-pixel/edge policy used by selfdm-prepare.js. Membership
// includes every source sample with a nonzero bilinear coefficient, so excluded
// labels cannot enter a native centre by interpolation across their boundary.
function linearSamples(input,output,index){
 let p=Math.fround((index+.5)*input/output-.5),first=Math.floor(p);p=Math.fround(p-first);
 if(first<0){first=0;p=0;}if(first>=input-1){first=input-1;p=0;}
 return p===1?[first+1]:p>0?[first,first+1]:[first];
}
function coveredArea(polygon,[x0,y0,x1,y1]){
 let p=polygon;
 for(const [axis,bound,sign]of [[0,x0,1],[0,x1,-1],[1,y0,1],[1,y1,-1]]){
  const next=[];for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length],inside=sign*(a[axis]-bound)>=0,other=sign*(b[axis]-bound)>=0;if(inside)next.push(a);if(inside!==other){const t=(bound-a[axis])/(b[axis]-a[axis]);next.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]);}}p=next;if(!p.length)break;
 }
 return Math.abs(p.reduce((sum,v,i)=>{const q=p[(i+1)%p.length];return sum+v[0]*q[1]-q[0]*v[1];},0))/2;
}

/** Source-bound scope adapter, independent of RGB ownership. The native VGG
 * stride8/MaxPool3 padding1 grid has centres 0,8,...,504, not 4,12,...,508.
 * Convolution neighbourhoods remain original and are explicitly documented.
 */
export async function createSelfDMScientificScopeInput(context,{budget,signal}={}){
 if(context===undefined)return null;
 const {scope,width,height,sourceSha256,bounds}=context,compiled=compileForgeryscopeScientificScope(scope,{width,height,sourceSha256});
 requireValue(compiled&&['ready','excluded'].includes(scope.status)&&Array.isArray(bounds)&&bounds.length===4&&bounds.every(Number.isSafeInteger)&&bounds[0]>=0&&bounds[1]>=0&&bounds[2]<=width&&bounds[3]<=height&&bounds[2]>bounds[0]&&bounds[3]>bounds[1]&&budget?.reserve,'Source-bound SelfDM scientific scope required');
 const localWidth=bounds[2]-bounds[0],localHeight=bounds[3]-bounds[1],release=budget.reserve((512**2+64**2)*4+64**2*8+65536);let complete=false;
 const identity=JSON.stringify([SELFDM_SCOPE_POLICY,scope.schema,scope.fingerprint,sourceSha256,width,height,bounds,scope.regions,scope.excluded]);
 const admitsSourcePoint=(x,y)=>compiled.admits(bounds[0]+x,bounds[1]+y);
 const rectangularRegions=compiled.regions.filter(r=>r.polygon.length===4&&new Set(r.polygon.map(p=>p[0])).size===2&&new Set(r.polygon.map(p=>p[1])).size===2&&r.polygon.every((p,i)=>p[0]===r.polygon[(i+1)%4][0]||p[1]===r.polygon[(i+1)%4][1]));
 const admitsSourceRectangle=([x0,y0,x1,y1])=>{
  const rect=[x0+bounds[0],y0+bounds[1],x1+bounds[0],y1+bounds[1]],corners=[[rect[0],rect[1]],[rect[2],rect[1]],[rect[2],rect[3]],[rect[0],rect[3]]];
  const insideBox=r=>r.bounds[0]<=rect[0]&&r.bounds[1]<=rect[1]&&r.bounds[2]>=rect[2]&&r.bounds[3]>=rect[3];
  if(!rectangularRegions.some(insideBox)){
   if(!corners.every(([x,y])=>compiled.admits(x,y)))return false;
   const area=(rect[2]-rect[0])*(rect[3]-rect[1]);
   if(area>0&&!compiled.regions.some(r=>insideBox(r)&&coveredArea(r.polygon,rect)>=area-1e-8))return false;
  }
  const relevant=compiled.excluded.filter(r=>r.bounds[0]<=rect[2]&&r.bounds[2]>=rect[0]&&r.bounds[1]<=rect[3]&&r.bounds[3]>=rect[1]);
  if(!relevant.length)return true;
  if(!corners.every(([x,y])=>compiled.admits(x,y)))return false;
  // Native CRF cells are4px. Polygon-edge intersections, including thin or
  // oblique labels between pixel centres, must invalidate their whole domain.
  const cross=(a,b,p)=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
  const intersects=(a,b,c,d)=>{const ab1=cross(a,b,c),ab2=cross(a,b,d),cd1=cross(c,d,a),cd2=cross(c,d,b);return ab1*ab2<=0&&cd1*cd2<=0&&Math.max(Math.min(a[0],b[0]),Math.min(c[0],d[0]))<=Math.min(Math.max(a[0],b[0]),Math.max(c[0],d[0]))&&Math.max(Math.min(a[1],b[1]),Math.min(c[1],d[1]))<=Math.min(Math.max(a[1],b[1]),Math.max(c[1],d[1]));};
  for(const r of relevant){
   if(r.polygon.some(([x,y])=>x>=rect[0]&&x<=rect[2]&&y>=rect[1]&&y<=rect[3]))return false;
   for(let i=0;i<r.polygon.length;i++)for(let j=0;j<4;j++)if(intersects(r.polygon[i],r.polygon[(i+1)%r.polygon.length],corners[j],corners[(j+1)%4]))return false;
  }
  return true;
 };
 const admitsResizedPoint=(x,y,rect,resizedWidth,resizedHeight)=>{
  const [x0,y0,x1,y1]=rect,xs=linearSamples(x1-x0,resizedWidth,x),ys=linearSamples(y1-y0,resizedHeight,y);
  return xs.every(sx=>ys.every(sy=>admitsSourcePoint(x0+sx,y0+sy)));
 };
 const admitsResizedRectangle=([left,top,right,bottom],rect,resizedWidth,resizedHeight)=>{
  const [x0,y0,x1,y1]=rect,xs=linearSamples(x1-x0,resizedWidth,left),xe=linearSamples(x1-x0,resizedWidth,right),ys=linearSamples(y1-y0,resizedHeight,top),ye=linearSamples(y1-y0,resizedHeight,bottom);
  return admitsSourceRectangle([x0+xs[0],y0+ys[0],x0+xe.at(-1),y0+ye.at(-1)]);
 };
 try{
  const output=new Float32Array(512**2),coarse=new Float32Array(64**2);let outputAdmitted=0,coarseAdmitted=0;
  const xs=Array.from({length:512},(_,x)=>linearSamples(localWidth,512,x)),ys=Array.from({length:512},(_,y)=>linearSamples(localHeight,512,y));
  for(let y=0;y<512;y++){
   if((y&15)===0)await controlCheckpoint(signal);
   for(let x=0;x<512;x++)if(xs[x].every(sx=>ys[y].every(sy=>admitsSourcePoint(sx,sy)))){output[y*512+x]=1;outputAdmitted++;}
  }
  const cells=await prepareSegmentationScientificMask(context,{rows:64,columns:64,inputSide:512,originX:0,originY:0,strideX:8,strideY:8,interpolation:'selfdm-opencv-linear',budget,signal});
  try{for(let i=0;i<coarse.length;i++)coarse[i]=cells.values[i];coarseAdmitted=cells.admitted;}finally{cells.release();}
  if(!coarseAdmitted&&outputAdmitted)throw new EngineError('NEURAL_SCOPE_BELOW_GRID','Remaining acquisition has no native SelfDM correlation centre; its pixels must not be silently discarded.',{details:{bounds,side:64,stride:8,remainingInputCentres:outputAdmitted}});
  const indices=new BigInt64Array(coarseAdmitted);let next=0;for(let i=0;i<coarse.length;i++)if(coarse[i])indices[next++]=BigInt(i);
  const gridBytes=Uint8Array.from(coarse),gridSha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',gridBytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
  checkAbort(signal);complete=true;
  return {identity,matchingMask64:coarse,inputs:{scientific_scope_indices:{data:indices,dims:[coarseAdmitted],type:'int64'},scientific_scope_output:{data:output,dims:[1,1,512,512]}},metadata:{policy:SELFDM_SCOPE_POLICY,fingerprint:scope.fingerprint,coordinates:'original-pixels',sourceSha256,bounds:[...bounds],nativeGrid:[64,64],grid:[64,64],gridSha256,gridDtype:'uint8',gridMeaning:'row-major native candidate cells; 1 admitted, 0 refused',nativeStride:8,admittedCentres:coarseAdmitted,refusedCentres:64**2-coarseAdmitted,totalCentres:64**2,attentionAndCorrelationPairsPerBranch:coarseAdmitted**2,outputAdmittedCentres:outputAdmitted,stage:'gather-before-attention-and-correlation-MatMul; native-TopK48; ScatterND-native-layout; output-support-guard',projection:'whole native latent cell and OpenCV half-pixel-bilinear support; VGG-centres-at-8n',cnnContext:'Original convolution neighbourhoods are retained; no RGB painting or claim of masked CNN context.'},admitsSourcePoint,admitsSourceRectangle,admitsResizedPoint,admitsResizedRectangle,release};
 }finally{if(!complete)release();}
}
