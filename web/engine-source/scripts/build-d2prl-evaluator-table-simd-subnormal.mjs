// Isolated exact subnormal decoder experiment. Prepare without compilation.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const exec=promisify(execFile),root=fileURLToPath(new URL('../',import.meta.url)),base=path.join(root,'.build/evaluator-table-simd'),out=path.join(root,'.build/evaluator-table-simd-subnormal');
const sha=value=>createHash('sha256').update(value).digest('hex'),variant='table-simd4-exact-subnormal';
const args=new Map(process.argv.slice(2).map(arg=>{const at=arg.indexOf('=');return at<0?[arg,true]:[arg.slice(0,at),arg.slice(at+1)];}));
if(args.has('--help')){console.log('Prepare: node scripts/build-d2prl-evaluator-table-simd-subnormal.mjs\nOnly AFTER active macro finishes: append --build --idle-confirmed --compiler=/absolute/existing/em++\nOutputs .build/evaluator-table-simd-subnormal only. Changes the qualified normal neighbor helper: exact SIMD subnormal expansion, exponent31 table fallback; cache-original/table/half/interpolation/reduction order preserved.');process.exit(0);}
for(const key of args.keys())if(!['--build','--idle-confirmed','--compiler'].includes(key))throw Error('Unknown option '+key);
for(const key of ['--build','--idle-confirmed'])if(args.has(key)&&args.get(key)!==true)throw Error(key+' must be a bare flag');
if(args.has('--build')&&(args.get('--idle-confirmed')!==true||!path.isAbsolute(String(args.get('--compiler')??''))))throw Error('Compile only in an explicitly idle interval with existing absolute compiler');
const build=JSON.parse(await readFile(path.join(base,'build.json'),'utf8')),parity=JSON.parse(await readFile(path.join(base,'parity.json'),'utf8'));
const referenceExpSha256=sha(await readFile(path.join(root,'experiments/d2prl/reference-exp.h')));
if(referenceExpSha256!=='63ec2b5a527d4429bbd1bfa1547cbbea440c097e02b1e4deab285b44fa60c24e')throw Error('Pinned exponential dependency differs');
if(build.status!=='compiled-experimental-unqualified'||parity.status!=='passed-small-corpus-bit-parity'||!parity.variants.find(value=>value.name==='table-simd4-normal'&&value.bitIdenticalToVendor&&value.bitIdenticalToSameCompilerControl))throw Error('Qualified normal/table baseline required');
for(const[name,spec]of Object.entries(build.files)){const value=await readFile(path.join(base,name));if(value.length!==spec.bytes||sha(value)!==spec.sha256||parity.buildFiles[name]?.sha256!==spec.sha256)throw Error('Qualified precursor artifact differs');}
async function source(name){const text=await readFile(path.join(base,name),'utf8');if(sha(text)!==build.candidateSources[name])throw Error('Qualified precursor source differs');return text;}
const original=await source('table-simd4-normal.cpp'),control=await source('table-control.cpp'),wrapper=await source('table-simd4-normal-tiled.cpp');
const begin=original.indexOf('inline v128_t d2prl_neighbor_half4'),end=original.indexOf('inline float half(float x)',begin);if(begin<0||end<0)throw Error('Qualified neighbor helper boundary absent');
const helper=String.raw`inline v128_t d2prl_neighbor_half4(const H* bits) {
 const v128_t h=wasm_u32x4_extend_low_u16x8(wasm_v128_load64_zero(bits));
 const v128_t exponent=wasm_v128_and(wasm_u32x4_shr(h,10),wasm_i32x4_splat(31));
 const v128_t mantissa=wasm_v128_and(h,wasm_i32x4_splat(1023));
 // Product descriptors reject exponent31. Preserve every infinity/NaN raw
 // payload and sign in the decoder probes by the already proved table path.
 if(wasm_v128_any_true(wasm_i32x4_eq(exponent,wasm_i32x4_splat(31))))
  return wasm_f32x4_make(descriptor_fromhalf(bits[0]),descriptor_fromhalf(bits[1]),descriptor_fromhalf(bits[2]),descriptor_fromhalf(bits[3]));
 const v128_t sign=wasm_i32x4_shl(wasm_v128_and(h,wasm_i32x4_splat(0x8000)),16);
 const v128_t normal=wasm_v128_or(sign,wasm_v128_or(wasm_i32x4_shl(wasm_i32x4_add(exponent,wasm_i32x4_splat(112)),23),wasm_i32x4_shl(mantissa,13)));
 const v128_t zeroExponent=wasm_i32x4_eq(exponent,wasm_i32x4_splat(0));
 const v128_t subnormalMask=wasm_v128_and(zeroExponent,wasm_i32x4_ne(mantissa,wasm_i32x4_splat(0)));
 // Normal/signed-zero quads keep the proven integer-only fast path.
 if(!wasm_v128_any_true(subnormalMask))return wasm_v128_bitselect(sign,normal,zeroExponent);
 // Reinterpret(0x3f000000|m) =0.5 +m*2^-24 for0<=m<=1023.
 // Subtracting0.5 is exact (Sterbenz; representable result). Apply the sign
 // only afterwards with integer OR so both zero signs are retained exactly.
 const v128_t magnitude=wasm_f32x4_sub(wasm_v128_or(wasm_i32x4_splat(0x3f000000),mantissa),wasm_f32x4_splat(0.5f));
 const v128_t signedSubnormal=wasm_v128_or(magnitude,sign);
 return wasm_v128_bitselect(signedSubnormal,normal,zeroExponent);
}
`;
const candidate=original.slice(0,begin)+helper+original.slice(end);
const halfBody=text=>text.slice(text.indexOf('inline float half(float x)'),text.indexOf('extern "C" EMSCRIPTEN_KEEPALIVE float d2prl_softmax_probe'));
if(halfBody(candidate)!==halfBody(original)||candidate.slice(candidate.indexOf('extern "C" EMSCRIPTEN_KEEPALIVE float d2prl_softmax_probe'))!==original.slice(original.indexOf('extern "C" EMSCRIPTEN_KEEPALIVE float d2prl_softmax_probe')))throw Error('Half/interpolation/reduction/softmax/global-tail source changed');
await mkdir(out,{recursive:true});const texts={'table-control.cpp':control,[variant+'.cpp']:candidate},candidateSources={};
for(const[name,text]of Object.entries(texts)){const tiled=wrapper.replace('#include "table-simd4-normal.cpp"','#include "'+name+'"');if(tiled===wrapper)throw Error('Wrapper transform boundary absent');await writeFile(path.join(out,name),text);await writeFile(path.join(out,name.replace('.cpp','-tiled.cpp')),tiled);candidateSources[name]=sha(text);candidateSources[name.replace('.cpp','-tiled.cpp')]=sha(tiled);}
const report={schema:1,status:'prepared-not-compiled',buildScript:'scripts/build-d2prl-evaluator-table-simd-subnormal.mjs',scope:'Exact SIMD descriptor subnormal decoding only. No production activation or speed claim.',descriptorLayout:'HWC-uint16',activation:false,compiler:build.compiler,referenceExpSha256,base:{...build.base,qualifiedNormalFiles:Object.fromEntries(['.js','.wasm'].map(suffix=>['table-simd4-normal'+suffix,build.files['table-simd4-normal'+suffix]]))},candidateSources,variants:['table-control',variant].map(name=>({name,descriptorLayout:'HWC-uint16',precision:'experimental-exact-candidate',activation:false})),table:build.table,helperSha256:sha(helper),semantics:'Only d2prl_neighbor_half4 changes. Normal bits remain integer-only; zero/subnorm magnitude uses exact f32 identity then integer sign injection; exponent31 quad falls back to existing table for all raw payloads. Cached originals still table-backed. Half(float), NW→NE→SW→SE SIMD mul/add, ascending scalar half/log lanes, all later score/reduction/softmax/global indices/RNG remain source-identical.',qualification:'All65536 raw patterns and mixed262147 lanes/unaligned/tails plus58 output/trace cases and native corpus required before any useful448 timing. Reject unless full exact current-HWC A/B improves every requested case by>=5%.'};
await writeFile(path.join(out,'build.json'),JSON.stringify(report,null,2)+'\n');if(!args.has('--build')){console.log(JSON.stringify({status:report.status,out,candidateSources,helperSha256:report.helperSha256,activation:false}));process.exit(0);}
const compiler=String(args.get('--compiler')),env={...process.env,EM_CACHE:path.join(root,'.build/evaluator-bilinear-simd/compiler-cache'),EMCC_CORES:'1',BINARYEN_CORES:'1',EMSDK_SKIP_UPDATE_CHECK:'1'},version=(await exec(compiler,['--version'],{env,maxBuffer:1024**2})).stdout.split('\n')[0];if(version!==build.compiler)throw Error('Exact qualified SDK required');
const common=build['table-controlCommand'].slice(2,-2);
try{for(const name of ['table-control',variant]){const command=[path.join(out,name+'-tiled.cpp'),...common,'-o',path.join(out,name+'.js')];report[name+'Command']=[compiler,...command];const result=await exec(compiler,command,{env,maxBuffer:4*1024**2});if(result.stderr)console.error(result.stderr);}report.files={};for(const name of ['table-control',variant].flatMap(name=>[name+'.js',name+'.wasm'])){const value=await readFile(path.join(out,name));report.files[name]={bytes:value.length,sha256:sha(value)};}report.status='compiled-experimental-unqualified';}
catch(error){report.status='compile-failed-unqualified';report.error=error.message;throw error;}finally{await writeFile(path.join(out,'build.json'),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({status:report.status,out,files:report.files,activation:false}));
