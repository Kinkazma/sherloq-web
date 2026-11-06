import {requireValue} from './errors.js';
import {streamScientificNpz} from './scientific-npz-stream.js';
// Borrowed fields remain alive during assembly. The completed archive owns its
// stores independently of the engine, source, and filtered result.
export async function exportDenseNpz(result,request={},options={}){
 requireValue(result?.status==='ok'&&Array.isArray(result.dense_maps),'A completed dense result is required.');
 const arrays=[],maps=[];
 const add=(key,value,descr,shape)=>{if(!value)return;const elementBytes=Number(descr.slice(2)),count=shape.reduce((a,b)=>a*b,1);requireValue(value.byteLength===count*elementBytes,'Dense export shape differs from its field.');arrays.push({key,descr,shape,count,elementBytes,read(bytes,first){if(ArrayBuffer.isView(value))bytes.set(new Uint8Array(value.buffer,value.byteOffset+first*elementBytes,bytes.length));else return value.readInto(bytes,first*elementBytes);}});};
 add('points',result.points,'<f4',[result.points.length/7,7]);add('pairs',result.pairs,'<f8',[result.pairs.length/4,4]);add('colors',result.colors,'|u1',[result.colors.length/3,3]);add('pair_search_regions',result.pair_search_regions,'<i4',[result.pair_search_regions.length]);add('pair_algorithms',result.pair_algorithms,'|u1',[result.pair_algorithms.length]);
 for(let i=0;i<result.groups.length;i++)add('group_'+i,result.groups[i],'<u4',[result.groups[i].length]);
 for(let i=0;i<result.dense_maps.length;i++){
  const f=result.dense_maps[i],shape=[f.height,f.width],prefix='field_'+i+'_';
  add(prefix+'targets',f.targets,'<i4',shape);add(prefix+'distances_squared',f.distancesSquared,'<f4',shape);add(prefix+'allowed',f.allowed,'|u1',shape);add(prefix+'selected',f.selected,'|u1',shape);add(prefix+'errors',f.errors,'<f4',shape);add(prefix+'display_rows',f.displayRows,'<i4',[f.displayRows.length]);
  maps.push({prefix,width:f.width,height:f.height,shift:f.shift,pass:f.pass,context:f.context,comparisons:String(f.comparisons),uniqueLinks:f.uniqueLinks,denseCount:f.denseCount});
 }
 const metadata={schema:1,coordinates:'original-source-pixels',params:result.params,geometry:result.geometry,models:result.models,bases:result.bases,group_algorithms:result.group_algorithms,group_variants:result.group_variants,group_frames:result.group_frames,mirror_policy:result.mirror_policy,extension_bins:result.extension_bins,dense_count:result.dense_count,dense_consistent_count:result.dense_consistent_count,candidate_comparisons:String(result.candidate_comparisons),maps};
 const archive=await streamScientificNpz(arrays,metadata,request.provenance??{}, {...request,metadataSerialization:'python'},options);let released=false;
 return {...archive,async release(){if(released)return;released=true;try{await archive.store.dispose();}finally{await archive.session?.dispose();}}};
}
