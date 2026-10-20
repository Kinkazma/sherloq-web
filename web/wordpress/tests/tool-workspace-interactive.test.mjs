// DOM/controller checks only; native engines and browser qualification are separate.
import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createToolWorkspace} from '../sherloq-browser/assets/tool-workspace.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(id,sourceContext={}, {allowRun=false}={}){
 const {document,window}=parseHTML('<html><body><section id="analysis-controls"></section><div id="viewport"></div></body></html>'),frames=new Map(),timers=new Map(),events=[],settings=[],surfaces=[],tableReads=[],runs=[];let seq=0,prepares=0,time=0;
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return [...this.options].find(o=>o.hasAttribute('selected'))?.value||this.options[0]?.value||'';},set(v){for(const o of this.options)o.toggleAttribute('selected',o.value===String(v));}});
 window.HTMLElement.prototype.getBoundingClientRect=()=>({width:800,height:600,left:0,top:0});window.HTMLElement.prototype.reportValidity=()=>true;window.HTMLElement.prototype.checkValidity=()=>true;
 window.HTMLCanvasElement.prototype.getContext=function(){const canvas=this;return new Proxy({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),fillRect(...args){(canvas.drawRects??=[]).push(args);}},{get:(value,key)=>value[key]??(()=>{})});};
 for(const[key,value]of Object.entries({document,window,Option:class{constructor(text,value){const option=document.createElement('option');option.textContent=text;option.value=value;return option;}},requestAnimationFrame:fn=>{frames.set(++seq,fn);return seq;},cancelAnimationFrame:id=>frames.delete(id),ResizeObserver:class{observe(){}disconnect(){}},devicePixelRatio:1}))Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
 const timing={now:()=>time,delay:(fn,ms)=>{timers.set(++seq,{at:time+ms,fn});return seq;},cancelDelay:id=>timers.delete(id)},advance=(ms=120)=>{const until=time+ms;for(;;){const next=[...timers.entries()].filter(([,timer])=>timer.at<=until).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;time=next[1].at;timers.delete(next[0]);next[1].fn();}time=until;};
 const client={async prepareDisplayPreview(){prepares++;},async planDisplayPreview(display){prepares++;return{...display,responsePreview:true,previewStep:2};},async readTable(table,offset=0,limit=65536){const length=Math.max(0,Math.min(limit,table.rowCount-offset)),data=new Float32Array(length*6);for(let row=0;row<length;row++)for(let c=0;c<6;c++)data[row*6+c]=((offset+row)*6+c)%97/96;tableReads.push({offset,length,totalRows:table.rowCount});return{offset,length,totalRows:table.rowCount,data};}};
 const ui=createToolWorkspace({document,getSourceContext:()=>sourceContext,interactiveControlOptions:timing,language:()=> 'fr',getClient:async()=>client,run(){if(!allowRun)throw Error('No native run expected from controls');runs.push(ui.params());},cancel(){},showSurface:surface=>surfaces.push(surface),download(){},notify(){},onSettings:event=>settings.push(event??{}),onInteractive:event=>events.push(event)});
 ui.select(id);const emit=(target,type,properties={})=>target.dispatchEvent(Object.assign(new window.Event(type,{bubbles:true}),properties));
 return{ui,document,window,events,settings,surfaces,frames,tableReads,runs,input:key=>document.querySelector('#tool-param-'+key),emit,set(input,value){input.value=String(value);emit(input,'input');},draw(ms=120){advance(ms);const list=[...frames.values()];frames.clear();for(const fn of list)fn();},get prepares(){return prepares;}};
}
test('generic numeric holds apply settings before preview and delegate one final commit',()=>{
 const h=fixture('inspection.adjust'),input=h.input('brightness');h.emit(input,'pointerdown',{button:0,pointerId:1});for(let i=1;i<=12;i++){h.set(input,i);h.emit(input,'change');}assert.deepEqual(h.events.map(e=>e.phase),['begin']);assert.equal(h.events[0].params.brightness,1);assert.equal(h.settings.length,0);h.draw();assert.equal(h.events.at(-1).params.brightness,12);h.emit(h.document,'pointerup',{pointerId:1});h.emit(input,'change');assert.deepEqual(h.events.map(e=>e.phase),['begin','preview','commit']);assert.equal(h.events.at(-1).params.brightness,12);assert.equal(h.events.at(-1).policy.kind,'pixel-proxy');assert.equal(h.ui.interactivePending,false);h.ui.dispose();
});
test('explicit scientific parameters never preview and commit only once after a hold',()=>{
 const h=fixture('m2.cfa'),input=h.input('block');h.emit(input,'keydown',{key:'ArrowUp'});for(const value of[34,36,38]){h.set(input,value);h.emit(input,'change');}h.draw();assert.deepEqual(h.events.map(e=>e.phase),['begin']);h.emit(h.document,'keyup',{key:'ArrowUp'});assert.deepEqual(h.events.map(e=>e.phase),['begin','commit']);assert.equal(h.events.at(-1).policy.final,'explicit');assert.equal(h.settings.length,0);h.ui.dispose();
});
test('sparse view extras are retained presentation fields, distinct from scientific minimum',()=>{
 const h=fixture('tampering.copyMove.sparse'),input=h.document.getElementById('sparse-view-low');h.set(input,15);h.draw();h.emit(input,'change');const commit=h.events.at(-1);assert.equal(commit.field,'view.low');assert.equal(commit.view.low,15);assert.equal(commit.policy.kind,'retained');assert.equal(commit.operation,'tampering.copyMove.dense');assert.equal(h.settings.length,0);h.ui.dispose();
});
test('source/tool replacement cancels a draft and obsolete animation frames cannot publish',()=>{
 const h=fixture('inspection.adjust'),input=h.input('brightness');h.set(input,5);const old=[...h.frames.values()];h.ui.setFile(new Blob(['new']));for(const frame of old)frame();assert.deepEqual(h.events.map(e=>e.phase),['begin','cancel']);assert.equal(h.events.at(-1).reason,'source-change');h.ui.select('colors.space');h.set(h.input('space'),'"gray"');h.ui.select('detail.gradient');h.draw();assert.equal(h.events.at(-1).phase,'cancel');assert.equal(h.events.at(-1).toolId,'colors.space');h.ui.dispose();
});
for(const id of['m2.rita','ai.text.doctamper','jpeg.comprint'])test(id+' response threshold uses provisional frames through key repeat and an exact final display',async()=>{
 const h=fixture(id),name=id==='m2.rita'?'ritaPresentation':id==='jpeg.comprint'?'comprintPresentation':'dtdPresentation',score={id:'score',revision:1,range:[0,1]},display={id:'view',revision:1,width:640,height:480,format:'rgb8',[name]:{mode:id==='m2.rita'?'overlay':id==='jpeg.comprint'?'heat-overlay':'overlay',score,threshold:.5,opacity:.6}};
 await h.ui.render({id:'result',operation:id,status:'ok',views:[display],...(id==='m2.rita'?{}:{surface:{...score,width:640,height:480,format:'float32'}})});const input=h.document.getElementById('tool-display-threshold'),initial=Number(input.value),delta=id==='m2.rita'?.01:1;h.emit(input,'keydown',{key:'ArrowUp'});for(let i=1;i<=4;i++){h.set(input,initial+i*delta);h.emit(input,'change');h.draw();await tick();}assert.equal(h.settings.length,0);assert.equal(h.surfaces.at(-1).responsePreview,true);assert.equal(h.ui.interactiveActive,true);h.emit(h.document,'keyup',{key:'ArrowUp'});assert.equal(h.surfaces.at(-1).responsePreview,undefined);assert.deepEqual(h.settings,[{presentationOnly:true}]);h.emit(input,'change');assert.equal(h.settings.length,1);assert.equal(h.events.length,0);h.ui.dispose();
});
test('histogram draft renders separately and restoring retains original scientific output',async()=>{
 const h=fixture('inspection.histogram'),bins=new Uint32Array(1024),cumulative=new Uint32Array(1024);bins[0]=10;cumulative[0]=10;const original={id:'hist',operation:'inspection.histogram',status:'ok',provenance:{params:{channel:0,start:0,end:255}},data:{bins,cumulative,summary:{count:10},uniqueColors:1,uniqueRatio:1}};await h.ui.render(original);assert.equal(h.ui.renderParameterPreview({data:{...original.data,summary:{count:2}}}),true);assert.equal(h.ui.interactivePending,true);assert.ok(h.document.getElementById('tool-results').textContent.includes('2'));h.ui.restorePresentation();assert.equal(h.ui.interactivePending,false);assert.ok(h.document.getElementById('tool-results').textContent.includes('10'));assert.equal(original.data.summary.count,10);h.ui.dispose();
});
test('a scoped channel histogram stays a chart when its comparison input handle is present',async()=>{const h=fixture('inspection.histogram'),bins=new Uint32Array(1024),cumulative=new Uint32Array(1024);bins[0]=42;cumulative[0]=42;const comparison={id:'native-comparison-crop',revision:1,width:16,height:12,format:'rgb8'},output={id:'scoped-histogram',operation:'inspection.histogram',status:'ok',sourceRegionSourceSurface:comparison,provenance:{params:{channel:0,start:0,end:255}},data:{bins,cumulative,summary:{count:42},uniqueColors:1,uniqueRatio:1}};await h.ui.render(output);const body=h.document.getElementById('tool-results'),layers=h.document.getElementById('tool-layer');assert.equal(layers.options.length,0);assert.equal(layers.hidden,true);assert.equal(body.hidden,false);assert.equal(h.surfaces.length,0);assert.ok(body.querySelector('figure canvas')?.drawRects?.some(rect=>rect.join(',')==='0,0,900,300'),'The histogram Canvas is actually painted');assert.ok(body.textContent.includes('42'));h.ui.setOriginal(true);assert.equal(body.hidden,true);h.ui.setOriginal(false);assert.equal(body.hidden,false);assert.equal(output.sourceRegionSourceSurface,comparison);assert.equal(h.ui.restorePresentation(),true);assert.equal(body.hidden,false);assert.equal(h.surfaces.length,0);h.ui.dispose();});
test('none metadata controls keep their ordinary exact action',()=>{
 const h=fixture('metadata.exiftool'),input=h.input('mode');input.value='"headers"';h.emit(input,'change');assert.equal(h.settings.length,1);assert.equal(h.events.length,0);h.ui.dispose();
});
test('the local magnifier input path remains immediate and independent of generic proxies',()=>{
 const h=fixture('inspection.magnifier'),input=h.input('percent');h.set(input,25);assert.equal(h.settings.length,1);assert.equal(h.events.length,0);assert.equal(h.ui.params().percent,25);h.ui.dispose();
});

test('plot scale previews a stable bounded cached subset and cancel restores the intact native viewer',async()=>{
 const h=fixture('colors.plots'),rowCount=4096,table={id:'points',revision:1,format:'float32-table',rowCount,columns:['R','G','B','H','S','V']};await h.ui.render({id:'plot',operation:'colors.plots',status:'ok',surface:table,data:{count:rowCount,scale:0}});
 const native=h.document.querySelector('.scatter-native'),input=h.input('scale'),flushDraw=()=>{for(let i=0;i<3;i++)h.draw(0);};
 h.emit(input,'pointerdown',{button:0,pointerId:1});h.set(input,3);h.draw();flushDraw();assert.equal(h.ui.plotPreview.active,true);const initial=h.ui.plotPreview,canvas=h.document.querySelector('.scatter-draft canvas'),initialRects=canvas.drawRects.slice(-(initial.count+1)),draft=canvas.parentElement;
 assert.ok(initial.count>0&&initial.count<=Math.ceil(rowCount/4**3));assert.equal(initial.sourceCount,rowCount);assert.ok(initial.bytes<=16*1024**2);assert.equal(native.hidden,true);assert.equal(h.events.at(-1).previewHandled,true);assert.equal(h.events.at(-1).policy.final,'native');
 h.set(input,4);h.draw(0);flushDraw();assert.ok(h.ui.plotPreview.count>0&&h.ui.plotPreview.count<=Math.ceil(rowCount/4**4));
 canvas.drawRects=[];h.set(input,3);h.draw(0);flushDraw();const latest=h.ui.plotPreview,nativeRects=native.querySelector('canvas').drawRects.slice(-rowCount),nativeCoordinates=new Set(nativeRects.map(value=>JSON.stringify(value))),latestRects=canvas.drawRects.slice(-latest.count);assert.ok(latest.count>0&&latest.count<=Math.ceil(rowCount/4**3));assert.equal(latestRects.length,latest.count);for(const rect of latestRects)assert.ok(nativeCoordinates.has(JSON.stringify(rect)),'A draft point must retain its native coordinates');assert.deepEqual(latestRects[0],initialRects[1],'Adaptive density changes preserve the stable native source anchor');assert.equal(canvas.parentElement,draft);assert.deepEqual(h.tableReads,[{offset:0,length:rowCount,totalRows:rowCount}],'Drafts reuse the complete original table without another read');
 h.set(input,4);h.draw(0);h.emit(h.document,'pointerup',{pointerId:1});assert.equal(h.events.at(-1).phase,'commit');assert.equal(h.events.at(-1).params.scale,4);assert.equal(h.settings.length,0);h.ui.restorePresentation();assert.equal(native.hidden,false);assert.equal(h.ui.plotPreview.active,false);assert.equal(h.document.querySelector('.scatter-native'),native);h.ui.dispose();
});

function ghostResult({virtual=false,original=false,qualities=[50,55,60]}={}){
 const pixels=index=>({id:'ghost-'+(virtual?'virtual-':'native-')+index,revision:1,width:4,height:3,format:'rgb8',...(virtual?{retainedParameterView:{kind:'ghosts',view:{index}}}:{})});
 const views=qualities.map((quality,index)=>({quality,pixels:pixels(index)}));
 return {id:'ghost-result',operation:'jpeg.ghosts',status:'ok',provenance:{params:{grayscale:!virtual,includeOriginal:original}},data:{views,...(original?{originalSurface:{id:'original',revision:1,width:64,height:48,format:'rgb8'}}:{})},...(virtual?{parameterViews:views.map(value=>value.pixels)}:{})};
}
test('JPEG ghosts preserves the selected quality through retained grayscale drafts and final rendering',async()=>{
 const h=fixture('jpeg.ghosts');await h.ui.render(ghostResult());const layer=h.document.getElementById('tool-layer');layer.value='2';h.emit(layer,'change');assert.deepEqual(h.ui.view(),{index:2,quality:60,layerId:'quality-60'});assert.equal(h.ui.extras.ghostIndex,2);const input=h.input('grayscale');input.checked=false;h.emit(input,'input');h.draw();h.emit(input,'change');const commit=h.events.at(-1);assert.equal(commit.field,'grayscale');assert.equal(commit.view.index,2);assert.equal(commit.extras.ghostIndex,2);assert.equal(commit.params.ghostIndex,undefined);await h.ui.render(ghostResult({virtual:true}));assert.equal(layer.value,'2');assert.equal(h.surfaces.at(-1).retainedParameterView.view.index,2);assert.deepEqual(h.ui.view(),{index:2,quality:60,layerId:'quality-60'});const saved=h.ui.serialize();assert.equal(saved.uiOptions.ghostIndex,2);h.ui.dispose();
});
test('JPEG ghosts keeps the original layer selected when exact rendering includes it',async()=>{
 const h=fixture('jpeg.ghosts');await h.ui.render(ghostResult({original:true}));const layer=h.document.getElementById('tool-layer'),index=[...layer.options].findIndex(option=>option.textContent==='data.originalSurface');assert.ok(index>=0);layer.value=String(index);h.emit(layer,'change');assert.equal(h.surfaces.at(-1).id,'original');await h.ui.render(ghostResult({original:true}));assert.equal(layer.value,String(index));assert.equal(h.surfaces.at(-1).id,'original');h.ui.dispose();
});

test('short repeated parameter clicks commit only native intentions and never queue a preview',()=>{
 const h=fixture('inspection.adjust'),input=h.input('brightness');for(let value=1;value<=8;value++){h.emit(input,'pointerdown',{button:0,pointerId:1});h.set(input,value);h.draw(20);h.emit(h.document,'pointerup',{pointerId:1});h.emit(input,'change');}h.draw(500);assert.equal(h.events.filter(event=>event.phase==='preview').length,0);const commits=h.events.filter(event=>event.phase==='commit');assert.equal(commits.length,8);assert.ok(commits.every(event=>event.continuous===false&&event.usedPreview===false&&event.kind==='click'));h.ui.dispose();
});
for(const id of['m2.rita','ai.text.doctamper','jpeg.comprint'])test(id+' short threshold clicks preserve the native frame and finalize without a response proxy',async()=>{
 const h=fixture(id),name=id==='m2.rita'?'ritaPresentation':id==='jpeg.comprint'?'comprintPresentation':'dtdPresentation',score={id:'score',revision:1,range:[0,1]},display={id:'view',revision:1,width:640,height:480,format:'rgb8',[name]:{mode:id==='m2.rita'?'overlay':id==='jpeg.comprint'?'heat-overlay':'overlay',score,threshold:.5,opacity:.6}};await h.ui.render({id:'result',operation:id,status:'ok',views:[display],...(id==='m2.rita'?{}:{surface:{...score,width:640,height:480,format:'float32'}})});const input=h.document.getElementById('tool-display-threshold'),initial=Number(input.value),delta=id==='m2.rita'?.01:1;for(let i=1;i<=4;i++){h.emit(input,'keydown',{key:'ArrowUp'});h.set(input,initial+i*delta);h.draw(20);h.emit(h.document,'keyup',{key:'ArrowUp'});h.emit(input,'change');}h.draw(500);assert.ok(h.surfaces.every(surface=>!surface.responsePreview));assert.equal(h.settings.length,4);h.ui.dispose();
});

test('adjustment centre and width explain the neutral full-range setting without changing defaults',()=>{const h=fixture('inspection.adjust');assert.match(h.input('sweep').title,/inférieure à 255/);assert.match(h.input('width').title,/conserve toute la plage/);assert.equal(h.ui.params().width,255);h.ui.dispose();});

test('RGB/HSV native scale restored above source limit is bounded before entering the slider',()=>{
 const h=fixture('colors.plots',{width:1537,height:1153});h.ui.restore({'colors.plots':{scale:23}});const input=h.input('scale');assert.equal(Number(input.min),0);assert.equal(Number(input.max),10);assert.equal(Number(input.value),10);assert.equal(h.ui.params().scale,10);assert.equal(h.ui.serialize()['colors.plots'].scale,10);h.ui.dispose();
});
test('Hex offsets use original byte length and keep EOF and the chosen page length',()=>{
 const context={width:1537,height:1153,byteLength:357576},h=fixture('file.hex',context);h.ui.restore({'file.hex':{offset:6094109770928518,length:65536}});assert.equal(Number(h.input('offset').max),357576);assert.equal(h.ui.params().offset,357576);assert.equal(h.ui.params().length,65536);assert.equal(Number(h.input('length').max),65536);
 context.byteLength=100;h.ui.refreshSourceConstraints();assert.equal(h.ui.params().offset,100);assert.equal(Number(h.input('offset').value),100);assert.equal(h.ui.params().length,65536);h.ui.dispose();
});
test('Only the native nullable wavelet level exposes the magnetic Automatic position',()=>{
 const h=fixture('detail.wavelets',{width:640,height:480}),level=h.input('level'),threshold=h.input('threshold');assert.deepEqual(JSON.parse(level.getAttribute('data-hover-slider-automatic')),{value:null,boundary:0});assert.equal(Number(level.min),0);assert.equal(Number(level.max),30);assert.equal(threshold.hasAttribute('data-hover-slider-automatic'),false);h.ui.restore({'detail.wavelets':{level:null,threshold:0}});assert.equal(h.ui.params().level,null);assert.equal(h.ui.params().threshold,0);h.ui.dispose();
});

test('Hex previous-page navigation uses the latest chosen length before a pending page is rendered',async()=>{
 const h=fixture('file.hex',{byteLength:1025},{allowRun:true});h.ui.restore({'file.hex':{offset:512,length:256}});await h.ui.render({id:'hex',operation:'file.hex',status:'ok',data:{offset:512,totalBytes:1025,bytes:new Uint8Array(256)}});h.set(h.input('length'),512);h.emit(h.input('length'),'change');const previous=[...h.document.querySelectorAll('#tool-results button')].find(button=>button.textContent.includes('Page précédente'));previous.click();assert.equal(h.ui.params().offset,0);assert.equal(h.runs.length,1);assert.equal(h.runs[0].offset,0);assert.equal(h.runs[0].length,512);h.ui.dispose();
});


test('JPEG ghosts drafts carry the visible quality and final selection survives a shifted grid',async()=>{
 const h=fixture('jpeg.ghosts');await h.ui.render(ghostResult());const layer=h.document.getElementById('tool-layer');layer.value='2';h.emit(layer,'change');
 const low=h.input('low');h.emit(low,'keydown',{key:'ArrowUp'});h.set(low,55);h.draw();const draft=h.events.at(-1);assert.equal(draft.phase,'preview');assert.equal(draft.view.quality,60);assert.equal(draft.view.layerId,'quality-60');assert.equal(draft.view.index,2);
 h.emit(h.document,'keyup',{key:'ArrowUp'});assert.equal(h.events.at(-1).view.quality,60);h.ui.invalidateResult({preserve:true});assert.equal(h.ui.view().quality,60);assert.equal(h.ui.view().layerId,'quality-60');await h.ui.render(ghostResult({qualities:[55,60,65]}));assert.equal(layer.value,'1');assert.equal(h.ui.view().quality,60);assert.equal(h.ui.extras.ghostQuality,60);
 await h.ui.render(ghostResult({qualities:[56,61,66]}));assert.equal(layer.value,'1');assert.equal(h.ui.view().quality,61);h.ui.dispose();
});
test('JPEG ghosts identifies the original layer explicitly and restores the chosen quality preference',async()=>{
 const h=fixture('jpeg.ghosts');await h.ui.render(ghostResult({original:true}));const layer=h.document.getElementById('tool-layer');layer.value='2';h.emit(layer,'change');const saved=h.ui.serialize();assert.equal(saved.uiOptions.ghostQuality,60);
 const original=[...layer.options].findIndex(option=>option.textContent==='data.originalSurface');layer.value=String(original);h.emit(layer,'change');assert.equal(h.ui.view().layerId,'original');assert.equal(h.ui.view().quality,undefined);h.ui.invalidateResult({preserve:true});assert.equal(h.ui.view().layerId,'original');
 h.ui.restore(saved);await h.ui.render(ghostResult({qualities:[55,60,65]}));assert.equal(h.ui.view().quality,60);assert.equal(layer.value,'1');h.ui.dispose();
});


test('plot camera/intro persist across native and proxy refreshes; toolbar Reset rearms coloured3D',async()=>{
 const h=fixture('colors.plots'),table={id:'points',revision:1,format:'float32-table',rowCount:256,columns:['R','G','B','H','S','V']},output={id:'plot',operation:'colors.plots',status:'ok',surface:table,data:{count:256,scale:0}};await h.ui.render(output);const kind=h.input('kind');kind.value='"3d"';h.emit(kind,'change');assert.equal(h.ui.plotPresentation.intro.active,true);assert.deepEqual(h.ui.plotPresentation.camera,{yaw:0,pitch:0,zoom:1,x:0,y:0});
 h.ui.zoomBy(2);const camera=h.ui.plotPresentation.camera;assert.equal(h.ui.plotPresentation.intro.active,false);assert.equal(h.ui.plotPresentation.intro.interacted,true);const scale=h.input('scale');h.emit(scale,'keydown',{key:'ArrowUp'});h.set(scale,1);h.draw();assert.equal(h.ui.plotPreview.active,true);assert.deepEqual(h.ui.plotPresentation.camera,camera);h.ui.restorePresentation();assert.deepEqual(h.ui.plotPresentation.camera,camera);await h.ui.render({...output,id:'plot-new'});assert.deepEqual(h.ui.plotPresentation.camera,camera);assert.equal(h.ui.plotPresentation.intro.active,false);
 const reset=[...h.document.querySelectorAll('button')].find(button=>button.textContent==='Réinitialiser');reset.click();assert.equal(h.ui.params().kind,'3d');assert.equal(h.ui.params().colored,true);assert.equal(h.ui.plotPresentation.intro.active,true);assert.deepEqual(h.ui.plotPresentation.camera,{yaw:0,pitch:0,zoom:1,x:0,y:0});
 // select(force) replaced the old control; use the currently mounted one.
 const current=h.input('kind');current.value='"3d"';h.emit(current,'change');assert.equal(h.ui.plotPresentation.intro.active,true);h.ui.fit();assert.equal(h.ui.plotPresentation.intro.armed,false);assert.equal(h.ui.plotPresentation.intro.active,false);h.ui.dispose();
});

test('native automatic contracts are attached to RGB and Otsu without marking ordinary zero values',()=>{
 const plots=fixture('colors.plots',{width:1537,height:1153});assert.deepEqual(JSON.parse(plots.input('scale').getAttribute('data-hover-slider-automatic')),{value:null,boundary:0});assert.equal(plots.input('scale').max,'10');assert.equal(plots.input('alpha').hasAttribute('data-hover-slider-automatic'),false);plots.ui.dispose();
 const adjust=fixture('inspection.adjust');assert.deepEqual(JSON.parse(adjust.input('threshold').getAttribute('data-hover-slider-automatic')),{value:0,boundary:1});assert.equal(adjust.input('brightness').hasAttribute('data-hover-slider-automatic'),false);adjust.ui.dispose();
});

test('RGB/HSV starts with original colours, respects an explicit saved monochrome choice and Reset restores colour in3D',()=>{
 const h=fixture('colors.plots');assert.equal(h.input('colored').checked,true);assert.equal(h.ui.params().colored,true);assert.equal(h.ui.params().kind,'3d');
 h.ui.restore({'colors.plots':{colored:false,kind:'2d'}});assert.equal(h.input('colored').checked,false);assert.equal(h.ui.params().colored,false);assert.equal(h.ui.params().kind,'2d');
 const reset=[...h.document.querySelectorAll('button')].find(button=>button.textContent==='Réinitialiser');reset.click();assert.equal(h.input('colored').checked,true);assert.equal(h.ui.params().colored,true);assert.equal(h.ui.params().kind,'3d');h.ui.dispose();
});

test('RGB/HSV devotes the result area to the plot without numeric side panel or a second Fit button',async()=>{
 const h=fixture('colors.plots'),table={id:'points',revision:1,format:'float32-table',rowCount:256,columns:['R','G','B','H','S','V']},output={id:'plot',operation:'colors.plots',status:'ok',surface:table,data:{count:256,scale:0}};await h.ui.render(output);assert.equal(h.document.querySelectorAll('.plot-data,.scatter-reset').length,0);assert.equal(h.document.querySelector('#tool-results').children.length,1);assert.ok(h.document.querySelector('#tool-results>.plot-view'));assert.ok(h.document.querySelector('.scatter-orientation'));assert.equal(h.document.querySelector('#tool-results table'),null);h.ui.dispose();
});
