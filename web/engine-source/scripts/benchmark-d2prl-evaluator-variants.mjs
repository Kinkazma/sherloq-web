// Isolated useful-kernel comparison. This is not a complete-model speed claim.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url)),out=path.join(root,'.build/evaluator-cache-original');
const args=new Map(process.argv.slice(2).map(arg=>{const at=arg.indexOf('=');return at<0?[arg,true]:[arg.slice(0,at),arg.slice(at+1)];}));
if(args.has('--help')){console.log('After small parity and outside model timing: node scripts/benchmark-d2prl-evaluator-variants.mjs --idle-confirmed [--pixels=8192] [--repetitions=3]\nUses generated finite448 descriptor banks, global beginning1234 and512 native ranges. All candidate bytes must match the pinned vendor; outputs only .build/evaluator-cache-original/kernel-benchmark.json. Transpose cost is reported separately; this is not a model gain.');process.exit(0);}
for(const key of args.keys())if(!['--idle-confirmed','--pixels','--repetitions'].includes(key))throw Error('Unknown argument '+key);
if(args.get('--idle-confirmed')!==true)throw Error('Requires --idle-confirmed outside timed model intervals');
const count=Number(args.get('--pixels')??8192),repetitions=Number(args.get('--repetitions')??3),side=448,n=side*side,begin=1234,end=begin+count;
if(!Number.isInteger(count)||count<512||end>n||!Number.isInteger(repetitions)||repetitions<2||repetitions>10)throw Error('Bounded kernel recipe required');
const sha=v=>createHash('sha256').update(v).digest('hex'),view=v=>new Uint8Array(v.buffer,v.byteOffset,v.byteLength);
const build=JSON.parse(await readFile(path.join(out,'build.json'),'utf8')),parity=JSON.parse(await readFile(path.join(out,'parity.json'),'utf8'));
if(build.status!=='compiled-experimental-unqualified'||parity.status!=='passed-small-corpus-bit-parity')throw Error('Small exact parity prerequisite not met');
const pins=JSON.parse(await readFile(path.join(root,'vendor/d2prl/PINNED.json'),'utf8'));
for(const[name,spec]of Object.entries(pins.builds['evaluator-tiled'].files)){const b=await readFile(path.join(root,'vendor/d2prl',name));if(b.length!==spec.bytes||sha(b)!==spec.sha256)throw Error('Vendor identity differs');}
for(const[name,spec]of Object.entries(build.files)){const b=await readFile(path.join(out,name));if(b.length!==spec.bytes||sha(b)!==spec.sha256)throw Error('Experimental artifact identity differs');}
const variants=['vendor','control','cache-original','rotation-bases','combined','pixel-major-combined'],modules={};
for(const name of variants)modules[name]=await(await import(pathToFileURL(name==='vendor'?path.join(root,'vendor/d2prl/evaluator-tiled.js'):path.join(out,name+'.js')).href)).default();
const records=[],layouts=[],halfBits=[0,0x8000,1,0x03ff,0x0400,0x2c00,0x3555,0x3800,0x3c00,0xbc00,0xb555,0x4200];
let exact=true;
for(const channels of [36,96])for(const candidates of [5,13]){
 const chw=Uint16Array.from({length:channels*n},(_,i)=>halfBits[(Math.imul(i+19,1103515245)>>>16)%halfBits.length]);
 const started=performance.now(),hwc=new Uint16Array(chw.length);
 for(let c=0;c<channels;c++)for(let pixel=0;pixel<n;pixel++)hwc[pixel*channels+c]=chw[c*n+pixel];
 layouts.push({channels,candidates,bytes:chw.byteLength,transposeMs:performance.now()-started});
 const x=new Float32Array(candidates*count),y=new Float32Array(candidates*count);
 for(let k=0;k<candidates;k++)for(let j=0;j<count;j++){const i=begin+j,at=k*count+j;x[at]=Math.fround(((Math.imul(k*n+i+3,1664525)>>>0)%((side+2)*17))/17-1-i%side);y[at]=Math.fround(((Math.imul(k*n+i+11,22695477)>>>0)%((side+2)*13))/13-1-Math.floor(i/side));}
 const inputs=[sha(view(chw)),sha(view(hwc)),sha(view(x)),sha(view(y))],owned={};
 for(const name of variants){const m=modules[name],pointers=[],alloc=bytes=>{const p=m._malloc(bytes);if(!p)throw Error('Microbenchmark heap allocation refused');pointers.push(p);return p;};
  const features=name==='pixel-major-combined'?hwc:chw,f=alloc(features.byteLength),xp=alloc(candidates*512*4),yp=alloc(candidates*512*4),op=alloc(2*512*4);m.HEAPU8.set(view(features),f);owned[name]={m,f,xp,yp,op,pointers};}
 let oracle;
 try{for(let repetition=0;repetition<repetitions;repetition++){
  const order=repetition%2?[...variants].reverse():variants;
  for(const name of order){const{m,f,xp,yp,op}=owned[name],rx=new Float32Array(count),ry=new Float32Array(count);let kernelMs=0,copyMs=0;const totalStarted=performance.now();
   for(let at=0;at<count;at+=512){const size=Math.min(512,count-at);let stamp=performance.now();for(let k=0;k<candidates;k++){m.HEAPF32.set(x.subarray(k*count+at,k*count+at+size),xp/4+k*size);m.HEAPF32.set(y.subarray(k*count+at,k*count+at+size),yp/4+k*size);}copyMs+=performance.now()-stamp;
    stamp=performance.now();if(m._d2prl_evaluate_tile(f,xp,yp,side,channels,candidates,begin+at,begin+at+size,op,op+size*4,8)!==1)throw Error('Microbenchmark kernel refused');kernelMs+=performance.now()-stamp;
    stamp=performance.now();rx.set(m.HEAPF32.subarray(op/4,op/4+size),at);ry.set(m.HEAPF32.subarray(op/4+size,op/4+size*2),at);copyMs+=performance.now()-stamp;}
   const totalMs=performance.now()-totalStarted,hashes=[sha(view(rx)),sha(view(ry))];if(name==='vendor'&&!oracle)oracle=hashes;
   const bitIdenticalToVendor=!!oracle&&hashes.every((h,i)=>h===oracle[i]);exact&&=bitIdenticalToVendor;records.push({channels,candidates,repetition,variant:name,count,begin,end,kernelMs,copyMs,totalMs,hashes,bitIdenticalToVendor,heapCapacityBytes:m.HEAPU8.length});
  }
 }}finally{for(const value of Object.values(owned))for(const p of value.pointers)value.m._free(p);}
 if(JSON.stringify(inputs)!==JSON.stringify([sha(view(chw)),sha(view(hwc)),sha(view(x)),sha(view(y))]))throw Error('Borrowed inputs mutated');
}
const median=values=>{const v=[...values].sort((a,b)=>a-b),mid=Math.floor(v.length/2);return v.length%2?v[mid]:(v[mid-1]+v[mid])/2;};
const summary=[];for(const channels of [36,96])for(const candidates of [5,13])for(const variant of variants){const rows=records.filter(r=>r.channels===channels&&r.candidates===candidates&&r.variant===variant),times=rows.map(r=>r.kernelMs),baseline=records.filter(r=>r.channels===channels&&r.candidates===candidates&&r.variant==='vendor').map(r=>r.kernelMs);summary.push({channels,candidates,variant,medianKernelMs:median(times),minKernelMs:Math.min(...times),maxKernelMs:Math.max(...times),kernelReductionVsVendor:1-median(times)/median(baseline),bitIdenticalToVendor:rows.every(r=>r.bitIdenticalToVendor)});}
const report={schema:1,status:exact?'passed-exact-kernel-measurement':'rejected-divergence',scope:'Synthetic448 descriptor banks, selected global512 ranges; no40-iteration inference, model/raw/decision or end-to-end speed qualification. Scalar native workers are measured sequentially in Node, not browser parallelism.',compiler:build.compiler,buildFiles:build.files,oracle:pins.builds['evaluator-tiled'],repetitions,layouts,summary,records,activation:false};
await writeFile(path.join(out,'kernel-benchmark.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,summary,activation:false}));if(!exact)process.exitCode=1;
