import {createWorkerEngine} from '../src/worker-client.js';import {exportAnalysis} from '../src/exports.js';
const read=async p=>new Uint8Array(await(await fetch(new URL('../fixtures/'+p,import.meta.url))).arrayBuffer());
const json=async p=>JSON.parse(new TextDecoder().decode(await read(p)));
const hash=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),x=>x.toString(16).padStart(2,'0')).join('');
const assert=(value,message)=>{if(!value)throw new Error(message);};
export async function runExtendedBrowserTests(){
 const engine=createWorkerEngine(),start=performance.now(),counts={},formats={},timings={};let maxIlluminantError=0;
 const run=async(operation,params)=>{const t=performance.now(),r=await engine.run({id:'test',imageId:'i',operation,params});counts[operation]=(counts[operation]??0)+1;timings[operation]=(timings[operation]??0)+performance.now()-t;return r;};
 try{
  for(const name of ['opencv','illuminant','magnifier','pca','wavelet']){const ref=await json(name+'-reference.json');for(const f of ref.cases){const bytes=await read(f.file);await engine.load({id:'i',bytes,pixels:{width:f.width,height:f.height,format:'rgb8',data:bytes},provenance:{source:'synthetic oracle'}});
   for(const e of f.expected){const operation=e.operation??(name==='illuminant'?'various.illuminant':name==='pca'?'colors.pca':name==='wavelet'?'detail.wavelets':'inspection.magnifier'),r=await run(operation,e.params);assert(r.pixels?await hash(r.pixels.data)===e.sha256:e.sha256===null,`${name} ${f.name} ${JSON.stringify(e.params)}`);
    if(name==='illuminant'){for(const key of ['counts','areas','valid'])assert(JSON.stringify(Array.from(r.data[key]))===JSON.stringify(e[key]),key);for(const key of ['rgb','globalRGB','angles'])for(let i=0;i<e[key].length;i++){const delta=Math.abs(r.data[key][i]-e[key][i]);maxIlluminantError=Math.max(maxIlluminantError,delta);assert(delta<=1e-12,key+' numeric');}}
    if(name==='pca')for(const key of ['mean','eigenvectors','eigenvalues'])for(let i=0;i<f.model[key].length;i++)assert(r.data[key][i]===f.model[key][i],'PCA model');
    if(name==='magnifier')assert(JSON.stringify(r.data.bounds)===JSON.stringify(e.bounds),'ROI bounds');
   }await engine.unload('i');console.log('Qualified',name,f.name);
  }}
  for(const f of (await json('plots-reference.json')).cases){const bytes=await read(f.file);await engine.load({id:'i',bytes,pixels:{width:f.width,height:f.height,format:'rgb8',data:bytes}});let last=-1;
   for(const e of f.expected){const r=await run('colors.plots',e.params);assert(r.metrics.cache.result===(last===e.params.scale),'plot shared analysis');last=e.params.scale;assert(JSON.stringify(Array.from(r.data.values))===JSON.stringify(f.values[e.params.scale]),'plot HSV values');assert(await hash(r.data.positions)===e.positions,'plot axes');assert(e.params.colored?await hash(r.data.colors)===e.colors:JSON.stringify(r.data.colors)===JSON.stringify(e.colors),'plot colors');r.data.values.fill(0);}
   await engine.unload('i');console.log('Qualified plots',f.name);
  }
  for(const f of (await json('blocking-reference.json')).cases){const bytes=await read(f.file);await engine.load({id:'i',bytes,...(f.encoded?{}:{pixels:{width:f.width,height:f.height,format:'rgb8',data:bytes}})});
   for(const e of f.expected){const r=await run('noise.blocking',e.params);assert(await hash(r.pixels.data)===e.sha256,'blocking display '+f.name);assert(JSON.stringify(Array.from(r.data.noise))===JSON.stringify(e.noise),'blocking numeric '+f.name);assert(r.data.sourceMode===f.sourceMode,'blocking source');}await engine.unload('i');console.log('Qualified blocking',f.name);
  }
  for(const name of ['metadata','image-codec'])for(const f of (await json(name+'-reference.json')).cases){const bytes=await read(f.file);if(f.nativeError){let code;try{await engine.load({id:'i',bytes});}catch(e){code=e.code;}assert(code==='UNSUPPORTED_FORMAT',f.file+' unavailable');continue;}
   await engine.load({id:'i',bytes});assert(await hash((await engine.imagePixels('i')).data)===f.sha256,f.file+' decode');assert(await hash(await engine.original('i'))===await hash(bytes),'original retained');formats[name]=(formats[name]??0)+1;await engine.unload('i');
  }
  for(const f of (await json('quality-reference.json')).cases){await engine.load({id:'i',bytes:await read(f.file)});const r=await run('jpeg.quality',{});assert(JSON.stringify(Array.from(r.data.raw))===JSON.stringify(f.raw),'quality raw '+f.file);assert(r.data.minimum===f.minimum,'quality minimum');for(let i=0;i<100;i++)assert(Math.abs(r.data.curve[i]-f.curve[i])<=1e-12,'quality curve');assert(exportAnalysis(r,{format:'csv'}).bytes.length>100,'quality CSV');await engine.unload('i');}
  const bytes=await read('exif-tools.jpg'),ref=await json('exif-tools-reference.json');await engine.load({id:'i',bytes});
  const location=await run('metadata.location',{});assert(location.data.coordinates.latitude===ref.latitude&&location.data.coordinates.longitude===ref.longitude,'GPS');
  const thumbnail=await run('metadata.thumbnail',{});assert(await hash(thumbnail.data.bytes)===ref.thumbnailSha256&&await hash(thumbnail.pixels.data)===ref.resizedSha256&&await hash(thumbnail.data.difference.data)===ref.differenceSha256,'thumbnail');
  const hex=await run('file.hex',{offset:ref.thumbnailOffset,length:ref.thumbnailLength});assert(await hash(hex.data.bytes)===ref.thumbnailSha256,'original hex window');
  const structure=await run('metadata.structure',{});assert(structure.data.exif.directories.length===3,'EXIF structure');
  const digest=await run('file.digest',{});assert(digest.data.hashes['SHA2-256']===await hash(bytes)&&Object.keys(digest.data.hashes).length===10,'digests');assert(Object.keys(digest.data.imageHashes).length===4&&Object.keys(digest.data.unavailable).length===3,'explicit hash limits');
  const illum=await run('various.illuminant',{});assert(exportAnalysis(illum,{format:'csv'}).mime==='text/csv','illuminant CSV');
  const magnifier=await run('inspection.magnifier',{bounds:[2,3,6,7]});assert(JSON.stringify(magnifier.layers[0].origin)==='[2,3]'&&magnifier.pixels.width===4,'ROI layer origin');
  const again=await run('metadata.thumbnail',{});assert(again.metrics.cache.result&&await hash(again.pixels.data)===ref.resizedSha256,'cache transfer ownership');
  const controller=new AbortController();let cancelled=false;const job=engine.run({id:'cancel',imageId:'i',operation:'jpeg.quality'},{signal:controller.signal,onProgress:()=>controller.abort()});try{await job;}catch(e){cancelled=e.code==='CANCELLED'&&e.imagesCleared;}assert(cancelled,'hard cancellation');await engine.load({id:'i',bytes});await run('colors.space',{});await engine.unload('i');
  const capabilities=await engine.capabilities();assert(capabilities.memory.retainedBytes===0&&capabilities.memory.cacheBytes===0,'unload');
  return {schema:1,status:'passed',counts,formats,maxIlluminantError,cancellation:'hard abort + reload',durationMs:performance.now()-start,rpcTotalMs:timings,limits:['Synthetic correctness tests in a real module worker','Durations are smoke timings under host load, not performance comparisons','No WordPress or physical mobile validation']};
 }finally{engine.dispose();}
}
