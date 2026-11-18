import "../../runtime-context.js?v=0.33.2";
// Exact-domain CVC reduction. The caller owns/funds target and scratch; this
// accumulator retains neither image samples nor a joint N-by-N matrix.
import {EngineError, requireValue, checkAbort, checkpoint} from './errors.js';

export function cvcAccumulatorPlan({levels=65536}={}){
 requireValue(Number.isInteger(levels)&&levels>=2&&levels<=65536,'Invalid CVC level count.');
 return Object.freeze({levels,targetType:'Uint16Array',targetLength:levels,targetBytes:levels*2,
  scratchType:'Float64Array',scratchLength:7*levels+2,scratchBytes:(7*levels+2)*8,
  sections:Object.freeze({diagonal:0,forcing:levels,compensation:2*levels,before:3*levels,z:4*levels,powers:5*levels}),
  retainedBytes:levels*2+(7*levels+2)*8,additionalBytes:0});
}

export function createCvcAccumulator({levels=65536,target,scratch,signal}={}){
 const plan=cvcAccumulatorPlan({levels}),n=levels;
 requireValue(target instanceof Uint16Array&&target.length===n,'CVC requires a caller-owned Uint16 LUT.');
 requireValue(scratch instanceof Float64Array&&scratch.length>=plan.scratchLength,'CVC requires caller-owned Float64 scratch.');
 requireValue(target.buffer!==scratch.buffer||target.byteOffset+target.byteLength<=scratch.byteOffset||scratch.byteOffset+plan.scratchBytes<=target.byteOffset,'CVC target and scratch overlap.');
 checkAbort(signal);
 let diagonal=scratch.subarray(0,n),forcing=scratch.subarray(n,2*n),compensation=scratch.subarray(2*n,3*n),before=scratch.subarray(3*n,4*n),z=scratch.subarray(4*n,5*n),powers=scratch.subarray(5*n,7*n+2);
 forcing.fill(0);compensation.fill(0);before.fill(0);
 const q=1/(2+Math.sqrt(3)),oneMinusQ=1-q;
 powers[0]=1;for(let i=1;i<powers.length;i++){if(!(i&8191))checkAbort(signal);powers[i]=powers[i-1]*q;}
 const divisor=Math.sqrt(12)*(1+powers[2*n+1]);
 diagonal[0]=4;z[0]=1;
 for(let i=1;i<n;i++){if(!(i&8191))checkAbort(signal);diagonal[i]=(i===n-1?3:4)-1/diagonal[i-1];z[i]=1+z[i-1]/diagonal[i-1];}
 z[n-1]/=diagonal[n-1];for(let i=n-2;i>=0;i--)z[i]=(z[i]+z[i+1])/diagonal[i];
 let total=0,pairs=0,population=0,massSum=0,massCorrection=0,state='collecting',closing=false,finishFlight=null,disposeFlight=null,finalMetrics;
 const guard=()=>{checkAbort(signal);if(closing||state==='disposed')throw new EngineError('CANCELLED','CVC accumulator has been retired.');};
 function geom(start,length){return length?powers[start]*(1-powers[length])/oneMinusQ:0;}
 function green(i,a){const distance=Math.abs(i-a);return (powers[distance]-powers[i+a+2]+powers[2*n-1-i-a]-powers[2*n+1-distance])/divisor;}
 function prefixGreen(k,a){
  if(k<0)return 0;
  const first=k<a?geom(a-k,k+1):(1-powers[a+1]+q*(1-powers[k-a]))/oneMinusQ;
  const second=geom(a+2,k+1),third=geom(2*n-1-a-k,k+1);
  const fourth=k<a?geom(2*n+1-a,k+1):geom(2*n+1-a,a+1)+geom(2*n+1+a-k,k-a);
  return (first-second+third-fourth)/divisor;
 }
 function addAt(i,value){const previous=forcing[i],next=previous+value;compensation[i]+=Math.abs(previous)>=Math.abs(value)?(previous-next)+value:(value-next)+previous;forcing[i]=next;}
 function addPair(a,b,count=1){
  requireValue(state==='collecting'&&!closing,'CVC is no longer collecting pairs.');
  if(!(pairs&4095))guard();
  requireValue(Number.isInteger(a)&&a>=0&&a<n&&Number.isInteger(b)&&b>=0&&b<n,'Invalid CVC pair code.');
  requireValue(Number.isSafeInteger(count)&&count>=0,'Invalid CVC pair count.');
  if(!count)return;
  const weight=count*(Math.abs(a-b)+1),nextTotal=total+weight,nextPopulation=population+count;
  requireValue(Number.isSafeInteger(weight)&&Number.isSafeInteger(nextTotal)&&Number.isSafeInteger(nextPopulation),'CVC counts exceed exact Float64 integers.');
  total=nextTotal;population=nextPopulation;pairs++;before[Math.max(a,b)]+=weight;
  const mass=weight*z[a],next=massSum+mass;massCorrection+=Math.abs(massSum)>=Math.abs(mass)?(massSum-next)+mass:(mass-next)+massSum;massSum=next;
  if(a>=b)addAt(a,weight);
  if(b){const s=prefixGreen(b-1,a);addAt(b-1,-weight*(s+green(b,a)));addAt(b,weight*(green(b-1,a)+(b===n-1?3:4)*s));if(b+1<n)addAt(b+1,-weight*s);}
 }
 async function finish(){
  if(finishFlight)return finishFlight;
  requireValue(state==='collecting'&&!closing,'CVC cannot be finished.');state='finishing';
  finishFlight=(async()=>{
   guard();
   if(!total){for(let i=0;i<n;i++){if(!(i&8191)){guard();await checkpoint(signal);guard();}target[i]=i;}state='finished';finalMetrics=Object.freeze({levels:n,pairs,population,weightedTotal:0,mass:0,empty:true});return target;}
   for(let i=0;i<n;i++){if(!(i&8191)){guard();await checkpoint(signal);guard();}forcing[i]=(forcing[i]+compensation[i])/total;if(i)forcing[i]+=forcing[i-1]/diagonal[i-1];}
   forcing[n-1]/=diagonal[n-1];for(let i=n-2;i>=0;i--){if(!(i&8191)){guard();await checkpoint(signal);guard();}forcing[i]=(forcing[i]+forcing[i+1])/diagonal[i];}
   let sumZ=0,cZ=0;for(let i=0;i<n;i++){const value=z[i],next=sumZ+value;cZ+=Math.abs(sumZ)>=Math.abs(value)?(sumZ-next)+value:(value-next)+sumZ;sumZ=next;}
   const mass=(massSum+massCorrection)/total+(sumZ+cZ)/n;
   requireValue(Number.isFinite(mass)&&mass>0,'Invalid CVC target mass.');
   let cumulative=0,cumulativeCorrection=0,prefixZ=0,prefixZCorrection=0,observed=0,previous=-Infinity;
   for(let i=0;i<n;i++){
    if(!(i&8191)){guard();await checkpoint(signal);guard();}
    let value=forcing[i],next=cumulative+value;cumulativeCorrection+=Math.abs(cumulative)>=Math.abs(value)?(cumulative-next)+value:(value-next)+cumulative;cumulative=next;
    value=z[i];next=prefixZ+value;prefixZCorrection+=Math.abs(prefixZ)>=Math.abs(value)?(prefixZ-next)+value:(value-next)+prefixZ;prefixZ=next;
    forcing[i]=(cumulative+cumulativeCorrection+(i+1)/(n*n)*(prefixZ+prefixZCorrection))/mass;
    observed+=before[i];before[i]=observed/total;
    requireValue(Number.isFinite(forcing[i])&&forcing[i]>=previous,'CVC target CDF is not monotone.');previous=forcing[i];
   }
   let upper=0;
   for(let i=0;i<n;i++){
    if(!(i&8191)){guard();await checkpoint(signal);guard();}
    const value=before[i];while(upper<n-1&&forcing[upper]<value)upper++;
    target[i]=upper&&Math.abs(value-forcing[upper-1])<=Math.abs(value-forcing[upper])?upper-1:upper;
   }
   guard();state='finished';finalMetrics=Object.freeze({levels:n,pairs,population,weightedTotal:total,mass,empty:false});return target;
  })().catch(error=>{state='failed';throw error;});return finishFlight;
 }
 function dispose(){
  if(disposeFlight)return disposeFlight;closing=true;
  disposeFlight=(async()=>{if(finishFlight)try{await finishFlight;}catch{}finishFlight=null;state='disposed';diagonal=forcing=compensation=before=z=powers=null;target=null;scratch=null;})();return disposeFlight;
 }
 return {addPair,finish,dispose,get plan(){return plan;},get metrics(){return finalMetrics??Object.freeze({levels:n,pairs,population,weightedTotal:total,state});}};
}
