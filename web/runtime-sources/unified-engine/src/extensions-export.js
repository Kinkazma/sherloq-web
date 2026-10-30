import "../../runtime-context.js?v=0.30.0";
import {streamScientificNpz} from './scientific-npz-stream.js';
import {requireValue} from './errors.js';
export function streamExtensionsNpz(analysis,provenance,request,hooks){
 requireValue(analysis?.planes?.length&&analysis.metadata,'Live extension scientific result required.');
 const arrays=analysis.planes.map(plane=>{
  const {data,width,height,key}=plane,elementBytes=plane.elementBytes??data.BYTES_PER_ELEMENT;
  const descr=plane.format==='float64'?'<f8':plane.format==='float32'?'<f4':plane.format==='int32'?'<i4':'|u1';
  return {key,shape:[height,width],descr,elementBytes,count:plane.count??data.length,read(bytes,first,length){if(plane.store)return plane.store.readInto(bytes,first*elementBytes);bytes.set(new Uint8Array(data.buffer,data.byteOffset+first*elementBytes,length*elementBytes));}};
 });
 return streamScientificNpz(arrays,analysis.metadata,provenance,request,hooks);
}
