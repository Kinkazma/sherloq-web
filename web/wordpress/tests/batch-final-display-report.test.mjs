import test from 'node:test';
import assert from 'node:assert/strict';
import {inflateSync} from 'node:zlib';
import * as pdf from '../sherloq-browser/assets/batch-vendor/pdf-lib.js';
import {batchReport,batchImageDisplay,batchDisplayCaption} from '../sherloq-browser/assets/batch-export.js';
import {displayFixture} from './batch-display-fixture.mjs';

function inspect(document){
 const texts=[],colors=[];
 for(const [,object]of document.context.enumerateIndirectObjects()){
  if(!(object instanceof pdf.PDFRawStream))continue;
  const bytes=object.dict.get(pdf.PDFName.of('Filter'))?.toString()==='/FlateDecode'?inflateSync(object.getContents()):object.getContents();
  if(object.dict.get(pdf.PDFName.of('Subtype'))?.toString()==='/Image'){colors.push([...bytes.subarray(0,3)]);continue;}
  for(const match of Buffer.from(bytes).toString().matchAll(/<([0-9a-f]+)>\s*Tj/ig))texts.push(Buffer.from(match[1],'hex').toString('latin1'));
 }
 return {text:texts.join(' '),colors};
}
test('report embeds the final multi-method map rather than the first positive method and explains exact counts and support limits',async()=>{
 const model=displayFixture(),before=[...model.artifacts.entries()];model.images=model.images.slice(1,2);model.images[0].runs.push({title:'Forgeryscope Auto',status:'done',positive:true,scopeSupport:{mode:'geometry-before-matching'},files:[]},{title:'SelfDM',status:'done',positive:false,scopeSupport:{mode:'derived-evidence'},files:[]},{title:'TruFor',status:'done',positive:false,scopeSupport:{mode:'raw-only'},files:[]});
 const output=await batchReport(model,{pdfLibrary:pdf}),document=await pdf.PDFDocument.load(await output.arrayBuffer()),contents=inspect(document);
 assert.ok(contents.colors.some(c=>JSON.stringify(c)==='[235,60,50]'));assert.equal(contents.colors.some(c=>JSON.stringify(c)==='[20,130,220]'),false);
 for(const fragment of ['Carte de corroboration','2 méthodes','maximum C2','1 : bleu','2 : jaune','3 et plus : rouge','valeurs exactes','NPZ','Sortie brute pour inspection','aucun vote filtré','preuves dérivées','embeddings et pistes conservés brutes']){
  if(fragment==='embeddings et pistes conservés brutes')assert.match(contents.text,/Similarités des embeddings et pistes conservées brutes/);else assert.ok(contents.text.includes(fragment),fragment);
 }
 assert.deepEqual([...model.artifacts.entries()],before);
});
test('a single-method report preserves native biome colors and omits a corroboration palette legend',async()=>{
 const model=displayFixture();model.images=model.images.slice(0,1);const display=batchImageDisplay(model.images[0],model.artifacts);assert.equal(display.kind,'biomes');assert.match(batchDisplayCaption(display),/1 méthode.*maximum C1/);
 const document=await pdf.PDFDocument.load(await(await batchReport(model,{pdfLibrary:pdf})).arrayBuffer()),contents=inspect(document);assert.ok(contents.colors.some(c=>JSON.stringify(c)==='[20,130,220]'));assert.equal(contents.colors.some(c=>JSON.stringify(c)==='[235,60,50]'),false);assert.equal(contents.text.includes('1 : bleu'),false);
});
test('Zero-signal incomplete images retain their detailed errors and cannot present configured methods as successful analyses',async()=>{
 const model=displayFixture();model.images=model.images.slice(1,2);const image=model.images[0];image.score={clones:0,additional:0,total:0,incomplete:true};image.runs[0].positive=false;image.finalDisplay.maximum=0;image.runs.push({title:'D2PRL',kind:'clones',status:'error',files:[],error:{code:'INVALID_INPUT',message:'Half-open zone rectangle'}},{title:'SSG',kind:'clones',status:'error',files:[],error:{code:'INVALID_INPUT',message:'Original forest unavailable'}});
 assert.match(batchDisplayCaption(batchImageDisplay(image,model.artifacts)),/partielle.*1\/3 analyses terminées.*C0/);
 const document=await pdf.PDFDocument.load(await(await batchReport(model,{pdfLibrary:pdf})).arrayBuffer()),contents=inspect(document);assert.match(contents.text,/2 analyse\(s\) incomplète\(s\) sur 3/);assert.ok(contents.text.includes('Half-open zone rectangle'));assert.ok(contents.text.includes('Original forest unavailable'));assert.ok(contents.text.includes(image.name));assert.match(contents.text,/1\/3 analyses terminées/);
});
