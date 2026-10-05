import {denseSumFloat32} from './dense-math.js';
import {requireValue,controlCheckpoint} from './errors.js';
export const DENSE_DETAIL_POLICY=Object.freeze({minimum_ncc:.8,minimum_samples:6,maximum_samples:32,patch_width:9,alignment_radius:1,alignment_step:.5,highpass_sigma:1.2});
const f=Math.fround;
const median=a=>{const sorted=Array.from(a).sort((a,b)=>a-b),n=sorted.length;return n%2?sorted[n>>1]:(sorted[n/2-1]+sorted[n/2])/2;};
function demean(values){for(let start=0;start<values.length;start+=81){const mean=f(denseSumFloat32(values,start,81)/81);for(let i=start;i<start+81;i++)values[i]=f(values[i]-mean);}return values;}
export async function corroborateDenseDetail(detail,sampler,points,model,{signal}={}){
 await controlCheckpoint(signal);let ids=model.source_point_indices;requireValue(Array.isArray(ids)&&points.length%7===0,'Invalid detail model points.');
 if(ids.length>32){const full=ids;ids=Array.from({length:32},(_,i)=>full[i===31?full.length-1:Math.floor(i*((full.length-1)/31))]);}
 const matrix=model.matrix.flat(),src=[],dst=[];
 for(const id of ids){
  requireValue(Number.isInteger(id)&&id>=0&&id<points.length/7,'Invalid detail source point.');let valid=true;const a=[],b=[];
  for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){
   const x=points[id*7]+dx,y=points[id*7+1]+dy,w=x*matrix[6]+y*matrix[7]+matrix[8],u=Math.abs(w)>1e-12?(x*matrix[0]+y*matrix[1]+matrix[2])/w:Infinity,v=Math.abs(w)>1e-12?(x*matrix[3]+y*matrix[4]+matrix[5])/w:Infinity;
   valid&&=x>=0&&y>=0&&x<detail.width-1&&y<detail.height-1&&u>=1&&v>=1&&u<detail.width-2&&v<detail.height-2;a.push([x,y]);b.push([u,v]);
  }if(valid){src.push(a);dst.push(b);}
 }
 if(src.length<6)return {accepted:false,ncc:0,samples:src.length};
 const sample=coordinates=>sampler.sample(Float32Array.from(coordinates.flatMap(row=>row.map(p=>p[0]))),Float32Array.from(coordinates.flatMap(row=>row.map(p=>p[1]))),coordinates.length,81);
 const all=demean(await sample(src)),a=[],targets=[],norms=[];
 for(let i=0;i<src.length;i++){const norm=f(Math.sqrt(denseSumFloat32(all,i*81,81,true)));if(norm>=1){a.push(all.slice(i*81,(i+1)*81));targets.push(dst[i]);norms.push(norm);}}
 if(a.length<6)return {accepted:false,ncc:0,samples:a.length};
 const best=new Float64Array(a.length).fill(-1),products=new Float32Array(81);
 for(const y of [-1,-.5,0,.5,1])for(const x of [-1,-.5,0,.5,1]){
  await controlCheckpoint(signal);const b=demean(await sample(targets.map(row=>row.map(p=>[p[0]+x,p[1]+y]))));
  for(let i=0;i<a.length;i++){const n=f(Math.sqrt(denseSumFloat32(b,i*81,81,true)));for(let k=0;k<81;k++)products[k]=f(a[i][k]*b[i*81+k]);const score=f(denseSumFloat32(products,0,81)/Math.max(f(norms[i]*n),f(1e-9)));best[i]=Math.max(best[i],score);}
 }
 const ncc=median(best);return {accepted:ncc>=.8,ncc,samples:a.length};
}
export async function corroborateDenseGroups(detail,sampler,points,groups,models,hooks={}){
 if(!models.length)return {groups,models};const accepted=[],fitted=[];
 for(let i=0;i<models.length;i++){const score=await corroborateDenseDetail(detail,sampler,points,models[i],hooks);if(score.accepted){accepted.push(groups[i]);fitted.push({...models[i],detail_corroboration:score});}}
 return {groups:accepted,models:fitted};
}
