// Separate combined experiment, never modifying qualified table/HWC/SIMD files.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const exec=promisify(execFile),root=fileURLToPath(new URL('../',import.meta.url)),out=path.join(root,'.build/evaluator-table-simd'),tableRoot=path.join(root,'.build/evaluator-half-table'),simdRoot=path.join(root,'.build/evaluator-bilinear-simd'),hwcRoot=path.join(root,'.build/evaluator-cache-original');
const sha=v=>createHash('sha256').update(v).digest('hex');
const args=new Map(process.argv.slice(2).map(arg=>{const at=arg.indexOf('=');return at<0?[arg,true]:[arg.slice(0,at),arg.slice(at+1)];}));
if(args.has('--help')){console.log('Prepare: node scripts/build-d2prl-evaluator-table-simd.mjs\nCompile when idle: append --build --idle-confirmed --compiler=/absolute/existing/em++\nQualified table baseline plus qualified four-channel SIMD interpolation, with table-made vectors or exact normal-SIMD/table fallback. Outputs only .build/evaluator-table-simd; no activation or gain claim.');process.exit(0);}
for(const key of args.keys())if(!['--build','--idle-confirmed','--compiler'].includes(key))throw Error('Unknown option '+key);
for(const key of ['--build','--idle-confirmed'])if(args.has(key)&&args.get(key)!==true)throw Error(key+' must be a bare flag');
if(args.has('--build')&&(args.get('--idle-confirmed')!==true||!path.isAbsolute(String(args.get('--compiler')??''))))throw Error('Build needs --idle-confirmed and absolute existing compiler');
async function qualified(directory){const build=JSON.parse(await readFile(path.join(directory,'build.json'),'utf8')),parity=JSON.parse(await readFile(path.join(directory,'parity.json'),'utf8'));if(build.status!=='compiled-experimental-unqualified'||parity.status!=='passed-small-corpus-bit-parity')throw Error('Qualified precursor required: '+directory);for(const[name,spec]of Object.entries(build.files)){const value=await readFile(path.join(directory,name));if(value.length!==spec.bytes||sha(value)!==spec.sha256||parity.buildFiles[name]?.sha256!==spec.sha256)throw Error('Precursor artifact identity differs');}return{build,parity};}
const table=await qualified(tableRoot),simd=await qualified(simdRoot),hwc=await qualified(hwcRoot);
if(table.build.compiler!==simd.build.compiler||table.build.compiler!==hwc.build.compiler)throw Error('Same SDK compiler required for combination');
if(sha(await readFile(path.join(root,'experiments/d2prl/reference-exp.h')))!==hwc.build.originalSources['reference-exp.h'])throw Error('Pinned exponential source differs');
async function source(directory,build,name){const value=await readFile(path.join(directory,name),'utf8');if(sha(value)!==build.candidateSources[name])throw Error('Qualified precursor source differs: '+name);return value;}
const original=await source(tableRoot,table.build,'half-table.cpp'),wrapper=await source(tableRoot,table.build,'half-table-tiled.cpp');
const replaceOnce=(s,before,after)=>{if(s.split(before).length!==2)throw Error('Expected one exact transform boundary: '+before);return s.replace(before,after);};
const interpolationStart=original.indexOf('   for(int c=0;c<channels;c++) {float s=0;'),interpolationEnd=original.indexOf('   float best=-INFINITY;',interpolationStart);
if(interpolationStart<0||interpolationEnd<0)throw Error('Scalar interpolation boundary absent');
const before=original.slice(interpolationStart,interpolationEnd);
const probe=String.raw`
// Test-only SIMD decoder bits, including misaligned inputs and scalar tails.
extern "C" EMSCRIPTEN_KEEPALIVE void d2prl_bilinear_decode4(const H* bits,int count,float* output) {
 initialize_descriptor_decode_table();
 int i=0;for(;i+4<=count;i+=4)wasm_v128_store(output+i,d2prl_neighbor_half4(bits+i));
 for(;i<count;i++)output[i]=descriptor_fromhalf(bits[i]);
}
`;
const controlProbe=String.raw`
extern "C" EMSCRIPTEN_KEEPALIVE void d2prl_bilinear_decode4(const H* bits,int count,float* output) {
 initialize_descriptor_decode_table();for(int i=0;i<count;i++)output[i]=descriptor_fromhalf(bits[i]);
}
`;
const variants={'table-control':original+controlProbe},transforms={};
for(const kind of ['scalar','normal']){
 const name='bilinear-simd4-'+kind,text=await source(simdRoot,simd.build,name+'.cpp'),start=text.indexOf('inline v128_t d2prl_neighbor_half4'),end=text.indexOf('inline float half(float x)',start);
 if(start<0||end<0)throw Error('Qualified SIMD helper boundary absent');
 let helper=text.slice(start,end),replacements=0;helper=helper.replace(/fromhalf\(bits\[([0-3])\]\)/g,(_s,lane)=>{replacements++;return'descriptor_fromhalf(bits['+lane+'])';});if(replacements!==4)throw Error('Expected exactly four decoder fallback/scalar lookup replacements');
 const a=text.indexOf('   // Four independent channels;'),b=text.indexOf('   float best=-INFINITY;',a);if(a<0||b<0)throw Error('Qualified SIMD interpolation boundary absent');
 const interpolation=text.slice(a,b);let candidate=replaceOnce(original,'#include <cstring>','#include <cstring>\n#include <wasm_simd128.h>');candidate=replaceOnce(candidate,'inline float half(float x)',helper+'inline float half(float x)');candidate=replaceOnce(candidate,before,interpolation)+probe;
 const halfBody=s=>s.slice(s.indexOf('inline float half(float x)'),s.indexOf('extern "C" EMSCRIPTEN_KEEPALIVE float d2prl_softmax_probe'));
 if(halfBody(candidate)!==halfBody(original))throw Error('Internal half rounding changed');
 if(!candidate.includes('original_values[c]=descriptor_fromhalf(features[D2PRL_FEATURE_AT(c,n,i)])'))throw Error('Original pixel decode must remain table-backed');
 const suffix=s=>s.slice(s.indexOf('   float best=-INFINITY;'),s.indexOf('extern "C" EMSCRIPTEN_KEEPALIVE int d2prl_descriptor_layout'));
 if(suffix(candidate)!==suffix(original))throw Error('Score/reduction/softmax/global-tail arithmetic changed');
 const variant='table-simd4-'+kind;variants[variant]=candidate;transforms[variant]={helperSource:name+'.cpp',helperSha256:sha(helper),interpolationSha256:sha(interpolation),tableReplacements:replacements};
}
await mkdir(out,{recursive:true});const candidateSources={};for(const[name,value]of Object.entries(variants)){const cpp=name+'.cpp',tiled=replaceOnce(wrapper,'#include "half-table.cpp"','#include "'+cpp+'"');await writeFile(path.join(out,cpp),value);await writeFile(path.join(out,name+'-tiled.cpp'),tiled);candidateSources[cpp]=sha(value);candidateSources[name+'-tiled.cpp']=sha(tiled);}
const report={schema:1,status:'prepared-not-compiled',scope:'Independent table+four-channel SIMD interpolation family. Reject unless faster than the qualified table-only baseline.',descriptorLayout:'HWC-uint16',activation:false,base:{tableFiles:table.build.files,tableSource:table.build.candidateSources['half-table.cpp'],hwcFiles:hwc.build.files,simdSources:simd.build.candidateSources},candidateSources,transforms,variants:Object.keys(variants).map(name=>({name,descriptorLayout:'HWC-uint16',precision:'experimental-exact-candidate',activation:false})),table:table.build.table,semantics:'Cached original descriptor decoding and all scalar-half quantization remain table baseline. The qualified SIMD interpolation keeps +0 accumulator, NW→NE→SW→SE explicit mul/add per independent channel, then scalar half/log in ascending lane order. Scalar decoder variant makes vectors from four table slots. Normal decoder variant uses exact integer expansion and table fallback for any subnormal/exponent31 quad. Score/reduction/softmax/global-tail source suffix is checked unchanged.',qualification:'No activation; decoder/traces/global tails and speed versus table-only required, followed by full-model raw/decision qualification for any retained candidate.'};
await writeFile(path.join(out,'build.json'),JSON.stringify(report,null,2)+'\n');if(!args.has('--build')){console.log(JSON.stringify({status:report.status,out,transforms,activation:false}));process.exit(0);}
const compiler=String(args.get('--compiler')),env={...process.env,EM_CACHE:path.join(simdRoot,'compiler-cache'),EMCC_CORES:'1',BINARYEN_CORES:'1',EMSDK_SKIP_UPDATE_CHECK:'1'},version=(await exec(compiler,['--version'],{env,maxBuffer:1024**2})).stdout.split('\n')[0];if(version!==table.build.compiler)throw Error('Exact qualified SDK required');report.compiler=version;
const common=['-std=c++17','-O3','-ffp-contract=off','-fno-vectorize','-fno-slp-vectorize','-msimd128','-Wl,--threads=1','-I'+path.join(root,'experiments/d2prl'),'-ffile-prefix-map='+root+'/=','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node','-sFILESYSTEM=0','-sALLOW_MEMORY_GROWTH=1','-sINITIAL_MEMORY=16777216','-sMAXIMUM_MEMORY=536870912','-sMEMORY_GROWTH_LINEAR_STEP=16777216','-sEXPORTED_FUNCTIONS=["_malloc","_free","_d2prl_evaluate_tile","_d2prl_bilinear_decode4"]','-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAPF32"]'];
try{for(const name of Object.keys(variants)){const command=[path.join(out,name+'-tiled.cpp'),...common,'-o',path.join(out,name+'.js')];report[name+'Command']=[compiler,...command];const result=await exec(compiler,command,{env,maxBuffer:4*1024**2});if(result.stderr)console.error(result.stderr);}report.files={};for(const name of Object.keys(variants).flatMap(n=>[n+'.js',n+'.wasm'])){const value=await readFile(path.join(out,name));report.files[name]={bytes:value.length,sha256:sha(value)};}report.status='compiled-experimental-unqualified';}
catch(error){report.status='compile-failed-unqualified';report.error=error.message;throw error;}finally{await writeFile(path.join(out,'build.json'),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({status:report.status,out,files:report.files,activation:false}));
