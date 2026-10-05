import "../../runtime-context.js?v=0.14.5";
import {requireValue} from './errors.js';

// Python json.dumps accepts non-finite floats and arbitrarily large integers.
// Keep those scientific values instead of JSON.stringify's silent nulls.
export function scientificJson(value) {
 const ancestors=new Set();
 function encode(v,depth) {
  requireValue(depth<=256,'Scientific metadata nesting exceeds 256 levels.');
  if(v===null)return 'null';
  if(typeof v==='string'||typeof v==='boolean')return JSON.stringify(v);
  if(typeof v==='bigint')return v.toString();
  if(typeof v==='number')return Number.isNaN(v)?'NaN':v===Infinity?'Infinity':v===-Infinity?'-Infinity':Object.is(v,-0)?'-0.0':String(v);
  requireValue(v&&typeof v==='object'&&!ancestors.has(v),'Unsupported or cyclic scientific metadata.');
  requireValue(Array.isArray(v)||Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null,'Scientific metadata must contain plain records and lists.');
  ancestors.add(v);
  const result=Array.isArray(v)?'['+Array.from(v,x=>encode(x,depth+1)).join(',')+']':'{'+Object.entries(v).map(([k,x])=>JSON.stringify(k)+':'+encode(x,depth+1)).join(',')+'}';
  ancestors.delete(v);return result;
 }
 return encode(value,0);
}

export function scientificJsonBound(value) {
 const ancestors=new Set();
 function size(v,depth) {
  requireValue(depth<=256,'Scientific metadata nesting exceeds 256 levels.');
  if(v===null||typeof v!=='object')return typeof v==='string'?v.length*6+2:typeof v==='bigint'?v.toString().length:32;
  requireValue(!ancestors.has(v),'Cyclic scientific metadata.');ancestors.add(v);
  const result=Object.entries(v).reduce((sum,[key,x])=>sum+key.length*6+size(x,depth+1)+4,2);
  ancestors.delete(v);requireValue(Number.isSafeInteger(result),'Scientific metadata is too large.');return result;
 }
 return size(value,0);
}
