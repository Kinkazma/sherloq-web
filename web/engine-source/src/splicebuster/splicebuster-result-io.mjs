/* Private SHERLOQ Splicebuster result consumers. Original GRIP terms apply. */
import {EngineError,requireValue,checkAbort} from '../errors.js';

export function resultDescription(result){
 const d=result?.data;
 requireValue(d&&Number.isSafeInteger(d.width)&&d.width>0&&Number.isSafeInteger(d.height)&&d.height>0,'Splicebuster native dimensions required.');
 const shape=d.mapShape;
 requireValue(Array.isArray(shape)&&shape.length===2&&shape.every(n=>Number.isSafeInteger(n)&&n>=0)&&(shape[0]===0)===(shape[1]===0),'Invalid Splicebuster native grid.');
 const [rows,cols]=shape,n=rows*cols;requireValue(Number.isSafeInteger(n*8),'Unsafe Splicebuster offsets.');
 requireNumeric(d.map,Float64Array,n,'map');requireNumeric(d.valid,Uint8Array,n,'valid');
 requireValue(d.range0 instanceof Float64Array&&d.range0.length===rows&&d.range1 instanceof Float64Array&&d.range1.length===cols,'Native Splicebuster coordinates required.');
 for(const axis of [d.range0,d.range1])for(let i=0;i<axis.length;i++)requireValue(Number.isFinite(axis[i])&&(i===0||axis[i]>axis[i-1]),'Splicebuster coordinates must increase strictly.');
 requireValue(typeof result.pin==='function','A pinnable Splicebuster result is required.');
 return {d,rows,cols,n,width:d.width,height:d.height};
}
export function requireNumeric(value,Type,length,label){
 const bank=value&&typeof value.readInto==='function'&&value.elementType===Type.name&&value.BYTES_PER_ELEMENT===Type.BYTES_PER_ELEMENT;
 requireValue((value instanceof Type||bank)&&value.length===length&&value.byteLength===length*Type.BYTES_PER_ELEMENT,'Invalid Splicebuster '+label+' array.');
}
export async function readNumeric(value,target,offset,{signal}={}){
 checkAbort(signal);
 requireValue(Number.isSafeInteger(offset)&&offset>=0&&offset<=value.length-target.length,'Splicebuster numeric window is outside its array.');
 if(typeof value.readInto==='function')await value.readInto(target,offset,{signal});else target.set(value.subarray(offset,offset+target.length));
 checkAbort(signal);return target;
}
export async function readNumericBytes(value,target,offset,{signal}={}){
 checkAbort(signal);requireValue(target instanceof Uint8Array&&Number.isSafeInteger(offset)&&offset>=0&&offset<=value.byteLength-target.byteLength,'Invalid Splicebuster byte window.');
 if(typeof value.readBytes==='function')await value.readBytes(target,offset,{signal});
 else if(ArrayBuffer.isView(value))target.set(new Uint8Array(value.buffer,value.byteOffset+offset,target.byteLength));
 else throw new EngineError('INPUT','Splicebuster bank must support bounded byte reads for export.');
 checkAbort(signal);return target;
}

// A failed asynchronous retirement retains its owner and can be retried.
// The raw first error is kept even when it is frozen, null, undefined or 0.
export function resourceScope(){
 const entries=[];let releasing;
 const retire=async e=>{if(!e||e.done)return;if(e.pending)return e.pending;e.pending=(async()=>{await e.release();e.done=true;e.release=null;})();try{await e.pending;}finally{e.pending=null;}};
 return {
  own(value,method='release'){requireValue(value&&typeof value[method]==='function','A resource owner is required.');const e={release:()=>value[method](),done:false,pending:null,value};entries.push(e);return e;},
  ownRelease(release){requireValue(typeof release==='function','A release function is required.');const e={release,done:false,pending:null};entries.push(e);return e;},
  retire,
  take(e){requireValue(e&&!e.done&&!e.pending,'Cannot transfer a retired owner.');e.done=true;e.release=null;return e.value;},
  release(){if(releasing)return releasing;releasing=(async()=>{let failed=false,error;for(let i=entries.length-1;i>=0;i--)try{await retire(entries[i]);}catch(e){if(!failed){failed=true;error=e;}}if(failed)throw error;})();return releasing.finally(()=>{releasing=null;});},
 };
}
export async function cleanupScope(scope,hasPrimary,onCleanupError){
 try{await scope.release();}catch(error){if(!hasPrimary)throw error;try{await onCleanupError?.(error,()=>scope.release());}catch{/* The original failure remains authoritative. */}}
}
export async function pinInto(result,scope){const release=await result.pin();return scope.ownRelease(release);}
