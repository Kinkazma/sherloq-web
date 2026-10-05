import {readFile,writeFile} from 'node:fs/promises';
import {initCvWasm,cvNoisesnifferStatistics} from '../src/opencv.js';
import {numpyArgsort} from '../src/numpy-argsort.js';
const root=new URL('../',import.meta.url),file=f=>readFile(new URL('fixtures/'+f,root));
const ref=JSON.parse(await file('noisesniffer-reference.json'));
async function array(record){const b=await file(record.file),buffer=b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);return record.dtype==='<i8'?BigInt64Array.from(new BigInt64Array(buffer)):record.dtype==='<f8'?new Float64Array(buffer):record.dtype==='<f4'?new Float32Array(buffer):new Uint8Array(buffer);}
await initCvWasm({wasmBinary:await readFile(new URL('vendor/opencv/opencv.wasm',root))});
const rows=[];
for(const c of ref.cases){
 const out=await cvNoisesnifferStatistics({width:c.width,height:c.height,data:new Uint8Array(await file(c.input.file))},c.block),errors={};
 for(const key of ['valid','means','variance']){
  const expected=await array(c.statistics[key]),actual=out[key];let different=0,maximum=0,first=[];
  if(expected.length!==actual.length)throw Error('Length '+c.name+' '+key);
  for(let i=0;i<actual.length;i++)if(!Object.is(Number(expected[i]),actual[i])){different++;maximum=Math.max(maximum,Math.abs(Number(expected[i])-actual[i]));if(first.length<3)first.push({i,expected:Number(expected[i]),actual:actual[i]});}
  errors[key]={different,maximum,...(different?{first}: {})};
 }
 rows.push({name:c.name,errors});console.log(c.name,JSON.stringify(errors));
}
let sorts=0;
for(const s of ref.sorts){const values=await array(s.values),expected=await array(s.indices),actual=numpyArgsort(values);if(actual.some((v,i)=>v!==Number(expected[i])))throw Error('Sort '+s.name);sorts++;}
const result={schema:1,status:'diagnostic-only',rows,sorts};await writeFile(new URL('docs/noisesniffer-statistics-experiment.json',root),JSON.stringify(result,null,2)+'\n');console.log('Sorts exact:',sorts);
