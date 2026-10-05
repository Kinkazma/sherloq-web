import {wasmAllocationFailure} from './allocation.js';
import {EngineError,checkAbort,controlCheckpoint} from './errors.js';
import {TypedPages,finishCorrespondences} from './m3-typed-pages.js';

export async function boundedG2nn(input,{signal,onProgress,reserveMemory,maxPairs,reason}={}){
 const {points,descriptors,members,zoneCount,radius,minimum,ratio,compare=false,radii=null,gap=[0,0],axes=null,variants=null}=input,n=points.length/7;
 const rows=new TypedPages(Float64Array,5,reserveMemory),frees=[],pointers=[];let m,working,trainRows=Math.max(1,Math.min(8192,n)),queryRows=32;
 const admit=bytes=>{const free=reserveMemory(bytes);frees.push(free);return free;};
 try{
  // One context at a time: membership does not create zoneCount copies of ids.
  admit(n*8+zoneCount*8+1024);
  for(;;){try{working=admit(2*1024**2+(trainRows+queryRows)*148*3+queryRows*192);break;}catch(error){if(error.code!=='MEMORY_LIMIT'||trainRows===1)throw error;trainRows=Math.max(1,Math.floor(trainRows/2));}}
  const {default:create}=await import('../vendor/sift-g2nn/sift-g2nn.js');m=await create();checkAbort(signal);
  const allocate=bytes=>{const p=m._malloc(Math.max(8,bytes));if(!p)throw wasmAllocationFailure(m,'Bounded G2NN allocation failed.',Math.max(8,bytes));pointers.push(p);return p;};
  const qd=allocate(queryRows*128),qc=allocate(queryRows*16),qi=allocate(queryRows*4),td=allocate(trainRows*128),tc=allocate(trainRows*16),ti=allocate(trainRows*4),sp=allocate(queryRows*96);
  let descriptorsBlock=new Uint8Array(Math.max(queryRows,trainRows)*128),coordsBlock=new Float64Array(Math.max(queryRows,trainRows)*2),idsBlock=new Uint32Array(Math.max(queryRows,trainRows)),state=new Float64Array(queryRows*12);
  const interpolate=(x,a)=>{if(x<=0)return a[0];if(x>=a.length-1)return a.at(-1);const k=Math.floor(x);return a[k]+(x-k)*(a[k+1]-a[k]);};
  const put=(p,a)=>m.HEAPU8.set(new Uint8Array(a.buffer,a.byteOffset,a.byteLength),p);
  const stage=(ids,start,length,dp,cp,ip)=>{for(let i=0;i<length;i++){const id=ids[start+i];idsBlock[i]=id;for(let k=0;k<128;k++)descriptorsBlock[i*128+k]=descriptors[id*128+k];for(let k=0;k<2;k++)coordsBlock[i*2+k]=axes?interpolate(points[id*7+k],axes[k]):points[id*7+k];}put(dp,descriptorsBlock.subarray(0,length*128));put(cp,coordsBlock.subarray(0,length*2));put(ip,idsBlock.subarray(0,length));};
  let total=0,done=0,evaluated=0,blocks=0,lastYield=performance.now();for(const value of members)total+=value;
  let q=new Uint32Array(n),t=new Uint32Array(n);
  for(let zone=0;zone<(compare?2:zoneCount);zone++)for(let frame=0;frame<(variants?2:1);frame++){
   let nq=0,nt=0;for(let i=0;i<n;i++){if(members[i*zoneCount+zone]&&(!variants||variants[i]===frame))q[nq++]=i;if(members[i*zoneCount+(compare?1-zone:zone)]&&(!variants||variants[i]!==frame))t[nt++]=i;}
   const delta=compare&&zone===1?gap.map(x=>-x):compare?gap:[0,0],maximum=!compare&&radii?Math.min(radius,radii[zone]):radius;
   if(nt<2){done+=nq;onProgress?.(done/Math.max(1,total));continue;}
   for(let first=0;first<nq;first+=queryRows){
    checkAbort(signal);const count=Math.min(queryRows,nq-first);stage(q,first,count,qd,qc,qi);
    for(let i=0;i<count*4;i++){state[i*3]=0xffffffff;state[i*3+1]=Infinity;state[i*3+2]=0;}put(sp,state.subarray(0,count*12));
    for(let at=0;at<nt;at+=trainRows){
     if(performance.now()-lastYield>=8){await controlCheckpoint(signal);lastYield=performance.now();}
     const size=Math.min(trainRows,nt-at);stage(t,at,size,td,tc,ti);evaluated+=m._sift_g2nn_accumulate(qd,qc,qi,count,td,tc,ti,size,minimum,maximum,...delta,points instanceof Float32Array&&!axes?1:0,sp);blocks++;
    }
    for(let i=0;i<count;i++){
     const nearest=[];for(let k=0;k<4;k++){const at=sp/8+i*12+k*3,squared=m.HEAPF64[at+1];if(Number.isFinite(squared))nearest.push([m.HEAPF64[at],Math.fround(Math.sqrt(Math.fround(squared))),m.HEAPF64[at+2]]);}
     nearest.sort((a,b)=>a[1]-b[1]||a[0]-b[0]);let cutoff=0;for(let k=0;k<nearest.length-1;k++)if(nearest[k+1][1]>nearest[0][1]/ratio){cutoff=k+1;break;}
     const source=q[first+i];for(let k=0;k<cutoff;k++){const [target,distance,spatial]=nearest[k];rows.push(Math.min(source,target),Math.max(source,target),distance/(512*Math.sqrt(2)),spatial,compare?-1:zone);}
    }
    done+=count;onProgress?.(done/Math.max(1,total));
   }
  }
  checkAbort(signal);
  // Dispose the compute workspace before allocating the final owned results.
  for(const p of pointers)m._free(p);pointers.length=0;m=null;
  descriptorsBlock=coordsBlock=idsBlock=state=q=t=null;for(const free of frees)free?.();frees.length=0;
  const output=finishCorrespondences(rows,{deduplicate:true,maxPairs});onProgress?.(1);checkAbort(signal);
  return {...output,candidateComparisons:evaluated,backend:'cpu',metadata:{staging:'bounded-global',trainingRows:trainRows,queryRows,blocks,reason,integerDescriptorDistance:true,spatialArithmetic:'native-float64'},preflightExecutions:0};
 }finally{rows.dispose();if(m)for(const p of pointers)m._free(p);for(const free of frees)free?.();}
}
