import "../../runtime-context.js?v=0.14.5";
import {streamedAutomaticForgeryscope} from './automatic-forgeryscope-stream.js';
import {requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {automaticAiSelection,readAutomaticForgeryscopeCrop} from './automatic-ai-regions.js';
const FIELDS=['mask','map','candidates','geometric','branch_microscopy','branch_blots','branch_lanes'];
const bytesOf=value=>ArrayBuffer.isView(value)?value.byteLength:typeof value==='string'?value.length*2:value&&typeof value==='object'?Object.entries(value).reduce((n,[k,v])=>n+k.length*2+bytesOf(v)+32,64):8;

/** Actual M2 analyzer dependency, supplied by the integrating runtime.
 * Original-coordinate outputs use owned arrays or segmented stores. Model
 * execution, weights, numerical qualification and cache stay with M2. */
export async function analyzeAutomaticForgeryscope(image,plan,{analyzer,budget,signal,onProgress}={}){
 const job=plan.jobs.find(j=>j.id==='forgeryscope');requireValue(job&&typeof analyzer?.analyze==='function','Real Forgeryscope analyzer required');
 checkAbort(signal);if(!job.enabled)return {status:'disabled',reason:job.state,release(){}};
 const {width,height}=plan,source=image.surface?.descriptor??image.pixels??image;
 requireValue(source.width===width&&source.height===height,'Source and automatic plan dimensions differ');
 if(image.segmented)return streamedAutomaticForgeryscope(image,plan,{analyzer,budget,signal,onProgress});
 const {boxes,excluded}=automaticAiSelection(width,height,job.params),n=width*height;
 requireValue(Number.isSafeInteger(n*11),'AI output size exceeds integer range');
 const free=budget.reserve(n*11+8192),leases=[free];let complete=false;
 try{
  const arrays=Object.fromEntries([...FIELDS,'analyzed'].map(name=>[name,name==='map'?new Float32Array(n):new Uint8Array(n)])),zones=[],providers=[],metrics=[];
  const report=(phase,fraction,detail={})=>{onProgress?.({...detail,group:'forgeryscope',phase,fraction});checkAbort(signal);};
  for(let index=0;index<boxes.length;index++){
   const box=boxes[index],[x,y,r,b]=box,w=r-x,h=b-y;let crop,result;
   try{
    crop=await readAutomaticForgeryscopeCrop(image,box,excluded,{budget,signal});
    result=await analyzer.analyze(crop.pixels,{profile:'auto',exclusions:crop.exclusions},{signal,backend:plan.cpu?'cpu':'auto',onProgress:e=>report(e.phase,index/boxes.length,{...e,stageFraction:e.fraction})});
    checkAbort(signal);
    requireValue(result.width===w&&result.height===h&&FIELDS.every(name=>result[name] instanceof (name==='map'?Float32Array:Uint8Array)&&result[name].length===w*h),'Forgeryscope output dimensions or fields differ');
    for(let row=0;row<h;row++){
     if(row%32===0)await controlCheckpoint(signal);const from=row*w,to=(y+row)*width+x;
     for(const name of FIELDS){const input=result[name],output=arrays[name];for(let col=0;col<w;col++)output[to+col]=name==='map'?Math.max(output[to+col],input[from+col]):output[to+col]|input[from+col];}
     arrays.analyzed.fill(1,to,to+w);
    }
    // Metadata remains in crop coordinates, with its explicit source origin,
    // exactly as automatic_clones.entries expects for each independent zone.
    const meta={origin:[x,y],...result.metadata};leases.push(budget.reserve(bytesOf(meta)+bytesOf(result.provenance)+bytesOf(result.metrics)));
    zones.push(structuredClone(meta));providers.push(structuredClone(result.provenance));metrics.push(structuredClone(result.metrics));
   }finally{result?.release();crop?.release();}
   report('zone-complete',(index+1)/boxes.length,{completed:index+1,total:boxes.length});
  }
  for(const [x,y,r,b] of excluded)for(let row=y;row<b;row++){if(row%64===0)await controlCheckpoint(signal);for(const array of Object.values(arrays))array.fill(0,row*width+x,row*width+r);}
  checkAbort(signal);let released=false;
  const status=arrays.mask.some(Boolean)?'ok':arrays.candidates.some(Boolean)?'candidates':zones.every(z=>z.status==='no_panels')?'no_panels':zones.every(z=>['no_panels','insufficient_panels'].includes(z.status))?'insufficient_panels':'empty';
  const result={width,height,...arrays,metadata:{method:'clone_detectors',variant:'Forgeryscope Auto',boxes,compare:false,zones,status,threshold:.5,probability_interpolation:'bilinear',mask_interpolation:'nearest',radius_supported:false,segmentation:false,result_storage:'ram',...(excluded.length?{excluded_boxes:excluded}:{})},provenance:{providers,requested_backend:plan.cpu?'cpu':'auto',selection:'native-rectangular-independent-crops',exclusion_policy:'black-input-reject-touching-panels-and-mask-output'},metrics:{zones:metrics,preflightExecutions:0,memory:budget.snapshot()},release(){if(released)return;released=true;for(const release of leases)release();}};
  complete=true;return result;
 }finally{if(!complete)for(const release of leases)release();}
}
