import test from 'node:test';
import assert from 'node:assert/strict';
import {batchArchiveLayout,remapBatchEvidence} from '../web/wordpress/sherloq-browser/assets/batch-archive-layout.js';
import {writeBatchZip,readBatchZip} from '../web/wordpress/sherloq-browser/assets/batch-zip.js';
import {annotatedStudy} from '../web/wordpress/sherloq-browser/assets/batch-export.js';
import * as pdf from '../web/wordpress/sherloq-browser/assets/batch-vendor/pdf-lib.js';
import {inflateSync} from 'node:zlib';

const image=(id,name,files,title='SIFT + G2NN + RANSAC + Panels + Text')=>({id,name,blob:new Blob(['source']),thumbnail:new Blob(),restored:{},preparation:{schema:'sherloq.scientific-scope/1',excluded:[[[0,0],[10,0],[10,10]]]},occurrences:[{studyId:'study',page:1,textExclusions:[[[1,1],[2,1],[2,2]]]}],runs:[{toolId:'clone-16',title,files}]});
function fixture(){
 const images=[image('a','Figure 1.png',['resultats/a/clone-16.json','resultats/a/clone-16.png','resultats/a/clone-16.npz']),image('b','figure 1.PNG',['resultats/b/clone-16.json','resultats/b/clone-16.png','resultats/b/clone-16.npz'])];
 const comparisons=[{kind:'geometric-matches',images:['a','b'],files:['comparaisons/0.json','comparaisons/0.png']}];
 const artifacts=new Map([...images.flatMap(i=>i.runs[0].files),...comparisons[0].files].map(path=>[path,new Blob([path.endsWith('.json')?'{}':path],{type:'application/octet-stream'})]));
 return {images,comparisons,artifacts};
}
test('Flat archive keeps distinct source images and associates every result with its source and method',()=>{
 const model=fixture(),before=structuredClone({images:model.images,comparisons:model.comparisons}),layout=batchArchiveLayout(model);
 assert.deepEqual([...layout.sources.values()],['images/Figure 1.png','images/figure 1 (2).PNG']);
 const outputs=[...layout.paths.values()];assert.equal(new Set(outputs.map(path=>path.normalize('NFKC').toLowerCase())).size,outputs.length);
 for(const [original,path]of layout.paths){assert.match(path,/^resultats\/(images|donnees)\/[^/]+$/);assert.equal(path.endsWith('.png'),path.startsWith('resultats/images/'));if(original.startsWith('resultats/'))assert.match(path,/figure 1.*SIFT \+ G2NN/i);else assert.match(path,/comparaison/);}
 for(const owner of [...layout.images.flatMap(i=>i.runs),...layout.comparisons])for(const path of owner.files)assert.ok(outputs.includes(path));
 assert.deepEqual({images:model.images,comparisons:model.comparisons},before);assert.equal(layout.images[0].blob,undefined);assert.equal(layout.images[0].restored,undefined);assert.deepEqual(layout.images[0].preparation,model.images[0].preparation);assert.deepEqual(layout.images[0].occurrences,model.images[0].occurrences);
});
test('Archive names are collision-safe across platforms, Unicode normalization and long source names',()=>{
 const names=['CON.png','con.PNG','../../x:figure?.png','é.png','e\u0301.png','K.png','K.png','细胞'.repeat(100)+'.png'];
 const model={images:names.map((name,index)=>image(String(index),name,[`resultats/${index}/out.json`,`resultats/${index}/out.png`])),comparisons:[],artifacts:new Map(names.flatMap((_,index)=>[[`resultats/${index}/out.json`,new Blob(['{}'])],[`resultats/${index}/out.png`,new Blob(['png'])]]))};
 const layout=batchArchiveLayout(model),sources=[...layout.sources.values()],outputs=[...layout.paths.values()];
 for(const paths of [sources,outputs])assert.equal(new Set(paths.map(path=>path.normalize('NFKC').toLowerCase())).size,paths.length);
 for(const path of [...sources,...outputs]){const name=path.split('/').at(-1);assert.ok(new TextEncoder().encode(name).length<=255);assert.doesNotMatch(name,/[\\/:*?"<>|\x00-\x1f]/);assert.doesNotMatch(name,/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i);}
});
test('Additional native output variants remain distinct and orphan scientific files are preserved',()=>{
 const model={images:[image('a','cells.png',['resultats/a/mask.png','resultats/a/map.png','resultats/a/mask.json','resultats/a/mask.npz'],'Segmentation')],comparisons:[],artifacts:new Map(['resultats/a/mask.png','resultats/a/map.png','resultats/a/mask.json','resultats/a/mask.npz','resultats/a/diagnostic.json'].map(path=>[path,new Blob()]))};
 const layout=batchArchiveLayout(model);assert.equal(layout.paths.size,5);assert.equal(new Set(layout.paths.values()).size,5);assert.match(layout.paths.get('resultats/a/mask.png'),/cells -- Segmentation -- mask\.png$/);assert.match(layout.paths.get('resultats/a/map.png'),/cells -- Segmentation -- map\.png$/);assert.match(layout.paths.get('resultats/a/diagnostic.json'),/^resultats\/donnees\/diagnostic\.json$/);
});
test('Files with identical basenames in different native folders or extension case cannot overwrite each other',()=>{
 const files=['resultats/a/first/out.json','resultats/a/second/out.json','resultats/a/second/out.JSON','resultats/a/second/out.png'];
 const layout=batchArchiveLayout({images:[image('a','cells.png',files)],comparisons:[],artifacts:new Map(files.map(path=>[path,new Blob()]))});
 assert.equal(layout.paths.size,files.length);assert.equal(new Set([...layout.paths.values()].map(path=>path.normalize('NFKC').toLowerCase())).size,files.length);
});
test('Final display views and scientific counts use source-based flat paths without losing the archive references',()=>{
 const model=fixture(),image=model.images[0];image.finalDisplay={kind:'corroboration',files:['resultats/a/final.png','resultats/a/final.npz','resultats/a/final.json']};for(const path of image.finalDisplay.files)model.artifacts.set(path,new Blob());
 const before=image.finalDisplay.files.slice(),layout=batchArchiveLayout(model);for(const path of layout.images[0].finalDisplay.files){assert.match(path,/^resultats\/(images|donnees)\/Figure 1 -- corroboration\./);assert.ok([...layout.paths.values()].includes(path));}assert.deepEqual(image.finalDisplay.files,before);
});
function sink(){let bytes=new Uint8Array(0),position=0;return {get bytes(){return bytes;},async write(input){const value=input.data??input;if(input.type==='write')position=input.position;if(position+value.length>bytes.length){const next=new Uint8Array(position+value.length);next.set(bytes);bytes=next;}bytes.set(value,position);position+=value.length;},async seek(at){position=at;},async close(){},async abort(){}};}
test('Streaming flat exports keep scientific NPZ references valid without changing native payloads or live artifact keys',async()=>{
 const model=fixture(),old='resultats/a/clone-16.npz',json='resultats/a/clone-16.json',npz=new Blob([new Uint8Array([80,75,3,4,0,255])]),evidence={scientificArrays:old,metadata:{scientificArrays:old,nativeScore:0.9123456789012345},originalName:old};model.artifacts.set(old,npz);model.artifacts.set(json,new Blob([JSON.stringify(evidence)],{type:'application/json'}));
 const layout=batchArchiveLayout(model),entries=[];for(const [path,blob]of model.artifacts){const transformed=await remapBatchEvidence(blob,path,layout.paths);entries.push({path:layout.paths.get(path),size:transformed.size,read:async()=>remapBatchEvidence(blob,path,layout.paths)});}
 const writer=sink();await writeBatchZip(entries,writer);const zip=await readBatchZip(new Blob([writer.bytes])),saved=JSON.parse(await zip.file(layout.paths.get(json)).async('string'));
 assert.equal(saved.scientificArrays,layout.paths.get(old));assert.equal(saved.metadata.scientificArrays,saved.scientificArrays);assert.equal(saved.originalName,old);assert.equal(saved.metadata.nativeScore,evidence.metadata.nativeScore);assert.ok(zip.file(saved.scientificArrays));assert.deepEqual(new Uint8Array(await (await zip.file(saved.scientificArrays).async('blob')).arrayBuffer()),new Uint8Array(await npz.arrayBuffer()));assert.deepEqual(JSON.parse(await model.artifacts.get(json).text()),evidence);assert.equal(model.images[0].runs[0].files[0],json);
});
test('PDF annotation export preserves existing watermark content and font resources and adds no text appearance',async()=>{
 const doc=await pdf.PDFDocument.create(),page=doc.addPage([300,400]),font=await doc.embedFont(pdf.StandardFonts.TimesRoman);page.drawText('RETRACTED ARTICLE',{font,size:28,x:15,y:200,rotate:pdf.degrees(45),opacity:.4});const source=await doc.save(),original=await pdf.PDFDocument.load(source),study={id:'study',blob:new Blob([source])},images=[{id:'a',selected:true,width:100,height:100,name:'cells.png',score:{total:1,clones:1,additional:0},occurrences:[{studyId:'study',page:1,matrix:[100,0,0,100,20,50]}],runs:[{positive:true,title:'SIFT',entries:[{polygons:[[[5,5],[20,5],[20,20]]]}]}]}];
 const saved=await pdf.PDFDocument.load(await (await annotatedStudy(study,images,pdf)).arrayBuffer()),P=pdf.PDFName.of,contentBytes=d=>{const pages=d.getPages();return pages.map(p=>{const contents=p.node.Contents();return contents instanceof pdf.PDFArray?contents.asArray().map(ref=>Array.from(d.context.lookup(ref).getContents())):[Array.from(d.context.lookup(contents).getContents())];});};
 const before=contentBytes(original)[0],after=contentBytes(saved)[0];assert.deepEqual(after.slice(1,-1),before);assert.match(inflateSync(Uint8Array.from(after[0])).toString(),/^q\s*$/);assert.match(inflateSync(Uint8Array.from(after.at(-1))).toString(),/^Q\s*$/);const originalFonts=original.getPage(0).node.Resources().get(P('Font')),savedFonts=saved.getPage(0).node.Resources().get(P('Font'));assert.equal(savedFonts.toString(),originalFonts.toString());
 const annotations=saved.getPage(0).node.Annots();assert.equal(annotations.size(),1);const annotation=saved.context.lookup(annotations.get(0));assert.equal(String(annotation.get(P('Subtype'))),'/Polygon');const appearance=saved.context.lookup(annotation.get(P('AP')).get(P('N')));assert.equal(appearance.dict.get(P('Resources')).toString(),'<<\n>>');assert.doesNotMatch(inflateSync(appearance.getContents()).toString(),/\b(?:BT|Tj|TJ)\b/);
});
