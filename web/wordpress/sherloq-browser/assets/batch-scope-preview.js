import {rectangleComplement,rectanglePolygon,scientificScopeEnvelope} from './batch-scope-geometry.js';

// The preview uses the exact exclusion polygons consumed by the analysis.
// Only their presentation differs: unclassified margins have no red outline.
export function appendScientificScopePreview(svg,scope,{width,height,id}){
 const document=svg.ownerDocument,ns='http://www.w3.org/2000/svg';
 const polygon=(parent,points,className,fill)=>{
  if(!Array.isArray(points)||points.length<3||!points.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)))return;
  const node=document.createElementNS(ns,'polygon');node.setAttribute('points',points.map(p=>p.join(',')).join(' '));
  if(className)node.setAttribute('class',className);if(fill)node.setAttribute('fill',fill);node.setAttribute('vector-effect','non-scaling-stroke');parent.append(node);return node;
 };
 const regions=(scope.regions??[]).map(r=>r.polygon??rectanglePolygon(r)),key=JSON.stringify;
 const complement=new Set(rectangleComplement(scope.regions??[],width,height).map(key));
 const known=new Set([...(scope.text?.polygons??[]),...(scope.pdfText?.polygons??[]),...(scope.manual?.zones??[]).filter(z=>z.kind==='exclusion').map(z=>z.polygon),...(scope.panels?.panels??[]).filter(p=>p.policyHint==='non-acquisition'||['Graphs','Flow Cytometry'].includes(p.label)).map(p=>rectanglePolygon({x0:p.rectangle[0],y0:p.rectangle[1],x1:p.rectangle[2],y1:p.rectangle[3]}))].map(key));
 const excluded=scope.excluded??[],remainder=excluded.filter(p=>complement.has(key(p))&&!known.has(key(p))),negative=excluded.filter(p=>!remainder.includes(p));
 const maskId='batch-admitted-'+String(id).replace(/[^a-zA-Z0-9_-]/g,'_'),defs=document.createElementNS(ns,'defs'),mask=document.createElementNS(ns,'mask');
 mask.id=maskId;mask.setAttribute('maskUnits','userSpaceOnUse');mask.setAttribute('x','0');mask.setAttribute('y','0');mask.setAttribute('width',width);mask.setAttribute('height',height);mask.setAttribute('mask-type','luminance');
 polygon(mask,rectanglePolygon({x0:0,y0:0,x1:width,y1:height}),null,'white');for(const p of excluded)polygon(mask,p,null,'black');defs.append(mask);svg.append(defs);
 for(const p of remainder)polygon(svg,p,'batch-scope-remainder-zone');
 const acquisition=document.createElementNS(ns,'g');acquisition.setAttribute('mask','url(#'+maskId+')');svg.append(acquisition);
 for(const p of regions)polygon(acquisition,p,scope.status==='ready'?'batch-acquisition-zone':'batch-pending-acquisition-zone');
 for(const p of negative)polygon(svg,p,scope.status==='ready'?'batch-exclusion-zone':'batch-pending-exclusion-zone');
 if(scope.annotations?.policy?.outsideAcquisitionsOnly&&scope.annotations.policy.changesAdmission===false)for(const p of scope.annotations.polygons??[])polygon(svg,p,'batch-exclusion-zone batch-annotation-zone');
 // Draw only the acquisition boundary last. Its fill remains masked above,
 // so genuine text exclusions inside a panel can never turn green.
 for(const p of regions)polygon(svg,p,scope.status==='ready'?'batch-acquisition-outline':'batch-pending-acquisition-outline');
 return {remainder:remainder.length,excluded:negative.length,acquisitions:regions.length};
}

export const SCIENTIFIC_SCOPE_PREVIEW_PALETTE=Object.freeze({
 acquisition:Object.freeze({rgb:Object.freeze([46,170,114]),opacity:38/255}),
 exclusion:Object.freeze({rgb:Object.freeze([228,104,91]),opacity:38/255}),
 remainder:Object.freeze({rgb:Object.freeze([133,133,141]),opacity:22/255}),
 pending:Object.freeze({rgb:Object.freeze([218,180,97]),opacity:38/255}),
});
const previewInvalid=message=>Object.assign(Error(message),{code:'BATCH_SCOPE_PREVIEW_INVALID'});
function previewLayers(scope,width,height){
 const regions=(scope?.regions??[]).map(r=>r.polygon??rectanglePolygon(r)),key=JSON.stringify,complement=new Set(rectangleComplement(scope?.regions??[],width,height).map(key));
 const known=new Set([...(scope?.text?.polygons??[]),...(scope?.pdfText?.polygons??[]),...(scope?.manual?.zones??[]).filter(z=>z.kind==='exclusion').map(z=>z.polygon),...(scope?.panels?.panels??[]).filter(p=>p.policyHint==='non-acquisition'||['Graphs','Flow Cytometry'].includes(p.label)).map(p=>rectanglePolygon({x0:p.rectangle[0],y0:p.rectangle[1],x1:p.rectangle[2],y1:p.rectangle[3]}))].map(key));
 const excluded=scope?.excluded??rectangleComplement([],width,height),remainder=excluded.filter(p=>complement.has(key(p))&&!known.has(key(p))),negative=excluded.filter(p=>!remainder.includes(p));
 const annotations=scope?.annotations?.policy?.outsideAcquisitionsOnly&&scope.annotations.policy.changesAdmission===false?scope.annotations.polygons??[]:[];
 for(const polygon of [...regions,...excluded,...annotations])if(!Array.isArray(polygon)||polygon.length<3||!polygon.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)))throw previewInvalid('Un polygone de préparation est invalide.');
 return {regions,remainder,negative,annotations,ready:scope?.status==='ready'};
}
// Rasterization is restricted to one requested native row window. It copies
// borrowed RGB bytes, then paints presentation only; no full-size mask/cache.
function spans(polygon,y,left,right){
 const crossings=[];for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
  const a=polygon[j],b=polygon[i];if((a[1]>y)!==(b[1]>y))crossings.push(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]));
 }
 crossings.sort((a,b)=>a-b);const out=[];for(let i=0;i+1<crossings.length;i+=2){const x0=Math.max(left,Math.ceil(crossings[i]-.5)),x1=Math.min(right,Math.ceil(crossings[i+1]-.5));if(x1>x0)out.push([x0,x1]);}return out;
}
function blendAt(data,offset,rgb,opacity){for(let c=0;c<3;c++)data[offset+c]=Math.round(data[offset+c]*(1-opacity)+rgb[c]*opacity);}
function fillPolygons(data,polygons,rect,color){
 for(const polygon of polygons){const minY=Math.max(rect.y,Math.floor(Math.min(...polygon.map(p=>p[1])))),maxY=Math.min(rect.y+rect.height,Math.ceil(Math.max(...polygon.map(p=>p[1]))));
  for(let y=minY;y<maxY;y++)for(const [left,right]of spans(polygon,y+.5,rect.x,rect.x+rect.width))for(let x=left;x<right;x++)blendAt(data,((y-rect.y)*rect.width+x-rect.x)*3,color.rgb,color.opacity);
 }
}
function outlines(data,polygons,rect,color,lineWidth){
 // Scanline distance to line segments, bounded by each edge's bounding box.
 // Horizontal/vertical/rotated edges receive the same native-width stroke.
 const radius=lineWidth/2;
 for(const polygon of polygons)for(let i=0;i<polygon.length;i++){
  const [ax,ay]=polygon[i],[bx,by]=polygon[(i+1)%polygon.length],dx=bx-ax,dy=by-ay,length=dx*dx+dy*dy;
  const y0=Math.max(rect.y,Math.floor(Math.min(ay,by)-radius)),y1=Math.min(rect.y+rect.height,Math.ceil(Math.max(ay,by)+radius));
  for(let y=y0;y<y1;y++){
   const py=y+.5;let left=Math.min(ax,bx)-radius,right=Math.max(ax,bx)+radius;
   if(Math.abs(dy)>radius*2){const t=(py-ay)/dy,cx=ax+Math.max(0,Math.min(1,t))*dx,extent=radius*Math.sqrt(1+dx*dx/(dy*dy));left=Math.max(left,cx-extent);right=Math.min(right,cx+extent);}
   const x0=Math.max(rect.x,Math.floor(left)),x1=Math.min(rect.x+rect.width,Math.ceil(right));
   for(let x=x0;x<x1;x++){const px=x+.5,t=length?Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/length)):0;if((px-ax-t*dx)**2+(py-ay-t*dy)**2<=radius*radius)blendAt(data,((y-rect.y)*rect.width+x-rect.x)*3,color.rgb,1);}
  }
 }
}
export function paintScientificScopeRows(pixels,scope,{rect,width,height,palette=SCIENTIFIC_SCOPE_PREVIEW_PALETTE,lineWidth=1.25}={}){
 if(!rect||![rect.x,rect.y,rect.width,rect.height,width,height].every(Number.isSafeInteger)||rect.x<0||rect.y<0||rect.width<1||rect.height<1||rect.x+rect.width>width||rect.y+rect.height>height||!(pixels?.data instanceof Uint8Array)||pixels.width!==rect.width||pixels.height!==rect.height||pixels.data.length!==rect.width*rect.height*3||!(lineWidth>0&&lineWidth<=16))throw previewInvalid('La fenêtre native de l’aperçu est invalide.');
 for(const color of Object.values(palette))if(!Array.isArray(color.rgb)||color.rgb.length!==3||!color.rgb.every(v=>Number.isInteger(v)&&v>=0&&v<=255)||!(color.opacity>=0&&color.opacity<=1))throw previewInvalid('La palette de préparation est invalide.');
 const layers=previewLayers(scope,width,height),data=pixels.data.slice(),positive=layers.ready?palette.acquisition:palette.pending,negative=layers.ready?palette.exclusion:palette.pending;
 fillPolygons(data,layers.remainder,rect,palette.remainder);fillPolygons(data,layers.regions,rect,positive);
 // Exclusions overwrite green presentation using the original pixel as base,
 // exactly as the SVG's admitted-region mask, rather than mixing both fills.
 for(const polygon of [...layers.negative,...layers.remainder])for(let y=rect.y;y<rect.y+rect.height;y++)for(const [left,right]of spans(polygon,y+.5,rect.x,rect.x+rect.width))for(let x=left;x<right;x++){const offset=((y-rect.y)*rect.width+x-rect.x)*3;data.set(pixels.data.subarray(offset,offset+3),offset);}
 fillPolygons(data,layers.remainder,rect,palette.remainder);fillPolygons(data,layers.negative,rect,negative);fillPolygons(data,layers.annotations,rect,palette.exclusion);
 outlines(data,layers.negative,rect,negative,lineWidth);outlines(data,layers.annotations,rect,palette.exclusion,lineWidth);outlines(data,layers.regions,rect,positive,lineWidth);
 return {width:rect.width,height:rect.height,format:'rgb8',data};
}

// The same preview producer is used by the modal and the visible batch cards.
// This small parent ledger keeps a rejected retirement reachable for the next
// explicit replacement/close attempt. A fulfilled cleanup has a void contract.
export function createScientificScopePreviewRetirement(){
 const owners=new Map();
 const key=value=>typeof value==='function'?value:value?.cleanup;
 function own(value){const cleanup=key(value);if(typeof cleanup!=='function')throw TypeError('A scope preview cleanup owner is required.');if(!owners.has(cleanup))owners.set(cleanup,{cleanup,owner:value,retiring:false,task:null,failed:false,failure:undefined});return cleanup;}
 function mark(value){const cleanup=own(value);owners.get(cleanup).retiring=true;return cleanup;}
 function release(value){const cleanup=mark(value),entry=owners.get(cleanup);if(entry.task)return entry.task;entry.failed=false;const task=Promise.resolve().then(()=>entry.cleanup.call(entry.owner)).then(()=>{owners.delete(cleanup);});entry.task=task;task.then(()=>{},error=>{if(entry.task===task){entry.task=null;entry.failed=true;entry.failure=error;}});return task;}
 async function drain({all=false,keep,retry=true}={}){const retained=key(keep);let failed=false,primary;for(const [cleanup,entry]of [...owners])if(cleanup!==retained&&(all||entry.retiring)){try{if(!retry&&entry.failed)throw entry.failure;await release(cleanup);}catch(error){if(!failed){failed=true;primary=error;}}}if(failed)throw primary;}
 return {own,mark,release,drain,get pending(){return owners.size;}};
}

/** Encode the same full-resolution native PNG. Its borrowed file keeps the
 * decoding client alive until raster cleanup acknowledges all export leases.
 * onOwner is synchronous, before imports/creation, so a failed construction
 * remains owned even when its primary rejection is 0, false or frozen. */
export async function createScientificScopePreview(image,{scope=image.preparation,signal,computeProfile='maximum',clientFactory,rasterFactory,palette=SCIENTIFIC_SCOPE_PREVIEW_PALETTE,onProgress=()=>{},onOwner}={}){
 const width=image?.width,height=image?.height;if(!Number.isSafeInteger(width)||width<1||!Number.isSafeInteger(height)||height<1||!(image.blob instanceof Blob))throw previewInvalid('L’image originale de l’aperçu est absente.');signal?.throwIfAborted();
 if(scope&&(scope.width!==width||scope.height!==height))throw previewInvalid('Les coordonnées de préparation ne correspondent pas à l’image originale.');
 let client,result,rasterOwner,completed=false,finish,task,closed=false,rasterClosed=false,clientClosed=false,cleanupFailed=false,cleanupFailure;
 const ended=new Promise(resolve=>finish=()=>{if(!completed){completed=true;resolve();}}),cancel=()=>client?.cancel?.();
 const cleanup=()=>{if(closed)return Promise.resolve();if(task)return task;cleanupFailed=false;const attempt=(async()=>{await ended;if(!rasterClosed){if(result?.cleanup)await result.cleanup();else await rasterOwner?.abort?.();rasterClosed=true;result=null;rasterOwner=null;}if(!clientClosed){await client?.dispose();clientClosed=true;client=null;}closed=true;cleanupFailure=undefined;})();task=attempt;attempt.then(()=>{task=null;},error=>{task=null;cleanupFailed=true;cleanupFailure=error;});return attempt;};
 const owner={cleanup,get closed(){return closed;},get cleanupFailed(){return cleanupFailed;},get cleanupFailure(){return cleanupFailure;}};
 try{
  onOwner?.(owner);
  clientFactory??=(await import('./tool-client.js')).createToolClient;rasterFactory??=(await import('./raster-export-client.js')).exportPresentationRaster;
  client=await clientFactory({computeProfile:typeof computeProfile==='function'?computeProfile():computeProfile});signal?.addEventListener('abort',cancel,{once:true});signal?.throwIfAborted();
  const source=await client.load({id:'scope-preview-'+crypto.randomUUID(),blob:image.blob});signal?.throwIfAborted();
  if(source.surface?.width!==width||source.surface?.height!==height||source.surface?.format!=='rgb8')throw previewInvalid('La source native décodée ne correspond pas à cet aperçu.');
  const identities=[source.sha256,image.sourceSha256,scope?.sourceSha256].filter(v=>v!==undefined&&v!==null);if(!identities.length||identities.some(v=>typeof v!=='string'||!/^[a-f0-9]{64}$/.test(v)||v!==identities[0]))throw previewInvalid('L’identité de préparation diffère de la source originale.');
  const surface={width,height,format:'rgb8',async readPixels(rect){signal?.throwIfAborted();const original=await client.readWindow(source.surface,rect);signal?.throwIfAborted();return paintScientificScopeRows(original,scope,{rect,width,height,palette});}};
  result=await rasterFactory(surface,{format:'png',compression:6},{signal,onProgress,reserve:bytes=>client.reserveExport(bytes,source.surface),onOwner:value=>{rasterOwner=value;}});signal?.throwIfAborted();
  if(!(result?.blob instanceof Blob)||result.blob.size<1)throw previewInvalid('Le PNG annoté n’a pas été créé.');
  return {blob:result.blob.type==='image/png'?result.blob:result.blob.slice(0,result.blob.size,'image/png'),width,height,metadata:{schema:'sherloq.scientific-scope-preview/1',sourceSha256:identities[0],scopeFingerprint:scope?.fingerprint??null,coordinates:'original-pixels',width,height,presentationOnly:true,annotationsEncoded:true,sourcePixels:'immutable',fullResolution:true,palette:structuredClone(palette)},cleanup};
 }catch(error){finish();try{await cleanup();}catch{}throw error;}
 finally{finish();signal?.removeEventListener('abort',cancel);}
}

/** A lightweight vector frame remains live even while a native PNG annotation
 * is displayed. Pointer events stay on the actual acquisition/exclusion zones. */
export function appendScientificScopeEnvelope(svg,scope,{width=scope?.width,height=scope?.height,envelope=scientificScopeEnvelope(scope,{width,height}),language='fr'}={}){
 if(!envelope)return null;const document=svg.ownerDocument,node=document.createElementNS('http://www.w3.org/2000/svg','polygon');
 node.setAttribute('points',envelope.polygon.map(point=>point.join(',')).join(' '));node.setAttribute('data-scope-envelope',[envelope.x0,envelope.y0,envelope.x1,envelope.y1].join(','));
 node.setAttribute('class','batch-scope-envelope');node.setAttribute('vector-effect','non-scaling-stroke');node.setAttribute('fill','none');node.setAttribute('stroke','var(--accent, #328cff)');node.setAttribute('stroke-width','1.5');node.setAttribute('stroke-dasharray','6 4');node.style.pointerEvents='none';
 const title=document.createElementNS('http://www.w3.org/2000/svg','title');title.textContent=language==='en'?'Derived frame of active pixels':'Cadre englobant des pixels actifs';node.append(title);svg.append(node);return node;
}
