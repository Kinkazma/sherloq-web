// Synthetic GPU qualification: weak contrast after smoothing, independent axes,
// three displays and repeated operator/cache changes. Run in a WebGPU browser.
export async function qualifyGradientFieldSequences(){
 const{createEngine}=await import('../src/index.js'),{gradientParams}=await import('../src/gradient-parameters.js'),methods=['sobel','krawetz','disk','central','prewitt','scharr','farid','gaussian','kirsch'],rows=[];
 const engine=createEngine({memoryBudgetBytes:384*1024**2,cpuKernel:'auto'}),width=64,height=48;
 async function read(r){return r.pixels?.data??(await engine.readPixels({surfaceId:r.surface.id,revision:r.surface.revision})).pixels.data;}
 try{for(const fixture of['texture','low-contrast','constant','horizontal','vertical']){
  const data=fixture==='texture'?Uint8Array.from({length:width*height*3},(_,i)=>(i*73+(i>>>3)*19)%256):new Uint8Array(width*height*3).fill(128);if(fixture==='low-contrast')data.fill(129,(24*width+32)*3,(24*width+32)*3+3);if(['horizontal','vertical'].includes(fixture))for(let y=0;y<height;y++)for(let x=0;x<width;x++){const z=fixture==='horizontal'?x:y,v=(z*z*13+z*37)%256;data.fill(v,(y*width+x)*3,(y*width+x)*3+3);}
  await engine.load({id:fixture,bytes:Uint8Array.of(1),pixels:{width,height,format:'rgb8',data}});
  for(const method of methods)for(const{view,mode,invert}of[{view:'angle',mode:2,invert:false},{view:'coherence',mode:2,invert:false},{view:'native',mode:2,invert:false},{view:'native',mode:3,invert:true}]){
   const params=gradientParams({method,view,mode,invert,luma:'linear709',border:'reflect',preSigma:['low-contrast','constant'].includes(fixture)?32:1.1,preSize:['low-contrast','constant'].includes(fixture)?127:7,sampleStep:fixture==='texture'?3:1,tensorSize:15,tensorSigma:3}),task=backend=>({id:'audit',imageId:fixture,operation:'detail.gradient',params,backend}),cpu=await engine.run(task('cpu')),expected=await read(cpu),gpu=await engine.run(task('webgpu')),actual=await read(gpu);let max=0,sum=0,different=0;
   for(let i=0;i<actual.length;i++){let e=Math.abs(actual[i]-expected[i]);max=Math.max(max,e);sum+=e;if(e)different++;}if(max>1)throw Error('CPU/GPU disagreement '+fixture+'/'+method+'/'+view+': '+max);if(gpu.metrics.backend!=='webgpu'||gpu.metrics.gpuJobs<1&&!gpu.metrics.analysisCacheHit)throw Error('No actual GPU derivative');rows.push({fixture,method,view,mode,invert,maxError:max,meanError:sum/actual.length,differentValues:different,maximumCpuMagnitude:cpu.metrics.maximumGradientMagnitude,maximumGpuMagnitude:gpu.metrics.maximumGradientMagnitude,gpuJobs:gpu.metrics.gpuJobs,cacheHit:gpu.metrics.analysisCacheHit});
   await engine.releaseSurface(cpu.surface.id);await engine.releaseSurface(gpu.surface.id);
  }
  await engine.unload(fixture);
 }const memory=engine.capabilities().memory;if(memory.activeReservationBytes||memory.retainedBytes)throw Error('Unreleased field ownership');return{rows,memory};}finally{await engine.dispose();}
}
