import "../../runtime-context.js?v=0.25.0";
import{createTntOwnedConvolutionGpu}from'./mgcfdn-tnt-owned-convolution-gpu.js';
import{requireValue,checkAbort,controlCheckpoint}from'./errors.js';
import{retireCompositeOwners}from'./composite-owner-release.js';
const LIMIT=64*1024**2;
// VIG native ordered-FMA convolutions and complete-target graph distances.
// Spatial convolutions only consume real RGB contexts; common banks use1x1.
// TopK, dilation, normalization and max-relative gather remain native WASM.
export function createVigWindowGpu({budget,contextCells,onOwner,gpuFactory=createTntOwnedConvolutionGpu}){
 requireValue(budget?.reserve&&typeof onOwner==='function'&&Number.isSafeInteger(contextCells)&&contextCells>=256&&contextCells%256===0&&contextCells<=4096,'VIG bank must fit the native GPU channels4096 limit');
 const children=new Set(),deviceOwners=new Set(),gpuCredits=new Set(),jobs=new Set(),outputs=new Set(),controller=new AbortController();let device,creating,running,closing,closed=false,retiring=false,needsDeviceRetirement=false;
 const trackCredit=free=>{let active=true,credit;credit=new Proxy(free,{apply(target,thisArg,args){if(!active)return;const value=Reflect.apply(target,thisArg,args);active=false;gpuCredits.delete(credit);return value;},get(target,key){if(key==='split')return bytes=>trackCredit(target.split(bytes));return Reflect.get(target,key);}});gpuCredits.add(credit);return credit;};
 const reserveOwned=bytes=>trackCredit(budget.reserve(bytes));
 const current=signal=>{checkAbort(controller.signal);checkAbort(signal);requireValue(!retiring&&!closed,'VIG native GPU bank retired');};
 const retireChild=async child=>{await child.release();children.delete(child);};
 const retireChildren=()=>retireCompositeOwners([...children].map(child=>()=>retireChild(child)));
 async function retireDevice(){try{await creating;}catch{}const hadOwner=deviceOwners.size>0||device!==undefined;await retireCompositeOwners([...deviceOwners].map(value=>async()=>{await value.dispose();deviceOwners.delete(value);}));requireValue(!gpuCredits.size||hadOwner,'A failed GPU constructor still owns resources without a retirement ACK');device=undefined;creating=undefined;for(const free of[...gpuCredits])free();needsDeviceRetirement=false;}
 const freeJob=job=>{for(const free of job.credits.splice(0))free();jobs.delete(job);};
 async function retry(){await retireChildren();if(needsDeviceRetirement)await retireDevice();for(const job of[...jobs]){job.output?.release();freeJob(job);}}
 const owner={release(){if(closing)return closing;if(closed)return;retiring=true;controller.abort();closing=(async()=>{try{await running;}catch{}await retireChildren();await retireDevice();for(const job of[...jobs]){job.output?.release();freeJob(job);}for(const output of[...outputs])output.release();closed=true;})().finally(()=>closing=undefined);return closing;}};onOwner(owner);
 async function ready(signal){if(!creating)creating=Promise.resolve().then(async()=>{const value=await gpuFactory({budget,reserveOwned,onOutputOwner:value=>children.add(value),onOwner:child=>deviceOwners.add(child)});device=value;deviceOwners.add(value);return value;});await creating;current(signal);return device;}
 function outputFor(job,length){let data,free=budget.reserve(length*4);const result={get data(){return data;},workers:0,gpu:null,timings:null,release(){if(!free)return;free();free=undefined;data=undefined;outputs.delete(result);}};job.output=result;outputs.add(result);data=new Float32Array(length);return{result,data};}
 const ownTemp=(job,bytes)=>{const free=budget.reserve(bytes);job.credits.push(free);return()=>{free();const at=job.credits.indexOf(free);if(at>=0)job.credits.splice(at,1);};};
 async function nativePart(job,input,weights,bias,geometry,signal,onProgress){
  const {channels,height,width,outChannels,kernel=1,padding=0,stride=1}=geometry,oh=Math.floor((height+2*padding-kernel)/stride)+1,ow=Math.floor((width+2*padding-kernel)/stride)+1,n=outChannels*oh*ow,layoutBytes=Math.max(8,(geometry.referenceLayout?.biasAfterRanges?.length??0)*8),bytes=input.byteLength+weights.byteLength+bias.byteLength+2*n*4+64+layoutBytes;
  requireValue(bytes<=LIMIT,'VIG explicit GPU buffer ceiling unchanged');const native=await ready(signal),value=await native.run({input,weights,bias,...geometry,hasBias:true},{signal,onSubmitted:()=>onProgress?.({phase:'vig-window-gpu',completed:job.parts})});children.add(value);current(signal);requireValue(value?.data instanceof Float32Array&&value.data.length===n,'Native VIG GPU output extent');job.peak=Math.max(job.peak,bytes);job.parts++;job.writeBytes+=input.byteLength+weights.byteLength+bias.byteLength+64+layoutBytes;job.readBytes+=value.data.byteLength;return value;
 }
 function execute(work,input,hooks={}){requireValue(!running&&!retiring&&!closed,'One native VIG GPU bank job at a time');const signal=AbortSignal.any([controller.signal,...(hooks.signal?[hooks.signal]:[])]),task=Promise.resolve().then(async()=>{current(signal);await retry();current(signal);const job={credits:[],output:null,parts:0,peak:0,writeBytes:0,readBytes:0};jobs.add(job);let published=false;try{const value=await work(job,input,signal,hooks.onProgress);current(signal);value.gpu={devices:1,allocations:job.parts*7,peakAccountedBytes:job.peak,accounting:'same explicit native GPU buffers; excludes driver/compiler residency',errors:[]};value.timings={gpuWriteBytes:job.writeBytes,gpuReadBytes:job.readBytes};freeJob(job);published=true;return value;}catch(primary){needsDeviceRetirement=true;await retireCompositeOwners([async()=>{await retireChildren();await retireDevice();job.output?.release();freeJob(job);} ],{primary});throw primary;}finally{if(!published&&!children.size&&!needsDeviceRetirement){job.output?.release();freeJob(job);}}});running=task;task.then(()=>{if(running===task)running=undefined;},()=>{if(running===task)running=undefined;});return task;}
 async function convolution(job,{input,weight,bias,geometry},signal,onProgress){
  const stems=[[3,256,256,80,3,1,2,1],[80,128,128,160,3,1,2,1],[160,64,64,320,3,1,2,1],[320,32,32,640,3,1,2,1],[640,16,16,640,3,1,1,1]],pointwise=[[640,640,1],[1280,1280,4],[1280,640,1],[640,2560,1],[2560,640,1]];
  requireValue(Array.isArray(geometry)&&geometry.length===8&&geometry.every(Number.isSafeInteger),'Native VIG geometry');
  const [ci,h,w,co,k,pad,stride,groups]=geometry,oh=Math.floor((h+2*pad-k)/stride)+1,ow=Math.floor((w+2*pad-k)/stride)+1,rows=oh*ow,products=ci/groups*k*k,stem=stems.some(g=>JSON.stringify(g)===JSON.stringify(geometry));
  requireValue(stem||(h*w===contextCells&&k===1&&pad===0&&stride===1&&pointwise.some(g=>JSON.stringify(g)===JSON.stringify([ci,co,groups]))),'Native VIG stem or common pointwise bank geometry');
  requireValue(input instanceof Float32Array&&input.length===ci*h*w&&weight instanceof Float32Array&&weight.length===products*co&&bias instanceof Float32Array&&bias.length===co,'Native VIG tensors');
  const{result,data}=outputFor(job,co*rows);
  const use=async(packed,weights,b,dimensions,start,row,n,ranges=[])=>{
   let loan,failed=false,primary;try{
    loan=await nativePart(job,packed,weights,b,{...dimensions,referenceLayout:{inputShape:[1,dimensions.channels,dimensions.height,dimensions.width],weightShape:[dimensions.outChannels,dimensions.channels/(dimensions.groups??1),k,k],padding:pad,stride,groups:dimensions.groups??1,biasAfterRanges:ranges}},signal,onProgress);
    for(let c=0;c<dimensions.outChannels;c++)data.set(loan.data.subarray(c*n,(c+1)*n),(start+c)*rows+row);await retireChild(loan);loan=undefined;
   }catch(error){failed=true;primary=error;throw error;}finally{await retireCompositeOwners(loan?[()=>retireChild(loan)]:[],failed?{primary}:{});}
  };
  if(stem){
   const parts=ci===3?[[0,64,[]],[64,16,[[0,16],[16336,16384]]]]:[[0,co,[]]];
   for(const[start,count,ranges]of parts){await use(input,weight.subarray(start*products,(start+count)*products),bias.subarray(start,start+count),{channels:ci,height:h,width:w,outChannels:count,kernel:k,padding:pad,stride,groups},start,0,rows,ranges);await controlCheckpoint(signal);}
  }else{
   const maxRows=Math.min(1024,Math.floor((LIMIT-weight.byteLength-bias.byteLength-72)/(4*ci+8*co)));requireValue(maxRows>=1,'One complete VIG pointwise row fits GPU64MiB');
   for(let row=0;row<rows;row+=maxRows){current(signal);const n=Math.min(maxRows,rows-row),all=row===0&&n===rows,free=ownTemp(job,all?0:ci*n*4),packed=all?input:new Float32Array(ci*n);if(!all)for(let c=0;c<ci;c++)packed.set(input.subarray(c*rows+row,c*rows+row+n),c*n);
    // A1x1 has no spatial neighbourhood on this bank layout.
    await use(packed,weight,bias,{channels:ci,height:all?h:1,width:all?w:n,outChannels:co,kernel:1,padding:0,stride:1,groups},0,row,n);free();await controlCheckpoint(signal);
   }
  }return result;
 }
 async function distance(job,{normal,sums,first,count},signal,onProgress){
  const M=contextCells;requireValue(normal instanceof Float32Array&&normal.length===640*M&&sums instanceof Float32Array&&sums.length===M&&Number.isSafeInteger(first)&&Number.isSafeInteger(count)&&first>=0&&count>=1&&count<=512&&first<=M-count,'VIG complete-target query rows');
  const{result,data}=outputFor(job,count*M),freeWeights=ownTemp(job,M*640*4+M*4),weights=new Float32Array(M*640),bias=new Float32Array(M);
  for(let j=0;j<M;j++){for(let c=0;c<640;c++)weights[j*640+c]=normal[c*M+j];if(j%64===63)await controlCheckpoint(signal);}
  const freePacked=ownTemp(job,640*count*4),packed=new Float32Array(640*count);for(let c=0;c<640;c++)packed.set(normal.subarray(c*M+first,c*M+first+count),c*count);
  let loan,failed=false,primary;try{
   loan=await nativePart(job,packed,weights,bias,{channels:640,height:M===256&&first===0&&count===256?16:1,width:M===256&&first===0&&count===256?16:count,outChannels:M,kernel:1},signal,onProgress);
   for(let i=0;i<count;i++){for(let j=0;j<M;j++){let value=Math.fround(loan.data[j*count+i]*-2);value=Math.fround(sums[first+i]+value);value=Math.fround(value+sums[j]);data[i*M+j]=-value;}if(i%8===7)await controlCheckpoint(signal);}
   await retireChild(loan);loan=undefined;freePacked();freeWeights();return result;
  }catch(error){failed=true;primary=error;throw error;}finally{await retireCompositeOwners(loan?[()=>retireChild(loan)]:[],failed?{primary}:{});}
 }
 return Object.freeze({run:(input,hooks)=>execute(convolution,input,hooks),distance:(input,hooks)=>execute(distance,input,hooks),release:owner.release,dispose:owner.release,get pendingACKs(){return children.size+deviceOwners.size+jobs.size;},nativeGpuMaximumBytes:LIMIT});
}
