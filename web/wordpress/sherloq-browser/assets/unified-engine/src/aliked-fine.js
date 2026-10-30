import "../../runtime-context.js?v=0.30.0";
import {ALIKED_MODELS} from './aliked-assets.js';
import {ALIKED_CM2_SEGMENTS} from './aliked-cm2-segments-assets.js';
import {alikedShape} from './aliked-worker.js';
import {alikedNativeParameters} from './aliked-native-parameters.js';
import {extractAlikedSegmented} from './aliked-segmented.js';
import {createAlikedNativeSelector} from './aliked-strict-selector.js';
import {createAlikedStrictMask} from './aliked-strict-mask.js';
import {createAlikedStrictOwner} from './aliked-strict-owner.js';
import {allocateOwnedTypedArray} from './allocation.js';
import {createNeuralTensor} from './neural-tensor-store.js';
import {NeuralGraphPool} from './neural-graph-pool.js';
import {efficientLoFtrRuntimes} from './efficient-loftr-assets.js';
import {verifyM3Bytes} from './m3-asset.js';
import {roundEven} from './pixel-utils.js';
import {requireValue,checkAbort} from './errors.js';
const MiB=1024**2,f=Math.fround;
/** Same native RGB preparation and original n16/n16rot weights, executed by
 * the existing lossless pyramid/operator transport at the requested fine scale.
 * The full fused dense ONNX graph is never created on this route. */
export async function extractAlikedFine(image,prepared,{budget,profile,modelKind,models,limit,regions=[],excluded=[],signal,onProgress,inputSide=2048,detectionThreshold=.05,onOwner,poolFactory=(...a)=>new NeuralGraphPool(...a)}={}){
 const parameters=alikedNativeParameters({inputSide,detectionThreshold}),identity=ALIKED_MODELS[modelKind],segments=ALIKED_CM2_SEGMENTS[modelKind],[w,h]=alikedShape(image.width,image.height,inputSide),n=w*h,sx=f(w/image.width),sy=f(h/image.height);
 requireValue(inputSide===2048&&identity&&segments?.checkpointSha256===identity.weightSha256&&prepared?.tensor instanceof Float32Array&&prepared.tensor.length===3*n&&budget?.reserve&&typeof onOwner==='function','Fine ALIKED requires the original pinned weights and exact native prepared Float32 input.');
 const owner=createAlikedStrictOwner({signal,onOwner:o=>onOwner({cancel:()=>o.cancel(),release:()=>o.dispose(),dispose:()=>o.dispose()})}),outputs=[];let result,primary,failed=false;
 const array=(Type,count,label)=>{const a=allocateOwnedTypedArray(Type,count,{budget,owner:'aliked-fine',label});owner.credit(()=>a.release());return a;};
 const output=(Type,count,label)=>{const a=allocateOwnedTypedArray(Type,count,{budget,owner:'aliked-fine-result',label});outputs.push(a);return a.data;};
 try{
  result=await owner.run(async()=>{
   const mask=await createAlikedStrictMask({width:image.width,height:image.height,regions,excluded,budget,signal:owner.signal,onOwner:o=>owner.own(()=>o.dispose(),'fine candidate mask')});
   await verifyM3Bytes(models.detect.data,identity.graphs.detect,owner.signal);checkAbort(owner.signal);const url=URL.createObjectURL(new Blob([models.detect.data]));owner.own(()=>URL.revokeObjectURL(url),'fine native detector URL');
   const assets=Object.fromEntries(Object.entries(segments.assets).map(([key,g])=>[key,{...g,url:new URL('../vendor/aliked-cm2-segments/'+modelKind+'/'+g.file,import.meta.url).href,wasmMaximumBytes:2048*MiB}]));assets['cm2/detect']={...identity.graphs.detect,url,wasmMaximumBytes:2048*MiB};
   const pool=poolFactory(budget,profile,{assets,runtimes:efficientLoFtrRuntimes(),resourceOwner:'aliked-fine'});owner.own(()=>pool.disposeGracefully(),'fine operator workers');
   const selector=await createAlikedNativeSelector({budget,maximumCells:5*n+20,signal:owner.signal,detectionThreshold});owner.credit(()=>selector.dispose());
   const nativeDetect=async scores=>{
    const data=array(Float32Array,n,'exact complete native detector input');await scores.readInto(data.data,0,{signal:owner.signal});const reply=await pool.run('cm2/detect',{scores:{type:'float32',data:data.data,dims:[1,1,h,w]}},{backend:'cpu',cpuRequired:true,signal:owner.signal,onProgress,workspaceBytes:32*MiB+64*n,outputBytes:4*n+4});const retire=owner.own(()=>reply.release(),'fine native detector response');
    requireValue(reply.result.nms?.data instanceof Float32Array&&reply.result.nms.data.length===n&&reply.result.mean?.data instanceof Float32Array&&reply.result.mean.data.length===1,'Fine native detector output geometry changed.');const mean=reply.result.mean.data[0],nms=await createNeuralTensor(1,h,w,{budget,signal:owner.signal,storage:'memory'});owner.own(()=>nms.dispose(),'fine native NMS');await nms.writeRows(0,h,reply.result.nms.data,{signal:owner.signal});await retire();data.release();return{nms,mean};
   };
   const preparation={async selectCandidates(indices,scores,{mean}={}){
    const count=indices.length,cells=5*(count+4),s=array(Float32Array,cells,'native selector carrier scores'),q=array(Float32Array,cells,'native selector carrier NMS'),mask=array(Uint8Array,cells,'native selector carrier membership');for(let i=0;i<count;i++){const at=(i+2)*5+2;s.data[at]=scores[i];q.data[at]=scores[i];mask.data[at]=1;}const selected=selector.select(s.data,q.data,mask.data,5,count+4,mean),retire=owner.own(()=>selected.release(),'fine selected native indices');const out=array(Int32Array,selected.indices.length,'fine original selected pixel indices');for(let i=0;i<out.data.length;i++){const at=(selected.indices[i]-12)/5;requireValue(Number.isInteger(at)&&at>=0&&at<count,'Fine native selector returned a carrier padding cell.');out.data[i]=indices[at];}await retire();s.release();q.release();mask.release();return out.data;
   }};
   const candidateAllowed=(x,y)=>mask.allowedAtSource(Math.max(0,Math.min(image.width-1,roundEven((x+.5)/sx-.5))),Math.max(0,Math.min(image.height-1,roundEven((y+.5)/sy-.5))));
   const raw=await extractAlikedSegmented({width:w,height:h},{pool,budget,preparation,preparedFloat32:prepared.tensor,nativeDetect,candidateAllowed,detectionThreshold,returnNormalized:true,backend:'cpu',windowBytes:64*MiB,storage:'auto',signal:owner.signal,onProgress,onOwner:o=>owner.own(()=>o.dispose(),'fine lossless pyramid')});const retire=owner.own(()=>raw.release(),'fine native sparse output');checkAbort(owner.signal);
   const keys=raw.normalizedKeypoints,scores=raw.keypoint_scores.data,count=scores.length;requireValue(keys instanceof Float32Array&&keys.length===count*2&&raw.descriptors.data.length===count*128,'Fine original ALIKED sparse geometry changed.');const all=array(Float64Array,count*7,'fine actual Original coordinates');for(let i=0;i<count;i++){const x=f(f((w-1)*f(keys[i*2]+1))/2),y=f(f((h-1)*f(keys[i*2+1]+1))/2);all.data.set([(x+.5)/sx-.5,(y+.5)/sy-.5,8,-1,scores[i],0,-1],i*7);}
   const zoneCount=Math.max(1,regions.length),members=array(Uint8Array,count*zoneCount,'fine actual native membership');mask.membership(all.data,members.data);const eligible=[];owner.credit(budget.reserve(count*16+4096));for(let i=0;i<count;i++){const x=Math.max(0,Math.min(image.width-1,roundEven(all.data[i*7]))),y=Math.max(0,Math.min(image.height-1,roundEven(all.data[i*7+1])));if(members.data.subarray(i*zoneCount,(i+1)*zoneCount).some(Boolean)&&mask.allowedAtSource(x,y))eligible.push(i);}
   const totalFeatures=eligible.length,selected=eligible.sort((a,b)=>scores[b]-scores[a]||a-b).slice(0,limit).sort((a,b)=>all.data[a*7+1]-all.data[b*7+1]||all.data[a*7]-all.data[b*7]||a-b),points=output(Float64Array,selected.length*7,'fine published Original points'),descriptors=output(Float32Array,selected.length*128,'fine published native descriptors'),membership=output(Uint8Array,selected.length*zoneCount,'fine published candidate membership');for(let i=0;i<selected.length;i++){const id=selected[i];points.set(all.data.subarray(id*7,id*7+7),i*7);descriptors.set(raw.descriptors.data.subarray(id*128,(id+1)*128),i*128);membership.set(members.data.subarray(id*zoneCount,(id+1)*zoneCount),i*zoneCount);}await retire();checkAbort(owner.signal);
   return{points,descriptors,members:membership,descriptorSize:128,totalFeatures,zoneCount,metadata:{family:modelKind,...parameters,provider:'wasm',execution:'original-CM2-ALIKED-native-operators/lossless-pyramid',checkpointSha256:segments.checkpointSha256,preparation:prepared.metrics,operators:raw.execution,preflightExecutions:0}};
  });
 }catch(error){failed=true;primary=error;}
 try{await owner.dispose();}catch(error){if(!failed){failed=true;primary=error;}}
 if(failed){for(const a of outputs)a.release();throw primary;}
 try{checkAbort(signal);}catch(error){for(const a of outputs)a.release();throw error;}let released=false;return{...result,release(){if(released)return;released=true;for(const a of outputs)a.release();}};
}
