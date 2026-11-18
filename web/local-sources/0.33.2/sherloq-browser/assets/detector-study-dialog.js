const PDF_URL='https://raw.githubusercontent.com/Kinkazma/sherloq-web/main/examples/studies/six-ai-detectors/Comparative%20evaluation%20of%20AI-generated%20image%20detectors%20%E2%80%93%20DDA%20-%20GAPL%20-%20SPAI%20-%20PRL%20-%20Community%20Forensics%20384%20-%20B-Free.pdf';
const GITHUB_URL=PDF_URL.replace('raw.githubusercontent.com/Kinkazma/sherloq-web/main/','github.com/Kinkazma/sherloq-web/blob/main/');
const MAX_PAGE_PIXELS=8*1024*1024,MAX_TOTAL_PIXELS=16*1024*1024,MAX_CANVASES=4,MAX_SIDE=8192,PAD=12,GAP=16,sessions=new WeakMap();
let libraryPromise,serial=0;
const copy={fr:{title:'Étude Sherloq · 5 novembre 2026 · 666 fichiers',close:'Fermer',previous:'Précédent',next:'Suivant',page:'Page',loading:'Chargement…',error:'Le PDF ne peut pas être affiché.',github:'Voir sur GitHub'},en:{title:'Sherloq study · 5 November 2026 · 666 files',close:'Close',previous:'Previous',next:'Next',page:'Page',loading:'Loading…',error:'The PDF could not be displayed.',github:'View on GitHub'}};
function library(){return libraryPromise??=import('./pdf-native-library.js?v=0.33.2').catch(error=>{libraryPromise=null;throw error;});}
function style(document){if(document.querySelector('link[data-detector-study-dialog]'))return;const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('./detector-study-dialog.css?v=0.33.2',import.meta.url).href;link.dataset.detectorStudyDialog='';(document.head??document.documentElement).append(link);}
const cancelled=()=>Object.assign(Error('PDF dialog closed.'),{name:'AbortError',code:'CANCELLED'});

// The reader owns one PDF transport and bounded, demand-rendered page canvases.
// It never creates an analysis source, document workspace or export object.
export function openDetectorStudyDialog({document=globalThis.document,language='fr',opener}={}){
 if(!document?.createElement)throw new TypeError('A document is required.');
 const previous=sessions.get(document);
 if(previous&&!previous.closing){previous.dialog.focus({preventScroll:true});return previous.api;}
 const text=copy[language==='en'?'en':'fr'],view=document.defaultView??globalThis,focusTarget=opener??document.activeElement;
 const node=(tag,value,className)=>{const element=document.createElement(tag);if(value!==undefined)element.textContent=value;if(className)element.className=className;return element;};
 const dialog=node('dialog',undefined,'detector-study-dialog'),heading=node('h2',text.title),header=node('header'),closeButton=node('button',text.close),navigation=node('nav'),previousButton=node('button',text.previous),nextButton=node('button',text.next),pageLabel=node('label',text.page),pageNumber=node('input'),pageCount=node('span',' / —'),status=node('p',text.loading,'detector-study-dialog-status'),content=node('div',undefined,'detector-study-dialog-page'),pagesHost=node('div',undefined,'detector-study-dialog-pages'),fallback=node('a',text.github);
 const titleId='detector-study-title-'+(++serial);heading.id=titleId;dialog.setAttribute('aria-labelledby',titleId);dialog.setAttribute('tabindex','-1');
 for(const button of [closeButton,previousButton,nextButton])button.type='button';
 pageNumber.type='number';pageNumber.min='1';pageNumber.step='1';pageNumber.value='1';pageNumber.setAttribute('aria-label',text.page);pageNumber.inputMode='numeric';
 navigation.setAttribute('aria-label',text.page);pageLabel.append(' ',pageNumber,pageCount);navigation.append(previousButton,pageLabel,nextButton);header.append(heading,closeButton);
 status.setAttribute('role','status');fallback.href=GITHUB_URL;fallback.target='_blank';fallback.rel='noopener noreferrer';fallback.hidden=true;
 content.append(pagesHost);dialog.append(header,navigation,status,fallback,content);
 let pdf=null,worker=null,loadingTask=null,renderTask=null,renderingPage=null,renderTail=Promise.resolve(),renderVersion=0,layoutVersion=0,wantedPage=1,resizeObserver,frame=0,closeTask;
 let zoom=.5,cssScale=1,observedWidth=0,observedDpr=0,requestedKey='',gestureActive=false,safariGesture=null,safariUntil=0,gestureTimer=0;
 const pages=[];
 let readyResolve,readyReject,closedResolve;const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});ready.catch(()=>{});
 const closed=new Promise(resolve=>{closedResolve=resolve;});const state={dialog,closing:false,closed,api:null};
 const nav=()=>{previousButton.disabled=!pages.length||wantedPage<=1;nextButton.disabled=!pages.length||wantedPage>=pages.length;pageNumber.disabled=!pages.length;pageNumber.value=String(wantedPage);};nav();
 const now=()=>view.performance?.now?.()??Date.now();
 function showError(error){if(state.closing)return;status.textContent=text.error;fallback.hidden=false;readyReject(error);}
 function releasePage(record){
  if(record.canvas){record.canvas.width=record.canvas.height=1;record.canvas.remove();record.canvas=null;}record.renderedKey='';
  record.pdfPage?.cleanup();record.pdfPage=null;
 }
 function point(event){const box=content.getBoundingClientRect();return{x:Number.isFinite(event?.clientX)&&event.clientX>=box.left&&event.clientX<=box.right?event.clientX:box.left+box.width/2,y:Number.isFinite(event?.clientY)&&event.clientY>=box.top&&event.clientY<=box.bottom?event.clientY:box.top+box.height/2};}
 function captureAnchor(position=point()){
  if(!pages.length)return null;let selected=pages[0],distance=Infinity;
  for(const record of pages){const box=record.element.getBoundingClientRect(),d=position.y<box.top?box.top-position.y:position.y>box.bottom?position.y-box.bottom:0;if(d<distance){selected=record;distance=d;}}
  const box=selected.element.getBoundingClientRect();return{record:selected,u:(position.x-box.left)/cssScale,v:(position.y-box.top)/cssScale,x:position.x,y:position.y};
 }
 function updateCurrent(){
  if(!pages.length)return;const middle=content.scrollTop+content.clientHeight/2;
  let nearest=pages[0],distance=Infinity;
  for(const record of pages){const d=middle<record.top?record.top-middle:middle>record.top+record.height?middle-record.top-record.height:0;if(d<distance){nearest=record;distance=d;}}
  wantedPage=nearest.number;nav();
 }
 function layout(anchor){
  if(!pages.length)return;const width=content.clientWidth||Math.min(view.innerWidth||800,1000),largest=Math.max(...pages.map(p=>p.width));
  cssScale=Math.max(1,width-2*PAD)/largest*zoom;const stageWidth=Math.max(width,largest*cssScale+2*PAD);let top=PAD;
  for(const record of pages){record.top=top;record.height=record.unitHeight*cssScale;const pageWidth=record.width*cssScale;Object.assign(record.element.style,{left:(stageWidth-pageWidth)/2+'px',top:top+'px',width:pageWidth+'px',height:record.height+'px'});top+=record.height+GAP;}
  pagesHost.style.width=stageWidth+'px';pagesHost.style.height=(top-GAP+PAD)+'px';layoutVersion++;
  if(anchor){const box=anchor.record.element.getBoundingClientRect();content.scrollLeft+=box.left+anchor.u*cssScale-anchor.x;content.scrollTop+=box.top+anchor.v*cssScale-anchor.y;}
  updateCurrent();
 }
 function selection(){
  const top=content.scrollTop,bottom=top+content.clientHeight,middle=(top+bottom)/2;
  const distance=p=>Math.abs(p.top+p.height/2-middle),visible=pages.filter(p=>p.top<bottom&&p.top+p.height>top).sort((a,b)=>distance(a)-distance(b));
  const selected=visible.slice(0,MAX_CANVASES);
  // Keep one neighbour ready when a single page fills the viewport.
  for(const record of [...pages].sort((a,b)=>distance(a)-distance(b))){if(selected.length>=Math.max(2,Math.min(MAX_CANVASES,visible.length)))break;if(!selected.includes(record))selected.push(record);}
  return selected;
 }
 function requestRender(){
  if(state.closing||!pages.length||gestureActive)return;
  const selected=selection(),budget=Math.min(MAX_PAGE_PIXELS,Math.floor(MAX_TOTAL_PIXELS/Math.max(1,selected.length))),dpr=Math.max(1,Number(view.devicePixelRatio)||1),key=layoutVersion+':'+dpr+':'+selected.map(p=>p.number).join(',');
  if(key===requestedKey)return;requestedKey=key;const version=++renderVersion;
  if(renderingPage&&!selected.includes(renderingPage))renderTask?.cancel();
  const request=renderTail.catch(()=>{}).then(async()=>{
   if(state.closing||gestureActive||version!==renderVersion)return;
   // Account existing backing stores before any new allocation. Resizing is
   // always through1x1, so width/height setters cannot transiently over-allocate.
   for(const record of pages)if(!selected.includes(record)||record.canvas&&record.canvas.width*record.canvas.height>budget)releasePage(record);
   for(const record of selected){
    if(state.closing||gestureActive||version!==renderVersion)return;
    const scale=Math.min(cssScale*dpr,Math.sqrt(budget/(record.width*record.unitHeight)),MAX_SIDE/record.width,MAX_SIDE/record.unitHeight),pixelWidth=Math.max(1,Math.floor(record.width*scale)),pixelHeight=Math.max(1,Math.floor(record.unitHeight*scale)),renderKey=pixelWidth+':'+pixelHeight;
    if(record.canvas&&record.renderedKey===renderKey)continue;
    const page=await pdf.getPage(record.number);
    if(state.closing||gestureActive||version!==renderVersion){page.cleanup();return;}record.pdfPage=page;
    if(!record.canvas){record.canvas=node('canvas');record.canvas.setAttribute('aria-label',text.page+' '+record.number);record.element.append(record.canvas);}
    const canvas=record.canvas;canvas.width=canvas.height=1;canvas.width=pixelWidth;canvas.height=pixelHeight;record.renderedKey='';
    const context=canvas.getContext('2d',{alpha:false});if(!context)throw Error('PDF canvas is unavailable.');
    const task=page.render({canvasContext:context,viewport:page.getViewport({scale}),background:'rgb(255,255,255)',annotationMode:0});renderTask=task;renderingPage=record;
    try{await task.promise;record.renderedKey=renderKey;if(!state.closing){status.textContent='';fallback.hidden=true;readyResolve({pages:pages.length});}}
    finally{if(renderTask===task){renderTask=null;renderingPage=null;}}
   }
  });renderTail=request;request.catch(error=>{if(!state.closing&&error?.name!=='RenderingCancelledException')showError(error);});
 }
 function schedule(){if(state.closing||frame)return;frame=view.requestAnimationFrame(()=>{frame=0;updateCurrent();requestRender();});}
 function goTo(number){if(!pages.length||state.closing)return;wantedPage=Math.max(1,Math.min(pages.length,Math.trunc(Number(number))||1));nav();content.scrollTop=Math.max(0,pages[wantedPage-1].top-PAD);requestedKey='';schedule();}
 // Preserve Root's width/DPR-only admission. Height/status/scroll changes are
 // not fit changes and never restart an otherwise identical page render.
 const resize=()=>{const width=content.clientWidth,dpr=Number(view.devicePixelRatio)||1;if(state.closing||width===observedWidth&&dpr===observedDpr)return;const anchor=captureAnchor();observedWidth=width;observedDpr=dpr;layout(anchor);requestedKey='';schedule();};
 function finishGesture(){if(state.closing)return;clearTimeout(gestureTimer);gestureTimer=0;if(safariGesture)return;gestureActive=false;requestedKey='';schedule();}
 function zoomTo(value,anchor){
  if(state.closing||!pages.length)return;const next=Math.max(.5,Math.min(5,value));if(next===zoom)return;
  gestureActive=true;zoom=next;layout(anchor);renderVersion++;requestedKey='';
 }
 const wheel=event=>{
  event.stopPropagation();
  if(event.ctrlKey){event.preventDefault();if(safariGesture||now()<safariUntil)return;const unit=event.deltaMode===1?16:event.deltaMode===2?content.clientHeight:1;zoomTo(zoom*Math.exp(Math.max(-1,Math.min(1,-event.deltaY*unit*.002))),captureAnchor(point(event)));clearTimeout(gestureTimer);gestureTimer=view.setTimeout(finishGesture,140);}
  else if(!content.contains(event.target)){event.preventDefault();const unit=event.deltaMode===1?16:event.deltaMode===2?content.clientHeight:1;content.scrollTop+=event.deltaY*unit;content.scrollLeft+=event.deltaX*unit;schedule();}
 };
 const gestureStart=event=>{event.preventDefault();event.stopPropagation();clearTimeout(gestureTimer);gestureTimer=0;gestureActive=true;safariUntil=now()+160;safariGesture={baseZoom:zoom,anchor:captureAnchor(point(event))};};
 const gestureChange=event=>{event.preventDefault();event.stopPropagation();if(!safariGesture)return;const scale=Number(event.scale);if(Number.isFinite(scale)&&scale>0)zoomTo(safariGesture.baseZoom*scale,safariGesture.anchor);};
 const gestureEnd=event=>{event.preventDefault();event.stopPropagation();safariGesture=null;safariUntil=now()+160;finishGesture();};
 function close(){
  if(state.closing)return closeTask??closed;
  state.closing=true;renderVersion++;renderTask?.cancel();readyReject(cancelled());clearTimeout(gestureTimer);resizeObserver?.disconnect();view.removeEventListener?.('resize',resize);if(frame)view.cancelAnimationFrame(frame);
  const retiringLoader=loadingTask;let loadingRetirement;try{loadingRetirement=Promise.resolve(retiringLoader?.destroy());}catch(error){loadingRetirement=Promise.reject(error);}loadingRetirement.catch(()=>{});
  closeTask=Promise.resolve().then(async()=>{
   const errors=[];try{await renderTail;}catch{}
   for(const record of pages)try{releasePage(record);}catch(error){errors.push(error);}
   try{await loadingRetirement;}catch(error){errors.push(error);}
   if(!retiringLoader)try{await pdf?.destroy();}catch(error){errors.push(error);}pdf=null;loadingTask=null;
   try{await worker?.destroy();}catch(error){errors.push(error);}worker=null;
   dialog.remove();if(sessions.get(document)===state)sessions.delete(document);
   if(focusTarget?.isConnected&&focusTarget.ownerDocument===document)try{focusTarget.focus({preventScroll:true});}catch{}
   closedResolve();if(errors.length)throw new AggregateError(errors,'PDF dialog cleanup failed.');
  });closeTask.catch(()=>{});if(dialog.open)dialog.close();else dialog.remove();return closeTask;
 }
 const ignoreKeys=event=>event.stopPropagation();dialog.addEventListener('keydown',ignoreKeys);dialog.addEventListener('keyup',ignoreKeys);
 dialog.addEventListener('wheel',wheel,{passive:false});dialog.addEventListener('gesturestart',gestureStart,{passive:false});dialog.addEventListener('gesturechange',gestureChange,{passive:false});dialog.addEventListener('gestureend',gestureEnd,{passive:false});content.addEventListener('scroll',schedule,{passive:true});
 dialog.addEventListener('cancel',()=>{void close();});dialog.addEventListener('close',()=>{void close();});closeButton.addEventListener('click',()=>{void close();});
 previousButton.addEventListener('click',()=>goTo(wantedPage-1));nextButton.addEventListener('click',()=>goTo(wantedPage+1));pageNumber.addEventListener('change',()=>goTo(pageNumber.value));
 state.api={dialog,close,ready};sessions.set(document,state);style(document);
 void(async()=>{
  try{
   if(previous)await previous.closed;if(state.closing)return;
   (document.body??document.documentElement).append(dialog);dialog.showModal();
   const pdfjs=await library();if(state.closing)return;pdfjs.GlobalWorkerOptions.workerSrc=new URL('./batch-vendor/pdf.worker.mjs',import.meta.url).href;worker=new pdfjs.PDFWorker({name:titleId});
   const task=pdfjs.getDocument({url:PDF_URL,worker,ownerDocument:document,withCredentials:false,isEvalSupported:false,useWasm:false,useSystemFonts:true,disableFontFace:true,disableAutoFetch:true,canvasMaxAreaInBytes:MAX_PAGE_PIXELS*4});loadingTask=task;
   const loaded=await task.promise;if(state.closing){await loaded.destroy();return;}pdf=loaded;pageCount.textContent=' / '+pdf.numPages;pageNumber.max=String(pdf.numPages);
   // Page metadata establishes continuous geometry. No operator list, text
   // extraction or raster is requested for the distant pages.
   for(let number=1;number<=pdf.numPages;number++){
    const page=await pdf.getPage(number);if(state.closing){page.cleanup();return;}const unit=page.getViewport({scale:1});page.cleanup();
    if(!Number.isFinite(unit.width)||!Number.isFinite(unit.height)||unit.width<=0||unit.height<=0)throw Error('Invalid PDF page dimensions.');
    const element=node('section',undefined,'detector-study-dialog-sheet');element.dataset.page=String(number);element.setAttribute('aria-label',text.page+' '+number);pagesHost.append(element);pages.push({number,element,width:unit.width,unitHeight:unit.height,top:0,height:0,canvas:null,pdfPage:null,renderedKey:''});
   }
   observedWidth=content.clientWidth;observedDpr=Number(view.devicePixelRatio)||1;layout();nav();
   if(typeof view.ResizeObserver==='function'){resizeObserver=new view.ResizeObserver(resize);resizeObserver.observe(content);}view.addEventListener?.('resize',resize);schedule();
  }catch(error){showError(error);}
 })();
 return state.api;
}
