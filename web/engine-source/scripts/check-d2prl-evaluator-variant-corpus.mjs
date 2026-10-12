// Numerical qualification against EXISTING native corpora; never product work.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {softmaxStudy} from '../experiments/d2prl/softmax-study.js';
const root=fileURLToPath(new URL('../',import.meta.url)),out=path.join(root,'.build/evaluator-cache-original');
const args=new Map(process.argv.slice(2).map(arg=>{const at=arg.indexOf('=');return at<0?[arg,true]:[arg.slice(0,at),arg.slice(at+1)];}));
if(args.has('--help')){console.log('node scripts/check-d2prl-evaluator-variant-corpus.mjs --idle-confirmed --asset-root=/absolute/existing/web-engine [--variant=pixel-major-combined]\nVerifies generated native evaluator/thread corpora and exponential/softmax payload. No fixture, weight or production artifact is changed. Writes ignored experimental qualification JSON only.');process.exit(0);}
for(const key of args.keys())if(!['--idle-confirmed','--asset-root','--variant','--allow-missing-fixtures'].includes(key))throw Error('Unknown argument '+key);
const assetRoot=String(args.get('--asset-root')??''),variant=String(args.get('--variant')??'pixel-major-combined');
if(args.get('--idle-confirmed')!==true||!path.isAbsolute(assetRoot)||!['control','cache-original','rotation-bases','combined','pixel-major-combined'].includes(variant))throw Error('Explicit idle, existing absolute assets and candidate required');
const sha=v=>createHash('sha256').update(v).digest('hex'),build=JSON.parse(await readFile(path.join(out,'build.json'),'utf8'));
if(build.status!=='compiled-experimental-unqualified')throw Error('Compiled experimental build required');
for(const suffix of ['.js','.wasm']){const name=variant+suffix,b=await readFile(path.join(out,name)),pin=build.files[name];if(b.length!==pin.bytes||sha(b)!==pin.sha256)throw Error('Candidate identity differs');}
const module=await(await import(pathToFileURL(path.join(out,variant+'.js')).href)).default(),hwc=variant==='pixel-major-combined';
if((module._d2prl_descriptor_layout?.()??0)!==(hwc?1:0))throw Error('Candidate layout declaration differs');
const read=async(base,spec)=>{const file=path.resolve(base,spec.file);if(!file.startsWith(base+path.sep)||!Number.isSafeInteger(spec.bytes)||spec.bytes<1||!/^[0-9a-f]{64}$/.test(spec.sha256))throw Error('Pinned fixture extent');const bytes=await readFile(file);if(bytes.length!==spec.bytes||sha(bytes)!==spec.sha256)throw Error('Fixture identity '+spec.file);return bytes;};
const compare=(actual,expected)=>{const a=new Uint32Array(actual.buffer,actual.byteOffset,actual.length),b=new Uint32Array(expected.buffer,expected.byteOffset,expected.length);if(a.length!==b.length)throw Error('Output extent');let differentBits=0,maxAbsolute=0,signChanges=0;for(let i=0;i<a.length;i++){differentBits+=a[i]!==b[i];maxAbsolute=Math.max(maxAbsolute,Math.abs(actual[i]-expected[i]));signChanges+=(actual[i]>0)!==(expected[i]>0);}return{elements:a.length,differentBits,maxAbsolute,signChanges};};
const records=[],references=[],missing=[];
for(const file of ['reference.json','thread-reference.json']){
 const base=path.join(assetRoot,'.build/d2prl-evaluator-corpus'),refBytes=await readFile(path.join(base,file)),reference=JSON.parse(refBytes);references.push({file,sha256:sha(refBytes)});
 for(const row of reference.records){const channels=row.inputs.features.shape[1],n=row.side**2,pointers=[],alloc=bytes=>{const p=module._malloc(bytes);if(!p)throw Error('Qualification allocation refused');pointers.push(p);return p;};
  const specs=[row.inputs.features,row.inputs.offset_x,row.inputs.offset_y,row.outputs.x,row.outputs.y],reads=await Promise.allSettled(specs.map(spec=>read(base,spec)));
  const errors=reads.flatMap((r,i)=>r.status==='rejected'?[{error:r.reason,file:specs[i].file}]:[]);
  if(errors.length){const fatal=errors.find(r=>r.error.code!=='ENOENT');if(fatal)throw fatal.error;if(args.get('--allow-missing-fixtures')!==true)throw errors[0].error;missing.push({reference:file,name:row.name,side:row.side,files:errors.map(r=>r.file)});continue;}
  const [fb,xb,yb,xExpected,yExpected]=reads.map(r=>r.value);
  if(!Number.isInteger(row.side)||row.side<2||row.side>448||![36,96].includes(channels)||!Number.isInteger(row.candidates)||row.candidates<1||row.candidates>13||fb.length!==2*channels*n||xb.length!==4*row.candidates*n||yb.length!==xb.length||xExpected.length!==4*n||yExpected.length!==4*n)throw Error('Fixture dimensions differ');
  const input=new Uint16Array(fb.buffer,fb.byteOffset,fb.length/2);let features=input;
  if(hwc){features=new Uint16Array(input.length);for(let c=0;c<channels;c++)for(let i=0;i<n;i++)features[i*channels+c]=input[c*n+i];}
  try{const f=alloc(features.byteLength),x=alloc(xb.length),y=alloc(yb.length),result=alloc(8*n);module.HEAPU8.set(new Uint8Array(features.buffer,features.byteOffset,features.byteLength),f);module.HEAPU8.set(xb,x);module.HEAPU8.set(yb,y);
   if(module._d2prl_evaluate_tile(f,x,y,row.side,channels,row.candidates,0,n,result,result+4*n,row.referenceThreads??reference.threads??2)!==1)throw Error('Qualification kernel refused');
   records.push({reference:file,name:row.name,side:row.side,channels,candidates:row.candidates,referenceThreads:row.referenceThreads??reference.threads??2,x:compare(module.HEAPF32.subarray(result/4,result/4+n),new Float32Array(xExpected.buffer,xExpected.byteOffset,n)),y:compare(module.HEAPF32.subarray(result/4+n,result/4+2*n),new Float32Array(yExpected.buffer,yExpected.byteOffset,n))});
  }finally{for(const p of pointers)module._free(p);}
 }
}
const softmaxBase=path.join(assetRoot,'fixtures/d2prl'),softmaxRefBytes=await readFile(path.join(softmaxBase,'softmax.json')),softmaxRef=JSON.parse(softmaxRefBytes),compressedFile=path.resolve(softmaxBase,softmaxRef.payload.file);
if(!compressedFile.startsWith(softmaxBase+path.sep))throw Error('Softmax fixture path');
const compressed=await readFile(compressedFile),payload=gunzipSync(compressed);if(sha(compressed)!==softmaxRef.payload.compressedSha256||sha(payload)!==softmaxRef.payload.sha256)throw Error('Softmax payload identity');
const softmax=await softmaxStudy(module,softmaxRef,payload),exact=records.every(r=>r.x.differentBits===0&&r.y.differentBits===0)&&softmax.status==='passed';
const report={schema:1,status:exact?(missing.length?'passed-available-native-corpora':'passed-existing-native-corpora'):'rejected-divergence',scope:'Existing evaluator and reference-thread fixtures plus independent exponential/softmax native fixtures. Missing rows, when explicitly allowed, are excluded and listed. No complete40-iteration model inference or speed claim.',coverageComplete:missing.length===0,missing,variant,compiler:build.compiler,artifactFiles:Object.fromEntries(['.js','.wasm'].map(suffix=>[variant+suffix,build.files[variant+suffix]])),references,softmaxReferenceSha256:sha(softmaxRefBytes),evaluatorCases:records.length,evaluatorElements:records.reduce((n,r)=>n+r.x.elements+r.y.elements,0),softmax,records,activation:false};
await writeFile(path.join(out,variant+'-native-corpus-proof.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,coverageComplete:report.coverageComplete,missing:missing.length,evaluatorCases:report.evaluatorCases,evaluatorElements:report.evaluatorElements,softmax:softmax.records.map(r=>({kind:r.kind,candidates:r.candidates,elements:r.elements,different:r.different})),failed:records.filter(r=>r.x.differentBits||r.y.differentBits),activation:false}));if(!exact)process.exitCode=1;
