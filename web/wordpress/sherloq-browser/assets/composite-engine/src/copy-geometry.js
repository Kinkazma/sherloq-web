import "../../runtime-context.js?v=0.14.5";
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';

export const COPY_GEOMETRY_MODELS=Object.freeze(['None','Similarity','Affine','Homography']);
export function roundEven(x){const low=Math.floor(x),fraction=x-low;return fraction<.5?low:fraction>.5?low+1:low%2===0?low:low+1;}
export function inverse3(m){
  const [a,b,c,d,e,f,g,h,i]=m,A=e*i-f*h,B=f*g-d*i,C=d*h-e*g,det=a*A+b*B+c*C;
  requireValue(Number.isFinite(det)&&det!==0,'Singular copy/move geometry.');
  return [A,c*h-b*i,b*f-c*e,B,a*i-c*g,c*d-a*f,C,b*g-a*h,a*e-b*d].map(x=>x/det);
}
export function projectPoint(x,y,m){const w=x*m[6]+y*m[7]+m[8];return Math.abs(w)>1e-12?[(x*m[0]+y*m[1]+m[2])/w,(x*m[3]+y*m[4]+m[5])/w]:[Infinity,Infinity];}
export function geometricErrors(a,b,m){
  const inverse=inverse3(m),errors=new Float64Array(a.length/2);
  for(let i=0;i<errors.length;i++){
    const p=projectPoint(a[i*2],a[i*2+1],m),q=projectPoint(b[i*2],b[i*2+1],inverse);
    const x=p[0]-b[i*2],y=p[1]-b[i*2+1],u=q[0]-a[i*2],v=q[1]-a[i*2+1];
    errors[i]=Math.max(Math.sqrt(x*x+y*y),Math.sqrt(u*u+v*v));
  }
  return errors;
}
export function median(values){const sorted=Array.from(values).sort((a,b)=>a-b),n=sorted.length;return n%2?sorted[n>>>1]:(sorted[n/2-1]+sorted[n/2])/2;}
export function distinctCentres(points){const seen=new Set();for(let i=0;i<points.length;i+=2)seen.add(roundEven(points[i])+','+roundEven(points[i+1]));return seen.size;}
export function biomeSides(points,pairs,group){
  const a=new Float64Array(group.length*2),b=new Float64Array(group.length*2),source=new Uint32Array(group.length),target=new Uint32Array(group.length);
  const r=points instanceof Float32Array?Math.fround:x=>x;
  const norm=(x,y,u,v)=>{const dx=r(x-u),dy=r(y-v);return r(Math.sqrt(r(r(dx*dx)+r(dy*dy))));};
  for(let i=0;i<group.length;i++){
    const row=group[i],ai=pairs[row*4],bi=pairs[row*4+1];
    requireValue(Number.isSafeInteger(row)&&row>=0&&row<pairs.length/4&&Number.isSafeInteger(ai)&&ai>=0&&ai<points.length/7&&Number.isSafeInteger(bi)&&bi>=0&&bi<points.length/7,'Invalid copy/move group.');
    a.set([points[ai*7],points[ai*7+1]],i*2);b.set([points[bi*7],points[bi*7+1]],i*2);source[i]=ai;target[i]=bi;
  }
  const ref=a.slice(0,2),other=b.slice(0,2);
  for(let i=0;i<group.length;i++){
    const x=a[i*2],y=a[i*2+1],u=b[i*2],v=b[i*2+1];
    if(r(norm(x,y,...ref)+norm(u,v,...other))>r(norm(x,y,...other)+norm(u,v,...ref))){a.set([u,v],i*2);b.set([x,y],i*2);[source[i],target[i]]=[target[i],source[i]];}
  }
  return {a,b,source,target};
}

// A task owns this module. Its requested heap cap is fully admitted before
// instantiation (256MiB for fits; image-dependent for rendering). Fits are bounded
// to 5,000 RANSAC iterations; callers running
// off-thread can terminate the worker even during an individual fit.
export async function createGeometryKernel({signal,reserveMemory,heapBytes=256*1024**2}={}){
  requireValue(typeof reserveMemory==='function','Copy geometry requires shared memory admission.');
  requireValue(Number.isSafeInteger(heapBytes)&&heapBytes>=16*1024**2&&heapBytes<=2*1024**3&&heapBytes%65536===0,'Copy geometry heap size');reserveMemory(heapBytes+8*1024**2);checkAbort(signal);
  const {default:create}=await import('../vendor/copy-geometry/copy-geometry.js');
  let module=await create({wasmMemory:new WebAssembly.Memory({initial:256,maximum:heapBytes/65536})});checkAbort(signal);
  const execute=(a,b,fn,outputBytes=0)=>{
    checkAbort(signal);requireValue(module&&a.length===b.length&&a.length%2===0,'Invalid geometry coordinates.');
    let ap=0,bp=0,op=0;
    try{
      ap=module._malloc(Math.max(8,a.byteLength));bp=module._malloc(Math.max(8,b.byteLength));op=outputBytes?module._malloc(outputBytes):0;
      if(!ap||!bp||(outputBytes&&!op))throw new EngineError('MEMORY_LIMIT','Copy geometry allocation failed.');
      module.HEAPU8.set(new Uint8Array(a.buffer,a.byteOffset,a.byteLength),ap);module.HEAPU8.set(new Uint8Array(b.buffer,b.byteOffset,b.byteLength),bp);
      return fn(ap,bp,op);
    }finally{for(const p of [ap,bp,op])if(p)module._free(p);}
  };
  return {
    fit(a,b,model,threshold,reflection=false){
      requireValue(a instanceof Float64Array&&b instanceof Float64Array&&COPY_GEOMETRY_MODELS.indexOf(model)>0,'Invalid geometry fit.');
      return execute(a,b,(ap,bp,op)=>{const status=module._copy_fit(ap,bp,a.length/2,COPY_GEOMETRY_MODELS.indexOf(model),threshold,+reflection,op);if(status<0)throw new EngineError(status===-3?'MEMORY_LIMIT':'GEOMETRY_FAILED','OpenCV geometry fit failed.');return status?Array.from(module.HEAPF64.subarray(op/8,op/8+9)):null;},72);
    },
    overlap(a,b){
      if(!a.length)return 0;
      const pa=Float32Array.from(a,roundEven),pb=Float32Array.from(b,roundEven);
      return execute(pa,pb,(ap,bp)=>{const value=module._copy_overlap(ap,bp,pa.length/2);if(value<0)throw new EngineError(value===-3?'MEMORY_LIMIT':'GEOMETRY_FAILED','OpenCV convex intersection failed.');return value;});
    },
    renderer(image,points,pairs,colors){
      requireValue(image?.format==='rgb8'&&image.data instanceof Uint8Array&&image.data.length===image.width*image.height*3&&points instanceof Float64Array&&pairs instanceof Float64Array&&colors instanceof Uint8Array,'Invalid sparse render input.');
      reserveMemory(image.data.byteLength+4096);
      const pointers=[];let closed=false;
      const put=a=>{const p=module._malloc(Math.max(8,a.byteLength));if(!p)throw new EngineError('MEMORY_LIMIT','Sparse renderer allocation failed.');pointers.push(p);module.HEAPU8.set(new Uint8Array(a.buffer,a.byteOffset,a.byteLength),p);return p;};
      const dispose=()=>{if(!closed){closed=true;for(const p of pointers)module._free(p);}};
      try{const ip=put(image.data),kp=put(points),mp=put(pairs),cp=put(colors);
        return {
          group(rows,base,flags){checkAbort(signal);let rp=0,bp=0;try{rp=module._malloc(Math.max(8,rows.byteLength));bp=module._malloc(8);if(!rp||!bp)throw new EngineError('MEMORY_LIMIT','Sparse group allocation failed.');module.HEAPU8.set(new Uint8Array(rows.buffer,rows.byteOffset,rows.byteLength),rp);module.HEAPU8.set(base,bp);if(!module._copy_draw_group(ip,image.width,image.height,kp,mp,rp,rows.length,cp,bp,flags))throw new EngineError('RENDER_FAILED','Native sparse drawing failed.');}finally{if(rp)module._free(rp);if(bp)module._free(bp);}},
          polygon(polygon){const coords=Int32Array.from(polygon.flat(),Math.trunc);let p=0;try{p=module._malloc(Math.max(8,coords.byteLength));if(!p)throw new EngineError('MEMORY_LIMIT','Sparse polygon allocation failed.');module.HEAPU8.set(new Uint8Array(coords.buffer),p);if(!module._copy_draw_polygon(ip,image.width,image.height,p,polygon.length))throw new EngineError('RENDER_FAILED','Native polygon drawing failed.');}finally{if(p)module._free(p);}},
          pixels(){requireValue(!closed,'Renderer disposed.');return module.HEAPU8.slice(ip,ip+image.data.byteLength);},dispose
        };
      }catch(error){dispose();throw error;}
    },
    dispose(){module=null;}
  };
}

export async function verifyCopyGeometry(points,pairs,groups,{model='Similarity',threshold=3,minimum=6,reflection=false,signal,onProgress,reserveMemory,kernel=null}={}){
  requireValue(COPY_GEOMETRY_MODELS.includes(model)&&Number.isFinite(threshold)&&threshold>0&&Number.isSafeInteger(minimum)&&minimum>=4,'Invalid geometric verification settings.');
  requireValue(typeof reserveMemory==='function','Copy geometry requires shared memory admission.');
  requireValue((points instanceof Float32Array||points instanceof Float64Array)&&points.length%7===0&&pairs instanceof Float64Array&&pairs.length%4===0,'Invalid copy geometry points or pairs.');
  checkAbort(signal);if(model==='None')return {groups,models:[],hypotheses:0};
  reserveMemory(pairs.length/4*256+4096);
  const own=!kernel;if(own)kernel=await createGeometryKernel({signal,reserveMemory});
  const verified=[],models=[];let hypotheses=0;
  try{
    for(let parent=0;parent<groups.length;parent++){
      const group=groups[parent];checkAbort(signal);if(group.length<minimum)continue;
      const {a,b,source,target}=biomeSides(points,pairs,group);let remaining=Array.from({length:group.length},(_,i)=>i);
      while(remaining.length>=minimum){
        await controlCheckpoint(signal);hypotheses++;
        const seen=new Set(),sample=[];
        for(const i of remaining){const key=[a[i*2],a[i*2+1],b[i*2],b[i*2+1]].map(roundEven).join(',');if(!seen.has(key)){seen.add(key);sample.push(i);}}
        if(sample.length<minimum)break;
        const subset=(p,ids)=>Float64Array.from(ids.flatMap(i=>[p[i*2],p[i*2+1]]));
        const matrix=kernel.fit(subset(a,sample),subset(b,sample),model,threshold,reflection);if(!matrix)break;
        const errors=geometricErrors(subset(a,remaining),subset(b,remaining),matrix),selected=[],rest=[],keptErrors=[];
        remaining.forEach((i,k)=>{if(errors[k]<=threshold){selected.push(i);keptErrors.push(errors[k]);}else rest.push(i);});
        if(selected.length<minimum)break;
        const distinct=[distinctCentres(subset(a,selected)),distinctCentres(subset(b,selected))];if(Math.min(...distinct)<minimum)break;
        verified.push(Uint32Array.from(selected,i=>group[i]));
        models.push({source_point_indices:selected.map(i=>source[i]),destination_point_indices:selected.map(i=>target[i]),parent_biome:parent,model,matrix:[matrix.slice(0,3),matrix.slice(3,6),matrix.slice(6,9)],inliers:selected.length,distinct_centres:distinct,median_error_px:median(keptErrors),maximum_error_px:keptErrors.reduce((a,b)=>Math.max(a,b),0)});
        remaining=rest;onProgress?.((parent+1-remaining.length/group.length)/Math.max(1,groups.length));
      }
      onProgress?.((parent+1)/Math.max(1,groups.length));
    }
    checkAbort(signal);onProgress?.(1);return {groups:verified,models,hypotheses};
  }finally{if(own)kernel.dispose();}
}

export function filterSiftModels(groups,models){
  const accepted=[],fitted=[];
  models.forEach((model,i)=>{const m=model.matrix,[a,b]=m[0],[c,d]=m[1],squared=a*a+b*b+c*c+d*d,det=a*d-b*c;
    const largest=Math.sqrt((squared+Math.sqrt(Math.max(0,squared*squared-4*det*det)))/2),smallest=largest?Math.abs(det)/largest:0,scale=Math.sqrt(Math.abs(det));
    if(scale>=.25&&scale<=4&&smallest>0&&largest/smallest<=3.1){accepted.push(groups[i]);fitted.push(model);}
  });return {groups:accepted,models:fitted};
}

export async function rejectSelfCopies(points,pairs,groups,models,minimum,{signal,reserveMemory,kernel=null}={}){
  requireValue(typeof reserveMemory==='function','Overlap filtering requires shared memory admission.');
  reserveMemory(pairs.length/4*128+4096);const own=!kernel;if(own)kernel=await createGeometryKernel({signal,reserveMemory});
  const accepted=[],fitted=[],rejected=[];
  try{for(let i=0;i<groups.length;i++){
    await controlCheckpoint(signal);const group=groups[i],{a,b}=biomeSides(points,pairs,group),ratio=kernel.overlap(a,b),record={candidate_biome:i,overlap_fraction:ratio,pair_indices:Array.from(group)};
    let reason=ratio>=.8?'overlapping_hulls':null;
    if(models[i]){const model=models[i],m=model.matrix.flat(),movement=model.source_point_indices.map(id=>{const x=points[id*7],y=points[id*7+1],p=projectPoint(x,y,m);return Math.sqrt((p[0]-x)**2+(p[1]-y)**2);});record.model_median_displacement_px=median(movement);if(record.model_median_displacement_px+1e-6<minimum)reason??='near_identity_model';}
    if(reason)rejected.push({...record,reason});else{accepted.push(group);if(models.length)fitted.push(models[i]);}
  }return {groups:accepted,models:fitted,rejected};}finally{if(own)kernel.dispose();}
}
