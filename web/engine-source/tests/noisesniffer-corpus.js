import {cvNoisesnifferStatistics,cvNoisesnifferTailFunction} from '../src/opencv.js';
import {numpyArgsort} from '../src/numpy-argsort.js';
import {analyzeNoisesniffer,noisesnifferView,noisesnifferRegions} from '../src/noisesniffer.js';
export async function noisesnifferArray(read,record){const bytes=await read(record.file),buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);return record.dtype==='<i8'?new BigInt64Array(buffer):record.dtype==='<f8'?new Float64Array(buffer):record.dtype==='<f4'?new Float32Array(buffer):new Uint8Array(buffer);}
export function noisesnifferExact(actual,expected,name){if(actual.length!==expected.length)throw Error(name+' length');for(let i=0;i<actual.length;i++)if(!Object.is(actual[i],Number(expected[i])))throw Error(name+' at '+i+': '+actual[i]+' != '+expected[i]);}
export function noisesnifferParameters(a){const [blockSize,cellSize,samplesPerBin,lowFrequencyFraction,lowNoiseFraction]=a;return {blockSize,cellSize,samplesPerBin,lowFrequencyFraction,lowNoiseFraction};}
export function noisesnifferRegionsEqual(actual,expected){
 if(JSON.stringify(actual.map(({log10_nfa,...r})=>r))!==JSON.stringify(expected.map(({log10_nfa,...r})=>r)))throw Error('Noisesniffer region membership/order/counts');
 let max=0;for(let i=0;i<actual.length;i++){const e=Math.abs(actual[i].log10_nfa-expected[i].log10_nfa);if(!(e<=1e-10))throw Error('Noisesniffer log10 NFA');max=Math.max(max,e);}return max;
}
export async function noisesnifferCorpus(read,{fast=true}={}){
 const ref=JSON.parse(new TextDecoder().decode(await read('noisesniffer-reference.json'))),tail=await cvNoisesnifferTailFunction();let maxTail=0,maxLogNfa=0,analyses=0,positiveAnalyses=0;
 for(const c of ref.cases){
  const image={width:c.width,height:c.height,format:'rgb8',data:await read(c.input.file)},stats=await cvNoisesnifferStatistics(image,c.block,{fast});
  for(const key of ['valid','means','variance'])noisesnifferExact(stats[key],await noisesnifferArray(read,c.statistics[key]),c.name+' '+key);
  for(const a of c.analyses){
   const result=await analyzeNoisesniffer(image,noisesnifferParameters(a.parameters),stats);
   for(const [key,f] of Object.entries(a.arrays))noisesnifferExact(key==='overlay'?noisesnifferView(image,result,'regions').data:result[key],await noisesnifferArray(read,f),c.name+' '+key);
   maxLogNfa=Math.max(maxLogNfa,noisesnifferRegionsEqual(result.metadata.regions,a.regions));analyses++;if(a.regions.length)positiveAnalyses++;
   const mask=noisesnifferView(image,result,'mask').data;for(let i=0;i<mask.length;i++)if(mask[i]!==result.mask[Math.floor(i/3)])throw Error('Noisesniffer mask view');
   noisesnifferExact(noisesnifferView(image,result,'distribution').data,result.distribution,'Distribution view');
   if(result.metadata.inconclusive!==a.inconclusive)throw Error('Noisesniffer inconclusive flag');
  }
 }
 for(const s of ref.sorts)noisesnifferExact(numpyArgsort(await noisesnifferArray(read,s.values)),await noisesnifferArray(read,s.indices),'Sort '+s.name);
 for(const t of ref.tails){const actual=tail(t.K,t.N,t.w,t.m),expected=t.logTail==='-Infinity'?-Infinity:t.logTail,error=actual===expected?0:Math.abs(actual-expected);if(!(error<=1e-10))throw Error('Noisesniffer binomial tail');maxTail=Math.max(maxTail,error);}
 for(const c of ref.regional){
  const result=await noisesnifferRegions(c.width,c.height,c.w,c.W,c.m,{gridWidth:c.all_blocks[0].length,gridHeight:c.all_blocks.length,all_blocks:Float64Array.from(c.all_blocks.flat()),low_noise_blocks:Float64Array.from(c.low_noise_blocks.flat())},{tail});
  noisesnifferExact(result.mask,await noisesnifferArray(read,c.mask),c.name+' regional mask');maxLogNfa=Math.max(maxLogNfa,noisesnifferRegionsEqual(result.regions,c.regions));
 }
 if(!positiveAnalyses)throw Error('Corpus must exercise a positive detection');
 return {schema:1,status:'core-parity-passed',statistics:ref.cases.length,analyses,positiveAnalyses,views:analyses*3,regional:ref.regional.length,sorts:ref.sorts.length,tails:ref.tails.length,maxTailLogError:maxTail,maxLogNfaError:maxLogNfa};
}
