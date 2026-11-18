import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createEngine} from '../src/index.js';
import {native16ParameterProxyAdmitted} from '../src/native16-parameter-contract.js';
const modes=[['detail.frequency',{smooth:0}],['detail.wavelets',{wavelet:'db2',threshold:25}]];
if(!process.env.SHERLOQ_TRANSFORM16_FIXTURE){
 test('public transform integration uses genuine native banks from9to16bits',()=>{
  const env={...process.env,SHERLOQ_TRANSFORM16_FIXTURE:'1'};delete env.NODE_TEST_CONTEXT;
  const child=spawnSync(process.execPath,['--loader',fileURLToPath(new URL('./transform-native16-codec-loader.mjs',import.meta.url)),'--test',fileURLToPath(import.meta.url)],{env,encoding:'utf8'});
  assert.equal(child.status,0,child.stdout+'\n'+child.stderr);
  assert.match(child.stdout,/# pass 6\b/,'Every source-depth and cache-switch case must actually execute');
 });
}else{
 for(const sourceDepth of [9,10,12,14,16])test('public native'+sourceDepth+' source uses16bit transforms by default, with explicit8bit and previews',async()=>{
  const width=31,height=23,values=Array.from({length:width*height*3},(_,i)=>25000+(i*37+Math.floor(i/11)*29)%257),blob=new Blob([JSON.stringify({width,height,values,sourceDepth})],{type:'image/avif'}),engine=createEngine({memoryBudgetBytes:256*1024**2,cpuKernel:'single'});
  try{
   const loaded=await engine.loadBlob({id:'rich',blob,name:'native-'+sourceDepth+'.avif'});assert.equal(loaded.workingDepth,16);assert.equal(loaded.nativeSurface.sourceDepth,sourceDepth);
   const rect={x:0,y:0,width,height};
   for(const [operation,params]of modes){
    const cap=loaded.precisionCapabilities.operations.find(value=>value.operation===operation);assert.equal(cap.native,true);assert.equal(native16ParameterProxyAdmitted(operation,params,loaded.precisionCapabilities),true);
    const result=await engine.run({id:'native',imageId:loaded.id,operation,params,backend:'cpu'});
    assert.equal(result.provenance.precision.effectiveWorkingDepth,16);assert.equal(result.metrics.inputDepth,16);assert.equal(result.provenance.precision.sourceDepth,sourceDepth);assert.equal(result.surface.width,width);assert.equal(result.surface.height,height);
    const output=await engine.readPixels({surfaceId:result.surface.id,revision:result.surface.revision,rect});assert.equal(output.pixels.data.length,width*height*3);
    if(operation==='detail.frequency'){assert.deepEqual(Object.keys(result.rgbSurfaces).sort(),['high','magnitude','phase']);assert(result.tables.mask);for(const id of ['high','magnitude','phase'])assert(result.layers.some(layer=>layer.id===id&&layer.surfaceId===result.rgbSurfaces[id].id));}
    const changed=await engine.run({id:'changed',imageId:loaded.id,operation,params:{...params,threshold:35},backend:'cpu'});assert.equal(changed.provenance.precision.effectiveWorkingDepth,16);assert.equal(operation==='detail.frequency'?changed.metrics.baseCached:changed.metrics.coefficientsCached,true);
    const old=await engine.readPixels({surfaceId:result.surface.id,revision:result.surface.revision,rect});assert.deepEqual(old.pixels.data,output.pixels.data,'Old result changed after another threshold');
    await engine.releaseSurface(changed.surface.id);await engine.releaseSurface(result.surface.id);
    const legacy=await engine.run({id:'eight',imageId:loaded.id,operation,params,workingDepth:8,backend:'cpu'});assert.equal(legacy.provenance.precision.effectiveWorkingDepth,8);if(legacy.surface)await engine.releaseSurface(legacy.surface.id);
    const task={id:'preview',imageId:loaded.id,operation,params:{...params,threshold:45},workingDepth:16,backend:'cpu'},preview=await engine.previewParameters(task,{maxSide:64,maxPixels:4096});assert.equal(preview.metrics.nativeInputDepth,16);assert.equal(preview.metrics.exactNativeGrid,true);
    const promoted=await engine.run({...task,id:'promoted'});assert.equal(promoted.metrics.promotedPreview,true);assert.equal(promoted.provenance.precision.effectiveWorkingDepth,16);assert.deepEqual((await engine.readPixels({surfaceId:promoted.surface.id,revision:promoted.surface.revision,rect})).pixels.data,preview.pixels.data);await engine.releaseSurface(promoted.surface.id);
   }
   assert.deepEqual(Array.from((await engine.readNativePixels({surfaceId:loaded.nativeSurface.id,revision:loaded.nativeSurface.revision,rect})).pixels.data),values);
   await engine.unload(loaded.id);
  }finally{await engine.dispose();}
  const m=engine.capabilities().memory;assert.equal(m.retainedBytes+m.cacheBytes+m.activeReservationBytes,0);
 });
 test('depth/tool changes retire unused transform preparations while older output leases remain exact',async()=>{
  const width=31,height=23,values=Array.from({length:width*height*3},(_,i)=>25000+(i*37)%1031),engine=createEngine({memoryBudgetBytes:256*1024**2,cpuKernel:'single'});
  try{
   const loaded=await engine.loadBlob({id:'switch',blob:new Blob([JSON.stringify({width,height,values,sourceDepth:12})],{type:'image/avif'}),name:'switch.avif'}),rect={x:0,y:0,width,height},run=(operation,depth,params={smooth:0})=>engine.run({id:'switch-'+crypto.randomUUID(),imageId:loaded.id,operation,params,workingDepth:depth,backend:'cpu'}),read=async result=>(await engine.readPixels({surfaceId:result.surface.id,revision:result.surface.revision,rect})).pixels.data;
   const first=await run('detail.frequency',16),original=await read(first),warm=await run('detail.frequency',16,{smooth:0,threshold:20});assert.equal(warm.metrics.baseCached,true);
   const eight=await run('detail.frequency',8),back=await run('detail.frequency',16);assert.equal(back.metrics.baseCached,false,'The inactive16bit spectrum must have retired on the8bit switch');assert.deepEqual(await read(first),original);
   await run('detail.wavelets',16,{wavelet:'db2',threshold:25});const again=await run('detail.frequency',16);assert.equal(again.metrics.baseCached,false,'An unused wavelet/frequency preparation must not force the other tool to disk');assert.deepEqual(await read(first),original);assert.equal(eight.provenance.precision.effectiveWorkingDepth,8);
   await engine.unload(loaded.id);
  }finally{await engine.dispose();}
  const m=engine.capabilities().memory;assert.equal(m.retainedBytes+m.cacheBytes+m.activeReservationBytes,0);
 });
}
