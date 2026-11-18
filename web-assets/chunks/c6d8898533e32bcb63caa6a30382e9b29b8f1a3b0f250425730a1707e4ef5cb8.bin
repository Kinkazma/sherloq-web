import "../../runtime-context.js?v=0.33.3";
import {EngineError,requireValue,checkAbort} from './errors.js';
import {allocateOwnedTypedArray,allocateTypedArray} from './allocation.js';
const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
const renamed=key=>key.endsWith('Bytes')?key.slice(0,-5):key;
/** Convert imported color/provenance into small public metadata. Exact profile
 * payloads belong privately to one source owner, never to a surface descriptor
 * that structuredClone sends repeatedly to the UI and result provenance. */
export async function createOwnedNativeColorMetadata({color={},provenance={}}={}, {budget,signal,retention='retain',reserve=bytes=>budget.reserve(bytes)}={}){
 requireValue(budget&&typeof budget.reserve==='function'&&typeof budget.retain==='function'&&typeof reserve==='function'&&['retain','source'].includes(retention),'A central native-color metadata owner is required.');checkAbort(signal);
 const profiles=new Map(),aliases=new WeakMap(),objects=new WeakMap();let disposed=false,retainedBytes=0;
 function dispose(){if(disposed)return;disposed=true;for(const entry of profiles.values()){entry.data=null;const bytes=entry.bytes,retired=entry.backing?.();entry.backing=null;budget.retained-=bytes;if(retired!==0)budget.notifyBackingRelease?.('array-buffer',retired??bytes);}profiles.clear();retainedBytes=0;}
 async function binary(value){const source=value instanceof ArrayBuffer?new Uint8Array(value):new Uint8Array(value.buffer,value.byteOffset,value.byteLength);if(aliases.has(value))return aliases.get(value);const hash=await sha(source);checkAbort(signal);let entry=profiles.get(hash);if(retention==='retain'&&!entry){const lease=reserve(source.byteLength);let data,backing;try{data=allocateTypedArray(Uint8Array,source.byteLength,{label:'retained-native-icc'});data.set(source);backing=budget.registerBacking?.('array-buffer',data.byteLength,{owner:'native-color-source',label:'retained-native-icc',identity:data.buffer});
    // Transfer the admitted reservation without a second room() admission or
    // an unaccounted interval. This is one backing with one lifetime owner.
    budget.retained+=data.byteLength;lease();entry={data,bytes:data.byteLength,backing};profiles.set(hash,entry);retainedBytes+=data.byteLength;
   }catch(error){backing?.();lease();throw error;}}
  const summary=Object.freeze({sha256:hash,bytes:source.byteLength,storage:retention==='retain'?'private-source-owner':'original-source-or-declared-reconstruction'});aliases.set(value,summary);return summary;
 }
 async function clean(value,depth=0){checkAbort(signal);if(value===null||typeof value!=='object')return value;requireValue(depth<=32,'Native color metadata nesting is excessive.');if(value instanceof ArrayBuffer||ArrayBuffer.isView(value)){if(ArrayBuffer.isView(value)&&!(value instanceof DataView)&&!(value instanceof Uint8Array)&&value.length<=64)return Array.from(value);return binary(value);}if(objects.has(value))return objects.get(value);const out=Array.isArray(value)?[]:{};objects.set(value,out);for(const[key,part]of Object.entries(value)){const target=part instanceof ArrayBuffer||ArrayBuffer.isView(part)?renamed(key):key;requireValue(!Object.hasOwn(out,target),'Ambiguous native-color metadata field.');out[target]=await clean(part,depth+1);}return out;}
 try{const publicColor=await clean(color),publicProvenance=await clean(provenance);checkAbort(signal);const owner={color:publicColor,provenance:publicProvenance,get retainedBytes(){return retainedBytes;},profileCount:profiles.size,
  readProfile(hash,{signal:readSignal,reserve}={}){if(disposed)throw new EngineError('DISPOSED','Native color profiles are disposed.');checkAbort(readSignal);const entry=profiles.get(hash);if(!entry)throw new EngineError('PROFILE_UNAVAILABLE','This exact profile belongs to the original source or its declared reconstruction.');const owned=allocateOwnedTypedArray(Uint8Array,entry.bytes,{budget,reserve,owner:'native-color-export',label:'native-profile-read'});try{owned.data.set(entry.data);checkAbort(readSignal);return owned;}catch(error){owned.release();throw error;}},
  attachToSurface(surface){requireValue(surface&&typeof surface.dispose==='function','Native color profiles need a source surface owner.');requireValue(!Object.hasOwn(surface,'readColorProfile'),'A native profile reader is already attached.');Object.defineProperty(surface,'readColorProfile',{value:(hash,hooks)=>{if(disposed)throw new EngineError('DISPOSED','Native color profiles are disposed.');return owner.readProfile(hash,hooks);}});const original=surface.dispose.bind(surface);let pending;surface.dispose=()=>{if(pending)return pending;const task=Promise.resolve().then(original).then(value=>{if(value===false||value===0)throw value;dispose();return value;});pending=task;void task.catch(()=>{if(pending===task)pending=null;});return task;};return surface;},dispose};return owner;
 }catch(error){dispose();throw error;}
}
/** Keep the original color object shared with an in-progress decode bank while
 * replacing its contents before that bank freezes a public descriptor. */
export function replaceNativeColorMetadata(target,source){requireValue(target&&source&&typeof target==='object'&&typeof source==='object','Native color metadata objects required.');for(const key of Object.keys(target))delete target[key];Object.assign(target,source);return target;}
