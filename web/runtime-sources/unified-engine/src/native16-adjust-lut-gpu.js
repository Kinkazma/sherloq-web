import "../../runtime-context.js?v=0.33.3";
import {EngineError,requireValue,checkAbort} from './errors.js';
import {createGpuAttemptArray,gpuRetirementFailure} from './gpu-attempt-retirement.js';

export const NATIVE16_ADJUST_LUT_TABLE_BYTES=65536*2;
// Same six bindings and Shape as the existing separation native16 owner.
// The LUT and source are word-exact; no floating-point colour/tone operation
// or host fallback is performed by this program. RGB16 transport is tight:
// adjacent channel codes share u32 words, including across pixel boundaries.
export const native16AdjustLutShader=`
@group(0) @binding(0) var<storage,read> source:array<u32>;
@group(0) @binding(1) var<storage,read_write> output:array<u32>;
struct Shape {width:u32,height:u32,start:u32,rows:u32,masked:u32,originX:u32,nativeWidth:u32,count:u32};
@group(0) @binding(2) var<uniform> p:Shape;
@group(0) @binding(3) var<storage,read> table:array<u32>;
@group(0) @binding(4) var<storage,read> membership:array<u32>;
@group(0) @binding(5) var<storage,read_write> scratch:array<u32>;
fn lookup(code:u32)->u32{return (table[code>>1u]>>((code&1u)*16u))&65535u;}
fn sourceCode(code:u32)->u32{return (source[code>>1u]>>((code&1u)*16u))&65535u;}
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid:vec3<u32>){
 let count=p.width*p.rows*3u;
 // Existing dispatch remains ceil(pixels/64). Four codes per invocation need
 // at most that many threads. Guard before gid*4 to keep large extents safe.
 if(gid.x>=(count-1u)/4u+1u){return;}
 let code=gid.x*4u;let at=p.start*p.width*3u+code;let word=code>>1u;
 var first=lookup(sourceCode(at));
 if(code+1u<count){first=first|(lookup(sourceCode(at+1u))<<16u);}
 output[word]=first;
 if(code+2u<count){
  var second=lookup(sourceCode(at+2u));
  if(code+3u<count){second=second|(lookup(sourceCode(at+3u))<<16u);}
  output[word+1u]=second;
 }
}`;

// Shared by the consuming owner's real buffer allocation and admission. The
// program's host table is retained separately and is never a per-band copy.
export function native16AdjustLutLayout(width,height,rows){
 const n=width*height,total=width*rows;
 requireValue([width,height,rows,n,total].every(Number.isSafeInteger)&&width>0&&height>0&&rows>0&&rows<=height&&n*3<=0xffffffff&&total*3<=0xffffffff,'Invalid native16 adjustment LUT window.');
 const sourceBytes=Math.ceil(n*6/4)*4,outputBytes=Math.ceil(total*6/4)*4;
 requireValue(Number.isSafeInteger(sourceBytes)&&Number.isSafeInteger(outputBytes),'Native16 adjustment LUT transport extent is unsafe.');
 return{n,total,transport:'rgb16-tight',hostPackedBytes:sourceBytes,hostOutputBytes:total*6,hostTableBytes:NATIVE16_ADJUST_LUT_TABLE_BYTES,
  buffers:{source:sourceBytes,output:outputBytes,shape:32,table:NATIVE16_ADJUST_LUT_TABLE_BYTES,membership:4,scratch:4,readback:outputBytes}};
}
export const NATIVE16_ADJUST_LUT_PROGRAM=Object.freeze({id:'adjust-lut16-rgb16-tight',shader:native16AdjustLutShader,tableBytes:NATIVE16_ADJUST_LUT_TABLE_BYTES,passes:Object.freeze(['main']),layout:native16AdjustLutLayout});
export function native16AdjustLutProgramPlan(){return{known:true,id:NATIVE16_ADJUST_LUT_PROGRAM.id,tableBytes:NATIVE16_ADJUST_LUT_PROGRAM.tableBytes,hostTableBytes:NATIVE16_ADJUST_LUT_TABLE_BYTES,tableEntries:NATIVE16_ADJUST_LUT_TABLE_BYTES/4,codeCount:65536,codeDepth:16,packedCodesPerWord:2,passes:NATIVE16_ADJUST_LUT_PROGRAM.passes};}

/** Immutable internal program owned by the enclosing adjustment producer.
 * The shared prefix GPU owner borrows table only during runNativeProgram;
 * it caches id+shader, never this table. Dispose after its attempt ACK (also
 * on cancellation/NACK), before retiring the source LUT/producer owner. */
export function createNative16AdjustLutProgram(lut,{budget,signal,onOwner}={}){
 requireValue(lut instanceof Uint16Array&&lut.length===65536&&budget?.reserve,'A financed native16 adjustment LUT is required.');checkAbort(signal);
 const packed=createGpuAttemptArray(Uint32Array,32768,{budget,owner:'native16-adjust',label:'packed-native16-adjust-lut'});
 let closed=false;
 const program={...NATIVE16_ADJUST_LUT_PROGRAM,budget,
  get table(){if(closed)throw new EngineError('DISPOSED','Native16 adjustment LUT program is retired.');return packed.data;},
  dispose(){if(closed)return;try{packed.release();closed=true;}catch(error){throw gpuRetirementFailure(error,program,error);}}
 };
 onOwner?.(program);
 try{const table=packed.allocate();for(let i=0;i<table.length;i++)table[i]=lut[i*2]|(lut[i*2+1]<<16);checkAbort(signal);return Object.freeze(program);}
 catch(error){try{program.dispose();}catch(cleanup){throw gpuRetirementFailure(error,program,cleanup);}throw error;}
}
