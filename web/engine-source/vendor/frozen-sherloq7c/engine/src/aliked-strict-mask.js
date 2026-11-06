import createMasks from '../vendor/sparse-extract/sparse-extract.js';
import {SPARSE_EXTRACT_WASM} from './sparse-extract-assets.js';
import {fetchM3Asset} from './m3-asset.js';
import {boundWasmMemory} from './wasm-memory-limit.js';
import {allocateOwnedTypedArray} from './allocation.js';
import {roundEven} from './pixel-utils.js';
import {createAlikedStrictOwner} from './aliked-strict-owner.js';
import {requireValue,checkAbort} from './errors.js';
/** Original native polygon raster, distinct from admitted RGB half-open source
 * geometry. It retains inclusive native borders before cap and by-zone after
 * localization, exactly as learned-feature-worker; no RGB painting occurs. */
export function createAlikedStrictMask({width,height,regions=[],excluded=[],budget,signal,onOwner,wasmBinary}={}){
 const owner=createAlikedStrictOwner({signal,onOwner});return owner.run(async()=>{requireValue([width,height].every(n=>Number.isSafeInteger(n)&&n>0)&&Number.isSafeInteger(width*height),'Native ALIKED Original mask dimensions changed.');regions=structuredClone(regions);excluded=structuredClone(excluded);const n=width*height,maxPoints=Math.max(1,...[...regions,...excluded].map(p=>p.length)),heap=Math.ceil((32*1024**2+n+maxPoints*8)/65536)*65536,freeHeap=budget.reserve(heap);owner.credit(freeHeap);const bytes=wasmBinary??await fetchM3Asset(new URL('../vendor/sparse-extract/sparse-extract.wasm',import.meta.url),SPARSE_EXTRACT_WASM,owner.signal);let m=await createMasks({wasmBinary:boundWasmMemory(bytes,heap),print(){},printErr(){}});const p=m._malloc(Math.max(8,n)),q=m._malloc(maxPoints*8);owner.own(()=>{if(m){if(p)m._free(p);if(q)m._free(q);m=null;}},'native Original polygon raster');requireValue(p&&q,'Native ALIKED polygon allocation failed.');const draw=(polys,value)=>{for(const poly of polys){const xy=Int32Array.from(poly.flat(),roundEven);m.HEAPU8.set(new Uint8Array(xy.buffer),q);requireValue(m._sparse_polygon(p,width,height,q,poly.length,value),'Native polygon rasterization failed.');}};m.HEAPU8.fill(regions.length?0:255,p,p+n);draw(regions,255);draw(excluded,0);const raster=allocateOwnedTypedArray(Uint8Array,n,{budget,owner:'aliked-native-candidate-mask'});owner.credit(()=>raster.release());raster.data.set(m.HEAPU8.subarray(p,p+n));checkAbort(owner.signal);const at=(x,y)=>Math.max(0,Math.min(height-1,roundEven(y)))*width+Math.max(0,Math.min(width-1,roundEven(x)));
  return{owner,zoneCount:Math.max(1,regions.length),allowedAtSource(x,y){checkAbort(owner.signal);return raster.data[at(x,y)]>0;},membership(points,into){checkAbort(owner.signal);const count=points.length/7,zones=Math.max(1,regions.length);requireValue(into instanceof Uint8Array&&into.length===count*zones,'Native ALIKED membership output changed.');if(!regions.length)into.fill(1);else for(let z=0;z<zones;z++){m.HEAPU8.fill(0,p,p+n);draw([regions[z]],255);for(let i=0;i<count;i++)into[i*zones+z]=+(m.HEAPU8[p+at(points[i*7],points[i*7+1])]>0);}return into;},dispose:()=>owner.dispose()};
 });
}
