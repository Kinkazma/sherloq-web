import {remapBatchEvidence} from './batch-archive-layout.js';
const flatPath=path=>typeof path==='string'&&/^resultats\/(?:images|donnees)\/[^/\\]+\.(?:png|jpe?g|webp|json|npz)$/i.test(path)&&!path.split('/').some(p=>p==='.'||p==='..'||p.startsWith('.'));
// A shared file reference may not attach another image's analysis to this one.
export function batchArtifactOwners(manifest){
 const owners=new Map();
 for(const image of manifest.images??[])for(const run of image.runs??[])for(const path of run.files??[]){
  if(owners.has(path)&&owners.get(path)!==image.id)owners.set(path,null);else if(!owners.has(path))owners.set(path,image.id);
 }
 for(const pair of manifest.comparisons??[])for(const path of pair.files??[])owners.set(path,null);
 return owners;
}
export function restoredArtifactPaths(image,manifest,owners,exists){
 const files=(image.runs??[]).flatMap(run=>run.files??[]),paths=new Map();
 if(!files.every(path=>typeof path==='string'&&exists(path)))return null;
 if(manifest.archiveLayout==='flat/1'){
  if(!files.every(path=>flatPath(path)&&owners.get(path)===image.id))return null;
  // Restore the internal per-image identity, while presenting the flat layout
  // only at export. This keeps deletion/replacement and scientific references
  // consistent on subsequent runs without accumulating old flat files.
  for(const [index,path]of [...new Set(files)].entries())paths.set(path,'resultats/'+image.id+'/restored-'+index+path.slice(path.lastIndexOf('.')));
 }else{
  if(!files.every(path=>path.startsWith('resultats/'+image.id+'/')&&!path.slice(('resultats/'+image.id+'/').length).includes('/')&&!path.includes('\\')&&!path.split('/').some(p=>p==='.'||p==='..')))return null;
  for(const path of files)paths.set(path,path);
 }
 return paths;
}
export async function restoreBatchArtifacts(image,manifest,zip,artifacts,owners){
 const paths=restoredArtifactPaths(image,manifest,owners,path=>!!zip.file(path));if(!paths)return null;
 for(const [path,internal]of paths)if(!artifacts.has(internal))await artifacts.set(internal,await remapBatchEvidence(await zip.file(path).async('blob'),path,paths));
 return image.runs.map(run=>({...run,files:(run.files??[]).map(path=>paths.get(path))}));
}
