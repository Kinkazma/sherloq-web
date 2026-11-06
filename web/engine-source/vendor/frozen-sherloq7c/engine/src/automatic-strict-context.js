import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from './source-region-geometry.js';
import {prepareNeuralStrictSourceContext} from './neural-strict-source-context.js';
import {sparseStrictImageRecord} from './sparse-strict-source.js';
import {sourceRegionTransportBytes} from './source-region-transport.js';
import {requireValue,checkAbort} from './errors.js';

/** Verified geometry shared by the aggregate's upstream feature providers.
 * A source owner is borrowed, never converted to a black membership raster.
 * The returned context remains caller-owned until every provider has retired. */
export async function prepareAutomaticStrictContext(image,task,{budget,signal}={}){
 requireValue(['analysis.clones','analysis.complete'].includes(task?.operation),'Verified automatic clone or complete strict-context route required.');
 const metadata=budget.reserve(65536+sourceRegionTransportBytes([task,image.sourceRegionDomain??null],{allowAliases:true,allowUndefined:true})*4);let prepared,returned=false;
 try{
  const input=structuredClone(task),record=sparseStrictImageRecord(image,budget),original=record.originalSource??record,d=original.surface.descriptor,local=record.surface.descriptor;
  checkAbort(signal);const domain=record.sourceRegionDomain?await compileOriginalSourceRegions(record.sourceRegionDomain):await compileOriginalSourceRegions((await createOriginalSourceRegionsState({sourceSha256:record.sha256,width:d.width,height:d.height})).snapshot());
  requireValue(domain.sourceSha256===record.sha256&&original.sha256===record.sha256&&domain.sourceWidth===d.width&&domain.sourceHeight===d.height&&domain.width===local.width&&domain.height===local.height,'Automatic strict source differs from the verified Original grid.');
  prepared=await prepareNeuralStrictSourceContext({domain,task:input},{budget,signal});checkAbort(signal);
  let closed=false;returned=true;
  return Object.freeze({source:{...original.surface,sha256:original.sha256},sourceDomain:domain,candidateDomain:prepared.candidateDomain,contextDomain:prepared.contextDomain,origin:[...domain.origin],width:domain.width,height:domain.height,fingerprint:prepared.fingerprint,inputScopeFingerprint:input.params?.scientificScope?.fingerprint??input.scientificScope?.fingerprint,strictExclusions:prepared.strictExclusions,contextRequired:prepared.contextRequired,originalTask:prepared.originalTask,provenance:prepared.provenance,release(){if(closed)return;closed=true;try{prepared.release();}finally{metadata();}}});
 }finally{if(!returned)try{prepared?.release();}finally{metadata();}}
}
