// Isolated numerical qualification. Never run during the model A/B timings.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url)),out=path.join(root,'.build/evaluator-half-table'),base=path.join(root,'.build/evaluator-cache-original');
if(process.argv.includes('--help')){console.log('After compilation and outside model timing: node scripts/check-d2prl-evaluator-half-table.mjs --idle-confirmed\nChecks all65536 raw decode patterns, finite outputs/global tails and every trace field against immutable vendor, qualified HWC and same-SDK control. Only .build/evaluator-half-table/parity.json is written.');process.exit(0);}
if(process.argv.slice(2).some(v=>v!=='--idle-confirmed')||!process.argv.includes('--idle-confirmed'))throw Error('Explicit idle assertion required');
const sha=v=>createHash('sha256').update(v).digest('hex'),bytes=v=>new Uint8Array(v.buffer,v.byteOffset,v.byteLength);
const build=JSON.parse(await readFile(path.join(out,'build.json'),'utf8')),pins=JSON.parse(await readFile(path.join(root,'vendor/d2prl/PINNED.json'),'utf8'));
if(build.status!=='compiled-experimental-unqualified')throw Error('Completed same-SDK build required');
for(const[directory,files]of [[out,build.files],[base,build.base.files],[path.join(root,'vendor/d2prl'),pins.builds['evaluator-tiled'].files]])for(const[name,spec]of Object.entries(files)){const value=await readFile(path.join(directory,name));if(value.length!==spec.bytes||sha(value)!==spec.sha256)throw Error('Artifact identity differs: '+name);}
const modules={};for(const[name,file]of [['vendor',path.join(root,'vendor/d2prl/evaluator-tiled.js')],['qualified-hwc',path.join(base,'pixel-major-combined.js')],['control',path.join(out,'control.js')],['half-table',path.join(out,'half-table.js')]]){const m=await(await import(pathToFileURL(file).href)).default();if((m._d2prl_descriptor_layout?.()??0)!==(name==='vendor'?0:1))throw Error('Layout declaration differs: '+name);modules[name]=m;}
const module=modules['half-table'],probe=module._malloc(2*65536*4);if(!probe)throw Error('Decode probe allocation');
const decode={patterns:65536,finitePatterns:63488,nonfinitePatterns:2048,differentTableToOriginal:0,differentOriginalToBitFormula:0,signedZeroExact:false,nanPayloadsExact:false};
try{
 if(module._d2prl_descriptor_decode_bits(probe,0)!==1||module._d2prl_descriptor_decode_bits(probe+65536*4,1)!==1)throw Error('Decode probe refused');
 const direct=new Uint32Array(module.HEAPU8.buffer,probe,65536),table=new Uint32Array(module.HEAPU8.buffer,probe+65536*4,65536);
 for(let bits=0;bits<65536;bits++){const sign=(bits&0x8000)<<16;let e=(bits>>10)&31,m=bits&1023,expected;if(e===0){if(!m)expected=sign;else{let exponent=-14;while(!(m&1024)){m<<=1;exponent--;}expected=sign|((exponent+127)<<23)|((m&1023)<<13);}}else if(e===31)expected=sign|0x7f800000|(m<<13);else expected=sign|((e+112)<<23)|(m<<13);decode.differentTableToOriginal+=table[bits]!==direct[bits];decode.differentOriginalToBitFormula+=direct[bits]!==(expected>>>0);}
 decode.signedZeroExact=table[0]===0&&table[0x8000]===0x80000000;decode.nanPayloadsExact=Array.from({length:1023},(_,i)=>i+1).every(m=>table[0x7c00|m]===(0x7f800000|(m<<13))>>>0&&table[0xfc00|m]===(0xff800000|(m<<13))>>>0);
}finally{module._free(probe);}
const decodeExact=decode.differentTableToOriginal===0&&decode.differentOriginalToBitFormula===0&&decode.signedZeroExact&&decode.nanPayloadsExact;
function field(side,channels,candidates,flat,wide=false){
 const n=side*side,half=[0,0x8000,1,0x03ff,0x0400,0x2c00,0x3555,0x3800,0x3c00,0xbc00,0xb555,0x4200];
 const features=Uint16Array.from({length:channels*n},(_,i)=>{const raw=Math.imul(i+19,1103515245)>>>0;return flat?(i&1?0x8000:0):wide?((raw&1)<<15)|((raw>>>1)%(19*1024)):half[(raw>>>16)%half.length];}),x=new Float32Array(candidates*n),y=new Float32Array(candidates*n);
 for(let k=0;k<candidates;k++)for(let i=0;i<n;i++){const at=k*n+i;x[at]=Math.fround(((Math.imul(at+3,1664525)>>>0)%((side+2)*17))/17-1-i%side);y[at]=Math.fround(((Math.imul(at+11,22695477)>>>0)%((side+2)*13))/13-1-Math.floor(i/side));}
 return{side,channels,candidates,features,x,y};
}
function evaluate(name,input,begin,end,threads,trace){
 const m=modules[name],{side,channels,candidates}=input,n=side*side,count=end-begin,pointers=[],allocate=size=>{const p=m._malloc(size);if(!p)throw Error('Parity allocation');pointers.push(p);return p;};
 try{let features=input.features;if(name!=='vendor'){features=new Uint16Array(input.features.length);for(let c=0;c<channels;c++)for(let i=0;i<n;i++)features[i*channels+c]=input.features[c*n+i];}
  const f=allocate(features.byteLength),x=allocate(candidates*count*4),y=allocate(candidates*count*4),result=allocate(8*count),traceSize=(7*candidates+2*channels+12)*n,tp=trace?allocate(traceSize*4):0;
  m.HEAPU8.set(bytes(features),f);for(let k=0;k<candidates;k++){m.HEAPF32.set(input.x.subarray(k*n+begin,k*n+end),x/4+k*count);m.HEAPF32.set(input.y.subarray(k*n+begin,k*n+end),y/4+k*count);}if(tp)m.HEAPF32.fill(0,tp/4,tp/4+traceSize);
  if(m._d2prl_evaluate_tile(f,x,y,side,channels,candidates,begin,end,result,result+count*4,threads)!==1)throw Error('Parity kernel refused');
  if(tp&&m._d2prl_evaluate_tile_impl(f,x,y,side,channels,candidates,begin,end,result,result+count*4,tp,threads)!==1)throw Error('Parity trace refused');
  return{x:m.HEAPF32.slice(result/4,result/4+count),y:m.HEAPF32.slice(result/4+count,result/4+2*count),...(tp?{trace:m.HEAPF32.slice(tp/4,tp/4+traceSize)}:{})};
 }finally{for(const p of pointers)m._free(p);}
}
function compare(actual,expected){const a=new Uint32Array(actual.buffer,actual.byteOffset,actual.length),b=new Uint32Array(expected.buffer,expected.byteOffset,expected.length);let differentBits=0,maxAbsolute=0,positiveSignChanges=0;for(let i=0;i<a.length;i++){differentBits+=a[i]!==b[i];maxAbsolute=Math.max(maxAbsolute,Math.abs(actual[i]-expected[i]));positiveSignChanges+=(actual[i]>0)!==(expected[i]>0);}return{elements:a.length,differentBits,maxAbsolute,positiveSignChanges,exact:differentBits===0};}
const records=[];let totalElements=0;
function check(input,range,threads,trace,flatSignedZero=false){const before=[sha(bytes(input.features)),sha(bytes(input.x)),sha(bytes(input.y))],values=Object.fromEntries(Object.keys(modules).map(name=>[name,evaluate(name,input,...range,threads,trace)])),comparisons={};
 for(const[name,a,b]of [['controlToVendor','control','vendor'],['controlToQualifiedHwc','control','qualified-hwc'],['tableToVendor','half-table','vendor'],['tableToControl','half-table','control'],['tableToQualifiedHwc','half-table','qualified-hwc']])comparisons[name]=Object.fromEntries(Object.keys(values[a]).map(field=>[field,compare(values[a][field],values[b][field])]));
 if(JSON.stringify(before)!==JSON.stringify([sha(bytes(input.features)),sha(bytes(input.x)),sha(bytes(input.y))]))throw Error('Borrowed inputs changed');
 totalElements+=Object.values(values['half-table']).reduce((n,v)=>n+v.length,0);records.push({side:input.side,channels:input.channels,candidates:input.candidates,threads,range,trace,flatSignedZero,comparisons});
}
for(const side of [8,17,65])for(const channels of [36,96])for(const candidates of [1,5,13])for(const threads of [1,8])for(const range of [[0,side*side],...(side===17?[[97,side*side]]:[])])check(field(side,channels,candidates,false),range,threads,side===17);
for(const channels of [36,96])for(const candidates of [5,13])check(field(17,channels,candidates,true),[0,289],8,true,true);
for(const channels of [36,96])for(const candidates of [1,5,13])check(field(17,channels,candidates,false,true),[0,289],8,true);
const all=name=>records.every(r=>Object.values(r.comparisons[name]).every(v=>v.exact)),exact=decodeExact&&['controlToVendor','controlToQualifiedHwc','tableToVendor','tableToControl','tableToQualifiedHwc'].every(all);
const report={schema:1,status:exact?'passed-small-corpus-bit-parity':'unqualified-divergence',scope:'All raw Uint16→float32 decode patterns plus small finite native output/trace corpus. Nonfinite descriptors stay rejected by unchanged engine guards. No complete model or speed qualification.',compiler:build.compiler,buildFiles:build.files,qualifiedHwcFiles:build.base.files,decode,cases:records.length,totalElements,variants:[{name:'half-table',descriptorLayout:'HWC-uint16',precision:'experimental-exact-candidate',bitIdenticalToVendor:decodeExact&&all('tableToVendor'),bitIdenticalToSameCompilerControl:decodeExact&&all('tableToControl'),bitIdenticalToQualifiedHwc:decodeExact&&all('tableToQualifiedHwc'),activation:false}],controlBitIdenticalToVendor:all('controlToVendor'),activation:false,records};
await writeFile(path.join(out,'parity.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,decode,cases:records.length,totalElements,variants:report.variants,activation:false}));if(!exact)process.exitCode=1;
