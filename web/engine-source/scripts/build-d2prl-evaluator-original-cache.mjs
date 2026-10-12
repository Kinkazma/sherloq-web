// Experimental code artifact only. No vendor file, pin, weight or corpus is
// overwritten. Prepare during other work; compile only in an explicitly idle
// interval with --build --idle-confirmed and an EXISTING compiler.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const exec=promisify(execFile),root=fileURLToPath(new URL('../',import.meta.url));
const out=path.join(root,'.build/evaluator-cache-original'),source=path.join(root,'experiments/d2prl');
const sha=v=>createHash('sha256').update(v).digest('hex');
const flags=new Map(process.argv.slice(2).map(arg=>{const at=arg.indexOf('=');return at<0?[arg,true]:[arg.slice(0,at),arg.slice(at+1)];}));
if(flags.has('--help')){
 console.log('Prepare: node scripts/build-d2prl-evaluator-original-cache.mjs\nCompile when idle: append --build --idle-confirmed --compiler=/absolute/existing/em++\nNo downloads/installations. Five ordinary scalar WASM modules (same-compiler control, cache-original, rotation-bases, combined, pixel-major-combined), one compiler worker, no benchmarks. Outputs only ignored .build/evaluator-cache-original. A local SDK6 build is experimental; vendor4.0.15 remains the oracle and is never replaced.');
 process.exit(0);
}
for(const key of flags.keys())if(!['--build','--idle-confirmed','--compiler'].includes(key))throw Error('Unknown argument '+key);
for(const key of ['--build','--idle-confirmed'])if(flags.has(key)&&flags.get(key)!==true)throw Error(key+' must be a bare boolean flag');
if(flags.has('--build')&&(!flags.has('--idle-confirmed')||!path.isAbsolute(String(flags.get('--compiler')??''))))throw Error('Compilation requires --build --idle-confirmed --compiler=/absolute/existing/em++');
const pins=JSON.parse(await readFile(path.join(root,'vendor/d2prl/PINNED.json'),'utf8')),original=await readFile(path.join(source,'evaluator.cpp'),'utf8'),tiled=await readFile(path.join(source,'evaluator-tiled.cpp'),'utf8'),exp=await readFile(path.join(source,'reference-exp.h'));
for(const[name,value]of [['evaluator.cpp',original],['evaluator-tiled.cpp',tiled],['reference-exp.h',exp]])if(sha(value)!==pins.builds['evaluator-tiled'].sources[name])throw Error('Original pinned source differs: '+name);
const replaceOnce=(text,before,after)=>{if(text.split(before).length!==2)throw Error('Expected exactly one transform boundary: '+before);return text.replace(before,after);};
function cacheOriginal(text){
 let candidate=replaceOnce(text,'float values[96],scores[13],expv[13];','float original_values[96],values[96],scores[13],expv[13];');
 candidate=replaceOnce(candidate,'for(int i=begin;i<end;i++) {int x=i%side,y=i/side;float extent=(side-1)*0.5f;','for(int i=begin;i<end;i++) {int x=i%side,y=i/side;float extent=(side-1)*0.5f;\n  // Immutable descriptors: decode the original pixel once. Candidate sampling,\n  // half rounding, reduction order, trace and global tail indices are unchanged.\n  for(int c=0;c<channels;c++)original_values[c]=fromhalf(features[c*n+i]);');
 candidate=replaceOnce(candidate,'half(fromhalf(plane[i])-values[c])','half(original_values[c]-values[c])');
 return replaceOnce(candidate,'half(fromhalf(features[c*n+i])-values[other])','half(original_values[c]-values[other])');
}
function rotationBases(text){
 let candidate=replaceOnce(text,'int n=side*side,group=channels/3;','int n=side*side,group=channels/3;\n // channels=3*group and 0<=j<group: the original per-channel rotation modulo\n // is exactly this group base plus j. All floating-point operations stay ordered.\n int rotation_bases[9];for(int shift=0;shift<3;shift++)for(int block=0;block<3;block++)rotation_bases[shift*3+block]=((block-shift+3)%3)*group;');
 candidate=replaceOnce(candidate,'for(int shift=0;shift<3;shift++)for(int block=0;block<3;block++){float sum=0;','for(int shift=0;shift<3;shift++)for(int block=0;block<3;block++){float sum=0;const int other_base=rotation_bases[shift*3+block];');
 return replaceOnce(candidate,'other=(c-shift*group+channels)%channels','other=other_base+j');
}
function pixelMajor(text){
 let candidate=replaceOnce(text,'const H* plane=features+c*n;','');
 for(const index of ['y0*side+x0','y0*side+x1','y1*side+x0','y1*side+x1'])candidate=replaceOnce(candidate,'fromhalf(plane['+index+'])','fromhalf(features[D2PRL_FEATURE_AT(c,n,'+index+')])');
 candidate=replaceOnce(candidate,'features[c*n+i]','features[D2PRL_FEATURE_AT(c,n,i)]');
 return'// Internal descriptor layout only: raw Uint16 channel-major input must be\n// permuted to pixel-major HWC before this kernel. Trace remains channel-major.\n#define D2PRL_FEATURE_AT(c,n,i) ((i)*channels+(c))\n'+candidate+'\nextern "C" EMSCRIPTEN_KEEPALIVE int d2prl_descriptor_layout() { return 1; }\n';
}
const variants={'cache-original':cacheOriginal(original),'rotation-bases':rotationBases(original),combined:rotationBases(cacheOriginal(original)),'pixel-major-combined':pixelMajor(rotationBases(cacheOriginal(original)))};
await mkdir(out,{recursive:true});
const candidateSources={};for(const[name,text]of Object.entries(variants)){const cpp=name+'.cpp',wrapper=replaceOnce(tiled,'#include "evaluator.cpp"','#include "'+cpp+'"');await writeFile(path.join(out,cpp),text);await writeFile(path.join(out,name+'-tiled.cpp'),wrapper);candidateSources[cpp]=sha(text);candidateSources[name+'-tiled.cpp']=sha(wrapper);}
const report={schema:1,status:'prepared-not-compiled',scope:'Four isolated experimental exact-arithmetic candidates with an unchanged same-compiler control; no production activation or performance claim.',variants:Object.keys(variants).map(name=>({name,precision:'experimental-exact-candidate',descriptorLayout:name==='pixel-major-combined'?'HWC-uint16':'CHW-uint16',activation:false})),originalSources:pins.builds['evaluator-tiled'].sources,candidateSources,oracle:pins.builds['evaluator-tiled'].files,semantics:'cache-original decodes each original pixel once; rotation-bases computes nine integer group bases before pixels; combined applies both; pixel-major-combined additionally replaces only descriptor memory indexing with a raw Uint16 permutation. Original descriptors must remain immutable/nonaliasing with outputs/trace. Every half operation, candidate/channel order, global reference-thread tail and trace field remains unchanged.',layoutContract:{external:'CHW-uint16 unchanged',pixelMajor:'target[pixel*channels+channel] = input[channel*n+pixel], exact original half bits, no floating conversion',workerFeasibility:'May transpose incoming CHW byte chunks directly into the one existing descriptor pointer, using chunk global element offsets. Channel/pixel cursors and output index increment by channels avoid division per half. No extra complete descriptor bank required.',qualification:'Worker upload path not implemented here. Possible locality benefit and transpose cost both unmeasured.'},sourceOperationCounts:{originalPixelDecodesPerPixel:'3 * channels * candidates (plus trace k=0)',cachedOriginalPixelDecodesPerPixel:'channels',neighborDecodes:'unchanged: up to4 * channels * candidates',originalRotationModuloPerPixel:'3 * channels * candidates',rotationBaseModuloPerInvocation:9},qualification:'Uncompiled and unqualified. No gain inferred from source counts or memory layout.'};
await writeFile(path.join(out,'build.json'),JSON.stringify(report,null,2)+'\n');
if(!flags.has('--build')){console.log(JSON.stringify({status:report.status,out,qualification:report.qualification}));process.exit(0);}
const compiler=String(flags.get('--compiler')),cache=path.join(out,'compiler-cache');
const env={...process.env,EM_CACHE:cache,EMCC_CORES:'1',BINARYEN_CORES:'1',EMSDK_SKIP_UPDATE_CHECK:'1'};
const version=(await exec(compiler,['--version'],{env,maxBuffer:1024**2})).stdout.split('\n')[0];
if(!/Emscripten.*(?:4\.0\.15|6\.0\.11)/.test(version))throw Error('Only observed existing4.0.15 or experimental6.0.11 compiler accepted');
report.compiler=version;report.compilerPolicy='One EMCC/Binaryen worker and one linker thread; isolated artifact cache. Missing SDK system libraries may require local rebuilding; no download/install is authorized.';
const common=['-std=c++17','-O3','-ffp-contract=off','-Wl,--threads=1','-I'+source,'-ffile-prefix-map='+root+'/=',
 '-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node','-sFILESYSTEM=0','-sALLOW_MEMORY_GROWTH=1',
 '-sINITIAL_MEMORY=16777216','-sMAXIMUM_MEMORY=536870912','-sMEMORY_GROWTH_LINEAR_STEP=16777216',
 '-sEXPORTED_FUNCTIONS=["_malloc","_free","_d2prl_evaluate_tile"]','-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAPF32"]'];
try{
 for(const[name,file]of [['control',path.join(source,'evaluator-tiled.cpp')],...Object.keys(variants).map(name=>[name,path.join(out,name+'-tiled.cpp')])]){
  const args=[file,...common,'-o',path.join(out,name+'.js')];report[name+'Command']=[compiler,...args];
  const result=await exec(compiler,args,{env,maxBuffer:4*1024**2});if(result.stderr)console.error(result.stderr);
 }
 report.files={};for(const name of ['control',...Object.keys(variants)].flatMap(name=>[name+'.js',name+'.wasm'])){const value=await readFile(path.join(out,name));report.files[name]={bytes:value.length,sha256:sha(value)};}
 report.status='compiled-experimental-unqualified';report.qualification='Run the small pinned-vendor/control/candidate parity recipe before any activation or time claim.';
}catch(error){report.status='compile-failed-unqualified';report.error=error.message;throw error;}
finally{await writeFile(path.join(out,'build.json'),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({status:report.status,compiler:version,out,files:report.files}));
