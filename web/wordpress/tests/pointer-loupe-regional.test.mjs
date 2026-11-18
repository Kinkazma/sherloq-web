import test from 'node:test';import assert from 'node:assert/strict';import {parseHTML} from 'linkedom';
import {createPointerLoupe,mapLoupePresentation} from '../sherloq-browser/assets/pointer-loupe.js';
import {loupeDefaults} from '../sherloq-browser/assets/media-settings.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture({getEffectsSurface,getEffectsPending,requestSource=false,sourceSize={width:512,height:384},comparisonSize=null,comparisonIsSource=false,regionalOutput=null}={}){
 const {document,window}=parseHTML('<html><body><div id="view"><canvas id="base"></canvas></div></body></html>'),view=document.getElementById('view'),frames=new Map(),saved={Worker:globalThis.Worker,OffscreenCanvas:globalThis.OffscreenCanvas,requestAnimationFrame:globalThis.requestAnimationFrame,cancelAnimationFrame:globalThis.cancelAnimationFrame,devicePixelRatio:globalThis.devicePixelRatio};let serial=0,texture=0;
 const calls=[],workers=[],raw=[],states=[],presented=[],ctx={setTransform(){},clearRect(){},save(){},restore(){},scale:(x,y)=>calls.push(['scale',x,y]),translate(){},drawImage(){},createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){}};let sourceReadSerial=0;
 const gl={MAX_TEXTURE_SIZE:1,TEXTURE0:100,COMPILE_STATUS:1,LINK_STATUS:1,getParameter:()=>4096,createShader:()=>({}),getShaderParameter:()=>true,createProgram:()=>({}),getProgramParameter:()=>true,createBuffer:()=>({}),createTexture:()=>({}),getAttribLocation:()=>0,getUniformLocation:(_p,name)=>name,activeTexture:value=>{texture=value-100;},texImage2D:()=>calls.push(['upload',texture]),uniform1i(){},uniform1f:(key,value)=>calls.push(['uniform',key,value]),uniform2f(){},uniform4f(){},drawArrays:()=>calls.push(['paint']),getExtension:()=>({loseContext(){}})};
 for(const key of ['shaderSource','compileShader','deleteShader','attachShader','linkProgram','useProgram','bindBuffer','bufferData','enableVertexAttribArray','vertexAttribPointer','bindTexture','texParameteri','viewport','clearColor','clear','deleteTexture','deleteBuffer','deleteProgram'])gl[key]=()=>{};
 window.HTMLCanvasElement.prototype.getContext=function(kind){return kind==='webgl'?gl:ctx;};
 globalThis.OffscreenCanvas=class{constructor(w,h){this.width=w;this.height=h;}getContext(){return ctx;}};
 globalThis.Worker=class{constructor(url){this.url=url;this.messages=[];this.sourceRequests=new Map();this.outputRecords=new Map();workers.push(this);}postMessage(message){this.messages.push(message);if(message.action==='build'){const output=regionalOutput&&message.effects.enhance?.enabled&&message.effects.enhance.equalization?.method==='sherloq7c'?{...regionalOutput,sourceWidth:message.width,sourceHeight:message.height,coordinateDomain:'selected-output-resolution'}:null;if(output)this.outputRecords.set(message.ticket,output);queueMicrotask(()=>this.onmessage?.({data:{ticket:message.ticket,resultId:message.ticket,...(output?{output}:{}),metrics:{computedTiles:0}}}));if(requestSource){const read=++sourceReadSerial,rect={x:0,y:0,width:Math.min(128,message.width),height:Math.min(128,message.height)};this.sourceRequests.set(read,{ticket:message.ticket,rect});queueMicrotask(()=>this.onmessage?.({data:{action:'source',ticket:message.ticket,read,rect}}));}}if(message.action==='read'){const output=this.outputRecords.get(message.resultId);if(output)assert.ok(message.rect.x>=0&&message.rect.y>=0&&message.rect.x+message.rect.width<=output.width&&message.rect.y+message.rect.height<=output.height,'mock output reads must stay inside its actual selected raster');queueMicrotask(()=>this.onmessage?.({data:{ticket:message.ticket,pixels:{width:message.rect.width,height:message.rect.height,format:'rgb8',data:new Uint8Array(message.rect.width*message.rect.height*3)}}}));}if(message.action==='release'&&message.ticket)queueMicrotask(()=>this.onmessage?.({data:{ticket:message.ticket,released:true}}));if(message.action==='dispose')queueMicrotask(()=>this.onmessage?.({data:{action:'disposed'}}));}terminate(){this.terminated=true;}};
 globalThis.devicePixelRatio=1;globalThis.requestAnimationFrame=fn=>{const id=++serial;frames.set(id,fn);return id;};globalThis.cancelAnimationFrame=id=>frames.delete(id);view.getBoundingClientRect=()=>({left:0,top:0});
 function makeSource(label,{width,height}){const value={width,height,readPixels(){throw Error('Scientific source must not be read for display');},close(){calls.push(['borrowed-close',label]);},fork(changed=()=>{}){const index=raw.length,handle={width,height,label,ready:false,prepare(bounds,scale){calls.push(['prepare',index,bounds,scale]);return handle.ready;},draw(_ctx,bounds,scale){calls.push(['raw',index,bounds,scale]);},readPixels:value.readPixels,readDisplayPixels:async rect=>({width:rect.width,height:rect.height,format:'rgb8',data:new Uint8Array(rect.width*rect.height*3)}),changed,close(){handle.closed=true;}};raw.push(handle);return handle;}};return value;}
 const source=makeSource('after',sourceSize),comparison=comparisonIsSource?source:comparisonSize?makeSource('original',comparisonSize):null;let comparingOriginal=false,displayed=source;
 let settings={...loupeDefaults,enabled:true,zoom:400,diameter:100,transition:10,proportional:false,effects:structuredClone(loupeDefaults.effects)};
 const loupe=createPointerLoupe(view,{baseCanvas:document.getElementById('base'),getSurface:()=>displayed,getComparisonSurface:()=>comparison,getComparingOriginal:()=>comparingOriginal,getCamera:()=>({scale:.75,x:0,y:0}),...(getEffectsSurface?{getEffectsSurface}:{}),...(getEffectsPending?{getEffectsPending}:{}),onEffectsState:value=>states.push(value),onPresented:value=>presented.push(value),onError:error=>{throw error;}});loupe.set(settings);
 function flush(){const pending=[...frames.values()];frames.clear();for(const fn of pending)fn(performance.now());}
 function move(x,y){const event=new window.Event('pointermove');event.clientX=x;event.clientY=y;view.dispatchEvent(event);}
 return{loupe,raw,calls,workers,states,presented,source,comparison,flush,move,display(value){displayed=value;loupe.invalidate();},compare(value){comparingOriginal=value;loupe.invalidate();},set(patch){settings={...settings,...patch};loupe.set(settings);},async settle(){for(let i=0;i<12;i++){flush();await tick();}},async close(){loupe.dispose();for(let i=0;i<8;i++)await tick();Object.assign(globalThis,saved);}};
}
test('disabled local loupe cannot reset the real regional owner used by a whole-image prepared result',async()=>{
 const h=fixture({requestSource:true}),bounds={left:0,top:0,right:64,bottom:64};let prepared;
 try{
  h.set({enabled:false});const effects=structuredClone(loupeDefaults.effects);effects.adjust.enabled=true;effects.adjust.brightness=160;effects.enhance.enabled=true;
  prepared=await h.loupe.prepareImage(h.source,effects);const first=prepared.id;h.set({enabled:false});h.display(prepared);h.loupe.draw();await h.settle();
  assert.equal(h.workers.length,1);const worker=h.workers[0];assert.ok(!worker.messages.some(m=>m.action==='suspend'&&m.resultId===first),'painting Main must not suspend its own prepared owner');assert.equal(prepared.prepare(bounds,1),false);await h.settle();assert.equal(prepared.prepare(bounds,1),true,'native presentation reads still complete after Main publishes the prepared result');assert.ok(worker.messages.some(m=>m.action==='read'&&m.resultId===first));
  await prepared.close();prepared=null;const nextEffects=structuredClone(effects);nextEffects.adjust.brightness=50;h.set({effects:nextEffects});prepared=await h.loupe.prepareImage(h.source,nextEffects);const second=prepared.id;assert.notEqual(second,first);h.set({enabled:false});h.display(prepared);h.loupe.draw();await h.settle();assert.ok(!worker.messages.some(m=>m.action==='suspend'&&m.resultId===second));assert.equal(prepared.prepare(bounds,1),false);await h.settle();assert.equal(prepared.prepare(bounds,1),true);
  assert.deepEqual(worker.messages.filter(m=>m.action==='build').map(m=>m.effects.adjust.brightness),[160,50]);assert.ok(worker.messages.some(m=>m.action==='release'&&m.resultId===first),'the replaced publication is genuinely retired through the existing worker ACK');
 }finally{await prepared?.close();await h.close();}
 assert.ok(h.workers.every(worker=>worker.terminated));assert.ok(h.raw.every(handle=>handle.closed));
});
test('ordinary image raw windows are independent, keep absolute camera zoom, and commit complete native effects',async()=>{const h=fixture();try{
 h.move(160,140);h.flush();assert.equal(h.raw.length,4);assert.deepEqual(h.calls.filter(c=>c[0]==='prepare').slice(0,3).map(c=>c[1]),[0,1,2]);assert.equal(h.loupe.diagnostics().nativeScale,4);
 for(const raw of h.raw){raw.ready=true;raw.changed();}h.flush();const shown=h.loupe.diagnostics().presentedFrame;assert.equal(shown.native,true);
 const effects=structuredClone(loupeDefaults.effects);effects.adjust.enabled=true;effects.adjust.brightness=10;h.set({effects});h.move(180,170);h.flush();assert.ok(h.loupe.diagnostics().presentedFrame.serial>shown.serial);assert.equal(h.loupe.diagnostics().presentedFrame.pointer.x,180);assert.equal(h.loupe.diagnostics().settled,false);assert.equal(h.loupe.diagnostics().waitingNative,true);assert.equal(h.states.at(-1).busy,true);
 await h.settle();assert.equal(h.workers.length,1);assert.match(String(h.workers[0].url),/pdf-native-effects-worker\.js(?:\?.*)?$/);assert.deepEqual(h.workers[0].messages.find(m=>m.action==='build').width,512);assert.equal(h.workers[0].messages.filter(m=>m.action==='build').length,2);assert.equal(h.loupe.diagnostics().settled,true);assert.equal(h.loupe.diagnostics().presentedFrame.pointer.x,180);assert.equal(h.states.at(-1).busy,false);assert.equal(h.presented.at(-1).effectsKey,JSON.stringify(effects));
 const before=h.workers[0].messages.filter(m=>m.action==='build').length;h.move(185,175);await h.settle();assert.equal(h.workers[0].messages.filter(m=>m.action==='build').length,before);
 }finally{await h.close();}assert.ok(h.raw.every(v=>v.closed));assert.ok(h.workers.every(v=>v.terminated));});
test('pinned settings use the same native regional processor and never launch a scratch proxy worker',async()=>{const h=fixture();try{h.move(100,100);h.flush();for(const raw of h.raw){raw.ready=true;raw.changed();}h.loupe.pin(true);const effects=structuredClone(loupeDefaults.effects);effects.sweep.enabled=true;h.set({effects});await h.settle();assert.equal(h.loupe.diagnostics().settled,true);assert.equal(h.workers.length,1);assert.match(String(h.workers[0].url),/pdf-native-effects-worker\.js(?:\?.*)?$/);assert.equal(h.workers[0].messages.find(m=>m.action==='build').height,384);assert.equal(h.workers[0].messages.filter(m=>m.action==='build').length,2);assert.ok(h.workers[0].messages.filter(m=>m.action==='read').every(m=>m.rect.width<=128&&m.rect.height<=128));}finally{await h.close();}});

test('returning to cached A after cancelling B and re-enabling uses native tiles without a new A analysis',async()=>{const h=fixture();try{h.move(100,100);h.flush();for(const raw of h.raw){raw.ready=true;raw.changed();}const a=structuredClone(loupeDefaults.effects);a.adjust.enabled=true;a.adjust.brightness=10;h.set({effects:a});await h.settle();assert.equal(h.loupe.diagnostics().settled,true);const before=h.workers[0].messages.filter(m=>m.action==='build').length;const b=structuredClone(a);b.adjust.brightness=20;h.set({effects:b});h.flush();h.set({effects:a});await h.settle();assert.equal(h.workers[0].messages.filter(m=>m.action==='build').length,before+1);assert.equal(h.loupe.diagnostics().settled,true);assert.equal(h.states.at(-1).busy,false);h.set({enabled:false});h.set({enabled:true});h.move(300,250);await h.settle();assert.equal(h.workers[0].messages.filter(m=>m.action==='build').length,before+1);assert.equal(h.loupe.diagnostics().settled,true,JSON.stringify({diagnostics:h.loupe.diagnostics(),states:h.states,actions:h.workers[0].messages.map(m=>[m.action,m.ticket,m.resultId])}));assert.equal(h.loupe.diagnostics().presentedFrame.pointer.x,300);}finally{await h.close();}});

test('prepared Core publications prefetch actual display pixels in identity mode and retire the previous owner',async()=>{
 const reads=[],publications=[];
 const publication=version=>{const value={width:512,height:384,metrics:{coreFinal:true,version},retired:false,closes:0,
  async readDisplayPixels(rect){assert.equal(value.retired,false,'retired Core publication cannot supply display pixels');reads.push({version,rect});return{width:rect.width,height:rect.height,format:'rgb8',data:new Uint8Array(rect.width*rect.height*3).fill(version)};},
  readPixels(){throw Error('The Core scientific reader must not feed the display prefetch');},prepare(){return !value.retired;},draw(){},close(){value.closes++;}
 };publications.push(value);return value;};
 let target=null,pending=true;const h=fixture({requestSource:true,getEffectsSurface:()=>target,getEffectsPending:()=>pending});
 try{
  h.move(150,130);await h.settle();assert.equal(h.workers[0].messages.filter(m=>m.action==='build').length,1,'waiting for Core only prefetches Original, without an SDR substitute');target=publication(1);pending=false;
  const effects=structuredClone(loupeDefaults.effects);effects.enhance.enabled=true;h.set({effects});h.move(160,140);await h.settle();
  assert.equal(h.workers.length,1,'Original and Core share the existing worker service');const worker=h.workers[0],builds=()=>worker.messages.filter(m=>m.action==='build');assert.equal(builds().length,2,'one Original identity owner and one Core identity owner');
  for(const build of builds()){assert.ok(Object.values(build.effects).every(p=>p.enabled===false),'a prepared Core result is never filtered again');assert.equal(build.memoryBudgetBytes,128*1024**2);}
  const coreBuild=builds().at(-1),coreRequest=[...worker.sourceRequests].find(([,r])=>r.ticket===coreBuild.ticket);assert.ok(coreRequest);const supplied=worker.messages.find(m=>m.action==='source'&&m.read===coreRequest[0]);assert.ok(supplied?.pixels);assert.equal(supplied.error,undefined);assert.ok(supplied.pixels.data.every(v=>v===1));assert.equal(reads.filter(r=>r.version===1).length,1);assert.equal(h.loupe.diagnostics().settled,true);
  assert.ok(worker.messages.some(m=>m.action==='priority'&&m.resultId===coreBuild.ticket&&m.background===false),'pointer interaction controls the prepared owner');
  await new Promise(resolve=>setTimeout(resolve,170));await h.settle();assert.ok(worker.messages.some(m=>m.action==='priority'&&m.resultId===coreBuild.ticket&&m.background===true),'the existing idle timer resumes automatic background prefetch');
  h.set({enabled:false});assert.ok(worker.messages.some(m=>m.action==='suspend'&&m.resultId===coreBuild.ticket));h.set({enabled:true});h.move(165,145);await h.settle();assert.equal(builds().length,2,'reenabling keeps the current identity result');
  const previous=target;previous.retired=true;target=publication(2);h.move(170,150);await h.settle();assert.equal(builds().length,3,'a distinct Core publication creates a distinct identity result');
  assert.ok(worker.messages.some(m=>m.action==='release'&&m.resultId===coreBuild.ticket),'the previous worker record is released');const nextBuild=builds().at(-1);assert.notEqual(nextBuild.ticket,coreBuild.ticket);assert.ok(Object.values(nextBuild.effects).every(p=>p.enabled===false));
  const nextRequest=[...worker.sourceRequests].find(([,r])=>r.ticket===nextBuild.ticket),nextPixels=worker.messages.find(m=>m.action==='source'&&m.read===nextRequest?.[0]);assert.ok(nextPixels?.pixels?.data.every(v=>v===2));assert.equal(reads.filter(r=>r.version===1).length,1,'no old-source read after publication replacement');assert.equal(reads.filter(r=>r.version===2).length,1);
  h.move(175,155);await h.settle();assert.equal(builds().length,3);assert.equal(h.loupe.diagnostics().settled,true);assert.ok(worker.messages.filter(m=>m.action==='read').every(m=>m.rect.width<=128&&m.rect.height<=128));
 }finally{await h.close();}
 assert.ok(h.workers.every(w=>w.terminated));assert.ok(h.raw.every(r=>r.closed));assert.ok(publications.every(p=>p.closes===0),'borrowed Core records remain owned by the application');
});

test('O reuses a prewarmed Original owner and retains the after effect without cancelling or rebuilding',async()=>{
 const h=fixture({comparisonSize:{width:7008,height:4672}});try{
  const effects=structuredClone(loupeDefaults.effects);effects.adjust.enabled=true;effects.adjust.brightness=10;h.set({effects});h.move(160,140);await h.settle();
  const worker=h.workers[0],actions=()=>worker.messages.filter(m=>['build','cancel','release','suspend'].includes(m.action)).map(m=>[m.action,m.ticket,m.resultId]),before=actions(),state=h.loupe.diagnostics(),coverage=state.currentWorldCoverage.effects;
  assert.equal(worker.messages.filter(m=>m.action==='build').length,3,'after identity, Original identity, and one effect share the worker');
  assert.ok(worker.messages.some(m=>m.action==='build'&&m.width===7008&&m.height===4672),'Original prewarms before O at its native dimensions');
  for(let i=0;i<8;i++){
   h.compare(true);await h.settle();let shown=h.loupe.diagnostics();assert.equal(shown.presentedFrame.comparingOriginal,true);assert.equal(shown.presentedFrame.effectsKey,null);assert.equal(shown.presentedFrame.completeNative,true);assert.deepEqual(shown.presentedFrame.camera,state.presentedFrame.camera);assert.equal(shown.nativeScale,state.nativeScale);assert.deepEqual(shown.currentWorldCoverage.effects,coverage);assert.equal(h.calls.filter(c=>c[0]==='uniform'&&c[1]==='effectsVisible').at(-1)[2],0);
   h.compare(false);await h.settle();shown=h.loupe.diagnostics();assert.equal(shown.presentedFrame.effectsKey,JSON.stringify(effects));assert.equal(shown.settled,true);assert.equal(h.calls.filter(c=>c[0]==='uniform'&&c[1]==='effectsVisible').at(-1)[2],1);
  }
  assert.deepEqual(actions(),before,'O never retires, suspends, or rebuilds either producer');
 }finally{await h.close();}
 assert.ok(h.raw.every(r=>r.closed));assert.ok(h.workers.every(w=>w.terminated));assert.equal(h.calls.filter(c=>c[0]==='borrowed-close').length,0);
});

test('Original native bounds map independently in X/Y into a reduced result, without scientific reads',async()=>{
 const h=fixture({sourceSize:{width:512,height:341},comparisonSize:{width:7008,height:4672}});try{
  h.move(192,127.875);h.flush();for(const handle of h.raw){handle.ready=true;handle.changed();}h.compare(true);h.flush();
  const original=h.calls.filter(c=>c[0]==='prepare'&&h.raw[c[1]].label==='original'),x=512/7008,y=341/4672;
  assert.ok(original.length>=3,'Original prepares before its worker identity result arrives');
  const detail=original.find(c=>Math.abs(c[3]-4*Math.max(x,y))<1e-12);assert.ok(detail);const b=detail[2];assert.ok(Math.abs((b.left+b.right)/2-3504)<1e-9);assert.ok(Math.abs((b.top+b.bottom)/2-2336)<1e-9);assert.equal(b.circle,undefined,'an anisotropic mapping uses conservative rectangular native bounds');
  assert.ok(h.calls.some(c=>c[0]==='scale'&&c[1]===x&&c[2]===y));assert.equal(h.loupe.diagnostics().nativeScale,4);assert.equal(h.loupe.diagnostics().presentedFrame.completeNative,true);
 }finally{await h.close();}
 assert.ok(h.raw.every(r=>r.closed));
});

test('Main Original equals its after source and keeps one identity owner across O',async()=>{
 const h=fixture({comparisonIsSource:true});try{h.move(120,100);await h.settle();const worker=h.workers[0],builds=()=>worker.messages.filter(m=>m.action==='build').length;assert.equal(builds(),1);h.compare(true);await h.settle();h.compare(false);await h.settle();assert.equal(builds(),1);assert.equal(h.raw.length,4,'three raw leases plus the shared identity input, without duplicate Original leases');}finally{await h.close();}
});

test('a mapped Core publication prefetches real 512 dimensions and keeps its presentation wrapper stable',async()=>{
 let mapped=0;const core={width:512,height:341,readPixels(){throw Error('scientific Core reader');},readDisplayPixels:async r=>({width:r.width,height:r.height,format:'rgb8',data:new Uint8Array(r.width*r.height*3)}),prepare:()=>true,draw(){}};
 const target=mapLoupePresentation(core,{width:7008,height:4672});target.prefetchSource=core;target.mapPrefetched=surface=>{mapped++;return mapLoupePresentation(surface,{width:7008,height:4672});};
 const h=fixture({sourceSize:{width:7008,height:4672},getEffectsSurface:()=>target,getEffectsPending:()=>false,requestSource:true});try{
  const effects=structuredClone(loupeDefaults.effects);effects.enhance.enabled=true;h.set({effects});h.move(150,130);await h.settle();const builds=h.workers[0].messages.filter(m=>m.action==='build');assert.deepEqual(builds.map(m=>[m.width,m.height]),[[7008,4672],[512,341]]);assert.equal(mapped,1);assert.equal(h.loupe.diagnostics().settled,true);h.move(155,135);await h.settle();assert.equal(mapped,1,'unchanged prefetch publication retains its mapped wrapper');
 }finally{await h.close();}
});

test('mapped native drawing chooses interpolation from native scale in either direction',()=>{
 const seen=[],ctx={imageSmoothingEnabled:false,save(){this.previous=this.imageSmoothingEnabled;},restore(){this.imageSmoothingEnabled=this.previous;},scale(){}};
 const native=(width,height)=>({width,height,draw(context,_bounds,scale){seen.push([context.imageSmoothingEnabled,scale]);}}),bounds={left:0,top:0,right:20,bottom:20};
 mapLoupePresentation(native(7008,4672),{width:512,height:341}).draw(ctx,bounds,4);assert.equal(seen[0][0],true);assert.equal(ctx.imageSmoothingEnabled,false);
 mapLoupePresentation(native(512,341),{width:7008,height:4672}).draw(ctx,bounds,1);assert.equal(seen[1][0],false);assert.equal(ctx.imageSmoothingEnabled,false);
});

// Explicit protocol mock: the computed effect grid is declared by its build
// acknowledgement; no photograph, 7C arithmetic or frame-rate claim is made.
test('a reduced regional SHERLOQ effect maps only lens prepare/draw while prepareImage and reads keep256x192',async()=>{
 const h=fixture({regionalOutput:{width:256,height:192}});let exported;
 try{
  const {equalizationMethods,equalizationState}=await import('../sherloq-browser/assets/equalization-menu.js');
  const effects=structuredClone(loupeDefaults.effects);effects.adjust.enabled=true;effects.adjust.brightness=10;effects.enhance={...effects.enhance,enabled:true,mode:'equalize',equalization:equalizationState({method:'sherloq7c',values:equalizationMethods.map(m=>m.default)})};
  h.set({effects});h.move(300,240);await h.settle();
  const worker=h.workers[0],builds=()=>worker.messages.filter(m=>m.action==='build'),regional=builds().find(m=>m.effects.enhance.equalization?.method==='sherloq7c');assert.ok(regional);assert.deepEqual([regional.width,regional.height],[512,384],'the processing input remains the true source grid');
  const priorities=worker.messages.filter(m=>m.action==='priority'&&m.resultId===regional.ticket);assert.ok(priorities.length);assert.deepEqual(priorities[0].regions,[{x:128,y:128,width:128,height:64}],'the finest window is centred at output200/160, not Original400/320');
  assert.ok(h.calls.some(c=>c[0]==='scale'&&c[1]===2&&c[2]===2),'drawing alone maps the selected output onto source coordinates');assert.equal(h.loupe.diagnostics().settled,true);assert.equal(h.loupe.diagnostics().presentedFrame.effectsKey,JSON.stringify(effects));
  const before=builds().length;h.move(305,235);await h.settle();assert.equal(builds().length,before,'movement reuses the regional result and its stable mapping');
  exported=await h.loupe.prepareImage(h.source,effects);assert.equal(builds().length,before);assert.deepEqual([exported.width,exported.height],[256,192],'prepareImage/export receives the native result, never a false512-wide surface');assert.deepEqual(exported.presentationCoordinateTransform,{sourceWidth:512,sourceHeight:384,outputWidth:256,outputHeight:192,toSource:[2,2],toOutput:[.5,.5]});
  const pixels=await exported.readPixels({x:128,y:128,width:128,height:64});assert.deepEqual([pixels.width,pixels.height],[128,64]);const readCount=worker.messages.filter(m=>m.action==='read').length;await assert.rejects(exported.readPixels({x:255,y:191,width:2,height:1}),{code:'INVALID_INPUT'});assert.equal(worker.messages.filter(m=>m.action==='read').length,readCount,'out-of-output explicit reads fail before transport');
  const reads=worker.messages.filter(m=>m.action==='read'&&m.resultId===regional.ticket);assert.ok(reads.length);assert.ok(reads.every(m=>m.rect.x+m.rect.width<=256&&m.rect.y+m.rect.height<=192));
 }finally{await exported?.close();await h.close();}
 assert.ok(h.workers.every(w=>w.terminated));assert.ok(h.raw.every(r=>r.closed));
});
