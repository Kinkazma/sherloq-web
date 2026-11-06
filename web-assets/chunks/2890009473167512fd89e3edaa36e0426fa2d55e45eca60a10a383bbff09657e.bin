#!/usr/bin/env node
// Rebuild only on explicit --build. --check never modifies product artifacts.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const options={mode:'check',root:path.resolve(here,'..'),emxx:process.env.SHERLOQ_EMXX||'em++',wasmDis:process.env.SHERLOQ_WASM_DIS||null,python:process.env.PYTHON||'python3',variant:'all'};
const valueOptions={'--root':'root','--emxx':'emxx','--wasm-dis':'wasmDis','--python':'python','--variant':'variant'};
for(let i=2;i<process.argv.length;i++){
 const arg=process.argv[i];
 if(['--check','--build','--plan'].includes(arg))options.mode=arg.slice(2);
 else if(arg==='--help'){console.log('node integration/build-native.mjs [--check|--plan|--build] [--root DIR] [--emxx EXECUTABLE] [--wasm-dis EXECUTABLE] [--python EXECUTABLE] [--variant all|ringcert|ringcert-general]');process.exit(0);}
 else if(valueOptions[arg]){assert(process.argv[i+1],`Missing value for ${arg}`);options[valueOptions[arg]]=process.argv[++i];}
 else throw Error(`Unknown argument: ${arg}`);
}
options.root=path.resolve(options.root);
const registry=JSON.parse(await fs.readFile(path.join(here,'native-build-registry.json'),'utf8'));
assert(Number(process.versions.node.split('.')[0])>=registry.minimumNodeMajor,`Node ${registry.minimumNodeMajor}+ required`);
const variants=registry.variants.filter(v=>options.variant==='all'||v.name===options.variant);
assert(variants.length,'Unknown variant');
const at=relative=>path.join(options.root,relative);
const sha=data=>createHash('sha256').update(data).digest('hex');
const run=(exe,args)=>{const result=spawnSync(exe,args,{encoding:'utf8',stdio:['ignore','pipe','pipe']});if(result.error)throw result.error;if(result.status!==0)throw Error(`${path.basename(exe)} failed (${result.status})\n${result.stdout}\n${result.stderr}`);return result.stdout+result.stderr;};
const executable=async name=>{
 if(path.isAbsolute(name)||name.includes(path.sep)){await fs.access(name);return path.resolve(name);}
 for(const dir of (process.env.PATH||'').split(path.delimiter)){const p=path.join(dir,name);try{await fs.access(p);return p;}catch{}}
 throw Error(`Executable not found: ${name}`);
};
// Fail closed if the registry no longer matches the commands that built D.
for(const variant of variants){
 for(const source of [variant.source,...variant.headers,variant.buildScript,variant.proofScript])await fs.access(at(source));
 const script=(await fs.readFile(at(variant.buildScript),'utf8')).replace(/\\\n/g,' ');
 const command=script.split('"$task_emcc" ')[1]?.split('\n\ntask_emcc_path')[0];
 assert(command,'Unexpected native build script format');
 const quoted=/"(?:[^"\\]|\\.)*"|'[^']*'|[^\s]+/g;
 const args=[...command.matchAll(quoted)].map(m=>m[0].replace(/^(['"])(.*)\1$/s,'$2').replace(/'([^']*)'/g,'$1'));
 assert.deepEqual(args.slice(1,args.indexOf('-o')),registry.compilerFlags,`Flags drift: ${variant.name}`);
 assert.equal(args[0],`$task_root/${path.basename(variant.source)}`);
 assert.equal(args.at(-1),`$task_root/${path.basename(variant.loader)}`);
}
// Recompute local source/build provenance without trusting proof metadata.
async function nativeSourceProvenance(variant){
 const queue=[variant.source],seen=new Set(),files=[];
 while(queue.length){
  const relative=queue.pop(),absolute=path.resolve(options.root,relative),portable=path.relative(options.root,absolute).split(path.sep).join('/');
  assert(portable&&!portable.startsWith('../')&&!path.isAbsolute(portable),'Native include escapes portable source root');assert.notEqual(path.basename(portable),'AGENTS.md');
  if(seen.has(portable))continue;seen.add(portable);const bytes=await fs.readFile(absolute);files.push({path:portable,sha256:sha(bytes),bytes:bytes.byteLength});
  const text=bytes.toString('utf8').replace(/\/\*[\s\S]*?\*\//g,'');for(const line of text.split('\n')){const include=/^\s*#\s*include\s*"([^"]+)"/.exec(line);if(include)queue.push(path.posix.join(path.posix.dirname(portable),include[1]));}
 }
 files.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);const closure=files.map(file=>`${file.path}\0${file.sha256}\0${file.bytes}\n`).join('');
 return{schema:1,source:variant.source,files,closureSha256:sha(closure),registrySha256:sha(await fs.readFile(at('integration/native-build-registry.json'))),compilerFlags:registry.compilerFlags,buildScriptSha256:sha(await fs.readFile(at(variant.buildScript))),proofScriptSha256:sha(await fs.readFile(at(variant.proofScript)))};
}
let emxx,wasmDis;
if(options.mode==='build'){
 emxx=await executable(options.emxx);
 const version=run(emxx,['--version']);
 assert(new RegExp(`\\b${registry.emscriptenVersion.replaceAll('.','\\.')}\\b`).test(version),`Expected Emscripten ${registry.emscriptenVersion}`);
 wasmDis=await executable(options.wasmDis||path.resolve(path.dirname(emxx),'../bin/wasm-dis'));
 await executable(options.python);
}
const rows=[];
for(const variant of variants){
 const compilerArgs=[at(variant.source),...registry.compilerFlags,'-o',at(variant.loader)];
 if(options.mode==='plan'){
  rows.push({variant:variant.name,compiler:options.emxx,arguments:compilerArgs,proofCommand:[options.python,'-E',at(variant.proofScript),'--wasm-dis',options.wasmDis||'<matching emsdk upstream/bin/wasm-dis>']});continue;
 }
 if(options.mode==='build'){
  process.stderr.write(`Building ${variant.name}\n`);process.stderr.write(run(emxx,compilerArgs));
  // -E ignores PYTHONOPTIMIZE, preserving the assertions in the proof scripts.
  process.stderr.write(run(options.python,['-E',at(variant.proofScript),'--wasm-dis',wasmDis]));
 }
 const [wasm,loader,wat,proofText]=await Promise.all([fs.readFile(at(variant.wasm)),fs.readFile(at(variant.loader),'utf8'),fs.readFile(at(variant.disassembly),'utf8'),fs.readFile(at(variant.proofJson),'utf8')]);
 const proof=JSON.parse(proofText),factoryText=loader.slice(0,loader.lastIndexOf('export default Module;')).trim();
 assert(loader.trimEnd().endsWith('export default Module;'));
 assert.equal(sha(wasm),proof.wasmSha256);assert.equal(sha(loader),proof.loaderSha256);assert.equal(sha(factoryText),proof.factorySha256);assert.equal(sha(wat),proof.disassemblySha256);
 assert.equal(proof.compiler,`Emscripten ${registry.emscriptenVersion}`);
 assert.deepEqual(proof.sourceProvenance,await nativeSourceProvenance(variant),'Native source/build provenance is absent or stale; rebuild both kernel and proof.');
 assert.equal(proof.directMemoryGrowInstructions,0);assert.equal(proof.importedMemories,1);assert.equal(proof.loaderGrowthCalls,1);
 assert(!/\bmemory\.grow\b/.test(wat));assert.equal((wat.match(/\(import[^\n]*\(memory\b/g)||[]).length,1);assert(!/^\s*\(memory\s/m.test(wat));
 assert.equal((loader.match(/\.grow\s*\(/g)||[]).length,1);assert.equal(loader.split('wasmMemory.grow(pages)').length-1,1);assert(!/\.prototype\.grow|grow\.call|grow\.apply/.test(loader));
 const moduleProof=(await import(pathToFileURL(at(variant.proofModule)).href)).default;
 assert.deepEqual(moduleProof,proof);
 const compiled=await WebAssembly.compile(wasm);
 assert.equal(WebAssembly.Module.imports(compiled).filter(x=>x.kind==='memory').length,1);
 const factory=(await import(pathToFileURL(at(variant.loader)).href)).default;
 const memory=new WebAssembly.Memory({initial:registry.initialMemoryPages,maximum:registry.maximumMemoryPages});
 const module=await factory({wasmMemory:memory,wasmBinary:wasm});
 for(const name of registry.exportedFunctions)assert.equal(typeof module[name],'function',`Missing export ${name}`);
 for(const name of registry.exportedRuntimeMethods){assert(ArrayBuffer.isView(module[name]),`Missing typed view ${name}`);assert.equal(module[name].buffer,memory.buffer);}
 // Allocation-free invalid-dimension smoke: proves JS bindings reach the WASM API.
 assert.equal(module._tm_create(0,1,16777216,8),0);
 module._tm_destroy(0);
 rows.push({variant:variant.name,wasmSha256:proof.wasmSha256,exportsChecked:registry.exportedFunctions.length,heapViewsChecked:registry.exportedRuntimeMethods.length,growthProofVerified:true,smoke:true});
}
console.log(JSON.stringify({ok:true,mode:options.mode,version:registry.versionLabel,rows},null,2));
