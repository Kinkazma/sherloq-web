import {createRetainedPdfReaderRenderer} from './pdf-retained-reader-renderer.js';
import {retireCompositeOwners} from './unified-engine/src/composite-owner-release.js';
import {watchCanvas2D} from './canvas-context-recovery.js';
import {diagnostic} from './runtime-context.js';
import {createPdfReaderSession} from './pdf-reader-session.js';
import {createPdfNativeRuntime} from './pdf-native-runtime.js';
import {imagePlacement} from './pdf-layout.js';
import {createPointerLoupe} from './pdf-pointer-loupe.js';
import {typingEvent} from './media-settings.js';
import {validateLoupeSettings as validateNativeLoupe,loupeMinimumZoom} from './pdf-media-settings.js';
const validateLoupeSettings=value=>validateNativeLoupe({...value,zoom:Math.max(101,value?.zoom??200)});
import {hasLoupeEffects} from './loupe-effects-settings.js';
import {bindViewerNavigation} from './viewer-input.js';
import {rasterOptions,exportPresentationRaster} from './raster-export-client.js';
import {resolveComputeProfile} from './resource-policy.js';
import {Budget} from './unified-engine/src/cache.js';

/** A PDF is a document, not the source owner of image analyses. Its import,
 * page choice and native-image effect workers have independent lifetimes. */
export async function mountPdfReader({document,parent,file,language='fr',theme='dark',computeProfile='maximum',navigationMode='auto',loupe:initialLoupe,changed=()=>{},onLoupeChange=()=>{},onEffectsState=()=>{},onPresented=()=>{},onInspect=()=>{},download,requestExport,sessionFactory=createPdfReaderSession,runtimeFactory=createPdfNativeRuntime,rendererFactory=createRetainedPdfReaderRenderer}={}){
 parent.style.display='flex';
 const root=parent.attachShadow({mode:'open'}),style=document.createElement('link');style.rel='stylesheet';style.href=new URL('./pdf-reader.css',import.meta.url).href;root.append(style);
 const el=(tag,className,text)=>{const value=document.createElement(tag);if(className)value.className=className;if(text!==undefined)value.textContent=text;return value;};
 const app=el('section','pdf-reader'),progress=el('p','pdf-reader-progress'),navigation=el('nav','pdf-reader-pages'),gallery=el('details','pdf-reader-images'),galleryTitle=el('summary'),galleryBody=el('div','pdf-reader-image-grid'),view=el('div','pdf-reader-view'),canvas=el('canvas'),empty=el('p','pdf-reader-empty'),notice=el('p','pdf-reader-notice');
 progress.id='pdf-progress';progress.setAttribute('role','status');navigation.id='pdf-pages';gallery.append(galleryTitle,galleryBody);view.tabIndex=0;view.setAttribute('role','img');view.append(canvas,empty);app.append(progress,navigation,gallery,view,notice);root.append(app);
 const pages=new Map(),images=new Map(),urls=new Set(),budget=new Budget(resolveComputeProfile(computeProfile).memoryBudgetBytes);
 let lang=language,mode=navigationMode,loupeSettings=validateLoupeSettings(initialLoupe),session,runtime,source=null,activePage=null,loading=true,exporting=false,disposed=false,frame=0,selectionSerial=0,pendingSelection=null,force=false,original=false,error=null,exportAbort=null,importPage=0,totalPages=0;
 let camera={x:0,y:0,scale:1},cameraIsFit=true;
 let presentedSource=null,presentedCamera=null,presentedNative=false;
 const pageGraphics=watchCanvas2D(canvas,{onLost:()=>diagnostic({level:'warning',kind:'pdf-reader.graphics-lost',metrics:{width:canvas.width,height:canvas.height}}),onRestored:()=>{diagnostic({level:'info',kind:'pdf-reader.graphics-restored',metrics:{width:canvas.width,height:canvas.height}});draw();}});
 const paintedPages=new Set();
 const exportLeases=new Set(),sourceLeases=new Set();let closeTask,fullyClosed=false;
 const renderer=rendererFactory({budget});
 async function retireSource(value){if(!value)return;sourceLeases.add(value);await value.close?.();sourceLeases.delete(value);}
 function retireSourceLater(value){void retireSource(value).catch(reportFailure);}
 let lastRuntimeStatus='',pointerLoupe=null;
 const text=(fr,en)=>lang==='fr'?fr:en;
 function announce(message){notice.textContent=message;changed();}
 function changedEffects(){const active=!!source&&loupeSettings.enabled&&hasLoupeEffects(loupeSettings.effects)&&!original;if(!active)runtime?.suspendEffects?.();onEffectsState({busy:active});pointerLoupe?.draw();}
 function reportFailure(value,metrics){if(disposed||value?.code==='CANCELLED'||value?.name==='AbortError')return;const failure=value instanceof Error?value:Object.assign(Error(typeof value==='string'&&value?value:'PDF rendering failed without an error message.'),{cause:value});error=failure;diagnostic({level:'error',kind:'pdf-reader.failure',error:failure,...(metrics?{metrics}:{})});onEffectsState({error:failure,busy:false});announce(failure.message);}
 function nativePreparation(){const value=runtime?.stats?.().retainedOriginal;return value?.retainedNative&&value.preparation!=='ready'&&value.preparation!=='closed'?value:null;}
 function readerStatus(){const native=nativePreparation();return error?.message??(!loading&&native?text('Préparation haute définition : ','Preparing full definition: ')+native.preparedBlocks+' / '+native.totalBlocks:progress.textContent);}
 function runtimeChanged(value){if(disposed)return;if(value?.effectsOnly){pointerLoupe?.draw();return;}if(value instanceof Error)reportFailure(value);draw();const status=readerStatus();if(status!==lastRuntimeStatus){lastRuntimeStatus=status;changed();}}
 runtime=await runtimeFactory({computeProfile,memoryBudgetBytes:budget.limit,budget,changed:runtimeChanged,onError:reportFailure});
 function effects(){
  if(!activePage||original||!loupeSettings.enabled||!hasLoupeEffects(loupeSettings.effects))return null;
  return runtime.effectsSurface(loupeSettings.effects,{force});
 }
 pointerLoupe=createPointerLoupe(view,{baseCanvas:canvas,getSurface:()=>source,getEffectsSurface:effects,getCamera:()=>presentedSource===source&&presentedCamera?presentedCamera:camera,canInteract:()=>!disposed&&!!source&&!exporting&&view.clientWidth>0&&view.clientHeight>0,getEffectsState:()=>({fullImage:runtime.stats(),force,scope:'pdf-page-composite'}),onZoom:value=>{loupeSettings=validateLoupeSettings(value);changedEffects();onLoupeChange(loupeSettings);},onPresented:value=>{onEffectsState({busy:false});diagnostic({level:'info',kind:'pdf-reader.effects-presented',metrics:{page:activePage?.page,force,effects:loupeSettings.effects,native:true,classificationApplied:false}});onPresented({...value,native:true});},onError:reportFailure,onSweepChange:changed});
 function syncPreparation(){runtime?.setPreparationActive?.(!disposed&&!document.hidden&&view.clientWidth>0&&view.clientHeight>0);}
 function paint(){
  if(disposed)return;syncPreparation();const width=view.clientWidth,height=view.clientHeight,dpr=Math.min(2,globalThis.devicePixelRatio||1);if(!width||!height)return;
  const w=Math.ceil(width*dpr),h=Math.ceil(height*dpr),context=canvas.getContext('2d');
  if(pageGraphics.lost||context.isContextLost?.()){if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}return;}
  const bounds=source?{left:-camera.x/camera.scale,top:-camera.y/camera.scale,right:(width-camera.x)/camera.scale,bottom:(height-camera.y)/camera.scale}:null,ready=source?.prepare?.(bounds,camera.scale*dpr)!==false;
  // Changing the canvas dimensions also clears its backing pixels. Keep the
  // complete native frame and its camera until all new windows are ready.
  // A newly selected page may still use its own first overview while loading.
  if(source?.nativePdf&&presentedSource===source&&presentedNative&&!ready){pointerLoupe.draw();return;}
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
  if(pageGraphics.lost||context.isContextLost?.())return;context.setTransform(dpr,0,0,dpr,0,0);context.clearRect(0,0,width,height);
  let painted=false;if(source){context.save();try{context.translate(camera.x,camera.y);context.scale(camera.scale,camera.scale);painted=source.draw(context,bounds,camera.scale*dpr)!==false;}finally{context.restore();}}
  if(pageGraphics.lost||context.isContextLost?.())return;
  presentedSource=source;presentedCamera={...camera};presentedNative=!!source?.nativePdf&&ready&&painted;
  if(source&&ready&&painted&&activePage&&!paintedPages.has(activePage.page)){paintedPages.add(activePage.page);diagnostic({level:'info',kind:'pdf-reader.page-painted',metrics:{page:activePage.page,ready:pages.size,total:totalPages,complete:!loading}});}
  empty.hidden=!!source&&painted;pointerLoupe.draw();
  if(!error)notice.textContent='';
 }
 function draw(){if(!frame&&!disposed)frame=requestAnimationFrame(()=>{frame=0;try{paint();}catch(failure){const dpr=Math.min(2,globalThis.devicePixelRatio||1);reportFailure(failure,{page:activePage?.page,viewWidth:view.clientWidth,viewHeight:view.clientHeight,dpr,cameraScale:camera.scale,cameraX:camera.x,cameraY:camera.y,samplingDensity:camera.scale*dpr,requestedWidth:Math.ceil(view.clientWidth*dpr),requestedHeight:Math.ceil(view.clientHeight*dpr),pageWidth:source?.width,pageHeight:source?.height});}});}
 function fit(){if(!source||!view.clientWidth||!view.clientHeight)return;cameraIsFit=true;const scale=Math.min(view.clientWidth/source.width,view.clientHeight/source.height)*.95;camera={scale,x:(view.clientWidth-source.width*scale)/2,y:(view.clientHeight-source.height*scale)/2};draw();changed();}
 function zoomAt(point,factor){if(!source)return;cameraIsFit=false;const scale=Math.max(.02,Math.min(64,camera.scale*factor)),ratio=scale/camera.scale;camera={scale,x:point.x-(point.x-camera.x)*ratio,y:point.y-(point.y-camera.y)*ratio};draw();changed();}
 bindViewerNavigation(view,{enabled:()=>!pointerLoupe.enabled&&!!source&&!disposed,getMode:()=>mode,pointers:true,panBy:(x,y)=>{cameraIsFit=false;camera.x+=x;camera.y+=y;draw();},zoomBy:zoomAt});
 view.addEventListener('dblclick',event=>{if(event.defaultPrevented||pointerLoupe.enabled)return;event.preventDefault();fit();});
 // Pointer capture is owned by the navigation helper. Clearing buttonless
 // movement and blur avoids a drag remaining active outside the window.
 const clearGesture=()=>{if(force){force=false;runtime.cancel();changedEffects();}};
 const keydown=event=>{if(typingEvent(event)||event.ctrlKey||event.metaKey||event.altKey)return;if(event.key==='Shift'&&pointerLoupe.enabled&&!force){force=true;runtime.cancel();changedEffects();}};
 const keyup=event=>{if(event.key==='Shift'&&force){force=false;runtime.cancel();changedEffects();}};
 const win=document.defaultView??globalThis.window;win.addEventListener('keydown',keydown);win.addEventListener('keyup',keyup);win.addEventListener('blur',clearGesture);
 const visibility=()=>{if(document.hidden){clearGesture();runtime?.suspendEffects?.();}syncPreparation();};document.addEventListener('visibilitychange',visibility);
 const resize=new ResizeObserver(()=>{syncPreparation();if(source&&cameraIsFit)fit();else draw();});resize.observe(view);style.onload=()=>fit();
 function updateProgress(){
  progress.dataset.ready=String(pages.size);progress.dataset.complete=String(!loading);
  progress.textContent=loading?text('Pages prêtes : ','Pages ready: ')+pages.size+(totalPages?' / '+totalPages:''):pages.size+text(' pages prêtes',' pages ready');
  view.setAttribute('aria-label',activePage?text('Page PDF ','PDF page ')+activePage.page:text('Page PDF','PDF page'));
  for(const button of navigation.querySelectorAll('button'))button.setAttribute('aria-current',String(Number(button.dataset.page)===activePage?.page));
  galleryTitle.textContent=text('Images incorporées','Embedded images')+' · '+images.size;
  changed();
 }
 async function selectPage(number){
  const record=pages.get(Number(number));if(!record||disposed)return false;
  if(pendingSelection?.page===record.page)return pendingSelection.promise;
  if(!pendingSelection&&source&&activePage===record)return true;
  const ticket=++selectionSerial,selection={page:record.page,promise:null};pendingSelection=selection;runtime.cancel();session.select(record.page);
  selection.promise=(async()=>{try{
   const next=await runtime.selectPage(record.id);if(disposed||ticket!==selectionSerial){await retireSource(next);return false;}
   retireSourceLater(source);source=next;activePage=record;force=false;error=null;syncPreparation();changedEffects();updateProgress();fit();return true;
  }finally{if(pendingSelection===selection)pendingSelection=null;}})();
  return selection.promise;
 }
 async function addPage(record,owner){
  if(disposed)return;session=owner;totalPages=record.study.pages;
  for(const image of record.images){
   if(images.has(image.id))continue;images.set(image.id,image);runtime.registerImage(image);
   const button=el('button','pdf-native-image'),thumb=el('img'),caption=el('span',null,image.width+' × '+image.height);button.type='button';button.dataset.nativeImage=image.id;thumb.alt='';
   if(image.thumbnail){const url=URL.createObjectURL(image.thumbnail);urls.add(url);thumb.src=url;}
   button.append(thumb,caption);button.title=text('Ouvrir cette image native pour analyse','Open this native image for analysis');button.onclick=()=>void onInspect(new File([image.blob],image.name,{type:image.blob.type||'image/png'}));galleryBody.append(button);
   // Display adjustments apply to the composed page. Scientific acquisition
   // classification is requested only by an analysis tool, never by zooming
   // or by opening a PDF for inspection.
  }
  const blob=await owner.background(record.page),placements=record.occurrences.map(item=>({imageId:item.imageId,matrix:imagePlacement(record.viewport,item.occurrence,item.image.width,item.image.height),occurrence:item.occurrence}));
  const renderWindow=typeof owner.renderWindow==='function'?request=>owner.renderWindow(record.page,request):undefined;
  runtime.registerPage({...record,blob,placements,...(renderWindow?{renderWindow}:{})});pages.set(record.page,record);
  // Request the image-free layer while PDF.js still owns this page. The full
  // page is already published; native alpha composition arrives independently.
  if(!renderWindow&&record.images.some(image=>image.hasAlpha===true||image.hasAlpha===undefined&&image.encoding!=='embedded-jpeg'))void owner.requestCleanBackground(record.page).catch(reportFailure);
  const button=el('button',null,text('Page ','Page ')+record.page);button.type='button';button.dataset.page=String(record.page);button.onclick=()=>void selectPage(record.page).catch(reportFailure);navigation.append(button);
  diagnostic({level:'info',kind:'pdf-reader.page-ready',metrics:{page:record.page,ready:pages.size,total:totalPages,complete:!loading}});updateProgress();if(!activePage)await selectPage(record.page);
 }
 function translate(){app.lang=lang;view.setAttribute('aria-label',text('Page PDF','PDF page'));navigation.setAttribute('aria-label',text('Pages prêtes','Ready pages'));empty.textContent=text('La première page apparaîtra dès qu’elle sera prête.','The first page will appear as soon as it is ready.');updateProgress();}
 app.dataset.theme=theme;translate();
 session=await sessionFactory({onPage:addPage,onBackground:async(record,owner)=>{if(disposed)return;const blob=await owner.background(record.page,{clean:true});if(!disposed){await runtime.setPageBackground(record.id,blob);draw();}},onProgress:event=>{if(disposed)return;if(Number.isFinite(event.page))importPage=event.page;if(Number.isFinite(event.pages))totalPages=event.pages;updateProgress();},reserveRender:bytes=>budget.reserve(bytes),renderPage:renderer.renderPage});
 const completion=session.open(file).catch(reportFailure).finally(()=>{loading=false;diagnostic({level:'info',kind:'pdf-reader.import-finished',metrics:{ready:pages.size,total:totalPages,state:session.state}});updateProgress();});
 async function selectedFile(){const page=activePage;if(!page||disposed)return null;const blob=await session.background(page.page);if(disposed)return null;return new File([blob],file.name.replace(/\.pdf$/i,'')+'-p'+page.page+'.png',{type:'image/png'});}
 async function exportImage(settings){
  if(!source||exporting||disposed)return;
  const page=activePage,pageName=file.name.replace(/\.pdf$/i,'')+'-p'+page.page;
  let lease;try{const target=effects()??source;lease=runtime.rasterSource?.(target)??target.fork?.()??target;}catch(value){reportFailure(value);return;}
  const dimensions={width:lease.width,height:lease.height};exportLeases.add(lease);
  const execute=async value=>{
   if(disposed)return;exportAbort=new AbortController();exporting=true;changed();let output;
   try{const options=rasterOptions(value);output=await exportPresentationRaster(lease,options,{signal:exportAbort.signal,reserve:bytes=>budget.reserve(bytes)});await download(output,'SHERLOQ-'+pageName+'.'+options.format,{signal:exportAbort.signal});output=null;}
   catch(value){await retireCompositeOwners([()=>output?.cleanup?.()],{primary:value});reportFailure(value);}
   finally{exporting=false;exportAbort=null;changed();}
  };
  try{return settings?await execute(settings):await requestExport(execute,dimensions);}
  finally{await lease.close?.();exportLeases.delete(lease);}
 }

 return {kind:'pdf',capabilities:{imageExport:true,session:false,report:false},completion,get importing(){return loading;},get busy(){return exporting;},get readyPages(){return pages.size;},get selectedPage(){return activePage?.page;},snapshot(){return{status:readerStatus(),progress:loading?totalPages?pages.size/totalPages:null:nativePreparation()?nativePreparation().preparedBlocks/nativePreparation().totalBlocks:1,zoom:Math.round(camera.scale*100),hasResult:!!source,hasReport:false,busy:exporting,importing:loading,pdf:true,readyPages:pages.size,selectedPage:activePage?.page};},selectedFile,selectPage,exportImage,exportSize:()=>!source||disposed?null:runtime.exportSize?.()??{width:source.width,height:source.height},fit,zoomBy:factor=>zoomAt({x:view.clientWidth/2,y:view.clientHeight/2},factor),activate(){syncPreparation();draw();},
  setLanguage(value){lang=value;translate();},setTheme(value){app.dataset.theme=value;draw();},setNavigation(value){mode=value;},setComputeProfile(value){computeProfile=value;budget.setLimit(resolveComputeProfile(value).memoryBudgetBytes);},setHighlight(){},
  setLoupe(value){loupeSettings=validateLoupeSettings(value);if(!loupeSettings.enabled)force=false;pointerLoupe.set(loupeSettings);changedEffects();},loupeMinimum:()=>source?loupeMinimumZoom(loupeSettings,Math.min(view.clientWidth/source.width,view.clientHeight/source.height)*.95):2,pinLoupe:value=>pointerLoupe.pin(value),loupeAnchor:()=>{const p=pointerLoupe.diagnostics().pointer,r=view.getBoundingClientRect();return p?{x:r.left+p.x,y:r.top+p.y}:null;},loupeKeydown:event=>pointerLoupe.keydown(event),loupePresentationIdentity:()=>pointerLoupe.presentationIdentity(),loupeDiagnostics:()=>({...pointerLoupe.diagnostics(),force,readyPages:pages.size,selectedPage:activePage?.page,runtime:runtime.stats()}),toggleLoupeSweep:group=>pointerLoupe.toggleSweep(group),stopLoupeSweep:()=>pointerLoupe.stopSweep(),loupeSweepState:()=>pointerLoupe.sweeping,setCompareOriginal(value){original=!!value;changedEffects();},
  dispose(){if(fullyClosed)return Promise.resolve();if(closeTask)return closeTask;if(!disposed){disposed=true;pageGraphics.dispose();exportAbort?.abort();session.cancel();pointerLoupe.dispose();resize.disconnect();cancelAnimationFrame(frame);win.removeEventListener('keydown',keydown);win.removeEventListener('keyup',keyup);win.removeEventListener('blur',clearGesture);document.removeEventListener('visibilitychange',visibility);if(source)sourceLeases.add(source);source=null;}closeTask=(async()=>{await completion.catch(()=>{});await retireCompositeOwners([...sourceLeases].map(value=>()=>retireSource(value)));await retireCompositeOwners([...exportLeases].map(value=>async()=>{await value.close?.();exportLeases.delete(value);}));await runtime.dispose();await renderer.close();await session.dispose();for(const url of urls)URL.revokeObjectURL(url);urls.clear();pages.clear();images.clear();canvas.width=canvas.height=1;app.remove();style.remove();fullyClosed=true;})();closeTask.then(()=>{},()=>{closeTask=null;});return closeTask;}
 };
}
