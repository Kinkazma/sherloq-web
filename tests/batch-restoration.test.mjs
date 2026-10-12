import test from 'node:test';
import assert from 'node:assert/strict';
import {batchArtifactOwners,restoredArtifactPaths,restoreBatchArtifacts} from '../web/wordpress/sherloq-browser/assets/batch-restoration.js';
const image={id:'image-hash',runs:[{toolId:'sift',files:['resultats/images/source -- SIFT.png','resultats/donnees/source -- SIFT.json','resultats/donnees/source -- SIFT.npz']}]};
test('Flat export restores internal identity and all scientific references for another run',async()=>{
 const manifest={archiveLayout:'flat/1',images:[image]},files=new Map(image.runs[0].files.map(path=>[path,new Blob([path.endsWith('.json')?JSON.stringify({scientificArrays:image.runs[0].files[2]}):'native'])]));
 const zip={file(path){return files.has(path)?{async async(){return files.get(path);}}:null;}},artifacts=new Map();
 const restored=await restoreBatchArtifacts(image,manifest,zip,artifacts,batchArtifactOwners(manifest));
 assert.deepEqual(restored[0].files,['resultats/image-hash/restored-0.png','resultats/image-hash/restored-1.json','resultats/image-hash/restored-2.npz']);
 assert.equal(JSON.parse(await artifacts.get(restored[0].files[1]).text()).scientificArrays,restored[0].files[2]);
 assert.equal(await artifacts.get(restored[0].files[2]).text(),'native');assert.equal(image.runs[0].files[0],'resultats/images/source -- SIFT.png');
});
test('Legacy archives remain restorable while cross-image files and traversal are refused',()=>{
 const legacy={id:'image-hash',runs:[{files:['resultats/image-hash/sift.npz']}]};
 assert.equal(restoredArtifactPaths(legacy,{},new Map(),()=>true).get(legacy.runs[0].files[0]),legacy.runs[0].files[0]);
 assert.equal(restoredArtifactPaths({id:'image-hash',runs:[{files:['resultats/image-hash/../other.npz']}]},{},new Map(),()=>true),null);
 const manifest={archiveLayout:'flat/1',images:[image,{id:'other',runs:image.runs}]};
 assert.equal(restoredArtifactPaths(image,manifest,batchArtifactOwners(manifest),()=>true),null);
 assert.equal(restoredArtifactPaths(image,{archiveLayout:'flat/1',images:[image]},batchArtifactOwners({images:[image]}),()=>false),null);
});
