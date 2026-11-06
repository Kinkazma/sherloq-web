// Scheduling observations come exclusively from products that this native fit
// consumes. No source is replayed for timing and no browser identity is used.
export function createEmProductSelector(observations,{preferCpu={}}={}){
 const fields=()=>({nativePoints:0,nativeMilliseconds:0,nativeSamples:0,gpuPoints:0,gpuMilliseconds:0,gpuSamples:0,domainRefusals:0}),states=observations?structuredClone(observations):{gram:fields(),product:fields()};for(const mode of['gram','product'])states[mode].domainRefusals=0;
 return{
  choose(mode,count){if(preferCpu[mode]===true)return'cpu';const s=states[mode];if(count<256||s.domainRefusals>=2)return'cpu';if(!s.nativeSamples)return'cpu';if(!s.gpuSamples||s.gpuSamples<2&&s.gpuMilliseconds/s.gpuPoints<s.nativeMilliseconds/s.nativePoints*2)return'webgpu';if(s.nativeSamples<2&&s.gpuMilliseconds/s.gpuPoints>s.nativeMilliseconds/s.nativePoints*.25)return'cpu';return s.gpuMilliseconds/s.gpuPoints<s.nativeMilliseconds/s.nativePoints*.9?'webgpu':'cpu';},
  native(mode,points,milliseconds){if(points<256)return;const s=states[mode];s.nativePoints+=points;s.nativeMilliseconds+=Math.max(0,milliseconds);s.nativeSamples++;},
  gpu(mode,points,milliseconds){const s=states[mode];s.gpuPoints+=points;s.gpuMilliseconds+=Math.max(0,milliseconds);s.gpuSamples++;},
  refuse(mode){states[mode].domainRefusals++;},
  snapshot(){return structuredClone(states);}
 };
}
