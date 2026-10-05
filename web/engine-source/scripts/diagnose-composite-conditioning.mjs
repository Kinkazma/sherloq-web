import {study} from './m2-browser-study.mjs';
await study('composite-conditioning',async()=>{
 const {NativeStatistics}=await import('/src/native-statistics.js'),{Budget}=await import('/src/cache.js'),manifest=await(await fetch('/.build/pyodide/manifest.json')).json(),budget=new Budget(2*1024**3),runtime={downloadBytes:manifest.files.reduce((n,f)=>n+f.bytes,0),url:new URL('/.build/pyodide/',location.href).href,sourceSha256:manifest.files.find(x=>x.file==='noiseprint-statistics.zip').sha256},stats=new NativeStatistics(budget,runtime),records=[];
 try{for(const [directory,file]of [['composite-small-singular','reference.json'],['composite','chain-reference.json'],['composite','reference.json']]){
  const base='/.build/'+directory+'/',ref=await(await fetch(base+file)).json(),n=ref.width*ref.height,inputs={};let prepared,output;
  try{
   if(ref.files.gray)inputs.gray={data:new Float32Array(await(await fetch(base+ref.files.gray.file)).arrayBuffer()),dims:[ref.height,ref.width]};
   else{prepared=await stats.run('prepare',{rgb:{data:new Uint8Array(await(await fetch(base+ref.files.rgb.file)).arrayBuffer()),dims:[ref.height,ref.width,3]}},{workspaceBytes:32*n,outputBytes:4*n+8192});inputs.gray=prepared.result.gray;}
   inputs.noise={data:new Float32Array(await(await fetch(base+ref.files.noise.file)).arrayBuffer()),dims:[ref.height,ref.width]};
   output=await stats.run('composite',inputs,{workspaceBytes:256*1024**2,outputBytes:16*1024**2});const errors={};
   for(const key of ['map','valid','raster']){const Type=key==='map'?Float64Array:Uint8Array,expected=new Type(await(await fetch(base+ref.files[key].file)).arrayBuffer()),actual=output.result[key].data;let max=0,sum=0,differences=0,binary128=0;for(let i=0;i<actual.length;i++){const delta=Math.abs(actual[i]-expected[i]);max=Math.max(max,delta);sum+=delta;differences+=delta!==0;binary128+=(actual[i]>=128)!==(expected[i]>=128);}errors[key]={max,mean:sum/actual.length,differences,values:actual.length,...(key==='raster'?{maxNormalized:max/255,meanNormalized:sum/actual.length/255,displayMidpointDifferences:binary128,note:'128 is a display midpoint diagnostic, not a native detection threshold.'}:{})};}
   const values=Array.from(output.result.model_conditioning.data);records.push({case:directory+'/'+file,conditioning:values,illConditioned:values[3]<values[4],errors});
  }finally{output?.release();prepared?.release();stats.clear();}
 }}finally{stats.dispose();}
 return {records,memory:budget.snapshot(),passed:records.slice(0,2).every(r=>r.illConditioned)&&!records[2].illConditioned&&records[2].errors.raster.differences===0&&budget.total()===0,scope:'Detection of material numerical instability, not a claim of singular-map parity. Exact native residual supplied to isolate statistics.'};
});
