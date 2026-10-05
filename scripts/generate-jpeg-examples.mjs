import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createEngine} from '../web/wordpress/sherloq-browser/assets/unified-engine/src/index.js';
const root=fileURLToPath(new URL('../',import.meta.url)),out=new URL('./results/',import.meta.url),engine=createEngine({memoryBudgetBytes:8*1024**3,cpuKernel:'single'});
const input='examples/street/original.jpg',bytes=await fs.readFile(root+'/'+input),loaded=await engine.load({id:'source',bytes:new Uint8Array(bytes),name:'Street Photo.jpg'});
try{for(const [id,operation] of [['street-recompression','jpeg.recompression'],['street-multiple-compression','jpeg.multiple']]){
 const start=Date.now();const r=await engine.run({id,imageId:'source',operation,params:{},backend:'cpu'});const dir=new URL(id+'/',out);await fs.mkdir(dir,{recursive:true});
 const summary=(k,v)=>ArrayBuffer.isView(v)?v.length<10000?Array.from(v):{type:v.constructor.name,length:v.length}:typeof v==='bigint'?v.toString():v;
 await fs.writeFile(new URL('numeric.json',dir),JSON.stringify({job:{id,input,operation,params:{},backend:'cpu'},engine:engine.capabilities().version,inputSha256:createHash('sha256').update(bytes).digest('hex'),sourceDimensions:[loaded.width,loaded.height],elapsedMs:Date.now()-start,result:r},summary,2)+'\n');console.log(id+' complete');
}}finally{await engine.dispose();}
