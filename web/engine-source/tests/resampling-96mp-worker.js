import {Budget} from '../src/cache.js';
import {loadSegmentedJpeg,disposeSegmentedImage} from '../src/image-sources.js';
import {segmentedResamplingAnalysis} from '../src/segmented-resampling-analysis.js';
import {segmentedResamplingFourier} from '../src/segmented-resampling.js';
import {createRasterExports} from '../src/raster-export.js';
import {streamScientificNpz} from '../src/scientific-npz-stream.js';
import {createSHA256} from '../vendor/hash-wasm/hashes.js';
self.onmessage=async()=>{
 const started=performance.now(),budget=new Budget(256*1024**2),exports=createRasterExports(budget),proof={family:'Resampling',budgetBytes:budget.limit,cases:[]},archives=[];
 let image,result,emCache,fourierCache,last=0,phase;
 const onProgress=p=>{if(p.phase!==phase||performance.now()-last>10000){self.postMessage({progress:{...p,elapsedMs:performance.now()-started,memory:budget.snapshot()}});phase=p.phase;last=performance.now();}};
 const releaseResult=async()=>{if(!result)return;await Promise.all([result.surface,...Object.values(result.rgbRecords??{}).map(v=>v.surface),...Object.values(result.tableRecords??{}).map(v=>v.surface)].map(s=>s.dispose()));result=null;};
 try{
  image=await loadSegmentedJpeg(await(await fetch('/.build/dense-96mp/copy-6000.jpg')).blob(),{budget,onProgress});proof.source={sha256:image.sha256,shape:image.surface.descriptor,metrics:image.metrics};
  const settings=[{path:'em',params:{size:3,stage:'probability'}},{path:'em',params:{size:3,stage:'fourier',fourier:{upsample:false,gamma:2,rescale:false}}},{path:'em',params:{size:3,stage:'fourier',fourier:{upsample:false,gamma:3,rescale:false}}},{path:'source',params:{upsample:true,gamma:2,rescale:false}},{path:'source',params:{upsample:true,gamma:3,rescale:false}}];
  for(const setting of settings){const begin=performance.now();result=setting.path==='em'?await segmentedResamplingAnalysis(image,setting.params,{budget,storage:'temporary',cache:emCache,onProgress,profile:{maxWorkers:8}}):await segmentedResamplingFourier(image,setting.params,{budget,storage:'temporary',cache:fourierCache,onProgress,profile:{maxWorkers:8}});if(setting.path==='em')emCache=result.emCache;else fourierCache=result.resamplingCache;
   const {width,height}=result.surface.descriptor,hash=await createSHA256();for(let y=0;y<height;y+=32){const page=await result.surface.readWindow({x:0,y,width,height:Math.min(32,height-y)});try{hash.update(page.pixels.data);}finally{page.release();}}
   const entry={...setting,shape:[height,width],data:result.data,metrics:result.metrics,sha256:hash.digest('hex'),export:await exports.create(result.surface,{format:'png',compression:0},{onProgress,originalSha256:image.sha256})};
   const name=setting.path==='source'?'values':setting.params.stage==='probability'?'probability0':'fourier0_values',table=result.tableRecords[name].surface,count=table.descriptor.rowCount,sha=await createSHA256();
   const archive=await streamScientificNpz([{key:'values',descr:'<f8',shape:setting.path==='em'&&setting.params.stage==='probability'?[height-2,width-2]:[height,width],count,elementBytes:8,async read(out,first,length){const p=await table.readRows({offset:first,length});try{const v=new Float64Array(out.buffer,out.byteOffset,length);for(let i=0;i<length;i++)v[i]=p.data[i*3+2];sha.update(v);}finally{p.release();}}}],setting,{originalSha256:image.sha256},{storage:'temporary'},{budget,onProgress});archives.push(archive);entry.valuesSha256=sha.digest('hex');entry.valuesExport={sha256:archive.sha256,byteLength:archive.byteLength,metrics:archive.metrics};entry.ms=performance.now()-begin;proof.cases.push(entry);await releaseResult();
  }
  if(!proof.cases[1].metrics.analysisCached||!proof.cases[2].metrics.analysisCached||!proof.cases[4].metrics.spectrumCached)throw Error('Expected global cache reuse');
  await emCache.dispose();emCache=null;await fourierCache.dispose();fourierCache=null;await disposeSegmentedImage(image);image=null;
  for(let i=0;i<proof.cases.length;i++){const d=proof.cases[i].export;for(let offset=0;offset<d.byteLength;){const p=await exports.read({exportId:d.id,revision:1,offset,length:Math.min(4*1024**2,d.byteLength-offset)});if(!(await fetch('/output?name=view-'+i+'.png&offset='+offset,{method:'POST',body:p.bytes})).ok)throw Error('PNG delivery');offset=p.nextOffset;}await exports.release(d.id);
   const a=archives[i];await a.store.visit(async(bytes,offset)=>{if(!(await fetch('/output?name=values-'+i+'.npz&offset='+offset,{method:'POST',body:bytes})).ok)throw Error('NPZ delivery');},{blockBytes:4*1024**2});await a.store.dispose();await a.session?.dispose();archives[i]=null;
  }
  proof.elapsedMs=performance.now()-started;proof.memory=budget.snapshot();if(budget.total())throw Error('Budget leak');self.postMessage({result:proof});
 }catch(e){self.postMessage({error:{message:e.message,code:e.code,stack:e.stack},partial:proof});}finally{await releaseResult();await emCache?.dispose();await fourierCache?.dispose();if(image)await disposeSegmentedImage(image);await exports.clear();for(const a of archives){await a?.store.dispose();await a?.session?.dispose();}}
};
