import "../../runtime-context.js?v=0.14.5";
import {requireValue,checkAbort} from './errors.js';
import {streamScientificNpz} from './scientific-npz-stream.js';

const ARRAY=Symbol('automatic scientific array'),littleEndian=new Uint8Array(new Uint32Array([1]).buffer)[0]===1;
const types=new Map([[Uint8Array,'|u1'],[Int8Array,'|i1'],[Uint16Array,'<u2'],[Int16Array,'<i2'],[Uint32Array,'<u4'],[Int32Array,'<i4'],[Float32Array,'<f4'],[Float64Array,'<f8'],[BigUint64Array,'<u8'],[BigInt64Array,'<i8']]);

// Explicit shapes preserve the native ndarray contract. Never guess a matrix
// shape from a flattened detector field, nor serialize its numeric indices.
export function automaticSnapshotArray(source,{shape,descr}={}) {
 const typed=types.get(source?.constructor),dtype=descr??typed;
 requireValue(Array.isArray(shape)&&shape.length<=32&&shape.every(x=>Number.isSafeInteger(x)&&x>=0),'Scientific array shape required.');
 requireValue(['|u1','|i1','|b1','<u2','<i2','<u4','<i4','<u8','<i8','<f4','<f8'].includes(dtype),'Scientific array dtype required.');
 const count=shape.reduce((a,b)=>a*b,1),elementBytes=Number(dtype.slice(2));
 requireValue(Number.isSafeInteger(count)&&Number.isSafeInteger(count*elementBytes)&&source?.byteLength===count*elementBytes,'Scientific source length and shape differ.');
 requireValue(typed?littleEndian&&(typed===dtype||typed==='|u1'&&dtype==='|b1'):typeof source?.readInto==='function','Scientific source must be matching typed data or a little-endian byte store.');
 return Object.freeze({[ARRAY]:true,count,elementBytes,descr:dtype,shape:Object.freeze(shape.slice()),async read(bytes,first,length){
  if(typed)bytes.set(new Uint8Array(source.buffer,source.byteOffset+first*elementBytes,length*elementBytes));
  else await source.readInto(bytes,first*elementBytes);
  if(dtype==='|b1')requireValue(bytes.every(x=>x===0||x===1),'Boolean scientific arrays require bytes 0 or 1.');
 }});
}

// Same root_<key>_<index> references as native automatic_clones.export. Inputs
// remain caller-owned and immutable until the returned promise has settled.
export async function streamAutomaticNpz(snapshot,provenance,request={},hooks={}) {
 const {budget,signal}=hooks,arrays=[],ancestors=new Set(),releases=[];
 function encode(value,name='root',depth=0) {
  checkAbort(signal);requireValue(depth<=256,'Automatic snapshot nesting exceeds 256 levels.');
  releases.push(budget.reserve(256+name.length*4));
  if(value?.[ARRAY]){arrays.push({...value,key:name});return {array:name};}
  if(value===null||['string','number','boolean','bigint'].includes(typeof value))return value;
  requireValue(value&&typeof value==='object'&&!ancestors.has(value),'Unsupported or cyclic automatic snapshot.');
  requireValue(Array.isArray(value)||Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null,'Wrap every native ndarray with automaticSnapshotArray; other values must be plain records or lists.');
  ancestors.add(value);let result;
  if(Array.isArray(value))result=Array.from(value,(v,i)=>encode(v,name+'_'+i,depth+1));
  else {result=Object.create(null);for(const [key,v]of Object.entries(value))result[key]=encode(v,name+'_'+key,depth+1);}
  ancestors.delete(value);return result;
 }
 try {
  const metadata=encode(snapshot),result=await streamScientificNpz(arrays,metadata,provenance,{...request,metadataSerialization:'python',progressPhase:'automatic-npz'},hooks);
  let disposal;
  return {...result,dispose(){return disposal??=Promise.resolve().then(async()=>{try{await result.store.dispose();}finally{await result.session?.dispose();}});}};
 } finally {for(const release of releases)release();}
}
