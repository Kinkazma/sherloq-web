import {appendScientificScopePreview,createScientificScopePreview} from './batch-scope-preview.js?v=0.21.0';
import {createManualScopeDraft,addManualScopeZone,updateManualScopeZone,removeManualScopeZone,restoreManualScopeZone,manualDraftScope,applyManualScopeDraft,normalizeScopeRectangle} from './batch-scope-manual.js?v=0.21.0';
import {batchPairSelection} from './batch-catalog.js?v=0.21.0';
import {bindViewerNavigation} from './viewer-input.js?v=0.21.0';

const ns='http://www.w3.org/2000/svg',clone=value=>structuredClone(value),clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const strings={fr:{title:'Zones de l’image',modify:'Modifier les zones',preview:'Aperçu annoté',select:'Sélection / déplacer',acquisition:'Ajouter une acquisition',exclusion:'Ajouter une exclusion',remove:'Supprimer la zone',undo:'Annuler le geste',redo:'Rétablir',fit:'Ajuster',original:'100 %',save:'Valider',cancel:'Annuler',close:'Fermer',coordinates:'Coordonnées facultatives',apply:'Appliquer les coordonnées',legend:'Vert : acquisition · Rouge : exclusion · Gris : non classé · Jaune : à vérifier',hint:'Souris / trackpad : mêmes gestes que SHERLOQ · Espace + glisser : déplacer la vue',editing:'Dessinez, déplacez ou redimensionnez les zones. Les pixels originaux restent inchangés.',png:'Aperçu PNG en résolution originale · Clic droit pour enregistrer l’image annotée.',loading:'Création de l’aperçu PNG annoté…',pair:'Choisissez deux acquisitions pour EfficientLoFTR.',pairCount:'acquisitions sélectionnées sur 2',unavailable:'L’aperçu PNG est indisponible',microscopy:'Microscopie',gel:'Gel / blot',photography:'Photographie',empty:'Sélectionnez une zone pour ajuster ses coordonnées.'},en:{title:'Image regions',modify:'Edit regions',preview:'Annotated preview',select:'Select / move',acquisition:'Add acquisition',exclusion:'Add exclusion',remove:'Delete region',undo:'Undo gesture',redo:'Redo',fit:'Fit',original:'100%',save:'Apply',cancel:'Cancel',close:'Close',coordinates:'Optional coordinates',apply:'Apply coordinates',legend:'Green: acquisition · Red: exclusion · Gray: unclassified · Yellow: review needed',hint:'Mouse / trackpad: SHERLOQ navigation · Space + drag: pan',editing:'Draw, move or resize regions. Original pixels remain unchanged.',png:'Full-resolution annotated PNG · Right-click to save the annotated image.',loading:'Creating annotated PNG preview…',pair:'Choose two acquisitions for EfficientLoFTR.',pairCount:'acquisitions selected out of 2',unavailable:'PNG preview is unavailable',microscopy:'Microscopy',gel:'Gel / blot',photography:'Photography',empty:'Select a region to adjust its coordinates.'}};

/** Metadata-only editor. Changes are committed exclusively by Valider/Apply;
 * onSave receives (scope, originalImage, {pairSelection}), never a copied image.
 * open({selectionPurpose:'pair',pairSelection}) enables the exact-two-ROI picker.
 * previewFactory/computeProfile are passed through to native PNG generation. */
export function createBatchScopeEditor({document=globalThis.document,image,language='fr',onSave=()=>{},onPairSelection,classifyAcquisitions=true,previewFactory=createScientificScopePreview,computeProfile='maximum',getNavigationMode=()=> 'auto',urlApi=globalThis.URL,onError=()=>{}}={}){
 if(!document||!image)throw Error('Image and document are required for the scope editor.');const t=strings[language==='en'?'en':'fr'];
 const make=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;};
 const dialog=make('dialog','batch-scope-editor'),header=make('header','batch-scope-editor-header'),title=make('h2','',t.title),name=make('p','muted',image.name??image.id??''),closeButton=make('button','',t.close);dialog.dataset.classifyAcquisitions=String(classifyAcquisitions);closeButton.type='button';closeButton.setAttribute('aria-label',t.close);header.append(title,name,closeButton);
 const toolbar=make('div','batch-scope-editor-toolbar'),button=(name,label)=>{const node=make('button','',label);node.type='button';node.dataset.scopeAction=name;toolbar.append(node);return node;};
 const modify=button('modify',t.modify),select=button('select',t.select),addAcquisition=button('acquisition',t.acquisition),addExclusion=button('exclusion',t.exclusion),undo=button('undo',t.undo),redo=button('redo',t.redo),remove=button('delete',t.remove),fitButton=button('fit',t.fit),zoomOut=button('zoom-out','−'),zoom=make('output','batch-scope-editor-zoom','100 %'),zoomIn=button('zoom-in','+'),oneToOne=button('one-to-one',t.original);toolbar.insertBefore(zoom,zoomIn);
 const acquisitionType=make('select');acquisitionType.setAttribute('aria-label',language==='en'?'Acquisition type':'Type d’acquisition');for(const [value,label]of [['microscopy',t.microscopy],['gel',t.gel],['photography',t.photography]]){const option=make('option','',label);option.value=value;acquisitionType.append(option);}toolbar.insertBefore(acquisitionType,addExclusion);
 const content=make('div','batch-scope-editor-content'),viewer=make('div','batch-scope-editor-viewport'),plane=make('div','batch-scope-editor-plane'),img=make('img','batch-scope-editor-image');img.alt=name.textContent;img.draggable=false;
 const svg=document.createElementNS(ns,'svg');svg.classList.add('batch-scope-editor-overlay');svg.setAttribute('viewBox',`0 0 ${image.width} ${image.height}`);svg.setAttribute('aria-label',t.title);
 const layer=name=>{const group=document.createElementNS(ns,'g');group.classList.add('batch-scope-editor-'+name+'-layer');svg.append(group);return group;};
 const annotationLayer=layer('annotation'),hitLayer=layer('hit'),pairLayer=layer('pair'),highlightLayer=layer('highlight'),handleLayer=layer('handle'),drawingLayer=layer('drawing');
 const hitNodes=new Map(),handleNodes=new Map();
 for(const handle of ['nw','n','ne','e','se','s','sw','w']){const node=document.createElementNS(ns,'rect');node.dataset.scopeHandle=handle;node.classList.add('batch-scope-editor-handle');node.style.pointerEvents='none';handleLayer.append(node);handleNodes.set(handle,node);}
 plane.append(img,svg);viewer.append(plane);viewer.tabIndex=0;
 const aside=make('aside','batch-scope-editor-inspector'),pairNote=make('p','batch-scope-editor-pair'),details=make('details'),summary=make('summary','',t.coordinates),coordinateHint=make('p','muted',t.empty),fields=make('div','batch-scope-editor-coordinates'),inputs={};
 for(const [key,label]of [['x','X'],['y','Y'],['width',language==='en'?'Width':'Largeur'],['height',language==='en'?'Height':'Hauteur']]){const wrap=make('label'),text=make('span','',label),input=make('input');input.type='number';input.step='1';input.min=key==='width'||key==='height'?'1':'0';input.dataset.scopeCoordinate=key;input.setAttribute('aria-label',label);wrap.append(text,input);fields.append(wrap);inputs[key]=input;}
 const applyCoordinates=make('button','',t.apply);applyCoordinates.type='button';applyCoordinates.dataset.scopeAction='coordinates';details.append(summary,coordinateHint,fields,applyCoordinates);
 const list=make('div','batch-scope-editor-zone-list');aside.append(pairNote,details,list);content.append(viewer,aside);
 const legend=make('p','batch-scope-editor-legend',t.legend),status=make('p','batch-scope-editor-status',t.hint);status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const footer=make('footer','batch-scope-editor-footer'),cancel=make('button','',t.cancel),save=make('button','primary',t.save);cancel.type=save.type='button';cancel.dataset.scopeAction='cancel';save.dataset.scopeAction='save';footer.append(cancel,save);dialog.append(header,toolbar,content,legend,status,footer);
 dialog.setAttribute('aria-label',t.title);dialog.setAttribute('aria-modal','true');
 let draft,editing=false,opened=false,disposed=false,tool='select',selected=null,hovered=null,focused=null,purpose=null,pairIds=[],past=[],future=[],gesture=null,scale=1,fitScale=1,pan={x:0,y:0},space=false,rawUrl,previewUrl,previewResult,previewController,previewQueue=Promise.resolve(),previewSequence=0,encoded=false,busy=false,focusBefore,clickCandidate=null,clickBaseline=null,coordinateSignature=null;
 plane.style.width=image.width+'px';plane.style.height=image.height+'px';svg.setAttribute('width',image.width);svg.setAttribute('height',image.height);
 const zone=()=>draft?.zones.find(z=>z.id===selected);
 const say=(text,error=false)=>{status.textContent=text;status.classList.toggle('batch-scope-editor-error',error);};
 function transform(){plane.style.transform=`translate(${pan.x}px,${pan.y}px) scale(${scale})`;zoom.textContent=Math.round(scale*100)+' %';renderOverlay();}
 function fit(){const box=viewer.getBoundingClientRect();fitScale=Math.max(.0001,Math.min((box.width||800)/image.width,(box.height||500)/image.height)*.95);scale=fitScale;pan={x:((box.width||800)-image.width*scale)/2,y:((box.height||500)-image.height*scale)/2};transform();}
 function zoomAt(factor,clientX,clientY){const box=viewer.getBoundingClientRect(),x=clientX??box.left+box.width/2,y=clientY??box.top+box.height/2,local={x:x-box.left,y:y-box.top},next=clamp(scale*factor,Math.max(.0001,fitScale/4),32);pan={x:local.x-(local.x-pan.x)*next/scale,y:local.y-(local.y-pan.y)*next/scale};scale=next;transform();}
 function point(event){const box=viewer.getBoundingClientRect();return {x:clamp((event.clientX-box.left-pan.x)/scale,0,image.width),y:clamp((event.clientY-box.top-pan.y)/scale,0,image.height)};}
 const snapshot=()=>clone(draft);
 function remember(){past.push(snapshot());if(past.length>50)past.shift();future=[];}
 function updateControls(){
  const chosen=zone();modify.textContent=editing?t.preview:t.modify;modify.setAttribute('aria-pressed',String(editing));
  for(const [node,value]of [[select,'select'],[addAcquisition,'acquisition'],[addExclusion,'exclusion']]){node.hidden=!editing;node.setAttribute('aria-pressed',String(tool===value));}
  acquisitionType.hidden=!editing||!classifyAcquisitions;undo.hidden=redo.hidden=remove.hidden=!editing;undo.disabled=!past.length;redo.disabled=!future.length;remove.disabled=!chosen;details.hidden=!editing;applyCoordinates.disabled=!chosen;
  for(const input of Object.values(inputs))input.disabled=!chosen;
  const nextCoordinateSignature=chosen?JSON.stringify([chosen.id,chosen.x0,chosen.y0,chosen.x1,chosen.y1]):null;
  // Switching focus between the four inputs is not a geometry transaction.
  // Keep unapplied values until the selected zone or its actual bounds change.
  if(chosen){if(nextCoordinateSignature!==coordinateSignature){inputs.x.value=String(chosen.x0);inputs.y.value=String(chosen.y0);inputs.width.value=String(chosen.x1-chosen.x0);inputs.height.value=String(chosen.y1-chosen.y0);}coordinateHint.textContent=(chosen.kind==='acquisition'?t.acquisition:t.exclusion)+' · '+chosen.id;}else coordinateHint.textContent=t.empty;coordinateSignature=nextCoordinateSignature;
  pairNote.hidden=purpose!=='pair';pairNote.textContent=t.pair+' '+pairIds.length+' '+t.pairCount;save.hidden=!editing&&purpose!=='pair'&&!draft?.changed;cancel.textContent=editing||purpose==='pair'?t.cancel:t.close;save.disabled=busy||purpose==='pair'&&pairIds.length!==2;
  viewer.dataset.editing=String(editing);viewer.dataset.scopeTool=tool;dialog.dataset.selectionPurpose=purpose??'scope';list.hidden=!editing&&purpose!=='pair';
  // Presentation order only: keep scientific polygon order and stable zone IDs.
  const textZone=z=>z.role==='text'||z.label==='Text',priority=z=>z.kind==='acquisition'?0:textZone(z)?2:1;
  const ordered=(draft?.zones??[]).map((z,index)=>({z,index})).sort((a,b)=>priority(a.z)-priority(b.z)||a.index-b.index).map(({z})=>z);
  const existing=new Map([...list.children].map(node=>[node.dataset.zoneId,node])),ids=new Set(ordered.map(z=>z.id));
  for(const [id,item]of existing)if(!ids.has(id))item.remove();
  const names=language==='en'?{Microscopy:t.microscopy,Blots:t.gel,'Body Imaging':t.photography,Graphs:'Chart / diagram','Flow Cytometry':'Flow cytometry',Text:'Text',Exclusion:'Excluded block','Human exclusion':'Excluded block','Human acquisition':'Acquisition'}:{Microscopy:t.microscopy,Blots:t.gel,'Body Imaging':t.photography,Graphs:'Graphique / schéma','Flow Cytometry':'Cytométrie',Text:'Texte',Exclusion:'Bloc exclu','Human exclusion':'Bloc exclu','Human acquisition':'Acquisition'};
  for(const [index,z]of ordered.entries()){
   let item=existing.get(z.id);if(!item){item=make('button','batch-scope-editor-zone-item');item.type='button';item.dataset.zoneId=z.id;
    item.addEventListener('pointerenter',()=>{hovered=z.id;highlightRows();renderOverlay();});item.addEventListener('pointerleave',()=>{if(hovered===z.id)hovered=null;highlightRows();renderOverlay();});
    item.addEventListener('focus',()=>{focused=z.id;highlightRows();renderOverlay();});item.addEventListener('blur',()=>{if(focused===z.id)focused=null;highlightRows();renderOverlay();});
    item.onclick=()=>{selected=z.id;const current=draft.zones.find(zone=>zone.id===z.id);if(purpose==='pair'&&current?.kind==='acquisition')togglePair(z.id);renderOverlay();updateControls();};
   }
   item.textContent=(z.kind==='acquisition'?'▧ ':'⊘ ')+(!classifyAcquisitions&&z.kind==='acquisition'?(language==='en'?'Acquisition':'Acquisition'):(names[z.label]??z.label??z.kind))+' · '+z.id;item.dataset.zoneKind=z.kind;item.dataset.zoneRole=z.role??'acquisition';item.dataset.zonePriority=String(priority(z));item.setAttribute('aria-pressed',String(z.id===selected));
   // Most updates move/resize the same zone. Do not replace its focused row or
   // discard hover merely to refresh optional coordinates.
   if(list.children[index]!==item)list.insertBefore(item,list.children[index]??null);
  }
  if(hovered&&!ids.has(hovered))hovered=null;if(focused&&!ids.has(focused))focused=null;highlightRows();
 }
 function highlightRows(){for(const item of list.children)item.dataset.highlighted=String(item.dataset.zoneId===hovered||item.dataset.zoneId===focused);}
 function renderOverlay(){
  annotationLayer.replaceChildren();pairLayer.replaceChildren();highlightLayer.replaceChildren();drawingLayer.replaceChildren();if(!draft)return;
  if(!encoded)appendScientificScopePreview(annotationLayer,editing||draft.changed?manualDraftScope(draft,image.preparation):image.preparation??manualDraftScope(draft),{width:image.width,height:image.height,id:'editor-'+image.id});
  // Native click/dblclick recognition requires the actual target to survive
  // pointer-down/up, preview completion, focus highlights and camera changes.
  const zoneIds=new Set(draft.zones.map(z=>z.id));for(const [id,node]of hitNodes)if(!zoneIds.has(id)){node.remove();hitNodes.delete(id);}
  for(const z of draft.zones){let p=hitNodes.get(z.id);if(!p){p=document.createElementNS(ns,'polygon');p.classList.add('batch-scope-editor-zone-hit');p.dataset.zoneId=z.id;p.setAttribute('vector-effect','non-scaling-stroke');hitLayer.append(p);hitNodes.set(z.id,p);}p.setAttribute('points',z.polygon.map(p=>p.join(',')).join(' '));p.dataset.zoneKind=z.kind;p.style.pointerEvents=editing||purpose==='pair'?'all':'none';p.classList.toggle('batch-scope-editor-selected',z.id===selected&&editing);p.classList.toggle('batch-scope-editor-pair-selected',pairIds.includes(z.id));
   const pairIndex=pairIds.indexOf(z.id);if(pairIndex>=0){p.classList.add('batch-scope-editor-pair-selected');const label=document.createElementNS(ns,'text');label.textContent=String(pairIndex+1);label.setAttribute('x',z.x0+5/scale);label.setAttribute('y',z.y0+21/scale);label.setAttribute('font-size',18/scale);label.classList.add('batch-scope-editor-pair-label');pairLayer.append(label);}
  }
  // Transient hover/focus/active emphasis is drawn last, above all panels and
  // text boxes. It changes presentation only, never the native preview PNG,
  // draft polygons, source image, scientific masks or pair selection.
  const emphasis=new Set([...(editing&&selected?[selected]:[]),...(focused?[focused]:[]),...(hovered?[hovered]:[])]);
  for(const id of emphasis){const active=draft.zones.find(z=>z.id===id);if(!active)continue;
   for(const halo of [true,false]){const mark=document.createElementNS(ns,'polygon');mark.setAttribute('points',active.polygon.map(p=>p.join(',')).join(' '));mark.setAttribute('vector-effect','non-scaling-stroke');mark.classList.add(halo?'batch-scope-editor-highlight-halo':'batch-scope-editor-highlight');mark.dataset.zoneId=id;mark.dataset.zoneKind=active.kind;mark.dataset.zoneRole=active.role??'acquisition';if(id===selected&&editing)mark.classList.add('batch-scope-editor-highlight-active');if(id===hovered||id===focused)mark.classList.add('batch-scope-editor-highlight-inspected');highlightLayer.append(mark);}
  }
  const z=zone();handleLayer.style.display=editing&&z&&tool==='select'?'':'none';
  if(editing&&z&&tool==='select')for(const [handle,x,y]of handlePoints(z)){const h=handleNodes.get(handle),size=8/scale;h.setAttribute('x',x-size/2);h.setAttribute('y',y-size/2);h.setAttribute('width',size);h.setAttribute('height',size);h.dataset.zoneId=z.id;}
  if(gesture?.kind==='draw'){const r=document.createElementNS(ns,'rect'),a=gesture.start,b=gesture.current??a;r.setAttribute('x',Math.min(a.x,b.x));r.setAttribute('y',Math.min(a.y,b.y));r.setAttribute('width',Math.abs(a.x-b.x));r.setAttribute('height',Math.abs(a.y-b.y));r.setAttribute('vector-effect','non-scaling-stroke');r.classList.add('batch-scope-editor-drawing',tool==='acquisition'?'acquisition':'exclusion');drawingLayer.append(r);}
 }
 const handlePoints=z=>[['nw',z.x0,z.y0],['n',(z.x0+z.x1)/2,z.y0],['ne',z.x1,z.y0],['e',z.x1,(z.y0+z.y1)/2],['se',z.x1,z.y1],['s',(z.x0+z.x1)/2,z.y1],['sw',z.x0,z.y1],['w',z.x0,(z.y0+z.y1)/2]];
 function handleAt(event){
  const z=zone();if(!editing||!z||tool!=='select'||space)return null;
  const box=viewer.getBoundingClientRect(),x=(event.clientX-box.left-pan.x)/scale,y=(event.clientY-box.top-pan.y)/scale,radius=4/scale;
  // On small text/panels the visible handles can overlap. Keep the centre
  // available for ordinary movement; resizing still works on and outside edges.
  if(x>z.x0+(z.x1-z.x0)/4&&x<z.x1-(z.x1-z.x0)/4&&y>z.y0+(z.y1-z.y0)/4&&y<z.y1-(z.y1-z.y0)/4)return null;
  const nearby=handlePoints(z).map(([name,hx,hy])=>({name,dx:Math.abs(x-hx),dy:Math.abs(y-hy)})).filter(h=>h.dx<=radius&&h.dy<=radius).sort((a,b)=>a.dx*a.dx+a.dy*a.dy-b.dx*b.dx-b.dy*b.dy);return nearby[0]?.name??null;
 }
 function togglePair(id){if(pairIds.includes(id))pairIds=pairIds.filter(x=>x!==id);else if(pairIds.length<2)pairIds.push(id);else say(t.pair,true);}
 async function cleanupPreview(){if(previewUrl){urlApi.revokeObjectURL(previewUrl);previewUrl=null;}const result=previewResult;previewResult=null;await result?.cleanup?.();}
 function requestPreview(){
  if(!opened||disposed)return Promise.resolve();const sequence=++previewSequence;previewController?.abort();const controller=previewController=new AbortController(),scope=editing||draft.changed?manualDraftScope(draft,image.preparation):image.preparation;
  encoded=false;img.src=rawUrl;renderOverlay();say(t.loading);
  const operation=previewQueue.catch(()=>{}).then(async()=>{
   if(controller.signal.aborted||!opened)return;
   let result;try{result=await previewFactory(image,{scope,signal:controller.signal,computeProfile});if(controller.signal.aborted||!opened||sequence!==previewSequence){await result.cleanup?.();return;}
    if(!(result.blob instanceof Blob))throw Error('Annotated preview is not a Blob.');await cleanupPreview();previewResult=result;previewUrl=urlApi.createObjectURL(result.blob);img.src=previewUrl;encoded=true;renderOverlay();say((editing?t.editing+' ':'')+t.png);
   }catch(error){if(result&&result!==previewResult)await result.cleanup?.();if(controller.signal.aborted||!opened)return;say(t.unavailable+' : '+error.message,true);onError(error);}
  });previewQueue=operation;return operation;
 }
 function changed(){pairIds=pairIds.filter(id=>draft.zones.some(z=>z.id===id&&z.kind==='acquisition'));renderOverlay();updateControls();void requestPreview();}
 function edit(action){try{remember();action();changed();}catch(error){if(past.length)draft=past.pop();say(error.message,true);updateControls();}}
 modify.onclick=()=>{editing=!editing;gesture=null;tool='select';updateControls();renderOverlay();void requestPreview();};
 for(const [node,next]of [[select,'select'],[addAcquisition,'acquisition'],[addExclusion,'exclusion']])node.onclick=()=>{tool=next;updateControls();};
 remove.onclick=()=>{if(zone())edit(()=>{removeManualScopeZone(draft,selected);selected=null;});};
 undo.onclick=()=>{if(!past.length)return;future.push(snapshot());draft=past.pop();if(!zone())selected=null;changed();};redo.onclick=()=>{if(!future.length)return;past.push(snapshot());draft=future.pop();if(!zone())selected=null;changed();};
 applyCoordinates.onclick=()=>{if(!zone())return;edit(()=>{const x=Number(inputs.x.value),y=Number(inputs.y.value),w=Number(inputs.width.value),h=Number(inputs.height.value);if(!(w>0&&h>0))throw Error('La largeur et la hauteur doivent être positives.');updateManualScopeZone(draft,selected,{x0:x,y0:y,x1:x+w,y1:y+h},{operation:'coordinates'});});};
 fitButton.onclick=fit;zoomIn.onclick=()=>zoomAt(1.25);zoomOut.onclick=()=>zoomAt(.8);oneToOne.onclick=()=>zoomAt(1/scale);
 // Use the exact wheel/trackpad/Safari/touch interpretation used by the
 // application's viewers. Editing pointers are admitted separately; a touch
 // always navigates and never creates an accidental scientific rectangle.
 const navigationListeners=[],navigationPointers=new Set();
 function navigationPointer(event){
  if(!opened||busy)return false;
  if(event.pointerType==='touch')return true;
  if(event.button!==0)return false;
  const id=event.target?.closest?.('[data-zone-id]')?.dataset.zoneId;
  return space||!editing&&!(purpose==='pair'&&id)||editing&&tool==='select'&&!id&&!handleAt(event);
 }
 const navigationEnabled=event=>opened&&!busy&&(event.type==='pointerdown'?navigationPointer(event):!gesture||gesture.kind==='pan');
 const navigationView={
  get clientHeight(){return viewer.clientHeight||viewer.getBoundingClientRect().height;},
  getBoundingClientRect:()=>viewer.getBoundingClientRect(),setPointerCapture:id=>viewer.setPointerCapture?.(id),
  addEventListener(type,listener,options){const handler=event=>{
   if(type==='pointerdown'&&event.pointerType==='touch'&&gesture)cancelInteractions();
   if(type==='pointerdown'&&event.button===0&&navigationPointer(event))navigationPointers.add(event.pointerId);
   if(['pointerup','pointercancel','lostpointercapture'].includes(type))navigationPointers.delete(event.pointerId);
   listener(event);
  };navigationListeners.push({type,handler,options});viewer.addEventListener(type,handler,options);},
 };
 bindViewerNavigation(navigationView,{enabled:navigationEnabled,getMode:()=>{const value=typeof getNavigationMode==='function'?getNavigationMode():getNavigationMode;return ['auto','mouse','trackpad'].includes(value)?value:'auto';},pointers:true,isTouchActive:()=>navigationPointers.size>1,
  panBy:(dx,dy)=>{pan={x:pan.x+dx,y:pan.y+dy};transform();},
  zoomBy:(local,factor)=>{const box=viewer.getBoundingClientRect();zoomAt(factor,box.left+local.x,box.top+local.y);},
 });
 function panOverride(value){
  const transfer=value&&gesture&&gesture.kind!=='pan'?gesture:null;
  if(transfer){gesture=null;if(transfer.before)draft=transfer.before;clickCandidate=clickBaseline=null;}
  space=value;viewer.dataset.panOverride=String(value);viewer.style.cursor=value?'grab':'';
  // Space pressed during an unfinished mouse rectangle hands that pointer to
  // the shared navigator. No half-drawn region is committed on pointer-up.
  if(transfer){const client=transfer.client;for(const listener of navigationListeners)if(listener.type==='pointerdown')listener.handler({type:'pointerdown',button:0,pointerType:'mouse',pointerId:transfer.pointerId,clientX:client.x,clientY:client.y,target:viewer,preventDefault(){}});if(opened){renderOverlay();updateControls();void requestPreview();}}
 }
 function cancelInteractions(){
  const before=gesture?.before,hadEdit=gesture&&gesture.kind!=='pan',manualPointer=gesture?.pointerId;gesture=null;if(before)draft=before;clickCandidate=clickBaseline=null;
  if(manualPointer!==undefined&&viewer.hasPointerCapture?.(manualPointer))viewer.releasePointerCapture(manualPointer);
  panOverride(false);
  // The shared binder owns its touch map. Deliver its normal cancellation
  // callbacks so a lost window focus/reopened modal cannot retain stale fingers.
  for(const pointerId of [...navigationPointers]){
   for(const listener of navigationListeners)if(listener.type==='lostpointercapture')listener.handler({type:'lostpointercapture',pointerId,preventDefault(){}});
   if(viewer.hasPointerCapture?.(pointerId))viewer.releasePointerCapture(pointerId);
  }
  navigationPointers.clear();
  for(const listener of navigationListeners)if(listener.type==='gestureend')listener.handler({type:'gestureend',preventDefault(){}});
  if(opened){renderOverlay();updateControls();if(hadEdit)void requestPreview();}
 }
 const editableTarget=target=>!!target?.closest?.('input,select,textarea,[contenteditable=true]');
 const blurred=()=>cancelInteractions(),visibility=()=>{if(document.hidden)cancelInteractions();};
 document.defaultView?.addEventListener('blur',blurred);document.addEventListener('visibilitychange',visibility);
 dialog.addEventListener('focusout',event=>{if(!dialog.contains(event.relatedTarget)||editableTarget(event.relatedTarget))cancelInteractions();});
 viewer.addEventListener('pointerdown',event=>{
  if(event.button!==0&&event.button!==1||busy||!opened)return;if(event.pointerType==='touch'||navigationPointer(event)){event.preventDefault();viewer.focus();return;}event.preventDefault();viewer.focus();const target=event.target.closest?.('[data-zone-id]'),nearHandle=handleAt(event),id=nearHandle?selected:target?.dataset.zoneId,handle=target?.dataset.scopeHandle??nearHandle,p=point(event),interaction={draft:snapshot(),past:past.slice(),future:future.slice(),selected,pairIds:pairIds.slice()};
  if(editing&&tool!=='select'&&!space&&event.button===0){gesture={kind:'draw',pointerId:event.pointerId,start:p,current:p,client:{x:event.clientX,y:event.clientY},before:interaction.draft,interaction};selected=null;encoded=false;img.src=rawUrl;}
  else if(editing&&id&&!space&&event.button===0){selected=id;gesture={kind:handle?'resize':'move',pointerId:event.pointerId,handle,start:p,client:{x:event.clientX,y:event.clientY},initial:clone(zone()),before:interaction.draft,interaction,moved:false};}
  else if(purpose==='pair'&&id&&!space&&event.button===0){selected=id;const current=draft.zones.find(z=>z.id===id);if(current.kind==='acquisition')togglePair(id);gesture=null;clickCandidate=interaction;updateControls();renderOverlay();return;}
  else gesture={kind:'pan',pointerId:event.pointerId,x:event.clientX,y:event.clientY,pan:{...pan}};
  viewer.setPointerCapture?.(event.pointerId);updateControls();renderOverlay();
 });
 viewer.addEventListener('pointermove',event=>{
  if(!gesture){if(!space&&event.pointerType!=='touch'){const handle=handleAt(event);viewer.style.cursor=handle?handle+'-resize':'';}return;}if(gesture.pointerId!==undefined&&gesture.pointerId!==event.pointerId)return;gesture.client={x:event.clientX,y:event.clientY};const p=point(event);if(gesture.kind==='pan'){pan={x:gesture.pan.x+event.clientX-gesture.x,y:gesture.pan.y+event.clientY-gesture.y};transform();return;}
  if(gesture.kind==='draw'){gesture.current=p;renderOverlay();return;}
  const z=gesture.initial,dx=p.x-gesture.start.x,dy=p.y-gesture.start.y;if(Math.hypot(dx,dy)<.5&&!gesture.moved)return;gesture.moved=true;encoded=false;img.src=rawUrl;
  let rectangle;if(gesture.kind==='move'){const ox=clamp(Math.round(dx),-z.x0,image.width-z.x1),oy=clamp(Math.round(dy),-z.y0,image.height-z.y1);rectangle={x0:z.x0+ox,y0:z.y0+oy,x1:z.x1+ox,y1:z.y1+oy};}
  else{rectangle={x0:z.x0,y0:z.y0,x1:z.x1,y1:z.y1};if(gesture.handle.includes('w'))rectangle.x0=p.x;if(gesture.handle.includes('e'))rectangle.x1=p.x;if(gesture.handle.includes('n'))rectangle.y0=p.y;if(gesture.handle.includes('s'))rectangle.y1=p.y;}
  try{draft=clone(gesture.before);updateManualScopeZone(draft,z.id,rectangle,{operation:gesture.kind});renderOverlay();updateControls();}catch{}
 });
 function finishGesture(event,cancelled=false){
  if(!gesture||gesture.pointerId!==undefined&&gesture.pointerId!==event.pointerId)return;const current=gesture;gesture=null;viewer.releasePointerCapture?.(event.pointerId);
  if(cancelled){if(current.before)draft=current.before;clickCandidate=clickBaseline=null;renderOverlay();updateControls();void requestPreview();return;}
  if(current.kind==='draw'){const end=current.current??current.start;if(Math.abs(end.x-current.start.x)>=1&&Math.abs(end.y-current.start.y)>=1)edit(()=>{selected=addManualScopeZone(draft,tool,{x0:current.start.x,y0:current.start.y,x1:end.x,y1:end.y},{type:classifyAcquisitions?acquisitionType.value:'acquisition'}).id;});else{renderOverlay();void requestPreview();}}
  else if(current.before&&current.moved){past.push(current.before);if(past.length>50)past.shift();future=[];changed();}
  else if(purpose==='pair'&&current.initial?.kind==='acquisition'){togglePair(current.initial.id);updateControls();renderOverlay();}
  clickCandidate=current.interaction??null;
 }
 viewer.addEventListener('pointerup',event=>finishGesture(event));viewer.addEventListener('pointercancel',event=>finishGesture(event,true));viewer.addEventListener('lostpointercapture',event=>finishGesture(event,true));
 viewer.addEventListener('click',event=>{if(event.button!==0)return;if(event.detail===1)clickBaseline=clickCandidate;else if(event.detail>=2&&!clickBaseline)clickBaseline=clickCandidate;clickCandidate=null;});
 function zoneAt(event){
  const target=event.target.closest?.('[data-zone-id]'),direct=draft.zones.find(z=>z.id===target?.dataset.zoneId);if(direct)return direct;
  const p=point(event),contains=polygon=>{let inside=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const [ax,ay]=polygon[j],[bx,by]=polygon[i],cross=(p.x-ax)*(by-ay)-(p.y-ay)*(bx-ax);if(Math.abs(cross)<1e-7&&p.x>=Math.min(ax,bx)&&p.x<=Math.max(ax,bx)&&p.y>=Math.min(ay,by)&&p.y<=Math.max(ay,by))return true;if((ay>p.y)!==(by>p.y)&&p.x<(bx-ax)*(p.y-ay)/(by-ay)+ax)inside=!inside;}return inside;};
  return draft.zones.filter(z=>contains(z.polygon)).sort((a,b)=>(a.kind==='exclusion'?0:1)-(b.kind==='exclusion'?0:1)||(a.x1-a.x0)*(a.y1-a.y0)-(b.x1-b.x0)*(b.y1-b.y0))[0];
 }
 viewer.addEventListener('dblclick',event=>{
  if(!opened||busy||event.button!==0)return;event.preventDefault();const baseline=clickBaseline;cancelInteractions();
  // Pointer-up occurs before dblclick. Restore the browser's first-click
  // transaction so a double click cannot leave tiny new zones, moved boxes or
  // a reordered EfficientLoFTR pair. The selected editing tool is unchanged.
  if(baseline){draft=baseline.draft;past=baseline.past;future=baseline.future;selected=baseline.selected;pairIds=baseline.pairIds;}
  const hit=zoneAt(event);if(hit){selected=hit.id;const original=hit.originalGeometry,changedGeometry=original&&(['x0','y0','x1','y1'].some(key=>hit[key]!==original[key])||JSON.stringify(hit.polygon)!==JSON.stringify(original.polygon));if(changedGeometry){editing=true;tool='select';edit(()=>restoreManualScopeZone(draft,hit.id));}else{renderOverlay();updateControls();if(baseline)void requestPreview();}}
  else{fit();updateControls();if(baseline)void requestPreview();}
 });
 // Once a gesture ends the image element contains the encoded native PNG.
 // While it is being replaced, avoid saving a stale/original image as annotated.
 img.addEventListener('contextmenu',event=>{if(!encoded){event.preventDefault();say(t.loading);}});
 dialog.addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();void close();return;}if(editableTarget(event.target))return;
  if(event.code==='Space'){panOverride(true);event.preventDefault();return;}if(!editing)return;
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();(event.shiftKey?redo:undo).click();}
  if((event.key==='Delete'||event.key==='Backspace')&&zone()){event.preventDefault();remove.click();}
 });dialog.addEventListener('keyup',event=>{if(event.code==='Space'){panOverride(false);event.preventDefault();}});dialog.addEventListener('cancel',event=>{event.preventDefault();void close();});
 closeButton.onclick=cancel.onclick=()=>close();
 save.onclick=async()=>{
  if(busy)return;busy=true;updateControls();try{
   const scope=await applyManualScopeDraft(image,draft);let pairSelection;
   if(purpose==='pair'){if(pairIds.length!==2)throw Error(t.pair);const rectangles=pairIds.map(id=>normalizeScopeRectangle(draft.zones.find(z=>z.id===id),draft));pairSelection=batchPairSelection({...image,preparation:scope},rectangles,'manual');}
   await onSave(scope,image,{...(pairSelection?{pairSelection}:{})});if(pairSelection)await onPairSelection?.(pairSelection,image,scope);await close();
  }catch(error){say(error.message,true);onError(error);}finally{busy=false;if(opened)updateControls();}
 };
 async function close(){if(!opened)return;opened=false;editing=false;cancelInteractions();previewSequence++;previewController?.abort();if(typeof dialog.close==='function')dialog.close();else dialog.removeAttribute('open');dialog.remove();await previewQueue.catch(()=>{});await cleanupPreview();if(rawUrl){urlApi.revokeObjectURL(rawUrl);rawUrl=null;}focusBefore?.focus?.();}
 async function open(options={}){
  if(disposed)throw Error('Scope editor disposed.');if(opened)await close();draft=createManualScopeDraft(image);editing=options.editing===true;tool=['select','acquisition','exclusion'].includes(options.tool)?options.tool:'select';selected=hovered=focused=null;purpose=options.selectionPurpose==='pair'?'pair':null;pairIds=[];past=[];future=[];gesture=null;coordinateSignature=null;panOverride(false);encoded=false;busy=false;focusBefore=document.activeElement;
  if(options.zoneId!==undefined){if(!draft.zones.some(z=>z.id===options.zoneId))throw Error('The requested region is not present in this image.');selected=focused=options.zoneId;}
  const previous=options.pairSelection??image.pairSelection;if(purpose==='pair'&&previous?.pixelHash===image.hash&&previous.width===image.width&&previous.height===image.height)for(const r of previous.regions??[]){let z=draft.zones.find(z=>z.kind==='acquisition'&&['x0','y0','x1','y1'].every(k=>Math.floor(z[k])===r[k]||Math.ceil(z[k])===r[k]));if(!z){z=addManualScopeZone(draft,'acquisition',r);draft.changed=false;draft.actions=[];}if(!pairIds.includes(z.id))pairIds.push(z.id);}
  rawUrl=urlApi.createObjectURL(image.blob);img.src=rawUrl;document.body.append(dialog);opened=true;if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');updateControls();fit();const focusedRow=selected?[...list.children].find(row=>row.dataset.zoneId===selected):null;(focusedRow??viewer).focus();await requestPreview();return dialog;
 }
 return {dialog,open,close,async dispose(){disposed=true;await close();for(const {type,handler,options}of navigationListeners)viewer.removeEventListener(type,handler,options);document.defaultView?.removeEventListener('blur',blurred);document.removeEventListener('visibilitychange',visibility);},get editing(){return editing;},get draft(){return draft?clone(draft):null;}};
}
