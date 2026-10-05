import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {initCvWasm} from '../src/opencv.js';
import {comparisonParams,comparisonData,comparisonView} from '../src/comparison.js';
const root=new URL('../',import.meta.url),ref=JSON.parse(await readFile(new URL('fixtures/comparison-reference.json',root))),rows=[],hash=a=>createHash('sha256').update(a).digest('hex');
const exact=new Set(['ssimul','butter']);
await initCvWasm({wasmBinary:await readFile(new URL('vendor/opencv/opencv.wasm',root))});
let failures=0;
for(const f of ref.cases){
 const images=await Promise.all([f.first,f.second].map(async file=>({width:f.width,height:f.height,format:'rgb8',data:new Uint8Array(await readFile(new URL('fixtures/'+file,root)))})));
 const cache=new Map(),context={references:[{id:'reference',pixels:images[1]}],memo:async(name,compute)=>{if(!cache.has(name))cache.set(name,await compute());return cache.get(name);}},params={referenceImageId:'reference',metrics:true};
 const result=await comparisonData(images[0],comparisonParams(params),{},context),differences={},metricChecks={},views=[];
 for(const [name,value] of Object.entries(f.values)){
  const actual=result.data.values[name],difference=value===actual?0:typeof value==='number'&&typeof actual==='number'?Math.abs(value-actual):null;
  differences[name]=difference;metricChecks[name]=difference!==null&&(exact.has(name)?difference===0:difference<=1e-12*Math.max(1,Math.abs(value)));
 }
 const errorsMatch=JSON.stringify(Object.keys(result.data.errors).sort())===JSON.stringify(Object.keys(f.errors).sort()),valuesMatch=JSON.stringify(Object.keys(result.data.values).sort())===JSON.stringify(Object.keys(f.values).sort());
 for(const v of f.views){
  const p=comparisonParams({...params,view:v.mode,equalized:v.equalized,grayscale:v.grayscale}),base=await comparisonData(images[0],p,{},context),out=await comparisonView(structuredClone(base),p,{});
  views.push({mode:v.mode,equalized:v.equalized,grayscale:v.grayscale,exact:hash(out.pixels.data)===v.sha256});
 }
 const fullBinDifference=Math.abs(result.data.histogramCorrelationFullBins-f.histogramCorrelationFullBins),passed=errorsMatch&&valuesMatch&&Object.values(metricChecks).every(Boolean)&&views.every(v=>v.exact)&&fullBinDifference<=1e-12;
 const row={name:f.name,passed,differences,metricChecks,errorsMatch,valuesMatch,histogramCorrelationFullBinsDifference:fullBinDifference,views};rows.push(row);if(!passed)failures++;
 console.log(f.name,passed?'passed':'FAILED',Object.fromEntries(Object.entries(differences).filter(([,value])=>value!==0)),errorsMatch,valuesMatch,views.filter(v=>!v.exact).length);
}
await writeFile(new URL('docs/comparison-parity-experiment.json',root),JSON.stringify({schema:2,status:failures?'failed':'passed',cases:rows.length,views:rows.reduce((n,r)=>n+r.views.length,0),scorePolicy:'SSIMULACRA and Butteraugli native printed scores exact; other finite scores absolute/relative tolerance 1e-12; nonfinite outcomes explicit and equal; all rendered pixels exact.',sourceSha256:ref.sourceSha256,rows},null,2)+'\n');
if(failures)throw new Error(failures+' comparison cases failed qualification.');
