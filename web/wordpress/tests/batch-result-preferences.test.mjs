import test from 'node:test';
import assert from 'node:assert/strict';
import {BATCH_DISPLAY_PREFERENCES_SCHEMA as schema,batchResultDisplayPreferences,validateBatchDisplayPreferences} from '../sherloq-browser/assets/batch-result-display.js';
import {createBatchImporter} from '../sherloq-browser/assets/batch-import.js';
import {batchArchive} from '../sherloq-browser/assets/batch-export.js';
import {writeBatchZip,readBatchZip} from '../sherloq-browser/assets/batch-zip.js';

test('Biomes default to100%, corroboration to35%; edits and zero stay separate across mode switches',()=>{
 const image={finalDisplay:{kind:'biomes'}};let p=batchResultDisplayPreferences(image);assert.equal(p.opacity,1);assert.deepEqual(p.opacities,{biomes:1,corroboration:.35});image.displayPreferences=p;
 p=batchResultDisplayPreferences(image,{opacity:.65});image.displayPreferences=p;p=batchResultDisplayPreferences(image,{mode:'corroboration'});assert.equal(p.opacity,.35);image.displayPreferences=p;
 p=batchResultDisplayPreferences(image,{opacity:0});image.displayPreferences=p;p=batchResultDisplayPreferences(image,{mode:'biomes'});assert.equal(p.opacity,.65);image.displayPreferences=p;
 assert.equal(batchResultDisplayPreferences(image,{mode:'corroboration'}).opacity,0);
});
test('legacy single35% migrates to distinct defaults; other old choices remain on their own view',()=>{
 for(const mode of ['biomes','corroboration']){const p=validateBatchDisplayPreferences({schema,mode,opacity:.35});assert.equal(p.opacity,mode==='biomes'?1:.35);assert.deepEqual(p.opacities,{biomes:1,corroboration:.35});}
 for(const opacity of [0,.2,1]){const p=validateBatchDisplayPreferences({schema,mode:'biomes',opacity});assert.equal(p.opacity,opacity);assert.equal(p.opacities.corroboration,.35);}
 const p=validateBatchDisplayPreferences({schema,mode:'biomes',opacity:.35,opacities:{biomes:.35,corroboration:.82}});assert.equal(p.opacity,.35,'New explicit35% is distinguishable from the legacy automatic value.');assert.equal(p.opacities.corroboration,.82);
 for(const opacities of [null,[],{biomes:1},{biomes:1,corroboration:NaN},{biomes:2,corroboration:.35},{biomes:1,corroboration:.35,extra:0}])assert.throws(()=>validateBatchDisplayPreferences({schema,mode:'biomes',opacity:1,opacities}),{code:'BATCH_DISPLAY_INVALID'});
 assert.throws(()=>validateBatchDisplayPreferences({schema,mode:'biomes',opacity:.4,opacities:{biomes:1,corroboration:.35}}),{code:'BATCH_DISPLAY_INVALID'});
});
async function zipWriter(entries){let data=new Uint8Array(),position=0;await writeBatchZip(entries,{async write(value){const bytes=value?.type==='write'?value.data:value,at=value?.type==='write'?value.position:position;if(at+bytes.length>data.length){const next=new Uint8Array(at+bytes.length);next.set(data);data=next;}data.set(bytes,at);position=at+bytes.length;},async seek(at){position=at;},async close(){},async abort(){}},{compress:false});return {blob:new Blob([data]),async cleanup(){}};}
test('both view opacities survive the real ZIP exporter/importer with source and scientific settings unchanged',async()=>{
 const hash='a'.repeat(64),blob=new Blob(['original source'],{type:'image/png'}),displayPreferences={schema,mode:'biomes',opacity:.81,opacities:{biomes:.81,corroboration:0}},params={algorithm:'SIFT + G2NN + RANSAC',minimum:10,threshold:.725,limit:6000};
 const source={configuration:{recipes:[{id:'clone-15',params,view:{low:0,minimum:4}}]},studies:[{id:'study',kind:'image',name:'source.png',blob,errors:[]}],images:[{id:'image-'+hash.slice(0,24),hash,sourceSha256:'b'.repeat(64),width:8,height:8,name:'source.png',blob,thumbnail:blob,encoding:'original',selected:true,state:'ready',runs:[],occurrences:[{studyId:'study',page:null}],displayPreferences}],artifacts:new Map(),errors:[]};
 const out=await batchArchive(source,{dependencies:{libraryLoader:async()=>({pdf:{}}),report:async()=>new Blob(['report']),zipWriter,imageExporterFactory:()=>({async convert(blob){return {blob,conversion:{scientificSourceCompatible:true}};},async dispose(){}})}}),zip=await readBatchZip(out.blob),manifest=JSON.parse(await zip.file('sherloq-batch.json').async('string'));
 assert.deepEqual(manifest.images[0].displayPreferences,displayPreferences);out.blob.name='view-preferences.zip';
 const restored=await createBatchImporter({artifactStoreFactory:async()=>new Map(),libraryLoader:async()=>({}),identify:async()=>({hash,width:8,height:8,thumbnail:blob})});await restored.import([out.blob]);assert.deepEqual(restored.errors,[]);assert.deepEqual(restored.images[0].displayPreferences,displayPreferences);assert.deepEqual(restored.configuration.recipes[0].params,params);assert.equal(await restored.images[0].blob.text(),await blob.text());assert.equal(batchResultDisplayPreferences(restored.images[0],{mode:'corroboration'}).opacity,0);
});
