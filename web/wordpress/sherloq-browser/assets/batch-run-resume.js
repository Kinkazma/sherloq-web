import {compactEvidence} from './batch-evidence.js';
import {readBatchZip} from './batch-zip.js';
import {createExportSink} from './export-sink.js';
import {npyHeader} from './unified-engine/src/npz.js';
import {scientificZipPlan,scientificZipLocal,scientificZipCentral,scientificZipEnd} from './unified-engine/src/scientific-zip.js';

export const BATCH_RESUME_SCHEMA='sherloq.batch-run-resume/1';
export const BATCH_RESUME_PLAN_SCHEMA='sherloq.batch-resume-plan/1';
const EVIDENCE_SCHEMA='sherloq.batch-resume-evidence/1',CHUNK=1024**2;
const check=signal=>signal?.throwIfAborted();
const fail=message=>Object.assign(Error(message),{code:'BATCH_RESUME_INVALID'});
const sha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
export const batchResumeKey=value=>JSON.stringify(canonical(value));
export function batchScientificSignature(image,configuration){
 const pair=configuration?.pairSelections?.[image.hash],preparation=configuration?.scientificPreparations?.[image.id];
 return batchResumeKey({recipes:(configuration?.recipes??[]).map(r=>({operation:r.operation,params:r.params,signal:r.signal,backend:r.backend??'auto',view:r.view??null})).sort((a,b)=>batchResumeKey(a).localeCompare(batchResumeKey(b))),panels:!!configuration?.options?.panels,scientificFiltering:configuration?.options?.scientificFiltering??false,pair:pair?{pixelHash:pair.pixelHash,width:pair.width,height:pair.height,regions:pair.regions}:null,preparation:preparation??null,scopeGeometry:configuration?.options?.scientificFiltering?{regions:image.preparation?.regions,searchRegions:image.preparation?.searchRegions,excluded:image.preparation?.excluded}:null,displayPolicy:configuration?.displayPolicy??null,resumePolicy:configuration?.resumePolicy??null});
}
export const batchRunRecipeSignature=recipe=>batchResumeKey({operation:recipe.operation,params:recipe.params,signal:recipe.signal,backend:recipe.backend??'auto',view:recipe.view??null});
export function batchResumeImageCompatible(image,configuration,engine){
 const state=image.resumeState;
 return state?.schema===BATCH_RESUME_SCHEMA&&state.pixelHash===image.hash&&state.width===image.width&&state.height===image.height&&state.sourceSha256===(image.sourceSha256??image.preparation?.sourceSha256)&&state.scientificSignature===batchScientificSignature(image,configuration)&&batchResumeKey(image.restored?.engine)===batchResumeKey(engine);
}
export function batchPlannedIdentity(image,configuration){
 const sourceSha256=image.sourceSha256??image.preparation?.sourceSha256;
 if(!sha(sourceSha256)||!Number.isSafeInteger(image.width)||!Number.isSafeInteger(image.height)||image.width<1||image.height<1)throw fail('Identité originale du plan de reprise absente.');
 return {imageId:image.id,pixelHash:image.hash,width:image.width,height:image.height,sourceSha256,scientificSignature:batchScientificSignature(image,configuration)};
}
// Older stopped attempts already froze every selected preparation, but did
// not mark the still-pending images. Availability uses this declared context;
// execution additionally recomputes pending scope fingerprints and source SHA.
export function batchResumePlan(model,selected=model.images.filter(image=>image.selected)){
 if(model.resumePlan!==undefined)return model.resumePlan?.schema===BATCH_RESUME_PLAN_SCHEMA&&Array.isArray(model.resumePlan.units)?model.resumePlan:null;
 const configuration=model.configuration;
 if(configuration?.resumePolicy?.schema!==BATCH_RESUME_SCHEMA||configuration.options?.scientificFiltering!==true||typeof model.startedAt!=='string'||!model.engine||!selected.some(image=>batchResumeImageCompatible(image,configuration,model.engine)))return null;
 const units=[];
 for(const image of selected){const frozen=configuration.scientificPreparations?.[image.id],scope=image.preparation;
  if(!frozen||!scope||frozen.fingerprint!==scope.fingerprint||frozen.sourceSha256!==scope.sourceSha256||frozen.sourceSha256!==image.sourceSha256||frozen.schema!==scope.schema||frozen.version!==scope.version||batchResumeKey(frozen.models)!==batchResumeKey(scope.models))return null;
  const started=batchResumeImageCompatible(image,configuration,model.engine);try{units.push({...batchPlannedIdentity(image,configuration),started,...(!started?{verifyScopeFingerprint:true}:{})});}catch{return null;}
 }
 return {schema:BATCH_RESUME_PLAN_SCHEMA,version:1,runId:'migrated-'+model.startedAt,engine:structuredClone(model.engine),units,migratedFromFrozenContext:true};
}
export function batchResumePlanCompatible(plan,selected,configuration,engine){
 if(plan?.schema!==BATCH_RESUME_PLAN_SCHEMA||typeof plan.runId!=='string'||!Array.isArray(plan.units)||plan.units.length!==selected.length||batchResumeKey(plan.engine)!==batchResumeKey(engine)||new Set(plan.units.map(unit=>unit.imageId)).size!==plan.units.length)return false;
 try{return selected.every(image=>{const unit=plan.units.find(unit=>unit.imageId===image.id);return unit&&typeof unit.started==='boolean'&&batchResumeKey(batchPlannedIdentity(image,configuration))===batchResumeKey(Object.fromEntries(['imageId','pixelHash','width','height','sourceSha256','scientificSignature'].map(key=>[key,unit[key]])));});}catch{return false;}
}
export function pendingBatchResumeImage(model,image){
 const plan=batchResumePlan(model);return !!plan?.units?.some(unit=>unit.imageId===image.id&&unit.started===false);
}
export function currentBatchImages(model){
 const plan=batchResumePlan(model),pending=new Set((plan?.units??[]).filter(unit=>unit.started===false).map(unit=>unit.imageId));
 return model.images.map(image=>pending.has(image.id)?{...image,pendingCurrentAttempt:true,state:'ready',runs:[],score:undefined,finalDisplay:null,resultDisplay:null}:image);
}
export function resumableBatchRun(run,recipe,artifacts){
 if(run.status!=='done'||batchRunRecipeSignature(run)!==batchRunRecipeSignature(recipe)||!Array.isArray(run.files)||!run.files.every(path=>artifacts.has(path)))return false;
 if(run.resumeEvidence?.schema===EVIDENCE_SCHEMA){const files=run.resumeEvidence.files;return typeof files?.metadata==='string'&&run.resumeEvidence.recipeSignature===batchRunRecipeSignature(run)&&Object.values(files).every(path=>typeof path==='string'&&run.files.includes(path)&&artifacts.has(path));}
 // Historical polygonal evidence can be replayed exactly. A contour around a
 // compacted raster mask cannot reconstruct its holes and is never substituted.
 if(run.kind==='automatic'||run.operation==='ai.clones.d2prl'||run.operation==='ai.clones.segmentation'||run.params?.algorithm==='SSG')return false;
 return (run.entries??[]).every(e=>Array.isArray(e.polygons)&&e.polygons.every(poly=>Array.isArray(poly)&&poly.length>=3&&poly.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite))));
}
export async function batchBlobSha256(blob,{signal}={}){
 const {createSHA256}=await import('./unified-engine/vendor/hash-wasm/hashes.js'),hash=await createSHA256();hash.init();
 for(let at=0;at<blob.size;at+=CHUNK){check(signal);hash.update(new Uint8Array(await blob.slice(at,at+CHUNK).arrayBuffer()));}check(signal);return hash.digest('hex');
}
const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
const update=(crc,bytes)=>{for(const b of bytes)crc=crcTable[(crc^b)&255]^(crc>>>8);return crc;};
function identity(image,run){
 const identities=[image.sourceSha256,image.preparation?.sourceSha256,run.provenance?.originalSha256,run.provenance?.originalSourceSha256].filter(value=>value!==undefined&&value!==null),sourceSha256=identities[0];
 if(!sha(sourceSha256)||identities.some(value=>!sha(value)||value!==sourceSha256))throw fail('L’identité encodée originale est absente ou incohérente pour cette reprise.');
 return {pixelHash:image.hash,width:image.width,height:image.height,sourceSha256,scopeFingerprint:image.preparation?.fingerprint??null};
}
export async function saveBatchRunEvidence(image,run,entries,artifacts,path,{signal,sinkFactory=createExportSink}={}){
 const source=identity(image,run),arrays=[],geometry=entries.map((entry,index)=>{
  const clean=compactEvidence(entry),mask=entry.pixel_mask;if(!mask)return clean;
  if(!(mask.data instanceof Uint8Array)||mask.data.length!==mask.width*mask.height)throw fail('Le masque exact de reprise est invalide.');
  const name='mask_'+index+'.npy',header=npyHeader('|u1',[mask.height,mask.width]);arrays.push({name:new TextEncoder().encode(name),size:header.length+mask.data.length,header,data:mask.data});
  return {...clean,resumeMask:{array:name,width:mask.width,height:mask.height,origin:entry.origin}};
 });
 const scientificArrays=arrays.length?path+'.npz':undefined,metadataPath=path+'.json',record={schema:EVIDENCE_SCHEMA,version:1,...source,recipeSignature:batchRunRecipeSignature(run),entries:geometry,...(scientificArrays?{scientificArrays}:{})};
 let sink,output,failure;const created=[];
 try{
  if(arrays.length){
   const plan=scientificZipPlan(arrays);sink=await sinkFactory({memoryBudgetBytes:0,mime:'application/zip',signal});
   for(const array of arrays){check(signal);let crc=update(0xffffffff,array.header);for(let at=0;at<array.data.length;at+=CHUNK){check(signal);const part=array.data.subarray(at,at+CHUNK);if(part.some(value=>value>1))throw fail('Le masque exact de reprise doit être binaire.');crc=update(crc,part);}array.crc=(crc^0xffffffff)>>>0;
    const local=scientificZipLocal(array);new DataView(local.buffer).setUint32(14,array.crc,true);await sink.write(local);await sink.write(array.header);
    for(let at=0;at<array.data.length;at+=CHUNK){check(signal);await sink.write(array.data.subarray(at,at+CHUNK));}
   }
   for(const array of arrays)await sink.write(scientificZipCentral(array));await sink.write(scientificZipEnd(plan));output=await sink.finish();check(signal);await artifacts.set(scientificArrays,output.blob);created.push(scientificArrays);
  }
  const encoded=JSON.stringify(record);if(new TextEncoder().encode(encoded).length>8*CHUNK)throw fail('La géométrie de reprise dépasse la limite de métadonnées.');check(signal);await artifacts.set(metadataPath,new Blob([encoded],{type:'application/json'}));created.push(metadataPath);
  run.resumeEvidence={schema:EVIDENCE_SCHEMA,version:1,...source,recipeSignature:record.recipeSignature,files:{metadata:metadataPath,...(scientificArrays?{scientific:scientificArrays}:{})}};run.files.push(...created);
 }catch(error){failure=error;for(const file of created)try{await artifacts.delete(file);}catch(cleanup){error.cleanupError??=cleanup;}throw error;}
 finally{try{if(output)await output.cleanup?.();else await sink?.abort();}catch(error){if(failure)failure.cleanupError??=error;else throw error;}}
}
export async function restoreBatchRunEvidence(image,run,artifacts,{budget,signal}={}){
 check(signal);const checkpoint=run.resumeEvidence;
 if(!checkpoint)return {entries:structuredClone(run.entries??[]),release(){}};
 const expected=identity(image,run);if(checkpoint.schema!==EVIDENCE_SCHEMA||batchResumeKey(expected)!==batchResumeKey(Object.fromEntries(Object.keys(expected).map(k=>[k,checkpoint[k]])))||checkpoint.recipeSignature!==batchRunRecipeSignature(run))throw fail('Les preuves de reprise appartiennent à une autre source, méthode ou préparation.');
 const blob=await artifacts.get(checkpoint.files.metadata);if(!blob||blob.size>8*CHUNK)throw fail('Les métadonnées de reprise sont absentes ou trop grandes.');const metadata=JSON.parse(await blob.text());
 if(metadata.schema!==EVIDENCE_SCHEMA||metadata.recipeSignature!==checkpoint.recipeSignature||Object.keys(expected).some(k=>metadata[k]!==expected[k])||!Array.isArray(metadata.entries))throw fail('Les métadonnées de reprise sont incohérentes.');
 const leases=[];let zip;
 try{
  leases.push(budget.reserve(blob.size*8));
  if(metadata.scientificArrays!==checkpoint.files.scientific)throw fail('La référence des masques de reprise est incohérente.');
  if(checkpoint.files.scientific){const native=await artifacts.get(checkpoint.files.scientific);if(!native)throw fail('Les masques de reprise sont absents.');zip=await readBatchZip(native,{maximumEntries:metadata.entries.length});if(!zip)throw fail('Archive de masques de reprise invalide.');}
  const entries=[];
  for(const entry of metadata.entries){check(signal);const {resumeMask,...copy}=entry;if(resumeMask){
    const mask=resumeMask;if(!Number.isSafeInteger(mask.width)||!Number.isSafeInteger(mask.height)||mask.width<1||mask.height<1||!Array.isArray(mask.origin)||mask.origin.length!==2||!mask.origin.every(Number.isInteger)||mask.origin[0]<0||mask.origin[1]<0||mask.origin[0]+mask.width>image.width||mask.origin[1]+mask.height>image.height||!/^mask_\d+\.npy$/.test(mask.array))throw fail('Géométrie de masque de reprise invalide.');
    const file=zip?.file(mask.array),header=npyHeader('|u1',[mask.height,mask.width]);if(!file||file._data.compressionMethod!==0||file._data.uncompressedSize!==header.length+mask.width*mask.height)throw fail('Tableau de reprise invalide.');
    const release=budget.reserve(mask.width*mask.height);leases.push(release);const readRelease=budget.reserve(Math.min(CHUNK,mask.width*mask.height)+header.length);let data;
    try{const raw=await file.async('blob'),actual=new Uint8Array(await raw.slice(0,header.length).arrayBuffer());if(actual.some((b,i)=>b!==header[i]))throw fail('En-tête NPY de reprise invalide.');
     data=new Uint8Array(mask.width*mask.height);let crc=update(0xffffffff,actual);
     for(let at=0;at<data.length;at+=CHUNK){check(signal);const part=new Uint8Array(await raw.slice(header.length+at,header.length+Math.min(data.length,at+CHUNK)).arrayBuffer());if(part.some(v=>v>1))throw fail('Les masques de reprise doivent être binaires.');data.set(part,at);crc=update(crc,part);}if(((crc^0xffffffff)>>>0)!==file._data.crc32)throw fail('CRC du masque de reprise invalide.');
    }finally{readRelease();}
    copy.pixel_mask={width:mask.width,height:mask.height,data};copy.origin=mask.origin.slice();
   }else if(!Array.isArray(copy.polygons)||copy.polygons.some(poly=>!Array.isArray(poly)||poly.length<3||poly.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite))))throw fail('Polygone de reprise invalide.');entries.push(copy);
  }
  let released=false;return {entries,release(){if(released)return;released=true;for(const free of leases)free();}};
 }catch(error){for(const free of leases)free();throw error;}
}
