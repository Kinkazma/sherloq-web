import {readFile,writeFile} from 'node:fs/promises';
import {initCvWasm,cvNoisesnifferStatistics,cvNoisesnifferTailFunction} from '../src/opencv.js';
import {analyzeNoisesniffer,noisesnifferView,noisesnifferRegions} from '../src/noisesniffer.js';
const root=new URL('../',import.meta.url),file=f=>readFile(new URL('fixtures/'+f,root)),ref=JSON.parse(await file('noisesniffer-reference.json'));
async function array(record){const b=await file(record.file),buffer=b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);return record.dtype==='<i8'?new BigInt64Array(buffer):record.dtype==='<f8'?new Float64Array(buffer):record.dtype==='<f4'?new Float32Array(buffer):new Uint8Array(buffer);}
await initCvWasm({wasmBinary:await readFile(new URL('vendor/opencv/opencv.wasm',root))});
const tail=await cvNoisesnifferTailFunction();let tailMax=0,tailBad=0;
for(const t of ref.tails){const actual=tail(t.K,t.N,t.w,t.m),expected=t.logTail==='-Infinity'?-Infinity:t.logTail,err=actual===expected?0:Math.abs(actual-expected);tailMax=Math.max(tailMax,err);if(!(err<=1e-9)){console.log('Tail error',t,actual,err);tailBad++;}}
console.log('Tails',ref.tails.length,tailMax,tailBad);
const rows=[];
for(const c of ref.cases){
 const image={width:c.width,height:c.height,data:new Uint8Array(await file(c.input.file))},stats=await cvNoisesnifferStatistics(image,c.block);
 for(const a of c.analyses){
  const [blockSize,cellSize,samplesPerBin,lowFrequencyFraction,lowNoiseFraction]=a.parameters;
  const result=await analyzeNoisesniffer(image,{blockSize,cellSize,samplesPerBin,lowFrequencyFraction,lowNoiseFraction},stats),errors={};
  for(const [key,f] of Object.entries(a.arrays)){
   const expected=await array(f),actual=key==='overlay'?noisesnifferView(image,result,'regions').data:result[key];let different=Math.abs(expected.length-actual.length),first=[];
   for(let i=0;i<Math.min(actual.length,expected.length);i++)if(Number(expected[i])!==actual[i]){different++;if(first.length<3)first.push({i,expected:Number(expected[i]),actual:actual[i]});}
   errors[key]={different,...(different?{first}: {})};
  }
  const nativeRegions=JSON.stringify(a.regions.map(({log10_nfa,...r})=>r)),actualRegions=JSON.stringify(result.metadata.regions.map(({log10_nfa,...r})=>r));
  const regionsExact=nativeRegions===actualRegions;let maxLogNfa=0;if(regionsExact)for(let i=0;i<a.regions.length;i++)maxLogNfa=Math.max(maxLogNfa,Math.abs(a.regions[i].log10_nfa-result.metadata.regions[i].log10_nfa));
  const row={name:c.name,parameters:a.parameters,errors,regionsExact,maxLogNfa};rows.push(row);console.log(JSON.stringify(row));
 }
}
const regional=[];
for(const c of ref.regional){
 const out=await noisesnifferRegions(c.width,c.height,c.w,c.W,c.m,{gridWidth:c.all_blocks[0].length,gridHeight:c.all_blocks.length,all_blocks:Float64Array.from(c.all_blocks.flat()),low_noise_blocks:Float64Array.from(c.low_noise_blocks.flat())},{tail});
 const expected=await array(c.mask),regionsExact=JSON.stringify(out.regions.map(({log10_nfa,...r})=>r))===JSON.stringify(c.regions.map(({log10_nfa,...r})=>r));
 let maxLogNfa=0;if(regionsExact)for(let i=0;i<c.regions.length;i++)maxLogNfa=Math.max(maxLogNfa,Math.abs(out.regions[i].log10_nfa-c.regions[i].log10_nfa));
 const row={name:c.name,maskExact:out.mask.every((v,i)=>v===expected[i]),regionsExact,maxLogNfa};regional.push(row);console.log(JSON.stringify(row));
}
await writeFile(new URL('docs/noisesniffer-analysis-experiment.json',root),JSON.stringify({schema:1,status:'diagnostic-only',tails:{count:ref.tails.length,maximumAbsoluteLogError:tailMax,outsideTolerance:tailBad},rows,regional},null,2)+'\n');
