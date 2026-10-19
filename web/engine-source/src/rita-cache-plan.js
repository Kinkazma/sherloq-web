import {requireValue} from './errors.js';
const MiB=1024**2,PAGE=16*MiB;
/** Prefer useful feature banks to an incomplete cyclic model cache. This is a
 * residency estimate, never an allocation guarantee or a limit on CPU/GPU work.
 * Decoder branches: 8 * 64 float32 channels at native/16 spatial area (128 B/px).
 * Prior feedback/selected steps: 40 B/px; immutable first RGB projection:16 B/px;
 * source and global K/V:11 B/px. Graph workspaces/runtime retain a separate margin.
 */
export function ritaSessionCachePlan(manifest,{width,height,budgetBytes,backend='auto',gpuAvailable=Boolean(globalThis.navigator?.gpu),cpuOnly=false}={}){
 requireValue(Number.isSafeInteger(width)&&width>0&&Number.isSafeInteger(height)&&height>0&&Number.isSafeInteger(budgetBytes)&&budgetBytes>0,'Invalid RITA cache geometry or memory budget.');
 const assets=Object.values(manifest.assets??{}),seen=new Set();let weights=0;
 for(const asset of assets){requireValue(Number.isSafeInteger(asset.bytes)&&asset.bytes>0&&typeof asset.sha256==='string','Invalid RITA cache graph identity.');if(!seen.has(asset.sha256)){seen.add(asset.sha256);weights+=asset.bytes;}}
 const provider=backend==='cpu'||cpuOnly||!gpuAvailable?'wasm':'webgpu',factor=provider==='wasm'?2:3,workingSetBytes=Math.min(Number.MAX_SAFE_INTEGER,512*MiB+Math.ceil(width/32)*32*Math.ceil(height/32)*32*195),completeCacheBytes=Math.ceil(weights*factor/PAGE)*PAGE;
 // Its admitted Wasm maximum and the inactive-session backing are separate.
 const availableCacheBytes=Math.max(0,Math.floor((budgetBytes-workingSetBytes)/2/PAGE)*PAGE),modelCacheBytes=completeCacheBytes<=availableCacheBytes?completeCacheBytes:0;
 return {provider,modelCacheBytes,completeCacheBytes,workingSetEstimateBytes:workingSetBytes,availableCacheBytes,policy:modelCacheBytes?'complete-graph-cycle':'feature-banks-first'};
}
