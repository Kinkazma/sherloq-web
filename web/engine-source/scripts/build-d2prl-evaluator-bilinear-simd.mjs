// Separate experimental interpolation artifacts only. Preparation never invokes
// a compiler; compilation requires an explicit idle assertion and existing SDK.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const MiB=1024**2,exec=promisify(execFile),root=fileURLToPath(new URL('../',import.meta.url));
const source=path.join(root,'experiments/d2prl'),base=path.join(root,'.build/evaluator-cache-original'),out=path.join(root,'.build/evaluator-bilinear-simd');
const sha=value=>createHash('sha256').update(value).digest('hex');
const args=new Map(process.argv.slice(2).map(arg=>{const at=arg.indexOf('=');return at<0?[arg,true]:[arg.slice(0,at),arg.slice(at+1)];}));
if(args.has('--help')){console.log('Prepare only: node scripts/build-d2prl-evaluator-bilinear-simd.mjs\nCompile AFTER orchestrator macro-done signal: append --build --idle-confirmed --compiler=/absolute/existing/em++\nReads pinned original sources and separately qualified HWC baseline; changes only neighbor decoding/interpolation in new .build/evaluator-bilinear-simd. No runtime/vendor/assets overwritten, no benchmarks or activation.');process.exit(0);}
for(const key of args.keys())if(!['--build','--idle-confirmed','--compiler'].includes(key))throw Error('Unknown argument '+key);
for(const key of ['--build','--idle-confirmed'])if(args.has(key)&&args.get(key)!==true)throw Error(key+' must be a bare boolean flag');
if(args.has('--build')&&(!args.has('--idle-confirmed')||!path.isAbsolute(String(args.get('--compiler')??''))))throw Error('Requires --build --idle-confirmed --compiler=/absolute/existing/em++ after macro timing ends');
const pins=JSON.parse(await readFile(path.join(root,'vendor/d2prl/PINNED.json'),'utf8')),baseBuild=JSON.parse(await readFile(path.join(base,'build.json'),'utf8')),baseParity=JSON.parse(await readFile(path.join(base,'parity.json'),'utf8'));
const original=await readFile(path.join(source,'evaluator.cpp'),'utf8'),tiled=await readFile(path.join(source,'evaluator-tiled.cpp'),'utf8'),exp=await readFile(path.join(source,'reference-exp.h'));
for(const [name,value]of [['evaluator.cpp',original],['evaluator-tiled.cpp',tiled],['reference-exp.h',exp]])if(sha(value)!==pins.builds['evaluator-tiled'].sources[name]||baseBuild.originalSources[name]!==pins.builds['evaluator-tiled'].sources[name])throw Error('Original pinned source differs: '+name);
if(baseBuild.status!=='compiled-experimental-unqualified'||baseParity.status!=='passed-small-corpus-bit-parity'||!baseParity.variants.find(value=>value.name==='pixel-major-combined'&&value.bitIdenticalToVendor))throw Error('A separately built HWC baseline with small exact parity is required');
const hwc=await readFile(path.join(base,'pixel-major-combined.cpp'),'utf8');if(sha(hwc)!==baseBuild.candidateSources['pixel-major-combined.cpp'])throw Error('HWC source identity differs');
const replaceOnce=(text,before,after)=>{if(text.split(before).length!==2)throw Error('Expected exactly one transform boundary: '+before);return text.replace(before,after);};
const before=`   for(int c=0;c<channels;c++) {float s=0;
    if(x0>=0&&x0<side&&y0>=0&&y0<side)s+=fromhalf(features[D2PRL_FEATURE_AT(c,n,y0*side+x0)])*nw;
    if(x1>=0&&x1<side&&y0>=0&&y0<side)s+=fromhalf(features[D2PRL_FEATURE_AT(c,n,y0*side+x1)])*ne;
    if(x0>=0&&x0<side&&y1>=0&&y1<side)s+=fromhalf(features[D2PRL_FEATURE_AT(c,n,y1*side+x0)])*sw;
    if(x1>=0&&x1<side&&y1>=0&&y1<side)s+=fromhalf(features[D2PRL_FEATURE_AT(c,n,y1*side+x1)])*se;
    values[c]=half(s);if(k==0){log(1,c*n+i,values[c]);log(2,c*n+i,-std::abs(half(original_values[c]-values[c])));}
   }`;
const after=`   // Four independent channels; each lane retains the original positive-zero
   // accumulator and NW, NE, SW, SE multiply/add order. No horizontal reduction.
   // Accepted channel counts 36 and96 are both divisible by four.
   for(int c=0;c<channels;c+=4) {
    v128_t s=wasm_f32x4_splat(0.f);
    if(x0>=0&&x0<side&&y0>=0&&y0<side)s=wasm_f32x4_add(s,wasm_f32x4_mul(d2prl_neighbor_half4(features+D2PRL_FEATURE_AT(c,n,y0*side+x0)),wasm_f32x4_splat(nw)));
    if(x1>=0&&x1<side&&y0>=0&&y0<side)s=wasm_f32x4_add(s,wasm_f32x4_mul(d2prl_neighbor_half4(features+D2PRL_FEATURE_AT(c,n,y0*side+x1)),wasm_f32x4_splat(ne)));
    if(x0>=0&&x0<side&&y1>=0&&y1<side)s=wasm_f32x4_add(s,wasm_f32x4_mul(d2prl_neighbor_half4(features+D2PRL_FEATURE_AT(c,n,y1*side+x0)),wasm_f32x4_splat(sw)));
    if(x1>=0&&x1<side&&y1>=0&&y1<side)s=wasm_f32x4_add(s,wasm_f32x4_mul(d2prl_neighbor_half4(features+D2PRL_FEATURE_AT(c,n,y1*side+x1)),wasm_f32x4_splat(se)));
    alignas(16) float sampled[4];wasm_v128_store(sampled,s);
    for(int lane=0;lane<4;lane++){const int channel=c+lane;values[channel]=half(sampled[lane]);if(k==0){log(1,channel*n+i,values[channel]);log(2,channel*n+i,-std::abs(half(original_values[channel]-values[channel])));}}
   }`;
const scalarDecoder=`inline v128_t d2prl_neighbor_half4(const H* bits) {
 return wasm_f32x4_make(fromhalf(bits[0]),fromhalf(bits[1]),fromhalf(bits[2]),fromhalf(bits[3]));
}
`;
const normalDecoder=`inline v128_t d2prl_neighbor_half4(const H* bits) {
 const v128_t h=wasm_u32x4_extend_low_u16x8(wasm_v128_load64_zero(bits));
 const v128_t exponent=wasm_v128_and(wasm_u32x4_shr(h,10),wasm_i32x4_splat(31));
 const v128_t mantissa=wasm_v128_and(h,wasm_i32x4_splat(1023));
 const v128_t zeroExponent=wasm_i32x4_eq(exponent,wasm_i32x4_splat(0));
 const v128_t subnormal=wasm_v128_and(zeroExponent,wasm_i32x4_ne(mantissa,wasm_i32x4_splat(0)));
 if(wasm_v128_any_true(wasm_v128_or(subnormal,wasm_i32x4_eq(exponent,wasm_i32x4_splat(31)))))
  return wasm_f32x4_make(fromhalf(bits[0]),fromhalf(bits[1]),fromhalf(bits[2]),fromhalf(bits[3]));
 const v128_t sign=wasm_i32x4_shl(wasm_v128_and(h,wasm_i32x4_splat(0x8000)),16);
 const v128_t normal=wasm_v128_or(sign,wasm_v128_or(wasm_i32x4_shl(wasm_i32x4_add(exponent,wasm_i32x4_splat(112)),23),wasm_i32x4_shl(mantissa,13)));
 // Normal and signed-zero bit expansion is integer-only. Every subnormal,
 // infinity and NaN quad above uses the unchanged scalar decoder.
 return wasm_v128_bitselect(sign,normal,zeroExponent);
}
`;
const scalarProbe=`\n// Test-only raw decoder probe; the model evaluator never calls this export.
extern "C" EMSCRIPTEN_KEEPALIVE void d2prl_bilinear_decode4(const H* bits,int count,float* output) {
 for(int i=0;i<count;i++)output[i]=fromhalf(bits[i]);
}\n`;
const vectorProbe=`\n// Test-only raw decoder probe; the model evaluator never calls this export.
extern "C" EMSCRIPTEN_KEEPALIVE void d2prl_bilinear_decode4(const H* bits,int count,float* output) {
 int i=0;for(;i+4<=count;i+=4)wasm_v128_store(output+i,d2prl_neighbor_half4(bits+i));
 for(;i<count;i++)output[i]=fromhalf(bits[i]);
}\n`;
function vectorVariant(decoder){let result=replaceOnce(hwc,'#include <cstring>','#include <cstring>\n#include <wasm_simd128.h>');result=replaceOnce(result,'inline float half(float x) {',decoder+'inline float half(float x) {');return replaceOnce(result,before,after)+vectorProbe;}
const variants={'hwc-control':hwc+scalarProbe,'bilinear-simd4-scalar':vectorVariant(scalarDecoder),'bilinear-simd4-normal':vectorVariant(normalDecoder)};
await mkdir(out,{recursive:true});const candidateSources={};
for(const [name,text]of Object.entries(variants)){const file=name+'.cpp',wrapper=replaceOnce(tiled,'#include "evaluator.cpp"','#include "'+file+'"');await writeFile(path.join(out,file),text);await writeFile(path.join(out,name+'-tiled.cpp'),wrapper);candidateSources[file]=sha(text);candidateSources[name+'-tiled.cpp']=sha(wrapper);}
const report={schema:1,status:'prepared-not-compiled',scope:'Isolated four-channel descriptor interpolation only; no current HWC artifact/runtime/vendor replacement or activation.',originalSources:pins.builds['evaluator-tiled'].sources,baselineSource:{file:'pixel-major-combined.cpp',sha256:sha(hwc)},baselineFiles:baseBuild.files,baselineParity:{status:baseParity.status,cases:baseParity.cases},candidateSources,variants:Object.keys(variants).map(name=>({name,descriptorLayout:'HWC-uint16',precision:'experimental-exact-candidate',activation:false})),oracle:pins.builds['evaluator-tiled'].files,semantics:'Only independent neighbor interpolation channels are grouped by four. Explicit SIMD mul then add retains NW/NE/SW/SE order and positive-zero initial sums. Store each vector then apply original scalar half and trace in ascending channel order. Cached original pixels, differences, all nine means, ordered j reductions, score half, scalar/vector softmax, global native tails and final offsets remain byte-for-byte source-identical. No FMA, relaxed SIMD, fast-math, horizontal reduction, half arithmetic approximation or complete descriptor staging bank.',decoder:'scalar variant uses original fromhalf four times; normal variant expands normal/zero raw bits by integer SIMD and falls back for any subnormal/exponent31 lane. Decoder probes are test-only exports.',qualification:'Uncompiled and unqualified. Raw decoder bits, native traces/global tails, real worker transport and complete three raw model outputs/decisions must pass before any gain claim. Reject if additional end-to-end gain is below5%.'};
await writeFile(path.join(out,'build.json'),JSON.stringify(report,null,2)+'\n');
if(!args.has('--build')){console.log(JSON.stringify({status:report.status,out,variants:report.variants,activation:false}));process.exit(0);}
const compiler=String(args.get('--compiler')),env={...process.env,EM_CACHE:path.join(out,'compiler-cache'),EMCC_CORES:'1',BINARYEN_CORES:'1',EMSDK_SKIP_UPDATE_CHECK:'1'};
const version=(await exec(compiler,['--version'],{env,maxBuffer:MiB})).stdout.split('\n')[0];
if(!/Emscripten.*(?:4\.0\.15|6\.0\.11)/.test(version))throw Error('Only observed existing4.0.15 or experimental6.0.11 compiler accepted');
const common=['-std=c++17','-O3','-ffp-contract=off','-fno-vectorize','-fno-slp-vectorize','-msimd128','-Wl,--threads=1','-I'+source,'-ffile-prefix-map='+root+'/=',
 '-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node','-sFILESYSTEM=0','-sALLOW_MEMORY_GROWTH=1','-sINITIAL_MEMORY=16777216','-sMAXIMUM_MEMORY=536870912','-sMEMORY_GROWTH_LINEAR_STEP=16777216',
 '-sEXPORTED_FUNCTIONS=["_malloc","_free","_d2prl_evaluate_tile","_d2prl_bilinear_decode4"]','-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAPF32"]'];
report.compiler=version;report.compilerPolicy='One EMCC/Binaryen worker and linker thread, separate compiler cache, no installation/download.';
try{for(const name of Object.keys(variants)){const command=[path.join(out,name+'-tiled.cpp'),...common,'-o',path.join(out,name+'.js')];report[name+'Command']=[compiler,...command];const result=await exec(compiler,command,{env,maxBuffer:4*MiB});if(result.stderr)console.error(result.stderr);}
 report.files={};for(const name of Object.keys(variants).flatMap(name=>[name+'.js',name+'.wasm'])){const value=await readFile(path.join(out,name));report.files[name]={bytes:value.length,sha256:sha(value)};}
 report.status='compiled-experimental-unqualified';report.qualification='Run raw decoder/native trace parity before any timing; full model output/decision and end-to-end gain remain required.';
}catch(error){report.status='compile-failed-unqualified';report.error=error.message;throw error;}finally{await writeFile(path.join(out,'build.json'),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({status:report.status,out,compiler:version,files:report.files,activation:false}));
