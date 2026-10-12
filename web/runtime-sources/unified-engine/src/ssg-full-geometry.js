import "../../runtime-context.js?v=0.16.0";
import {requireValue,checkAbort,createCooperator} from './errors.js';

export const SSG_MLESAC_THRESHOLD=13.278488654186267;
// Similarity is evaluated in image x,y. This is the coordinate permutation of
// the author's MATLAB row,column RST, not OpenCV affine RANSAC.
export function ssgFitSimilarity(pairs,ids=Array.from({length:pairs.length/4},(_,i)=>i),reflection=false){
 if(ids.length<2)return null;let ax=0,ay=0,bx=0,by=0;
 for(const i of ids){ax+=pairs[i*4];ay+=pairs[i*4+1];bx+=pairs[i*4+2];by+=pairs[i*4+3];}ax/=ids.length;ay/=ids.length;bx/=ids.length;by/=ids.length;
 let a=0,b=0,den=0;for(const i of ids){const x=(pairs[i*4]-ax)*(reflection?-1:1),y=pairs[i*4+1]-ay,u=pairs[i*4+2]-bx,v=pairs[i*4+3]-by;den+=x*x+y*y;a+=x*u+y*v;b+=x*v-y*u;}
 if(!(den>0))return null;a/=den;b/=den;if(!(a*a+b*b>0)||![a,b].every(Number.isFinite))return null;
 const sign=reflection?-1:1;return {matrix:[[sign*a,-b,bx-sign*a*ax+b*ay],[sign*b,a,by-sign*b*ax-a*ay],[0,0,1]],theta:[a,b,bx-sign*a*ax+b*ay,by-sign*b*ax-a*ay],reflection};
}
export function ssgSymmetricError(model,pairs){
 const m=model.matrix,a=m[0][0],b=m[0][1],c=m[1][0],d=m[1][1],tx=m[0][2],ty=m[1][2],det=a*d-b*c,out=new Float64Array(pairs.length/4);
 for(let i=0;i<out.length;i++){const x=pairs[i*4],y=pairs[i*4+1],u=pairs[i*4+2],v=pairs[i*4+3],dx=u-tx,dy=v-ty;out[i]=(a*x+b*y+tx-u)**2+(c*x+d*y+ty-v)**2+((d*dx-b*dy)/det-x)**2+((-c*dx+a*dy)/det-y)**2;}return out;
}
export function ssgMlesacScore(errors){
 let maximum=-Infinity;for(const e of errors)maximum=Math.max(maximum,e);
 if(!Number.isFinite(maximum))return -Infinity;
 // Source has 1/max(E), hence infinite likelihood for an exactly noiseless
 // correspondence set. Preserve +Infinity without allowing 0*Infinity NaN.
 if(maximum===0)return Infinity;
 const outlier=1/maximum,norm=(8*Math.PI)**.25;let score=-Infinity;
 for(let h=0;h<128;h++){const gamma=h/127;let sum=0;for(const e of errors)sum+=Math.log(gamma*Math.exp(-e/8)/norm+(1-gamma)*outlier);score=Math.max(score,sum);}return score;
}
function seeded(seed){let x=seed>>>0;return()=>{x=(1664525*x+1013904223)>>>0;return x/4294967296;};}
export async function ssgMlesac(pairs,{signal,seed=1,samples,recordSamples=!!samples,maxIterations=1000000,minIterations=10,reflection=false}={}){
 requireValue(pairs instanceof Float64Array&&pairs.length%4===0&&pairs.every(Number.isFinite),'Invalid SSG MLESAC pairs.');const n=pairs.length/4;requireValue(Number.isInteger(maxIterations)&&maxIterations>=1&&Number.isInteger(minIterations)&&minIterations>=0,'Invalid SSG MLESAC iterations.');checkAbort(signal);
 const spread=offset=>Array.from({length:n},(_,i)=>i).some(i=>pairs[i*4+offset]!==pairs[offset]||pairs[i*4+offset+1]!==pairs[offset+1]);
 if(n<2||!spread(0)||!spread(2))return {model:null,inliers:new Uint8Array(n),errors:new Float64Array(n),iterations:0,score:-Infinity};
 const random=seeded(seed),cooperate=createCooperator(signal);let model=null,bestCount=0,bestScore=-Infinity,bestMask=new Uint8Array(n),errors,iteration=0,limit=maxIterations;const recorded=[];
 while(iteration<=minIterations||(iteration<=limit&&iteration<=maxIterations)){
  await cooperate();let selected=samples?.[iteration];if(!selected){const a=Math.floor(random()*n),q=Math.floor(random()*(n-1));selected=[a,q>=a?q+1:q];}requireValue(selected.length===2&&selected[0]!==selected[1]&&selected.every(i=>Number.isInteger(i)&&i>=0&&i<n),'Invalid SSG sample stream.');if(recordSamples)recorded.push(selected);iteration++;
  const fitted=ssgFitSimilarity(pairs,selected,reflection);if(!fitted)continue;const e=ssgSymmetricError(fitted,pairs),mask=Uint8Array.from(e,x=>x<SSG_MLESAC_THRESHOLD),count=mask.reduce((a,b)=>a+b,0),score=ssgMlesacScore(e);
  if(count>=bestCount&&score>bestScore){const grow=count>bestCount;model=fitted;errors=e;bestMask=mask;bestCount=count;bestScore=score;if(grow){const q=count*(count-1)/(n*(n-1));if(q>Number.EPSILON)limit=1-q>1e-12?Math.ceil(Math.log(1e-6)/Math.log(1-q)):0;}}
  if(bestCount===n)break;
 }
 if(model&&bestCount>=2){model=ssgFitSimilarity(pairs,Array.from(bestMask,(v,i)=>v?i:-1).filter(i=>i>=0),reflection);errors=ssgSymmetricError(model,pairs);bestMask=Uint8Array.from(errors,e=>e<SSG_MLESAC_THRESHOLD);bestScore=ssgMlesacScore(errors);}
 return {model,inliers:bestMask,errors:errors??new Float64Array(n),iterations:iteration,score:bestScore,samples:recorded,threshold:SSG_MLESAC_THRESHOLD,rng:'recordable-uniform-without-replacement; not MATLAB clock twister',scoreDefinition:'128-gamma-grid-MLESAC',zeroResidual:'infinite-source-likelihood'};
}
