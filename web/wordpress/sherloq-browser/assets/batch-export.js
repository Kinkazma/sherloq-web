import {diskBatchZip} from './batch-zip.js';
import {batchLibraries,safeName,pdfPoint} from './batch-import.js';
import {studyScores,batchCatalog} from './batch-catalog.js';
import {batchArchiveLayout,remapBatchEvidence} from './batch-archive-layout.js';

const pdfText=text=>String(text??'').replace(/[\u2010-\u2015]/g,'-').replace(/[^\x20-\x7e\xa0-\xff\n]/g,' ');
const polygons=run=>[...[...(run.entries??[]),...(run.additionalEntries??[])].flatMap(e=>e.polygons??[]),...(run.regions??[]).filter(r=>r.bbox).map(r=>{const [x,y,w,h]=r.bbox;return [[x,y],[x+w,y],[x+w,y+h],[x,y+h]];})];
export function batchImageDisplay(image,artifacts){
 const available=files=>(files??[]).find(path=>/\.png$/i.test(path)&&artifacts.has(path));
 const final=image.state==='done'&&image.finalDisplay?.pendingRendering===false&&(!image.preparation?.fingerprint||image.finalDisplay.scopeFingerprint===image.preparation.fingerprint)?image.finalDisplay:null,path=final?available(final.files):null;
 if(path){const methods=final.methods??final.algorithmsConfigured??[],runs=(image.runs??[]).filter(r=>r.kind==='clones'||r.kind==='automatic'),incomplete=!!image.score?.incomplete||runs.some(r=>r.status!=='done');return {kind:final.kind??final.mode,path,methods,maximum:final.maximum??image.score?.clones??0,palette:final.palette,scopeFingerprint:final.scopeFingerprint,incomplete,...(incomplete?{completedRuns:runs.filter(r=>r.status==='done').length,requestedRuns:runs.length}:{})};}
 const native=(image.runs??[]).find(run=>run.kind==='clones'&&['done','partial'].includes(run.status)&&run.scopeSupport?.mode!=='raw-only'&&(!image.preparation?.schema||run.preparation?.fingerprint===image.preparation.fingerprint)&&available(run.files));
 if(native)return {kind:'biomes',path:available(native.files),methods:[native.title??native.toolId],maximum:image.score?.clones??0,nativeMethod:true};
 return null;
}
export function batchDisplayCaption(display,{language='fr'}={}){
 if(!display)return '';
 const count=display.methods?.length??0;
 if(display.incomplete)return language==='fr'?(display.kind==='corroboration'?'Carte de corroboration partielle':'Biomes partiels')+' · '+display.completedRuns+'/'+display.requestedRuns+' analyses terminées · maximum C'+display.maximum:(display.kind==='corroboration'?'Partial corroboration map':'Partial biomes')+' · '+display.completedRuns+'/'+display.requestedRuns+' completed analyses · maximum C'+display.maximum;
 return language==='fr'?(display.kind==='corroboration'?'Carte de corroboration':'Biomes')+' · '+count+' méthode'+(count===1?'':'s')+' · maximum C'+display.maximum:(display.kind==='corroboration'?'Corroboration map':'Biomes')+' · '+count+' method'+(count===1?'':'s')+' · maximum C'+display.maximum;
}
export const batchCorroborationLegend=language=>language==='fr'?'0 : pixels originaux · 1 : bleu · 2 : jaune · 3 et plus : rouge. Les valeurs exactes sont conservées dans le NPZ ; elles comptent des algorithmes concordants.':'0: original pixels · 1: blue · 2: yellow · 3 or more: red. Exact values are retained in the NPZ; they count agreeing algorithms.';
export function comparisonPolygons(image,comparisons,images){
 const runs=[];for(const pair of comparisons??[]){if(pair.kind!=='geometric-matches'||pair.status!=='done'||!pair.images.includes(image.id))continue;const side=pair.images.indexOf(image.id),offset=side?pair.offset[1]:0,rings=[];
  for(const entry of pair.entries??[])for(const ring of entry.polygons??[]){if(side?ring.every(p=>p[1]>=offset):ring.every(p=>p[1]<pair.offset[1]-32))rings.push(ring.map(([x,y])=>[x,y-offset]));}
  if(rings.length)runs.push({title:'Comparaison avec '+(images.find(i=>i.id===pair.images[side?0:1])?.name??'autre image'),positive:true,entries:[{polygons:rings}]});
 }return runs;
}
export function artifactName(study){return (study.retained?'A_VERIFIER_C'+study.score.clones+'_T'+study.score.total+'_':'')+safeName(study.name.replace(/^A_VERIFIER_C\d+_[AT]\d+_/i,''));}
export async function annotatedStudy(study,images,pdf,comparisons=[]){
 const doc=await pdf.PDFDocument.load(await study.blob.arrayBuffer(),{updateMetadata:false}),P=pdf.PDFName;
 for(const page of doc.getPages()){
  const old=page.node.Annots();if(!old)continue;const keep=[];
  for(let i=0;i<old.size();i++){const ref=old.get(i),annotation=doc.context.lookup(ref),name=annotation?.get?.(P.of('NM'));if(!String(name??'').includes('sherloq-batch:'))keep.push(ref);}page.node.set(P.of('Annots'),doc.context.obj(keep));
 }
 let count=0;
 for(const image of images.filter(i=>i.selected&&(i.score?.total>0||comparisonPolygons(i,comparisons,images).length)))for(const occurrence of image.occurrences.filter(o=>o.studyId===study.id&&o.page&&o.matrix)){
  const page=doc.getPage(occurrence.page-1);
  for(const run of [...image.runs.filter(r=>r.positive),...comparisonPolygons(image,comparisons,images)])for(const ring of polygons(run)){
   if(ring.length<3)continue;const points=ring.map(([x,y])=>pdfPoint(occurrence.matrix,x/image.width,1-y/image.height)),xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
   const left=Math.min(...xs),bottom=Math.min(...ys),right=Math.max(...xs),top=Math.max(...ys),w=Math.max(1,right-left),h=Math.max(1,top-bottom);
   const line=points.map(([x,y],i)=>(x-left).toFixed(3)+' '+(y-bottom).toFixed(3)+(i?' l':' m')).join('\n')+'\nh S';
   const appearance=doc.context.register(doc.context.flateStream('q\n1 0.25 0.12 RG\n1.5 w\n'+line+'\nQ',{Type:'XObject',Subtype:'Form',BBox:[0,0,w,h],Resources:{}}));
   const annotation=doc.context.register(doc.context.obj({Type:'Annot',Subtype:'Polygon',Rect:[left,bottom,right,top],Vertices:points.flat(),C:[1,.25,.12],BS:{W:1.5},F:4,NM:pdf.PDFString.of('sherloq-batch:'+count++),Contents:pdf.PDFString.of(pdfText(run.title+' | C'+image.score.clones+' + A'+image.score.additional+' | '+image.name)),AP:{N:appearance}}));
   page.node.addAnnot(annotation);
  }
 }
 return new Blob([await doc.save()],{type:'application/pdf'});
}
export async function batchReport(model,{language='fr',signal,pdfLibrary}={}){
 const pdf=pdfLibrary??(await batchLibraries()).pdf,doc=await pdf.PDFDocument.create(),font=await doc.embedFont(pdf.StandardFonts.Helvetica),bold=await doc.embedFont(pdf.StandardFonts.HelveticaBold);let page,y;
 const check=()=>signal?.throwIfAborted();
 const addPage=()=>{page=doc.addPage([595.28,841.89]);y=793;page.drawText('SHERLOQ  /  TRAITEMENT PAR LOT',{x:42,y,font:bold,size:11,color:pdf.rgb(.16,.24,.3)});y-=30;};
 const line=(text,{size=10,heading=false}={})=>{
  const words=pdfText(text).split(/\s+/),face=heading?bold:font;let current='';
  const write=t=>{if(y<55)addPage();page.drawText(t,{x:42,y,size,font:face,color:pdf.rgb(.14,.18,.22)});y-=size+5;};
  for(let word of words){if(face.widthOfTextAtSize(word,size)>510){if(current){write(current);current='';}while(face.widthOfTextAtSize(word,size)>510){let length=Math.max(1,Math.floor(word.length*510/face.widthOfTextAtSize(word,size)));while(face.widthOfTextAtSize(word.slice(0,length),size)>510)length--;write(word.slice(0,length));word=word.slice(length);}}const next=current?current+' '+word:word;if(face.widthOfTextAtSize(next,size)>510&&current){write(current);current=word;}else current=next;}if(current)write(current);y-=4;
 };
 addPage();line(language==='fr'?'Rapport du lot':'Batch report',{heading:true,size:22});
 line('Terminé : '+(model.finishedAt?new Intl.DateTimeFormat(language,{dateStyle:'long',timeStyle:'short'}).format(new Date(model.finishedAt)):'analyse non lancée'));
 line('Les signaux orientent une inspection humaine. Ils ne constituent pas un verdict de manipulation.');
 const results=model.results??studyScores(model.studies,model.images,model.configuration?.options??{});
 line(results.filter(s=>s.retained).length+' étude(s) retenue(s) / '+results.length+' document(s). '+model.images.filter(i=>i.selected).length+' image(s) unique(s) sélectionnée(s).');
 const allRuns=model.images.filter(i=>i.selected).flatMap(i=>i.runs??[]),failedRuns=allRuns.filter(r=>['error','partial','cancelled'].includes(r.status));if(failedRuns.length)line(language==='fr'?failedRuns.length+' analyse(s) incomplète(s) sur '+allRuns.length+'. Les sorties terminées et les diagnostics restent exportables.':failedRuns.length+' incomplete analyses out of '+allRuns.length+'. Completed outputs and diagnostics remain exportable.');
 if(model.cancelled)line('Lot interrompu : les éléments non terminés restent explicitement incomplets.');
 const options=model.configuration?.options??{};line('C = maximum de méthodes de clonage concordantes sur une zone. A = autres méthodes positives sur la même image. Tri = C + A ; maximum sur une image de l’étude.');
 if(options.scientificFiltering){line(language==='fr'?'Préclassement automatique des acquisitions réelles ; textes, graphiques et zones non classées exclus des preuves utilisées pour le tri. Les pixels originaux et les cartes scientifiques brutes restent conservés.':'Automatic classification of real acquisitions; text, charts and unclassified areas are excluded from evidence used for sorting. Original pixels and raw scientific maps are retained.');const review=model.images.filter(image=>image.preparation?.status==='needs-review').length;if(review)line(language==='fr'?review+' image(s) à vérifier, écartée(s) tant que leur préparation reste incertaine.':review+' image(s) need review and remain excluded while preparation is uncertain.');}
 line('Seuil : '+(options.threshold??1)+' sur '+(options.basis==='total'?'le compteur de tri':'la corroboration des clones')+'. Comparaisons entre études : '+(options.compare?'oui':'non')+'.');
 for(const r of model.configuration?.recipes??[]){const descriptor=batchCatalog.find(d=>d.id===r.id);line((descriptor?.[language]??r.id)+' : '+Object.entries(r.params).filter(([key])=>!['maskImageId','maxConcurrent','variant','referenceImageId','databaseId','modelId','selectionPresent','compare','independent','compact','showPoints','hideLines'].includes(key)).map(([key,value])=>(descriptor?.fields.find(f=>f.key===key)?.label??key)+' = '+JSON.stringify(value)).join(', '));}
 const stateNames={flagged:'À examiner',incomplete:'Incomplet',unselected:'Aucune image retenue','no-signal':'Sans signal avec ces méthodes'};
 for(const study of results){check();line(study.name,{heading:true,size:12});line('État : '+stateNames[study.status]+' | maximum clones C'+study.score.clones+' | maximum tri '+study.score.total+' | images terminées '+study.completed+'/'+study.selected+(study.manualMarked?' | présélection manuelle':''));for(const error of study.errors??[])line('Import : '+error);}
 for(const image of model.images.filter(i=>i.selected&&(i.score?.total>0||i.state!=='done'||i.score?.incomplete||(i.runs??[]).some(r=>r.status!=='done')))){
  check();addPage();line(image.name,{heading:true,size:15});line('C'+(image.score?.clones??0)+' + A'+(image.score?.additional??0)+' | état : '+image.state+' | '+image.width+' x '+image.height+' pixels');
  for(const occurrence of image.occurrences){const study=results.find(s=>s.id===occurrence.studyId);line((study?.name??'')+(occurrence.page?' - page '+occurrence.page:''));}
  if(image.encoding==='pdf-decoded-png')line('Pixels extraits du PDF en PNG. Historique de compression JPEG original non conservé.');
  if(image.preparation?.text?.review?.actor==='human')line(language==='fr'?'Conflit texte / acquisition corrigé par validation humaine. Les propositions OCR initiales restent dans les données de préparation.':'Text / acquisition conflict corrected by human review. Original OCR proposals remain in the preparation data.');
  for(const run of image.runs){line(run.title+' : '+run.status+(run.positive?' - éléments signalés':'')+(run.error?' - '+run.error.message:''));if(run.scopeSupport?.mode==='raw-only')line(language==='fr'?'Sortie brute pour inspection ; exclusions scientifiques non prises en charge, aucun vote filtré.':'Raw inspection output; scientific exclusions unsupported, no filtered vote.');else if(run.scopeSupport?.mode==='derived-evidence')line(language==='fr'?'Exclusions appliquées aux preuves dérivées ; les cartes et masques natifs restent bruts.':'Exclusions applied to derived evidence; native maps and masks remain raw.');else if(run.scopeSupport?.mode==='geometry-before-matching')line(language==='fr'?'Forgeryscope : points exclus avant appariement géométrique. Similarités des embeddings et pistes conservées brutes, sans vote filtré.':'Forgeryscope: points excluded before geometric matching. Embedding and lane similarities remain raw and do not cast a filtered vote.');if(run.threshold!==undefined)line('Seuil '+run.threshold+' | '+run.pixels+' pixels | minimum '+run.minimumPixels);if(run.descriptive)line('Régions descriptives ELA ; interprétation humaine nécessaire.');}
  const finalDisplay=batchImageDisplay(image,model.artifacts);if(finalDisplay){line(batchDisplayCaption(finalDisplay,{language}),{heading:true});if(finalDisplay.kind==='corroboration')line(batchCorroborationLegend(language));}
  if(y<350)addPage();
  const outputPath=finalDisplay?.path??(!options.scientificFiltering?image.runs.find(r=>r.positive)?.files?.find(p=>p.endsWith('.png')):undefined),blob=(await model.artifacts.get(outputPath))??image.blob;
  try{const bytes=await blob.arrayBuffer(),embedded=blob.type==='image/jpeg'||/\.jpe?g$/i.test(outputPath??image.name)?await doc.embedJpg(bytes):await doc.embedPng(bytes);const scale=Math.min(510/embedded.width,Math.max(120,y-80)/embedded.height,1),w=embedded.width*scale,h=embedded.height*scale;page.drawImage(embedded,{x:42,y:y-h,width:w,height:h});y-=h+20;}catch{line('Image disponible dans l’archive ZIP.');}
 }
 if(model.comparisons?.length){for(const pair of model.comparisons){check();addPage();line('Comparaisons entre études retenues',{heading:true,size:16});line(pair.kind==='identical-pixels'?'Pixels strictement identiques entre les études sélectionnées.':pair.status==='error'?'Comparaison incomplète : '+pair.message:'Correspondances géométriques entre deux images.');line((pair.images??[]).map(id=>model.images.find(i=>i.id===id)?.name??id).join(' / '));const path=pair.files?.find(p=>p.endsWith('.png'));if(path){const blob=await model.artifacts.get(path);if(blob){const embedded=await doc.embedPng(await blob.arrayBuffer()),scale=Math.min(510/embedded.width,(y-60)/embedded.height);page.drawImage(embedded,{x:42,y:y-embedded.height*scale,width:embedded.width*scale,height:embedded.height*scale});}}}}
 return new Blob([await doc.save()],{type:'application/pdf'});
}
export async function batchArchive(model,{language='fr',signal,onProgress=()=>{}}={}){
 const {pdf}=await batchLibraries(),entries=[],results=model.results??studyScores(model.studies,model.images,model.configuration?.options??{}),layout=batchArchiveLayout(model),manifest={schema:'sherloq.batch/1',archiveLayout:'flat/1',startedAt:model.startedAt,finishedAt:model.finishedAt,configuration:model.configuration,engine:model.engine,cancelled:model.cancelled,studies:[],images:layout.images,comparisons:layout.comparisons,errors:model.errors};
 const add=(path,blob)=>entries.push({path,size:blob.size,read:async()=>blob});
 add('rapport-SHERLOQ.pdf',await batchReport(model,{language,signal}));
 for(const [index,study]of results.entries()){
  signal?.throwIfAborted();const path='documents/'+index+'-'+artifactName(study),blob=study.kind==='pdf'?await annotatedStudy(study,model.images,pdf,model.comparisons):study.blob;add(path,blob);
  const {blob:ignored,...rest}=study;manifest.studies.push({...rest,archivePath:path});
 }
 for(const image of model.images){signal?.throwIfAborted();add(layout.sources.get(image.id),image.blob);}
 for(const path of model.artifacts.keys()){signal?.throwIfAborted();const read=async()=>remapBatchEvidence(await model.artifacts.get(path),path,layout.paths),blob=await read();entries.push({path:layout.paths.get(path),size:blob.size,read});}
 const inventory=JSON.stringify(manifest,null,2);if(new TextEncoder().encode(inventory).length>8*1024**2)throw Error('Inventaire supérieur à 8 Mio : fractionnez le lot pour permettre sa reprise.');add('sherloq-batch.json',new Blob([inventory],{type:'application/json'}));
 return diskBatchZip(entries,{signal,onProgress});
}
