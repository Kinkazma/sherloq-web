// Admission by decoded CFA structure, never by a camera/format-name allowlist.
import{EngineError,requireValue}from'./errors.js';
export const RAW_HISTOGRAM_METHODS=Object.freeze({0:'bilinear',3:'ahd',4:'dcb'});
export function rawDemosaicCfa(metadata){
 const filters=metadata?.filters,description=metadata?.colorDescription;
 if(filters===0)return Object.freeze({kind:'linear',applicable:false,reason:'The decoded sensor is already non-mosaiced.'});
 if(filters===9)return Object.freeze({kind:'xtrans',applicable:false,reason:'X-Trans uses a different interpolator; Bayer method names do not apply.'});
 if(!Number.isSafeInteger(filters)||filters<=1000||filters>0xffffffff||typeof description!=='string'||metadata.colors!==3)
  return Object.freeze({kind:'other-cfa',applicable:false,reason:'The decoded sensor does not establish a three-colour RGB Bayer layout.'});
 const rows=Array.from({length:8},(_,r)=>Array.from({length:2},(_,c)=>description[(filters>>>((((r<<1)&14)+(c&1))<<1))&3]).join(''));
 const tile=rows[0]+rows[1],count=ch=>Array.from(tile).filter(v=>v===ch).length;
 const valid=rows.every((v,i)=>v===rows[i%2])&&count('R')===1&&count('G')===2&&count('B')===1
  &&rows.every((v,i)=>v[0]!==v[1]&&Array.from(v).every((ch,c)=>ch!==rows[(i+1)%8][c]));
 return Object.freeze(valid?{kind:'bayer-rgb',applicable:true,pattern:rows.slice(0,2),filterCode:filters,methods:[0,3,4]}
  :{kind:'other-cfa',applicable:false,reason:'The decoded CFA is not a normal two-by-two RGB Bayer pattern.'});
}
export function requireRawDemosaic(metadata,quality){
 requireValue(Object.hasOwn(RAW_HISTOGRAM_METHODS,quality),'Unknown histogram RAW interpolation.');
 const cfa=rawDemosaicCfa(metadata);
 if(!cfa.applicable)throw new EngineError('RAW_DEMOSAIC_UNSUPPORTED',cfa.reason,{details:{cfa:cfa.kind,requestedQuality:quality}});
 return Object.freeze({qualityRequested:quality,qualityEffective:quality,methodEffective:RAW_HISTOGRAM_METHODS[quality],cfa});
}
