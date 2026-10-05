import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createEngine} from '../web/wordpress/sherloq-browser/assets/unified-engine/src/index.js';
const here=path.dirname(fileURLToPath(import.meta.url));
const repo=path.resolve(here,'..');
const job=JSON.parse(process.argv[2]),dir=path.join(here,'results',job.id);await fs.mkdir(dir,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex');
const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
const chunk=(type,data)=>{const tag=Buffer.from(type),len=Buffer.alloc(4),crc=Buffer.alloc(4);len.writeUInt32BE(data.length);let c=0xffffffff;for(const v of Buffer.concat([tag,data]))c=crcTable[(c^v)&255]^(c>>>8);crc.writeUInt32BE((c^0xffffffff)>>>0);return Buffer.concat([len,tag,data,crc]);};
function png(p){if(p.format!=='rgb8'||p.data.length!==p.width*p.height*3)throw Error('RGB8 output required');const h=Buffer.alloc(13);h.writeUInt32BE(p.width,0);h.writeUInt32BE(p.height,4);h[8]=8;h[9]=2;const rows=Buffer.alloc((p.width*3+1)*p.height);for(let y=0;y<p.height;y++)rows.set(p.data.subarray(y*p.width*3,(y+1)*p.width*3),y*(p.width*3+1)+1);return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',h),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);}
const summary=(v,depth=0)=>{if(ArrayBuffer.isView(v))return {type:v.constructor.name,length:v.length,sha256:hash(new Uint8Array(v.buffer,v.byteOffset,v.byteLength))};if(Array.isArray(v))return v.length>100?{length:v.length,first:v.slice(0,5).map(x=>summary(x,depth+1))}:v.map(x=>summary(x,depth+1));if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).filter(([k])=>!['pixels','release'].includes(k)).map(([k,x])=>[k,summary(x,depth+1)]));return v;};
let engine=createEngine({memoryBudgetBytes:4*1024**3,cpuKernel:'single'}),lastPhase;
try{
const source=await fs.readFile(path.join(repo,job.input));const loaded=await engine.load({id:'source',bytes:new Uint8Array(source),name:path.basename(job.input)});
const start=performance.now(),r=await engine.run({id:job.id,imageId:'source',operation:job.operation,params:job.params??{},view:job.view??{},backend:'cpu'},{onProgress:e=>{if(e.phase!==lastPhase){lastPhase=e.phase;console.log(job.id+' '+e.phase);}}});
let pixels=r.pixels;if(!pixels&&r.surface)pixels=(await engine.readPixels({surfaceId:r.surface.id,revision:r.surface.revision})).pixels;
if(!pixels&&job.operation==='ela.energy'){const {renderEnergy}=await import('../web/wordpress/sherloq-browser/assets/energy-render.js');const source=(await engine.readPixels({surfaceId:loaded.surface.id,revision:loaded.surface.revision})).pixels;pixels=await renderEnergy(r.data,source,{view:'overlay',opacity:70});}
if(!pixels)throw Error('No raster output: '+JSON.stringify(summary(r)));
const output=png(pixels);await fs.writeFile(path.join(dir,'result.png'),output);
const evidence={job,date:'2026-10-05',runtime:'Direct Node.js execution of the same web engine and its native WASM kernels; CPU single worker',engine:'0.35.0-export.2',sourceSha256:hash(source),sourceDimensions:[loaded.width,loaded.height],outputDimensions:[pixels.width,pixels.height],outputSha256:hash(output),rawRgbSha256:hash(pixels.data),elapsedMs:performance.now()-start,result:summary(r)};
if(job.operation==='pixels.defects')evidence.candidates=Array.from(r.data.candidates);
if(job.energyLayers&&job.operation==='ela.energy'){
 evidence.outputs=[{file:'result.png',width:pixels.width,height:pixels.height,sha256:hash(output),rawRgbSha256:hash(pixels.data)}];
 for(const [index,field] of ['energy_low_score','energy_high_score'].entries()){
  const values=r.data[field],data=new Uint8Array(values.length*3);for(let i=0;i<values.length;i++)data[i*3]=Math.max(0,Math.min(255,Math.round(values[i]*255)));
  const map={width:r.data.width,height:r.data.height,format:'rgb8',data},bytes=png(map),name='view-'+(index+1)+'.png';await fs.writeFile(path.join(dir,name),bytes);
  evidence.outputs.push({file:name,field,width:map.width,height:map.height,sha256:hash(bytes),rawRgbSha256:hash(data)});
 }
 evidence.presentation={energyScores:'Red channel: round(score * 255), clamped to 0–255; same scale as automatic-client.js. Not a probability.'};
}
await fs.writeFile(path.join(dir,'result.json'),JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify({id:job.id,status:r.status,elapsedMs:evidence.elapsedMs,output:dir}));
}catch(e){await fs.writeFile(path.join(dir,'error.json'),JSON.stringify({job,error:{name:e.name,code:e.code,message:e.message,stack:e.stack}},null,2)+'\n');console.error(job.id,e);process.exitCode=1;}finally{await engine.dispose();}
