import {streamScientificNpz} from './scientific-npz-stream.js';
export async function streamZeroNpz(analysis,provenance,request,hooks={}){
 const release=analysis.retain?.();let failed=false,primary;
 try{
  const multiple=analysis.kind==='independent-native-zero-contexts',contexts=multiple?analysis.contexts:[{analysis}],arrays=[];let input;
  for(let ci=0;ci<contexts.length;ci++){
   const {analysis:context}=contexts[ci],{width,height,planes}=context,n=width*height,prefix=multiple?'context_'+String(ci).padStart(4,'0')+'__':'';
   arrays.push(...['luminance','luminance_jpeg','votes','votes_jpeg','mask_f','mask_f_reg','mask_m','mask_m_reg','grid_log10_nfa'].map(key=>{const floating=key.startsWith('luminance')||key==='grid_log10_nfa',count=key==='grid_log10_nfa'?64:n;return{key:prefix+key,count,elementBytes:floating?8:4,descr:floating?'<f8':'<i4',shape:key==='grid_log10_nfa'?[64]:[height,width],async read(bytes,first,length){const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);if(key==='grid_log10_nfa'){for(let i=0;i<length;i++)view.setFloat64(i*8,context.grid_log10_nfa[first+i],true);return;}input??=new Uint8Array(65536);const part=input.subarray(0,length);await planes[key].readInto(part,first);for(let i=0;i<length;i++)if(floating)view.setFloat64(i*8,part[i],true);else view.setInt32(i*4,key.startsWith('votes')&&part[i]===255?-1:part[i],true);}};}));
  }
  const metadata=multiple?{...analysis.metadata,scientificArrays:contexts.map((c,i)=>({id:c.id,prefix:'context_'+String(i).padStart(4,'0')+'__',bounds:c.bounds,originalBounds:c.originalBounds,shape:[c.analysis.height,c.analysis.width],nativeMetadata:c.analysis.metadata,gridCoordinateSpace:'native-context'}))}:analysis.metadata;
  return await streamScientificNpz(arrays,metadata,provenance,{...request,progressPhase:'zero-npz'},hooks);
 }catch(error){failed=true;primary=error;throw error;}finally{try{await release?.();}catch(error){if(!failed)throw error;}}
}
