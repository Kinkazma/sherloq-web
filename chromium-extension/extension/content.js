(() => {
  const prepareOnly = globalThis.__sherloqPrepareOnly; delete globalThis.__sherloqPrepareOnly;
  if (globalThis.__sherloqContent) { if (!prepareOnly) globalThis.__sherloqContent.toggle(); return; }
  let keyLibrary, appearanceLibrary, geometryLibrary, sizingLibrary, requested=false,activating=false,stateVersion=0;
  const heldAdjustments=new Set();
  const imageKeys=new WeakMap(),warming=new Map();let keySerial=0,neighbors=[],warmEpoch=0;
  const cache = new WeakMap();
  const modules = Promise.all([import(chrome.runtime.getURL('candidates.js')), import(chrome.runtime.getURL('shortcuts.js')), import(chrome.runtime.getURL('settings.js')), import(chrome.runtime.getURL('geometry.js')),import(chrome.runtime.getURL('loupe-screen.js'))]).then(value=>{keyLibrary=value[1];appearanceLibrary=value[2];geometryLibrary=value[3];sizingLibrary=value[4];return value;});
  const send = async message => { const r = await chrome.runtime.sendMessage(message); if (!r?.ok) throw Error(r?.error || 'Extension indisponible.'); return r.value; };
  let active = false, host, root, iframe, port, current = null, selection = null, job = null, lastBlob=null, serial = 0, label, panel = false, prefs, resolveReady, ready, heldOriginal, panelRect,connectRenderer,panelOpening=false,modalActive=false;
  const text = (fr, en) => prefs?.language === 'en' || prefs?.language === 'auto' && !navigator.language.startsWith('fr') ? en : fr;
  const pointer = {x: innerWidth / 2, y: innerHeight / 2};
  async function candidates(image) {
    const [library] = await modules, value = library.imageCandidates(image);
    if (value.linkedPage) try { const page = await send({type: 'linked-html', url: value.linkedPage}); value.candidates.unshift(...library.linkedPageCandidates(page.html, page.url)); } catch {}
    return value;
  }
  const controlSelector='button,input,select,textarea,option,optgroup,label,summary,[contenteditable]:not([contenteditable=false]),[role=button],[role=menu],[role=menubar],[role=menuitem],[role=menuitemcheckbox],[role=menuitemradio],[role=combobox],[role=listbox],[role=option],[role=tab],[role=checkbox],[role=radio],[role=switch],[role=slider],[role=spinbutton],[aria-haspopup],[aria-expanded]';
  function pageControl(event){const path=event.composedPath();if(path.some(node=>node?.matches?.(controlSelector)))return true;
    const link=path.find(node=>node?.matches?.('a[href],[role=link]'));
    return !!link&&(!path.some(node=>node?.tagName==='IMG'||node?.tagName?.toLowerCase()==='image')&&!(event.type.startsWith('key')&&current&&link.contains(current))||!!link.closest('nav,[role=toolbar]'));
  }
  function panelPointer(){if(!iframe)return;iframe.style.pointerEvents=modalActive?'auto':panel&&panelRect&&pointer.x>=panelRect.x&&pointer.x<=panelRect.x+panelRect.width&&pointer.y>=panelRect.y&&pointer.y<=panelRect.y+panelRect.height?'auto':'none';}
  function findImage(x, y) {
    for (const node of document.elementsFromPoint(x, y)) {
      if (node === host || node.tagName === 'IFRAME') continue;
      if ((node.tagName === 'IMG' || node.tagName.toLowerCase() === 'image' || node.tagName==='VIDEO'&&node.paused&&node.readyState>=2) && (!node.checkVisibility || node.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}))) return node;
    }
    return null;
  }
  const imageKey=image=>{if(!imageKeys.has(image))imageKeys.set(image,String(++keySerial));return imageKeys.get(image);};
  function imageLayout(image){const r=image.getBoundingClientRect(),s=getComputedStyle(image);return {key:imageKey(image),rect:{x:r.x,y:r.y,width:r.width,height:r.height},style:{fit:s.objectFit,position:s.objectPosition,border:['Top','Right','Bottom','Left'].map(k=>parseFloat(s['border'+k+'Width'])||0),padding:['Top','Right','Bottom','Left'].map(k=>parseFloat(s['padding'+k])||0)}};}
  function geometry(){
    if(!current?.isConnected){port?.postMessage({type:'leave',selection,blob:lastBlob});return;}
    port?.postMessage({type:'geometry',dpr:devicePixelRatio,space:sizingLibrary.overlayLoupeSpace(),...imageLayout(current),neighbors:neighbors.filter(image=>image.isConnected&&cache.get(image)?.complete).map(image=>({...imageLayout(image),id:cache.get(image).result.id})),pointer});
  }
  async function warmNeighbors(image){
    const epoch=++warmEpoch;if(job&&job.width*job.height*8>128*1024**2){neighbors=[];geometry();return;}neighbors=geometryLibrary.nearestImages(image,[...document.images]);geometry();
    for(const adjacent of neighbors){
      if(!active||epoch!==warmEpoch)return;
      const [library]=await modules,signature=JSON.stringify(library.imageCandidates(adjacent)),cached=cache.get(adjacent);
      if(cached?.complete&&cached.signature===signature&&Date.now()-cached.time<5*60_000)continue;
      // No whole-page download: at most three visible neighbours, one at a time.
      if(!warming.has(adjacent))warming.set(adjacent,(async()=>{
        const value=await candidates(adjacent),remote=value.candidates.filter(c=>!/^(blob:|data:)/.test(c.url));
        if(!remote.length)return;
        const result=await send({type:'prepare-image',warm:imageKey(adjacent),selection:{...value,candidates:remote}});
        cache.set(adjacent,{signature,result,time:Date.now(),complete:true});
      })().catch(()=>{}).finally(()=>warming.delete(adjacent)));
      await warming.get(adjacent);if(active&&epoch===warmEpoch)geometry();
    }
    if(active&&epoch===warmEpoch)geometry();
  }
  function targetImage(x,y){
    const direct=findImage(x,y);if(direct&&direct!==current)return direct;
    if(!current?.isConnected)return null;
    const settings=prefs.loupe,shape=sizingLibrary.resolveLoupeGeometry(settings,sizingLibrary.overlayLoupeSpace());
    const layout=imageLayout(current),natural=job||{width:current.videoWidth||current.naturalWidth||current.width,height:current.videoHeight||current.naturalHeight||current.height},g=geometryLibrary.imageGeometry(layout.rect,natural,layout.style);
    if(direct===current&&x>=Math.max(g.x,g.clip.x)&&x<=Math.min(g.x+natural.width*g.sx,g.clip.x+g.clip.width)&&y>=Math.max(g.y,g.clip.y)&&y<=Math.min(g.y+natural.height*g.sy,g.clip.y+g.clip.height))return current;
    const cy=g.y+(y-g.y)*(1-g.sx/g.sy),left=Math.max(g.x,g.clip.x),top=Math.max(cy,g.clip.y),right=Math.min(g.x+natural.width*g.sx,g.clip.x+g.clip.width),bottom=Math.min(cy+natural.height*g.sx,g.clip.y+g.clip.height);
    const coverage=geometryLibrary.loupeImageCoverage({x:left,y:top,width:right-left,height:bottom-top},{x,y},{diameter:shape.diameter,transition:shape.transition,relativeZoom:Math.max(101,settings.zoom)/100});
    return coverage>=.25-1e-6?current:null;
  }
  async function show(result, token, image, signature) {
    await ready;if(!active||token!==serial||job&&job.width*job.height>result.width*result.height)return;
    if(job?.id===result.id&&job.width===result.width&&job.height===result.height)return;
    job=result;cache.set(image,{signature,result,time:Date.now(),complete:false});
    port.postMessage({type:'job',id:job.id,key:imageKey(image)});geometry();
    label.textContent=result.width+' × '+result.height+(result.reason==='displayed-source'||result.reason==='src'?text(' · source disponible',' · available source'):text(' · source retenue',' · selected source'));
  }
  let currentSignature,geometryFrame=0;
  const scheduleGeometry=()=>{if(!geometryFrame)geometryFrame=requestAnimationFrame(()=>{geometryFrame=0;if(active)geometry();});};
  async function select(image) {
    const previous=!image&&current?{selection,blob:lastBlob}:null;const token=++serial;current=image;selection=null;job=null;lastBlob=null;
    if(image&&!panel&&!modalActive)focusRenderer();
    await send({type:'cancel-image'}).catch(()=>{});if(!active||token!==serial)return;
    if(!image){port?.postMessage({type:'leave',...previous});label.textContent=text('Survolez une image.','Move over an image.');return;}
    if(image.tagName==='VIDEO'){
      neighbors=[];const videoTime=image.currentTime,signature='video:'+videoTime;selection={name:'video-'+videoTime.toFixed(3)+'s.png',reason:'video-frame',videoTime,sourcePage:location.href,url:image.currentSrc,candidates:[]};currentSignature=signature;port?.postMessage({type:'pending',key:imageKey(image)});geometry();label.textContent=text('Préparation de l’image vidéo…','Preparing video frame…');
      try{if(!image.paused||image.readyState<2)throw Error(text('Mettez la vidéo en pause.','Pause the video.'));const width=image.videoWidth,height=image.videoHeight;if(!width||!height||width*height>100_000_000)throw Error(text('Dimensions vidéo non prises en charge.','Unsupported video dimensions.'));const canvas=new OffscreenCanvas(width,height),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);const blob=await canvas.convertToBlob({type:'image/png'});lastBlob=blob;canvas.width=canvas.height=1;await ready;if(!active||token!==serial||image.currentTime!==videoTime||!image.paused)return;port.postMessage({type:'blob-image',blob,key:imageKey(image),token,name:'video-'+videoTime.toFixed(3)+'s.png',reason:'video-frame',videoTime,sourcePage:location.href,url:image.currentSrc});geometry();}
      catch(error){if(active&&token===serial)label.textContent=error.name==='SecurityError'?text('Le lecteur interdit l’accès aux pixels de cette vidéo.','This player blocks access to video pixels.'):error.message;}
      finally{if(active&&token===serial)port?.postMessage({type:'resolution-complete'});}return;
    }
    const [library]=await modules,value=library.imageCandidates(image),signature=JSON.stringify(value);selection=value;currentSignature=signature;
    neighbors=neighbors.filter(adjacent=>adjacent!==image);port?.postMessage({type:'pending',key:imageKey(image)});port?.postMessage({type:'source-candidates',candidates:value.candidates.map(v=>v.url===value.displayedURL?{...v,width:image.naturalWidth||image.width,height:image.naturalHeight||image.height}:v)});geometry();
    const cached=cache.get(image);
    if(cached?.complete&&cached.signature===signature&&Date.now()-cached.time<5*60_000){await show(cached.result,token,image,signature);cache.set(image,cached);port.postMessage({type:'resolution-complete'});void warmNeighbors(image);return;}
    label.textContent=text('Recherche de l’original…','Finding original…');
    const prepare=async (source,preview=false)=>{
      const remote=source.candidates.filter(c=>!/^(blob:|data:)/.test(c.url));if(!remote.length)return;
      const result=await send({type:'prepare-image',token,preview,selection:{...source,candidates:remote}});
      if(active&&token===serial)await show(result,token,image,signature);
    };
    try{
      const displayed=value.candidates.find(c=>c.url===value.displayedURL),inline=value.candidates.find(c=>/^(blob:|data:)/.test(c.url));
      // Transfer the browser's already decoded source without resizing. Tainted cross-origin
      // bitmaps cannot be transferred by Chromium: in that case recover the exact source file.
      const pageBitmap=(async()=>{let bitmap;try{bitmap=await createImageBitmap(image);if(bitmap.width*bitmap.height>100_000_000){bitmap.close();return false;}await ready;if(!active||token!==serial){bitmap.close();return false;}port.postMessage({type:'page-bitmap',bitmap,key:imageKey(image),token,name:value.name||'image-page'},[bitmap]);geometry();return true;}catch{bitmap?.close();return false;}})();
      const preview=pageBitmap.then(ok=>!ok&&displayed&&!/^(blob:|data:)/.test(displayed.url)?prepare({...value,candidates:[displayed]},true).catch(()=>{}):undefined);
      if(inline){const response=await fetch(inline.url),blob=await response.blob();lastBlob=blob;if(blob.size>256*1024**2)throw Error('Image supérieure à 256 Mio.');await ready;if(!active||token!==serial)return;port.postMessage({type:'blob-image',blob,key:imageKey(image),token,name:value.name,sourcePage:value.sourcePage});geometry();}
      if(value.linkedPage)try{const page=await send({type:'linked-html',url:value.linkedPage});value.candidates.unshift(...library.linkedPageCandidates(page.html,page.url));}catch{}
      if(!active||token!==serial)return;
      selection=value;port?.postMessage({type:'source-candidates',candidates:value.candidates.map(v=>v.url===value.displayedURL?{...v,width:image.naturalWidth||image.width,height:image.naturalHeight||image.height}:v)});const originals={...value,candidates:value.candidates.filter(c=>c!==displayed)};
      const failure=await prepare(originals).then(()=>null,error=>error);await preview;
      if(!job){if(await pageBitmap)await prepare(value);else if(failure)throw failure;}
      if(active&&token===serial&&job)cache.set(image,{signature,result:job,time:Date.now(),complete:true});
    }catch(error){if(active&&token===serial&&!job)label.textContent=error.message;}finally{await ready;if(active&&token===serial){port.postMessage({type:'resolution-complete'});if(job)void warmNeighbors(image);}}
  }
  const move = event => {
    if (!active || !event.isTrusted || event.composedPath().includes(host)) return;
    pointer.x = event.clientX; pointer.y = event.clientY;
    if(panel||modalActive){panelPointer();return;}
    const image = pageControl(event)?null:targetImage(pointer.x,pointer.y);
    if (image !== current) void select(image);
    else scheduleGeometry();
  };
  const mediaChanged=event=>{const video=event.target;if(!active||video?.tagName!=='VIDEO')return;if(event.type==='play'){if(current===video)void select(null);return;}if(video.paused&&findImage(pointer.x,pointer.y)===video)void select(video);};
  const viewport = () => { if (active) geometry(); };
  const wheel = event => { if (active && current && !panel && event.isTrusted && !pageControl(event) && targetImage(event.clientX,event.clientY) === current) { event.preventDefault(); event.stopImmediatePropagation(); port?.postMessage({type:'wheel',x:event.clientX,y:event.clientY,deltaY:event.deltaY,deltaMode:event.deltaMode,shiftKey:event.shiftKey}); } };
  const click = event => { if (active && current && event.isTrusted && !pageControl(event) && event.button === 0 && !event.composedPath().includes(host) && current.tagName!=='VIDEO' && event.composedPath().includes(current)) { event.preventDefault(); event.stopImmediatePropagation(); port?.postMessage({type:event.type,x:event.clientX,y:event.clientY,detail:event.detail,button:event.button}); } };
  const typing = event => event.composedPath().some(n=>['INPUT','TEXTAREA','SELECT'].includes(n?.tagName)||n?.isContentEditable);
  function focusRenderer(){if(!iframe||document.hidden)return;const element=document.activeElement;if(element?.matches?.('input,textarea,select,[contenteditable]:not([contenteditable=false])'))return;iframe.focus({preventScroll:true});}
  async function requestSettings(){if(!panel){panel=true;panelOpening=true;}await ready;if(active)port?.postMessage({type:'key',action:'settings'});}
  async function requestHelp(){await ready;if(active)port?.postMessage({type:'key',action:'help'});}
  const releaseKeys=()=>{heldAdjustments.clear();heldOriginal=null;port?.postMessage({type:'release-keys'});port?.postMessage({type:'original',value:false});};
  const key = event => {
    const physical='page:'+(event.code||event.key);
    if(event.type==='keyup'&&heldAdjustments.has(physical)){heldAdjustments.delete(physical);port?.postMessage({type:'adjust-key',phase:'up',id:physical});return;}
    if(event.type==='keyup'&&heldOriginal&&(event.code||event.key)===heldOriginal){heldOriginal=null;port?.postMessage({type:'original',value:false});return;}
    if (!active || !keyLibrary || !event.isTrusted || event.isComposing || typing(event) || pageControl(event)) return;
    const combo = keyLibrary.eventShortcut(event), map = prefs.shortcuts;
    const {action,binding} = keyLibrary.resolveShortcut(prefs,combo);
    if (event.type === 'keydown' && event.repeat && !['decrease','increase'].includes(action)) return;
    if (event.key === 'Alt' || action === 'original') { if(event.type==='keydown')heldOriginal=event.code||event.key;port?.postMessage({type:'original',value:event.type==='keydown'}); return; }
    if (event.type !== 'keydown') return;
    if(action==='decrease'||action==='increase'){event.preventDefault();event.stopImmediatePropagation();if(!event.repeat&&!heldAdjustments.has(physical)){heldAdjustments.add(physical);port?.postMessage({type:'adjust-key',phase:'down',id:physical,direction:action==='decrease'?-1:1,binding});}return;}
    if (action || event.key === 'Escape' || ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault(); event.stopImmediatePropagation();
      if (action === 'close' || event.key === 'Escape') deactivate();
      else if(action==='settings')requestSettings();else port?.postMessage({type:'key',action:action || 'geometry',key:event.key,shiftKey:event.shiftKey});
    }
  };
  const frameReady=event=>{if(active&&iframe&&event.source===iframe.contentWindow&&event.origin===new URL(iframe.src).origin&&event.data?.type==='sherloq-renderer-ready'&&event.data.token===new URL(iframe.src).hash.slice(1))connectRenderer?.();};
  function deactivate() {
    requested=false;heldAdjustments.clear();heldOriginal=null;active = false;void send({type:'loupe-state',active:false,version:++stateVersion}).catch(()=>{});serial++;warmEpoch++;neighbors=[];resolveReady?.();cancelAnimationFrame(geometryFrame);geometryFrame=0; port?.postMessage({type:'dispose'}); port?.close();port=null;connectRenderer=null; host?.remove();
    void send({type:'cancel-image',all:true}).catch(()=>{});
    current = selection = job = lastBlob = null; panel = false;panelOpening=false;modalActive=false;
    for (const [name,fn] of [['pointermove',move],['scroll',viewport],['wheel',wheel],['click',click],['dblclick',click],['keydown',key],['keyup',key]]) document.removeEventListener(name,fn,true);
    for(const event of ['play','pause','seeked'])document.removeEventListener(event,mediaChanged,true);removeEventListener('resize',viewport);removeEventListener('blur',releaseKeys);removeEventListener('message',frameReady);visualViewport?.removeEventListener('resize',viewport);visualViewport?.removeEventListener('scroll',viewport);
  }
  async function activate() {
    await modules;
    prefs = await appearanceLibrary.readSettings();if(!requested)return;
    if (document.contentType === 'application/pdf' || document.querySelector('embed[type="application/pdf"]')) { requested=false;await send({type:'pdf',url:location.href}); return; }
    active = true;void send({type:'loupe-state',active:true,version:++stateVersion}).catch(()=>{}); host = document.createElement('div'); host.id = 'sherloq-extension';
    host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;'; root = host.attachShadow({mode:'closed'});
    const style=document.createElement('link');style.rel='stylesheet';style.href=chrome.runtime.getURL('toolbar.css');styleToolbar();
    iframe = document.createElement('iframe'); const token = crypto.randomUUID(); iframe.src = chrome.runtime.getURL('renderer.html') + '?overlay=1#' + token; iframe.title = 'Loupe SHERLOQ';iframe.style.setProperty('background','transparent','important');iframe.style.setProperty('color-scheme','light dark','important');iframe.setAttribute('allowtransparency','true');iframe.style.visibility='hidden';
    const toolbar = document.createElement('nav'), title = document.createElement('strong'); title.textContent = 'SHERLOQ';title.className='brand';const icon=document.createElement('img');icon.src=chrome.runtime.getURL('icons/favicon.svg');icon.className='app-icon';icon.alt=''; label = document.createElement('output'); label.textContent = text('Survolez une image.','Move over an image.'); toolbar.append(icon,title,label);
    const button = (name,run) => { const b=document.createElement('button');b.type='button';b.textContent=name;b.onclick=run;toolbar.append(b);return b; };
    const help=button('?',requestHelp);help.className='icon-button';help.dataset.command='help';
    button(prefs.shortcuts.settings,requestSettings).dataset.command='settings';
    button('Web',()=>port?.postMessage({type:'open',destination:'web'}));
    button('Local',()=>port?.postMessage({type:'open',destination:'local'}));
    button('◐',()=>void appearanceLibrary.saveSettings({...prefs,theme:host.dataset.theme==='dark'?'light':'dark'})).className='icon-button';button(appearanceLibrary.language(prefs)==='fr'?'EN':'FR',()=>void appearanceLibrary.saveSettings({...prefs,language:appearanceLibrary.language(prefs)==='fr'?'en':'fr'})).dataset.command='language';button('↻',()=>void send({type:'restart'}));button('⚙',()=>void send({type:'options'})); button('×',deactivate);
    ready = new Promise(resolve=>resolveReady=resolve);
    connectRenderer=()=>{if(!active||port)return;const channel=new MessageChannel();port=channel.port1;port.onmessage=({data})=>{if(data.type==='modal'){modalActive=data.open;panelPointer();if(modalActive)iframe.focus();}if(data.type==='clipboard'){let ok=false,error;const previous=document.activeElement,field=document.createElement('textarea');field.value=data.text;field.style.cssText='position:fixed;left:-10000px;top:0;';document.documentElement.append(field);try{field.focus();field.select();ok=document.execCommand('copy');if(!ok)error='Copie refusée par le navigateur.';}catch(e){error=e.message;}finally{field.remove();previous?.focus?.({preventScroll:true});}port?.postMessage({type:'clipboard-result',id:data.id,ok,error});}if(data.type==='ready'){iframe.style.visibility='visible';resolveReady();geometry();focusRenderer();}if(data.type==='cache-miss'&&job?.id===data.id&&current){cache.delete(current);void select(current);}if(data.type==='blob-ready'&&data.token===serial){job=data;label.textContent=data.width+' × '+data.height+(current?.tagName==='VIDEO'?text(' · image vidéo',' · video frame'):text(' · source incorporée',' · embedded source'));geometry();}if(data.type==='panel'){const opening=data.open&&(panelOpening||!panel);panelOpening=false;panel=data.open;panelRect=data.rect;panelPointer();if(opening)iframe.focus();}if(data.type==='panel-pointer'&&panel){pointer.x=data.x;pointer.y=data.y;panelPointer();}if(data.type==='source-selecting'){serial++;void send({type:'cancel-image'}).catch(()=>{});}if(data.type==='source-chosen'&&current){serial++;job=data;cache.set(current,{signature:currentSignature,result:data,time:Date.now(),complete:true});void send({type:'cancel-image'}).catch(()=>{});geometry();}if(data.type==='close')deactivate();if(data.type==='loupe-settings')prefs={...prefs,loupe:data.loupe};if(data.type==='status')label.textContent=data.text;};port.start();iframe.contentWindow.postMessage({type:'sherloq-connect',token},new URL(iframe.src).origin,[channel.port2]);};
    addEventListener('message',frameReady);root.append(style,iframe,toolbar); document.documentElement.append(host);
    for (const [name,fn] of [['pointermove',move],['scroll',viewport],['click',click],['dblclick',click],['keydown',key],['keyup',key]]) document.addEventListener(name,fn,true);
    for(const event of ['play','pause','seeked'])document.addEventListener(event,mediaChanged,true);document.addEventListener('wheel',wheel,{capture:true,passive:false}); addEventListener('resize',viewport);addEventListener('blur',releaseKeys);visualViewport?.addEventListener('resize',viewport);visualViewport?.addEventListener('scroll',viewport);
  }
  function styleToolbar(){if(!host||!prefs)return;host.dataset.theme=prefs.theme==='auto'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):prefs.theme;host.dataset.font=prefs.font;const settings=root?.querySelector('[data-command=settings]'),lang=root?.querySelector('[data-command=language]');const help=root?.querySelector('[data-command=help]');if(help){help.title=text('Aide','Help');help.setAttribute('aria-label',help.title);}if(settings){settings.textContent=prefs.shortcuts.settings;settings.title=text('Réglages de la loupe','Magnifier settings');}if(lang){lang.textContent=appearanceLibrary.language(prefs)==='fr'?'EN':'FR';lang.className='theme-button';}}
  async function drive(){if(activating)return;activating=true;try{while(requested&&!active)await activate();}catch(error){deactivate();console.error('SHERLOQ',error);}finally{activating=false;}}
  const toggle=()=>{requested=!requested;if(!requested)deactivate();else void drive();};
  globalThis.__sherloqContent = {toggle};
  chrome.storage.onChanged.addListener(changes=>{if(changes.preferences?.newValue){prefs=appearanceLibrary?.normalizeSettings(changes.preferences.newValue);if(root)styleToolbar();}});
  chrome.runtime.onMessage.addListener((message,sender,reply)=>{
    if(message.type==='restart-shutdown'){deactivate();reply({active:false});return;}
    if(message.type==='image-progress'&&active&&message.token===serial){void show(message,serial,current,currentSignature);}
    if(message.type==='selection'){const image=[...document.images].find(i=>i.currentSrc===message.url||i.src===message.url);void(image?candidates(image):Promise.resolve(null)).then(reply);return true;}
  });
  if (!prepareOnly) toggle();
})();
