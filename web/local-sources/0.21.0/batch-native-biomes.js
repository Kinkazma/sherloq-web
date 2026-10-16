import {readBatchZip} from './batch-zip.js?v=0.21.0';
import {createBatchScopeMask} from './batch-scope-mask.js?v=0.21.0';
import {isDenseClone} from './clone-methods.js?v=0.21.0';
import {sparseCopyViewParams} from './unified-engine/src/sparse-copy-view.js';
import {biomeSides,distinctCentres,roundEven} from './unified-engine/src/copy-geometry.js';
import {createCloneEntryGeometry} from './unified-engine/src/clone-entry-geometry.js';
import {EngineError,checkAbort,controlCheckpoint} from './unified-engine/src/errors.js';

export const BATCH_BIOME_GEOMETRY_SCHEMA='sherloq.batch-biome-geometry/1';
export const BATCH_NATIVE_BIOME_STYLE=Object.freeze({schema:'sherloq.native-biome-style/1',fillOpacity:.28,contourWidth:2,contourOpacity:1,globalOpacity:'Applied after native-style drawing over the original source.',antialiasing:'JS pixel-centre hull fill and stroke; not pixel-identical to OpenCV LINE_AA.'});
const CHUNK=1024**2,MAX_SELECTED_JSON=8*CHUNK;
const requireBiome=(ok,message)=>{if(!ok)throw new EngineError('BATCH_BIOMES_UNAVAILABLE',message);};

export function batchBiomeCandidates(image,artifacts){
 // The batch recipe uses the sparse chooser for both sparse and PatchMatch
 // algorithms. Keep that recipe identity unchanged for resume signatures, but
 // use the same explicit dense-profile routing as batchTask for native data.
 // JSON and NPZ provenance must independently confirm this expected operation.
 return (image.runs??[]).filter(run=>['done','partial'].includes(run.status)&&['tampering.copyMove.sparse','tampering.copyMove.dense'].includes(run.operation)&&run.params?.algorithm!=='SSG'&&run.scopeSupport?.mode!=='raw-only').map(run=>({run,operation:run.operation==='tampering.copyMove.sparse'&&isDenseClone(run.params?.algorithm)?'tampering.copyMove.dense':run.operation,json:run.files?.find(p=>/\.json$/i.test(p)&&artifacts.has(p)),npz:run.files?.find(p=>/\.npz$/i.test(p)&&artifacts.has(p))})).filter(c=>c.json&&c.npz);
}
export function batchBiomeCapabilities(image,artifacts){
 const candidates=batchBiomeCandidates(image,artifacts),methods=[...new Set(candidates.map(c=>c.run.params?.algorithm??c.run.params?.profile??c.run.title??c.run.operation))];
 // Evidence group IDs precede native length, support and overlap filtering;
 // their cardinality is not the number of visible paired biomes.
 return {available:candidates.length>0,reason:candidates.length?null:'Aucun groupe de correspondances sparse ou dense natif archivé ; les cartes D2PRL/MGCFDN et les compteurs ne définissent pas de biomes appariés.',methods,groupCount:candidates.length?null:0,replayRequired:candidates.length>0};
}

// Sparse native metadata contains duplicate points/pairs in a Unicode scalar.
// Scan that scalar in bounded blocks, retaining ONLY group membership, colors
// and display/filter provenance; never materialize its feature-array mirror.
async function selectiveMetadata(entry,{readNpy,crcUpdate,crcFinish,signal}){
 requireBiome(entry&&entry._data?.compressionMethod===0,'Les groupes natifs doivent être disponibles dans une entrée NPY non compressée.');
 const record=await readNpy(await entry.async('blob'),{signal}),match=/^<U(\d+)$/.exec(record.dtype);
 requireBiome(match&&record.shape.length===0&&record.offset+Number(match[1])*4===record.blob.size,'Métadonnées Unicode sparse natives invalides.');
 const wanted=new Set(['biomes','biome_colors_bgr','display','parameters','self_match_filter','mirror_policy','coordinates','colorOrder','algorithm','pair_columns','visible_biomes']),values={};
 let state='start',key='',keyBytes='',kept='',keep=false,depth=0,string=false,escaped=false,structured=false,crc=crcUpdate(0xffffffff,record.headerBytes),closed=false;
 const finish=()=>{if(keep){requireBiome(!Object.hasOwn(values,key),'Champ natif en doublon.');try{values[key]=JSON.parse(kept);}catch(cause){throw new EngineError('BATCH_BIOMES_UNAVAILABLE','Champ de métadonnées sparse invalide.',{cause});}}kept='';state='after';};
 const append=c=>{if(keep){kept+=c;requireBiome(kept.length<=MAX_SELECTED_JSON,'La géométrie native dépasse le budget de métadonnées.');}};
 function character(c){
  if(state==='start'){if(/\s/.test(c))return;requireBiome(c==='{','Objet de métadonnées sparse attendu.');state='key-wait';return;}
  if(state==='key-wait'){if(/\s/.test(c))return;if(c==='}'){closed=true;state='closed';return;}requireBiome(c==='"','Clé de métadonnées native attendue.');keyBytes='"';escaped=false;state='key';return;}
  if(state==='key'){keyBytes+=c;requireBiome(keyBytes.length<=512,'Clé native trop longue.');if(c==='"'&&!escaped){key=JSON.parse(keyBytes);keep=wanted.has(key);state='colon';}if(c==='\\'&&!escaped)escaped=true;else escaped=false;return;}
  if(state==='colon'){if(/\s/.test(c))return;requireBiome(c===':','Séparateur de métadonnées natif attendu.');state='value-wait';return;}
  if(state==='value-wait'){if(/\s/.test(c))return;depth=0;string=false;escaped=false;structured=c==='['||c==='{';state='value';}
  if(state==='value'){
   if(!string&&!depth&&(c===','||c==='}')){finish();character(c);return;}
   append(c);
   if(string){if(c==='"'&&!escaped){string=false;if(!structured&&!depth){finish();return;}}if(c==='\\'&&!escaped)escaped=true;else escaped=false;return;}
   if(c==='"'){string=true;return;}
   if(c==='['||c==='{')depth++;else if(c===']'||c==='}')depth--;
   if(structured&&!depth)finish();return;
  }
  if(state==='after'){if(/\s/.test(c))return;if(c===','){state='key-wait';return;}requireBiome(c==='}','Fin de métadonnées native attendue.');closed=true;state='closed';return;}
  requireBiome(/\s/.test(c),'Contenu inattendu après les métadonnées natives.');
 }
 for(let at=record.offset;at<record.blob.size;at+=CHUNK){await controlCheckpoint(signal);const bytes=new Uint8Array(await record.blob.slice(at,Math.min(at+CHUNK,record.blob.size)).arrayBuffer()),view=new DataView(bytes.buffer);crc=crcUpdate(crc,bytes);for(let i=0;i<bytes.length;i+=4){const code=view.getUint32(i,true);requireBiome(code<=0x10ffff&&(code<0xd800||code>0xdfff),'Unicode natif invalide.');character(String.fromCodePoint(code));}}
 requireBiome(closed&&crcFinish(crc)===entry._data.crc32,'Métadonnées natives tronquées ou CRC différent.');
 return values;
}
async function selectedRows(record,ids,columns,{signal}){
 const element=record.dtype==='<f8'?8:record.dtype==='<f4'?4:0;
 requireBiome(element&&record.shape.length===2&&record.shape[1]===columns&&record.offset+record.shape[0]*columns*element===record.blob.size,'Forme des correspondances ou points sparse invalide.');
 const sorted=[...new Set(ids)].sort((a,b)=>a-b),out=new Map();requireBiome(sorted.every(n=>Number.isSafeInteger(n)&&n>=0&&n<record.shape[0]),'Indice de correspondance native hors limites.');
 for(let i=0;i<sorted.length;){await controlCheckpoint(signal);const first=sorted[i];let last=i+1;while(last<sorted.length&&(sorted[last]-first+1)*columns*element<=CHUNK&&sorted[last]-sorted[last-1]<=64)last++;
  const end=sorted[last-1]+1,bytes=new Uint8Array(await record.blob.slice(record.offset+first*columns*element,record.offset+end*columns*element).arrayBuffer()),view=new DataView(bytes.buffer);
  for(;i<last;i++){const row=sorted[i],values=Array.from({length:columns},(_,c)=>element===8?view.getFloat64(((row-first)*columns+c)*element,true):view.getFloat32(((row-first)*columns+c)*element,true));requireBiome(values.every(Number.isFinite),'Valeur native non finie.');out.set(row,values);}
 }
 return out;
}
async function validateArrayCrc(entry,record,{crcUpdate,crcFinish,signal}){
 requireBiome(entry?._data?.compressionMethod===0&&Number.isSafeInteger(entry._data.crc32),'Les points et paires natifs doivent être disponibles en lecture bornée.');
 let crc=crcUpdate(0xffffffff,record.headerBytes);
 for(let at=record.offset;at<record.blob.size;at+=CHUNK){await controlCheckpoint(signal);crc=crcUpdate(crc,new Uint8Array(await record.blob.slice(at,Math.min(record.blob.size,at+CHUNK)).arrayBuffer()));}
 requireBiome(crcFinish(crc)===entry._data.crc32,'CRC des points ou correspondances natifs différent.');
}
async function groupVector(entry,hooks){
 const record=await hooks.readNpy(await entry?.async('blob'),{signal:hooks.signal});requireBiome(record.shape.length===1&&['<i8','<u4'].includes(record.dtype),'Vecteur de groupe dense natif invalide.');
 const element=record.dtype==='<i8'?8:4;requireBiome(record.offset+record.shape[0]*element===record.blob.size,'Taille de groupe dense native incohérente.');await validateArrayCrc(entry,record,hooks);
 const group=[];for(let at=record.offset;at<record.blob.size;at+=CHUNK){await controlCheckpoint(hooks.signal);const bytes=new Uint8Array(await record.blob.slice(at,Math.min(record.blob.size,at+CHUNK)).arrayBuffer()),view=new DataView(bytes.buffer);for(let i=0;i<bytes.length;i+=element){const value=element===8?Number(view.getBigInt64(i,true)):view.getUint32(i,true);requireBiome(Number.isSafeInteger(value)&&value>=0,'Indice de groupe dense natif invalide.');group.push(value);}}return group;
}
async function nativeBiomeRecord(candidate,zip,hooks){
 if(candidate.operation==='tampering.copyMove.sparse')return {native:await selectiveMetadata(zip.file('metadata_json.npy'),hooks),pointEntry:zip.file('points.npy'),pairEntry:zip.file('pairs.npy'),format:'sparse-native-metadata'};
 // The shipped dense exporter uses streamDenseNpz -> automaticPointSnapshot:
 // numeric arrays stay behind root_result_* references, including int64 groups.
 // Older flat dense exports use group_N.npy and the same original Nx7/Nx4 data.
 const metadata=await hooks.readMetadataJson(zip.file('metadata_json.npy'),{signal:hooks.signal}),snapshot=metadata.schema==='sherloq.clone-dense/1'?metadata.result:null;
 const reference=ref=>{requireBiome(ref&&typeof ref.array==='string'&&/^[a-zA-Z0-9_]+$/.test(ref.array),'Référence de tableau dense natif invalide.');return zip.file(ref.array+'.npy');};
 let biomes,pointEntry,pairEntry,native;
 if(snapshot){
  requireBiome(Array.isArray(snapshot.groups)&&Array.isArray(snapshot.params)&&snapshot.params.length>=18&&typeof snapshot.params[0]==='string','Snapshot dense natif incomplet.');
  biomes=[];for(const ref of snapshot.groups)biomes.push(await groupVector(reference(ref),hooks));pointEntry=reference(snapshot.points);pairEntry=reference(snapshot.pairs);
  native={biomes,biome_colors_bgr:snapshot.bases,parameters:{minimum:snapshot.params[3]},display:metadata.display,algorithm:snapshot.params[0],group_algorithms:snapshot.group_algorithms,self_match_filter:snapshot.self_match_filter,mirror_policy:snapshot.mirror_policy,pair_columns:['point_a','point_b','descriptor_distance','length_px']};
 }else{
  requireBiome(metadata.schema===1&&metadata.coordinates==='original-source-pixels'&&metadata.params&&Array.isArray(metadata.bases),'Métadonnées de groupes denses natifs absentes.');
  const files=Object.keys(zip.files).filter(name=>/^group_\d+\.npy$/.test(name)).sort((a,b)=>Number(a.match(/\d+/)[0])-Number(b.match(/\d+/)[0]));
  requireBiome(files.length===metadata.bases.length&&files.every((name,i)=>name==='group_'+i+'.npy'),'Indices de groupes denses natifs incomplets.');
  biomes=[];for(const name of files)biomes.push(await groupVector(zip.file(name),hooks));pointEntry=zip.file('points.npy');pairEntry=zip.file('pairs.npy');
  native={biomes,biome_colors_bgr:metadata.bases,parameters:metadata.params,display:metadata.display,algorithm:metadata.params.profile,group_algorithms:metadata.group_algorithms,self_match_filter:metadata.self_match_filter,mirror_policy:metadata.mirror_policy,pair_columns:['point_a','point_b','descriptor_distance','length_px']};
 }
 return {native,pointEntry,pairEntry,format:snapshot?'dense-native-snapshot':'dense-native-fields'};
}
export function resolveBatchBiomeView(native,run){
 const fallback={low:15,high:100000,minimum:4,chosen:[],hidden:[],circles:false,lines:false,points:false,areas:true,textExclusions:false},legacy={...fallback,low:0},same=(a,b)=>Array.isArray(a)&&Array.isArray(b)?a.length===b.length&&a.every((v,i)=>v===b[i]):a===b;
 const oldDefault=native.display&&Object.keys(native.display).length===Object.keys(legacy).length&&Object.entries(legacy).every(([k,v])=>same(native.display[k],v)),explicit=run.effectiveView??run.view??run.recipe?.view,source=explicit?'explicit-run-view':oldDefault?'legacy-hardcoded-default-migrated-to-15':native.display?'native-custom-display':'batch-default-view';
 const view=sparseCopyViewParams({...fallback,...(!oldDefault?native.display??{}:{}),...(explicit??{})});
 return {view:{...view,circles:false,lines:false,points:false,areas:true,textExclusions:false},source,matchingMinimum:native.parameters?.minimum??run.effectiveParams?.minimum??run.params?.minimum??7,matchingMinimumSource:native.parameters?.minimum!==undefined?'native-npz-parameters':run.effectiveParams?.minimum!==undefined?'effective-run-parameters':run.params?.minimum!==undefined?'run-parameters':'batch-default-without-native-trace'};
}
async function nativeDrawingHulls(kernel,method,input,count,group,signal){
 const paired=await kernel.entry(method,input,count,{group},{signal});if(paired)return {polygons:paired.entry.polygons,release:paired.release};
 // Clone2's cv::convexHull/copy_draw_group also renders collinear hulls as
 // contours. The area-evidence helper correctly rejects their zero area; do
 // not mistake that restriction for the native presentation contract.
 const polygons=[];
 for(const side of input){const single=await kernel.entry(method,[side],count,{group},{signal});
  if(single){try{polygons.push(structuredClone(single.entry.polygons[0]));}finally{single.release();}continue;}
  const sorted=[...new Map(side.map(p=>[p.join(','),p])).values()].sort((a,b)=>a[0]-b[0]||a[1]-b[1]),first=sorted[0],last=sorted.at(-1);
  requireBiome(sorted.length>=3&&sorted.every(p=>(last[0]-first[0])*(p[1]-first[1])===(last[1]-first[1])*(p[0]-first[0])),'Un hull natif rejeté ne correspond pas à un contour collinéaire.');
  polygons.push([first.slice(),last.slice()]);
 }
 return {polygons,release(){}};
}
export async function loadBatchNativeBiomes(image,expected,{artifacts,budget,readNpy,readMetadataJson,crcUpdate,crcFinish,signal,geometryFactory=createCloneEntryGeometry}={}){
 const candidates=batchBiomeCandidates(image,artifacts);requireBiome(candidates.length,'Aucun groupe de correspondances natif ne permet une vue Biomes.');
 const releaseWorkspace=budget.reserve(4*MAX_SELECTED_JSON+2*CHUNK);let kernel;const groups=[],sources=[];
 try{
  for(const candidate of candidates){
   await controlCheckpoint(signal);const blob=await artifacts.get(candidate.json);requireBiome(blob instanceof Blob&&blob.size<=MAX_SELECTED_JSON,'Rapport géométrique natif absent ou trop grand.');const json=JSON.parse(await blob.text()),provenance=json.provenance??candidate.run.provenance;
   requireBiome(provenance?.operation===candidate.operation&&provenance.originalSha256===expected.sourceSha256,'La géométrie de clones appartient à une autre image.');
   if(expected.scopeFingerprint)requireBiome((json.preparation?.fingerprint??candidate.run.preparation?.fingerprint)===expected.scopeFingerprint,'La géométrie sparse appartient à un autre périmètre scientifique.');
   // Dense native exports contain one array per legitimate group. Let the
   // reader's bounded 8 MiB central directory admit them, including ZIP64,
   // rather than applying the small sparse/count archive's entry-count cap.
   const zip=await readBatchZip(await artifacts.get(candidate.npz),{maximumEntries:Number.MAX_SAFE_INTEGER});requireBiome(zip,'Archive de correspondances native invalide.');
   const nativeProvenance=await readMetadataJson(zip.file('browser_provenance_json.npy'),{signal});
   requireBiome(nativeProvenance.operation===candidate.operation&&nativeProvenance.originalSha256===expected.sourceSha256&&(!nativeProvenance.decode?.sourceSize||JSON.stringify(nativeProvenance.decode.sourceSize)===JSON.stringify([expected.width,expected.height])),'La provenance NPZ de clones ne correspond pas à l’image originale.');
   const opened=await nativeBiomeRecord(candidate,zip,{readNpy,readMetadataJson,crcUpdate,crcFinish,signal}),native=opened.native,resolved=resolveBatchBiomeView(native,{...candidate.run,view:candidate.run.view??json.view,effectiveView:candidate.run.effectiveView??json.effectiveView}),view=resolved.view;
   requireBiome(Array.isArray(native.biomes)&&Array.isArray(native.biome_colors_bgr)&&native.biome_colors_bgr.length===native.biomes.length&&native.biomes.every(g=>Array.isArray(g)&&g.every(Number.isSafeInteger)),'Les indices et couleurs des groupes sparse natifs sont absents.');
   requireBiome(native.algorithm!=='SSG'&&native.pair_columns?.[3]==='length_px','Cette sortie ne définit pas les biomes de correspondances sparse.');
   const {pairEntry,pointEntry}=opened,pairs=await readNpy(await pairEntry?.async('blob'),{signal}),points=await readNpy(await pointEntry?.async('blob'),{signal});
   await validateArrayCrc(pairEntry,pairs,{crcUpdate,crcFinish,signal});await validateArrayCrc(pointEntry,points,{crcUpdate,crcFinish,signal});
   const rows=await selectedRows(pairs,native.biomes.flat(),4,{signal}),pointIds=[];
   for(const pair of rows.values())pointIds.push(pair[0],pair[1]);const coordinates=await selectedRows(points,pointIds,7,{signal});
   if(!kernel)kernel=await geometryFactory({budget,signal,maxVertices:Math.max(65536,2*Math.max(0,...native.biomes.map(g=>g.length)))});
   const source={path:candidate.npz,json:candidate.json,operation:candidate.operation,...(candidate.operation!==candidate.run.operation?{recipeOperation:candidate.run.operation}:{}),format:opened.format,method:native.algorithm??candidate.run.params.algorithm??candidate.run.params.profile,view:resolved.view,viewSource:resolved.source,matchingMinimum:resolved.matchingMinimum,matchingMinimumSource:resolved.matchingMinimumSource,sourceSha256:expected.sourceSha256,scopeFingerprint:expected.scopeFingerprint};sources.push(source);
   for(let index=0;index<native.biomes.length;index++){
    await controlCheckpoint(signal);if(view.hidden.includes(index)||view.chosen.length&&!view.chosen.includes(index))continue;
    const selected=native.biomes[index].filter(row=>{const pair=rows.get(row);return pair[3]>=view.low&&pair[3]<=view.high;});if(selected.length<view.minimum)continue;
    const localPoints=new Float64Array(selected.length*14),localPairs=new Float64Array(selected.length*4),indices=Uint32Array.from(selected,(_,i)=>i);
    for(let i=0;i<selected.length;i++){const pair=rows.get(selected[i]);localPoints.set(coordinates.get(pair[0]),i*14);localPoints.set(coordinates.get(pair[1]),i*14+7);localPairs.set([i*2,i*2+1,pair[2],pair[3]],i*4);}
    const sides=biomeSides(localPoints,localPairs,indices),filterSides=points.dtype==='<f4'?biomeSides(Float32Array.from(localPoints),localPairs,indices):sides;if(Math.min(distinctCentres(filterSides.a),distinctCentres(filterSides.b))<view.minimum)continue;
    let overlap=native.self_match_filter?.maximum_overlap;if(overlap===undefined&&native.mirror_policy&&native.biomes[index].length&&native.biomes[index][0]>=native.mirror_policy.base_pair_count)overlap=native.mirror_policy.maximum_overlap;
    if(overlap!==undefined){const filtered=[filterSides.a,filterSides.b].map(side=>Array.from({length:side.length/2},(_,i)=>[roundEven(side[i*2]),roundEven(side[i*2+1])]));if(kernel.compare(filtered).overlap>=overlap)continue;}
    const polygons=[sides.a,sides.b].map(side=>Array.from({length:side.length/2},(_,i)=>[roundEven(side[i*2]),roundEven(side[i*2+1])]));requireBiome(polygons.every(poly=>poly.every(p=>p.every(v=>Math.fround(v)===v))),'Les coordonnées entières dépassent la précision du noyau géométrique natif.');
    const owned=await nativeDrawingHulls(kernel,source.method,polygons,selected.length,index,signal);
    try{
     const color=native.biome_colors_bgr[index];requireBiome(Array.isArray(color)&&color.length===3&&color.every(c=>Number.isSafeInteger(c)&&c>=0&&c<=255),'Couleur de groupe sparse invalide.');
     const polygons=owned.polygons;requireBiome(polygons.length===2&&polygons.every(poly=>poly.length>=2&&poly.every(([x,y])=>x>=0&&x<expected.width&&y>=0&&y<expected.height)),'Un biome sort des coordonnées originales.');
     groups.push({id:candidate.run.toolId+':'+index,method:native.group_algorithms?.[index]??source.method,profile:source.method,group:index,colorRgb:[color[2],color[1],color[0]],polygons:structuredClone(polygons),pairs: selected.length,nativeRows:selected,pairedSides:2,degenerateSides:polygons.flatMap((poly,side)=>poly.length===2?[side]:[]),geometrySource:candidate.npz});
    }finally{owned.release();}
   }
  }
  checkAbort(signal);return {schema:BATCH_BIOME_GEOMETRY_SCHEMA,coordinates:'original-pixels',methods:[...new Set(sources.map(s=>s.method))],groupCount:groups.length,groups,geometrySources:sources,meaning:'Paired native clone groups and their original colors; not a count-map union.',rasterization:'Native integer convex hulls and native fill/contour style, replayed in original-coordinate windows without feature extraction or matching.',style:BATCH_NATIVE_BIOME_STYLE,scope:image.preparation?createBatchScopeMask(image.preparation,{width:expected.width,height:expected.height,sourceSha256:expected.sourceSha256}):null};
 }finally{try{kernel?.dispose();}finally{releaseWorkspace();}}
}

function spans(polygon,y){
 const crossings=[],segments=[];
 for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
  const [ax,ay]=polygon[j],[bx,by]=polygon[i];if(ay===by&&y===ay)segments.push([Math.min(ax,bx),Math.max(ax,bx)]);
  if((ay>y)!==(by>y))crossings.push(ax+(y-ay)*(bx-ax)/(by-ay));
  if(y>=Math.min(ay,by)&&y<=Math.max(ay,by)&&ay!==by){const x=ax+(y-ay)*(bx-ax)/(by-ay);if(Number.isInteger(x))segments.push([x,x]);}
 }
 crossings.sort((a,b)=>a-b);for(let i=0;i+1<crossings.length;i+=2)segments.push([Math.ceil(crossings[i]),Math.floor(crossings[i+1])]);return segments;
}
function edgeDistanceSquared(x,y,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],denom=dx*dx+dy*dy,t=denom?Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/denom)):0,u=x-a[0]-t*dx,v=y-a[1]-t*dy;return u*u+v*v;}
/** Native paired-hull style: 28% fill then opaque 2px contour for each side.
 * A supplied RGB destination starts as the original source; global user
 * opacity is applied later to that styled frame, with no source mutation.
 * Transparent previews use the same primitives before spatial reduction. */
export function batchBiomeWindow(geometry,{x=0,y=0,width,height},{signal,budget,rgb}={}){
 const rgba=rgb?null:new Uint8ClampedArray(width*height*4),eligible=geometry.scope?.readRows(y,height,{signal,budget});
 if(rgb)requireBiome(rgb instanceof Uint8Array&&rgb.length===width*height*3,'Fenêtre RGB de présentation invalide.');
 const admitted=(row,column)=>!eligible||eligible.data[row*geometry.scope.policy.width+column];
 const paint=(row,column,color,alpha)=>{
  if(column<x||column>=x+width||!admitted(row,column))return;
  if(rgb){const at=(row*width+column-x)*3;for(let c=0;c<3;c++)rgb[at+c]=roundEven(rgb[at+c]*(1-alpha)+color[c]*alpha);}
  else{const at=(row*width+column-x)*4,previous=rgba[at+3]/255,next=alpha+previous*(1-alpha);for(let c=0;c<3;c++)rgba[at+c]=Math.round((color[c]*alpha+rgba[at+c]*previous*(1-alpha))/next);rgba[at+3]=Math.round(next*255);}
 };
 try{for(const group of geometry.groups)for(const polygon of group.polygons){
  const minX=Math.min(...polygon.map(p=>p[0]))-1,maxX=Math.max(...polygon.map(p=>p[0]))+1,minY=Math.min(...polygon.map(p=>p[1]))-1,maxY=Math.max(...polygon.map(p=>p[1]))+1;
  for(let row=0;row<height;row++){checkAbort(signal);const originalY=y+row;if(originalY<minY||originalY>maxY)continue;
   for(const [left,right]of spans(polygon,originalY))for(let column=Math.max(x,left);column<=Math.min(x+width-1,right);column++)paint(row,column,group.colorRgb,BATCH_NATIVE_BIOME_STYLE.fillOpacity);
   // Pixel-centre stroke width2. The native integer hull is unchanged; its
   // OpenCV antialiasing fringe is deliberately not claimed bit-identical.
   for(let column=Math.max(x,minX);column<=Math.min(x+width-1,maxX);column++)if(polygon.some((point,i)=>edgeDistanceSquared(column,originalY,point,polygon[(i+1)%polygon.length])<=1))paint(row,column,group.colorRgb,1);
  }
 }return rgb??rgba;}finally{eligible?.release();}
}
export function batchBiomePreview(geometry,{width,height,originalWidth,originalHeight},{signal,budget}={}){
 const rgba=new Uint8ClampedArray(width*height*4),rows=Math.max(1,Math.min(32,Math.floor(CHUNK/(originalWidth*4))));
 for(let top=0;top<originalHeight;top+=rows){checkAbort(signal);const count=Math.min(rows,originalHeight-top),release=budget?.reserve(originalWidth*count*4)??(()=>{});
  try{const layer=batchBiomeWindow(geometry,{x:0,y:top,width:originalWidth,height:count},{signal,budget});
   for(let y=0;y<count;y++)for(let x=0;x<originalWidth;x++){const source=(y*originalWidth+x)*4;if(!layer[source+3])continue;const target=(Math.min(height-1,Math.floor((top+y)*height/originalHeight))*width+Math.min(width-1,Math.floor(x*width/originalWidth)))*4;if(layer[source+3]>=rgba[target+3])rgba.set(layer.subarray(source,source+4),target);}
  }finally{release();}
 }return rgba;
}
export function batchBiomeMetadata(geometry){
 return {schema:geometry.schema,coordinates:geometry.coordinates,methods:geometry.methods,groupCount:geometry.groupCount,groups:geometry.groups.map(({polygons,nativeRows,...group})=>group),geometrySources:geometry.geometrySources,meaning:geometry.meaning,rasterization:geometry.rasterization,style:geometry.style,previewAggregation:'Maximum style alpha per display cell after original-coordinate rendering; not a scientific grid.'};
}
