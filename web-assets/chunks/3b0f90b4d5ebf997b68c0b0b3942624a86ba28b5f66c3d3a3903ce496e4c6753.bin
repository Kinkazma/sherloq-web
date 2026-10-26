import "../../runtime-context.js?v=0.25.0";
import {streamScientificNpz} from './scientific-npz-stream.js';import {requireValue} from './errors.js';
export function streamM3ResearchNpz(analysis,provenance,request,hooks){
 const d=analysis.data;requireValue(d,'Research result released.');const arrays=[],add=(key,value,shape,int64=false)=>{
  const descr=int64?'<i8':value instanceof Float32Array?'<f4':value instanceof Uint8Array?'|u1':value instanceof Uint32Array?'<u4':'<i4',elementBytes=int64?8:value.BYTES_PER_ELEMENT;
  arrays.push({key,shape,descr,elementBytes,count:value.length,read(bytes,start,length){if(int64){const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);for(let i=0;i<length;i++)view.setBigInt64(i*8,BigInt(value[start+i]),true);}else bytes.set(new Uint8Array(value.buffer,value.byteOffset+start*elementBytes,length*elementBytes));}});
 };
 const fields=(value,prefix='')=>{const shape=value.metadata.native_shape;add(prefix+'map',value.map,shape);if(value.mask)add(prefix+'mask',value.mask,shape);if(value.features)add(prefix+'features',value.features,[shape[0]*shape[1],288]);
  if(value.analysis_scope)add(prefix+'analysis_scope',value.analysis_scope,shape);
  if(value.metadata.global_source_ids)add(prefix+'global_source_ids',Uint32Array.from(value.metadata.global_source_ids),[value.metadata.global_source_ids.length]);
  if(value.source_probabilities){add(prefix+'source_probabilities',value.source_probabilities,[value.metadata.sources,...shape]);add(prefix+'source_labels',value.source_labels,shape);add(prefix+'prompt_features',value.prompt_features,[value.prompt_confidence.length,256]);add(prefix+'prompt_confidence',value.prompt_confidence,[value.prompt_confidence.length]);add(prefix+'prompt_clusters',value.prompt_clusters,[value.prompt_confidence.length],true);add(prefix+'points',value.points,[value.points.length/2,2]);}};
 if(Array.isArray(d.fragments)){
  requireValue(d.metadata.strictSourceRegions?.schema==='sherloq.strict-research/1','Unknown research native-fragment export.');
  for(const [i,fragment]of d.fragments.entries())fields(fragment,'fragment_'+i+'_');
  arrays.push({key:'fragment_bounds',shape:[d.fragments.length,4],descr:'<i4',elementBytes:4,count:d.fragments.length*4,read(bytes,start,length){const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);for(let i=0;i<length;i++){const at=start+i;view.setInt32(i*4,d.fragments[Math.floor(at/4)].bounds[at%4],true);}}});
 }else fields(d);
 return streamScientificNpz(arrays,d.metadata,provenance,request,hooks);
}
