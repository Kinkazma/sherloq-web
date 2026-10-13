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
test('manual scope adjustments and legacy human OCR-conflict review keep distinct French and English report wording',async()=>{
 const messages={fr:{manual:"Zones d'acquisition et d'exclusion ajustées manuellement. Les propositions initiales restent dans les données de préparation.",legacy:'Conflit texte / acquisition corrigé par validation humaine. Les propositions OCR initiales restent dans les données de préparation.'},en:{manual:'Acquisition and exclusion regions adjusted manually. Initial proposals remain in the preparation data.',legacy:'Text / acquisition conflict corrected by human review. Original OCR proposals remain in the preparation data.'}};
 for(const language of ['fr','en'])for(const kind of ['manual','legacy']){
  const model=displayFixture();model.images=model.images.slice(1,2);const image=model.images[0];image.preparation.text={review:{actor:'human',decision:kind==='manual'?'edit-scientific-scope':'accept-acquisition'}};if(kind==='manual')image.preparation.manual={schema:'sherloq.batch-manual-scope/1',actions:[{operation:'add',kind:'exclusion'}]};const before=JSON.stringify(image);
  const document=await pdf.PDFDocument.load(await(await batchReport(model,{pdfLibrary:pdf,language})).arrayBuffer()),text=inspect(document).text.replace(/\s+/g,' ');assert.ok(text.includes(messages[language][kind]),text);assert.equal(text.includes(messages[language][kind==='manual'?'legacy':'manual']),false);assert.equal(JSON.stringify(image),before);
 }
});
test('report embeds the final multi-method map rather than the first positive method and explains exact counts and support limits',async()=>{
 const model=displayFixture(),before=[...model.artifacts.entries()];model.images=model.images.slice(1,2);model.images[0].runs.push({title:'Forgeryscope Auto',status:'done',positive:true,scopeSupport:{mode:'geometry-before-matching'},files:[]},{title:'SelfDM',status:'done',positive:false,scopeSupport:{mode:'derived-evidence'},files:[]},{title:'TruFor',status:'done',positive:false,scopeSupport:{mode:'raw-only'},files:[]});
 const output=await batchReport(model,{pdfLibrary:pdf}),document=await pdf.PDFDocument.load(await output.arrayBuffer()),contents=inspect(document);
 assert.ok(contents.colors.some(c=>JSON.stringify(c)==='[235,60,50]'));assert.equal(contents.colors.some(c=>JSON.stringify(c)==='[20,130,220]'),false);
 for(const fragment of ['Carte de corroboration','2 méthodes','maximum C2','1 : bleu','2 : jaune','3 et plus : rouge','valeurs exactes','NPZ','Sortie brute pour inspection','aucun vote filtré','preuves dérivées','embeddings et pistes conservés brutes']){
  if(fragment==='embeddings et pistes conservés brutes')assert.match(contents.text,/Similarités des embeddings et pistes conservées brutes/);else assert.ok(contents.text.includes(fragment),fragment);
 }
 assert.deepEqual([...model.artifacts.entries()],before);
});
test('report distinguishes validated native candidate exclusions from legacy derived filtering without claiming masked CNN context',async()=>{
 for(const language of ['fr','en']){
  const model=displayFixture();model.images=model.images.slice(1,2);model.images[0].runs.push({title:'CMSeg-Net',status:'done',positive:false,scopeSupport:{mode:'candidate-domain-exclusions'},files:[]});const before=JSON.stringify(model.images[0]);
  const document=await pdf.PDFDocument.load(await(await batchReport(model,{pdfLibrary:pdf,language})).arrayBuffer()),text=inspect(document).text;
  assert.ok(text.includes(language==='fr'?'Sources et cibles exclues avant les corrélations neuronales':'Sources and targets excluded before neural correlations'));assert.ok(text.includes(language==='fr'?'contexte CNN original conservé':'original CNN context retained'));assert.equal(JSON.stringify(model.images[0]),before);
 }
});
test('Proposal report names only executed stages and separately explains skipped point/matching stages',async()=>{
 for(const language of ['fr','en']){
  const model=displayFixture();model.images=model.images.slice(1,2);model.images[0].runs.push({title:'SelfDM + Proposal',status:'done',positive:false,scopeSupport:{mode:'candidate-domain-exclusions',nativeExecution:{validated:true,variant:'selfdm-proposal',regions:[{executedStages:['selfdm-scoped','deepmask','crf-scoped'],skippedStages:[{stage:'superpoint',reason:'fewer-than-two-accepted-proposals'},{stage:'superpoint-post',reason:'fewer-than-two-accepted-proposals'},{stage:'superglue',reason:'fewer-than-two-accepted-proposals'}]}]}},files:[]});const before=JSON.stringify(model.images[0]);
  const document=await pdf.PDFDocument.load(await(await batchReport(model,{pdfLibrary:pdf,language})).arrayBuffer()),text=inspect(document).text;
  assert.ok(text.includes(language==='fr'?'Étapes neuronales exécutées dans cette passe : SelfDM, DeepMask, CRF.':'Neural stages executed in this pass: SelfDM, DeepMask, CRF.'));
  assert.ok(text.includes(language==='fr'?'Étapes non exécutées dans au moins une région : SuperPoint, SuperPoint NMS/TopK, SuperGlue.':'Stages not executed in at least one region: SuperPoint, SuperPoint NMS/TopK, SuperGlue.'));assert.equal(JSON.stringify(model.images[0]),before);
 }
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

test('an unreplayed native fallback is not named Biomes unless its exact PNG and native biome-only view are confirmed',()=>{
 const model=displayFixture(),image=model.images[0],run=image.runs[0];image.state='incomplete';image.score.incomplete=true;image.finalDisplay=null;const before=structuredClone(run);
 delete run.view;assert.equal(batchImageDisplay(image,model.artifacts).kind,'native');assert.match(batchDisplayCaption(batchImageDisplay(image,model.artifacts)),/Carte native/);
 run.view={areas:true,circles:true,lines:true,points:false};assert.equal(batchImageDisplay(image,model.artifacts).kind,'native');run.effectiveView={areas:true,circles:false,lines:false,points:false};assert.equal(batchImageDisplay(image,model.artifacts).kind,'biomes');
 image.finalDisplay={kind:'biomes',pendingRendering:false,scopeFingerprint:image.preparation.fingerprint,files:['unknown-union.png'],methods:['SIFT'],maximum:1};model.artifacts.set('unknown-union.png',model.native);assert.equal(batchImageDisplay(image,model.artifacts).kind,'native');assert.deepEqual(run.view,{areas:true,circles:true,lines:true,points:false});assert.equal(run.params,before.params);
});
