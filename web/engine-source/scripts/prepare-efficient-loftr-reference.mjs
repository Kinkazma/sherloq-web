// Produce native qualification inputs using the actual application's bounded
// crop/gray/resize/transform functions; the original RGB is kept for UI tests.
import {readFile,writeFile} from 'node:fs/promises';import{resolve}from'node:path';import{createHash}from'node:crypto';
import {Budget} from '../src/cache.js';import{efficientLoFtrCrop,prepareEfficientLoFtr,transformEfficientLoFtr}from'../src/efficient-loftr-input.js';
const root=resolve(process.argv[2]),reference=JSON.parse(await readFile(resolve(root,'preparation-reference.json'))),hash=a=>createHash('sha256').update(a).digest('hex');
for(const record of reference.records){
 const rgb=await readFile(resolve(root,record.image.file));if(rgb.byteLength!==record.image.bytes||hash(rgb)!==record.image.sha256)throw Error('RGB identity');
 const image={...record.image,format:'rgb8',data:new Uint8Array(rgb)},budget=new Budget(1024**3),prepared=[];let transformed;
 try{
  for(const polygon of record.regions)prepared.push(await prepareEfficientLoFtr(image,efficientLoFtrCrop(image,polygon,record.longSide),{reserveMemory:n=>budget.reserve(n)}));
  transformed=transformEfficientLoFtr(prepared[1],record.variant,{reserveMemory:n=>budget.reserve(n)});record.inputs={};
  for(const [key,tensor]of Object.entries({image0:prepared[0],image1:transformed,threshold:{data:Float32Array.of(record.threshold),dims:[]}})){
   const data=new Uint8Array(tensor.data.buffer,tensor.data.byteOffset,tensor.data.byteLength),file=record.name+'-'+key+'.f32';await writeFile(resolve(root,file),data);record.inputs[key]={file,bytes:data.byteLength,sha256:hash(data),dims:tensor.dims};
  }record.crops=prepared.map(p=>p.crop);
 }finally{transformed?.release();for(const p of prepared)p.release();if(budget.total())throw Error('Preparation lease leak');}
}
await writeFile(resolve(root,'prepared-inputs.json'),JSON.stringify(reference,null,2)+'\n');console.log(JSON.stringify({records:reference.records.length}));
