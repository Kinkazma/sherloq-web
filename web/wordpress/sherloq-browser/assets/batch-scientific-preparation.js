import {originalBatchScientificScope} from './original-source-regions-batch.js';
import {createBatchPreparationClient} from './batch-preparation-client.js';
import {batchLibraries,nextFrame} from './batch-import.js';
import {clipPolygon,pdfTextPolygons,projectPdfExclusions,rectanglePolygon,rectangleComplement} from './batch-scope-geometry.js';
export const SCIENTIFIC_SCOPE_POLICY=Object.freeze({schema:'sherloq.scientific-scope/1',version:'batch-preparation-2',coordinates:'original-pixels',maxTextAcquisitionFraction:.25,remainder:'excluded-unclassified',unknown:'needs-review',pageTextPolicy:'source-pixel-plane-only'});
const acquisition=new Map([['Microscopy','microscopy'],['Blots','gel'],['Body Imaging','photography']]);
const nonAcquisition=new Set(['Graphs','Flow Cytometry']);
const area=poly=>Math.abs(poly.reduce((n,p,i)=>{const q=poly[(i+1)%poly.length];return n+p[0]*q[1]-q[0]*p[1];},0))/2;
function overlapArea(poly,r){return area(clipPolygon(poly.map(([x,y])=>[x-r.x0,y-r.y0]),r.x1-r.x0,r.y1-r.y0));}
const uniquePolygons=polys=>[...new Map(polys.map(p=>[JSON.stringify(p),p])).values()];
export function composeScientificScope(image,prepared,{pageExclusions=[]}={}){
 if(prepared.width!==image.width||prepared.height!==image.height||!prepared.sourceSha256)throw Error('Preparation does not match the original image');
 const panels=prepared.panels,regions=[],graphs=[];
 for(const panel of panels?.panels??[]){
  const [x0,y0,x1,y1]=panel.rectangle,polygon=clipPolygon(rectanglePolygon({x0,y0,x1,y1}),image.width,image.height);if(!polygon.length)continue;
  const type=acquisition.get(panel.label);if(type)regions.push({x0:Math.max(0,x0),y0:Math.max(0,y0),x1:Math.min(image.width,x1),y1:Math.min(image.height,y1),polygon,type,confidence:panel.confidence,label:panel.label});else if(nonAcquisition.has(panel.label))graphs.push(polygon);
 }
 const text=prepared.text,warnings=[];
 if(text?.status!=='complete')warnings.push({code:text?.warnings?.some(w=>w.code==='large-text-region')?'TEXT_ACQUISITION_AMBIGUITY':'TEXT_DETECTION_INCOMPLETE',message:text?.warnings?.some(w=>w.code==='large-text-region')?'Une grande zone pourrait être du texte ou des bandes de blot : vérifiez cette exclusion.':'La détection du texte n’a pas entièrement terminé.'});
 if(!regions.length)warnings.push({code:'NO_IDENTIFIED_ACQUISITION',message:'Aucune acquisition reconnue : cette image reste à vérifier.'});
 for(const [index,detection]of (text?.detections??[]).entries())for(const [regionIndex,r]of regions.entries()){
  const fraction=overlapArea(detection.polygon,r)/((r.x1-r.x0)*(r.y1-r.y0));
  if(fraction>=SCIENTIFIC_SCOPE_POLICY.maxTextAcquisitionFraction)warnings.push({code:'TEXT_ACQUISITION_AMBIGUITY',detection:index,region:regionIndex,fraction,message:'Une zone vue comme du texte recouvre largement une acquisition ; vérifiez cette exclusion.'});
 }
 const types=new Set(regions.map(r=>r.type)),family=types.size>1?'mixed':types.size?[...types][0]:graphs.length?'schematic':'unknown';
 // PDF text belongs to the page paint layer. It is not necessarily present in
 // an embedded bitmap, even when its projected coordinates overlap that image.
 // Keep the geometry as page provenance; apply it only to explicit page rasters.
 const projectedPageText=pageExclusions.map(p=>clipPolygon(p,image.width,image.height)).filter(p=>p.length),pageRaster=image.encoding==='pdf-rendered-page',nativeText=pageRaster?projectedPageText:[],excluded=uniquePolygons([...(text?.polygons??[]),...nativeText,...graphs,...rectangleComplement(regions,image.width,image.height)]),searchRegions=regions.map(r=>({...r}));
 for(const [index,polygon]of nativeText.entries())for(const [regionIndex,r]of regions.entries())if(overlapArea(polygon,r)/((r.x1-r.x0)*(r.y1-r.y0))>=SCIENTIFIC_SCOPE_POLICY.maxTextAcquisitionFraction)warnings.push({code:'TEXT_ACQUISITION_AMBIGUITY',origin:'page-text',pageDetection:index,region:regionIndex,message:'Le texte de la page recouvre largement une acquisition ; vérifiez ce conflit.'});
 if(regions.length>1){const envelope={x0:Math.min(...regions.map(r=>r.x0)),y0:Math.min(...regions.map(r=>r.y0)),x1:Math.max(...regions.map(r=>r.x1)),y1:Math.max(...regions.map(r=>r.y1)),envelope:true,role:'cross-panel-search'};envelope.polygon=rectanglePolygon(envelope);if(!regions.some(r=>JSON.stringify(r.polygon)===JSON.stringify(envelope.polygon)))searchRegions.push(envelope);}
 return {...SCIENTIFIC_SCOPE_POLICY,sourceSha256:prepared.sourceSha256,width:image.width,height:image.height,status:warnings.length?'needs-review':'ready',family,regions,searchRegions,excluded,panels,text,annotations:prepared.annotations??null,pdfText:{polygons:nativeText,projectedPagePolygons:projectedPageText,appliedToSource:pageRaster,source:'pdf-native-text-or-page-detector',reason:pageRaster?'rasterized-page-pixel-plane':'PDF overlays are not embedded-image pixels'},models:{panels:panels?.detector,text:text?.metadata?.model},warnings,coverage:{acquisitions:'detected-panels',undetectedAreas:'excluded-unclassified',exhaustive:false},provenance:prepared.provenance};
}
export async function scopeFingerprint(scope){
 const encoded=new TextEncoder().encode(JSON.stringify([scope.schema,scope.version,scope.sourceSha256,scope.width,scope.height,scope.status,scope.regions,scope.searchRegions,scope.excluded,scope.models,scope.text?.status,scope.maxTextAcquisitionFraction,scope.remainder,...(scope.sourceRegionDomain?[scope.sourceRegionDomain.fingerprint]:[])]));
 return [...new Uint8Array(await crypto.subtle.digest('SHA-256',encoded))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export function canReviewTextAmbiguity(scope){
 return scope?.status==='needs-review'&&scope.regions?.length>0&&scope.warnings?.length>0&&scope.warnings.every(w=>w.code==='TEXT_ACQUISITION_AMBIGUITY'&&w.origin!=='page-text')&&!(scope.text?.warnings??[]).some(w=>w.code!=='large-text-region');
}
export async function retainReviewedAcquisitions(scope,{reviewedAt=new Date().toISOString()}={}){
 if(!canReviewTextAmbiguity(scope))throw Error('Only acquisition/text ambiguities can be reviewed this way.');
 const rejected=new Set(scope.warnings.filter(w=>Number.isSafeInteger(w.detection)).map(w=>w.detection));for(const w of scope.text.warnings??[])if(w.code==='large-text-region')rejected.add(w.detection);
 if(!rejected.size)throw Error('No ambiguous text candidate is identified.');
 const originalFingerprint=await scopeFingerprint(scope),rawText=scope.text,accepted=(rawText.detections??[]).filter((_,index)=>!rejected.has(index));
 const text={...rawText,status:'complete',detections:accepted,polygons:accepted.map(d=>d.polygon),warnings:[],rawDetection:{status:rawText.status,detections:rawText.detections,polygons:rawText.polygons,warnings:rawText.warnings},review:{decision:'retain-acquisition',actor:'human',reviewedAt,candidates:[...rejected].sort((a,b)=>a-b),originalFingerprint}};
 const image={width:scope.width,height:scope.height,encoding:scope.pdfText?.appliedToSource?'pdf-rendered-page':'original'},next=composeScientificScope(image,{width:scope.width,height:scope.height,sourceSha256:scope.sourceSha256,panels:scope.panels,text,annotations:scope.annotations,provenance:scope.provenance},{pageExclusions:scope.pdfText?.projectedPagePolygons??[]});
 next.fingerprint=await scopeFingerprint(next);return next;
}
export function createScientificPreparation({computeProfile='maximum',onProgress=()=>{},clientFactory=createBatchPreparationClient}={}){
 let client;
 const getClient=async()=>client??=await clientFactory({computeProfile:typeof computeProfile==='function'?computeProfile():computeProfile,memoryBudgetBytes:4*1024**3});
 async function pages(model,signal){
  const studies=model.studies.filter(s=>s.kind==='pdf');if(!studies.length)return;
  const {pdfjs}=await batchLibraries();
  for(const study of studies){
   signal?.throwIfAborted();const parser=pdfjs.getDocument({data:new Uint8Array(await study.blob.arrayBuffer()),isEvalSupported:false,useWasm:false,useSystemFonts:true,disableFontFace:true});
   try{
    const pdf=await parser.promise;study.pageText??=[];
    for(let number=1;number<=pdf.numPages;number++){
     signal?.throwIfAborted();const page=await pdf.getPage(number);let record=study.pageText.find(p=>p.page===number),polygons=record?.polygons??pdfTextPolygons(await page.getTextContent());
     if(!polygons.length){
      const viewport=page.getViewport({scale:2}),canvas=new OffscreenCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));
      try{await page.render({canvasContext:canvas.getContext('2d'),viewport,background:'white'}).promise;const blob=await canvas.convertToBlob({type:'image/png'}),detected=await(await getClient()).prepare(blob,{textOnly:true,signal,onProgress:e=>onProgress({phase:'preparation-page',study,page:number,detail:e})});
       if(detected.text.status!=='complete')throw Error('La détection du texte de la page '+number+' reste incomplète.');
       polygons=detected.text.polygons.map(poly=>poly.map(([x,y])=>viewport.convertToPdfPoint(x,y)));record={page:number,polygons,source:'PP-OCRv6-page-detector',coordinates:'pdf-points',model:detected.text.metadata.model};
      }finally{canvas.width=canvas.height=1;}
     }else record={page:number,polygons,source:record?.source??'pdf-native-text',coordinates:'pdf-points'};
     const index=study.pageText.findIndex(p=>p.page===number);if(index>=0)study.pageText[index]=record;else study.pageText.push(record);
     for(const image of model.images)for(const occurrence of image.occurrences.filter(o=>o.studyId===study.id&&o.page===number&&o.matrix))occurrence.textExclusions=projectPdfExclusions(polygons,occurrence.matrix,image.width,image.height);
     page.cleanup();await nextFrame();
    }
   }finally{await parser.destroy();}
  }
 }
 return {async prepare(model,{signal}={}){
  try{
  const {restoreManualScientificScope}=await import('./batch-scope-manual.js'),manual=new Set();
  for(const image of model.images){signal?.throwIfAborted();if(image.originalSourceRegions||image.preparation?.originalSourceRegions){image.originalSourceRegions??=structuredClone(image.preparation.originalSourceRegions);image.sourceSha256??=image.originalSourceRegions.sourceSha256;if(image.preparation?.version!=='original-source-regions-batch-1')image.preparation=await originalBatchScientificScope(image,{editedScope:image.preparation});manual.add(image);}else if(await restoreManualScientificScope(image))manual.add(image);}
  const pending=model.images.filter(image=>!manual.has(image));
  if(pending.length)await pages({...model,images:pending,studies:model.studies.filter(study=>pending.some(image=>image.occurrences?.some(o=>o.studyId===study.id)))},signal);
  for(const [index,image]of model.images.entries()){
   signal?.throwIfAborted();onProgress({phase:'preparation',image,index,total:model.images.length,...(manual.has(image)?{humanScopePreserved:true}:{})});
   if(manual.has(image)){image.family=image.preparation.family;if(image.preparation.status!=='ready')image.selected=false;await nextFrame();continue;}
   const prepared=await(await getClient()).prepare(image.blob,{signal,onProgress:detail=>onProgress({phase:'preparation',image,index,total:model.images.length,detail})});
   const previousReview=image.preparation?.text?.review;image.sourceSha256=prepared.sourceSha256;image.preparation=composeScientificScope(image,prepared,{pageExclusions:image.occurrences.flatMap(o=>o.textExclusions??[])});image.preparation.fingerprint=await scopeFingerprint(image.preparation);
   if(previousReview?.actor==='human'&&previousReview.decision==='retain-acquisition'&&previousReview.originalFingerprint===image.preparation.fingerprint&&canReviewTextAmbiguity(image.preparation))image.preparation=await retainReviewedAcquisitions(image.preparation,{reviewedAt:previousReview.reviewedAt});
   image.family=image.preparation.family;
   // An automatic proposal never resurrects an image the human discarded.
   if(image.preparation.status!=='ready')image.selected=false;
   await nextFrame();
  }
  return model;
  }finally{const finished=client;client=null;await finished?.dispose();}
 },async dispose(){await client?.dispose();client=null;}};
}
