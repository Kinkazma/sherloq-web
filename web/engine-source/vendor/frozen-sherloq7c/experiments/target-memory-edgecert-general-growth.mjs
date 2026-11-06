// Synchronous page admission is required by Emscripten's resize_heap import.
// No async reclaim is attempted while native code is on the stack.
import proof from './target-memory-edgecert-general-growth-proof.mjs';
const PAGE=65536,INITIAL=16777216;
const fail=(code,message,details)=>Object.assign(new Error(message),{code,details});
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
const verifications=new WeakMap();let binary;
export function verifiedGrowthBinary(factory){
 if(verifications.has(factory))return verifications.get(factory);
 const verification=Promise.resolve().then(async()=>{
  const url=new URL('./target-memory-edgecert-general-kernel.wasm',import.meta.url);
  const bytes=await(binary??=url.protocol==='file:'?(async()=>new Uint8Array(await(await import('node:fs/promises')).readFile(url)))():(async()=>new Uint8Array(await(await fetch(url)).arrayBuffer()))());
  let wasmSha256,factorySha256;
  try{[wasmSha256,factorySha256]=await Promise.all([hash(bytes),hash(new TextEncoder().encode(factory.toString()))]);}
  catch(error){return{bytes,verified:false,reason:'Runtime growth-proof hashing is unavailable: '+String(error)};}
  const verified=proof.directMemoryGrowInstructions===0&&proof.loaderGrowthCalls===1&&wasmSha256===proof.wasmSha256&&factorySha256===proof.factorySha256;
  return{bytes,verified,wasmSha256,factorySha256,reason:verified?null:'The loaded binary/factory does not match the no-direct-growth proof.'};
 });
 verifications.set(factory,verification);return verification;
}
export function createFundedMemory({maximumBytes,reserve,signal,mode='dynamic',onGrow}={}){
 if(!Number.isSafeInteger(maximumBytes)||maximumBytes<INITIAL||maximumBytes>2**32||maximumBytes%PAGE||!['dynamic','fixed'].includes(mode))throw fail('INVALID_INPUT','Invalid funded WASM memory plan.');
 let memory,nativeGrow,latched,closed=false,retiring=false,reserved=0,peak=0,effectiveMode=mode;
 const leases=new Set(),stats={requestedMode:mode,effectiveMode:mode,growthAttempts:0,successfulGrowths:0,policyRefusals:0,physicalRefusals:0,rolledBackBytes:0};
 const admit=bytes=>{const free=reserve?.(bytes)??(()=>{});reserved+=bytes;peak=Math.max(peak,reserved);let live=true;const release=()=>{if(!live)return;free();live=false;reserved-=bytes;leases.delete(release);};leases.add(release);return release;};
 const cancelled=()=>fail('CANCELLED','WASM growth cancelled.');
 const check=()=>{if(closed||retiring)throw fail('DISPOSED','WASM memory is retiring or closed.');if(signal?.aborted)throw cancelled();if(latched)throw latched;};
 const dispose=()=>{if(closed)return;retiring=true;memory=null;nativeGrow=null;onGrow=null;let firstError,failed=false;for(const release of [...leases])try{release();}catch(error){if(!failed)firstError=error;failed=true;}if(failed)throw firstError;closed=true;};
 const rollback=(release,bytes,error)=>{latched=error;if(release)try{release();stats.rolledBackBytes+=bytes;}catch(cleanupError){if(error&&typeof error==='object'&&Object.isExtensible(error))error.cleanupError=cleanupError;}return error;};
 try{
  check();admit(mode==='fixed'?maximumBytes:INITIAL);check();
  try{memory=new WebAssembly.Memory({initial:INITIAL/PAGE,maximum:maximumBytes/PAGE});}catch(cause){if(!(cause instanceof RangeError))throw cause;throw fail('MEMORY_ALLOCATION','WASM initial memory allocation failed.',{allocationKind:'wasm',requestedBytes:INITIAL,maximumBytes,cause:String(cause)});}
  nativeGrow=memory.grow.bind(memory);
  const grow=pages=>{
   try{check();}catch(error){latched=error;throw error;}
   if(!Number.isSafeInteger(pages)||pages<0)throw fail('INVALID_INPUT','Invalid WASM page growth.');
   const oldBytes=memory.buffer.byteLength,delta=pages*PAGE;stats.growthAttempts++;
   if(oldBytes+delta>maximumBytes){latched=fail('MEMORY_ALLOCATION','WASM growth exceeds admitted maximum.',{allocationKind:'wasm',requestedBytes:delta,currentBytes:oldBytes,maximumBytes});throw latched;}
   let release;
   try{if(effectiveMode==='dynamic'&&delta)release=admit(delta);}catch(error){stats.policyRefusals++;latched=signal?.aborted?cancelled():error;throw latched;}
   // Reserve() may synchronously observe or request cancellation.
   if(signal?.aborted)throw rollback(release,delta,cancelled());
   let previous;
   try{previous=nativeGrow(pages);}catch(cause){stats.physicalRefusals++;throw rollback(release,delta,signal?.aborted?cancelled():cause instanceof RangeError?fail('MEMORY_ALLOCATION','WASM page growth allocation failed.',{allocationKind:'wasm',requestedBytes:delta,currentBytes:oldBytes,maximumBytes,cause:String(cause)}):cause);}
   stats.successfulGrowths++;
   try{onGrow?.(memory.buffer.byteLength);}catch(error){latched=error;throw error;}
   return previous;
  };
  try{Object.defineProperty(memory,'grow',{value:grow,configurable:true,writable:true});}
  catch(error){if(mode==='dynamic'){admit(maximumBytes-INITIAL);effectiveMode=stats.effectiveMode='fixed';stats.fallback='Cannot intercept this memory instance growth.';}}
  return{get memory(){return memory;},checkFailure:check,dispose,stats(){return{...stats,reservedBytes:reserved,peakReservedBytes:peak,materializedBytes:memory?.buffer.byteLength??0,maximumBytes};}};
 }catch(error){try{dispose();}catch(cleanupError){const reported=error&&typeof error==='object'&&Object.isExtensible(error)?error:fail(error?.code??'MEMORY_ALLOCATION',String(error),{cause:error});reported.cleanupError=cleanupError;reported.retryCleanup=dispose;throw reported;}throw error;}
}
