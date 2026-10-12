// Small numerical qualification only. No full grid/model inference or speed
// benchmark. Do not run during a timed macrobenchmark: require an idle assertion.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url)),out=path.join(root,'.build/evaluator-cache-original');
if(process.argv.includes('--help')){console.log('After compilation and only in an idle interval: node scripts/check-d2prl-evaluator-original-cache.mjs --idle-confirmed\nCompares small whole/subranges and every trace field against immutable vendor4.0.15 and same-compiler control. Outputs only ignored .build/evaluator-cache-original/parity.json; no timing gain is measured.');process.exit(0);}
if(process.argv.slice(2).some(arg=>arg!=='--idle-confirmed')||!process.argv.includes('--idle-confirmed'))throw Error('Small native experiments require --idle-confirmed outside timed macrobenchmark intervals');
const sha=v=>createHash('sha256').update(v).digest('hex'),bytes=v=>new Uint8Array(v.buffer,v.byteOffset,v.byteLength);
const pins=JSON.parse(await readFile(path.join(root,'vendor/d2prl/PINNED.json'),'utf8')),build=JSON.parse(await readFile(path.join(out,'build.json'),'utf8'));
if(build.status!=='compiled-experimental-unqualified')throw Error('Candidate must have a completed experimental build');
for(const[name,spec]of Object.entries(pins.builds['evaluator-tiled'].files)){const b=await readFile(path.join(root,'vendor/d2prl',name));if(b.length!==spec.bytes||sha(b)!==spec.sha256)throw Error('Oracle pin differs');}
for(const[name,spec]of Object.entries(build.files)){const b=await readFile(path.join(out,name));if(b.length!==spec.bytes||sha(b)!==spec.sha256)throw Error('Build artifact identity differs');}
const variantNames=['cache-original','rotation-bases','combined','pixel-major-combined'],modules={},layouts=new WeakMap();for(const[name,file]of [['vendor',path.join(root,'vendor/d2prl/evaluator-tiled.js')],['control',path.join(out,'control.js')],...variantNames.map(name=>[name,path.join(out,name+'.js')])]){const module=await(await import(pathToFileURL(file).href)).default();const declared=module._d2prl_descriptor_layout?.()??0;if(declared!==(name==='pixel-major-combined'?1:0))throw Error('Native descriptor layout declaration differs: '+name);modules[name]=module;layouts.set(module,name==='pixel-major-combined'?'HWC-uint16':'CHW-uint16');}
function field(side,channels,candidates,flat){
 const n=side*side,half=[0,0x8000,1,0x03ff,0x0400,0x2c00,0x3555,0x3800,0x3c00,0xbc00,0xb555,0x4200];
 const features=Uint16Array.from({length:channels*n},(_,i)=>flat?(i&1?0x8000:0):half[(Math.imul(i+19,1103515245)>>>16)%half.length]),x=new Float32Array(candidates*n),y=new Float32Array(candidates*n);
 for(let k=0;k<candidates;k++)for(let i=0;i<n;i++){const at=k*n+i;x[at]=Math.fround(((Math.imul(at+3,1664525)>>>0)%((side+2)*17))/17-1-i%side);y[at]=Math.fround(((Math.imul(at+11,22695477)>>>0)%((side+2)*13))/13-1-Math.floor(i/side));}
 return{side,channels,candidates,features,x,y};
}
function evaluate(module,input,begin,end,threads,trace){
 const{side,channels,candidates}=input,n=side*side,count=end-begin,pointers=[],allocate=size=>{const p=module._malloc(size);if(!p)throw Error('Native test allocation');pointers.push(p);return p;};
 try{
  let features=input.features;if(layouts.get(module)==='HWC-uint16'){features=new Uint16Array(input.features.length);for(let c=0;c<channels;c++)for(let pixel=0;pixel<n;pixel++)features[pixel*channels+c]=input.features[c*n+pixel];for(let c=0;c<channels;c++)for(let pixel=0;pixel<n;pixel++)if(features[pixel*channels+c]!==input.features[c*n+pixel])throw Error('Half bit permutation differs');}
  const f=allocate(features.byteLength),x=allocate(candidates*count*4),y=allocate(candidates*count*4),result=allocate(8*count),sizes=[2*candidates*n,channels*n,channels*n,9*n,n,candidates*n,candidates*n,candidates*n,candidates*n,candidates*n,n,n],traceSize=sizes.reduce((a,b)=>a+b,0),tp=trace?allocate(traceSize*4):0;
  module.HEAPU8.set(bytes(features),f);for(let k=0;k<candidates;k++){module.HEAPF32.set(input.x.subarray(k*n+begin,k*n+end),x/4+k*count);module.HEAPF32.set(input.y.subarray(k*n+begin,k*n+end),y/4+k*count);}if(tp)module.HEAPF32.fill(0,tp/4,tp/4+traceSize);
  // This qualified export also establishes the tiled storage's global begin
  // and count. The implementation export then writes its ordinary full trace.
  if(module._d2prl_evaluate_tile(f,x,y,side,channels,candidates,begin,end,result,result+count*4,threads)!==1)throw Error('Kernel refused');
  if(tp){if(typeof module._d2prl_evaluate_tile_impl!=='function')throw Error('Trace implementation export unavailable');if(module._d2prl_evaluate_tile_impl(f,x,y,side,channels,candidates,begin,end,result,result+count*4,tp,threads)!==1)throw Error('Trace refused');}
  return{x:module.HEAPF32.slice(result/4,result/4+count),y:module.HEAPF32.slice(result/4+count,result/4+2*count),...(tp?{trace:module.HEAPF32.slice(tp/4,tp/4+traceSize)}:{})};
 }finally{for(const p of pointers)module._free(p);}
}
function compare(actual,expected){const a=new Uint32Array(actual.buffer,actual.byteOffset,actual.length),b=new Uint32Array(expected.buffer,expected.byteOffset,expected.length);let differentBits=0,maxAbsolute=0,signChanges=0;for(let i=0;i<actual.length;i++){differentBits+=a[i]!==b[i];maxAbsolute=Math.max(maxAbsolute,Math.abs(actual[i]-expected[i]));signChanges+=(actual[i]>0)!==(expected[i]>0);}return{exact:differentBits===0,differentBits,maxAbsolute,signChanges,elements:actual.length};}
const records=[];let totalElements=0;
for(const side of [8,17,65])for(const channels of [36,96])for(const candidates of [1,5,13])for(const threads of [1,8]){
 const input=field(side,channels,candidates,false),before=[sha(bytes(input.features)),sha(bytes(input.x)),sha(bytes(input.y))];
 for(const range of [[0,side*side],...(side===17?[[97,side*side]]:[])]){
  const trace=side===17,values=Object.fromEntries(Object.entries(modules).map(([name,m])=>[name,evaluate(m,input,...range,threads,trace)])),comparisons={};
  for(const[check,a,b]of [['controlToVendor','control','vendor'],...variantNames.flatMap(name=>[[name+'ToVendor',name,'vendor'],[name+'ToControl',name,'control']])])comparisons[check]=Object.fromEntries(Object.keys(values[a]).map(field=>[field,compare(values[a][field],values[b][field])]));
  if(JSON.stringify(before)!==JSON.stringify([sha(bytes(input.features)),sha(bytes(input.x)),sha(bytes(input.y))]))throw Error('Borrowed inputs changed');
  totalElements+=Object.values(values.combined).reduce((n,v)=>n+v.length,0);records.push({side,channels,candidates,threads,range,trace,comparisons});
 }
}
// Uniform descriptors preserve tied scores and both original zero signs.
for(const channels of [36,96])for(const candidates of [5,13]){const input=field(17,channels,candidates,true),values=Object.fromEntries(Object.entries(modules).map(([name,m])=>[name,evaluate(m,input,0,289,8,true)])),comparisons={};for(const[check,a,b]of [['controlToVendor','control','vendor'],...variantNames.flatMap(name=>[[name+'ToVendor',name,'vendor'],[name+'ToControl',name,'control']])])comparisons[check]=Object.fromEntries(Object.keys(values[a]).map(field=>[field,compare(values[a][field],values[b][field])]));records.push({side:17,channels,candidates,threads:8,range:[0,289],trace:true,flatSignedZero:true,comparisons});totalElements+=Object.values(values.combined).reduce((n,v)=>n+v.length,0);}
const all=(name)=>records.every(r=>r.comparisons[name]&&Object.values(r.comparisons[name]).every(c=>c.exact)),variantProofs=variantNames.map(name=>({name,precision:'experimental-exact-candidate',descriptorLayout:name==='pixel-major-combined'?'HWC-uint16':'CHW-uint16',bitIdenticalToVendor:all(name+'ToVendor'),bitIdenticalToSameCompilerControl:all(name+'ToControl'),activation:false})),exact=variantProofs.every(v=>v.bitIdenticalToVendor),report={schema:1,status:exact?'passed-small-corpus-bit-parity':'unqualified-divergence',scope:'Small synthetic native WASM evaluator only; no448/40 model chain, final masks or end-to-end speed measurement. Candidate/control SDK version and outputs remain experimental; vendor oracle unchanged. Pixel-major test permutes generated synthetic half bits only; model/public descriptor shape unchanged.',compiler:build.compiler,buildFiles:build.files,oracle:pins.builds['evaluator-tiled'],cases:records.length,totalElements,variants:variantProofs,controlBitIdenticalToVendor:all('controlToVendor'),activation:false,records};
await writeFile(path.join(out,'parity.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,cases:report.cases,totalElements,variants:variantProofs,controlBitIdenticalToVendor:report.controlBitIdenticalToVendor,activation:false}));if(!exact)process.exitCode=1;
