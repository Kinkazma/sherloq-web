import {archiveBatchAttempt} from './batch-restoration.js?v=0.25.0';
import {remapBatchEvidence} from './batch-archive-layout.js?v=0.25.0';
import {compactEvidence} from './batch-evidence.js?v=0.25.0';

const invalid=message=>Object.assign(Error(message),{code:'BATCH_SCOPE_INVALIDATION_FAILED'});
const copy=value=>structuredClone(value);
const check=signal=>signal?.throwIfAborted();
const records=image=>[...(image.runs??[]),...(image.finalDisplay?[image.finalDisplay]:[]),...(image.resultDisplay?[image.resultDisplay]:[]),...(image.history??[]).flatMap(attempt=>[...(attempt.runs??[]),...(attempt.finalDisplay?[attempt.finalDisplay]:[]),...(attempt.resultDisplay?[attempt.resultDisplay]:[])])];
function collectReferences(values){
 const files=new Set(),seen=new WeakSet();const visit=value=>{
  if(typeof value==='string'){files.add(value);return;}
  if(!value||typeof value!=='object'||value instanceof Blob||ArrayBuffer.isView(value)||seen.has(value))return;seen.add(value);
  for(const child of Array.isArray(value)?value:Object.values(value))visit(child);
 };for(const value of values)visit(value);return files;
}
export function referencedBatchFiles(model){return collectReferences([...(model.images??[]).flatMap(records),...(model.comparisons??[]),...(model.archivedComparisons??[])]);}
function sourceIdentity(image){return {id:image.id,name:image.name,pixelHash:image.hash,width:image.width,height:image.height,encodedSha256:image.sourceSha256??image.preparation?.sourceSha256,scopeFingerprint:image.preparation?.fingerprint??null,occurrences:copy(image.occurrences??[])};}

/** Archive the PREVIOUS preparation/pair before the UI replaces it. Originals,
 * preparation and selected rectangles are deliberately not changed here.
 * Runs and comparisons stop being current only after file moves have succeeded.
 * A failed write/delete/cancellation restores old keys and leaves the model
 * untouched. Scientific NPZ bytes stay native; JSON external pointers follow
 * the existing history remapper. No model/site/source-image copy is made.
 */
export async function invalidateBatchScopeResults(model,image,{reason='scientific-scope-edited',signal}={}){
 if(!model?.images?.includes(image)||!model.artifacts||!['scientific-scope-edited','pair-edited'].includes(reason)||typeof model.artifacts.has!=='function'||typeof model.artifacts.get!=='function'||typeof model.artifacts.set!=='function'||typeof model.artifacts.delete!=='function')throw invalid('Le lot ou les fichiers à archiver sont invalides.');check(signal);
 const artifacts=model.artifacts,oldRuns=image.runs??[],oldComparisons=model.comparisons??[],source=image.blob,preparation=image.preparation,oldFingerprint=preparation?.fingerprint,oldSelection=image.pairSelection;
 const hasAttempt=oldRuns.length>0||!!image.finalDisplay||!!image.resultDisplay;
 const previous={at:new Date().toISOString(),reason,scientificallyReusable:false,engine:copy(image.restored?.engine??model.engine),configuration:copy(image.restored?.configuration??model.configuration),preparation:copy(preparation),sourceIdentity:sourceIdentity(image),runs:compactEvidence([...oldRuns,...oldComparisons]),score:copy(image.score??null),...(model.startedAt?{startedAt:model.startedAt}:{}),...(model.finishedAt?{finishedAt:model.finishedAt}:{}),...(image.finalDisplay?{finalDisplay:copy(image.finalDisplay)}:{}),...(image.resultDisplay?{resultDisplay:copy(image.resultDisplay)}:{}),...(image.displayPreferences?{displayPreferences:copy(image.displayPreferences)}:{}),...(image.resumeState?{resumeState:copy(image.resumeState)}:{}),...(oldSelection?{pairSelection:copy(oldSelection)}:{})};
 const sourceIdentities=new Map(model.images.map(current=>[current.id,sourceIdentity(current)])),oldFiles=[...new Set([...previous.runs,...(previous.finalDisplay?[previous.finalDisplay]:[]),...(previous.resultDisplay?[previous.resultDisplay]:[])].flatMap(record=>record.files??[]))];
 if(!oldFiles.every(path=>typeof path==='string'))throw invalid('Une référence de fichier du lot est invalide.');
 const prefix='historique/'+crypto.randomUUID()+'/',paths=new Map(oldFiles.map(path=>[path,prefix+path])),inverse=new Map([...paths].map(([from,to])=>[to,from]));
 let archived,attempt,comparisons=[],removed=[];
 const unchanged=()=>{if(!model.images.includes(image)||image.blob!==source||image.preparation!==preparation||image.preparation?.fingerprint!==oldFingerprint||image.runs!==oldRuns&&!(image.runs===undefined&&!oldRuns.length)||model.comparisons!==oldComparisons&&!(model.comparisons===undefined&&!oldComparisons.length)||image.pairSelection!==oldSelection)throw invalid('Le périmètre du lot a changé pendant l’archivage.');};
 try{
  if(hasAttempt||oldComparisons.length)archived=await archiveBatchAttempt(previous,artifacts,prefix,{signal});else archived=previous;
  check(signal);unchanged();
  if(hasAttempt)attempt={...archived,runs:archived.runs.slice(0,oldRuns.length)};
  comparisons=archived.runs.slice(oldRuns.length).map(pair=>({...pair,archived:true,scientificallyReusable:false,restoredDiagnostics:true,archiveReason:reason==='scientific-scope-edited'?'Préparation scientifique modifiée après ces calculs.':'Paire d’acquisitions modifiée après ces calculs.',sourceIdentities:(pair.images??[]).map(id=>copy(sourceIdentities.get(id)??{id}))}));
  // Evaluate references in the future model without first exposing a partly
  // changed result list. Shared/history payloads keep their original key.
  const retained=collectReferences([...(model.images??[]).flatMap(current=>current===image?(current.history??[]).flatMap(history=>records(history)):records(current)),...(model.archivedComparisons??[]),...(attempt?[attempt]:[]),...comparisons]);
  for(const path of oldFiles){check(signal);unchanged();if(retained.has(path)||!artifacts.has(path))continue;removed.push(path);await artifacts.delete(path);}
  check(signal);unchanged();
  if(attempt)(image.history??=[]).push(attempt);
  if(comparisons.length)(model.archivedComparisons??=[]).push(...comparisons);
  image.runs=[];image.score=undefined;image.finalDisplay=null;image.resultDisplay=null;image.state='ready';image.reused=false;
  delete image.resumeState;delete image.restored;delete image.restoredDiagnostics;
  model.comparisons=[];model.results=null;delete model.finishedAt;
  return {archivedAttempt:attempt??null,archivedComparisons:comparisons,removedFiles:removed,retainedFiles:oldFiles.filter(path=>retained.has(path))};
 }catch(error){
  // archiveBatchAttempt already rolls back its own failed copy phase. After a
  // later failure, restore removed current keys before deleting new history.
  if(archived){const cleanupErrors=[];
   for(const path of removed){try{const archivedPath=paths.get(path),blob=await artifacts.get(archivedPath);if(!blob)throw invalid('Un fichier archivé nécessaire à la restauration est absent.');await artifacts.set(path,await remapBatchEvidence(blob,archivedPath,inverse));}catch(cleanup){cleanupErrors.push(cleanup);}}
   // Keep the safety copy if restoring any original failed; never erase the
   // only surviving payload merely to make cleanup appear successful.
   if(!cleanupErrors.length)for(const target of paths.values())try{if(artifacts.has(target))await artifacts.delete(target);}catch(cleanup){cleanupErrors.push(cleanup);}
   if(cleanupErrors.length)error.cleanupErrors=cleanupErrors;
  }
  throw error;
 }
}
