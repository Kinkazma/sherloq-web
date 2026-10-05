import {streamScientificNpz} from './scientific-npz-stream.js';
export async function streamZeroNpz(analysis,provenance,request,hooks={}){
 const {width,height,planes,metadata}=analysis,n=width*height;let input;
 const arrays=['luminance','luminance_jpeg','votes','votes_jpeg','mask_f','mask_f_reg','mask_m','mask_m_reg','grid_log10_nfa'].map(key=>{const floating=key.startsWith('luminance')||key==='grid_log10_nfa',count=key==='grid_log10_nfa'?64:n;return {key,count,elementBytes:floating?8:4,descr:floating?'<f8':'<i4',shape:key==='grid_log10_nfa'?[64]:[height,width],async read(bytes,first,length){const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);if(key==='grid_log10_nfa'){for(let i=0;i<length;i++)view.setFloat64(i*8,analysis.grid_log10_nfa[first+i],true);return;}input??=new Uint8Array(65536);const part=input.subarray(0,length);await planes[key].readInto(part,first);for(let i=0;i<length;i++)if(floating)view.setFloat64(i*8,part[i],true);else view.setInt32(i*4,key.startsWith('votes')&&part[i]===255?-1:part[i],true);}};});
 return streamScientificNpz(arrays,metadata,provenance,{...request,progressPhase:'zero-npz'},hooks);
}
