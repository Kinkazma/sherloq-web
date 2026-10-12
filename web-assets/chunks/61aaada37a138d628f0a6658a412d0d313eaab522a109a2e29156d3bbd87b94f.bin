import {DEFAULT_ELA_PARAMS,elaBase,elaRender} from '../src/ela.js';
import {toneTable,fusedCpu,createGpuExperiment} from './ela-lut.js';
const diff=(a,b)=>{let count=0,max=0;for(let i=0;i<a.length;i++){if(a[i]!==b[i])count++;max=Math.max(max,Math.abs(a[i]-b[i]));}return {differentBytes:count,maxAbsoluteErrorByte:max};};
export async function benchmark(){
 const report={schema:1,scope:'isolated kernels, synthetic images, NOT end-to-end JPEG or WordPress',units:'milliseconds; RGB byte error 0..255',runs:[]};let gpu;
 try{gpu=await createGpuExperiment();report.gpu={adapter:gpu.adapter,initMs:gpu.initMs};}catch(e){report.gpu={unavailable:e.message};}
 try{
 if(gpu){const reference=await(await fetch(new URL('../fixtures/reference.json',import.meta.url))).json();report.gpu.nativeOutputsChecked=0;for(const fixture of reference.cases){const read=async file=>new Uint8Array(await(await fetch(new URL('../fixtures/'+file,import.meta.url))).arrayBuffer());const a=await read(fixture.original.file),b=await read(fixture.recompressed.file);for(const expected of fixture.expected){const table=await toneTable(expected.params),result=await gpu.run(a,b,expected.params,table);const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',result.data)),x=>x.toString(16).padStart(2,'0')).join('');if(digest!==expected.sha256)throw new Error('GPU native fixture parity failed');report.gpu.nativeOutputsChecked++;}}}
 for(const side of [64,512,1024]){
  const a=new Uint8Array(side*side*3),b=new Uint8Array(a.length);for(let i=0;i<a.length;i++){a[i]=(i*17+(i>>8))%256;b[i]=(i*23+(i>>6))%256;}
  const p={...DEFAULT_ELA_PARAMS,grayscale:true},lt=performance.now(),table=await toneTable(p),tableMs=performance.now()-lt;
  for(let iteration=0;iteration<3;iteration++){
   const start=performance.now(),base=await elaBase(a,b,p.linear),expected=await elaRender(base,p),referenceMs=performance.now()-start;
   const cpuStart=performance.now(),cpu=await fusedCpu(a,b,p,table),fusedCpuMs=performance.now()-cpuStart;
   const record={side,pixels:side*side,iteration,tableMs,referenceMs,fusedCpuMs,cpuError:diff(expected,cpu)};
   if(gpu){const result=await gpu.run(a,b,p,table);record.gpu=result.metrics;record.gpuError=diff(expected,result.data);}
   if(record.cpuError.differentBytes||record.gpuError?.differentBytes)throw new Error('Output parity failed');report.runs.push(record);
  }
 }}finally{gpu?.dispose();}return report;
}
