import "../../runtime-context.js?v=0.14.5";
import {requireValue} from './errors.js';
import {automaticSnapshotArray as array} from './automatic-npz-stream.js';

function typed(value,Type,shape,name){requireValue(value instanceof Type,'Native point result type differs: '+name);return array(value,{shape});}
function groupIndices(value){
 requireValue(value instanceof Uint32Array,'Packed uint32 biome indices required.');
 return array({byteLength:value.length*8,readInto(bytes,offset){requireValue(offset%8===0&&bytes.length%8===0,'Aligned int64 archive chunk required.');const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);for(let i=0;i<bytes.length/8;i++)view.setBigInt64(i*8,BigInt(value[offset/8+i]),true);}},{shape:[value.length],descr:'<i8'});
}
function denseArray(field,value,Type,shape,name,descr){
 if(field.paged===true&&!ArrayBuffer.isView(value))return array(value,{shape,descr});
 return typed(value,Type,shape,name);
}
function denseMap(field,profile){
 const {width,height,pass,context}=field,n=width*height;
 requireValue(Number.isSafeInteger(width)&&width>0&&Number.isSafeInteger(height)&&height>0&&Number.isSafeInteger(n)&&pass&&context&&Array.isArray(context.origin)&&context.origin.length===2&&Number.isInteger(context.pairSearchRegion),'Dense scientific field geometry required.');
 const result={consistent_mask:array(field.selected,{shape:[height,width],descr:'|b1'}),coherence_error:field.errors==null?null:denseArray(field,field.errors,Float32Array,[height,width],'coherence_error','<f4'),origin:context.origin,shift:field.shift,targets:denseArray(field,field.targets,Int32Array,[height,width],'targets','<i4'),distances_squared:denseArray(field,field.distancesSquared,Float32Array,[height,width],'distances_squared','<f4'),zone:context.compare?0:context.pairSearchRegion};
 if(profile.includes(' + '))result.algorithm=pass.algorithm;
 if(pass.stage==='mirror')result.variant='reflection';
 if(profile.startsWith('Extended:')&&pass.stage!=='base')Object.assign(result,{descriptor_frame:pass.descriptorFrame,source_bin:pass.patch,target_bin:pass.targetPatch});
 const known=new Set(['selected','errors','targets','distancesSquared','dispose']),browser={};
 for(const [key,value]of Object.entries(field)){
  if(known.has(key)||value===undefined)continue;
  if(key==='allowed')browser[key]=denseArray(field,value,Uint8Array,[height,width],key,'|u1');
  else if(key==='displayRows')browser[key]=typed(value,value instanceof Int32Array?Int32Array:Uint32Array,[value.length],key);
  else {requireValue(!ArrayBuffer.isView(value),'Unrecognized dense scientific array: '+key);browser[key]=value;}
 }
 return {result,browser};
}

/** Explicit native point, pair, biome and dense-field ndarray contracts.
 * The real provider output stays borrowed and immutable until export settles.
 * nativeParams is the matching plan.native.patchmatch or plan.native.sift. */
export function automaticPointSnapshot(value,{nativeParams}={}) {
 requireValue(value&&Array.isArray(nativeParams)&&nativeParams.length>=18&&typeof nativeParams[0]==='string'&&Array.isArray(value.groups),'Native automatic parameter tuple and owned classical result required.');
 const pointType=value.points?.constructor,p=value.points?.length/7,m=value.pairs?.length/4;
 requireValue([Float32Array,Float64Array].includes(pointType)&&Number.isSafeInteger(p)&&Number.isSafeInteger(m),'Packed native Nx7 points and Nx4 pairs required.');
 const output={points:typed(value.points,pointType,[p,7],'points'),pairs:typed(value.pairs,Float64Array,[m,4],'pairs'),groups:value.groups.map(groupIndices),colors:typed(value.colors,Uint8Array,[m,3],'colors'),pair_search_regions:typed(value.pair_search_regions,Int32Array,[m],'pair_search_regions')},browser={};
 const infrastructure=new Set(['release','params','status','metrics','provenance','geometry','semantics']);
 for(const [key,data]of Object.entries(value)){
  if(Object.hasOwn(output,key)||key==='release'||data===undefined)continue;
  if(infrastructure.has(key)){browser[key]=data;continue;}
  if(key==='pair_algorithms'){output[key]=typed(data,Uint8Array,[m],key);continue;}
  if(key==='dense_maps'){requireValue(Array.isArray(data),'Dense field list required.');const maps=data.map(f=>denseMap(f,nativeParams[0]));output[key]=maps.map(f=>f.result);browser.dense_fields=maps.map(f=>f.browser);continue;}
  requireValue(!ArrayBuffer.isView(data),'Unrecognized classical scientific array: '+key);output[key]=data;
 }
 output.params=nativeParams;
 // Preserve browser-only evidence and effective settings under an explicit key,
 // including allowed bitmasks and sampled display rows, without altering native
 // scientific array names or claiming native device/timing metadata.
 output.browser_details=browser;return output;
}
