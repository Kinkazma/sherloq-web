// Prepare by default. Compilation is an explicitly idle, isolated experiment.
// The qualified HWC artifacts, vendor files, model and corpus are read-only.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const exec=promisify(execFile),root=fileURLToPath(new URL('../',import.meta.url));
const base=path.join(root,'.build/evaluator-cache-original'),out=path.join(root,'.build/evaluator-half-table');
const sha=v=>createHash('sha256').update(v).digest('hex');
const args=new Map(process.argv.slice(2).map(arg=>{const at=arg.indexOf('=');return at<0?[arg,true]:[arg.slice(0,at),arg.slice(at+1)];}));
if(args.has('--help')){console.log('Prepare only: node scripts/build-d2prl-evaluator-half-table.mjs\nAfter the active model benchmark ENDS: append --build --idle-confirmed --compiler=/absolute/existing/em++\nOutputs only .build/evaluator-half-table. Same-SDK HWC control and descriptor-read decode-table candidate; no vendor, model, corpus or existing artifact is changed.');process.exit(0);}
for(const key of args.keys())if(!['--build','--idle-confirmed','--compiler'].includes(key))throw Error('Unknown argument '+key);
for(const key of ['--build','--idle-confirmed'])if(args.has(key)&&args.get(key)!==true)throw Error(key+' must be a bare boolean flag');
if(args.has('--build')&&(args.get('--idle-confirmed')!==true||!path.isAbsolute(String(args.get('--compiler')??''))))throw Error('Compilation requires --build --idle-confirmed --compiler=/absolute/existing/em++');
const build=JSON.parse(await readFile(path.join(base,'build.json'),'utf8')),parity=JSON.parse(await readFile(path.join(base,'parity.json'),'utf8'));
if(build.status!=='compiled-experimental-unqualified'||parity.status!=='passed-small-corpus-bit-parity'||!parity.variants.find(v=>v.name==='pixel-major-combined'&&v.bitIdenticalToVendor&&v.bitIdenticalToSameCompilerControl&&v.descriptorLayout==='HWC-uint16'))throw Error('Qualified HWC source prerequisite missing');
const original=await readFile(path.join(base,'pixel-major-combined.cpp'),'utf8'),wrapper=await readFile(path.join(base,'pixel-major-combined-tiled.cpp'),'utf8');
if(sha(await readFile(path.join(root,'experiments/d2prl/reference-exp.h')))!==build.originalSources['reference-exp.h'])throw Error('Pinned exponential source identity differs');
for(const[name,value]of [['pixel-major-combined.cpp',original],['pixel-major-combined-tiled.cpp',wrapper]])if(sha(value)!==build.candidateSources[name])throw Error('Qualified HWC source identity differs: '+name);
for(const suffix of ['.js','.wasm']){const file='pixel-major-combined'+suffix,value=await readFile(path.join(base,file));if(sha(value)!==parity.buildFiles[file].sha256||value.length!==parity.buildFiles[file].bytes)throw Error('Qualified HWC artifact identity differs');}
const replaceOnce=(s,before,after)=>{if(s.split(before).length!==2)throw Error('Expected one transform boundary: '+before);return s.replace(before,after);};
const table=String.raw`
// Descriptor reads only. Internal half(float) rounding keeps its original
// fromhalf implementation; this table never participates in that conversion.
static float descriptor_decode_table[65536];
static bool descriptor_decode_ready=false;
inline void initialize_descriptor_decode_table() {
 if(descriptor_decode_ready)return;
 for(uint32_t bits=0;bits<65536;bits++)descriptor_decode_table[bits]=fromhalf(H(bits));
 descriptor_decode_ready=true;
}
inline float descriptor_fromhalf(H bits) { return descriptor_decode_table[bits]; }
extern "C" EMSCRIPTEN_KEEPALIVE void d2prl_descriptor_decode_initialize() { initialize_descriptor_decode_table(); }
// Raw-bit probe includes NaN signs/payloads without arithmetic. Product inputs
// reject exponent31; finite values, subnormals and both zero signs must match.
extern "C" EMSCRIPTEN_KEEPALIVE int d2prl_descriptor_decode_bits(uint32_t* output,int use_table) {
 if(!output||(use_table!=0&&use_table!=1))return 0;
 initialize_descriptor_decode_table();
 for(uint32_t bits=0;bits<65536;bits++){float value=use_table?descriptor_fromhalf(H(bits)):fromhalf(H(bits));std::memcpy(output+bits,&value,4);}
 return 1;
}
`;
let candidate=replaceOnce(original,'inline float half(float x) {',table+'\ninline float half(float x) {');
let replacements=0;
candidate=candidate.replace(/fromhalf\(features\[D2PRL_FEATURE_AT\(c,n,([^\n]+?)\)\]\)/g,(_match,index)=>{replacements++;return'descriptor_fromhalf(features[D2PRL_FEATURE_AT(c,n,'+index+')])';});
if(replacements!==5)throw Error('Exactly original pixel + four bilinear descriptor reads required');
candidate=replaceOnce(candidate,'int n=side*side,group=channels/3;','initialize_descriptor_decode_table();\n int n=side*side,group=channels/3;');
// Verify the entire half(float) rounding body is unchanged, including fromhalf
// calls used for fp16 quantization of arithmetic results.
const halfBody=s=>s.slice(s.indexOf('inline float half(float x) {'),s.indexOf('extern "C" EMSCRIPTEN_KEEPALIVE float d2prl_softmax_probe'));
if(halfBody(candidate)!==halfBody(original))throw Error('Internal half rounding changed');
await mkdir(out,{recursive:true});
const sources={'control.cpp':original,'half-table.cpp':candidate,'control-tiled.cpp':replaceOnce(wrapper,'#include "pixel-major-combined.cpp"','#include "control.cpp"'),'half-table-tiled.cpp':replaceOnce(wrapper,'#include "pixel-major-combined.cpp"','#include "half-table.cpp"')};
for(const[name,value]of Object.entries(sources))await writeFile(path.join(out,name),value);
const report={schema:1,status:'prepared-not-compiled',scope:'Isolated HWC descriptor-decode lookup experiment; same-compiler HWC control. Existing qualified HWC/vendored oracle is untouched.',descriptorLayout:'HWC-uint16',activation:false,base:{compiler:build.compiler,sources:build.candidateSources,files:Object.fromEntries(['.js','.wasm'].map(suffix=>['pixel-major-combined'+suffix,parity.buildFiles['pixel-major-combined'+suffix]])),paritySha256:sha(await readFile(path.join(base,'parity.json')))},candidateSources:Object.fromEntries(Object.entries(sources).map(([name,value])=>[name,sha(value)])),table:{entries:65536,floatBytes:4,staticBytes:262144,initialization:'once per module, original fromhalf for every Uint16 pattern, after range validation',backing:'inside the existing declared WASM heap; not a separate full descriptor bank',finiteGuard:'existing descriptor validation rejects (halfBits & 0x7c00) == 0x7c00; signs and subnormal/zero bits remain allowed',nanGuard:'raw-bit decode probe compares every NaN sign/payload without arithmetic; nonfinite descriptors remain rejected by the unchanged engine guard'},semantics:'Only five descriptor fromhalf read sites change. half(float), sampling order, fp16 quantization, reference-exp, softmax, reductions, global indices, traces and RNG stay unchanged.',performance:'Unmeasured. Lookup may save integer branches/bit conversion but introduces dependent loads into a256KiB table, larger than typical L1. Compiler CSE and descriptor-value locality can change the balance. First-use initialization is reported separately; no gain inferred from source.',qualification:'Prepare only; no compilation, parity run, timing or activation yet.'};
await writeFile(path.join(out,'build.json'),JSON.stringify(report,null,2)+'\n');
if(!args.has('--build')){console.log(JSON.stringify({status:report.status,out,replacements,tableBytes:report.table.staticBytes,activation:false}));process.exit(0);}
const compiler=String(args.get('--compiler')),env={...process.env,EM_CACHE:path.join(base,'compiler-cache'),EMCC_CORES:'1',BINARYEN_CORES:'1',EMSDK_SKIP_UPDATE_CHECK:'1'};
const version=(await exec(compiler,['--version'],{env,maxBuffer:1024**2})).stdout.split('\n')[0];
if(version!==build.compiler)throw Error('Exact same observed SDK compiler required for table/control attribution');
report.compiler=version;
const common=['-std=c++17','-O3','-ffp-contract=off','-Wl,--threads=1','-I'+path.join(root,'experiments/d2prl'),'-ffile-prefix-map='+root+'/=','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node','-sFILESYSTEM=0','-sALLOW_MEMORY_GROWTH=1','-sINITIAL_MEMORY=16777216','-sMAXIMUM_MEMORY=536870912','-sMEMORY_GROWTH_LINEAR_STEP=16777216','-sEXPORTED_FUNCTIONS=["_malloc","_free","_d2prl_evaluate_tile"]','-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAPF32"]'];
try{
 for(const name of ['control','half-table']){const command=[path.join(out,name+'-tiled.cpp'),...common,'-o',path.join(out,name+'.js')];report[name+'Command']=[compiler,...command];const result=await exec(compiler,command,{env,maxBuffer:4*1024**2});if(result.stderr)console.error(result.stderr);}
 report.files={};for(const name of ['control','half-table'].flatMap(name=>[name+'.js',name+'.wasm'])){const value=await readFile(path.join(out,name));report.files[name]={bytes:value.length,sha256:sha(value)};}
 report.status='compiled-experimental-unqualified';report.qualification='Decode bit-probe plus native output/trace parity and measured gain versus existing HWC required before any model experiment.';
}catch(error){report.status='compile-failed-unqualified';report.error=error.message;throw error;}
finally{await writeFile(path.join(out,'build.json'),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({status:report.status,out,files:report.files,activation:false}));
