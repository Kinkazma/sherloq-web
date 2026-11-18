import "../../runtime-context.js?v=0.33.2";
import {requireValue} from './errors.js';
const digest=value=>value===null||typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const fields=['schema','kind','targetHeadroom','outputSpace','profileIdentity'];
/** Optional versioned extension; an absent recipe keeps the exact historical
 * entry key. No image dimensions or sample values select a numerical engine. */
export function sourceRepresentation(request,{enabled=false}={}){
 if(request.representation===undefined)return{key:request.domain,representation:undefined};
 requireValue(enabled&&request.domain==='decoded','This source owner does not advertise the representation extension.');
 if(request.representation?.kind==='raw-demosaic-rgb'){
  const value=request.representation;
  requireValue(Object.getPrototypeOf(value)===Object.prototype&&value.schema==='sherloq.source-representation/1'
   &&Object.keys(value).length===4&&Object.keys(value).every(k=>['schema','kind','quality','view'].includes(k))
   &&[0,3,4].includes(value.quality)&&['rgb16','sdr8'].includes(value.view),'Invalid RAW demosaic RGB representation.');
  const representation=Object.freeze({schema:value.schema,kind:value.kind,quality:value.quality,view:value.view});
  // Both views share one preparation/claim set and one owned bank pair.
  return{key:request.domain+'\0representation/1\0raw-demosaic-rgb/'+value.quality,representation};
 }
 if(request.representation?.kind==='original-color-channels'){
  const value=request.representation;
  requireValue(Object.getPrototypeOf(value)===Object.prototype&&value.schema==='sherloq.source-representation/1'
   &&Object.keys(value).length===2&&Object.hasOwn(value,'schema')&&Object.hasOwn(value,'kind'),
  'Original colour channels accept no caller-selected depth, model or conversion.');
  const representation=Object.freeze({schema:value.schema,kind:value.kind});
  return{key:request.domain+'\0representation/1\0'+JSON.stringify(representation),representation};
 }
 const value=request.representation;requireValue(value&&Object.getPrototypeOf(value)===Object.prototype&&Object.keys(value).every(key=>fields.includes(key))&&value.schema==='sherloq.source-representation/1'&&value.kind==='hdr-linear-rgb-float32'&&value.outputSpace==='gain-map-math-linear-rgb'&&Number.isFinite(value.targetHeadroom)&&value.targetHeadroom>=0,'Unknown or invalid HDR representation recipe.');
 const profile=value.profileIdentity;requireValue(profile&&Object.getPrototypeOf(profile)===Object.prototype&&Object.keys(profile).every(key=>['baseIccSha256','alternateIccSha256','baseCicp','alternateCicp','gainMathPrimaries'].includes(key))&&digest(profile.baseIccSha256)&&digest(profile.alternateIccSha256)&&['baseCicp','alternateCicp'].every(key=>Array.isArray(profile[key])&&profile[key].length===3&&profile[key].every(Number.isInteger))&&Number.isInteger(profile.gainMathPrimaries),'The representation needs exact source profile/CICP identities.');
 const representation=Object.freeze({schema:value.schema,kind:value.kind,targetHeadroom:Object.is(value.targetHeadroom,-0)?0:value.targetHeadroom,outputSpace:value.outputSpace,profileIdentity:Object.freeze({baseIccSha256:profile.baseIccSha256,alternateIccSha256:profile.alternateIccSha256,baseCicp:Object.freeze(profile.baseCicp.slice()),alternateCicp:Object.freeze(profile.alternateCicp.slice()),gainMathPrimaries:profile.gainMathPrimaries})});
 return{key:request.domain+'\0representation/1\0'+JSON.stringify(representation),representation};
}
