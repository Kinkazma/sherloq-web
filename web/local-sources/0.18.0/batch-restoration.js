import {remapBatchEvidence,remapBatchFilePointers} from './batch-archive-layout.js?v=0.18.0';
const flatPath=path=>typeof path==='string'&&/^resultats\/(?:images|donnees)\/[^/\\]+\.(?:png|jpe?g|webp|avif|tiff?|heic|json|npz)$/i.test(path)&&!path.split('/').some(p=>p==='.'||p==='..'||p.startsWith('.'));
const displayRecords=attempt=>[...(attempt.finalDisplay?[attempt.finalDisplay]:[]),...(attempt.resultDisplay?[attempt.resultDisplay]:[])];
// A shared file reference may not attach another image's analysis to this one.
export function batchArtifactOwners(manifest){
 const owners=new Map();
 for(const image of manifest.images??[])for(const run of [...(image.runs??[]),...displayRecords(image),...(image.history??[]).flatMap(attempt=>[...(attempt.runs??[]),...displayRecords(attempt)])])for(const path of Array.isArray(run.files)?run.files:[]){
  if(owners.has(path)&&owners.get(path)!==image.id)owners.set(path,null);else if(!owners.has(path))owners.set(path,image.id);
 }
 for(const pair of [...(manifest.comparisons??[]),...(manifest.archivedComparisons??[])])for(const path of pair.files??[])owners.set(path,null);
 return owners;
}
export function restoredArtifactPaths(image,manifest,owners,exists,{prefix='resultats/'+image.id}={}){
 const records=[...(image.runs??[]),...displayRecords(image)];if(records.some(record=>record.files!==undefined&&!Array.isArray(record.files)))return null;
 const files=records.flatMap(run=>run.files??[]),paths=new Map();
 if(!files.every(path=>typeof path==='string'&&exists(path)))return null;
 if(manifest.archiveLayout==='flat/1'){
  if(!files.every(path=>flatPath(path)&&owners.get(path)===image.id))return null;
  // Restore the internal per-image identity, while presenting the flat layout
  // only at export. This keeps deletion/replacement and scientific references
  // consistent on subsequent runs without accumulating old flat files.
  for(const [index,path]of [...new Set(files)].entries())paths.set(path,prefix+'/restored-'+index+path.slice(path.lastIndexOf('.')));
 }else{
  if(!files.every(path=>path.startsWith('resultats/'+image.id+'/')&&!path.slice(('resultats/'+image.id+'/').length).includes('/')&&!path.includes('\\')&&!path.split('/').some(p=>p==='.'||p==='..')))return null;
  for(const path of files)paths.set(path,path);
 }
 return paths;
}
export async function restoreBatchArtifacts(image,manifest,zip,artifacts,owners){
 const paths=restoredArtifactPaths(image,manifest,owners,path=>!!zip.file(path));if(!paths)return null;
 for(const [path,internal]of paths)if(!artifacts.has(internal))await artifacts.set(internal,await remapBatchEvidence(await zip.file(path).async('blob'),path,paths));
 return image.runs.map(run=>remapBatchFilePointers(run,paths));
}
/** Copy one completed attempt transactionally before its current artifact keys
 * are replaced. Shared biome/run files are copied once, and external JSON
 * pointers move with their scientific payload rather than following a new run.
 */
export async function archiveBatchAttempt(attempt,artifacts,prefix,{signal}={}){
 if(!/^historique\/[^/]+\/$/.test(prefix)||prefix.split('/').some(part=>part==='.'||part==='..'))throw Error('Invalid batch history prefix.');
 const files=[...new Set([...(attempt.runs??[]),...displayRecords(attempt)].flatMap(record=>record.files??[]))],paths=new Map(files.map(path=>[path,prefix+path])),created=[];
 try{
  for(const [path,target]of paths){signal?.throwIfAborted();if(artifacts.has(target))throw Error('Batch history already exists.');const blob=await artifacts.get(path);if(!blob)continue;created.push(target);await artifacts.set(target,await remapBatchEvidence(blob,path,paths));}
  signal?.throwIfAborted();return remapBatchFilePointers(attempt,paths);
 }catch(error){for(const path of created)try{await artifacts.delete(path);}catch(cleanup){error.cleanupError??=cleanup;}throw error;}
}
