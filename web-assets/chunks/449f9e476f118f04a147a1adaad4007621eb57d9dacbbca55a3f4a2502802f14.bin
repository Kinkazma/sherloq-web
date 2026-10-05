import "../../runtime-context.js?v=0.14.5";
import {allocateWasmMemory,copyTypedArray,registerArrayViews} from './allocation.js';
import {EngineError,requireValue,checkAbort} from './errors.js';
import {yoloLetterboxShape} from './forgeryscope-yolo.js';
import {getExecutionScheduler} from './execution-scheduler.js';
const MiB=1024**2;
export class ForgeryscopePreparation {
  constructor(budget,factory,{resourceOwner='forgeryscope'}={}){this.budget=budget;this.factory=factory;this.resourceOwner=resourceOwner;this.scheduler=getExecutionScheduler(budget);this.module=null;this.bytes=0;this.busy=false;this.pending=null;this.controller=null;this.disposed=false;this.unreclaim=budget.registerReclaimer(()=>{if(!this.busy&&!this.pending)this.clear();},{allocationKind:'wasm',owner:resourceOwner,label:'forgeryscope-preparation'});}
  clear(){const actual=this.module?.HEAPU8?.byteLength??0;this.module=null;this.backing?.();this.backing=null;if(actual)this.budget.notifyBackingRelease?.('wasm',actual);this.budget.retained-=this.bytes;this.bytes=0;}
  dispose(){this.disposed=true;this.controller?.abort();if(!this.pending)this.clear();this.unreclaim();}
  async admitted(bytes,fn,signal){
    checkAbort(signal);if(this.disposed)throw new EngineError('DISPOSED','Preparation disposed.');requireValue(!this.busy&&!this.pending,'Preparation is already busy.');this.busy=true;
    const controller=new AbortController(),abort=()=>controller.abort(),operation=this.budget.beginOperation?.({owner:this.resourceOwner,id:this.resourceOwner+'/preparation'});this.controller=controller;signal?.addEventListener('abort',abort,{once:true});let lease;
    try{
      const cap=Math.ceil(Math.max(16*MiB,bytes*1.3+8*MiB)/MiB/16)*16*MiB;
      if(cap>2*1024**3)throw new EngineError('MEMORY_LIMIT','Preparation exceeds WASM address space.');
      if(!this.module||this.bytes<cap){
        this.clear();this.budget.retain(cap);this.bytes=cap;this.backing=this.budget.registerBacking?.('wasm',cap,{owner:this.resourceOwner,label:'forgeryscope-preparation',state:'reserved'});
        // Loading/compilation may wait on IO and holds no CPU slot. The ticket
        // stays live until this non-abortable factory actually settles.
        operation?.setState('io');
        try{this.pending=this.factory({wasmMemory:allocateWasmMemory({initial:256,maximum:cap/65536},{label:'forgeryscope-preparation',operation})});this.module=await this.pending;this.backing?.materialize(this.module.HEAPU8?.byteLength??0);if(this.disposed)throw new EngineError('DISPOSED','Preparation disposed during initialization.');}catch(e){this.clear();throw e;}finally{this.pending=null;}
      }
      checkAbort(controller.signal);
      lease=await this.scheduler.acquire({cpu:1,signal:controller.signal,operation,resourceOwner:this.resourceOwner,label:this.resourceOwner+'/preparation'});
      checkAbort(controller.signal);const pointers=[];
      const alloc=(size,values,heap)=>{
        const p=this.module._malloc(Math.max(1,size));if(!p)throw new EngineError('MEMORY_ALLOCATION','Forgeryscope preparation allocation failed.',{details:{allocationKind:'wasm',requestedBytes:Math.max(1,size),currentBytes:this.module.HEAPU8.byteLength}});pointers.push(p);
        if(values)this.module[heap].set(values,p/this.module[heap].BYTES_PER_ELEMENT);return p;
      };
      try{const result=fn(this.module,alloc);operation?.commit();return result;}finally{for(const p of pointers)this.module._free(p);this.backing?.materialize(this.module.HEAPU8?.byteLength??0);}
    }finally{lease?.release();operation?.release();signal?.removeEventListener('abort',abort);this.controller=null;this.busy=false;}
  }
  async embedding(image,spec,{signal}={}){
    const n=spec.width*spec.height*3,release=this.budget.reserve(n*4);let complete=false;
    try{
      const tensor=await this.admitted(image.data.byteLength+n*12, (m,a)=>{
        const ip=a(image.data.byteLength,image.data,'HEAPU8'),mp=a(12,spec.mean,'HEAPF32'),sp=a(12,spec.std,'HEAPF32'),op=a(n*4);
        if(!m._fg_prepare(ip,image.width,image.height,spec.width,spec.height,spec.transform==='longest_max_size'?1:0,mp,sp,op))throw new EngineError('PREPARATION_FAILED','Embedding preparation failed.');
        return {data:copyTypedArray(m.HEAPF32.subarray(op/4,op/4+n),{label:'forgeryscope-prepared-output'}),dims:[1,3,spec.height,spec.width],type:'float32'};
      },signal);const backing=registerArrayViews(this.budget,tensor,{owner:this.resourceOwner,label:'prepared-tensor'});complete=true;return {tensor,release(){backing();release();}};
    }finally{if(!complete)release();}
  }
  async yolo(image,{signal}={}){
    const shape=yoloLetterboxShape(image.width,image.height),n=shape.width*shape.height*3,release=this.budget.reserve(n*4);let complete=false;
    try{
      const tensor=await this.admitted(image.data.byteLength+n*12,(m,a)=>{
        const ip=a(image.data.byteLength,image.data,'HEAPU8'),op=a(n*4),dp=a(8);
        if(!m._fg_yolo_prepare(ip,image.width,image.height,640,32,op,dp))throw new EngineError('PREPARATION_FAILED','YOLO preparation failed.');
        requireValue(m.HEAP32[dp/4]===shape.width&&m.HEAP32[dp/4+1]===shape.height,'YOLO shape mismatch.');
        return {data:copyTypedArray(m.HEAPF32.subarray(op/4,op/4+n),{label:'forgeryscope-prepared-output'}),dims:[1,3,shape.height,shape.width],type:'float32'};
      },signal);const backing=registerArrayViews(this.budget,tensor,{owner:this.resourceOwner,label:'prepared-tensor'});complete=true;return {tensor,release(){backing();release();}};
    }finally{if(!complete)release();}
  }
  async select(scores,nms,mean,{signal}={}){
    const [,,,width]=scores.dims,height=scores.dims[2],n=width*height;
    return this.admitted(n*8+2048,(m,a)=>{
      const sp=a(n*4,scores.data,'HEAPF32'),np=a(n*4,nms.data,'HEAPF32'),ip=a(2048);
      const count=m._fg_aliked_select(sp,np,width,height,mean,ip);if(count<0)throw new EngineError('PREPARATION_FAILED','ALIKED selection failed.');
      return {data:BigInt64Array.from(m.HEAP32.subarray(ip/4,ip/4+count),BigInt),dims:[count],type:'int64'};
    },signal);
  }
  async selectCandidates(indices,scores,{signal}={}){
    requireValue(indices instanceof Int32Array&&scores instanceof Float32Array&&indices.length===scores.length,'Invalid ALIKED candidates.');
    return this.admitted(indices.length*16+2048,(m,a)=>{
      const ip=a(indices.byteLength,indices,'HEAP32'),sp=a(scores.byteLength,scores,'HEAPF32'),out=a(2048);
      const n=m._fg_aliked_candidates(ip,sp,indices.length,out);if(n<0)throw new EngineError('PREPARATION_FAILED','ALIKED candidate selection failed.');
      return copyTypedArray(m.HEAP32.subarray(out/4,out/4+n),{label:'forgeryscope-prepared-output'});
    },signal);
  }
  async affine(points0,points1,blot,{signal}={}){
    const count=points0.length/2;
    requireValue(count===points1.length/2&&Number.isInteger(count),'Invalid affine points.');
    if(count<4)return {error:'Not enough matches: '+count};
    return this.admitted(count*64+MiB,(m,a)=>{
      const p0=a(count*8,points0,'HEAPF32'),p1=a(count*8,points1,'HEAPF32'),mp=a(48),ip=a(count);
      const status=m._fg_affine(p0,p1,count,+blot,mp,ip);
      if(status<0)throw new EngineError('GEOMETRY_FAILED','OpenCV affine estimator failed.');
      return status?{matrix:copyTypedArray(m.HEAPF64.subarray(mp/8,mp/8+6),{label:'forgeryscope-prepared-output'}),inliers:copyTypedArray(m.HEAPU8.subarray(ip,ip+count),{label:'forgeryscope-prepared-output'})}:{error:'Affine transformation computation failed'};
    },signal);
  }
}
