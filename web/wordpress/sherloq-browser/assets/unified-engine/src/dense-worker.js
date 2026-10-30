import "../../runtime-context.js?v=0.30.0";
import {installWorkerMessageProtocol} from './worker-message-protocol.js';
import {serializeEngineError,requireValue} from './errors.js';
import {createDenseMath,canonicalDenseSift,denseGray,denseDescriptorShape,createDenseDescriptorCache} from './dense-math.js';
import {createDenseRegions} from './dense-regions.js';
import {alignDenseSupports} from './dense-links.js';
import {createDensePmWorkerBroker} from './dense-pm-worker-broker.js';
import {filterDenseSiftDiversity} from './dense-sift-diversity.js';
let kernelPromise,regionsPromise,residentSource,prepared,busy=false;
const descriptorCache=createDenseDescriptorCache();
const gpuBroker=createDensePmWorkerBroker((message,transfer)=>protocol.post(message,transfer));
const protocol=installWorkerMessageProtocol(self,async job=>{
  if(await gpuBroker.handle(job))return;
  requireValue(!busy&&job.pass&&Number.isSafeInteger(job.width)&&Number.isSafeInteger(job.height),'Invalid or concurrent dense job.');busy=true;
  try {
    const kernel=await(kernelPromise??=createDenseMath({print:()=>{}}));
    if(job.reuseSource){if(!residentSource)throw Error('Missing retained dense source.');job.sourceImage=residentSource;}
    else if(job.sourceImage){residentSource=job.sourceImage;prepared=null;descriptorCache.clear();}
    const cacheEnabled=job.descriptorCache===true&&!!job.sourceImage&&!job.compactDescriptors&&!job.field;
    if(!cacheEnabled)descriptorCache.clear();
    let {gray,width,height,pass,options={}}=job;
    const progress=phase=>protocol.post({phase});
    let mask=job.mask,field,descriptors;
    const gpuField=async(shape,banks,second)=>{if(!job.gpuPmEnabled)return null;let activeCount=0;for(const value of mask)if(value)activeCount++;if(activeCount<2)return null;return gpuBroker.run({width:shape.width,height:shape.height,dimensions:shape.dimensions,second,options,packed:activeCount<mask.length,activeCount,mask,banks:async indices=>({...await banks(indices),mask:mask.slice()})});};
    const unpack=(shape,read,second)=>{const n=shape.width*shape.height,d=shape.dimensions,first=new Float32Array(n*d),other=second?new Float32Array(n*d):first;for(let offset=0;offset<n;offset+=8192){const length=Math.min(8192,n-offset);first.set(read(0,offset,length),offset*d);if(second)other.set(read(1,offset,length),offset*d);}return {first,second:other};};
    const gather=(shape,read,second,indices)=>{const d=shape.dimensions,first=new Float32Array(indices.length*d),other=second?new Float32Array(indices.length*d):first;for(let offset=0;offset<indices.length;offset+=8192){const end=Math.min(indices.length,offset+8192),page=indices.subarray(offset,end);read(0,page,first.subarray(offset*d,end*d));if(second)read(1,page,other.subarray(offset*d,end*d));}return{first,second:other};};
    const packRaw=(descriptors,indices)=>{const d=descriptors.dimensions,pack=source=>{const out=new Float32Array(indices.length*d);for(let slot=0;slot<indices.length;slot++){const i=indices[slot];out.set(source.subarray(i*d,(i+1)*d),slot*d);}return out;},first=pack(descriptors.first);return{first,second:descriptors.first===descriptors.second?first:pack(descriptors.second)};};
    if(job.field){field=job.field;mask=field.allowed;descriptors={shift:field.shift};progress('cached-field');}
    else{
      if(job.sourceImage){
        const {sourceImage,crop,eligibility}=job,key=[crop.x,crop.y,width,height].join(':');
        if(prepared?.key!==key){descriptorCache.clear();const rgb=new Uint8Array(width*height*3);for(let y=0;y<height;y++){const start=((crop.y+y)*sourceImage.width+crop.x)*3;rgb.set(sourceImage.data.subarray(start,start+width*3),y*width*3);}prepared={key,rgb,gray:denseGray(rgb)};}
        const {rgb}=prepared,preparation=await(regionsPromise??=createDenseRegions());
        ({mask}=preparation.allowed({width,height,data:rgb},{...eligibility,method:pass.method,patch:pass.patch,targetPatch:pass.targetPatch}));
        gray=prepared.gray;progress('eligibility-complete');
      }
      const shape=denseDescriptorShape(width,height,pass.method,Math.max(pass.patch,pass.targetPatch));
      const eligible=(options.radius??600)>=(options.minimum??5)&&mask.reduce((s,v)=>s+(v>0),0)>=2&&(!options.compare||mask.some(v=>v&1)&&mask.some(v=>v&2));
      if(!eligible){
        descriptorCache.clear();
        field={width:shape.width,height:shape.height,targets:new Int32Array(mask.length).fill(-1),distancesSquared:new Float32Array(mask.length).fill(Infinity),comparisons:0n};descriptors=shape;progress('empty-eligible-field');
      }else if(job.compactDescriptors&&pass.method===0){
        try{descriptors=kernel.residentPrepare(gray,width,height,{patch:pass.patch,reflection:pass.reflection});progress('source-descriptors-complete');field=await gpuField(descriptors,indices=>indices?gather(descriptors,(slot,page,destination)=>kernel.residentGather(slot,page,{destination}),pass.reflection,indices):unpack(descriptors,(slot,offset,length)=>kernel.residentUnpack(slot,offset,length),pass.reflection),pass.reflection)??kernel.residentField(mask,width,height,options);}finally{kernel.residentRelease();}
      }else if(job.compactDescriptors&&pass.method===1){
        try{
          const support=Math.max(pass.patch,pass.targetPatch),second=pass.reflection||pass.targetPatch!==pass.patch?1:0;
          descriptors=kernel.compactPrepare(gray,width,height,{patch:pass.patch,support,quarterTurn:pass.quarterTurn,slot:0});progress('source-descriptors-complete');
          if(second){kernel.compactPrepare(gray,width,height,{patch:pass.targetPatch,support,reflection:pass.reflection,quarterTurn:pass.quarterTurn,slot:1});progress('target-descriptors-complete');}
          if(job.gpuPmEnabled&&pass.quarterTurn)mask=kernel.compactFilterMask(mask,{second});field=await gpuField(descriptors,indices=>indices?gather(descriptors,(slot,page,destination)=>kernel.compactGather(slot,page,{destination}),!!second,indices):unpack(descriptors,(slot,offset,length)=>kernel.compactUnpack(slot,offset,length),!!second),!!second)??kernel.compactField(mask,descriptors.width,descriptors.height,{...options,second});mask=field.allowed??mask;if(pass.quarterTurn)progress('canonical-frame-complete');
        }finally{kernel.compactRelease();}
      }else{
        const reflection=pass.reflection&&pass.targetPatch===pass.patch,
          cacheKey=cacheEnabled?JSON.stringify([prepared.key,pass.method,pass.patch,reflection,'normalized-raw']):null;
        let source=cacheEnabled?descriptorCache.lookup(cacheKey):null;
        if(!source){source=kernel.features(gray,width,height,{method:pass.method,patch:pass.patch,reflection});if(cacheEnabled)source=descriptorCache.publish(cacheKey,source);}
        progress('source-descriptors-complete');descriptors=source;
        if(pass.targetPatch!==pass.patch){
          const target=kernel.features(gray,width,height,{method:1,patch:pass.targetPatch,reflection:pass.reflection});
          descriptors=alignDenseSupports(source,target,pass.patch,pass.targetPatch);progress('target-descriptors-complete');
        }
        if(pass.quarterTurn){
          if(cacheEnabled){const originalFirst=descriptors.first,first=descriptorCache.writable(originalFirst),second=descriptors.second===originalFirst?first:descriptorCache.writable(descriptors.second);descriptors={...descriptors,first,second};}
          const first=canonicalDenseSift(descriptors.first),second=descriptors.first===descriptors.second?first:canonicalDenseSift(descriptors.second);
          for(let i=0;i<mask.length;i++)if(!first[i]||!second[i])mask[i]=0;
          progress('canonical-frame-complete');
        }
        field=await gpuField(descriptors,indices=>{if(indices)return packRaw(descriptors,indices);const first=descriptors.first.slice(),second=descriptors.first===descriptors.second?first:descriptors.second.slice();return {first,second};},descriptors.first!==descriptors.second)??kernel.field(descriptors.first,descriptors.second,mask,descriptors.width,descriptors.height,{...options,dimensions:descriptors.dimensions});
      }
    }
    progress('field-complete');
    let selected,errors;
    if(job.coherence){
      ({selected,errors}=kernel.coherence(field.targets,field.distancesSquared,field.width,field.height,{threshold:options.threshold??.3,...job.coherence}));
      progress('coherence-complete');
    }else{
      selected=new Uint8Array(field.targets.length);
      const threshold=Math.fround((options.threshold??.3)**2);
      for(let i=0;i<selected.length;i++)selected[i]=field.targets[i]>=0&&field.distancesSquared[i]<=threshold?1:0;
    }
    const result={...field,allowed:mask,selected,errors,shift:descriptors.shift,context:job.context,pass,descriptorStorage:job.field?.descriptorStorage??(job.compactDescriptors?(pass.method===1?'lossless-compact-sift':'resident-zernike'):'float32-arrays'),heapBytes:kernel.heapBytes,...(cacheEnabled?{descriptorCache:descriptorCache.snapshot}:{})};
    const transfer=[field.targets.buffer,field.distancesSquared.buffer,mask.buffer,selected.buffer];if(errors)transfer.push(errors.buffer);
    protocol.post({result},transfer);
  }catch(error){descriptorCache.clear();protocol.post({error:serializeEngineError(error)});}finally{busy=false;}
},{label:'dense-resident-kernel',onFailure:error=>self.postMessage({error:serializeEngineError(error)})});
