import {study} from './m2-browser-study.mjs';
await study('composite-floor-contract',async()=>{
 const {NativeStatistics}=await import('/src/native-statistics.js'),{Budget}=await import('/src/cache.js'),m=await(await fetch('/.build/pyodide/manifest.json')).json(),budget=new Budget(1024**3),statistics=new NativeStatistics(budget,{downloadBytes:m.files.reduce((n,f)=>n+f.bytes,0),url:new URL('/.build/pyodide/',location.href).href,sourceSha256:m.files.find(x=>x.file==='noiseprint-statistics.zip').sha256}),tensor=(data,dims=[data.length])=>({data,dims}),r=Math.sqrt(Number.EPSILON);
 const run=async(op,a)=>{const o=await statistics.run(op,a,{workspaceBytes:64*1024**2,outputBytes:1024**2});try{return o.result;}finally{o.release();}};
 let result;
 try{
  const covariance=new Float64Array(512*512);for(let i=0;i<5;i++)covariance[i*513]=5-i;
  const basis=await run('stream:basis',{covariance:tensor(covariance,[512,512]),count:tensor(Float64Array.of(1),[])}),variance=Float64Array.from({length:32},(_,i)=>i===0?2:i===1?1:0),initial=await run('bank:initial-model',{point:tensor(new Float64Array(32),[1,32]),variance:tensor(variance)});
  const collapsed=await run('bank:maximization',{covariance:tensor(new Float64Array(1024),[32,32]),mean:tensor(new Float64Array(64),[2,32]),counts:tensor(Float64Array.of(1,1)),covariance_reference_scale:initial.covariance_reference_scale,covariance_regularizations:initial.covariance_regularizations});
  let noVariationRejected=false;try{await run('stream:basis',{covariance:tensor(new Float64Array(512*512),[512,512]),count:tensor(Float64Array.of(1),[])});}catch(e){noVariationRejected=e.code==='STATISTICS_EXECUTION';}
  result={pcaComponents:basis.L.dims[1],pcaRegularized:basis.pca_regularized_components.data[0],pcaFinite:basis.L.data.every(Number.isFinite),originalZeroEigenvalues:basis.eigs.data.filter(v=>v===0).length,initialReferenceScale:initial.covariance_reference_scale.data[0],collapsedReferenceScale:collapsed.covariance_reference_scale.data[0],covarianceRegularizations:collapsed.covariance_regularizations.data[0],collapsedDiagonal:[...collapsed.Sigma.data.filter((_,i)=>i%33===0)],expectedFloor:2*r,noVariationRejected};
 }finally{statistics.dispose();}
 return {...result,memory:budget.snapshot(),passed:result.pcaComponents===32&&result.pcaRegularized===27&&result.pcaFinite&&result.originalZeroEigenvalues===507&&result.initialReferenceScale===2&&result.collapsedReferenceScale===2&&result.covarianceRegularizations===2&&result.collapsedDiagonal.every(v=>Math.abs(v-result.expectedFloor)<1e-20)&&result.noVariationRejected&&budget.total()===0};
});
