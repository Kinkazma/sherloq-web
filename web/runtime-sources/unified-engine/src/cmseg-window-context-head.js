import "../../runtime-context.js?v=0.25.0";
import {planCmsegWindowBank,packCmsegWindowFeatures} from './cmseg-window-bank-plan.js';
import {createCmsegWindowCorrelation} from '../experiments/segmentation/cmseg-window-bank-pool.js';
import {requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {retireCompositeOwners} from './composite-owner-release.js';

/** One autonomous window, original native encoder/decoder around one common
 * correlation per native scale. The caller supplies literal context preparation
 * and the separately owned ORIGINAL CNN stage runtime. A whole rectangle stays
 * on the existing full native inference path outside this additive adapter.
 */
export function createCmsegWindowContextHead({window,contexts,model,backend,profile,budget,cnn,prepare,sourceOwner,
 createCorrelation=createCmsegWindowCorrelation,signal,onOwner}={}){
 requireValue(contexts?.length>1&&model?.correlation?.length===3&&['cpu','webgpu'].includes(backend)&&Number.isInteger(profile?.maxWorkers)&&profile.maxWorkers>0&&budget?.reserve&&cnn?.encode&&cnn?.decode&&typeof prepare==='function'&&sourceOwner?.release,'Exact multi-context CMSeg window and original providers required');
 const controller=new AbortController(),owned=new Set([sourceOwner]),identity=JSON.stringify([contexts.map(c=>c.bounds),window.fingerprint,model.id,model.correlation,!!model.backbone,backend,profile.maxWorkers]);let running,closing,closed=false,outputCredit,outputs;
 const combined=AbortSignal.any([controller.signal,...(signal?[signal]:[])]);
 const current=()=>{checkAbort(combined);requireValue(!closed&&identity===JSON.stringify([contexts.map(c=>c.bounds),window.fingerprint,model.id,model.correlation,!!model.backbone,backend,profile.maxWorkers]),'CMSeg one-window head source or scientific identity changed');sourceOwner.assertCurrent?.();};
 const own=value=>{requireValue(value&&typeof (value.release??value.dispose)==='function','Releasable CMSeg stage owner required');owned.add(value);return value;};
 async function retire(value){await (value.release??value.dispose).call(value);owned.delete(value);}
 async function cleanup(){await retireCompositeOwners([...owned].filter(v=>v!==sourceOwner).map(value=>()=>retire(value)));if(owned.has(sourceOwner))await retire(sourceOwner);outputs=null;outputCredit?.();outputCredit=undefined;closed=true;}
 const api={
  run(hooks={}){requireValue(!running&&!closed&&!closing,'CMSeg one-window head is single-use');const promise=work(hooks);running=promise;return promise;},
  async release(){if(closing)return closing;if(closed)return;controller.abort();closing=(async()=>{try{await running;}catch{}await cleanup();})().finally(()=>closing=undefined);return closing;},
  get pendingACKs(){return owned.size+(outputCredit?1:0);}
 };
 onOwner?.(api);
 async function work({onProgress}={}){
  current();const plans=[];
  // Exact Original membership and every native-grid plan are admitted before
  // the first RGB preparation, encoder, or learned session can start.
  for(const side of [128,64,32])plans.push(own(await planCmsegWindowBank({window,contexts,side},{budget,signal:combined})));
  for(let i=0;i<3;i++)requireValue(model.correlation[i].topk===plans[i].k&&Number.isFinite(model.correlation[i].alpha),'Pinned CMSeg correlation parameters differ');
  outputCredit=budget.reserve(contexts.length*4*512**2);outputs=new Array(contexts.length);
  const features=[];
  for(let i=0;i<contexts.length;i++){
   current();const prepared=own(await prepare(contexts[i],{signal:combined}));requireValue(prepared.input instanceof Float32Array&&prepared.input.length===3*512**2&&prepared.input.every(Number.isFinite),'Native Pillow512 FP32 literal-context preparation required');
   const encoded=own(await cnn.encode(prepared.input,{signal:combined,onProgress}));requireValue(encoded.values,'Original CMSeg encoder fields required');features.push(encoded);await retire(prepared);await controlCheckpoint(combined);
  }
  const correlations=[];
  for(let i=0;i<3;i++){
   current();const plan=plans[i],packed=own(packCmsegWindowFeatures(plan,features.map(v=>v.values['x'+(i+2)]),{budget,signal:combined}));
   const pool=own(createCorrelation({budget,maxWorkers:profile.maxWorkers,rowsPerJob:64,onOwner:own}));
   const result=own(await pool.run({plan,input:packed.input,alpha:model.correlation[i].alpha,nativeFma:!!model.backbone,backend:backend==='webgpu'&&i===0?'webgpu':'cpu'},{signal:combined,onProgress}));
   requireValue(result.data instanceof Float32Array&&result.data.length===plan.k*plan.count,'Complete native common CMSeg correlation required');correlations.push(result);await retire(pool);await retire(packed);await controlCheckpoint(combined);
  }
  for(let index=0;index<contexts.length;index++){
   current();const localCredit=budget.reserve(4*(24*128**2+32*64**2+96*32**2)),localOwner=own({release:localCredit}),feeds={x1:features[index].values.x1,x5:features[index].values.x5};
   for(let i=0;i<3;i++){
    const plan=plans[i],part=plan.contexts[index],data=new Float32Array(plan.k*part.count);
    for(let channel=0;channel<plan.k;channel++)data.set(correlations[i].data.subarray(channel*plan.count+part.offset,channel*plan.count+part.offset+part.count),channel*part.count);
    feeds['c'+(i+2)]={data,shape:[1,plan.k,plan.side,plan.side]};
   }
   const decoded=own(await cnn.decode(feeds,{signal:combined,onProgress})),probability=decoded.values?.probability;
   requireValue(probability?.data instanceof Float32Array&&probability.data.length===512**2&&JSON.stringify(probability.shape)==='[1,1,512,512]'&&probability.data.every(v=>Number.isFinite(v)&&v>=0&&v<=1),'Original CMSeg probability512 grid required');
   outputs[index]={context:contexts[index],probability:new Float32Array(probability.data),shape:[1,1,512,512]};await retire(decoded);await retire(localOwner);await retire(features[index]);await controlCheckpoint(combined);
  }
  for(const value of correlations)await retire(value);
  current();return Object.freeze({contexts:Object.freeze(outputs),receipt:Object.freeze({adaptation:'cmseg-one-window-literal-context-common-correlation/1',nativeInputSide:512,encoderCalls:contexts.length,decoderCalls:contexts.length,bankPopulations:plans.map(p=>p.count),nativeTopK:plans.map(p=>p.k),correlationBackends:plans.map((_,i)=>backend==='webgpu'&&i===0?'webgpu':'cpu'),requestedMaxWorkers:profile.maxWorkers,modelId:model.id,cnnContext:'Literal admitted RGB per context; one common native correlation per scale; original spatial decoders. No masked-whole-CNN equivalence claim.'}),release:api.release});
 }
 return Object.freeze(api);
}
