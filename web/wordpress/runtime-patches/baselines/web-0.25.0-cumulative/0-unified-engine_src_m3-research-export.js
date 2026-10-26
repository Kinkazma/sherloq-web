import {streamScientificNpz} from './scientific-npz-stream.js';import {requireValue} from './errors.js';
export function streamM3ResearchNpz(analysis,provenance,request,hooks){
 const d=analysis.data;requireValue(d,'Research result released.');const arrays=[],shape=d.metadata.native_shape,add=(key,value,shape,int64=false)=>{
  const descr=int64?'<i8':value instanceof Float32Array?'<f4':value instanceof Uint8Array?'|u1':'<i4',elementBytes=int64?8:value.BYTES_PER_ELEMENT;
  arrays.push({key,shape,descr,elementBytes,count:value.length,read(bytes,start,length){if(int64){const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);for(let i=0;i<length;i++)view.setBigInt64(i*8,BigInt(value[start+i]),true);}else bytes.set(new Uint8Array(value.buffer,value.byteOffset+start*elementBytes,length*elementBytes));}});
 };
 add('map',d.map,shape);if(d.mask)add('mask',d.mask,shape);if(d.features)add('features',d.features,[4096,288]);
 if(d.source_probabilities){add('source_probabilities',d.source_probabilities,[d.metadata.sources,...shape]);add('source_labels',d.source_labels,shape);add('prompt_features',d.prompt_features,[d.prompt_confidence.length,256]);add('prompt_confidence',d.prompt_confidence,[d.prompt_confidence.length]);add('prompt_clusters',d.prompt_clusters,[d.prompt_confidence.length],true);add('points',d.points,[d.points.length/2,2]);}
 return streamScientificNpz(arrays,d.metadata,provenance,request,hooks);
}
