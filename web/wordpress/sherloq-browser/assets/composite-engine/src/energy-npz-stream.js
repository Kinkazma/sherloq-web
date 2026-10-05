import "../../runtime-context.js?v=0.14.5";
import {streamScientificNpz} from './scientific-npz-stream.js';
export function streamEnergyNpz(analysis,provenance,request,hooks={}){
 const {width,height,metadata}=analysis,n=width*height,arrays=['energy_planes','energy_low_score','energy_high_score','energy_scope','energy_labels'].map(key=>({key,count:key==='energy_planes'?3*n:n,elementBytes:4,descr:['energy_scope','energy_labels'].includes(key)?'<i4':'<f4',shape:key==='energy_planes'?[3,height,width]:[height,width],async read(bytes,first,length){if(key!=='energy_planes')return analysis[key].readInto(bytes,first*4);let copied=0;while(copied<length){const at=first+copied,plane=Math.floor(at/n),offset=at%n,count=Math.min(length-copied,n-offset);await analysis.energy_planes[plane].readInto(bytes.subarray(copied*4,(copied+count)*4),offset*4);copied+=count;}}}));
 return streamScientificNpz(arrays,metadata,provenance,{...request,progressPhase:'energy-npz'},hooks);
}
