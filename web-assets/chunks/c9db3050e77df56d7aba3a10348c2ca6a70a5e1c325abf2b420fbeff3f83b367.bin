import "../../runtime-context.js?v=0.33.3";
import {EngineError,requireValue,checkAbort} from './errors.js';
import {createGpuAttemptArray,gpuRetirementFailure} from './gpu-attempt-retirement.js';

const LEVELS=65536,HEADER_WORDS=4,descriptors=new Map();
function variant(g){
 requireValue(g&&typeof g.channels==='boolean'&&typeof g.local==='boolean','Invalid native16 equalization GPU policy.');
 const tiles=g.local?g.tiles:1;
 requireValue(Number.isInteger(tiles)&&tiles>=(g.local?2:1)&&tiles<=16,'Invalid native16 equalization GPU tile grid.');
 return{channels:g.channels,local:g.local,tiles,count:g.channels?3:1};
}
function geometry(g){const v=variant(g),tileWidth=g.local?g.tileWidth:1,tileHeight=g.local?g.tileHeight:1;requireValue(Number.isFinite(tileWidth)&&tileWidth>0&&Number.isFinite(tileHeight)&&tileHeight>0&&Number.isFinite(Math.fround(tileWidth))&&Math.fround(tileWidth)>0&&Number.isFinite(Math.fround(tileHeight))&&Math.fround(tileHeight)>0,'Invalid native16 equalization GPU tile extent.');return Object.freeze({...v,tileWidth,tileHeight});}
function shaderFor({channels,local,tiles}){return `
@group(0) @binding(0) var<storage,read> source:array<u32>;
@group(0) @binding(1) var<storage,read_write> output:array<u32>;
struct Shape {width:u32,height:u32,start:u32,rows:u32,masked:u32,originX:u32,nativeWidth:u32,count:u32};
@group(0) @binding(2) var<uniform> p:Shape;
@group(0) @binding(3) var<storage,read> table:array<u32>;
@group(0) @binding(4) var<storage,read> membership:array<u32>;
@group(0) @binding(5) var<storage,read_write> scratch:array<u32>;
const TILES:u32=${tiles}u;
fn lookup(code:u32,channel:u32,tile:u32)->u32{
 let i=(channel*TILES*TILES+tile)*65536u+code;
 return (table[4u+(i>>1u)]>>((i&1u)*16u))&65535u;
}
fn even(value:f32)->u32{
 let a=floor(value);let d=value-a;
 let rounded=select(floor(value+0.5),a+f32(u32(a)&1u),d==0.5);
 return u32(clamp(rounded,0.0,65535.0));
}
fn mapLevel(code:u32,channel:u32,x:u32,y:u32)->u32{
 ${local?`let fx=f32(x)/bitcast<f32>(table[0u])-0.5;let fy=f32(y)/bitcast<f32>(table[1u])-0.5;
 let ix=i32(floor(fx));let iy=i32(floor(fy));let ax=fx-f32(ix);let ay=fy-f32(iy);
 let x0=u32(clamp(ix,0,i32(TILES)-1));let x1=u32(clamp(ix+1,0,i32(TILES)-1));
 let y0=u32(clamp(iy,0,i32(TILES)-1));let y1=u32(clamp(iy+1,0,i32(TILES)-1));
 let a=f32(lookup(code,channel,y0*TILES+x0));let b=f32(lookup(code,channel,y0*TILES+x1));
 let c=f32(lookup(code,channel,y1*TILES+x0));let d=f32(lookup(code,channel,y1*TILES+x1));
 let upper=a*(1.0-ax)+b*ax;let lower=c*(1.0-ax)+d*ax;
 return even(upper*(1.0-ay)+lower*ay);`:`return lookup(code,channel,0u);`}
}
// Source<=V and all codes<=65535: product+floor(V/2) fits u32.
// This is exactly floor(Source*next/V+0.5), without a float ratio.
fn ratio(code:u32,next:u32,value:u32)->u32{if(value==0u){return next;}return min(65535u,(code*next+(value>>1u))/value);}
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid:vec3<u32>){
 let pixel=gid.x;if(pixel>=p.width*p.rows){return;}
 let at=(p.start*p.width+pixel)*2u;let rg=source[at];let b=source[at+1u]&65535u;
 let r=rg&65535u;let g=rg>>16u;let x=p.originX+pixel%p.width;let y=p.count+p.start+pixel/p.width;
 ${channels?`let rr=mapLevel(r,0u,x,y);let gg=mapLevel(g,1u,x,y);let bb=mapLevel(b,2u,x,y);`:`let value=max(r,max(g,b));let next=mapLevel(value,0u,x,y);let rr=ratio(r,next,value);let gg=ratio(g,next,value);let bb=ratio(b,next,value);`}
 output[pixel*2u]=rr|(gg<<16u);output[pixel*2u+1u]=bb;
}`;}

/** Pure static variant: no table allocation, device, reservation or image. */
export function native16EqualizationGpuProgramDescriptor(input){
 const v=variant(input),id='equalization16/'+(v.channels?'rgb':'hsv-v')+'/'+(v.local?'local-'+v.tiles:'global');
 if(descriptors.has(id))return descriptors.get(id);
 const tableBytes=HEADER_WORDS*4+v.count*v.tiles*v.tiles*LEVELS*2;
 const layout=(width,height,rows)=>{
  const n=width*height,total=width*rows;
  requireValue([width,height,rows,n,total].every(Number.isSafeInteger)&&width>0&&height>0&&rows>0&&rows<=height&&n*2<=0xffffffff&&total*2<=0xffffffff&&Number.isSafeInteger(n*8)&&Number.isSafeInteger(total*8),'Invalid native16 equalization GPU window.');
  return{n,total,hostPackedBytes:n*8,hostOutputBytes:total*6,hostTableBytes:tableBytes,buffers:{source:n*8,output:total*8,shape:32,table:tableBytes,membership:4,scratch:4,readback:total*8}};
 };
 const descriptor=Object.freeze({id,shader:shaderFor(v),tableBytes,passes:Object.freeze(['main']),layout,channels:v.channels,local:v.local,tiles:v.tiles});descriptors.set(id,descriptor);return descriptor;
}
export function native16EqualizationGpuProgramPlan(g){const d=native16EqualizationGpuProgramDescriptor(g);return{known:true,id:d.id,tableBytes:d.tableBytes,hostTableBytes:d.tableBytes,tableEntries:d.tableBytes/4,headerBytes:HEADER_WORDS*4,codeCount:LEVELS,codeDepth:16,packedCodesPerWord:2,channels:d.channels?3:1,tiles:d.tiles,passes:d.passes,precision:{global:'exact UInt16 lookup and integer HSV ratio',local:'f32 spatial interpolation; qualify at most6codes of normalized1e-4 error; CPU remains exact'}};}

/** Caller owns the source LUT. One copied immutable packed table is financed
 * here and borrowed by the shared GPU owner only until each attempt ACK. */
export function createNative16EqualizationGpuProgram(luts,input,{budget,signal,onOwner}={}){
 const g=geometry(input),descriptor=native16EqualizationGpuProgramDescriptor(g),entries=g.count*g.tiles*g.tiles*LEVELS;
 requireValue(luts instanceof Uint16Array&&luts.length===entries&&budget?.reserve,'A complete financed native16 equalization LUT is required.');checkAbort(signal);
 const packed=createGpuAttemptArray(Uint32Array,descriptor.tableBytes/4,{budget,owner:'native16-equalization',label:'packed-native16-equalization-lut'});let closed=false;
 const program={...descriptor,geometry:g,budget,get table(){if(closed)throw new EngineError('DISPOSED','Native16 equalization GPU program is retired.');return packed.data;},dispose(){if(closed)return;try{packed.release();closed=true;}catch(error){throw gpuRetirementFailure(error,program,error);}}};
 try{onOwner?.(program);const table=packed.allocate(),header=new Float32Array(table.buffer,table.byteOffset,2);header[0]=g.tileWidth;header[1]=g.tileHeight;table[2]=g.tiles;table[3]=0;for(let i=0;i<entries;i+=2){if(i%65536===0)checkAbort(signal);table[HEADER_WORDS+i/2]=luts[i]|(luts[i+1]<<16);}checkAbort(signal);return Object.freeze(program);}
 catch(error){try{program.dispose();}catch(cleanup){throw gpuRetirementFailure(error,program,cleanup);}throw error;}
}
