// Small native exactness only; no model inference, activation or timing claim.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url)),out=path.join(root,'.build/evaluator-bilinear-simd'),base=path.join(root,'.build/evaluator-cache-original');
if(process.argv.includes('--help')){console.log('After macro-done and compilation: node scripts/check-d2prl-evaluator-bilinear-simd.mjs --idle-confirmed\nChecks all65536 half patterns and mixed decoder quads, unaligned SIMD load/store and scalar tails; compares small whole/subranges/all trace fields against pinned vendor and current exact HWC baseline. Writes only separate .build/evaluator-bilinear-simd/parity.json.');process.exit(0);}
if(process.argv.slice(2).some(arg=>arg!=='--idle-confirmed')||!process.argv.includes('--idle-confirmed'))throw Error('Requires --idle-confirmed after orchestrator macro-done signal');
const sha=value=>createHash('sha256').update(value).digest('hex'),bytes=value=>new Uint8Array(value.buffer,value.byteOffset,value.byteLength);
const pins=JSON.parse(await readFile(path.join(root,'vendor/d2prl/PINNED.json'),'utf8')),build=JSON.parse(await readFile(path.join(out,'build.json'),'utf8'));
if(build.status!=='compiled-experimental-unqualified')throw Error('Completed isolated SIMD build required');
for(const [name,spec]of Object.entries(pins.builds['evaluator-tiled'].files)){const value=await readFile(path.join(root,'vendor/d2prl',name));if(value.length!==spec.bytes||sha(value)!==spec.sha256)throw Error('Vendor oracle differs');}
for(const [name,spec]of Object.entries(build.files)){const value=await readFile(path.join(out,name));if(value.length!==spec.bytes||sha(value)!==spec.sha256)throw Error('SIMD artifact differs');}
for(const name of ['pixel-major-combined.js','pixel-major-combined.wasm']){const value=await readFile(path.join(base,name)),spec=build.baselineFiles[name];if(value.length!==spec.bytes||sha(value)!==spec.sha256)throw Error('HWC baseline differs');}
const variantNames=['hwc-control','bilinear-simd4-scalar','bilinear-simd4-normal'],modules={},layouts=new WeakMap();
for(const [name,file]of [['vendor',path.join(root,'vendor/d2prl/evaluator-tiled.js')],['baseline-hwc',path.join(base,'pixel-major-combined.js')],...variantNames.map(name=>[name,path.join(out,name+'.js')])]){const module=await(await import(pathToFileURL(file).href)).default();const layout=name==='vendor'?0:1;if((module._d2prl_descriptor_layout?.()??0)!==layout)throw Error('Native layout differs: '+name);modules[name]=module;layouts.set(module,layout);}

function decode(module,input){const source=module._malloc(input.byteLength+2),target=module._malloc(input.length*4+4);if(!source||!target)throw Error('Small decoder allocation refused');try{module.HEAPU8.set(bytes(input),source+2);module._d2prl_bilinear_decode4(source+2,input.length,target+4);return module.HEAPU8.slice(target+4,target+4+input.length*4);}finally{module._free(source);module._free(target);}}
const allHalf=Uint16Array.from({length:65536},(_,i)=>i),mixed=new Uint16Array(4*65536+3);
for(let i=0;i<65536;i++){const at=i*4;const lane=i%4;for(let j=0;j<4;j++)mixed[at+j]=j===lane?i:[0x3c00,0x8000,0x3555,0][j];}mixed.set([0xffff,1,0x8000],mixed.length-3);
const decoder=[];
for(const [name,input]of [['all-half-patterns',allHalf],['mixed-lanes-and-scalar-tail',mixed]]){const expected=decode(modules['hwc-control'],input);for(const variant of variantNames.slice(1)){const actual=decode(modules[variant],input),exact=Buffer.compare(actual,expected)===0;decoder.push({case:name,variant,elements:input.length,inputPointerAlignment:2,outputPointerAlignment:4,exact,sha256:sha(actual)});}}

function field(side,channels,candidates,flat=false){
 const n=side**2,half=[0,0x8000,1,0x03ff,0x0400,0x2c00,0x3555,0x3800,0x3c00,0xbc00,0xb555,0x4200],features=Uint16Array.from({length:channels*n},(_,i)=>flat?(i&1?0x8000:0):half[(Math.imul(i+19,1103515245)>>>16)%half.length]),x=new Float32Array(candidates*n),y=new Float32Array(candidates*n);
 for(let k=0;k<candidates;k++)for(let i=0;i<n;i++){const at=k*n+i;x[at]=Math.fround(((Math.imul(at+3,1664525)>>>0)%((side+2)*17))/17-1-i%side);y[at]=Math.fround(((Math.imul(at+11,22695477)>>>0)%((side+2)*13))/13-1-Math.floor(i/side));}
 return{side,channels,candidates,features,x,y};
}
function evaluate(module,input,begin,end,threads,trace){
 const {side,channels,candidates}=input,n=side**2,count=end-begin,pointers=[],allocate=size=>{const pointer=module._malloc(size);if(!pointer)throw Error('Small evaluator allocation refused');pointers.push(pointer);return pointer;};
 try{
  let features=input.features;if(layouts.get(module)===1){features=new Uint16Array(input.features.length);for(let channel=0;channel<channels;channel++)for(let pixel=0;pixel<n;pixel++)features[pixel*channels+channel]=input.features[channel*n+pixel];}
  const f=allocate(features.byteLength),x=allocate(candidates*count*4),y=allocate(candidates*count*4),result=allocate(8*count),traceSize=[2*candidates*n,channels*n,channels*n,9*n,n,candidates*n,candidates*n,candidates*n,candidates*n,candidates*n,n,n].reduce((a,b)=>a+b,0),tp=trace?allocate(traceSize*4):0;
  module.HEAPU8.set(bytes(features),f);for(let k=0;k<candidates;k++){module.HEAPF32.set(input.x.subarray(k*n+begin,k*n+end),x/4+k*count);module.HEAPF32.set(input.y.subarray(k*n+begin,k*n+end),y/4+k*count);}if(tp)module.HEAPF32.fill(0,tp/4,tp/4+traceSize);
  if(module._d2prl_evaluate_tile(f,x,y,side,channels,candidates,begin,end,result,result+count*4,threads)!==1)throw Error('Evaluator refused');
  if(tp&&module._d2prl_evaluate_tile_impl(f,x,y,side,channels,candidates,begin,end,result,result+count*4,tp,threads)!==1)throw Error('Trace refused');
  return{x:module.HEAPF32.slice(result/4,result/4+count),y:module.HEAPF32.slice(result/4+count,result/4+2*count),...(tp?{trace:module.HEAPF32.slice(tp/4,tp/4+traceSize)}:{})};
 }finally{for(const pointer of pointers)module._free(pointer);}
}
function compare(actual,expected){const a=new Uint32Array(actual.buffer,actual.byteOffset,actual.length),b=new Uint32Array(expected.buffer,expected.byteOffset,expected.length);let differentBits=0;for(let i=0;i<a.length;i++)differentBits+=a[i]!==b[i];return{exact:differentBits===0,differentBits,elements:a.length};}
const records=[];let totalElements=0;
function check(input,range,threads,trace,flat=false){const before=[sha(bytes(input.features)),sha(bytes(input.x)),sha(bytes(input.y))],values=Object.fromEntries(Object.entries(modules).map(([name,module])=>[name,evaluate(module,input,...range,threads,trace)])),comparisons={};for(const name of ['baseline-hwc',...variantNames])for(const oracle of ['vendor','baseline-hwc'])if(name!==oracle)comparisons[name+'To'+oracle]=Object.fromEntries(Object.keys(values[name]).map(key=>[key,compare(values[name][key],values[oracle][key])]));if(JSON.stringify(before)!==JSON.stringify([sha(bytes(input.features)),sha(bytes(input.x)),sha(bytes(input.y))]))throw Error('Borrowed inputs changed');records.push({side:input.side,channels:input.channels,candidates:input.candidates,range,threads,trace,flatSignedZero:flat,comparisons});totalElements+=Object.values(values['hwc-control']).reduce((sum,value)=>sum+value.length,0);}
for(const side of [8,17,65])for(const channels of [36,96])for(const candidates of [1,5,13])for(const threads of [1,8]){const input=field(side,channels,candidates);for(const range of [[0,side**2],...(side===17?[[97,side**2]]:[])])check(input,range,threads,side===17);}
for(const channels of [36,96])for(const candidates of [5,13])check(field(17,channels,candidates,true),[0,289],8,true,true);
const exact=decoder.every(value=>value.exact)&&records.every(record=>Object.values(record.comparisons).every(fields=>Object.values(fields).every(value=>value.exact)));
const report={schema:1,status:exact?'passed-small-corpus-bit-parity':'rejected-divergence',scope:'Generated synthetic half descriptors, exact decoder bits and all native trace fields/global tails; no448/40 model inference, decisions, real-worker transport, end-to-end benchmark or activation.',compiler:build.compiler,buildFiles:build.files,baselineFiles:build.baselineFiles,oracle:pins.builds['evaluator-tiled'],cases:records.length,totalElements,decoder,records,activation:false};
await writeFile(path.join(out,'parity.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,cases:report.cases,totalElements,decoder,activation:false}));if(!exact)process.exitCode=1;
