import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createBatchResultDisplay,BATCH_DISPLAY_PREFERENCES_SCHEMA} from '../sherloq-browser/assets/batch-result-display.js';
import {resolveBatchBiomeView} from '../sherloq-browser/assets/batch-native-biomes.js';
import {BATCH_CORROBORATION_PALETTE} from '../sherloq-browser/assets/batch-corroboration-export.js';
import {writeBatchZip,readBatchZip} from '../sherloq-browser/assets/batch-zip.js';
import {createCloneEntryGeometry} from '../sherloq-browser/assets/unified-engine/src/clone-entry-geometry.js';
import {Budget} from '../sherloq-browser/assets/unified-engine/src/cache.js';

const sha='a'.repeat(64),fp='f'.repeat(64),nativeStyle={low:0,high:100000,minimum:4,chosen:[],hidden:[],circles:false,lines:false,points:false,areas:true,textExclusions:false};
function npy(dtype,shape,bytes){
 const shapeText='('+shape.join(', ')+(shape.length===1?',':'')+')',text="{'descr': '"+dtype+"', 'fortran_order': False, 'shape': "+shapeText+", }",size=Math.ceil((text.length+11)/64)*64-10,header=new Uint8Array(10+size);header.set([147,78,85,77,80,89,1,0]);new DataView(header.buffer).setUint16(8,size,true);header.fill(32,10);header.set(new TextEncoder().encode(text),10);header[header.length-1]=10;return new Blob([header,bytes]);
}
function unicode(value){const text=JSON.stringify(value),codes=Array.from(text),bytes=new Uint8Array(codes.length*4),view=new DataView(bytes.buffer);codes.forEach((s,i)=>view.setUint32(i*4,s.codePointAt(0),true));return npy('<U'+codes.length,[],bytes);}
async function zip(entries){
 const capacity=entries.reduce((n,[path,blob])=>n+blob.size+path.length*2+128,1024),bytes=new Uint8Array(capacity);let at=0,length=0;
 const writer={async write(value){const position=value.type==='write'?value.position:at,data=value.type==='write'?value.data:value;bytes.set(data,position);at=position+data.length;length=Math.max(length,at);},async seek(position){at=position;},async close(){},async abort(){}};
 await writeBatchZip(entries.map(([path,blob])=>({path,size:blob.size,read:async()=>blob})),writer,{compress:false});return new Blob([bytes.subarray(0,length)]);
}
function hull(input){
 const points=[...new Map(input.map(p=>[p.join(','),p])).values()].sort((a,b)=>a[0]-b[0]||a[1]-b[1]),cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]),side=values=>{const out=[];for(const p of values){while(out.length>1&&cross(out.at(-2),out.at(-1),p)<=0)out.pop();out.push(p);}return out;};
 return [...side(points).slice(0,-1),...side([...points].reverse()).slice(0,-1)];
}
const geometricOracle=async()=>({async entry(method,polygons,count,provenance){const output=polygons.map(hull);if(output.some(p=>p.length<3))return null;return {entry:{polygons:output,count,provenance},release(){}};},compare(){return {overlap:0};},dispose(){}});
async function fixture({sparse=true,counts=true,style=nativeStyle,explicitView,scope=false,format='sparse',groupCount=3}={}){
 const width=40,height=32,artifacts=new Map(),points=[],pairs=[],groups=[];
 for(const [group,oy,dx]of [[0,2,20],[1,12,20],[2,23,12]]){
  const rows=[];for(const [x,y]of [[2,oy],[8,oy],[5,oy+6],[4,oy+2]]){const a=points.length/7;points.push(x,y,1,0,1,0,0,x+dx,y,1,0,1,0,0);rows.push(pairs.length/4);pairs.push(a,a+1,.1,dx);}groups.push(rows);
 }
 for(let i=groups.length;i<groupCount;i++)groups.push(groups[i%3].slice());
 const baseColors=[[100,20,240],[5,200,40],[250,100,10]],dense=format!=='sparse',operation=dense?'tampering.copyMove.dense':'tampering.copyMove.sparse',provenance={operation,originalSha256:sha,coordinates:'original-pixel-centres',decode:{sourceSize:[width,height]}},metadata={points:points.map(String),pairs:pairs.map(String),algorithm:'SIFT + G2NN + RANSAC',coordinates:'original-pixel-centres',colorOrder:'BGR',pair_columns:['point_a','point_b','descriptor_distance','length_px'],biomes:groups,biome_colors_bgr:groups.map((_,i)=>baseColors[i%3]),parameters:{minimum:10},display:style,self_match_filter:{maximum_overlap:.8}};
 let members;
 if(format==='dense-snapshot')members=[['root_result_points.npy',npy('<f4',[points.length/7,7],new Float32Array(points))],['root_result_pairs.npy',npy('<f8',[pairs.length/4,4],new Float64Array(pairs))],...groups.map((g,i)=>['root_result_groups_'+i+'.npy',npy('<i8',[g.length],BigInt64Array.from(g,BigInt))]),['metadata_json.npy',unicode({schema:'sherloq.clone-dense/1',result:{points:{array:'root_result_points'},pairs:{array:'root_result_pairs'},groups:groups.map((_,i)=>({array:'root_result_groups_'+i})),bases:metadata.biome_colors_bgr,params:['PatchMatch Zernike',6000,600,10,.3,50,'Similarity',3,6,8,8,false,2,true,true,false,[],[]],dense_maps:[{targets:{array:'unused-native-map'}}]},display:style})]];
 else if(format==='dense-fields')members=[['points.npy',npy('<f4',[points.length/7,7],new Float32Array(points))],['pairs.npy',npy('<f8',[pairs.length/4,4],new Float64Array(pairs))],...groups.map((g,i)=>['group_'+i+'.npy',npy('<u4',[g.length],Uint32Array.from(g))]),['metadata_json.npy',unicode({schema:1,coordinates:'original-source-pixels',params:{profile:'PatchMatch Zernike',minimum:10},bases:metadata.biome_colors_bgr,display:style})]];
 else members=[['points.npy',npy('<f8',[points.length/7,7],new Float64Array(points))],['pairs.npy',npy('<f8',[pairs.length/4,4],new Float64Array(pairs))],['metadata_json.npy',unicode(metadata)]];
 const npz=await zip([...members,['browser_provenance_json.npy',unicode(provenance)]]);
 const preparation=scope?{schema:'sherloq.scientific-scope/1',version:'fixture/1',coordinates:'original-pixels',status:'ready',width,height,sourceSha256:sha,fingerprint:fp,regions:[{x0:0,y0:0,x1:width,y1:height}],excluded:[[[3,3],[5,3],[5,5],[3,5]]],text:{status:'complete'},models:{}}:undefined;
 const run={toolId:dense?'dense':'sift',title:dense?'PatchMatch Zernike':'SIFT + G2NN + RANSAC',operation,params:{algorithm:dense?'PatchMatch Zernike':'SIFT + G2NN + RANSAC',minimum:10},status:'done',files:['native-sift.json','native-sift.npz'],provenance,...(preparation?{preparation:{fingerprint:fp},scopeSupport:{mode:'input-exclusions'}}:{}),...(explicitView?{view:explicitView}:{}),entries:groups.map((_,group)=>({provenance:{group}}))};
 if(sparse){artifacts.set('native-sift.npz',npz);artifacts.set('native-sift.json',new Blob([JSON.stringify({schema:'sherloq.batch-evidence/1',operation:run.operation,provenance,...(preparation?{preparation:{fingerprint:fp}}:{})})]));}
 const array=new Uint32Array(width*height);array[array.length-1]=3;
 const countMeta={schema:'sherloq.batch-corroboration/1',width,height,coordinates:'original-pixels',array:{dtype:'<u4',order:'C',shape:[height,width]},source:{originalSha256:sha},scopeFingerprint:preparation?.fingerprint??null,methods:['SIFT','D2PRL','MGCFDN'],maximum:3,palette:BATCH_CORROBORATION_PALETTE};
 if(counts)artifacts.set('final.npz',await zip([['corroboration.npy',npy('<u4',[height,width],array)],['metadata_json.npy',unicode(countMeta)]]));
 const original=new Uint8Array(width*height*3).fill(30),image={id:'image',width,height,sourceSha256:sha,blob:new Blob(['untouched-original']),runs:sparse?[run]:[{operation:'ai.clones.segmentation',params:{variant:'mgcfdn'},status:'done',files:[],entries:[{polygons:[[[0,0],[39,0],[39,31],[0,31]]]}]}],preparation,score:{clones:3},finalDisplay:{kind:counts?'corroboration':'biomes',files:counts?['final.npz']:['native-sift.npz'],pendingRendering:false,scopeFingerprint:preparation?.fingerprint??null}};
 return {artifacts,image,original,array,run,metadata};
}
const preferences=mode=>({schema:BATCH_DISPLAY_PREFERENCES_SCHEMA,mode,opacity:.35});
test('Legacy hardcoded display migrates to15; explicit zero/custom native views and original separation remain distinct',()=>{
 assert.equal(resolveBatchBiomeView({display:nativeStyle,parameters:{minimum:10}},{}).view.low,15);
 assert.equal(resolveBatchBiomeView({display:nativeStyle,parameters:{minimum:10}},{}).matchingMinimum,10);
 assert.equal(resolveBatchBiomeView({display:nativeStyle},{view:{low:0}}).view.low,0);
 assert.equal(resolveBatchBiomeView({display:{...nativeStyle,low:22}},{}).view.low,22);
 assert.equal(resolveBatchBiomeView({},{}).view.low,15);assert.equal(resolveBatchBiomeView({},{}).matchingMinimum,7);assert.equal(resolveBatchBiomeView({},{}).view.minimum,4);
});
test('Neural masks/corroboration pixels do not become biomes and old union preferences normalize honestly',async()=>{
 const f=await fixture({sparse:false}),service=createBatchResultDisplay({artifacts:f.artifacts});f.image.displayPreferences=preferences('biomes');
 try{const description=service.describe(f.image);assert.equal(description.capabilities.biomes.available,false);assert.equal(description.preferences.mode,'corroboration');assert.match(description.reason,/D2PRL\/MGCFDN/);
  const preview=await service.preparePreview(f.image);assert.equal(preview.biomes,null);assert.equal(preview.corroboration.rgba.at(-1),255);await assert.rejects(service.ensureRendered(f.image,{mode:'biomes'}),{code:'BATCH_BIOMES_UNAVAILABLE'});assert.equal(f.image.resultDisplay,undefined);
 }finally{await service.dispose();}
});
test('Biomes replay paired native groups, original colors and length filters; unrelated count pixels stay transparent',async()=>{
 const f=await fixture(),service=createBatchResultDisplay({artifacts:f.artifacts,dependencies:{geometryFactory:geometricOracle}}),before=JSON.stringify(f.image.runs),npz=f.artifacts.get('final.npz');
 try{const preview=await service.preparePreview(f.image,{maxWidth:40,maxHeight:32});assert.equal(preview.biomes.metadata.groupCount,2);assert.deepEqual(preview.biomes.metadata.groups.map(g=>g.colorRgb),[[240,20,100],[40,200,5]]);assert.equal(preview.biomes.rgba.at(-1),0);assert.equal(preview.corroboration.rgba.at(-1),255);
  const pixel=(x,y)=>[...preview.biomes.rgba.subarray((y*40+x)*4,(y*40+x)*4+4)];assert.deepEqual(pixel(4,3),[240,20,100,255]);assert.deepEqual(pixel(24,3),pixel(4,3));assert.deepEqual(pixel(7,7),[0,0,0,0],'Triangle hull is not its bounding box.');assert.deepEqual(pixel(4,24),[0,0,0,0],'Length12 pairs are hidden by15.');
  assert.deepEqual(pixel(5,4),[240,20,100,71],'28% fill is distinct from the full contour alpha.');assert.equal(preview.biomes.metadata.style.fillOpacity,.28);assert.equal(preview.biomes.metadata.style.contourWidth,2);assert.equal(preview.biomes.metadata.style.contourOpacity,1);
  assert.equal(preview.biomes.metadata.geometrySources[0].matchingMinimum,10);assert.equal(preview.biomes.metadata.geometrySources[0].viewSource,'legacy-hardcoded-default-migrated-to-15');assert.equal(JSON.stringify(f.image.runs),before);assert.equal(f.artifacts.get('final.npz'),npz);
 }finally{await service.dispose();}
});
test('Explicit archived low0 is preserved and true single-method biomes need no corroboration counts',async()=>{
 const f=await fixture({counts:false,explicitView:{low:0}}),service=createBatchResultDisplay({artifacts:f.artifacts,dependencies:{geometryFactory:geometricOracle}});
 try{assert.equal(service.describe(f.image).capabilities.corroboration.available,false);const preview=await service.preparePreview(f.image);assert.equal(preview.corroboration,null);assert.equal(preview.biomes.metadata.groupCount,3);assert.equal(preview.biomes.metadata.geometrySources[0].view.low,0);
 }finally{await service.dispose();}
});
test('Scientific text exclusions clip only the presentation while paired polygons/groups remain archived',async()=>{
 const f=await fixture({scope:true}),service=createBatchResultDisplay({artifacts:f.artifacts,dependencies:{geometryFactory:geometricOracle}});
 try{const preview=await service.preparePreview(f.image);assert.equal(preview.biomes.rgba[(3*40+4)*4+3],0);assert.equal(preview.biomes.rgba[(3*40+24)*4+3],255);assert.equal(f.image.preparation.excluded.length,1);assert.equal(f.image.runs[0].entries.length,3);
 }finally{await service.dispose();}
});
test('Dense native snapshot and flat group arrays retain paired hulls/colors without loading dense maps',async()=>{
 for(const format of ['dense-snapshot','dense-fields']){
  const f=await fixture({format}),service=createBatchResultDisplay({artifacts:f.artifacts,dependencies:{geometryFactory:geometricOracle}}),npz=f.artifacts.get('native-sift.npz');
  try{const preview=await service.preparePreview(f.image);assert.ok(preview.biomes,preview.metadata.biomesUnavailable);assert.equal(preview.biomes.metadata.groupCount,2);assert.deepEqual(preview.biomes.metadata.methods,['PatchMatch Zernike']);assert.deepEqual(preview.biomes.metadata.groups.map(g=>g.colorRgb),[[240,20,100],[40,200,5]]);assert.equal(preview.biomes.metadata.geometrySources[0].operation,'tampering.copyMove.dense');assert.equal(preview.biomes.metadata.geometrySources[0].format,format==='dense-snapshot'?'dense-native-snapshot':'dense-native-fields');assert.equal(f.artifacts.get('native-sift.npz'),npz);}
  finally{await service.dispose();}
 }
});
test('Dense native archives admit more than64 legitimate group arrays under the bounded ZIP directory budget',async()=>{
 const f=await fixture({format:'dense-snapshot',counts:false,groupCount:70,explicitView:{low:0}}),service=createBatchResultDisplay({artifacts:f.artifacts,dependencies:{geometryFactory:geometricOracle}});
 try{const preview=await service.preparePreview(f.image);assert.ok(preview.biomes,preview.metadata.biomesUnavailable);assert.equal(preview.biomes.metadata.groupCount,70);assert.deepEqual(preview.biomes.metadata.groups.map(g=>g.group),Array.from({length:70},(_,i)=>i));assert.equal(preview.biomes.metadata.geometrySources[0].format,'dense-native-snapshot');}finally{await service.dispose();}
});
test('Native source/scope mismatch cannot supply a false biome layer; corroboration stays available',async()=>{
 const f=await fixture();f.artifacts.set('native-sift.json',new Blob([JSON.stringify({provenance:{operation:'tampering.copyMove.sparse',originalSha256:'b'.repeat(64)}})]));const service=createBatchResultDisplay({artifacts:f.artifacts,dependencies:{geometryFactory:geometricOracle}});
 try{const preview=await service.preparePreview(f.image);assert.equal(preview.biomes,null);assert.match(preview.metadata.biomesUnavailable,/autre image/);assert.equal(service.describe(f.image).capabilities.biomes.available,false);await assert.rejects(service.ensureRendered(f.image,{mode:'biomes'}),{code:'BATCH_BIOMES_UNAVAILABLE'});
 }finally{await service.dispose();}
});
test('Cancelled preparation can retry with unchanged native arrays and no model execution',async()=>{
 const f=await fixture(),service=createBatchResultDisplay({artifacts:f.artifacts,dependencies:{geometryFactory:geometricOracle}}),abort=new AbortController();abort.abort();
 try{await assert.rejects(service.preparePreview(f.image,{signal:abort.signal}));const preview=await service.preparePreview(f.image);assert.equal(preview.biomes.metadata.groupCount,2);assert.equal(service.snapshot().retainedFullCountGrids,0);assert.equal(service.snapshot().retainedPreviewRgbaBytes,0);
 }finally{await service.dispose();}
});
test('Corrupted native point bytes cannot become trusted biomes even with valid count metadata',async()=>{
 const f=await fixture(),raw=new Uint8Array(await f.artifacts.get('native-sift.npz').arrayBuffer());
 // First STORE member is points.npy. Change one coordinate byte while retaining
 // the immutable central-directory CRC so this is a real transport corruption.
 const view=new DataView(raw.buffer),start=30+view.getUint16(26,true)+view.getUint16(28,true),payload=start+10+view.getUint16(start+8,true);raw[payload]^=1;f.artifacts.set('native-sift.npz',new Blob([raw]));
 const service=createBatchResultDisplay({artifacts:f.artifacts,dependencies:{geometryFactory:geometricOracle}});
 try{const preview=await service.preparePreview(f.image);assert.equal(preview.biomes,null);assert.match(preview.metadata.biomesUnavailable,/CRC/);assert.ok(preview.corroboration);assert.equal(service.describe(f.image).capabilities.biomes.available,false);}finally{await service.dispose();}
});
test('Bounded full rendering changes only presentation pixels and replaces one version2 PNG',async()=>{
 const f=await fixture({scope:true}),frames=[],budget=new Budget(256*1024**2);let loads=0,disposals=0;
 const chunks=[];
 const rasterFactory=()=>({async create(surface){const pixels=new Uint8Array(f.original.length);for(let y=0;y<32;y+=4){const leased=await surface.readWindow({x:0,y,width:40,height:4});try{pixels.set(leased.pixels.data,y*40*3);}finally{leased.release();}}frames.push(pixels);return {id:'png',revision:1,byteLength:pixels.length,sha256:'test-transport'};},async read({offset,length}){return {bytes:frames.at(-1).subarray(offset,offset+length)};},async release(){}});
 const service=createBatchResultDisplay({artifacts:f.artifacts,toolFactory:async()=>({source:{sha256:sha,surface:{id:'original',width:40,height:32,format:'rgb8'}},async load(){loads++;},async readWindow(source,{x,y,width,height}){const data=new Uint8Array(width*height*3);for(let row=0;row<height;row++)data.set(f.original.subarray(((y+row)*40+x)*3,((y+row)*40+x+width)*3),row*width*3);return {width,height,data};},run(){throw Error('No detector rerun allowed.');},async dispose(){disposals++;}}),dependencies:{budgetFactory:()=>budget,geometryFactory:geometricOracle,rasterFactory,sinkFactory:async()=>({async write(bytes){chunks.push(new Uint8Array(bytes));},async finish(){const blob=new Blob(chunks.splice(0));return {blob,async cleanup(){}};},async abort(){chunks.length=0;}})}});
 const scientific=JSON.stringify([f.image.runs,f.image.finalDisplay,f.image.score]);
 try{const result=await service.ensureRendered(f.image,{mode:'biomes',opacity:1});assert.equal(result.version,2);assert.equal(result.presentation.biomes.schema,'sherloq.batch-biome-geometry/1');assert.equal(result.presentation.biomes.groupCount,2);const at=(x,y)=>(y*40+x)*3;
  assert.deepEqual([...frames[0].subarray(at(24,3),at(24,3)+3)],[240,20,100]);assert.deepEqual([...frames[0].subarray(at(25,4),at(25,4)+3)],[89,27,50],'Native-style interior fill28%, not an opaque flat biome.');assert.deepEqual([...frames[0].subarray(at(4,3),at(4,3)+3)],[30,30,30]);assert.deepEqual([...frames[0].subarray(-3)],[30,30,30]);assert.equal(JSON.stringify([f.image.runs,f.image.finalDisplay,f.image.score]),scientific);
  await service.ensureRendered(f.image,{mode:'biomes',opacity:1});assert.equal(loads,1);await service.ensureRendered(f.image,{mode:'biomes',opacity:.35});assert.deepEqual([...frames[1].subarray(at(25,4),at(25,4)+3)],[51,29,37],'User35% scales the completed native-style fill.');assert.deepEqual([...frames[1].subarray(at(24,3),at(24,3)+3)],[104,27,55],'User35% also scales the opaque contour.');await service.ensureRendered(f.image,{mode:'biomes',opacity:0});assert.deepEqual(frames[2],f.original);assert.equal(loads,3);assert.equal(disposals,3);assert.equal([...f.artifacts.keys()].filter(p=>p.endsWith('vue-resultat.png')).length,1);assert.equal(budget.snapshot().activeReservationBytes,0);
 }finally{await service.dispose();}
});
test('Pinned native OpenCV hull runtime qualifies the same paired-group contract',{skip:!process.env.SHERLOQ_BIOME_GEOMETRY_WASM},async()=>{
 const wasm=await readFile(process.env.SHERLOQ_BIOME_GEOMETRY_WASM);assert.equal(createHash('sha256').update(wasm).digest('hex'),'8b9c9b3f43bff7f295538d17495e1d9c16c673e963fc3f1c0fbfde284a523dc5');
 const f=await fixture(),service=createBatchResultDisplay({artifacts:f.artifacts,dependencies:{geometryFactory:options=>createCloneEntryGeometry({...options,wasmBinary:wasm})}});
 try{const preview=await service.preparePreview(f.image);assert.equal(preview.biomes.metadata.groupCount,2);assert.deepEqual(preview.biomes.metadata.groups.map(g=>g.colorRgb),[[240,20,100],[40,200,5]]);}finally{await service.dispose();}
});
test('Optional private diagnostic qualifies archived SIFT groups without publishing pixels or models',{skip:!process.env.SHERLOQ_BIOME_ARCHIVE||!process.env.SHERLOQ_BIOME_GEOMETRY_WASM},async()=>{
 const wasm=await readFile(process.env.SHERLOQ_BIOME_GEOMETRY_WASM),outer=await readBatchZip(new Blob([await readFile(process.env.SHERLOQ_BIOME_ARCHIVE)])),model=JSON.parse(await outer.file('sherloq-batch.json').async('string'));
 for(const image of model.images.slice(0,2)){
  const artifacts=new Map();for(const path of [...image.finalDisplay.files,...image.runs.flatMap(r=>r.files)])if(outer.file(path))artifacts.set(path,await outer.file(path).async('blob'));
  const service=createBatchResultDisplay({artifacts,dependencies:{geometryFactory:options=>createCloneEntryGeometry({...options,wasmBinary:wasm})}});
  try{const preview=await service.preparePreview(image);assert.ok(preview.biomes,preview.metadata.biomesUnavailable);assert.ok(preview.biomes.metadata.groupCount>0);assert.equal(preview.biomes.metadata.geometrySources[0].matchingMinimum,10);assert.equal(preview.biomes.metadata.geometrySources[0].view.low,15);assert.ok(preview.biomes.metadata.groups.every(g=>g.pairedSides===2));}finally{await service.dispose();}
 }
});
test('Optional real Dense Clone2 export restores the same visible native groups without a detector run',{skip:!process.env.SHERLOQ_BIOME_DENSE_NPZ||!process.env.SHERLOQ_BIOME_DENSE_JSON||!process.env.SHERLOQ_BIOME_GEOMETRY_WASM},async()=>{
 const jsonBytes=await readFile(process.env.SHERLOQ_BIOME_DENSE_JSON),raw=JSON.parse(jsonBytes),wasm=await readFile(process.env.SHERLOQ_BIOME_GEOMETRY_WASM),[width,height]=raw.provenance.decode.sourceSize,artifacts=new Map([['native.json',new Blob([jsonBytes])],['native.npz',new Blob([await readFile(process.env.SHERLOQ_BIOME_DENSE_NPZ)])]]);
 const image={id:'native-dense',width,height,sourceSha256:raw.provenance.originalSha256,finalDisplay:{kind:'biomes',files:['native.npz'],pendingRendering:false},runs:[{toolId:'native-dense',operation:'tampering.copyMove.dense',status:'done',params:{algorithm:raw.provenance.params.profile,minimum:raw.provenance.params.minimum},view:raw.style,files:['native.json','native.npz'],provenance:raw.provenance}]};
 const service=createBatchResultDisplay({artifacts,dependencies:{geometryFactory:options=>createCloneEntryGeometry({...options,wasmBinary:wasm})}});
 try{const preview=await service.preparePreview(image);assert.ok(preview.biomes,preview.metadata.biomesUnavailable);assert.equal(preview.biomes.metadata.groupCount,raw.visible.length);assert.deepEqual(preview.biomes.metadata.groups.map(g=>[g.group,g.pairs]),raw.visible);assert.equal(preview.biomes.metadata.geometrySources[0].format,'dense-native-snapshot');assert.equal(preview.biomes.metadata.geometrySources[0].view.low,raw.style.low);assert.equal(preview.biomes.metadata.geometrySources[0].matchingMinimum,raw.provenance.params.minimum);}finally{await service.dispose();}
});
