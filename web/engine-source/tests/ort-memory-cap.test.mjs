import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';

const root=new URL('../',import.meta.url),names=['ort-wasm-simd-threaded.mjs','ort-wasm-simd-threaded.asyncify.mjs'];

test('both pinned bootstraps propagate the owner cap to pthreads and the builder is idempotent',async()=>{
  for(const name of names){
    const source=await fs.readFile(new URL('vendor/m3-ort/'+name,root),'utf8');
    assert.equal((source.match(/4294901760/g)??[]).length,0);
    assert.match(source,/var __sherloqHeapMaximum=globalThis\.__m3MaximumWasmPages\*65536/);
    assert.match(source,/postMessage\(\{(?:Rb|\$c):"load",__sherloqHeapMaximum,/);
    assert.match(source,/__sherloqHeapMaximum=[dc]\.__sherloqHeapMaximum;/);
    const patched=execFileSync('python3',['-c','import sys;sys.path.insert(0,sys.argv[1]);from ort_memory_cap import admitted_growth;print(admitted_growth(sys.stdin.read(),sys.argv[2]),end="")',new URL('scripts/',root).pathname,name],{input:source,encoding:'utf8'});
    assert.equal(patched,source);
  }
});

test('a real ORT WASM allocation fits an admitted33MiB cap after fixing speculative growth, without enlarging the cap',async()=>{
  const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'sherloq-ort-memory-cap-'));
  try{
    const source=await fs.readFile(new URL('vendor/m3-ort/'+names[0],root),'utf8');
    const legacy=source.replace('return __sherloqHeapMaximum','return 4294901760').replace('__sherloqHeapMaximum<a','4294901760<a').replace('Math.min(__sherloqHeapMaximum,','Math.min(4294901760,');
    assert.equal((legacy.match(/4294901760/g)??[]).length,3);
    const oldPath=path.join(temporary,'legacy.mjs');await fs.writeFile(oldPath,legacy);
    const wasm=await fs.readFile(new URL('vendor/d2prl/ort-wasm-simd-threaded.wasm',root));
    const maxima=33*1024**2;globalThis.__m3MaximumWasmPages=maxima/65536;
    const createOld=(await import(pathToFileURL(oldPath))).default,createNew=(await import(new URL('vendor/m3-ort/'+names[0],root))).default;
    const results=[];
    for(const create of [createOld,createNew]){
      const runtime=await create({wasmBinary:wasm,numThreads:1});
      const first=runtime._malloc(25.5*1024**2);assert.ok(first);
      const second=runtime._malloc(1*1024**2);
      const rejected=runtime._malloc(4*1024**2);assert.equal(rejected,0);
      results.push({second,heapBytes:runtime.HEAPU8.byteLength});
      if(second)runtime._free(second);runtime._free(first);
    }
    assert.equal(results[0].second,0);assert.ok(results[1].second>0);assert.equal(results[1].heapBytes,maxima);
  }finally{delete globalThis.__m3MaximumWasmPages;await fs.rm(temporary,{recursive:true,force:true});}
});
