import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {TRUFOR_HEAT_COLORS,truforHeatFrame} from '../sherloq-browser/assets/trufor-palette.js';
import {createToolClient} from '../sherloq-browser/assets/tool-client.js';
import {createToolWorkspace} from '../sherloq-browser/assets/tool-workspace.js';
import {resultDisplays} from '../sherloq-browser/assets/tool-displays.js';

test('fixed TruFor colours interpolate RGB without per-image normalization or map mutation',()=>{
 const values=Float32Array.of(0,.125,.25,.375,.5,.625,.75,.875,1),before=values.slice();
 assert.deepEqual(TRUFOR_HEAT_COLORS,[[7,15,39],[42,42,109],[207,66,59],[251,177,53],[255,248,201]]);
 assert.deepEqual([...truforHeatFrame(9,1,values).data],[7,15,39,24,28,74,42,42,109,124,54,84,207,66,59,229,121,56,251,177,53,253,212,127,255,248,201]);
 assert.deepEqual([...truforHeatFrame(1,1,Float32Array.of(.5)).data],[207,66,59]);
 assert.deepEqual(values,before);assert.throws(()=>truforHeatFrame(1,1,[NaN]),/Non-finite/);
});

test('TruFor retains its three original views and adds a sampled, exportable palette without another inference',async()=>{
 const previous=globalThis.fetch;globalThis.fetch=async()=>({json:async()=>({assetBase:'./unified-assets/'})});
 const values=Float32Array.from({length:27},(_,i)=>(i%9)/8),calls=[],leases=new Set();let runs=0,fail=false;
 const engine={loadBlob:async()=>({id:'source',surface:{id:'source-rgb',revision:1,width:9,height:3,format:'rgb8'}}),capabilities:async()=>({memory:{budgetBytes:2**30,retainedBytes:0,cacheBytes:0,knownHeapCapacityBytes:0}}),dispose:async()=>{}};
 const m2={ready:{windowBytes:64},async analyzeBlob(){runs++;return{id:1,width:9,height:3,fields:{map:{type:'Float32Array',length:27,byteLength:108}}};},metadata:async()=>({score:.5}),async reserveExternalMemory({bytes}){const id=Symbol();leases.add(id);return{id,bytes};},async releaseExternalMemory(id){assert(leases.delete(id));},async readArray(id,field,offset,count){assert.equal(field,'map');assert(count<=16);calls.push({offset,count});if(fail){fail=false;throw Error('Read failed');}return values.slice(offset,offset+count);},readDisplay:async()=>({pixels:{width:1,height:1,format:'rgb8',data:Uint8Array.of(9,8,7)}}),release:async()=>{},dispose:async()=>{}};
 const client=await createToolClient({engineFactory:()=>engine,m2Factory:async()=>m2});
 try{
  const file=new Blob(['original']);await client.load({id:'source',blob:file});const output=await client.run({id:'r',operation:'m2.trufor',params:{},backend:'auto'},{file});
  assert.deepEqual(output.views.map(v=>v.view),['map','confidence','noiseprint_pp','map_alternative']);const display=output.views[3];
  assert.match(resultDisplays(output)[3].label,/palette alternative/);
  const tile=await client.readTile(display,{x:1,y:1,w:7,h:2,step:3});assert.equal(tile.width,3);assert.equal(tile.height,1);assert.deepEqual(tile.data,truforHeatFrame(3,1,Float32Array.of(.125,.5,.875)).data);
  const full=await client.readWindow(display,{x:0,y:0,width:9,height:3});assert.deepEqual(full.data,truforHeatFrame(9,3,values).data);
  fail=true;await assert.rejects(client.readTile(display,{x:0,y:0,w:3,h:1,step:1}),/Read failed/);assert.equal(leases.size,0);
  const old=await client.readTile(output.views[0],{x:0,y:0,w:1,h:1,step:1});assert.deepEqual([...old.data],[9,8,7]);assert.equal(runs,1);assert(calls.length>1);
 }finally{await client.dispose();globalThis.fetch=previous;}
});

test('palette selection, fixed legend and remembered view leave original TruFor displays available',async()=>{
 const {document,window}=parseHTML('<html><body><div id="analysis-controls"></div><div id="viewport"></div><button id="export-png"></button></body></html>');
 const oldDocument=globalThis.document,oldOption=globalThis.Option;globalThis.document=document;globalThis.Option=function(text,value){const option=document.createElement('option');option.textContent=text;option.value=value;return option;};
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return [...this.options].find(o=>o.hasAttribute('selected'))?.value||this.options[0]?.value||'';},set(v){for(const o of this.options)o.toggleAttribute('selected',o.value===String(v));}});
 let language='fr';const shown=[],settings=[];
 try{
  const ui=createToolWorkspace({document,language:()=>language,getClient:async()=>({}),run(){},cancel(){},showSurface:d=>shown.push(d),download(){},notify(){},onSettings:s=>settings.push(s)});
  ui.select('m2.trufor');const views=['map','confidence','noiseprint_pp','map_alternative'].map(view=>({id:view,view,m2Result:1,width:2,height:2,revision:1,format:'rgb8',...(view==='map_alternative'?{truforPalette:true}:{})}));
  const result={operation:'m2.trufor',status:'ok',m2Result:{id:1},data:{score:.5},views};await ui.render(result);
  const layers=document.getElementById('tool-layer'),legend=document.querySelector('.trufor-palette-legend');assert.equal(layers.options.length,4);assert([...document.querySelectorAll('.tool-exports button')].some(b=>b.textContent==='JSON'));assert([...document.querySelectorAll('.tool-exports button')].some(b=>b.textContent==='NPZ scientifique complet'));assert.equal(shown.at(-1).view,'map');assert.equal(legend.hidden,true);
  layers.value='3';layers.onchange();assert.equal(shown.at(-1).view,'map_alternative');assert.equal(legend.hidden,false);assert.deepEqual([...legend.querySelectorAll('.trufor-palette-ticks span')].map(n=>n.textContent),['0','0,5','1']);assert.deepEqual(settings.at(-1),{presentationOnly:true});assert.equal(ui.serialize().uiOptions.truforView,'map_alternative');
  language='en';ui.translate();assert.match(layers.options[3].textContent,/alternative palette/);assert.equal(legend.querySelector('.trufor-palette-ticks').textContent,'00.51');await ui.render(result);assert.equal(shown.at(-1).view,'map_alternative');const saved=ui.serialize();ui.restore(saved);await ui.render(result);assert.equal(shown.at(-1).view,'map_alternative');ui.restore({uiOptions:{truforView:'map_alternative'}});await ui.render(result);assert.equal(shown.at(-1).view,'map');ui.setOriginal(true);assert(legend.hidden);
 }finally{globalThis.document=oldDocument;globalThis.Option=oldOption;}
});
