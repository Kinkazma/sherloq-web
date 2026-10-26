import {Budget} from './cache.js';import {resolveComputeProfile} from './profiles.js';import {NeuralGraphPool} from './neural-graph-pool.js';
import {EngineError,requireValue,checkAbort} from './errors.js';import {cfaPostprocess} from './cfa-postprocess.js';import {renderResearch} from './research-render.js';import {cfaNpz} from './npz.js';
const hash=async data=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',data))].map(x=>x.toString(16).padStart(2,'0')).join('');
const bytes=data=>Object.values(data).reduce((n,v)=>n+(ArrayBuffer.isView(v)?v.byteLength:0),8192);
/** Complete published CFA graph. Qualification is reported separately from execution. */
export function createCfaAnalyzer({assets,runtimes,budget,computeProfile='aggressive',resourceHints}={}){
  runtimes=structuredClone(runtimes);runtimes.webgpu??=runtimes.wasm;assets=Object.fromEntries(Object.entries(structuredClone(assets)).map(([key,asset])=>[key,{...asset,wasmMaximumBytes:2147483648}]));const configuration=JSON.stringify([assets,runtimes]);
 const profile=resolveComputeProfile(computeProfile,resourceHints);budget??=new Budget(profile.memoryBudgetBytes);
 const pool=new NeuralGraphPool(budget,profile,{assets,runtimes}),keys=new Set();let active,disposed=false;
 return {
  async analyze(image,{variant='Original',block=32,tile=512}={},options={}){
   if(disposed)throw new EngineError('DISPOSED','CFA analyzer disposed.');if(active)throw new EngineError('BUSY','CFA analysis already running.');
   const source=image.surface,dimensions=source?.descriptor??image,{width,height}=dimensions,n=width*height;
   requireValue(Number.isInteger(width)&&Number.isInteger(height)&&n>0&&(source?dimensions.format==='rgb8'&&typeof source.readWindow==='function':image.data instanceof Uint8Array&&image.data.length===n*3),'RGB8 image or full-resolution surface required.');
   requireValue(assets[variant],'Unavailable CFA variant.');requireValue(Number.isSafeInteger(block)&&block>=8&&block%2===0,'CFA block must be even and at least eight.');requireValue(Number.isSafeInteger(tile)&&tile>=0,'Invalid CFA tile size.');
   const ny=Math.floor((height-height%2-8)/block),nx=Math.floor((width-width%2-8)/block),cells=ny*nx;requireValue(ny>0&&nx>0,'CFA image must be at least block + 8 pixels per side.');
   const controller=new AbortController(),abort=()=>controller.abort();active=controller;options.signal?.addEventListener('abort',abort,{once:true});if(options.signal?.aborted)abort();const hooks={...options,signal:controller.signal};
   let inputLease,workingLease,cacheLease,release;
   try{
    checkAbort(hooks.signal);inputLease=budget.reserve(source?0:n*6);const digest=source?dimensions.id+'/'+dimensions.revision:await hash(image.data),asset=assets[variant],key='m2/cfa/'+JSON.stringify([digest,width,height,block,tile,asset.sha256,asset.program?.sha256,runtimes,options.backend??'auto']);
    let stored=budget.get(key)?.value,cached=!!stored;
    if(cached)cacheLease=budget.reserve(bytes(stored.data));
    else{
     workingLease=budget.reserve(cells*100+8192);const probabilities=new Float32Array(16*cells),requestedStep=tile?Math.max(1,Math.floor(tile/block)):Math.max(nx,ny),jobs=[];
     for(let y=0;y<ny;y+=requestedStep)for(let x=0;x<nx;x+=requestedStep)jobs.push({x,y,w:Math.min(requestedStep,nx-x),h:Math.min(requestedStep,ny-y)});
     let next=0,completed=0;const executions=[];
     const compute=async rect=>{
      checkAbort(hooks.signal);const ih=tile?rect.h*block+8:height-height%2,iw=tile?rect.w*block+8:width-width%2,count=ih*iw;let lease,output,window;
      try{
       lease=budget.reserve(count*12);
       if(source)window=await source.readWindow({x:rect.x*block,y:rect.y*block,width:iw,height:ih},{signal:hooks.signal});
       const rgb=new Float32Array(count*3),pixels=window?.pixels.data??image.data;
       for(let y=0;y<ih;y++)for(let x=0;x<iw;x++)for(let c=0;c<3;c++)rgb[c*count+y*iw+x]=pixels[(source?y*iw+x:(rect.y*block+y)*width+rect.x*block+x)*3+c]/255;
       window?.release();window=null;
       output=await pool.run(variant,{rgb:{data:rgb,dims:[1,3,ih,iw]},block:{type:'int32',data:Int32Array.of(block),dims:[]}},{...hooks,workspaceBytes:16*1024**2+count*1800,outputBytes:rect.h*rect.w*64});
       const t=output.result.log_probabilities;requireValue(t.dims.join(',')===[4,4,rect.h,rect.w].join(','),'Unexpected CFA tensor geometry.');
       for(let c=0;c<16;c++)for(let y=0;y<rect.h;y++)for(let x=0;x<rect.w;x++){const value=Math.fround(Math.exp(t.data[(c*rect.h+y)*rect.w+x]));requireValue(Number.isFinite(value),'Nonfinite CFA probability.');probabilities[(c*ny+rect.y+y)*nx+rect.x+x]=value;}
       executions.push({rect:[rect.x,rect.y,rect.w,rect.h],...output.metrics});
      }catch(e){
       if(!tile||!['MEMORY_LIMIT','MEMORY_ALLOCATION'].includes(e.code)||(rect.w===1&&rect.h===1))throw e;
       output?.release();output=null;lease?.();lease=null;
       if(rect.w>=rect.h&&rect.w>1){const cut=Math.floor(rect.w/2);await compute({...rect,w:cut});await compute({...rect,x:rect.x+cut,w:rect.w-cut});}
       else{const cut=Math.floor(rect.h/2);await compute({...rect,h:cut});await compute({...rect,y:rect.y+cut,h:rect.h-cut});}
      }finally{window?.release();output?.release();lease?.();}
     };
     const outcomes=await Promise.allSettled(Array.from({length:Math.min(profile.maxWorkers,jobs.length)},async()=>{while(next<jobs.length){const job=jobs[next++];try{await compute(job);}catch(e){controller.abort();throw e;}completed++;hooks.onProgress?.({phase:'cfa-tiles',completed,total:jobs.length,fraction:completed/jobs.length});}}));
     const failed=outcomes.find(x=>x.status==='rejected');if(failed)throw failed.reason;
     checkAbort(hooks.signal);const post=cfaPostprocess(probabilities,cells);
     stored={data:{width,height,probabilities,grids:post.grids,local_grid:post.local,suspicion:post.suspicion,gridShape:[ny,nx],metadata:{method:'adaptive_cfa',variant,best_grid:post.best,block,origin:[4,4],valid_shape:[ny*block,nx*block],image_shape:[height,width],tile,actual_tiles:executions.map(x=>x.rect)}},provenance:{sourceRGBSha256:source?null:digest,sourceSurfaceIdentity:source?digest:null,originalSourceSha256:source?image.sha256??null:null,modelSha256:asset.sha256,programSha256:asset.program?.sha256,checkpointSha256:asset.checkpointSha256,provider:[...new Set(executions.map(e=>e.provider))].join('+'),qualification:'public-output-corpus; native CPU reference and hybrid GPU convolution'},execution:{tiles:executions,preflightExecutions:0}};
    }
    checkAbort(hooks.signal);const size=bytes(stored.data);release=budget.reserve(size);const result=structuredClone(stored);
    if(!cached){budget.put(key,{value:stored,byteLength:size});keys.add(key);}
    return {...result,metrics:{...result.execution,cache:{result:cached},memory:budget.snapshot()},release};
   }catch(e){release?.();throw e;}finally{workingLease?.();cacheLease?.();inputLease?.();active=null;options.signal?.removeEventListener('abort',abort);}
  },
  async render(image,result,mode=0,options={}){
   if(image.surface)return this.renderWindow(image,result,mode,{x:0,y:0,width:result.data.width,height:result.data.height},options);
   return renderResearch(image,result.data,mode,{...options,budget});
  },
  async renderWindow(image,result,mode,rect,options={}){
   requireValue(image.surface?.readWindow,'Full-resolution source surface required.');const window=await image.surface.readWindow(rect,options);
   try{return {...await renderResearch(window.pixels,result.data,mode,{...options,budget,origin:window.origin}),origin:window.origin};}finally{window.release();}
  },
  exportNpz(result){const bound=bytes(result.data)+65536,release=budget.reserve(bound);try{return {...cfaNpz(result,bound),release};}catch(e){release();throw e;}},
  clearCache(){for(const key of keys)budget.remove(key);keys.clear();pool.clear();},
  dispose(){if(disposed)return;disposed=true;active?.abort();this.clearCache();pool.dispose();},memory(){return budget.snapshot();}
 };
}
