import {EngineError,requireValue} from './errors.js';
// NumPy NPY 1.0 in a stored ZIP; shapes/types retained, no pickle payloads.
// Specification: https://numpy.org/doc/stable/reference/generated/numpy.lib.format.html
const encoder=new TextEncoder(),littleEndian=new Uint8Array(new Uint32Array([1]).buffer)[0]===1;
const crcTable=Uint32Array.from({length:256},(_,n)=>{let c=n;for(let j=0;j<8;j++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
function crc32(bytes){let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
function header(descr,shape){let text="{'descr': '"+descr+"', 'fortran_order': False, 'shape': ("+shape.join(', ')+(shape.length===1?',':'')+")}";text+=' '.repeat((64-(10+text.length+1)%64)%64)+'\n';const b=new Uint8Array(10+text.length);b.set([147,78,85,77,80,89,1,0]);new DataView(b.buffer).setUint16(8,text.length,true);b.set(encoder.encode(text),10);return b;}
export function zeroNpz(result,maxBytes){
 const d=result.data;requireValue(Number.isInteger(d?.width)&&Number.isInteger(d.height)&&d.width>0&&d.height>0,'ZERO array geometry required.');const n=d.width*d.height,entries=[];
 for(const key of ['luminance','luminance_jpeg','votes','votes_jpeg','mask_f','mask_f_reg','mask_m','mask_m_reg','grid_log10_nfa']){
  const value=d[key],floating=key.startsWith('luminance')||key==='grid_log10_nfa',shape=key==='grid_log10_nfa'?[64]:[d.height,d.width];requireValue(value instanceof (floating?Float64Array:Int32Array)&&value.length===(shape.length===1?64:n),'Invalid ZERO export array.');entries.push({key,value,header:header(floating?'<f8':'<i4',shape),bytes:value.byteLength,floating});
 }
 return writeNpz(result,maxBytes,entries);
}
export function noisesnifferNpz(result,maxBytes){
 const d=result.data;requireValue(Number.isInteger(d?.width)&&Number.isInteger(d.height)&&d.width>0&&d.height>0,'Noisesniffer array geometry required.');const n=d.width*d.height,entries=[];
 for(const key of ['mask','distribution','all_blocks','low_noise_blocks','selected','low_noise']){
  const value=d[key],indices=key==='selected'||key==='low_noise',floating=key==='all_blocks'||key==='low_noise_blocks',rgb=key==='distribution';
  const Type=indices?Uint32Array:floating?Float64Array:Uint8Array,shape=indices?[value?.length]:floating?[d.gridHeight,d.gridWidth]:rgb?[d.height,d.width,3]:[d.height,d.width];
  requireValue(value instanceof Type&&shape.every(v=>Number.isSafeInteger(v)&&v>=0)&&value.length===shape.reduce((a,b)=>a*b,1),'Invalid Noisesniffer export array.');
  entries.push({key,value,header:header(indices?'<i8':floating?'<f8':'|u1',shape),bytes:indices?value.length*8:value.byteLength,floating,int64:indices,bgr:rgb});
 }
 return writeNpz(result,maxBytes,entries);
}
export function energyNpz(result,maxBytes){
 const d=result.data;requireValue(Number.isInteger(d?.width)&&Number.isInteger(d.height)&&d.width>0&&d.height>0,'Energy array geometry required');const n=d.width*d.height,entries=[];
 for(const key of ['energy_planes','energy_low_score','energy_high_score','energy_scope','energy_labels']){
  const value=d[key],floating=key!=='energy_scope'&&key!=='energy_labels',shape=key==='energy_planes'?[3,d.height,d.width]:[d.height,d.width];
  requireValue(value instanceof(floating?Float32Array:Int32Array)&&value.length===(key==='energy_planes'?3*n:n),'Invalid energy export array');
  entries.push({key,value,header:header(floating?'<f4':'<i4',shape),bytes:value.byteLength,floating});
 }
 return writeNpz(result,maxBytes,entries);
}
export function elaCellNpz(result,maxBytes){
 const d=result.data,shape=[d.rows,d.cols],entries=[];
 requireValue(shape.every(v=>Number.isInteger(v)&&v>0),'ELA cell geometry required');
 const dimensions={content:[6],profiles:[3,5],signed_scores:[3,5],quality_scores:[3],background_profiles:[3,3],background_quality_scores:[3],background_signed_scores:[3,3],background_reference:[3,3],ghost_phase:[2],ghost_curves:[71]};
 for(const key of ['score','legacy_score','coherent_score','quality_scores','signed_scores','profiles','content','peer_count','supported','labels','background_profiles','background_score','background_quality_scores','background_signed_scores','background_reference','background_peer_count','background_supported','pre_background_score','ela_score','ghost_score','ghost_quality','ghost_phase','ghost_curves','ghost_peer_count','ghost_supported']){
  const value=d[key];if(value===undefined)continue;
  const dims=[...shape,...(dimensions[key]??[])],floating=value instanceof Float32Array,descr=floating?'<f4':value instanceof Int32Array?'<i4':value instanceof Int16Array?'<i2':value instanceof Uint8Array?'|u1':null;
  requireValue(descr&&value.length===dims.reduce((a,b)=>a*b,1),'Invalid ELA cell export array');entries.push({key,value,header:header(descr,dims),bytes:value.byteLength,floating});
 }
 return writeNpz(result,maxBytes,entries);
}
export function d2prlNpz(result,maxBytes){
 const d=result.data;requireValue(Number.isInteger(d?.width)&&Number.isInteger(d.height)&&d.width>0&&d.height>0,'D2PRL array geometry required');const n=d.width*d.height,entries=[];
 if(d.rawGrids!==undefined){
  requireValue(Array.isArray(d.rawGrids)&&d.rawGrids.length>0&&d.rawGrids.length<=256,'D2PRL raw grids required');
  for(const [i,grid] of d.rawGrids.entries()){
   requireValue(grid.raw instanceof Float32Array&&grid.raw.length===3*448**2,'D2PRL raw grid shape');
   for(const [plane,name] of ['union','target','source'].entries()){const value=grid.raw.subarray(plane*448**2,(plane+1)*448**2);entries.push({key:'raw_'+name+'_'+i,value,header:header('<f4',[448,448]),bytes:value.byteLength,floating:true});}
  }
  return writeNpz(result,maxBytes,entries);
 }
 for(const key of ['map','mask','target','source','analyzed','candidates']){
  const value=d[key],floating=['map','target','source'].includes(key);
  requireValue(value instanceof(floating?Float32Array:Uint8Array)&&value.length===n,'Invalid D2PRL export array');
  entries.push({key,value,header:header(floating?'<f4':'|u1',[d.height,d.width]),bytes:value.byteLength,floating});
 }
 return writeNpz(result,maxBytes,entries);
}
export function truforNpz(result,maxBytes,writer=writeNpz){
 const d=result.data,n=d.width*d.height,entries=[];
 requireValue(Number.isSafeInteger(n)&&n>0,'Invalid TruFor geometry.');
 for(const [key,field] of [['map','map'],['conf','confidence'],['np++','noiseprint_pp']]){
  const value=d[field],segmented=typeof value?.readBytes==='function'&&value.channels===1;
  requireValue((value instanceof Float32Array||segmented&&writer!==writeNpz)&&value.length===n,'Invalid TruFor export array; segmented results require the asynchronous export stream.');
  entries.push({key,value,header:header('<f4',[d.height,d.width]),bytes:value.byteLength,floating:true,segmented});
 }
 requireValue(Number.isFinite(d.score),'Invalid TruFor score.');
 entries.push({key:'score',value:new Float64Array([d.score]),header:header('<f8',[]),bytes:8,floating:true});
 entries.push({key:'imgsize',value:new Uint32Array([d.height,d.width]),header:header('<i8',[2]),bytes:16,int64:true});
 return writer(result,maxBytes,entries);
}
export function compositeNpz(result,maxBytes,writer=writeNpz){
 const d=result.data,entries=[];
 for(const key of ['gray','noise','noise_rgb','map','valid','range0','range1','raster','map_rgb','Sigma','mu','L','eigs','outliersNlogl','outliersProb','curve','model_conditioning','covariance_regularizations','pca_regularized_components','covariance_reference_scale']){
  const value=d[key];if(value===undefined)continue;
  const segmented=typeof value?.readBytes==='function',floating=value instanceof Float32Array||value instanceof Float64Array||segmented&&['Float32Array','Float64Array'].includes(value.elementType),int64=value instanceof Int32Array||value instanceof BigInt64Array;
  requireValue((floating||int64||value instanceof Uint8Array||segmented&&value.elementType==='Uint8Array')&&(!segmented||writer!==writeNpz),'Invalid Composite export type; segmented results require asynchronous streaming.');
  const shape=d.statisticsShapes?.[key]??(key==='curve'?[100]:key.endsWith('_rgb')?[d.height,d.width,3]:[d.height,d.width]);
  requireValue(shape.reduce((n,v)=>n*v,1)===value.length,'Invalid Composite export shape.');
  entries.push({key,value,header:header(int64?'<i8':floating?(value.BYTES_PER_ELEMENT===4?'<f4':'<f8'):'|u1',shape),bytes:int64?value.length*8:value.byteLength,floating,int64,segmented});
 }
 entries.push({key:'model',value:new Int32Array([d.model]),header:header('<i8',[]),bytes:8,int64:true});
 return writer(result,maxBytes,entries);
}
export function catnetNpz(result,maxBytes,writer=writeNpz){
 const d=result.data,entries=[];
 for(const [key,shape] of [['map',[d.height,d.width]],['native_map',d.nativeShape]]){
  const value=d[key],segmented=typeof value?.readBytes==='function';requireValue((value instanceof Float32Array||segmented&&writer!==writeNpz)&&Array.isArray(shape)&&shape.length===2&&shape.reduce((a,b)=>a*b,1)===value.length,'Invalid CAT-Net export; segmented results require asynchronous streaming.');
  entries.push({key,value,header:header('<f4',shape),bytes:value.byteLength,floating:true,segmented});
 }
 return writer(result,maxBytes,entries);
}
function writeNpz(result,maxBytes,entries){
 function jsonBound(v){if(v===null||typeof v!=='object')return typeof v==='string'?v.length*6+2:32;return Object.entries(v).reduce((n,[k,x])=>n+k.length*6+jsonBound(x)+4,2);}
 const d=result.data;
 const admission=32768+entries.reduce((n,e)=>n+e.bytes,0)+4*(jsonBound(d.metadata)+jsonBound(result.provenance));if(admission>maxBytes)throw new EngineError('MEMORY_LIMIT','NPZ export exceeds its conservative preparation budget.');
 for(const [key,value] of [['metadata_json',d.metadata],['browser_provenance_json',result.provenance]]){const points=Array.from(JSON.stringify(value),x=>x.codePointAt(0));entries.push({key,points,header:header('<U'+points.length,[]),bytes:points.length*4});}
 let total=22;for(const e of entries){e.name=encoder.encode(e.key+'.npy');e.size=e.header.length+e.bytes;total+=30+46+e.name.length*2+e.size;}
 if(total>maxBytes||total>0xffffffff)throw new EngineError('MEMORY_LIMIT','NPZ export exceeds its byte budget.');
 const out=new Uint8Array(total),view=new DataView(out.buffer);let at=0;
 for(const e of entries){e.offset=at;view.setUint32(at,0x04034b50,true);view.setUint16(at+4,20,true);view.setUint16(at+12,33,true);view.setUint32(at+18,e.size,true);view.setUint32(at+22,e.size,true);view.setUint16(at+26,e.name.length,true);out.set(e.name,at+30);const start=at+30+e.name.length;out.set(e.header,start);const data=start+e.header.length;
  if(e.points)e.points.forEach((v,i)=>view.setUint32(data+i*4,v,true));
  else if(e.int64)for(let i=0;i<e.value.length;i++)view.setBigInt64(data+i*8,BigInt(e.value[i]),true);
  else if(e.bgr)for(let i=0;i<e.value.length;i+=3){out[data+i]=e.value[i+2];out[data+i+1]=e.value[i+1];out[data+i+2]=e.value[i];}
  else if(littleEndian||e.value.BYTES_PER_ELEMENT===1)out.set(new Uint8Array(e.value.buffer,e.value.byteOffset,e.value.byteLength),data);
  else for(let i=0;i<e.value.length;i++)if(e.floating){if(e.value.BYTES_PER_ELEMENT===4)view.setFloat32(data+i*4,e.value[i],true);else view.setFloat64(data+i*8,e.value[i],true);}else if(e.value.BYTES_PER_ELEMENT===2)view.setInt16(data+i*2,e.value[i],true);else view.setInt32(data+i*4,e.value[i],true);
  e.crc=crc32(out.subarray(start,start+e.size));view.setUint32(at+14,e.crc,true);at=start+e.size;
 }
 const central=at;
 for(const e of entries){view.setUint32(at,0x02014b50,true);view.setUint16(at+4,20,true);view.setUint16(at+6,20,true);view.setUint16(at+14,33,true);view.setUint32(at+16,e.crc,true);view.setUint32(at+20,e.size,true);view.setUint32(at+24,e.size,true);view.setUint16(at+28,e.name.length,true);view.setUint32(at+42,e.offset,true);out.set(e.name,at+46);at+=46+e.name.length;}
 view.setUint32(at,0x06054b50,true);view.setUint16(at+8,entries.length,true);view.setUint16(at+10,entries.length,true);view.setUint32(at+12,at-central,true);view.setUint32(at+16,central,true);return {mime:'application/zip',bytes:out};
}

// Shared NPY1.0 framing for progressive scientific exports (M5/8d4ce76).
export {header as npyHeader};
export function cfaNpz(result,maxBytes,writer=writeNpz){
 const d=result.data,[h,w]=d.gridShape,entries=[];
 for(const [key,shape]of [['probabilities',[4,4,h,w]],['grids',[4,h,w]],['local_grid',[h,w]],['suspicion',[h,w]]]){
  const value=d[key],floating=key!=='local_grid';requireValue(value instanceof(floating?Float32Array:Uint8Array)&&value.length===shape.reduce((a,b)=>a*b,1),'Invalid CFA export.');
  entries.push({key,value,header:header(floating?'<f4':'|u1',shape),bytes:value.byteLength,floating});
 }
 return writer(result,maxBytes,entries);
}

export function forgeryscopeNpz(result,maxBytes,writer=writeNpz){
 const d=result,entries=[];
 for(const key of ['map','mask','candidates','geometric','branch_microscopy','branch_blots','branch_lanes']){
  const value=d[key];if(value===undefined)continue;const floating=key==='map',segmented=typeof value?.readBytes==='function';requireValue((value instanceof(floating?Float32Array:Uint8Array)||segmented&&writer!==writeNpz&&value.elementType===(floating?'Float32Array':'Uint8Array'))&&value.length===d.width*d.height,'Invalid Forgeryscope export; segmented results require asynchronous streaming.');entries.push({key,value,header:header(floating?'<f4':'|u1',[d.height,d.width]),bytes:value.byteLength,floating,segmented});
 }
 return writer({data:d,provenance:result.provenance},maxBytes,entries);
}
export function m3Npz(result,maxBytes){
 const d=result.data,entries=[],sparse=result.operation==='tampering.copyMove.sparse';
 const add=(key,value,shape,int64=false)=>{const floating=value instanceof Float32Array||value instanceof Float64Array,descr=int64?'<i8':value instanceof Float64Array?'<f8':value instanceof Float32Array?'<f4':value instanceof Uint8Array?'|u1':value instanceof Uint32Array?'<u4':'<i4';requireValue(ArrayBuffer.isView(value)&&shape.reduce((a,b)=>a*b,1)===value.length,'Invalid M3 NPZ shape.');entries.push({key,value,header:header(descr,shape),bytes:int64?value.length*8:value.byteLength,floating,int64});};
 let metadata=d.metadata;
 if(sparse){
  // Admit the native JSON mirror before materializing its nested JS arrays.
  const bound=v=>ArrayBuffer.isView(v)?v.length*32+2:v===null||typeof v!=='object'?typeof v==='string'?v.length*6+2:32:Object.entries(v).reduce((n,[k,x])=>n+k.length*6+bound(x)+4,2);
  if(32768+4*(bound(d)+bound(result.provenance)+bound(result.style)+bound(result.visible))>maxBytes)throw new EngineError('MEMORY_LIMIT','Sparse NPZ metadata exceeds its preparation budget.');
  add('points',d.points,[d.points.length/7,7]);add('pairs',d.pairs,[d.pairs.length/4,4]);add('colors_bgr',d.colors,[d.colors.length/3,3]);add('pair_search_regions',d.pair_search_regions,[d.pair_search_regions.length],true);
  metadata={...d.metadata,version:2,algorithm:d.params.algorithm,parameters:d.params,zones:d.regions,compare:d.compare,points:Array.from({length:d.points.length/7},(_,i)=>Array.from(d.points.subarray(i*7,i*7+7))),pairs:Array.from({length:d.pairs.length/4},(_,i)=>Array.from(d.pairs.subarray(i*4,i*4+4))),pair_columns:['point_a','point_b','descriptor_distance','length_px'],biomes:d.groups.map(g=>Array.from(g)),colors_bgr:Array.from({length:d.colors.length/3},(_,i)=>Array.from(d.colors.subarray(i*3,i*3+3))),biome_colors_bgr:d.bases,geometric_models:d.models,display:result.style,visible_biomes:result.visible,preprocessing:d.preprocessing,distance_policy:d.distance_policy,biome_partitions:d.biome_partitions,self_match_filter:d.self_match_filter,rejected_biomes:d.rejected_biomes,feature_policy:d.feature_policy,backend:d.backend,pair_search_regions:Array.from(d.pair_search_regions),limits:'Potential correspondences, not proof of forgery. Biome hulls are not exact segmentations.'};
 }else{
  const shape=d.metadata.native_shape;add('map',d.map,shape);
  if(d.mask)add('mask',d.mask,shape);
  if(d.features)add('features',d.features,[4096,288]);
  if(d.source_probabilities){add('source_probabilities',d.source_probabilities,[d.metadata.sources,...shape]);add('source_labels',d.source_labels,shape);add('prompt_features',d.prompt_features,[d.prompt_confidence.length,256]);add('prompt_confidence',d.prompt_confidence,[d.prompt_confidence.length]);add('prompt_clusters',d.prompt_clusters,[d.prompt_confidence.length],true);add('points',d.points,[d.points.length/2,2]);}
 }
 return writeNpz({...result,data:{metadata}},maxBytes,entries);
}
