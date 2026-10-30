import {checkAbort,requireValue} from './errors.js';
/** Existing strict producers use either a signed hex fingerprint or a
 * canonical compound key. Hash the latter as transport identity only; never
 * replace/recompile its Source/candidate/context domains or sample RGB. */
export async function neuralWindowDomainIdentity(value,{budget,signal}={}){
 requireValue(typeof value==='string'&&value.length>0&&budget?.reserve,'An owned compiled-domain identity is required.');checkAbort(signal);if(/^[a-f0-9]{64}$/.test(value))return value;
 const free=budget.reserve(value.length*6+1024);try{const bytes=new TextEncoder().encode(value),digest=await crypto.subtle.digest('SHA-256',bytes);checkAbort(signal);return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');}finally{free();}
}
