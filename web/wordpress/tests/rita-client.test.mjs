import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const candidate=new URL('../sherloq-browser/assets/',import.meta.url),base=process.env.SHERLOQ_RITA_UI_BASE?pathToFileURL(resolve(process.env.SHERLOQ_RITA_UI_BASE)+'/'):candidate;
async function loadCandidate(file){
 let source=await readFile(new URL(file,candidate),'utf8');
 for(const match of [...source.matchAll(/(from\s*|import\s*)(['"])(\.\.?\/[^'"]+)\2/g)]){let target=new URL(match[3],match[3]==='./rita-presentation.js'?candidate:base);try{await access(target);}catch{target=new URL(match[3],base);}source=source.replace(match[0],match[1]+JSON.stringify(target.href));}
 source=source.replaceAll('import.meta.url',JSON.stringify(new URL(file,base).href));return import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
}
const {createToolClient}=await loadCandidate('tool-client.js'),{ritaFrame}=await loadCandidate('rita-presentation.js');
function fixture({width=129,height=97,windowBytes=4*1024**2,nan=false}={}){
 const calls=[],engineLeases=new Map(),m2Leases=new Map(),reads=[],exportReads=[];let serial=0,inferences=0,disposed=false,failed=false,reservationFailure=false,invalidate;
 const score=(x,y)=>nan&&x===0&&y===0?NaN:Math.fround(((x*7+y*13)%101)/100),rgb=(x,y,c)=>(x*3+y*5+c*31)%256;
 const pixels=tile=>{const w=Math.ceil(tile.w/tile.step),h=Math.ceil(tile.h/tile.step),data=new Uint8Array(w*h*3);for(let y=0;y<h;y++)for(let x=0;x<w;x++)for(let c=0;c<3;c++)data[(y*w+x)*3+c]=rgb(tile.x+x*tile.step,tile.y+y*tile.step,c);return {width:w,height:h,format:'rgb8',data};};
 function owner(name,leases){return{async reserveExternalMemory({bytes}){calls.push([name,'reserve',bytes]);if(reservationFailure){reservationFailure=false;throw Object.assign(Error('No memory'),{code:'MEMORY_LIMIT'});}assert(bytes>0);const id=name+'-'+(++serial);leases.set(id,bytes);return{id,bytes};},async releaseExternalMemory(id){calls.push([name,'release',id]);assert(leases.delete(id),'known live lease: '+id);}};}
 const engine={...owner('engine',engineLeases),onSourceInvalidation(callback){invalidate=callback;},async loadBlob(input){calls.push(['engine','load']);return{id:input.id,surface:{id:'original',revision:1,width,height,format:'rgb8'}};},async capabilities(){return {memory:{budgetBytes:8*1024**3,retainedBytes:0,cacheBytes:0,knownHeapCapacityBytes:0}};},async readDisplay({surfaceId,tile}){calls.push(['engine','pixels']);assert.equal(surfaceId,'original');return {pixels:pixels(tile)};},async unload(){calls.push(['engine','unload']);},async dispose(){calls.push(['engine','dispose']);assert.equal(engineLeases.size,0);disposed=true;}};
 const npz=Uint8Array.of(80,75,3,4,1,2,3,4);
 const m2={...owner('m2',m2Leases),ready:{windowBytes},async analyzeBlob(method,blob,params){inferences++;calls.push(['m2','infer',method]);assert.equal(method,'rita');return{id:'rita-result-'+inferences,width,height,fields:{map:{type:'Float32Array',shape:[height,width]},official_mask:{type:'Float32Array',shape:[height,width]},labels:{type:'Float32Array',shape:[height,width]},logits:{type:'Float32Array',shape:[4,height,width]}}};},async metadata(){return{method:'rita',provenance:{precision:'native-float32',geometry:'native-experimental'}};},async readArray(id,field,offset,length){calls.push(['m2','array']);assert.equal(field,'map');assert(length*4<=windowBytes);assert(length*4<=4*1024**2);assert(offset>=0&&offset+length<=width*height);reads.push({offset,length});if(failed){failed=false;throw Error('Injected array read failure');}return Float32Array.from({length},(_,i)=>score((offset+i)%width,Math.floor((offset+i)/width)));},async beginExport(){return {id:'npz',bytes:npz.length};},async readExport(id,offset,length){exportReads.push({id,offset,length});return npz.slice(offset,offset+length);},async releaseExport(){},async release(id){calls.push(['m2','release-result',id]);},async dispose(){calls.push(['m2','dispose']);assert.equal(m2Leases.size,0);}};
 return{engine,m2,calls,reads,exportReads,engineLeases,m2Leases,width,height,score,pixels,get inferences(){return inferences;},get disposed(){return disposed;},failRead(){failed=true;},failReservation(){reservationFailure=true;},invalidate(){invalidate?.();}};
}
async function runFixture(options,fn){
 const oldFetch=globalThis.fetch;globalThis.fetch=async()=>({json:async()=>({assetBase:'./unified-assets/'})});const native=fixture(options);let client;
 try{client=await createToolClient({engineFactory:()=>native.engine,m2Factory:async()=>native.m2});await client.load({id:'source',blob:new Blob(['original'])});const output=await client.run({id:'analysis',operation:'m2.rita',params:{},view:options?.initialView??{threshold:.5}}, {file:new Blob(['original'])});await fn({client,output,...native,native});}
 finally{await client?.dispose();globalThis.fetch=oldFetch;assert.equal(native.engineLeases.size,0);assert.equal(native.m2Leases.size,0);}
}
const view=(output,mode,threshold=.5,preview=false)=>({...output.views.find(v=>v.ritaPresentation.mode===mode),...(preview?{responsePreview:true}:{}),ritaPresentation:{...output.views.find(v=>v.ritaPresentation.mode===mode).ritaPresentation,threshold}});
test('native RITA presentation filters floats without modifying scores and uses red maps/masks and photo overlays',()=>{
 const scores=Float32Array.of(0,.49999997,.5,.50000006,1,NaN),saved=scores.slice(),base=new Uint8Array(18).fill(100);
 assert.deepEqual([...ritaFrame(6,1,scores,{mode:'mask'}).data],[0,0,0,0,0,0,255,0,0,255,0,0,255,0,0,0,0,0]);
 assert.deepEqual([...ritaFrame(6,1,scores,{mode:'overlay',base}).data].slice(0,12),[100,100,100,100,100,100,193,40,40,193,40,40]);assert.deepEqual(scores,saved);assert.deepEqual(base,new Uint8Array(18).fill(100));
 assert.throws(()=>ritaFrame(6,1,scores,{mode:'overlay'}),/original/);assert.throws(()=>ritaFrame(7,1,scores),/Invalid/);assert.equal(ritaFrame(6,1,scores,{threshold:1}).data[12],255);
 const proxy=ritaFrame(2,1,Uint8Array.of(0,255),{quantized:true,validity:Uint8Array.of(0,1),threshold:0,mode:'mask'});assert.deepEqual([...proxy.data],[0,0,0,255,0,0]);
});
test('RITA client returns three presentation handles backed by one native class-margin surface',()=>runFixture({},async({output,client,native})=>{
 assert.deepEqual(output.views.map(v=>v.ritaPresentation.mode),['overlay','probability','mask']);assert.equal(output.m2Result.width,129);assert.equal(output.m2Result.height,97);assert.equal(output.data.provenance.geometry,'native-experimental');for(const display of output.views){assert.equal(display.ritaPresentation.score.field,'map');assert.equal(display.ritaPresentation.threshold,.5);assert.equal(display.ritaPresentation.score.m2Result,output.m2Result.id);}
 assert.equal(native.inferences,1);assert.equal(client.result,output);
}));
test('native sampled views and full-precision windows match an independent float oracle without inference',()=>runFixture({nan:true},async({client,output,native})=>{
 const tile={x:1,y:2,w:117,h:91,step:3},width=Math.ceil(tile.w/3),height=Math.ceil(tile.h/3),samples=Float32Array.from({length:width*height},(_,i)=>native.score(tile.x+(i%width)*3,tile.y+Math.floor(i/width)*3));
 for(const mode of ['probability','mask','overlay']){const display=view(output,mode,.673),frame=await client.readTile(display,tile),base=mode==='overlay'?native.pixels(tile).data:undefined;assert.deepEqual(frame,ritaFrame(width,height,samples,{mode,threshold:.673,base}));}
 const rect={x:3,y:4,width:120,height:87},values=Float32Array.from({length:rect.width*rect.height},(_,i)=>native.score(rect.x+i%rect.width,rect.y+Math.floor(i/rect.width))),frame=await client.readWindow(view(output,'mask',.50000001),rect);assert.deepEqual(frame,ritaFrame(rect.width,rect.height,values,{mode:'mask',threshold:.50000001}));assert.equal(native.inferences,1);assert.equal(native.engineLeases.size,0);assert.equal(native.m2Leases.size,0);
}));
test('prewarmed 8-bit proxy reuses scores and sampled source; 90 slider frames perform zero RPCs',()=>runFixture({},async({client,output,native})=>{
 const display=view(output,'overlay',.5,true);await client.prepareDisplayPreview(display);const afterWarm=native.calls.length,step=Math.ceil(Math.max(native.width,native.height)/128),tile={x:0,y:0,w:native.width,h:native.height,step};assert.equal(native.engineLeases.size,1);assert.equal(native.m2Leases.size,0);
 for(let i=0;i<90;i++){const frame=await client.readTile(view(output,i%3===0?'overlay':i%3===1?'mask':'probability',i/100,true),tile);assert(frame.width<=128&&frame.height<=128);}
 assert.equal(native.calls.length,afterWarm,'no reads, allocations, releases or other worker RPCs');assert.equal(native.inferences,1);await client.readWindow(view(output,'mask',.73),{x:0,y:0,width:native.width,height:native.height});assert.equal(native.inferences,1);assert.equal(native.engineLeases.size,1,'only the prewarmed proxy lease remains');
}));
test('cropped proxy tiles preserve geometry and consume no further worker RPC',()=>runFixture({},async({client,output,native})=>{
 const display=view(output,'overlay',.4,true);await client.prepareDisplayPreview(display);const before=native.calls.length,frame=await client.readTile(display,{x:8,y:6,w:51,h:47,step:2});assert.equal(frame.width,26);assert.equal(frame.height,24);assert.equal(native.calls.length,before);assert.equal(native.inferences,1);
 await assert.rejects(client.readTile(display,{x:0,y:0,w:129,h:1,step:1}),{code:'INVALID_INPUT'});
}));
test('native/proxy numeric reads split wide strips and never exceed the declared M2 window',()=>runFixture({width:257,height:7,windowBytes:64},async({client,output,native})=>{
 const display=view(output,'mask',.65);await client.prepareDisplayPreview(display);await client.readWindow(display,{x:2,y:1,width:253,height:5});assert(native.reads.length>10);assert(native.reads.every(read=>read.length<=16));assert.equal(native.inferences,1);
}));
test('warmup and native read failures release every transient reservation and allow exact retry',()=>runFixture({},async({client,output,native})=>{
 const display=view(output,'mask');native.failRead();await assert.rejects(client.prepareDisplayPreview(display),/Injected/);assert.equal(native.engineLeases.size,0);assert.equal(native.m2Leases.size,0);native.failReservation();await assert.rejects(client.prepareDisplayPreview(display),{code:'MEMORY_LIMIT'});assert.equal(native.engineLeases.size,0);assert.equal(native.m2Leases.size,0);await client.prepareDisplayPreview(display);native.failRead();await assert.rejects(client.readWindow(display,{x:0,y:0,width:10,height:10}),/Injected/);assert.equal(native.engineLeases.size,1);assert.equal(native.m2Leases.size,0);assert.equal((await client.readWindow(display,{x:0,y:0,width:10,height:10})).width,10);assert.equal(native.inferences,1);
}));
test('transient proxies cannot be exported and native scientific NPZ remains untouched',()=>runFixture({},async({client,output,native})=>{
 const display=view(output,'mask',.8,true);await assert.rejects(client.readWindow(display,{x:0,y:0,width:4,height:4}),{code:'INVALID_INPUT'});await assert.rejects(client.export('png',display),{code:'INVALID_INPUT'});assert.equal(native.exportReads.length,0);const exported=await client.export('npz');assert.deepEqual([...new Uint8Array(await exported.blob.arrayBuffer())],[80,75,3,4,1,2,3,4]);await exported.cleanup();assert.equal(native.inferences,1);
}));
test('proxy reservations are released on source invalidation and stale result handles fail after replacement',()=>runFixture({},async({client,output,native})=>{
 await client.prepareDisplayPreview(view(output,'mask'));assert.equal(native.engineLeases.size,1);native.invalidate();await Promise.resolve();assert.equal(native.engineLeases.size,0);await client.prepareDisplayPreview(view(output,'mask'));const next=await client.run({id:'next',operation:'m2.rita',params:{},view:{threshold:.27}}, {file:new Blob(['original'])});assert.equal(native.engineLeases.size,0);assert.equal(next.views[0].ritaPresentation.threshold,.27);await assert.rejects(client.readWindow(view(output,'mask'),{x:0,y:0,width:4,height:4}),{code:'CACHE_MISS'});assert.equal(native.inferences,2);
}));
test('an explicitly requested RITA Scores or Mask view stays first instead of forcing the new overlay default',()=>runFixture({},async({client,native})=>{
 for(const mode of ['probability','mask']){const result=await client.run({id:'chosen-'+mode,operation:'m2.rita',params:{},view:{mode,threshold:.43}}, {file:new Blob(['original'])});assert.equal(result.views[0].ritaPresentation.mode,mode);assert.equal(result.views[0].ritaPresentation.threshold,.43);assert.equal(new Set(result.views.map(display=>display.ritaPresentation.mode)).size,3);}assert.equal(native.inferences,3);
}));

test('batch RITA opacity stays display-only and matches both exact native windows and cached proxies',()=>runFixture({initialView:{mode:'overlay',threshold:.42,opacity:.23}},async({client,output,native})=>{
 const display=output.views[0];assert.equal(display.ritaPresentation.opacity,.23);assert.equal(display.ritaPresentation.threshold,.42);
 const rect={x:0,y:0,width:native.width,height:native.height},scores=Float32Array.from({length:native.width*native.height},(_,i)=>native.score(i%native.width,Math.floor(i/native.width))),base=native.pixels({...rect,w:rect.width,h:rect.height,step:1}).data;
 assert.deepEqual(await client.readWindow(display,rect),ritaFrame(native.width,native.height,scores,{base,mode:'overlay',threshold:.42,opacity:.23}));
 const hidden={...display,ritaPresentation:{...display.ritaPresentation,opacity:0}};assert.deepEqual((await client.readWindow(hidden,rect)).data,base);
 await client.prepareDisplayPreview(display);const before=native.calls.length,step=Math.ceil(Math.max(native.width,native.height)/128),tile={x:0,y:0,w:native.width,h:native.height,step};
 for(const opacity of [0,.23,.6,1])await client.readTile({...display,responsePreview:true,ritaPresentation:{...display.ritaPresentation,opacity}},tile);
 assert.equal(native.calls.length,before);assert.equal(native.inferences,1);
}));
