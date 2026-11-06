import {EngineError,requireValue,checkAbort} from './errors.js';
import {verifyM3Bytes} from './m3-asset.js';
import {XFEAT_GLUE_GLOBAL_ASSETS} from './xfeat-glue-global-assets.js';
import {neuralWindowAck} from './neural-window-job-owner.js';
import {neuralWindowGlueOperator,neuralWindowGlueOutputs} from './neural-window-glue-operators.js';

/** Transport adapter for the existing ORT operator API. All GPU graph bytes,
 * complete tensors and output shapes are unchanged. The original CPU artifact
 * still owns CPU stages/softmax. No ORT WebGPU module is imported in this Worker. */
export function createNeuralWindowGlueOrt({cpu,peer,signal=()=>undefined,maximumJobBytes,gpuWorkingBytes=0,budget,onOwner}={}){
 requireValue(budget?.reserve&&budget?.registerBacking&&cpu?.Tensor&&cpu?.InferenceSession&&peer?.run&&Number.isSafeInteger(maximumJobBytes)&&maximumJobBytes>0&&Number.isSafeInteger(gpuWorkingBytes)&&gpuWorkingBytes>=0&&typeof onOwner==='function','A funded delegated Glue Window peer is required.');
 const allocateClone=(entry,data,label)=>{entry.free=budget.reserve(data.byteLength);entry.data=data.slice();entry.allocated=true;entry.backing=budget.registerBacking('array-buffer',entry.data.buffer.byteLength,{owner:'xfeat-glue-window',label,identity:entry.data.buffer});return entry.data;};
 const copyRecord=bytes=>({data:null,free:null,backing:null,bytes,notified:false,allocated:false});
 const releaseClone=async copy=>{if(copy.backing){const ack=await copy.backing();if(ack===0||ack===false)throw ack;copy.backing=null;copy.releasedBytes=ack;}if(copy.allocated&&!copy.notified){budget.notifyBackingRelease?.('array-buffer',copy.releasedBytes??copy.bytes);copy.notified=true;}if(copy.free){await neuralWindowAck(copy.free);copy.free=null;}copy.data=null;};
 const sessions=new Set(),facts={jobs:0,dispatches:0,submissions:0,actualGpuWork:false,completedAfterNativeAck:true};let closed=false;
 const adapter={
  env:{wasm:{},webgpu:{}},
  Tensor:class{constructor(type,data,dims){return new cpu.Tensor(type,data,dims);}},
  InferenceSession:{async create(model,options={}){
   requireValue(!closed&&model instanceof Uint8Array,'Open Glue Window operator adapter required.');checkAbort(signal());
   if(options.executionProviders?.[0]==='wasm')return cpu.InferenceSession.create(model,options);
   requireValue(options.executionProviders?.length===1&&options.executionProviders[0]==='webgpu'&&options.graphOptimizationLevel==='all','Original Glue GPU session options required.');
   const entry=Object.entries(XFEAT_GLUE_GLOBAL_ASSETS).find(([name,a])=>['attention','log-assignment','dot','value'].includes(name)&&a.bytes===model.byteLength);
   requireValue(entry,'Unknown Glue GPU graph size.');const [name,asset]=entry;await verifyM3Bytes(model,asset,signal());const signature=neuralWindowGlueOperator(name);let released=false,flight,serial=Promise.resolve(),faulted=false,fault;const loans=new Set();
   const session={inputNames:[...signature.inputs],outputNames:[signature.output],
    run(feeds){requireValue(!released&&!closed,'Glue Window session closed.');if(faulted)return Promise.reject(fault);const work=async()=>{if(faulted)throw fault;
     checkAbort(signal());const inputs=Object.fromEntries(signature.inputs.map(key=>{const t=feeds[key];return[key,{type:t?.type,data:t?.data,dims:t?.dims}];})),outputSpecs=neuralWindowGlueOutputs(name,inputs),inputBytes=Object.values(inputs).reduce((n,t)=>n+t.data.byteLength,0),outputBytes=outputSpecs.reduce((n,t)=>n+t.upper.reduce((a,b)=>a*b,1)*4,0),sizes={modelBytes:asset.bytes,inputBytes,outputBytes,workingBytes:gpuWorkingBytes};
     requireValue(2*asset.bytes+2*inputBytes+3*outputBytes+gpuWorkingBytes+4096<=maximumJobBytes,'Glue operator exceeds its original prepaid IO envelope.');const loan={window:null,tensor:null,nativeDispose:null,nativeDisposed:false,windowRetired:false,copy:null,inputs:[],flight:null,
      close(){if(this.flight)return this.flight;const record=this;record.flight=(async()=>{let failed=false,primary;
       if(record.nativeDispose&&!record.nativeDisposed)try{await neuralWindowAck(record.nativeDispose);record.nativeDisposed=true;}catch(error){failed=true;primary=error;}
       if(!record.windowRetired)try{if(record.window)await neuralWindowAck(()=>record.window.close());record.windowRetired=true;}catch(error){if(!failed){failed=true;primary=error;}}
       if(record.windowRetired)for(const input of [...record.inputs])try{await releaseClone(input);record.inputs.splice(record.inputs.indexOf(input),1);}catch(error){if(!failed){failed=true;primary=error;}}
       if((record.nativeDisposed||!record.nativeDispose)&&record.copy)try{await releaseClone(record.copy);record.copy=null;record.tensor=null;}catch(error){if(!failed){failed=true;primary=error;}}
       if(!failed){loans.delete(record);record.tensor=null;}if(failed)throw primary;
      })();void record.flight.catch(()=>{record.flight=null;});return record.flight;}
     };
     // postMessage clones the complete backing of a typed sub-view. Detach
     // only the requested view under the existing IO grant before transport.
     loans.add(loan);for(const item of Object.values(inputs)){const entry=copyRecord(item.data.byteLength);loan.inputs.push(entry);item.data=allocateClone(entry,item.data,'bounded-original-operator-input');}
     let wireModel=model;if(model.byteOffset||model.buffer.byteLength!==model.byteLength){const entry=copyRecord(model.byteLength);loan.inputs.push(entry);wireModel=allocateClone(entry,model,'bounded-original-operator-graph');}
     const reply=await peer.run({model:wireModel,asset,library:'xfeat-glue-original-operator',stage:name,inputs,outputSpecs},{sizes,signal:signal(),onOwner:value=>{loan.window=value;loans.add(loan);}});
     const execution=reply.execution;facts.jobs++;facts.actualGpuWork||=execution?.actualGpuWork===true;facts.completedAfterNativeAck&&=execution?.completedAfterNativeAck===true;facts.dispatches+=execution?.gpuExecution?.dispatches??0;facts.submissions+=execution?.gpuExecution?.submissions??0;
     try{const t=reply.result[signature.output];requireValue(t&&t.type==='float32'&&t.data instanceof Float32Array,'Original Glue complete GPU output required.');// The existing caller's host envelope funds this detached transport copy.
      // CPU-tensor retirement must never keep an alias of the peer's backing.
      const copy=loan.copy=copyRecord(t.data.byteLength);allocateClone(copy,t.data,'detached-original-operator-output');const tensor=new cpu.Tensor(t.type,copy.data,t.dims);loan.tensor=tensor;loan.nativeDispose=tensor.dispose.bind(tensor);tensor.dispose=()=>loan.close();return{[signature.output]:tensor};
     }catch(error){try{await loan.close();}catch{}throw error;}

    };const task=serial.then(work).catch(error=>{if(!faulted){faulted=true;fault=error;}throw error;});serial=task.then(()=>{},()=>{});return task;},
    release(){released=true;if(flight)return flight;flight=(async()=>{await serial;let failed=false,primary;for(const loan of [...loans])try{await neuralWindowAck(()=>loan.close());loans.delete(loan);}catch(error){if(!failed){failed=true;primary=error;}}if(failed)throw primary;sessions.delete(session);})();void flight.catch(()=>{flight=null;});return flight;}
   };sessions.add(session);return session;
  }},
  beginJob(){requireValue(!closed&&!sessions.size,'Previous Glue operator sessions must retire before the next job.');Object.assign(facts,{jobs:0,dispatches:0,submissions:0,actualGpuWork:false,completedAfterNativeAck:true});},
  get execution(){return{...facts};},
  async dispose(){closed=true;let failed=false,primary;for(const session of [...sessions])try{await session.release();}catch(error){if(!failed){failed=true;primary=error;}}try{await peer.close();}catch(error){if(!failed){failed=true;primary=error;}}if(failed)throw primary;}
 };onOwner(adapter);return adapter;
}
