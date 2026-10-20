import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {visibleOcrRegions,ocrText,ocrDisplay,updateOcrPresentation,renderOcrWindow,renderOcrText} from '../sherloq-browser/assets/ocr-presentation.js';
const data={width:12,height:10,text:'Énergie mesurée\n<texte>',regions:[{id:'a',lineId:1,text:'Énergie',score:.99,bounds:[1,1,5,5]},{id:'b',lineId:1,text:'mesurée',score:.5,bounds:[6,1,10,5]},{id:'c',lineId:2,text:'<texte>',score:.2,bounds:[1,6,8,9]}]};
const source={id:'source',revision:1,width:12,height:10,format:'rgb8'};
const output={id:'result',operation:'various.ocr',data,provenance:{params:{algorithm:'tesseract',language:'fra',psm:3,threshold:0,view:'overlay'}}};
test('confidence filtering preserves original transcription and native scores, then restores every region',()=>{
 const before=structuredClone(data);assert.equal(ocrText(data,0),data.text);assert.equal(ocrText(data,.4),'Énergie mesurée');assert.equal(ocrText(data,.9),'Énergie');assert.equal(visibleOcrRegions(data,1).length,0);assert.equal(visibleOcrRegions(data,0).length,3);assert.deepEqual(data,before);
});
test('filtering keeps native line order even when word tops differ by a pixel',()=>{
 const a={id:'a',lineKey:'l',text:'SHERLOQ',score:.99,bounds:[0,29,10,40]},b={id:'b',lineKey:'l',text:'123',score:.99,bounds:[11,30,16,40]},c={id:'c',lineKey:'l',text:'TEST',score:.1,bounds:[17,29,25,40]},d={text:'SHERLOQ 123 TEST',regions:[a,c,b],lines:[{regions:[a,b,c]}]};assert.equal(ocrText(d,.2),'SHERLOQ 123');assert.equal(ocrText({...d,lines:undefined},.2),'SHERLOQ 123');
});
test('local presentation cannot silently change recognition algorithm, language or layout',()=>{
 const initial={...output,parameterViews:[ocrDisplay(output,source)]};for(const params of [{algorithm:'ppocr-medium'},{language:'eng'},{psm:6}])assert.equal(updateOcrPresentation(initial,params),null);
 const next=updateOcrPresentation(initial,{threshold:.9,view:'text'});assert.equal(next.data,data);assert.equal(next.parameterViews[0].ocrPresentation.threshold,.9);assert.equal(next.metrics.presentation.recognitionCalls,0);assert.equal(initial.provenance.params.threshold,0);assert.equal(next.parameterViews[0].ocrPresentation.source,source);
});
test('overlay reads only the requested native window; text mode exports the original pixels',async()=>{
 const calls=[],read=async(s,tile)=>{calls.push({s,tile});return{width:Math.ceil(tile.w/tile.step),height:Math.ceil(tile.h/tile.step),format:'rgb8',data:new Uint8Array(Math.ceil(tile.w/tile.step)*Math.ceil(tile.h/tile.step)*3).fill(80)};};
 const tile={x:0,y:0,w:12,h:10,step:1},display=ocrDisplay(output,source),overlay=await renderOcrWindow(display,tile,read);assert.deepEqual(calls,[{s:source,tile}]);assert.deepEqual([...overlay.data.subarray((1*12+1)*3,(1*12+1)*3+3)],[36,215,151]);assert.equal(overlay.data[(3*12+3)*3],80);
 const text=await renderOcrWindow({...display,ocrPresentation:{...display.ocrPresentation,view:'text'}},tile,read);assert.ok(text.data.every(value=>value===80));
});
test('banded standard export and sampled viewport use native global box coordinates',async()=>{
 const read=async(_source,tile)=>({width:Math.ceil(tile.w/tile.step),height:Math.ceil(tile.h/tile.step),format:'rgb8',data:new Uint8Array(Math.ceil(tile.w/tile.step)*Math.ceil(tile.h/tile.step)*3).fill(80)}),display=ocrDisplay(output,source),all=await renderOcrWindow(display,{x:0,y:0,w:12,h:10,step:1},read),bands=new Uint8Array(all.data.length);
 for(let y=0;y<10;y+=2){const band=await renderOcrWindow(display,{x:0,y,w:12,h:2,step:1},read);bands.set(band.data,y*12*3);}assert.deepEqual(bands,all.data);
 const sampled=await renderOcrWindow(display,{x:0,y:0,w:12,h:10,step:2},read);assert.equal(sampled.width,6);assert.equal(sampled.height,5);assert.ok(sampled.data.some(value=>value===215));
});
test('recognized markup is inert text; no NPZ/JSON/layer-export buttons are added',()=>{
 const {document}=parseHTML('<body><main></main></body>'),parent=document.querySelector('main');renderOcrText(document,parent,output,{language:'fr'});assert.equal(parent.querySelector('textarea').value,data.text);assert.equal(parent.querySelector('texte'),null);assert.deepEqual([...parent.querySelectorAll('button')].map(node=>node.textContent),['Copier le texte']);
});
