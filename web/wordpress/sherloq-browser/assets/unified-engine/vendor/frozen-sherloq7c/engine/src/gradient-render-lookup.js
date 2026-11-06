import "../../../../../runtime-context.js?v=0.31.0";
import {requireValue,checkAbort} from './errors.js';
import {gradientRender} from './gradient-math.js';

// The GPU only indexes bytes produced by the qualified Wasm renderer. In
// particular no WGSL division, sqrt, FMA or trigonometry replaces native math.
export function gradientLookupIdentity(stats,p,total){return JSON.stringify([stats[0],stats[1],stats[2],stats[3],...(p.mode===3?[stats[4],stats[5]]:[]),p.mode,!!p.invert,total>=4]);}
export async function nativeGradientRenderLookup(stats,p,total,hooks={}){
 requireValue(p.method==='sobel'&&stats instanceof Float64Array&&stats.length===6,'Native Sobel statistics required for GPU lookup.');checkAbort(hooks.signal);
 const directionCount=2041,blueCount=p.mode===3?65536:2041,toneOffset=directionCount*2+blueCount,words=new Uint32Array(toneOffset+768),slopes=new Int16Array(directionCount*2);
 for(let i=0;i<directionCount;i++)slopes[i*2]=slopes[i*2+1]=i-1020;
 const direction=await gradientRender(new Uint8Array(slopes.buffer),stats,{...p,mode:0},total,hooks),inverseR=new Int16Array(256),inverseG=new Int16Array(256),seenR=new Uint8Array(256),seenG=new Uint8Array(256);
 for(let i=0;i<directionCount;i++){const r=direction.bytes[i*3],g=direction.bytes[i*3+1];words[i]=r;words[directionCount+i]=g;if(!seenR[r]){seenR[r]=1;inverseR[r]=i-1020;}if(!seenG[g]){seenG[g]=1;inverseG[g]=i-1020;}}
 if(p.mode===2||p.mode===3){
  const blueSlopes=new Int16Array(blueCount*2);
  if(p.mode===2)for(let i=0;i<blueCount;i++){blueSlopes[i*2]=Math.min(1020,i);blueSlopes[i*2+1]=Math.max(0,i-1020);}
  else for(let r=0;r<256;r++)for(let g=0;g<256;g++){const at=(r*256+g)*2;blueSlopes[at]=inverseR[r];blueSlopes[at+1]=inverseG[g];}
  const blue=await gradientRender(new Uint8Array(blueSlopes.buffer),stats,p,total,hooks);for(let i=0;i<blueCount;i++)words[directionCount*2+i]=blue.bytes[i*3+2];
 }
 checkAbort(hooks.signal);return{words,blueOffset:directionCount*2,toneOffset};
}
