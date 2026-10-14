import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {createRemoteSurface} from '../sherloq-browser/assets/remote-surface.js';
import {TileCache} from '../sherloq-browser/assets/tiled-surface.js';
import {resultDisplays} from '../sherloq-browser/assets/tool-displays.js';
import {createErrorJournal,errorEvidence} from '../sherloq-browser/assets/error-journal.js';
import {errorText} from '../sherloq-browser/assets/ui-errors.js';

// Execute the shipped individual controller, frame reader and draw handlers.
// A controlled engine transport supplies pixels; these tests do not execute
// PatchMatch or make a browser/native-analysis qualification claim.
const sourceCode=await readFile(new URL('../sherloq-browser/assets/app.js',import.meta.url),'utf8');
const block=(start,end)=>{const i=sourceCode.indexOf(start),j=sourceCode.indexOf(end,i);assert.ok(i>=0&&j>i);return sourceCode.slice(i,j);};
const code=[block('function retireResult(', 'const localMagnifier='),block('function remoteSurface(', 'function fit('),block('function setDrawing(value){',"$('draw').onclick="),block('function draw(){','const imageInteraction='),block('function discardIndividualPresentation(', ' function translateTaskActions(')].join('\n');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const descriptor=(id,width=659,height=676)=>({id,revision:1,width,height,format:'rgb8'});
const output=surface=>({id:'dense-current',operation:'tampering.copyMove.dense',status:'ok',surface,data:{points:new Float32Array([0,0,1,1]),pairs:new Float64Array([0,1,.1,2]),params:{profile:'PatchMatch Zernike'},dense_fields:[{width:surface.width,height:surface.height,context:{origin:[0,0]}}]},provenance:{originalSha256:'current-original',params:{profile:'PatchMatch Zernike'}},metrics:{}});
function setup({width=659,height=676}={}){
 const nodes=new Map(),reads=[],frames=[],paints=[];let renderFailure=null,runFailure=null,runWait=null,runs=0;
 const context2d=new Proxy({clearRect(){paints.push('clear');},drawImage(canvas){paints.push(canvas.image?.data[0]??canvas.paint??'source');}},{get:(value,key)=>value[key]??(()=>{})});
 const $=id=>{if(!nodes.has(id))nodes.set(id,{value:'',disabled:false,hidden:false,textContent:'',classList:{contains:()=>false,toggle(){}},setAttribute(){},reportValidity:()=>true});return nodes.get(id);};
 $('layer').value='result';
 const document={createElement(){const c={width:0,height:0,getContext(){return {createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(image){c.image=image;}};}};frames.push(c);return c;}};
 globalThis.document=document;
 const client={source:{id:'source'},async run(){runs++;if(runWait)await runWait;if(runFailure)throw runFailure;return output(descriptor('dense-new',width,height));}};
 const sandbox={console,crypto:webcrypto,structuredClone,createRemoteSurface,TileCache,errorEvidence,errorText,clearTimeout(){},$: $,ctx:context2d,canvas:{width:800,height:800},view:{clientWidth:800,clientHeight:800,classList:{toggle(){}}},offset:{x:0,y:0},zoom:1,devicePixelRatio:1,lang:'en',tileCache:new TileCache(),revision:4,destroyed:false,activeAnalysis:'tampering.copyMove.sparse',source:{width,height,prepare:()=>true,draw(){paints.push('source');},close(){}},result:null,previousPresentation:null,presentedSurface:null,comparisonSource:null,comparisonBase:null,comparingOriginal:false,fileInput:new Blob(['source']),imageId:'source',hash:'current-original',busy:false,elaParameterDraft:false,energyMode:false,energyViewBusy:false,energyPreviewed:false,loaded:true,individualCancelled:false,lastIndividualProgress:null,individualComputing:null,individualCleanup:Promise.resolve(),automaticCleanup:Promise.resolve(),compositeCleanup:Promise.resolve(),individualUI:null,regionController:null,autoRunTimer:null,pointerLoupe:null,layouts:null,regions:[],draft:null,drawing:false,pointers:new Map(),gesture:null,resultMeta:{operation:'old-method',status:'ok'},pendingMagnifier:false,host:{},errorJournal:createErrorJournal(),t:key=>key,autoText:(_fr,en)=>en,toolTitle:()=>'',displayedZoom:()=>100,individualMode:()=>true,automaticMode:()=>false,compositeMode:()=>false,localMagnifier:()=>false,processedSurface:()=>sandbox.result??sandbox.previousPresentation,selectedSurface:()=>sandbox.$('layer').value==='result'?(sandbox.result??sandbox.previousPresentation??sandbox.source):sandbox.source,controls(){},translateTaskActions(){},refreshLocalMagnifier(){},queueAnalysis(){},status(text){$('status').textContent=text;},scheduleDraw(){queueMicrotask(()=>sandbox.draw());},fit(){sandbox.draw();},ensureIndividualClient:async()=>client,request(_action,{display,tile}){return new Promise((resolve,reject)=>reads.push({display,tile,resolve,reject}));}};
 sandbox.individualUI={invalidations:0,invalidateResult(){this.invalidations++;},setFile(){},operation:()=> 'tampering.copyMove.dense',params:()=>({profile:'PatchMatch Zernike'}),view:()=>({areas:true}),backend:()=> 'auto',taskRegions:()=>[],extras:{},serialize:()=>({}),setOriginal(){},async render(out){const found=resultDisplays(out);assert.equal(found.length,1);assert.equal(found[0].display.id,'dense-new');sandbox.showIndividualSurface(found[0].display);if(renderFailure)throw renderFailure;}};
 vm.createContext(sandbox);vm.runInContext(code,sandbox);
 const finish=(read,color=22)=>read.resolve({pixels:{width:Math.ceil(read.tile.w/read.tile.step),height:Math.ceil(read.tile.h/read.tile.step),data:new Uint8Array(Math.ceil(read.tile.w/read.tile.step)*Math.ceil(read.tile.h/read.tile.step)*3).fill(color)}});
 async function previous(){sandbox.result=sandbox.remoteSurface(descriptor('old',width,height));sandbox.draw();await tick();finish(reads[0],99);await tick();assert.equal(paints.at(-1),99);}
 return {sandbox,$,client,reads,frames,paints,finish,previous,get runs(){return runs;},setRunFailure(error){runFailure=error;},setRenderFailure(error){renderFailure=error;},setRunWait(promise){runWait=promise;}};
}
for(const dimensions of [[659,676],[576,605]])test('Dense publishes and displays the current RGB8 surface '+dimensions.join('×')+' instead of the previous frame',async()=>{
 const h=setup({width:dimensions[0],height:dimensions[1]});await h.previous();await h.sandbox.runIndividual();await tick();
 assert.equal(h.sandbox.resultMeta.status,'ok');assert.equal(h.sandbox.result.display.id,'dense-new');assert.equal(h.reads.at(-1).display.id,'dense-new');assert.equal(h.sandbox.previousPresentation.previewOnly,true);
 h.finish(h.reads.at(-1),44);await tick();assert.equal(h.paints.at(-1),44);assert.equal(h.sandbox.previousPresentation,null);assert.equal(h.frames[0].width,0);assert.equal(h.$('export-png').disabled,false);
 h.sandbox.retireResult(false);assert.equal(h.sandbox.tileCache.bytes,0);
});
for(const phase of ['calculation','presentation'])test(phase+' failure retires all previous results and leaves only an exportable diagnostic',async()=>{
 const h=setup();await h.previous();const error=Object.assign(Error('failed '+phase),{code:'INTERNAL'});if(phase==='calculation')h.setRunFailure(error);else h.setRenderFailure(error);await h.sandbox.runIndividual();await tick();
 assert.equal(h.sandbox.result,null);assert.equal(h.sandbox.previousPresentation,null);assert.equal(h.frames[0].width,0);assert.equal(h.$('layer').value,'source');assert.equal(h.$('export-png').disabled,true);assert.equal(h.$('export-report').disabled,false);assert.equal(h.sandbox.resultMeta.status,'error');assert.match(h.$('status').textContent,/failed/);assert.equal(h.paints.at(-1),'source');
});
test('a failed first display read cannot retain the older image or an OK report',async()=>{
 const h=setup();await h.previous();await h.sandbox.runIndividual();await tick();h.reads.at(-1).reject(Object.assign(Error('surface lost'),{code:'NOT_FOUND'}));await tick();
 assert.equal(h.sandbox.result,null);assert.equal(h.sandbox.previousPresentation,null);assert.equal(h.sandbox.resultMeta.status,'error');assert.equal(h.sandbox.resultMeta.calculationStatus,'ok');assert.equal(h.sandbox.resultMeta.phase,'display');assert.equal(h.sandbox.resultMeta.context.phase,'display-read');assert.equal(h.sandbox.resultMeta.context.surfaceId,'dense-new');assert.equal(h.$('layer').value,'source');assert.equal(h.$('export-png').disabled,true);assert.equal(h.$('export-report').disabled,false);assert.equal(h.paints.at(-1),'source');assert.match(h.$('status').textContent,/surface lost/);
});
test('a frame-read failure from an obsolete layer cannot discard the replacement',async()=>{
 const h=setup();await h.previous();await h.sandbox.runIndividual();await tick();const obsolete=h.reads.at(-1);h.sandbox.showIndividualSurface(descriptor('replacement'));await tick();const current=h.reads.at(-1);obsolete.reject(Object.assign(Error('old read failed'),{code:'NOT_FOUND'}));await tick();h.finish(current,55);await tick();
 assert.equal(h.sandbox.result.display.id,'replacement');assert.equal(h.sandbox.resultMeta.status,'ok');assert.equal(h.sandbox.errorJournal.length,0);assert.equal(h.paints.at(-1),55);h.sandbox.retireResult(false);
});
test('an invalidated calculation generation cannot publish a late Dense surface',async()=>{
 const h=setup();let finish;h.setRunWait(new Promise(resolve=>finish=resolve));const task=h.sandbox.runIndividual();await tick();h.sandbox.revision++;finish();await task;assert.equal(h.sandbox.result,null);assert.equal(h.sandbox.resultMeta,null);assert.equal(h.reads.length,0);
});

for(const managed of [true,false])test('ending tracing restores the same calculated Dense surface without rerunning, managed='+managed,async()=>{
 const h=setup();h.sandbox.host.managed=managed;await h.sandbox.runIndividual();await tick();h.finish(h.reads.at(-1),42);await tick();const retained=h.sandbox.result;h.sandbox.setDrawing(true);assert.equal(h.$('layer').value,'source');h.sandbox.regions=[{id:'new-panel',x0:10,y0:10,x1:100,y1:100}];h.sandbox.setDrawing(false);assert.equal(h.$('layer').value,'result');assert.equal(h.sandbox.result,retained);assert.equal(h.runs,1);assert.equal(h.paints.at(-1),42);h.sandbox.retireResult(false);
});
test('ending tracing preserves an explicitly selected Original presentation',async()=>{
 const h=setup();await h.sandbox.runIndividual();await tick();h.finish(h.reads.at(-1),42);await tick();h.sandbox.comparingOriginal=true;h.sandbox.setDrawing(true);h.sandbox.setDrawing(false);assert.equal(h.$('layer').value,'source');assert.equal(h.runs,1);h.sandbox.retireResult(false);
});
