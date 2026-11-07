import {resamplingAnalysisParams} from './unified-engine/src/resampling-analysis.js';

const OP='tampering.resampling',COLUMNS=['frequency_y','frequency_x','magnitude'];
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const invalid=message=>Object.assign(new TypeError(message),{code:'INVALID_INPUT'});
const positive=value=>Number.isSafeInteger(value)&&value>0;
function selected(output,view={}){
 const maps=output?.data?.fourier;if(output?.operation!==OP||!Array.isArray(maps)||!maps.length)return null;
 const wanted=view.id??view.layerId??'fourier0',id=wanted===OP?'fourier0':wanted;
 const map=maps.find(value=>value?.id===id);if(!map)return null;
 const name=map.magnitudeTable??id+'_magnitude',table=output.tables?.[name]??output.tableSurfaces?.[name];
 return{map,table,id,name};
}
function nativeBasis(params,localization){
 if(!params||typeof params!=='object')return null;
 let value=params;
 if(localization){
  if(localization.schema!=='sherloq.source-region-localization/1'||localization.operation!==OP||localization.coordinates!=='source-region-native'||!localization.originalCoordinates||!same(localization.nativeCoordinates,{regions:params.regions??null,fourierRegions:params.fourierRegions??[]}))return null;
  value={...params,...localization.originalCoordinates};
 }
 const p=resamplingAnalysisParams(value),{gamma,rescale,...fourier}=p.fourier;
 return{...p,fourier};
}
/** Metadata-only admission. No table, RGB, codec or engine entry point. */
export function resamplingContextPreviewContract({output,source,domain,task,field}={}){
 if(task?.operation!==OP||output?.operation!==OP||!['fourier.gamma','fourier.rescale'].includes(field)||!source||!domain)return null;
 // Public parameter events omit imageId; ToolClient binds their validated
 // domain to its current source before calling this metadata-only contract.
 if(!['auto','cpu'].includes(task.backend??'auto')||output.imageId!==source.id||task.imageId!==undefined&&task.imageId!==source.id)return null;
 const d=output.data??{},prior=output.provenance,descriptor=domain.descriptor??domain,old=output.sourceRegionDomain,grid=source.surface,sha=domain.sourceSha256??descriptor.snapshot?.sourceSha256,sw=domain.sourceWidth??descriptor.snapshot?.width,sh=domain.sourceHeight??descriptor.snapshot?.height;
 if(d.stage!=='fourier'||!prior||prior.originalSha256!==source.sha256||sha!==source.sha256||old?.fingerprint!==descriptor.fingerprint||old.snapshot?.sourceSha256!==source.sha256||d.sourceRegionFingerprint!==descriptor.fingerprint||grid?.width!==sw||grid?.height!==sh)return null;
 if(old.snapshot?.width!==sw||old.snapshot?.height!==sh||old.width!==descriptor.width||old.height!==descriptor.height||!same(old.origin,descriptor.origin))return null;
 const localization=output.sourceRegionLocalization??prior.sourceRegionLocalization;
 if(localization&&(localization.domainFingerprint!==descriptor.fingerprint||localization.originalSha256!==source.sha256||localization.width!==descriptor.width||localization.height!==descriptor.height||!same(localization.origin,descriptor.origin)||!same(localization.originalGrid,[sw,sh])))return null;
 let before,after;try{before=nativeBasis(prior.params,localization);after=nativeBasis(task.params);}catch{return null;}
 if(!before||!same(before,after)||after.stage!=='fourier')return null;
 const value=selected(output,task.view);if(!value)return null;
 const {map,table,id}=value,side=map.geometry?.outputSide;
 if(map.status!=='analysed'||!positive(side)||side>16384||!Number.isFinite(map.minimumMagnitude)||!Number.isFinite(map.maximumMagnitude)||map.minimumMagnitude<0||map.maximumMagnitude<map.minimumMagnitude)return null;
 if(!table||typeof table.id!=='string'||!positive(table.revision)||table.format!=='float64-table'||table.coordinates!=='frequency'||table.gridWidth!==side||table.gridHeight!==side||table.rowCount!==side*side||!same(table.columns,COLUMNS))return null;
 const layer=output.layers?.find(layer=>layer.id===id);
 if(!layer||!['frequency-grid','independent-native-frequency-grid'].includes(layer.coordinates)||!same(layer.origin,[0,0]))return null;
 const identity=JSON.stringify(['resampling-retained-frequency/1',source.id,source.sha256,domain.fingerprint,output.id,id,table.id,table.revision,side]);
 return Object.freeze({output,map,table,id,side,identity,sourceSha256:source.sha256,domainFingerprint:domain.fingerprint});
}
/** Preserve the historical one-layer resolver, with an optional verified basis. */
export function selectResamplingPreviewOutput(output,view={},contract){
 if(output?.operation!==OP)return output;
 const value=selected(output,view);if(!value)return null;
 if(contract&&(contract.output!==output||contract.map!==value.map||contract.table!==value.table||contract.id!==value.id))throw invalid('Retained Fourier context changed before its preview.');
 const {map,table,id}=value;
 return{...output,data:{...output.data,...map},tableSurfaces:{magnitude:table},resamplingFrequencyContext:{id,identity:contract?.identity??JSON.stringify([output.id,output.imageId,output.provenance?.originalSha256??null,output.sourceRegionDomain?.fingerprint??null,id,table?.id,table?.revision,map.geometry])}};
}
export function resamplingMagnitudeCacheKey(output,table,g){return JSON.stringify(['retained-magnitude/1',output?.resamplingFrequencyContext?.identity??null,output?.id,output?.imageId,output?.provenance?.originalSha256??null,output?.sourceRegionDomain?.fingerprint??null,table.id,table.revision,g.w,g.h,g.step,g.width,g.height]);}
/** Validate/copy a bounded native table page without changing its Float64 data. */
export function copyResamplingMagnitudePage(answer,{contract,table,offset,length,side,step,width,target,targetOffset}){
 if(contract){
  if(table!==contract.table||side!==contract.side||answer?.tableId!==table.id||answer?.revision!==table.revision||answer.offset!==offset||answer.length!==length||answer.totalRows!==table.rowCount||!same(answer.columns,COLUMNS))throw invalid('Retained Fourier magnitude page belongs to another table or grid.');
 }
 const columns=answer?.columns?.length??3;
 if(!(answer?.data instanceof Float64Array)||answer.data.length!==length*columns){if(contract)throw invalid('Retained Fourier magnitude page has an invalid Float64 shape.');return false;}
 if(contract)for(let i=0;i<length;i++){
  const at=i*3,value=answer.data[at+2];
  if(answer.data[at]!==Math.floor((offset+i)/side)||answer.data[at+1]!==((offset+i)%side)||!Number.isFinite(value)||value<0)throw invalid('Retained Fourier magnitude contains invalid coordinates or values.');
 }
 for(let x=0;x<width;x++)target[targetOffset+x]=answer.data[x*step*columns+columns-1];
 return true;
}
