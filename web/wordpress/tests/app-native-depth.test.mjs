import {createToolClient} from '../sherloq-browser/assets/tool-client.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {computeNativeChannelHistogram} from '../sherloq-browser/assets/native-channel-histogram-core.js';
import {sourceDefaultWorkingDepth} from '../../engine-source/src/source-precision.js';
const code=await readFile(new URL('../sherloq-browser/assets/app.js',import.meta.url),'utf8'),a=code.indexOf('let localChannelHistogram=null;'),b=code.indexOf("let activeAnalysis='ela.classic'",a),depthCode=code.slice(a,b),tick=()=>new Promise(resolve=>setImmediate(resolve));
function harness({client={readNativePixels:async()=>({width:2,height:1,format:'rgb16',data:Uint16Array.of(0,1,65535,12345,23456,34567)})},legacy=async()=>{throw Error('A native source must not be decoded again');}}={}){
 const calls={stop:0,invalidate:0,queue:0,refresh:0},nodes=new Map();let legacyCalls=0;
 function element(){const el={children:[],hidden:false,options:[],append(...items){this.children.push(...items);this.options.push(...items);},value:'',className:''};return el;}
 const context=vm.createContext({sourceDefaultWorkingDepth,Uint8Array,Uint16Array,AbortController,console,Set,Promise,Error,Number,lang:'fr',activeAnalysis:'inspection.histogram',busy:false,energyViewBusy:false,exportController:null,destroyed:false,revision:0,individualClient:null,automaticClient:null,compositeClient:null,fileInput:{name:'native.avif'},hash:'a'.repeat(64),imageId:'one',source:{width:2,height:1,display:{}},sourceEncodingFormat:'avif',host:{getParentBudgetSource:()=>({getClient:async()=>client})},ensureIndividualClient:async()=>{throw Error('Parent Original already owns this source');},createNativeColorClient:async(...args)=>{legacyCalls++;return legacy(...args);},$:(key)=>nodes.get(key),document:{createElement:element},individualUI:{updateParams(value){nodes.get('tool-param-bit').value=String(value.bit);},refreshSourceConstraints(){calls.refresh++;}},stop(){calls.stop++;},invalidate(){calls.invalidate++;},controls(){},queueAnalysis(){calls.queue++;},isCloneWindowOperation:()=>false,sourceRegionApplicability:()=>({applicable:false}),sourceRegionTaskIsCurrent:()=>true});
 vm.runInContext(depthCode,context);return{context,calls,nodes,element,legacyCalls:()=>legacyCalls,run:text=>vm.runInContext(text,context),adopt(){return vm.runInContext("adoptSourcePrecision({surface:{width:2,height:1},nativeSurface:{id:'native',revision:1,format:'rgb16',depth:16,sourceDepth:16,width:2,height:1},workingDepth:16,precisionCapabilities:{nativeDepth:16}},{reset:true})",context);}};
}
test('native16 capability stays separate from display and defaults to16, while8bit sources keep8',()=>{
 const h=harness();h.adopt();assert.equal(h.run('currentWorkingDepth()'),16);const first=h.run('nativeSourceSurface');h.run("adoptSourcePrecision({surface:{width:2,height:1},nativeSurface:{id:'native',revision:1,format:'rgb16',depth:16,sourceDepth:16,width:2,height:1}})");assert.equal(h.run('nativeSourceSurface'),first);
 h.run('workingDepth=8;workingDepthExplicit=true');h.run("adoptSourcePrecision({surface:{width:2,height:1},nativeSurface:{id:'native',revision:1,format:'rgb16',depth:16,sourceDepth:16,width:2,height:1},workingDepth:16})");assert.equal(h.run('currentWorkingDepth()'),8);h.run('adoptSourcePrecision({surface:{width:2,height:1}},{reset:true})');assert.equal(h.run('currentWorkingDepth()'),8);assert.equal(h.run('nativeSourceSurface'),null);
});
test('the compact choice translates, changes numerical depth outside params and adjusts bitplanes to15/7',()=>{
 const h=harness();h.adopt();h.context.parent=h.element();h.run('mountWorkingDepthControl(parent)');const control=h.run('workingDepthControl');assert.equal(control.caption.textContent,'Profondeur');assert.equal(control.select.options[1].textContent,'16 bits · calcul');h.context.lang='en';h.run('syncWorkingDepthControl()');assert.equal(control.caption.textContent,'Depth');assert.equal(control.select.options[0].textContent,'8-bit · SDR rendering');
 h.context.activeAnalysis='noise.planes';h.nodes.set('tool-param-bit',{value:'15',max:'7'});h.run('syncWorkingDepthControl()');assert.equal(h.nodes.get('tool-param-bit').max,'15');control.select.value='8';control.select.onchange();assert.equal(h.run('currentWorkingDepth()'),8);assert.equal(h.nodes.get('tool-param-bit').max,'7');assert.equal(h.nodes.get('tool-param-bit').value,'7');assert.deepEqual(h.calls,{stop:1,invalidate:1,queue:1,refresh:1});
});
test('bound scientific tasks carry workingDepth at the task level without changing algorithm params',async()=>{
 const h=harness();h.adopt();const start=code.indexOf('async function bindSourceRegionTask('),end=code.indexOf('\n',start);vm.runInContext(code.slice(start,end),h.context);h.context.task={operation:'noise.planes',params:{bit:15},backend:'cpu'};const task=await h.run('bindSourceRegionTask(task)');assert.equal(task.workingDepth,16);assert.deepEqual(task.params,{bit:15});assert.equal(task.params.workingDepth,undefined);h.run('workingDepth=8');assert.equal((await h.run('bindSourceRegionTask(task)')).workingDepth,8);
});
test('histogram reads exact RGB16 from Original without reopening AVIF/RAW and retains65536 bins per channel',async()=>{
 const h=harness();h.adopt();h.context.abort=new AbortController();const reader=await h.run('nativeHistogramSource({signal:abort.signal})'),pixels=await reader.readPixels({x:0,y:0,width:2,height:1});assert.equal(pixels.depth,16);assert.equal(pixels.space,'RGB');assert.equal(pixels.data[2],65535);assert.equal(h.legacyCalls(),0);const histogram=computeNativeChannelHistogram(pixels);assert.equal(histogram.binCount,65536);assert.equal(histogram.bins.length,3*65536);assert.equal(histogram.bins[2*65536+65535],1);assert.equal(histogram.bins[12345],1);await reader.dispose();
 h.run('workingDepth=8');assert.equal(await h.run('nativeHistogramSource({signal:abort.signal})'),null);
});
test('a pending native read cannot publish after a depth change and its facade waits for the read ACK',async()=>{
 let finish;const h=harness({client:{readNativePixels:()=>new Promise(resolve=>finish=resolve)}});h.adopt();h.context.abort=new AbortController();const reader=await h.run('nativeHistogramSource({signal:abort.signal})'),reading=reader.readPixels({x:0,y:0,width:2,height:1});await tick();h.run('workingDepth=8');let disposed=false;const closing=reader.dispose().then(()=>disposed=true);await tick();assert.equal(disposed,false);finish({width:2,height:1,format:'rgb16',data:new Uint16Array(6)});await assert.rejects(reading,error=>error.code==='CANCELLED');await closing;assert.equal(disposed,true);
});
test('legacy CMYK JPEG reader remains available when no native16 surface exists',async()=>{
 const expected={capability:{space:'CMYK',depth:8},dispose(){}},h=harness({legacy:async()=>expected});h.context.sourceEncodingFormat='jpeg';h.context.source.display.colorMetadata={sourceChannels:4,sourceColorSpace:'CMYK'};h.context.abort=new AbortController();const reader=await h.run('nativeHistogramSource({signal:abort.signal})');assert.equal(reader.capability,expected.capability);assert.equal(h.legacyCalls(),1);
});

test('true four-channel CMYK takes precedence over its converted RGB16 working surface',async()=>{
 const expected={capability:{space:'CMYK',depth:16},dispose(){}},h=harness({legacy:async()=>expected});h.adopt();h.context.sourceEncodingFormat='tiff';h.context.source.display.colorMetadata={sourceChannels:4,sourceColorSpace:'CMYK',sourceDepth:16};h.context.abort=new AbortController();const reader=await h.run('nativeHistogramSource({signal:abort.signal})');assert.equal(reader.capability.space,'CMYK');assert.equal(h.legacyCalls(),1);
});

test('choosing SDR8 on a CMYK16 source uses the displayed RGB8 without reopening native channels',async()=>{
 const h=harness();h.adopt();h.context.sourceEncodingFormat='tiff';h.context.source.display.colorMetadata={sourceChannels:4,sourceColorSpace:'CMYK',sourceDepth:16};h.context.abort=new AbortController();h.run('workingDepth=8');
 assert.equal(await h.run('nativeHistogramSource({signal:abort.signal})'),null);assert.equal(h.legacyCalls(),0);
});

test('the app facade and real serialized client preserve neighboring native16 values together',async()=>{
 const previous=globalThis.fetch,calls=[];globalThis.fetch=async()=>({json:async()=>({assetBase:'./unified-assets/'})});const engine={loadBlob:async input=>({id:input.id,sha256:'a'.repeat(64),width:2,height:1,surface:{id:'source',revision:1,format:'rgb8',width:2,height:1},nativeSurface:{id:'native',revision:1,format:'rgb16',depth:16,width:2,height:1}}),capabilities:async()=>({operations:[],memory:{budgetBytes:128*1024**2,retainedBytes:0,knownHeapCapacityBytes:0}}),async readNativePixels(request){calls.push(request);return{pixels:{format:'rgb16',depth:16,sourceDepth:16,width:2,height:1,data:Uint16Array.of(65535,65534,1,256,257,258)}};},async dispose(){}};let client;try{client=await createToolClient({engineFactory:()=>engine});await client.load({id:'one',blob:{protocolFixture:true}});const h=harness({client});h.adopt();h.context.abort=new AbortController();const reader=await h.run('nativeHistogramSource({signal:abort.signal})'),rect={x:0,y:0,width:2,height:1},pixels=await reader.readPixels(rect);assert.deepEqual([...pixels.data],[65535,65534,1,256,257,258]);assert.deepEqual(calls,[{surfaceId:'native',revision:1,rect}]);await reader.dispose();}finally{await client?.dispose();globalThis.fetch=previous;}
});
