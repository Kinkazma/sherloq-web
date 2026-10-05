import {createDenseMath,canonicalDenseSift,denseGray,denseDescriptorShape} from './dense-math.js';
import {createDenseRegions} from './dense-regions.js';
import {alignDenseSupports} from './dense-links.js';
self.onmessage=async({data:job})=>{
  try {
    const kernel=await createDenseMath({print:()=>{}});
    let {gray,width,height,pass,options={}}=job;
    const progress=phase=>self.postMessage({phase});
    let mask=job.mask,field,descriptors;
    if(job.field){field=job.field;mask=field.allowed;descriptors={shift:field.shift};progress('cached-field');}
    else{
      if(job.sourceImage){
        const {sourceImage,crop,eligibility}=job,rgb=new Uint8Array(width*height*3);
        for(let y=0;y<height;y++){const start=((crop.y+y)*sourceImage.width+crop.x)*3;rgb.set(sourceImage.data.subarray(start,start+width*3),y*width*3);}
        const preparation=await createDenseRegions();
        ({mask}=preparation.allowed({width,height,data:rgb},{...eligibility,method:pass.method,patch:pass.patch,targetPatch:pass.targetPatch}));
        gray=denseGray(rgb);progress('eligibility-complete');
      }
      const shape=denseDescriptorShape(width,height,pass.method,Math.max(pass.patch,pass.targetPatch));
      const eligible=(options.radius??600)>=(options.minimum??5)&&mask.reduce((s,v)=>s+(v>0),0)>=2&&(!options.compare||mask.some(v=>v&1)&&mask.some(v=>v&2));
      if(!eligible){
        field={width:shape.width,height:shape.height,targets:new Int32Array(mask.length).fill(-1),distancesSquared:new Float32Array(mask.length).fill(Infinity),comparisons:0n};descriptors=shape;progress('empty-eligible-field');
      }else if(job.compactDescriptors&&pass.method===0){
        try{descriptors=kernel.residentPrepare(gray,width,height,{patch:pass.patch,reflection:pass.reflection});progress('source-descriptors-complete');field=kernel.residentField(mask,width,height,options);}finally{kernel.residentRelease();}
      }else if(job.compactDescriptors&&pass.method===1){
        try{
          const support=Math.max(pass.patch,pass.targetPatch),second=pass.reflection||pass.targetPatch!==pass.patch?1:0;
          descriptors=kernel.compactPrepare(gray,width,height,{patch:pass.patch,support,quarterTurn:pass.quarterTurn,slot:0});progress('source-descriptors-complete');
          if(second){kernel.compactPrepare(gray,width,height,{patch:pass.targetPatch,support,reflection:pass.reflection,quarterTurn:pass.quarterTurn,slot:1});progress('target-descriptors-complete');}
          field=kernel.compactField(mask,descriptors.width,descriptors.height,{...options,second});mask=field.allowed;if(pass.quarterTurn)progress('canonical-frame-complete');
        }finally{kernel.compactRelease();}
      }else{
        const source=kernel.features(gray,width,height,{method:pass.method,patch:pass.patch,reflection:pass.reflection&&pass.targetPatch===pass.patch});
        progress('source-descriptors-complete');descriptors=source;
        if(pass.targetPatch!==pass.patch){
          const target=kernel.features(gray,width,height,{method:1,patch:pass.targetPatch,reflection:pass.reflection});
          descriptors=alignDenseSupports(source,target,pass.patch,pass.targetPatch);progress('target-descriptors-complete');
        }
        if(pass.quarterTurn){
          const first=canonicalDenseSift(descriptors.first),second=descriptors.first===descriptors.second?first:canonicalDenseSift(descriptors.second);
          for(let i=0;i<mask.length;i++)if(!first[i]||!second[i])mask[i]=0;
          progress('canonical-frame-complete');
        }
        field=kernel.field(descriptors.first,descriptors.second,mask,descriptors.width,descriptors.height,{...options,dimensions:descriptors.dimensions});
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
    const result={...field,allowed:mask,selected,errors,shift:descriptors.shift,context:job.context,pass,descriptorStorage:job.field?.descriptorStorage??(job.compactDescriptors?(pass.method===1?'lossless-compact-sift':'resident-zernike'):'float32-arrays'),heapBytes:kernel.heapBytes};
    const transfer=[field.targets.buffer,field.distancesSquared.buffer,mask.buffer,selected.buffer];if(errors)transfer.push(errors.buffer);
    self.postMessage({result},transfer);
  }catch(error){self.postMessage({error:{code:error.code??(error instanceof RangeError?'MEMORY_ALLOCATION':'INTERNAL_ERROR'),message:error.message}});}
};
