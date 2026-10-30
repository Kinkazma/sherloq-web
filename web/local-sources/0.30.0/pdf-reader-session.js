import {createPdfRenderOperatorBridge,preparePdfRenderOperators} from './pdf-render-operators.js?v=0.30.0';
import {createBatchImporter,IMPORT_LIMITS} from './batch-import.js?v=0.30.0';

const aborted=signal=>signal?.throwIfAborted();
const abortReason=()=>new DOMException('PDF import cancelled.','AbortError');
const failure=(code,message)=>Object.assign(Error(message),{code});

/** One live PDF canvas at a time. The encoded page belongs to the shared
 * artifact store; source image bytes and native occurrences stay untouched. */
export async function renderPdfReaderPage(pdfPage,{signal,scale=2,maxRenderPixels=IMPORT_LIMITS.pixels,reserveRender=()=>()=>{},canvasFactory,operationsFilter,imageOperationsFilter,paintCapabilities}={}){
 aborted(signal);const viewport=pdfPage.getViewport({scale}),width=Math.ceil(viewport.width),height=Math.ceil(viewport.height);
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width*height>maxRenderPixels)throw failure('PDF_RENDER_LIMIT','PDF page exceeds the admitted full-resolution render size.');
 let release,operatorBridge,task,canvas;const cancel=()=>task?.cancel();signal?.addEventListener('abort',cancel,{once:true});
 try{
  aborted(signal);if(imageOperationsFilter){operatorBridge=await createPdfRenderOperatorBridge(pdfPage,paintCapabilities,{signal});aborted(signal);}
  release=await reserveRender(width*height*8,{width,height,page:pdfPage.pageNumber});aborted(signal);canvas=canvasFactory?canvasFactory(width,height):typeof OffscreenCanvas==='function'?new OffscreenCanvas(width,height):Object.assign(document.createElement('canvas'),{width,height});const context=canvas.getContext('2d',{alpha:false});if(!context)throw failure('PDF_RENDER_CONTEXT','PDF page rendering is unavailable.');
  const filter=imageOperationsFilter?index=>{if(operationsFilter&&operationsFilter(index)===false)return false;const logical=operatorBridge.logicalImage(index);return logical===undefined||imageOperationsFilter(logical)!==false;}:operationsFilter;
  task=pdfPage.render({canvasContext:context,viewport,background:'rgb(255,255,255)',operationsFilter:filter});if(operatorBridge){operatorBridge.bind(task);await operatorBridge.ready;}await task.promise;aborted(signal);
  const blob=canvas.convertToBlob?await canvas.convertToBlob({type:'image/png'}):await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(failure('PDF_RENDER_ENCODE','PDF page could not be encoded.')),'image/png'));
  aborted(signal);return{blob,width,height,viewport:{width:viewport.width,height:viewport.height,scale,rotation:viewport.rotation??pdfPage.rotate??0,transform:[...viewport.transform],viewBox:viewport.viewBox?[...viewport.viewBox]:undefined}};
 }finally{signal?.removeEventListener('abort',cancel);operatorBridge?.dispose();if(canvas)canvas.width=canvas.height=1;await release?.();}
}

/** Replay the PDF at the requested output density into one bounded window.
 * bounds use the initial page coordinates (baseScale=2), never PDF points.
 * The returned output lease belongs to the caller until release(). */
export async function renderPdfReaderWindow(pdfPage,{bounds,scale=1,baseScale=2,signal,maxRenderPixels=4*1024*1024,reserveRender=()=>()=>{},canvasFactory,operationsFilter,paintImage,paintCapabilities,transparent=false,captureImageLayers}={}){
 if((paintImage||captureImageLayers)&&(!paintCapabilities?.simpleImagePainting||paintCapabilities.schema!=='pdf-simple-image-paint/1'))throw failure('PDF_IMAGE_PAINT_UNSUPPORTED','Native image substitution requires a certified simple PDF paint context.');
 const rect=Array.isArray(bounds)?{x:bounds[0],y:bounds[1],width:bounds[2],height:bounds[3]}:bounds;
 if(!rect||!['x','y','width','height'].every(key=>Number.isFinite(rect[key]))||rect.width<=0||rect.height<=0||!Number.isFinite(scale)||scale<=0||!Number.isFinite(baseScale)||baseScale<=0)throw failure('PDF_RENDER_BOUNDS','PDF render bounds and density must be finite and positive.');
 const width=Math.ceil(rect.width*scale),height=Math.ceil(rect.height*scale),pixels=width*height;
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||!Number.isSafeInteger(pixels)||width<1||height<1||pixels>maxRenderPixels)throw failure('PDF_RENDER_LIMIT','PDF render window exceeds its admitted pixel limit.');
 aborted(signal);const viewport=pdfPage.getViewport({scale:baseScale*scale});let scratch,output,canvas,task,answer,retained=false,released=false,layers,operatorBridge;
 const cancel=()=>task?.cancel();signal?.addEventListener('abort',cancel,{once:true});
 const release=async()=>{if(released)return;released=true;await output?.();};
 try{
  if(paintImage||captureImageLayers){operatorBridge=await createPdfRenderOperatorBridge(pdfPage,paintCapabilities,{signal});aborted(signal);}
  scratch=await reserveRender(pixels*(captureImageLayers?16:8),{width,height,page:pdfPage.pageNumber,kind:'pdf-window-scratch'});aborted(signal);
  output=await reserveRender(pixels*(captureImageLayers?16:4),{width,height,page:pdfPage.pageNumber,kind:'pdf-window-output'});aborted(signal);
  canvas=canvasFactory?canvasFactory(width,height):typeof OffscreenCanvas==='function'?new OffscreenCanvas(width,height):Object.assign(document.createElement('canvas'),{width,height});
  const context=canvas.getContext('2d',{alpha:transparent||!!captureImageLayers,willReadFrequently:true});if(!context)throw failure('PDF_RENDER_CONTEXT','PDF window rendering is unavailable.');
  const imageOperators=new Set(paintCapabilities?.imageOperators??[]);let captured=false;
  if(captureImageLayers&&(!Number.isSafeInteger(captureImageLayers.operator)||imageOperators.size!==1||!imageOperators.has(captureImageLayers.operator)))throw failure('PDF_IMAGE_LAYERS_UNSUPPORTED','Retained image layers require one certified native image operator.');
  const filter=(paintImage||captureImageLayers)?renderIndex=>{if(operationsFilter&&operationsFilter(renderIndex)===false)return false;const logical=operatorBridge.logicalImage(renderIndex),index=logical;if(logical===undefined)return true;if(captureImageLayers){if(captured)throw failure('PDF_IMAGE_LAYERS_UNSUPPORTED','A native image operator was painted more than once.');captured=true;const crop=captureImageLayers.pixelRect??{x:0,y:0,width,height};if(!crop.width||!crop.height){layers={empty:true,imageAlpha:context.globalAlpha};return false;}const prefix=context.getImageData(crop.x,crop.y,crop.width,crop.height).data,empty=context.createImageData(crop.width,crop.height),imageAlpha=context.globalAlpha;context.putImageData(empty,crop.x,crop.y);context.save();context.globalAlpha=1;context.fillStyle='white';context.fillRect(0,0,1,1);context.restore();const clip=context.getImageData(crop.x,crop.y,crop.width,crop.height).data;context.putImageData(empty,crop.x,crop.y);layers={prefix:{width:crop.width,height:crop.height,format:'rgba8',data:new Uint8Array(prefix.buffer)},clip:{width:crop.width,height:crop.height,format:'rgba8',data:new Uint8Array(clip.buffer)},crop,imageAlpha};return false;}const painted=paintImage(index,context);if(painted&&typeof painted.then==='function')throw failure('PDF_IMAGE_PAINT_ASYNC','PDF image substitution must be prepared before synchronous paint.');return painted!==true;}:operationsFilter;
  task=pdfPage.render({canvasContext:context,viewport,transform:[1,0,0,1,-rect.x*scale,-rect.y*scale],background:transparent||captureImageLayers?'rgba(0,0,0,0)':'rgb(255,255,255)',operationsFilter:filter});if(operatorBridge){operatorBridge.bind(task);await operatorBridge.ready;}await task.promise;aborted(signal);
  if(captureImageLayers){if(!layers)throw failure('PDF_IMAGE_LAYERS_UNSUPPORTED','The selected native image operator did not execute.');if(!layers.empty){const crop=layers.crop,suffix=context.getImageData(crop.x,crop.y,crop.width,crop.height).data;layers.suffix={width:crop.width,height:crop.height,format:'rgba8',data:new Uint8Array(suffix.buffer)};}}
  const rgba=context.getImageData(0,0,width,height).data,data=new Uint8Array(pixels*3);let checkpoint=performance.now();
  for(let y=0;y<height;y++){
   for(let x=0,from=y*width*4,to=y*width*3;x<width;x++,from+=4,to+=3){if(captureImageLayers){const a=rgba[from+3]/255;data[to]=Math.round(rgba[from]*a+255*(1-a));data[to+1]=Math.round(rgba[from+1]*a+255*(1-a));data[to+2]=Math.round(rgba[from+2]*a+255*(1-a));}else{data[to]=rgba[from];data[to+1]=rgba[from+1];data[to+2]=rgba[from+2];}}
   if((y&63)===63){aborted(signal);if(performance.now()-checkpoint>=8){await new Promise(resolve=>setTimeout(resolve,0));aborted(signal);checkpoint=performance.now();}}
  }
  aborted(signal);answer={pixels:{width,height,format:'rgb8',data},...(layers?{layers}:{}),bounds:{...rect},scale,viewport:{width:viewport.width,height:viewport.height,scale:baseScale*scale,rotation:viewport.rotation??pdfPage.rotate??0,transform:[...viewport.transform]},nativePdf:true,release};retained=true;
 }catch(error){if(signal?.aborted)throw signal.reason??abortReason();throw error;}finally{signal?.removeEventListener('abort',cancel);operatorBridge?.dispose();if(canvas)canvas.width=canvas.height=1;try{await scratch?.();}catch(error){await release();throw error;}finally{if(!retained)await release();}}
 try{aborted(signal);}catch(error){await release();throw error;}return answer;
}

/** A session owns its importer/artifacts until detachModel() explicitly
 * transfers them. No OCR, acquisition classification or model load is started. */
export async function createPdfReaderSession({onPage=async()=>{},onBackground=async()=>{},onProgress=()=>{},onSelection=()=>{},importerFactory=createBatchImporter,renderPage=renderPdfReaderPage,scale=2,maxRenderPixels=IMPORT_LIMITS.pixels,maxWindowPixels=4*1024*1024,reserveRender,canvasFactory,...importOptions}={}){
 const pages=[],livePages=new Map(),windowTasks=new Set(),windowOutputs=new Set(),controller=new AbortController();let model,selected=null,status='idle',active,disposed=false,disposePromise,detached=false,used=false;
 const alive=()=>{if(disposed)throw failure('DISPOSED','PDF reader session is closed.');};
 const publish=async({page,pdfPage,study,images,paintCapabilities})=>{
  aborted(controller.signal);if(paintCapabilities?.simpleImagePainting===true&&paintCapabilities.imageOperators?.length)await preparePdfRenderOperators(pdfPage,paintCapabilities,{signal:controller.signal});
  const rendered=await renderPage(pdfPage,{signal:controller.signal,scale,maxRenderPixels,reserveRender,canvasFactory});aborted(controller.signal);
  const path='pdf-reader/'+study.id+'/page-'+page+'.png';await model.artifacts.set(path,rendered.blob);
  if(controller.signal.aborted){await model.artifacts.delete(path);aborted(controller.signal);}
  const record={id:study.id+':'+page,page,studyId:study.id,study,name:study.name,width:rendered.width,height:rendered.height,backgroundPath:path,backgroundType:'image/png',...(rendered.nativeDisplay?{nativeDisplay:rendered.nativeDisplay}:{}),viewport:rendered.viewport,viewportTransform:[...rendered.viewport.transform],images,occurrences:images.flatMap(image=>image.occurrences.filter(o=>o.studyId===study.id&&o.page===page).map(occurrence=>({imageId:image.id,image,occurrence,matrix:[...occurrence.matrix],textExclusions:occurrence.textExclusions}))),textExclusions:study.pageText?.find(row=>row.page===page)?.polygons??[],textCoordinateSpace:'pdf-points',backgroundScale:scale,paintCapabilities,simpleImagePainting:paintCapabilities?.simpleImagePainting===true};
  pages.push(record);if(selected===null){selected=page;onSelection(record,{automatic:true});}
  const live={record,pdfPage,cleanPromise:null};livePages.set(page,live);
  try{await onPage(record,session);if(live.cleanPromise)await live.cleanPromise.catch(()=>{});aborted(controller.signal);}finally{livePages.delete(page);}
 };
 model=await importerFactory({...importOptions,retainPDFDocument:true,onProgress:event=>onProgress({...event,readerStatus:status}),onPage:publish});
 const session={
  get pages(){return pages;},get model(){return model;},get selectedPage(){return selected;},get state(){return status;},get signal(){return controller.signal;},
  select(page){alive();const record=pages.find(item=>item===page||item.page===page||item.id===page);if(!record)throw failure('PDF_PAGE_UNKNOWN','The requested PDF page is not available yet.');selected=record.page;onSelection(record,{automatic:false});return record;},
  async background(page=selected,{clean=false}={}){alive();const record=pages.find(item=>item===page||item.page===page||item.id===page);if(!record)throw failure('PDF_PAGE_UNKNOWN','The requested PDF page is not available yet.');const path=clean?record.cleanBackgroundPath:record.backgroundPath;if(!path)throw failure('PDF_BACKGROUND_UNAVAILABLE','The image-free page background was not prepared.');return model.artifacts.get(path);},
  renderWindow(page=selected,options={}){
   alive();const record=pages.find(item=>item===page||item.page===page||item.id===page);if(!record)throw failure('PDF_PAGE_UNKNOWN','The requested PDF page is not available yet.');
   const taskController=new AbortController(),forward=event=>taskController.abort(event.target.reason??abortReason()),signals=[controller.signal,options.signal].filter(Boolean);for(const signal of signals){signal.addEventListener('abort',forward,{once:true});if(signal.aborted)taskController.abort(signal.reason??abortReason());}
   const promise=(async()=>{try{
    aborted(taskController.signal);const document=model.getPdfDocument?.(record.studyId);if(!document)throw failure('PDF_DOCUMENT_UNAVAILABLE','The retained PDF document is unavailable.');
    const pdfPage=await document.getPage(record.page);aborted(taskController.signal);
    const answer=await renderPdfReaderWindow(pdfPage,{...options,signal:taskController.signal,baseScale:scale,paintCapabilities:record.paintCapabilities,maxRenderPixels:Math.min(maxWindowPixels,options.maxRenderPixels??maxWindowPixels),reserveRender,canvasFactory});
    const releaseOutput=answer.release;let released=false;const release=async()=>{if(released)return;released=true;windowOutputs.delete(release);await releaseOutput();};windowOutputs.add(release);
    return{...answer,page:record.page,revision:record.id+':pdf-native-v1',release};
   }finally{for(const signal of signals)signal.removeEventListener('abort',forward);}})();windowTasks.add(promise);promise.finally(()=>windowTasks.delete(promise)).catch(()=>{});return promise;
  },
  requestCleanBackground(page){
   alive();const record=pages.find(item=>item===page||item.page===page||item.id===page),live=record&&livePages.get(record.page);if(!live)throw failure('PDF_PAGE_CLOSED','Request the image-free background while the page callback is active.');if(live.cleanPromise)return live.cleanPromise;
   const omitted=[...new Set(record.occurrences.map(row=>row.occurrence.operator).filter(Number.isSafeInteger))],indices=new Set(omitted);
   live.cleanPromise=(async()=>{try{
    aborted(controller.signal);const rendered=await renderPage(live.pdfPage,{signal:controller.signal,scale,maxRenderPixels,reserveRender,canvasFactory,paintCapabilities:record.paintCapabilities,imageOperationsFilter:index=>!indices.has(index)}),path='pdf-reader/'+record.studyId+'/page-'+record.page+'-without-images.png';aborted(controller.signal);await model.artifacts.set(path,rendered.blob);if(controller.signal.aborted){await model.artifacts.delete(path);aborted(controller.signal);}
    record.cleanBackgroundPath=path;record.cleanBackground={omittedOperators:omitted,method:'pdfjs-operations-filter',textAndVectorOperationsRetained:true,compositingGuarantee:'Image paint operators omitted; this raster alone does not resolve arbitrary text/vector occlusion or blend ordering.'};await onBackground(record,session);return record;
   }catch(error){record.cleanBackgroundError={code:error.code??'PDF_BACKGROUND_RENDER',message:error.message??String(error)};throw error;}})();live.cleanPromise.catch(()=>{});return live.cleanPromise;
  },
  open(file,{signal}={}){
   alive();if(used)throw failure('PDF_SESSION_USED','Create a new reader session for a different PDF.');if(!file||!Number.isFinite(file.size)||!(/\.pdf$/i.test(file.name??'')||file.type==='application/pdf'))throw failure('PDF_FILE_REQUIRED','Select a PDF file.');
   used=true;status='importing';const cancel=()=>controller.abort(signal.reason??abortReason());signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();
   active=(async()=>{try{aborted(controller.signal);await model.import([file],controller.signal);aborted(controller.signal);status=model.errors.length?'partial':'ready';onProgress({phase:'pdf-reader-complete',pages:pages.length,errors:model.errors.length,readerStatus:status});return session;}catch(error){status=controller.signal.aborted?'cancelled':'error';throw error;}finally{signal?.removeEventListener('abort',cancel);}})();return active;
  },
  cancel(reason=abortReason()){if(disposed||!active||status!=='importing')return false;controller.abort(reason);return true;},
  detachModel(){alive();if(status==='importing')throw failure('PDF_IMPORT_BUSY','Wait for PDF import to finish before transferring its model.');if(detached)throw failure('PDF_MODEL_DETACHED','The PDF model was already transferred.');detached=true;return model;},
  dispose(){if(disposePromise)return disposePromise;disposed=true;controller.abort(abortReason());disposePromise=(async()=>{try{await active;}catch{}await Promise.allSettled([...windowTasks]);await Promise.allSettled([...windowOutputs].map(release=>release()));if(!detached){try{await model.clear();}finally{await model.artifacts.dispose?.();}}pages.length=0;selected=null;status='disposed';})();return disposePromise;}
 };
 return session;
}
