import "../../runtime-context.js?v=0.25.0";
import {requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {sourceRegionTransportBytes} from './source-region-transport.js';
const schema='sherloq.sparse-window-presentation/1';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const shifted=(poly,delta)=>poly.map(([x,y])=>[x+delta[0],y+delta[1]]);
const matrixAtOrigin=(matrix,[x,y])=>{
 requireValue(Array.isArray(matrix)&&matrix.length===3&&matrix.every(row=>Array.isArray(row)&&row.length===3&&row.every(Number.isFinite)),'Native copy matrix must be finite3x3.');
 const [[a,b,c],[d,e,f],[g,h,i]]=matrix,k=g*x+h*y;
 // T(origin)*M*T(-origin), without normalization or a new fit. In particular
 // exact native translations keep their translation coefficients unchanged.
 return [[a+x*g,b+x*h,c+x*(i-a)-y*b-x*k],[d+y*g,e+y*h,f+y*(i-e)-x*d-y*k],[g,h,i-k]];
};
function validate(raw){
 if(raw.status==='no-regions')return{points:0,pairs:0,groups:0,groupRows:0,searchRegions:0};
 requireValue((raw.points instanceof Float64Array||raw.points instanceof Float32Array)&&raw.points.length%7===0&&raw.pairs instanceof Float64Array&&raw.pairs.length%4===0&&Array.isArray(raw.groups)&&Array.isArray(raw.models)&&raw.colors instanceof Uint8Array&&raw.colors.length===raw.pairs.length/4*3&&Array.isArray(raw.bases)&&raw.bases.length===raw.groups.length&&raw.pair_search_regions instanceof Int32Array&&raw.pair_search_regions.length===raw.pairs.length/4,'Complete native sparse fields are required for presentation.');
 const points=raw.points.length/7,pairs=raw.pairs.length/4;let groupRows=0,searchRegions=0;
 for(let row=0;row<pairs;row++){const a=raw.pairs[row*4],b=raw.pairs[row*4+1],region=raw.pair_search_regions[row];requireValue(Number.isSafeInteger(a)&&a>=0&&a<points&&Number.isSafeInteger(b)&&b>=0&&b<points&&region>=-1,'Native pair escapes its own analysis window.');searchRegions=Math.max(searchRegions,region+1);}
 for(const group of raw.groups){requireValue(group instanceof Uint32Array&&group.every(row=>row<pairs),'Native group escapes its own pair rows.');groupRows+=group.length;}
 requireValue(!raw.models.length||raw.models.length===raw.groups.length,'Native model/group alignment changed.');
 return{points,pairs,groups:raw.groups.length,groupRows,searchRegions};
}
/** Presentation only. No native fields are recomputed, dropped or flattened out
 * of dataNatif. The caller retains the carrier and its native outputs through
 * this admitted copy, rendering and acknowledged retirement. */
export async function combineSparseWindowPresentation(answer,{budget,signal,presentationOrigin=[0,0],params={}}={}){
 requireValue(answer?.mode==='independent'&&Array.isArray(answer.windowResults)&&typeof budget?.reserve==='function'&&Array.isArray(presentationOrigin)&&presentationOrigin.length===2&&presentationOrigin.every(Number.isSafeInteger),'Independent native window results and presentation admission required.');checkAbort(signal);
 const input=answer.windowResults,counts=[];let np=0,nm=0,ng=0,ns=0,groupRows=0,extra=65536+input.length*4096+4*sourceRegionTransportBytes(params,{allowAliases:true,allowUndefined:true});let policy,hasPolicy=false;
 for(const entry of input){requireValue(entry&&typeof entry.id==='string'&&['region','envelope'].includes(entry.kind)&&Array.isArray(entry.origin)&&entry.origin.length===2&&entry.origin.every(Number.isSafeInteger)&&['empty','complete'].includes(entry.status),'Canonical window identity/origin/status required.');extra+=4*sourceRegionTransportBytes([entry.id,entry.bounds,entry.origin,entry.polygon,entry.fingerprint,entry.sourceContextIdentity],{allowAliases:true,allowUndefined:true});if(entry.status==='empty'){requireValue(entry.output===null,'Empty window must not carry a native analysis.');counts.push(null);continue;}const raw=entry.output;requireValue(raw&&typeof raw.release==='function','Native sparse result owner required.');if(params.algorithm!==undefined&&raw.params?.algorithm!==undefined)requireValue(raw.params.algorithm===params.algorithm,'Different native methods cannot share a presentation.');const n=validate(raw);counts.push(n);np+=n.points;nm+=n.pairs;ng+=n.groups;ns+=n.searchRegions;groupRows+=n.groupRows;extra+=4*sourceRegionTransportBytes([raw.models??[],raw.bases??[],raw.regions??[],raw.preprocessing?.text_exclusions??[]],{allowAliases:true,allowUndefined:true});if(raw.status!=='no-regions'){if(hasPolicy)requireValue(same(policy,raw.self_match_filter),'Different native display policies need their own window renderer.');else{policy=raw.self_match_filter;hasPolicy=true;}}}
 requireValue([np,nm,ng,ns,groupRows,extra].every(Number.isSafeInteger)&&np<=0xffffffff&&nm<=0xffffffff&&ns<=0x7fffffff,'Sparse presentation index domain exceeds its native array ABI; no window was discarded.');
 const reservedBytes=extra+np*7*8+nm*(4*8+3+4)+groupRows*4;requireValue(Number.isSafeInteger(reservedBytes),'Sparse presentation size is not safe.');const free=budget.reserve(reservedBytes);let complete=false;
 try{
  checkAbort(signal);const points=new Float64Array(np*7),pairs=new Float64Array(nm*4),colors=new Uint8Array(nm*3),pair_search_regions=new Int32Array(nm),groups=[],models=[],bases=[],regions=[],textExclusions=[],windowResults=[],ranges=[],backends=new Set();let po=0,mo=0,go=0,so=0,ro=0,modelOffset=0,totalFeatures=0,candidateComparisons=0;
  for(let index=0;index<input.length;index++){
   checkAbort(signal);const entry=input[index],n=counts[index],delta=entry.origin.map((v,i)=>v-presentationOrigin[i]),description={id:entry.id,kind:entry.kind,bounds:[...entry.bounds],origin:[...entry.origin],polygon:structuredClone(entry.polygon),fingerprint:entry.fingerprint,sourceContextIdentity:entry.sourceContextIdentity,status:entry.status};
   const range={id:entry.id,status:entry.status,pointRows:[po,po],pairRows:[mo,mo],groupRows:[go,go],modelRows:[modelOffset,modelOffset],regionRows:[ro,ro],searchRegionIds:[so,so],nativeOrigin:[...entry.origin],presentationDelta:delta,nativeCoordinates:'window-native-pixel-centres'};
   if(!n){windowResults.push({...description,dataNatif:null});ranges.push(range);continue;}
   const {release,...dataNatif}=entry.output;windowResults.push({...description,dataNatif});const raw=entry.output;
   if(raw.status==='no-regions'){ranges.push(range);continue;}
   for(let row=0;row<n.points;row++){for(let col=0;col<7;col++)points[(po+row)*7+col]=raw.points[row*7+col];points[(po+row)*7]+=delta[0];points[(po+row)*7+1]+=delta[1];}
   pairs.set(raw.pairs,mo*4);for(let row=0;row<n.pairs;row++){pairs[(mo+row)*4]+=po;pairs[(mo+row)*4+1]+=po;const id=raw.pair_search_regions[row];pair_search_regions[mo+row]=id<0?id:id+so;}
   colors.set(raw.colors,mo*3);for(const group of raw.groups)groups.push(Uint32Array.from(group,row=>row+mo));for(const base of raw.bases)bases.push(structuredClone(base));
   for(const model of raw.models){const copy=structuredClone(model);copy.matrix=matrixAtOrigin(model.matrix,delta);for(const name of ['source_point_indices','destination_point_indices']){requireValue(Array.isArray(model[name])||ArrayBuffer.isView(model[name]),'Native geometric point-index field required.');requireValue(Array.from(model[name]).every(v=>Number.isSafeInteger(v)&&v>=0&&v<n.points),'Native geometric model escapes its own point rows.');copy[name]=model[name].map(v=>v+po);}copy.clone_window_id=entry.id;copy.parent_biome_scope='window-native';models.push(copy);}
   for(const poly of raw.regions??[])regions.push(shifted(poly,delta));for(const poly of raw.preprocessing?.text_exclusions??[])textExclusions.push(shifted(poly,delta));
   if(raw.backend)backends.add(raw.backend);totalFeatures+=raw.total_features??n.points;const comparisons=raw.candidate_comparisons??0;requireValue(typeof comparisons==='bigint'?comparisons>=0n:Number.isSafeInteger(comparisons)&&comparisons>=0,'Native comparison counts must retain their exact integer type.');if(typeof comparisons==='bigint'||typeof candidateComparisons==='bigint')candidateComparisons=BigInt(candidateComparisons)+BigInt(comparisons);else{candidateComparisons+=comparisons;requireValue(Number.isSafeInteger(candidateComparisons),'Native comparison count exceeds the exact Number range.');}
   Object.assign(range,{pointRows:[po,po+n.points],pairRows:[mo,mo+n.pairs],groupRows:[go,go+n.groups],modelRows:[modelOffset,modelOffset+raw.models.length],regionRows:[ro,regions.length],searchRegionIds:[so,so+n.searchRegions],nativePointType:raw.points.constructor.name,nativeParentBiomeIndices:'Scoped by clone_window_id; the original native parent labels are retained.'});ranges.push(range);po+=n.points;mo+=n.pairs;go+=n.groups;so+=n.searchRegions;ro=regions.length;modelOffset+=raw.models.length;await controlCheckpoint(signal);
  }
  const data={cloneWindowMode:'independent',status:input.some(x=>x.status==='complete'&&x.output?.status!=='no-regions')?'ok':'no-regions',points,pairs,groups,models,colors,bases,pair_search_regions,regions,params:structuredClone(params),compare:!!params.compare,total_features:totalFeatures,candidate_comparisons:candidateComparisons,feature_policy:'independent_analysis_windows',...(backends.size?{backend:backends.size===1?[...backends][0]:'hybrid'}:{}),self_match_filter:policy,preprocessing:{text_exclusions:textExclusions,windowScoped:true},windowResults,metadata:{cloneWindowMode:'independent',cloneAnalysisWindows:{schema,mode:'independent',fingerprint:answer.fingerprint,presentationOnly:true,nativeData:'windowResults[].dataNatif complete and unchanged; presentation arrays use translated coordinates and scoped offsets only',presentationOrigin:[...presentationOrigin],coordinates:presentationOrigin.some(Boolean)?'source-region-native':'original-pixel-centres',ranges,matchingAcrossWindows:false,normalizationAcrossWindows:false,overlaps:'retained independently',envelope:'separate native analysis when declared'},nativeWindowBackends:windowResults.map(w=>({id:w.id,backend:w.dataNatif?.backend??null}))}};
  checkAbort(signal);let released=false;complete=true;return{data,reservedBytes,release(){if(!released){released=true;free();}}};
 }finally{if(!complete)free();}
}
