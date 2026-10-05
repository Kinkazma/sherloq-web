import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import create from '../.build/cloning-features-brisk-directions.mjs';
const root=new URL('../',import.meta.url),bytes=await fs.readFile(new URL('.build/brisk-boundary-study.json',root));
const {rows}=JSON.parse(bytes),m=await create(),results={};
const bin=raw=>raw===-1?0:((Math.trunc(1024*(raw/360)+.5)%1024)+1024)%1024;
for(const mode of ['wasm-atan2f','double-rounded-to-float']){
 const record={vectors:rows.length,differingAngles:0,maxDegrees:0,changedBins:0,examples:[]};
 for(const [x,y,native,nativeBin,rounded] of rows){
  const raw=mode==='wasm-atan2f'?m._brisk_angle(x,y):rounded,actualBin=bin(raw);
  record.differingAngles+=raw!==native;record.maxDegrees=Math.max(record.maxDegrees,Math.abs(raw-native));
  if(actualBin!==nativeBin){record.changedBins++;if(record.examples.length<12)record.examples.push({x,y,native,actual:raw,nativeBin,actualBin});}
 }
 results[mode]=record;
}
const proof={schema:1,scope:'synthetic integer vectors near descriptor bin boundaries; not observed image detections',vectorsSha256:createHash('sha256').update(bytes).digest('hex'),results};
await fs.writeFile(new URL('docs/brisk-boundary-study.json',root),JSON.stringify(proof,null,2)+'\n');
console.log(Object.fromEntries(Object.entries(results).map(([name,{examples,...summary}])=>[name,summary])));
