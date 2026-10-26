import test from 'node:test';
import assert from 'node:assert/strict';
import './helpers/pdf-node-environment.mjs';
const {createPdfReaderSession,renderPdfReaderPage}=await import('../sherloq-browser/assets/pdf-reader-session.js');
const {OPS:PDF_OPS}=await import('../sherloq-browser/assets/batch-vendor/pdf.mjs');
const {createBatchImporter}=await import('../sherloq-browser/assets/batch-import.js');
// Model the qualified PDF.js RenderTask contract rather than executing image
// callbacks synchronously before its display list can be certified.
function paintPage(logicalImageOperators,paint,{renderImageOperators=logicalImageOperators}={}){
 const list=indices=>{const length=Math.max(0,...indices)+1,fnArray=Array(length).fill(PDF_OPS.save),argsArray=Array.from({length},()=>[]);for(const index of indices){fnArray[index]=PDF_OPS.paintImageXObject;argsArray[index]=['transient-'+index,8,9];}return{fnArray,argsArray,lastChunk:true};};
 const logical=list(logicalImageOperators),display=list(renderImageOperators);
 return{pageNumber:1,getOperatorList:async()=>logical,getViewport:()=>({width:10,height:10,transform:[2,0,0,-2,0,10]}),render(options){
  let resolve,reject,done=false;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;}),task={promise,_internalRenderTask:{operatorList:display},onContinue:null,cancel(){if(done)return;done=true;reject(new DOMException('PDF task cancelled.','AbortError'));}};
  queueMicrotask(()=>{if(done)return;const run=()=>{if(done)return;try{paint(options,display);done=true;resolve();}catch(error){done=true;reject(error);}};if(task.onContinue)task.onContinue(run);else run();});return task;
 }};
}
const pdf=()=>new File(['%PDF-1.7\n'],'sixteen.pdf',{type:'application/pdf'});
function store(){const files=new Map();let closed=false;return{files,get:path=>files.get(path),set:async(path,blob)=>files.set(path,blob),delete:path=>files.delete(path),clear:async()=>files.clear(),dispose:async()=>{closed=true;files.clear();},get closed(){return closed;}};}
function libraries(count,events){const page=n=>({pageNumber:n,getOperatorList:async()=>({fnArray:[],argsArray:[]}),getTextContent:async()=>({items:[]}),cleanup(){events.push(['cleanup',n]);}});return async()=>({pdf:{PDFDocument:{load:async()=>({context:{enumerateIndirectObjects:()=>[]}})},PDFRawStream:class{}},pdfjs:{OPS:{},getDocument:()=>({promise:Promise.resolve({numPages:count,getPage:async n=>{events.push(['get',n]);return page(n);}}),destroy:async()=>events.push(['destroy'])})}});}
function fakeImporter(count=16){const artifacts=store(),study={id:'study',name:'sixteen.pdf',pageText:[]},images=[];return{artifacts,factory:async({onPage})=>({studies:[study],images,errors:[],artifacts,async import(files,signal){for(let n=1;n<=count;n++){signal.throwIfAborted();const image={id:'i'+n,width:8,height:9,blob:new Blob(['native']),occurrences:[{studyId:'study',page:n,operator:10+n,matrix:[1,0,0,1,n,n],textExclusions:[[[0,0],[1,0],[1,1]]]}]};images.push(image);await onPage({page:n,pdfPage:{pageNumber:n},study,images:[image]});signal.throwIfAborted();}},async clear(){images.length=0;await artifacts.clear();}})};}
const render=async page=>({blob:new Blob(['page'+page.pageNumber],{type:'image/png'}),width:600,height:800,viewport:{width:600,height:800,scale:2,transform:[2,0,0,-2,0,800]}});
test('batch page hook is awaited before cleanup and page2, default import remains valid',async()=>{const events=[],artifacts=store();let release;const gate=new Promise(r=>release=r);const importer=await createBatchImporter({libraryLoader:libraries(16,events),artifactStoreFactory:async()=>artifacts,onPage:async row=>{events.push(['page',row.page]);if(row.page===1)await gate;}});const done=importer.import([pdf()]);await new Promise(r=>setTimeout(r,0));assert.deepEqual(events,[['get',1],['page',1]]);release();await done;assert(events.findIndex(e=>e[0]==='page'&&e[1]===16)>events.findIndex(e=>e[0]==='cleanup'&&e[1]===1));assert.equal(events.filter(e=>e[0]==='page').length,16);assert.equal(events.filter(e=>e[0]==='cleanup').length,16);assert.equal(events.at(-1)[0],'destroy');const normal=await createBatchImporter({libraryLoader:libraries(1,[]),artifactStoreFactory:async()=>store()});await normal.import([pdf()]);assert.equal(normal.errors.length,0);});
test('hook failure still cleans the live page and destroys parser',async()=>{const events=[];const importer=await createBatchImporter({libraryLoader:libraries(16,events),artifactStoreFactory:async()=>store(),onPage:()=>{throw Error('consumer failed');}});await importer.import([pdf()]);assert.deepEqual(events,[['get',1],['cleanup',1],['destroy']]);assert.equal(importer.errors[0].message,'consumer failed');});
test('session delivers page1 before completion and never steals a later selection',async()=>{const f=fakeImporter(),seen=[];let done=false;const session=await createPdfReaderSession({importerFactory:f.factory,renderPage:render,onPage:async(record,owner)=>{seen.push(record.page);assert.equal(done,false);assert.equal(record.images[0],owner.model.images.at(-1));assert.deepEqual(record.occurrences[0].matrix,[1,0,0,1,record.page,record.page]);assert.equal(await(await owner.background(record.page)).text(),'page'+record.page);if(record.page===2)owner.select(2);}});await session.open(pdf());done=true;assert.equal(session.state,'ready');assert.deepEqual(seen,Array.from({length:16},(_,i)=>i+1));assert.equal(session.selectedPage,2);assert.equal(session.pages[0].backgroundScale,2);await session.dispose();assert.equal(f.artifacts.closed,true);assert.equal(session.pages.length,0);});
test('cancel during delivery stops later pages and dispose releases artifact ownership',async()=>{const f=fakeImporter();const session=await createPdfReaderSession({importerFactory:f.factory,renderPage:render,onPage:async(record,owner)=>{if(record.page===3)owner.cancel();}});await assert.rejects(session.open(pdf()),{name:'AbortError'});assert.equal(session.state,'cancelled');assert.equal(session.pages.length,3);await session.dispose();assert.equal(f.artifacts.files.size,0);assert.equal(f.artifacts.closed,true);});
test('model transfer is explicit, idle only, and survives reader disposal',async()=>{const f=fakeImporter(1),session=await createPdfReaderSession({importerFactory:f.factory,renderPage:render});await session.open(pdf());const model=session.detachModel();await session.dispose();assert.equal(model.artifacts.files.size,1);assert.equal(model.artifacts.closed,false);await model.clear();await model.artifacts.dispose();});
test('full scale2 render returns its reservation and resets canvas after encode',async()=>{let bytes=0,released=0;const canvas={width:0,height:0,getContext:()=>({}),convertToBlob:async()=>new Blob(['png'],{type:'image/png'})},page={pageNumber:1,getViewport:({scale})=>({width:scale*10,height:scale*20,transform:[scale,0,0,-scale,0,scale*20]}),render:()=>({promise:Promise.resolve(),cancel(){}})};const answer=await renderPdfReaderPage(page,{canvasFactory:(w,h)=>Object.assign(canvas,{width:w,height:h}),reserveRender:async n=>{bytes=n;return()=>released++;}});assert.equal(bytes,20*40*8);assert.equal(released,1);assert.equal(canvas.width,1);assert.equal(answer.width,20);assert.equal(answer.height,40);});
test('render cancellation cancels PDF task, releases admission, and never returns partial PNG',async()=>{const controller=new AbortController();let released=0,cancelled=0,reject;const page={pageNumber:1,getViewport:()=>({width:10,height:20,transform:[1,0,0,1,0,0]}),render:()=>({promise:new Promise((_,r)=>reject=r),cancel(){cancelled++;reject(new DOMException('cancelled','AbortError'));}})};const result=renderPdfReaderPage(page,{signal:controller.signal,canvasFactory:()=>({getContext:()=>({})}),reserveRender:async()=>()=>released++});await new Promise(r=>setTimeout(r,0));controller.abort();await assert.rejects(result,{name:'AbortError'});assert.equal(cancelled,1);assert.equal(released,1);});
test('canvas allocation failure and render limit never leak admission',async()=>{let releases=0,calls=0;const page={getViewport:()=>({width:10,height:20,transform:[1,0,0,1,0,0]})};await assert.rejects(renderPdfReaderPage(page,{canvasFactory:()=>{throw Error('allocation');},reserveRender:async()=>{calls++;return()=>releases++;}}),/allocation/);assert.equal(releases,1);await assert.rejects(renderPdfReaderPage(page,{maxRenderPixels:100,reserveRender:()=>{calls++;}}),{code:'PDF_RENDER_LIMIT'});assert.equal(calls,1);});

test('image-free background is requested after the complete page, deduplicated and filtered by native operator',async()=>{
 const f=fakeImporter(1),calls=[];let delivered=false;
 const session=await createPdfReaderSession({importerFactory:f.factory,renderPage:async(page,options)=>{calls.push(options);if(options.imageOperationsFilter){assert(delivered);assert.equal(options.imageOperationsFilter(11),false);assert.equal(options.imageOperationsFilter(12),true);}return render(page);},onPage:async(record,owner)=>{delivered=true;const first=owner.requestCleanBackground(1),second=owner.requestCleanBackground(1);assert.equal(first,second);await first;},onBackground:async(record,owner)=>{assert.equal(await(await owner.background(1,{clean:true})).text(),'page1');}});
 await session.open(pdf());assert.equal(calls.length,2);assert.deepEqual(session.pages[0].cleanBackground.omittedOperators,[11]);assert.throws(()=>session.requestCleanBackground(1),{code:'PDF_PAGE_CLOSED'});await session.dispose();
});
test('optional clean-background failure preserves the complete page and does not silently substitute it',async()=>{
 const f=fakeImporter(1),session=await createPdfReaderSession({importerFactory:f.factory,renderPage:async(page,options)=>{if(options.imageOperationsFilter)throw Error('optional render failed');return render(page);},onPage:(record,owner)=>{owner.requestCleanBackground(record.page);}});
 await session.open(pdf());assert.equal(session.state,'ready');assert.match(session.pages[0].cleanBackgroundError.message,/optional render/);assert.equal(await(await session.background(1)).text(),'page1');await assert.rejects(session.background(1,{clean:true}),{code:'PDF_BACKGROUND_UNAVAILABLE'});await session.dispose();
});

test('reader-only PDF retention keeps getPage available after cleanup and destroys exactly once at clear',async()=>{
 const events=[],importer=await createBatchImporter({retainPDFDocument:true,libraryLoader:libraries(2,events),artifactStoreFactory:async()=>store()});await importer.import([pdf()]);assert.equal(events.some(row=>row[0]==='destroy'),false);const doc=importer.getPdfDocument(importer.studies[0].id);assert(doc);assert.equal((await doc.getPage(1)).pageNumber,1);await importer.clear();await importer.clear();assert.equal(events.filter(row=>row[0]==='destroy').length,1);assert.equal(importer.getPdfDocument('missing'),undefined);
});

test('bounded native PDF window uses the high-density viewport, exact translation and an owned RGB lease',async()=>{
 const {renderPdfReaderWindow}=await import('../sherloq-browser/assets/pdf-reader-session.js');let admitted=0,params,encoded=0;const released=[];
 const canvas={getContext:()=>({getImageData:()=>({data:Uint8ClampedArray.from({length:4*6*4},(_,i)=>i%4===3?255:i)})}),convertToBlob:()=>{encoded++;}};
 const page={pageNumber:3,getViewport:({scale})=>({width:600*scale,height:800*scale,transform:[scale,0,0,-scale,0,800*scale]}),render:options=>(params=options,{promise:Promise.resolve(),cancel(){}})};
 const out=await renderPdfReaderWindow(page,{bounds:{x:10.5,y:20.25,width:2,height:3},scale:2,canvasFactory:(w,h)=>Object.assign(canvas,{width:w,height:h}),reserveRender:async(bytes,meta)=>{admitted+=bytes;return()=>{admitted-=bytes;released.push(meta.kind);};}});
 assert.equal(out.pixels.width,4);assert.equal(out.pixels.height,6);assert.equal(out.pixels.data.length,72);assert.equal(params.viewport.transform[0],4);assert.deepEqual(params.transform,[1,0,0,1,-21,-40.5]);assert.equal(out.pixels.data[0],0);assert.equal(out.pixels.data[3],4);assert.equal(encoded,0);assert.equal(canvas.width,1);assert.equal(admitted,24*4);assert.deepEqual(released,['pdf-window-scratch']);await out.release();await out.release();assert.equal(admitted,0);
});

test('window rejects invalid bounds or excess pixels before any canvas or admission',async()=>{
 const {renderPdfReaderWindow}=await import('../sherloq-browser/assets/pdf-reader-session.js');let admissions=0;const options={reserveRender:()=>{admissions++;},canvasFactory:()=>{throw Error('must not allocate');}};
 for(const bounds of [[0,0,0,2],[0,0,NaN,2],[Infinity,0,1,2]])await assert.rejects(renderPdfReaderWindow({}, {...options,bounds}),{code:'PDF_RENDER_BOUNDS'});
 await assert.rejects(renderPdfReaderWindow({}, {...options,bounds:[0,0,100,100],maxRenderPixels:9999}),{code:'PDF_RENDER_LIMIT'});assert.equal(admissions,0);
});

test('window cancellation returns both leases and never publishes incomplete pixels',async()=>{
 const {renderPdfReaderWindow}=await import('../sherloq-browser/assets/pdf-reader-session.js');const controller=new AbortController();let admitted=0,cancelled=0,reject;
 const page={pageNumber:1,getViewport:()=>({width:100,height:100,transform:[2,0,0,-2,0,100]}),render:()=>({promise:new Promise((_,r)=>reject=r),cancel(){cancelled++;reject(Object.assign(Error('PDF.js cancelled'),{name:'RenderingCancelledException'}));}})};
 const work=renderPdfReaderWindow(page,{bounds:[0,0,10,10],signal:controller.signal,canvasFactory:()=>({getContext:()=>({})}),reserveRender:async n=>{admitted+=n;return()=>admitted-=n;}});await new Promise(resolve=>setTimeout(resolve,0));controller.abort();await assert.rejects(work,{name:'AbortError'});assert.equal(cancelled,1);assert.equal(admitted,0);
});

test('session disposal waits for active PDF windows before model/document clear',async()=>{
 const f=fakeImporter(1),events=[];let reject,renderStarted;const started=new Promise(resolve=>renderStarted=resolve),page={pageNumber:1,getViewport:()=>({width:600,height:800,transform:[2,0,0,-2,0,800]}),render:()=>{renderStarted();return{promise:new Promise((_,r)=>reject=r),cancel(){events.push('cancel');reject(new DOMException('stopped','AbortError'));}};}};
 const session=await createPdfReaderSession({importerFactory:async options=>{assert.equal(options.retainPDFDocument,true);const model=await f.factory(options),clear=model.clear;model.getPdfDocument=()=>({getPage:async()=>page});model.clear=async()=>{events.push('clear');return clear();};return model;},renderPage:render,canvasFactory:()=>({getContext:()=>({})})});await session.open(pdf());const work=session.renderWindow(1,{bounds:[0,0,10,10]});await started;await session.dispose();await assert.rejects(work,{name:'AbortError'});assert.deepEqual(events,['cancel','clear']);
});

test('paint certificate excludes complex contexts and records only unambiguous native image operators',async()=>{
 const {pdfPagePaintCapabilities}=await import('../sherloq-browser/assets/batch-import.js'),OPS={save:1,transform:2,paintImageXObject:3,paintInlineImageXObject:4,setGState:5,beginGroup:6,paintImageXObjectRepeat:7,beginAnnotation:8};
 assert.deepEqual(pdfPagePaintCapabilities({fnArray:[1,2,3,4]},OPS),{schema:'pdf-simple-image-paint/1',simpleImagePainting:true,unsupportedOperations:[],imageOperators:[2,3]});
 for(const op of [5,6,7,8]){const cap=pdfPagePaintCapabilities({fnArray:[3,op]},OPS);assert.equal(cap.simpleImagePainting,false);assert.equal(cap.unsupportedOperations.length,1);}
 for(const states of [[['SMask',false]],[['ca',.5],['CA',1]],[['BM','source-over']],[['BM','Normal']]])assert.equal(pdfPagePaintCapabilities({fnArray:[5],argsArray:[[states]]},OPS).simpleImagePainting,true);
 for(const states of [[['SMask',true]],[['ca',-1]],[['CA',2]],[['TR',[1]]],[['BM','multiply']]])assert.equal(pdfPagePaintCapabilities({fnArray:[5],argsArray:[[states]]},OPS).simpleImagePainting,false);
});

test('certified synchronous paint hook runs on the actual page canvas only for known images',async()=>{
 const {renderPdfReaderWindow}=await import('../sherloq-browser/assets/pdf-reader-session.js');const context={getImageData:()=>({data:new Uint8ClampedArray(16)})},seen=[];
 const page=paintPage([3,4],options=>{assert.equal(options.operationsFilter(2),true);assert.equal(options.operationsFilter(3),false);assert.equal(options.operationsFilter(4),true);});
 const answer=await renderPdfReaderWindow(page,{bounds:[0,0,2,2],paintCapabilities:{schema:'pdf-simple-image-paint/1',simpleImagePainting:true,imageOperators:[3,4]},paintImage:(index,ctx)=>{assert.equal(ctx,context);seen.push(index);return index===3;},canvasFactory:()=>({getContext:()=>context})});assert.deepEqual(seen,[3,4]);await answer.release();
 let admitted=0;await assert.rejects(renderPdfReaderWindow(page,{bounds:[0,0,2,2],paintCapabilities:{schema:'pdf-simple-image-paint/1',simpleImagePainting:false},paintImage:()=>true,reserveRender:()=>admitted++}),{code:'PDF_IMAGE_PAINT_UNSUPPORTED'});assert.equal(admitted,0);
});

test('async image paint cannot silently omit an original operator and returns both leases',async()=>{
 const {renderPdfReaderWindow}=await import('../sherloq-browser/assets/pdf-reader-session.js');let bytes=0;const page=paintPage([3],options=>{options.operationsFilter(3);});
 await assert.rejects(renderPdfReaderWindow(page,{bounds:[0,0,2,2],paintCapabilities:{schema:'pdf-simple-image-paint/1',simpleImagePainting:true,imageOperators:[3]},paintImage:()=>Promise.resolve(true),canvasFactory:()=>({getContext:()=>({})}),reserveRender:async n=>{bytes+=n;return()=>bytes-=n;}}),{code:'PDF_IMAGE_PAINT_ASYNC'});assert.equal(bytes,0);
});

test('abort while awaiting scratch release rejects instead of publishing a stale owned window',async()=>{
 const {renderPdfReaderWindow}=await import('../sherloq-browser/assets/pdf-reader-session.js');const controller=new AbortController();let admitted=0,enterRelease,resumeRelease;const entered=new Promise(resolve=>enterRelease=resolve),gate=new Promise(resolve=>resumeRelease=resolve);
 const page={getViewport:()=>({width:10,height:10,transform:[2,0,0,-2,0,10]}),render:()=>({promise:Promise.resolve(),cancel(){}})},canvas={getContext:()=>({getImageData:()=>({data:new Uint8ClampedArray(16)})})};
 const work=renderPdfReaderWindow(page,{bounds:[0,0,2,2],signal:controller.signal,canvasFactory:()=>canvas,reserveRender:async(n,meta)=>{admitted+=n;return async()=>{if(meta.kind==='pdf-window-scratch'){enterRelease();await gate;}admitted-=n;};}});await entered;controller.abort(new DOMException('Superseded','AbortError'));resumeRelease();await assert.rejects(work,{name:'AbortError'});assert.equal(admitted,0);
});

test('retained image capture preserves graphics state, removes opacity from clip only, and owns three RGBA layers',async()=>{
 const {renderPdfReaderWindow}=await import('../sherloq-browser/assets/pdf-reader-session.js');let admitted=0,mode='prefix',alpha=.4,saved;
 const values={prefix:[10,20,30,255],clip:[255,255,255,255],empty:[0,0,0,0],suffix:[80,90,100,128]},ctx={get globalAlpha(){return alpha;},set globalAlpha(v){alpha=v;},getImageData:()=>({data:Uint8ClampedArray.from(values[mode])}),createImageData:()=>({data:new Uint8ClampedArray(4)}),putImageData(){mode='empty';},save(){saved=alpha;},restore(){alpha=saved;},fillRect(){assert.equal(alpha,1);mode='clip';}};
 const page=paintPage([3],options=>{assert.equal(options.background,'rgba(0,0,0,0)');assert.equal(options.operationsFilter(3),false);assert.equal(alpha,.4);mode='suffix';});
 const answer=await renderPdfReaderWindow(page,{bounds:[0,0,1,1],captureImageLayers:{operator:3},paintCapabilities:{schema:'pdf-simple-image-paint/1',simpleImagePainting:true,imageOperators:[3]},canvasFactory:()=>({getContext:(kind,opts)=>{assert.equal(opts.alpha,true);return ctx;}}),reserveRender:async n=>{admitted+=n;return()=>admitted-=n;}});assert.equal(answer.layers.imageAlpha,.4);assert.deepEqual([...answer.layers.prefix.data],values.prefix);assert.deepEqual([...answer.layers.clip.data],values.clip);assert.deepEqual([...answer.layers.suffix.data],values.suffix);assert.equal(admitted,16);await answer.release();assert.equal(admitted,0);
});
test('retained layers fail explicitly for multiple image operators and release admissions',async()=>{const {renderPdfReaderWindow}=await import('../sherloq-browser/assets/pdf-reader-session.js');let bytes=0;await assert.rejects(renderPdfReaderWindow(paintPage([3,4],()=>{}),{bounds:[0,0,1,1],captureImageLayers:{operator:3},paintCapabilities:{schema:'pdf-simple-image-paint/1',simpleImagePainting:true,imageOperators:[3,4]},canvasFactory:()=>({getContext:()=>({})}),reserveRender:async n=>{bytes+=n;return()=>bytes-=n;}}),{code:'PDF_IMAGE_LAYERS_UNSUPPORTED'});assert.equal(bytes,0);});


test('image-free full-page rendering maps logical images while generic filters keep real display indices',async()=>{
 const logical=[],actual=[];let bytes=0;
 const page=paintPage([3],options=>{assert.equal(options.operationsFilter(3),true,'non-image at the old logical offset stays untouched');assert.equal(options.operationsFilter(4),false,'actual display image is omitted');},{renderImageOperators:[4]});
 const canvas={width:0,height:0,getContext:()=>({}),convertToBlob:async()=>new Blob(['clean'],{type:'image/png'})};
 const answer=await renderPdfReaderPage(page,{paintCapabilities:{schema:'pdf-simple-image-paint/1',simpleImagePainting:true,imageOperators:[3]},imageOperationsFilter:index=>(logical.push(index),false),operationsFilter:index=>(actual.push(index),true),canvasFactory:(w,h)=>Object.assign(canvas,{width:w,height:h}),reserveRender:n=>{bytes+=n;return()=>bytes-=n;}});
 assert.deepEqual(logical,[3]);assert.deepEqual(actual,[3,4]);assert.equal(await answer.blob.text(),'clean');assert.equal(bytes,0);assert.equal(canvas.width,1);
});

test('window image mapping never changes the index passed to an independent operations filter',async()=>{
 const {renderPdfReaderWindow}=await import('../sherloq-browser/assets/pdf-reader-session.js'),logical=[],actual=[];
 const page=paintPage([3],options=>{assert.equal(options.operationsFilter(3),true);assert.equal(options.operationsFilter(4),false);},{renderImageOperators:[4]});
 const answer=await renderPdfReaderWindow(page,{bounds:[0,0,2,2],paintCapabilities:{schema:'pdf-simple-image-paint/1',simpleImagePainting:true,imageOperators:[3]},paintImage:index=>(logical.push(index),true),operationsFilter:index=>(actual.push(index),true),canvasFactory:()=>({getContext:()=>({getImageData:()=>({data:new Uint8ClampedArray(16)})})})});
 assert.deepEqual(logical,[3]);assert.deepEqual(actual,[3,4]);await answer.release();
});

test('cancelling one pending PDF operator consumer preserves the shared plan and does not reserve pixels early',async()=>{
 const {renderPdfReaderWindow}=await import('../sherloq-browser/assets/pdf-reader-session.js');
 const page=paintPage([3],options=>{assert.equal(options.operationsFilter(4),false);},{renderImageOperators:[4]}),list=await page.getOperatorList();let resolveList,reads=0,admitted=0;
 const gate=new Promise(resolve=>resolveList=resolve);page.getOperatorList=()=>{reads++;return gate;};
 const caps={schema:'pdf-simple-image-paint/1',simpleImagePainting:true,imageOperators:[3]},controller=new AbortController(),options={bounds:[0,0,2,2],paintCapabilities:caps,paintImage:()=>true,canvasFactory:()=>({getContext:()=>({getImageData:()=>({data:new Uint8ClampedArray(16)})})}),reserveRender:n=>{admitted+=n;return()=>admitted-=n;}};
 const first=renderPdfReaderWindow(page,{...options,signal:controller.signal}),second=renderPdfReaderWindow(page,options);await new Promise(resolve=>setImmediate(resolve));assert.equal(admitted,0,'validation happens before native pixel admission');controller.abort(new DOMException('old page selection','AbortError'));await assert.rejects(first,{name:'AbortError'});assert.equal(admitted,0);resolveList(list);const answer=await second;assert.equal(reads,1,'a cancelled consumer must not discard the independent shared plan');assert.equal(answer.pixels.data.length,12);await answer.release();assert.equal(admitted,0);
});

test('a logical image certificate cannot be reused for another PDF page owner',async()=>{
 const {renderPdfReaderWindow}=await import('../sherloq-browser/assets/pdf-reader-session.js'),caps={schema:'pdf-simple-image-paint/1',simpleImagePainting:true,imageOperators:[3]};
 const options={bounds:[0,0,2,2],paintCapabilities:caps,paintImage:()=>true,canvasFactory:()=>({getContext:()=>({getImageData:()=>({data:new Uint8ClampedArray(16)})})})},first=paintPage([3],o=>o.operationsFilter(3)),second=paintPage([3],o=>o.operationsFilter(3));
 const answer=await renderPdfReaderWindow(first,options);await answer.release();await assert.rejects(renderPdfReaderWindow(second,options),{code:'PDF_RENDER_OPERATORS_UNSUPPORTED'});
});

test('returning to a previously qualified page reuses its operator plan across new window paints',async()=>{
 const {renderPdfReaderWindow}=await import('../sherloq-browser/assets/pdf-reader-session.js');let plans=0,renders=0;
 const page=paintPage([3],options=>{renders++;options.operationsFilter(4);},{renderImageOperators:[4]}),get=page.getOperatorList;page.getOperatorList=()=>{plans++;return get();};
 const caps={schema:'pdf-simple-image-paint/1',simpleImagePainting:true,imageOperators:[3]},options={bounds:[0,0,2,2],paintCapabilities:caps,paintImage:()=>true,canvasFactory:()=>({getContext:()=>({getImageData:()=>({data:new Uint8ClampedArray(16)})})})};
 const first=await renderPdfReaderWindow(page,options);await first.release();const second=await renderPdfReaderWindow(page,{...options,bounds:[4,5,2,2]});await second.release();assert.equal(plans,1);assert.equal(renders,2);
});
